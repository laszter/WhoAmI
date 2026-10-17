import type { Ack, Me, PrivateCard, PublicRoomState } from '@/shared/types';
export type GameStatus = 'booting' | 'connecting' | 'ready' | 'error';
export interface GameActions {
  createRoom(): Promise<Ack<{ code: string }>>;
  joinRoom(code: string): Promise<Ack<{ code: string }>>;
  leaveRoom(): Promise<Ack>;
  start(opts?: { discussionSec?: number; voteSec?: number }): Promise<Ack>;
  openVote(): Promise<Ack>;
  vote(targetId: string): Promise<Ack>;
  spyGuess(location: string): Promise<Ack>;
  reset(): Promise<Ack>;
  shareInvite(): Promise<'shared' | 'cancelled' | 'unavailable'>; // dev/browser → 'unavailable' (UI คัดลอกลิงก์แทน)
  clearInviteError(): void; // ปิด banner ของ inviteError
}
export interface GameClient {
  status: GameStatus;
  error?: string;
  isDev: boolean;
  me: Me | null;
  room: PublicRoomState | null;
  card: PrivateCard | null;
  now: number;        // เวลา server โดยประมาณ (Date.now() + offset) อัปเดตทุก 250ms เมื่อมี endsAt
  isHost: boolean;
  inviteUrl: string | null; // LIFF: `https://miniapp.line.me/{liffId}/?room=CODE` · dev: `${origin}/?room=CODE`
  pendingInviteCode: string | null; // กำลัง auto-join จากลิงก์เชิญ (?room=)
  inviteError: { code: string; message: string } | null; // auto-join จากลิงก์ไม่สำเร็จ
  actions: GameActions;
}
