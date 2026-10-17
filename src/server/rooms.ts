// Room store — state ห้องอยู่ใน kv (Redis บน Vercel ที่มีหลาย instance / memory ตอน dev) ไม่ใช่ตัวแปรใน process
// ผู้เล่นผูกกับ userId (key ของ room.players) ไม่ใช่ socketId; disconnect = socketId null แต่ยังอยู่ในห้อง
// แก้ห้องผ่าน lockRoom (lock + โหลด) → ฟังก์ชัน pure ด้านล่าง → saveRoom เท่านั้น (handlers.ts withRoom)
// อ่าน process.env.* ภายในฟังก์ชันเท่านั้น (server.ts โหลด .env.local หลัง import ถูก hoist)
import { randomInt } from 'node:crypto';
import {
  LIMITS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type PublicPlayer,
  type PublicRoomState,
} from '../shared/types';
import { clampSec } from './game';
import { kv } from './kv';
import type { AuthedUser, Player, Room, Round } from './types';

const ROOM_TTL_SEC = 12 * 60 * 60;      // ห้องที่ไม่มีใครแตะเกินนี้หายเอง
const USER_ROOM_TTL_SEC = 24 * 60 * 60;
/** socket หลุดเอง (เน็ตสะดุด / Vercel ตัด connection ทุก ~5 นาที) → รอเท่านี้ก่อนนับว่า offline */
export const OFFLINE_GRACE_MS = 5_000;

const roomKey = (code: string) => `room:${code}`;
const userRoomKey = (userId: string) => `user-room:${userId}`;

// ---- persistence ----

interface StoredRound extends Omit<Round, 'roles' | 'votes'> {
  roles: [string, string][];
  votes: [string, string][];
}
interface StoredRoom extends Omit<Room, 'players' | 'round'> {
  players: Player[]; // ลำดับเข้าห้อง
  round?: StoredRound;
}

function serialize(room: Room): string {
  const { players, round, ...rest } = room;
  const stored: StoredRoom = {
    ...rest,
    players: [...players.values()],
    ...(round ? { round: { ...round, roles: [...round.roles], votes: [...round.votes] } } : {}),
  };
  return JSON.stringify(stored);
}

function deserialize(raw: string): Room {
  const { players, round, ...rest } = JSON.parse(raw) as StoredRoom;
  return {
    ...rest,
    players: new Map(players.map((p) => [p.userId, p])),
    ...(round ? { round: { ...round, roles: new Map(round.roles), votes: new Map(round.votes) } } : {}),
  };
}

/** รัน fn แบบ exclusive ต่อห้อง (ข้าม instance) พร้อมห้องที่โหลดหลังได้ lock (null = ไม่มีห้องนี้) — ห้ามเรียกซ้อนกันข้างใน */
export function lockRoom<T>(code: string, fn: (room: Room | null) => Promise<T>): Promise<T> {
  return kv().withLock(roomKey(code), (raw) => fn(raw ? deserialize(raw) : null));
}

export async function saveRoom(room: Room): Promise<void> {
  await kv().set(roomKey(room.code), serialize(room), ROOM_TTL_SEC);
}

export async function deleteRoom(code: string): Promise<void> {
  await kv().del(roomKey(code));
}

/** ห้องปัจจุบันของ user (ผู้เล่น 1 คนอยู่ได้ 1 ห้อง) — ใช้หาห้องเก่าที่ต้องถอด user ออกตอนเข้า/สร้างห้องใหม่ */
export async function getUserRoom(userId: string): Promise<string | null> {
  return kv().get(userRoomKey(userId));
}

/** ตั้งห้องปัจจุบันของ user แล้วคืนห้องก่อนหน้า */
export async function swapUserRoom(userId: string, code: string): Promise<string | null> {
  return kv().swap(userRoomKey(userId), code, USER_ROOM_TTL_SEC);
}

export async function clearUserRoom(userId: string): Promise<void> {
  await kv().del(userRoomKey(userId));
}

// ---- create / join / leave ----

function randomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return code;
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

/** สร้างห้องใหม่ด้วยโค้ดที่ไม่ซ้ำ (จองโค้ดด้วย setNx) แล้วบันทึกลง store */
export async function createRoom(host: AuthedUser, socketId: string): Promise<Room> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const room: Room = {
      code: randomCode(),
      hostId: host.userId,
      phase: 'lobby',
      players: new Map([[host.userId, toPlayer(host, socketId)]]),
      settings: defaultSettings(),
    };
    if (await kv().setNx(roomKey(room.code), serialize(room), ROOM_TTL_SEC)) return room;
  }
  throw new Error('สร้างโค้ดห้องไม่สำเร็จ (ห้องเต็มระบบ)');
}

export function joinRoom(room: Room, user: AuthedUser, socketId: string): { reconnected: boolean } | { error: string } {
  const existing = room.players.get(user.userId);
  if (existing) {
    // reconnect (ได้ทุก phase) — อัปเดต socket ใหม่ + โปรไฟล์ล่าสุด
    existing.socketId = socketId;
    delete existing.offlineAt;
    existing.name = user.name;
    if (user.pictureUrl) existing.pictureUrl = user.pictureUrl;
    else delete existing.pictureUrl;
    existing.isDev = user.isDev;
    return { reconnected: true };
  }

  if (room.phase !== 'lobby') return { error: 'เกมเริ่มแล้ว รอรอบหน้า' };
  if (room.players.size >= LIMITS.MAX_PLAYERS) return { error: 'ห้องเต็ม' };

  room.players.set(user.userId, toPlayer(user, socketId));
  return { reconnected: false };
}

/**
 * lobby/result → ลบออกจากห้อง (host ออก → โอนให้คนแรกที่ online, ถ้าไม่มีใคร online ให้คนแรกที่เหลือ)
 * ระหว่างเกม (discussion/voting/spyGuess) → แค่ offline เพื่อไม่ให้ roles/votes พัง
 * ห้องว่าง (players.size === 0) → caller ลบห้องออกจาก store
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
    delete player.offlineAt;
  }
}

/**
 * ผู้เล่น 1 คนอยู่ได้ 1 ห้อง: เอา userId ออกจากห้องเก่าด้วยกติกาเดียวกับ leaveRoom
 * (lobby/result = ลบ + โอน host · ระหว่างเกม = แค่ offline) → คืน true ถ้าห้องเปลี่ยน (ไว้ broadcast)
 */
export function detachFromRoom(room: Room, userId: string): boolean {
  const player = room.players.get(userId);
  if (!player) return false;
  const inGame = room.phase !== 'lobby' && room.phase !== 'result';
  if (inGame && player.socketId === null) return false; // offline อยู่แล้ว ไม่มีอะไรเปลี่ยน
  leaveRoom(room, userId);
  return true;
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

/**
 * socket หลุด → player ที่ผูกกับ socket นี้ (ถ้า reconnect ด้วย socket ใหม่ไปแล้วจะไม่กระทบ)
 * graceful (หลุดเอง) → จดเวลาไว้ ยัง online จนพ้น OFFLINE_GRACE_MS (expireOffline) · ไม่งั้น offline ทันที
 * คืน true ถ้า online/offline ที่คนอื่นเห็นเปลี่ยน
 */
export function markOffline(room: Room, socketId: string, graceful: boolean, now = Date.now()): boolean {
  let changed = false;
  for (const player of room.players.values()) {
    if (player.socketId !== socketId) continue;
    if (graceful) {
      player.offlineAt ??= now;
    } else {
      player.socketId = null;
      delete player.offlineAt;
      changed = true;
    }
  }
  return changed;
}

/** หลุดเกิน OFFLINE_GRACE_MS แล้วไม่กลับมา → offline จริง · คืน true ถ้ามีคนเปลี่ยน */
export function expireOffline(room: Room, now = Date.now()): boolean {
  let changed = false;
  for (const player of room.players.values()) {
    if (player.offlineAt === undefined || now < player.offlineAt + OFFLINE_GRACE_MS) continue;
    player.socketId = null;
    delete player.offlineAt;
    changed = true;
  }
  return changed;
}

/** เวลาที่เร็วที่สุดที่ผู้เล่นที่หลุดอยู่จะพ้นช่วงผ่อนผัน (null = ไม่มี) */
export function offlineDeadline(room: Room): number | null {
  let at: number | null = null;
  for (const player of room.players.values()) {
    if (player.offlineAt === undefined) continue;
    const due = player.offlineAt + OFFLINE_GRACE_MS;
    if (at === null || due < at) at = due;
  }
  return at;
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
