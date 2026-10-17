// In-memory room store — state อยู่ใน process ของ server.ts เท่านั้น (ห้ามอ่าน/แก้จาก Route Handler)
// ผู้เล่นผูกกับ userId (key ของ room.players) ไม่ใช่ socketId; disconnect = socketId null แต่ยังอยู่ในห้อง
// อ่าน process.env.* ภายในฟังก์ชันเท่านั้น (server.ts โหลด .env.local หลัง import ถูก hoist)
import { randomInt } from 'node:crypto';
import {
  LIMITS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type PublicPlayer,
  type PublicRoomState,
} from '../shared/types';
import { clampSec, clearTimer } from './game';
import type { AuthedUser, Player, Room } from './types';

export const rooms = new Map<string, Room>();

/** 4 ตัวจาก ROOM_CODE_ALPHABET และไม่ซ้ำกับห้องที่มีอยู่ */
export function generateCode(): string {
  for (let attempt = 0; attempt < 10_000; attempt++) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
  throw new Error('สร้างโค้ดห้องไม่สำเร็จ (ห้องเต็มระบบ)');
}

/** ค่าเริ่มต้นของห้องใหม่: env DISCUSSION_SEC / VOTE_SEC (อ่านแบบ lazy) หรือ LIMITS.DEFAULT_* */
function defaultSettings(): Room['settings'] {
  return {
    discussionSec: clampSec(process.env.DISCUSSION_SEC, LIMITS.MAX_DISCUSSION_SEC, LIMITS.DEFAULT_DISCUSSION_SEC),
    voteSec: clampSec(process.env.VOTE_SEC, LIMITS.MAX_VOTE_SEC, LIMITS.DEFAULT_VOTE_SEC),
  };
}

function toPlayer(user: AuthedUser, socketId: string): Player {
  return {
    userId: user.userId,
    name: user.name,
    ...(user.pictureUrl ? { pictureUrl: user.pictureUrl } : {}),
    socketId,
    isDev: user.isDev,
  };
}

export function createRoom(host: AuthedUser, socketId: string): Room {
  const room: Room = {
    code: generateCode(),
    hostId: host.userId,
    phase: 'lobby',
    players: new Map([[host.userId, toPlayer(host, socketId)]]),
    settings: defaultSettings(),
  };
  rooms.set(room.code, room);
  return room;
}

export function joinRoom(
  code: string,
  user: AuthedUser,
  socketId: string,
): { room: Room; reconnected: boolean } | { error: string } {
  const room = rooms.get(code);
  if (!room) return { error: 'ไม่พบห้องนี้' };

  const existing = room.players.get(user.userId);
  if (existing) {
    // reconnect (ได้ทุก phase) — อัปเดต socket ใหม่ + โปรไฟล์ล่าสุด
    existing.socketId = socketId;
    existing.name = user.name;
    if (user.pictureUrl) existing.pictureUrl = user.pictureUrl;
    else delete existing.pictureUrl;
    existing.isDev = user.isDev;
    return { room, reconnected: true };
  }

  if (room.phase !== 'lobby') return { error: 'เกมเริ่มแล้ว รอรอบหน้า' };
  if (room.players.size >= LIMITS.MAX_PLAYERS) return { error: 'ห้องเต็ม' };

  room.players.set(user.userId, toPlayer(user, socketId));
  return { room, reconnected: false };
}

/**
 * lobby/result → ลบออกจากห้อง (host ออก → โอนให้คนแรกที่ online, ถ้าไม่มีใคร online ให้คนแรกที่เหลือ)
 * ระหว่างเกม (discussion/voting/spyGuess) → แค่ offline เพื่อไม่ให้ roles/votes พัง
 * ห้องว่าง → clearTimer + ลบห้อง
 */
export function leaveRoom(room: Room, userId: string): void {
  const player = room.players.get(userId);
  if (!player) return;

  if (room.phase === 'lobby' || room.phase === 'result') {
    room.players.delete(userId);
    if (room.hostId === userId) {
      const remaining = [...room.players.values()];
      const next = remaining.find((p) => p.socketId !== null) ?? remaining[0];
      if (next) room.hostId = next.userId;
    }
  } else {
    player.socketId = null;
  }

  if (room.players.size === 0) {
    clearTimer(room);
    rooms.delete(room.code);
  }
}

/**
 * ผู้เล่น 1 คนอยู่ได้ 1 ห้อง: เอา userId ออกจากทุกห้องยกเว้น exceptCode ด้วยกติกาเดียวกับ leaveRoom
 * (lobby/result = ลบ + โอน host · ระหว่างเกม = แค่ offline) → คืนห้องที่ยังอยู่และมีการเปลี่ยนแปลง (ไว้ broadcast)
 */
export function detachFromOtherRooms(userId: string, exceptCode: string): Room[] {
  const changed: Room[] = [];
  for (const room of [...rooms.values()]) {
    if (room.code === exceptCode) continue;
    const player = room.players.get(userId);
    if (!player) continue;
    const inGame = room.phase !== 'lobby' && room.phase !== 'result';
    if (inGame && player.socketId === null) continue; // offline อยู่แล้ว ไม่มีอะไรเปลี่ยน
    leaveRoom(room, userId);
    if (rooms.has(room.code)) changed.push(room);
  }
  return changed;
}

/**
 * host หลุด/offline ใน lobby/result → โอน host ให้ผู้เล่น online คนแรก (ไม่งั้นไม่มีใครกด start/reset ได้)
 * ระหว่างเกมไม่โอน (timer เดินเองอยู่แล้ว) · ไม่มีใคร online → คงเดิม · คืน true ถ้าเปลี่ยน hostId
 */
export function ensureOnlineHost(room: Room): boolean {
  if (room.phase !== 'lobby' && room.phase !== 'result') return false;
  const current = room.players.get(room.hostId);
  if (current && current.socketId !== null) return false;
  const next = [...room.players.values()].find((p) => p.socketId !== null);
  if (!next) return false;
  room.hostId = next.userId;
  return true;
}

/** socket หลุด → player ที่ผูกกับ socket นี้กลายเป็น offline (ถ้า reconnect ด้วย socket ใหม่ไปแล้วจะไม่กระทบ) */
export function markOffline(room: Room, socketId: string): void {
  for (const player of room.players.values()) {
    if (player.socketId === socketId) player.socketId = null;
  }
}

/**
 * สิ่งเดียวที่ broadcast ได้ — สร้างแบบ whitelist ทีละ key (ห้าม spread round)
 * กฎข้อ 1: ห้ามมี location/spyId/roles; accusedId เฉพาะ spyGuess/result; reveal เฉพาะ result
 */
export function toPublicState(room: Room): PublicRoomState {
  const round = room.round;
  const players: PublicPlayer[] = [...room.players.values()].map((p) => ({
    userId: p.userId,
    name: p.name,
    ...(p.pictureUrl ? { pictureUrl: p.pictureUrl } : {}),
    online: p.socketId !== null,
    hasVoted: round ? round.votes.has(p.userId) : false,
  }));

  const state: PublicRoomState = {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    players,
    settings: { discussionSec: room.settings.discussionSec, voteSec: room.settings.voteSec },
    serverNow: Date.now(),
  };

  if (!round) return state;

  if (room.phase === 'discussion' || room.phase === 'voting' || room.phase === 'spyGuess') {
    state.endsAt = round.endsAt;
  }
  if (room.phase === 'spyGuess' || room.phase === 'result') {
    state.accusedId = round.result?.accusedId ?? round.accusedId ?? null;
  }
  if (room.phase === 'result' && round.result) {
    const { winner, spyGuess } = round.result;
    state.reveal = {
      spyId: round.spyId,
      location: round.location,
      votes: Object.fromEntries(round.votes),
      winner,
      ...(spyGuess ? { spyGuess: { location: spyGuess.location, correct: spyGuess.correct } } : {}),
    };
  }
  return state;
}
