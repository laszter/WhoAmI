// Socket.IO client singleton (T4) — สร้างได้เฉพาะฝั่ง browser (io() ไม่ใส่ URL = ต่อ origin ปัจจุบัน)
import { io, type Socket } from 'socket.io-client';
import { SOCKET_PATH, type Ack, type ClientToServerEvents, type ServerToClientEvents } from '@/shared/types';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const ACK_TIMEOUT_ERROR = 'server ไม่ตอบสนอง';

let socket: GameSocket | null = null;

/**
 * สร้าง socket ใหม่ (มีได้ตัวเดียว) — ถ้ามีตัวเก่าอยู่จะถอด listener + disconnect ก่อน
 * auth: dev mode ส่ง { devUser }, LIFF ส่ง { accessToken } (server ตรวจเองทุกครั้งที่ connect/reconnect)
 */
export function connectSocket(auth: { accessToken?: string; devUser?: string }): GameSocket {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  const s: GameSocket = io({
    path: SOCKET_PATH,
    addTrailingSlash: false, // /api/socket/ → Next redirect ซึ่ง WebSocket ตามไม่ได้
    transports: ['websocket'], // server รับ WebSocket อย่างเดียว (Vercel ไม่มี sticky session ให้ long-polling)
    auth,
    reconnection: true,
    reconnectionDelayMax: 3000,
    forceNew: true, // ไม่ reuse Manager ของตัวเก่าที่เพิ่ง disconnect (auth อาจเปลี่ยน)
  });
  socket = s;
  return s;
}

export function getSocket(): GameSocket | null {
  return socket;
}

/** ถอด listener + ตัดการเชื่อมต่อ singleton (ใช้ตอน hook unmount) */
export function disconnectSocket(): void {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}

/**
 * ห่อ emit ที่มี ack ให้เป็น Promise + timeout
 * ใช้: withAck<Ack<{ code: string }>>((ack) => socket.emit('room:create', ack))
 * timeout / emit พัง / ack ผิดรูป → { ok: false, error } (ไม่ reject)
 */
export function withAck<T extends Ack<unknown>>(
  run: (ack: (r: T) => void) => void,
  timeoutMs = 8000,
): Promise<T | { ok: false; error: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: T | { ok: false; error: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => finish({ ok: false, error: ACK_TIMEOUT_ERROR }), timeoutMs);
    try {
      run((r) => {
        if (r && typeof r === 'object' && typeof r.ok === 'boolean') finish(r);
        else finish({ ok: false, error: 'server ตอบกลับผิดรูปแบบ' });
      });
    } catch (err) {
      console.error('[socket] emit failed', err);
      finish({ ok: false, error: 'ส่งคำสั่งไม่สำเร็จ' });
    }
  });
}
