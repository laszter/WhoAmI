// Game engine: phase transition + timer (server-authoritative) + vote resolution
// ไม่ import socket.io — สื่อสารออกผ่าน EngineHooks เท่านั้น (handlers.ts เป็นคนต่อเข้ากับ io)
// กฎ: ทุก transition ต้อง clearTimer ก่อนตั้งใหม่ และ callback ของ timer ต้องเช็ก phase/round ที่คาดไว้
import { randomInt } from 'node:crypto';
import { LIMITS, type Ack, type Phase, type PrivateCard, type Winner } from '../shared/types';
import { LOCATIONS, LOCATION_NAMES } from '../shared/locations';
import type { Room, Round } from './types';

export interface EngineHooks {
  broadcast(room: Room): void;  // ส่ง room:state (PublicRoomState) ให้ทั้งห้อง
  sendCards(room: Room): void;  // ส่ง game:you ให้แต่ละคนแบบ private
  onResult(room: Room): void;   // เข้า phase result แล้ว (ส่ง Service Message แบบ fire-and-forget)
}

/** ปัดเป็นวินาทีเต็มแล้ว clamp ให้อยู่ใน [MIN_SEC, max]; ค่าที่ไม่ใช่ตัวเลข → fallback */
export function clampSec(value: unknown, max: number, fallback: number): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(LIMITS.MIN_SEC, Math.round(n)));
}

export function clearTimer(room: Room): void {
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = undefined;
  }
}

/** ตั้ง timer ของ phase ปัจจุบัน — ยิงเฉพาะเมื่อ phase และ round ยังเป็นตัวเดิม (กัน timer เก่ายิงหลัง reset/เริ่มรอบใหม่) */
function setPhaseTimer(room: Room, ms: number, expected: Phase, fire: () => void): void {
  clearTimer(room);
  const round = room.round;
  const handle = setTimeout(() => {
    if (room.timer === handle) room.timer = undefined;
    if (room.phase !== expected || room.round !== round) return;
    try {
      fire();
    } catch (err) {
      // อยู่นอก socket handler → ถ้าไม่ catch จะทำให้ process ล่ม
      console.error(`[game] timer error (room ${room.code}, phase ${expected})`, err);
    }
  }, Math.max(0, ms));
  room.timer = handle;
}

function shuffle<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function startRound(room: Room, opts: { discussionSec?: number; voteSec?: number }, hooks: EngineHooks): Ack {
  if (room.phase !== 'lobby' && room.phase !== 'result') return { ok: false, error: 'เกมกำลังเล่นอยู่' };
  const playerIds = [...room.players.keys()]; // นับทุกคนในห้อง (รวมคนที่ offline)
  if (playerIds.length < LIMITS.MIN_PLAYERS) {
    return { ok: false, error: `ต้องมีผู้เล่นอย่างน้อย ${LIMITS.MIN_PLAYERS} คน` };
  }

  room.settings = {
    discussionSec: clampSec(opts.discussionSec, LIMITS.MAX_DISCUSSION_SEC, room.settings.discussionSec),
    voteSec: clampSec(opts.voteSec, LIMITS.MAX_VOTE_SEC, room.settings.voteSec),
  };

  const location = LOCATIONS[randomInt(LOCATIONS.length)];
  const spyId = playerIds[randomInt(playerIds.length)];
  const roleDeck = shuffle(location.roles);
  const roles = new Map<string, string>();
  playerIds
    .filter((id) => id !== spyId)
    .forEach((id, i) => roles.set(id, roleDeck[i % roleDeck.length])); // บทบาทไม่พอ → วนซ้ำ

  clearTimer(room);
  const round: Round = {
    location: location.name,
    spyId,
    roles,
    endsAt: Date.now() + room.settings.discussionSec * 1000,
    votes: new Map(),
  };
  room.round = round;
  room.phase = 'discussion';
  setPhaseTimer(room, room.settings.discussionSec * 1000, 'discussion', () => {
    openVote(room, hooks);
  });

  hooks.broadcast(room);
  hooks.sendCards(room);
  return { ok: true };
}

export function openVote(room: Room, hooks: EngineHooks): Ack {
  const round = room.round;
  if (room.phase !== 'discussion' || !round) return { ok: false, error: 'ยังไม่อยู่ในช่วงพูดคุย' };

  clearTimer(room);
  room.phase = 'voting';
  round.endsAt = Date.now() + room.settings.voteSec * 1000;
  setPhaseTimer(room, room.settings.voteSec * 1000, 'voting', () => {
    finishVoting(room, hooks);
  });

  hooks.broadcast(room);
  return { ok: true };
}

/** ผู้เล่นที่ online ทุกคนโหวตแล้ว (ต้องมี online อย่างน้อย 1 คน) */
function allOnlineVoted(room: Room, round: Round): boolean {
  const online = [...room.players.values()].filter((p) => p.socketId !== null);
  return online.length > 0 && online.every((p) => round.votes.has(p.userId));
}

export function castVote(room: Room, voterId: string, targetId: string, hooks: EngineHooks): Ack {
  const round = room.round;
  if (room.phase !== 'voting' || !round) return { ok: false, error: 'ยังไม่ถึงช่วงโหวต' };
  if (!room.players.has(voterId)) return { ok: false, error: 'คุณไม่ได้อยู่ในห้องนี้' };
  if (typeof targetId !== 'string' || !room.players.has(targetId)) return { ok: false, error: 'ไม่พบผู้เล่นที่เลือก' };
  if (targetId === voterId) return { ok: false, error: 'ห้ามโหวตตัวเอง' };
  if (round.votes.has(voterId)) return { ok: false, error: 'โหวตแล้ว' };

  round.votes.set(voterId, targetId);
  if (allOnlineVoted(room, round)) {
    finishVoting(room, hooks); // จบก่อนเวลา (broadcast อยู่ใน finishVoting)
  } else {
    hooks.broadcast(room);
  }
  return { ok: true };
}

/**
 * โหวตจบ (ครบหรือหมดเวลา): จับ spy ได้ → phase spyGuess (spy ทายสถานที่ได้ 1 ครั้งใน SPY_GUESS_SEC)
 * ไม่งั้น (เสมอ/ไม่มีใครโหวต/จับผิดคน) → result ทันที (spy ชนะ)
 */
export function finishVoting(room: Room, hooks: EngineHooks): void {
  const round = room.round;
  if (room.phase !== 'voting' || !round) return;

  clearTimer(room);
  const { accusedId, winner } = resolveVotes(round.votes, round.spyId);
  round.accusedId = accusedId;

  if (accusedId !== null && accusedId === round.spyId) {
    room.phase = 'spyGuess';
    round.endsAt = Date.now() + LIMITS.SPY_GUESS_SEC * 1000;
    setPhaseTimer(room, LIMITS.SPY_GUESS_SEC * 1000, 'spyGuess', () => {
      resolveSpyGuess(room, null, hooks); // หมดเวลาไม่ทาย → citizens ชนะ
    });
    hooks.broadcast(room);
    return;
  }

  round.result = { accusedId, winner };
  room.phase = 'result'; // toPublicState ไม่ส่ง endsAt ใน phase result
  hooks.broadcast(room);
  hooks.onResult(room);
}

/** P1: spy ที่ถูกจับทายสถานที่ — ต้องเป็น phase spyGuess, เป็นตัว spy เอง และชื่อสถานที่ต้องอยู่ใน LOCATION_NAMES */
export function spyGuess(room: Room, userId: string, location: string, hooks: EngineHooks): Ack {
  const round = room.round;
  if (room.phase !== 'spyGuess' || !round) return { ok: false, error: 'ยังไม่ถึงช่วงทายสถานที่' };
  if (userId !== round.spyId) return { ok: false, error: 'เฉพาะ Spy ที่ถูกจับเท่านั้นที่ทายได้' };
  if (typeof location !== 'string' || !LOCATION_NAMES.includes(location)) return { ok: false, error: 'ไม่พบสถานที่นี้' };
  resolveSpyGuess(room, location, hooks);
  return { ok: true };
}

/** spyGuess → result: ทายถูก → spy ชนะ; ทายผิด/หมดเวลา (guess = null, ไม่มี spyGuess ใน result) → citizens ชนะ */
function resolveSpyGuess(room: Room, guess: string | null, hooks: EngineHooks): void {
  const round = room.round;
  if (room.phase !== 'spyGuess' || !round) return;

  clearTimer(room);
  const accusedId = round.accusedId ?? null;
  if (guess === null) {
    round.result = { accusedId, winner: 'citizens' };
  } else {
    const correct = guess === round.location;
    round.result = { accusedId, winner: correct ? 'spy' : 'citizens', spyGuess: { location: guess, correct } };
  }
  room.phase = 'result';
  hooks.broadcast(room);
  hooks.onResult(room);
}

/** result (หรือ discussion/voting/spyGuess เมื่อ host ยกเลิกเกม) → lobby */
export function resetRoom(room: Room, hooks: EngineHooks): Ack {
  if (room.phase === 'lobby') return { ok: true }; // อยู่ lobby อยู่แล้ว (idempotent)
  clearTimer(room);
  room.phase = 'lobby';
  room.round = undefined;
  hooks.broadcast(room);
  return { ok: true };
}

/** การ์ดส่วนตัวของผู้เล่น — null ถ้ายังไม่มี round หรือไม่ได้อยู่ในห้อง */
export function cardFor(room: Room, userId: string): PrivateCard | null {
  const round = room.round;
  if (!round || !room.players.has(userId)) return null;
  if (userId === round.spyId) return { isSpy: true, locations: [...LOCATION_NAMES] };
  const role = round.roles.get(userId);
  if (!role) return null;
  return { isSpy: false, location: round.location, role };
}

/** pure: คะแนนสูงสุดคนเดียว → ถูกจับ; เสมอ/ไม่มีใครโหวต → null + spy ชนะ; จับถูก spy → citizens ชนะ */
export function resolveVotes(votes: Map<string, string>, spyId: string): { accusedId: string | null; winner: Winner } {
  const tally = new Map<string, number>();
  for (const target of votes.values()) tally.set(target, (tally.get(target) ?? 0) + 1);

  let accusedId: string | null = null;
  let top = 0;
  for (const [target, count] of tally) {
    if (count > top) {
      top = count;
      accusedId = target;
    } else if (count === top) {
      accusedId = null; // เสมอที่คะแนนสูงสุด
    }
  }

  if (accusedId === null) return { accusedId: null, winner: 'spy' };
  return { accusedId, winner: accusedId === spyId ? 'citizens' : 'spy' };
}
