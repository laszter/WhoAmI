import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, Phase, Winner } from '../shared/types';

export interface AuthedUser { userId: string; name: string; pictureUrl?: string; isDev: boolean; accessToken?: string }
export interface SocketData { user: AuthedUser; roomCode?: string }
export type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface Player {
  userId: string;
  name: string;
  pictureUrl?: string;
  socketId: string | null;
  isDev: boolean;
  offlineAt?: number; // socket หลุดเอง (epoch ms) — ยังนับว่า online จนพ้น OFFLINE_GRACE_MS เผื่อต่อกลับมา
}
export interface Round {
  location: string;
  spyId: string;
  roles: Map<string, string>;   // userId -> บทบาท (spy ไม่มี)
  endsAt: number;
  votes: Map<string, string>;   // voterId -> targetId
  accusedId?: string | null;
  result?: { accusedId: string | null; winner: Winner; spyGuess?: { location: string; correct: boolean } };
}
export interface Room {
  code: string;
  hostId: string;
  phase: Phase;
  players: Map<string, Player>; // key = userId, insertion order = ลำดับเข้าห้อง
  settings: { discussionSec: number; voteSec: number };
  round?: Round;
}
