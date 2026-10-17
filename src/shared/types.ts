// Contract ระหว่าง server และ client — แก้ไฟล์นี้ = ต้องแก้ทั้งสองฝั่ง
export type Phase = 'lobby' | 'discussion' | 'voting' | 'spyGuess' | 'result';
export type Winner = 'spy' | 'citizens';

export interface PublicPlayer {
  userId: string;
  name: string;
  pictureUrl?: string;
  online: boolean;    // socketId !== null
  hasVoted: boolean;  // มีความหมายเฉพาะ phase voting/result
}

export interface Reveal {
  spyId: string;
  location: string;
  votes: Record<string, string>;               // voterId -> targetId
  winner: Winner;
  spyGuess?: { location: string; correct: boolean }; // P1
}

// สิ่งเดียวที่ broadcast ได้ — ห้ามมี location/spyId/roles นอก reveal (และ reveal มีเฉพาะ phase result)
export interface PublicRoomState {
  code: string;
  hostId: string;
  phase: Phase;
  players: PublicPlayer[];
  settings: { discussionSec: number; voteSec: number };
  endsAt?: number;          // epoch ms ที่ phase ปัจจุบันจบ (discussion / voting / spyGuess)
  serverNow: number;        // Date.now() ของ server ตอนส่ง ให้ client ชดเชยนาฬิกา
  accusedId?: string | null; // ใส่เฉพาะ phase spyGuess/result (null = เสมอ/ไม่มีใครโหวต)
  reveal?: Reveal;          // ใส่เฉพาะ phase result
}

export type PrivateCard =
  | { isSpy: true; locations: string[] }
  | { isSpy: false; location: string; role: string };

export interface Me { userId: string; name: string; pictureUrl?: string; isDev: boolean }

// T = unknown เพื่อให้ Ack เปล่า ๆ = { ok: true } (ห้ามใช้ Record<string, never> เพราะ ok จะกลายเป็น never)
export type Ack<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

export interface ClientToServerEvents {
  'room:create': (ack: (r: Ack<{ code: string }>) => void) => void;
  'room:join': (p: { code: string }, ack: (r: Ack<{ code: string }>) => void) => void;
  'room:leave': (ack: (r: Ack) => void) => void;
  'game:start': (p: { discussionSec?: number; voteSec?: number }, ack: (r: Ack) => void) => void;
  'game:openVote': (ack: (r: Ack) => void) => void;
  'vote:cast': (p: { targetId: string }, ack: (r: Ack) => void) => void;
  'spy:guess': (p: { location: string }, ack: (r: Ack) => void) => void; // P1
  'game:reset': (ack: (r: Ack) => void) => void;
  'room:sync': (ack: (r: Ack) => void) => void; // นาฬิกาฝั่ง client เลย endsAt แล้วแต่ phase ยังไม่เปลี่ยน → ให้ server เช็กเวลาอีกรอบ
}

export interface ServerToClientEvents {
  'session:me': (me: Me) => void;            // ส่งทันทีหลัง connect
  'room:state': (state: PublicRoomState) => void; // broadcast ทั้งห้องทุกครั้งที่ state เปลี่ยน
  'game:you': (card: PrivateCard) => void;   // ส่งเฉพาะคน (io.to(socketId)) ตอน start และตอน reconnect
}

export const LIMITS = {
  MIN_PLAYERS: 3, MAX_PLAYERS: 8,
  MIN_SEC: 1, MAX_DISCUSSION_SEC: 600, MAX_VOTE_SEC: 120,
  SPY_GUESS_SEC: 15,
  DEFAULT_DISCUSSION_SEC: 180, DEFAULT_VOTE_SEC: 30,
} as const;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 4;

// path ของ Socket.IO (WebSocket อย่างเดียว ไม่มี trailing slash) — dev: server.ts ดักก่อนถึง Next, Vercel: src/app/api/socket/route.ts
export const SOCKET_PATH = '/api/socket';
