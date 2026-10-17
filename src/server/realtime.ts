// Socket.IO setup ที่ใช้ร่วมกัน: dev = server.ts (http server ของเราเอง), Vercel = src/app/api/socket/route.ts
// มี Redis (REDIS_URL / KV_URL) → Redis adapter: emit ไปถึง socket ที่ต่ออยู่กับ instance อื่นด้วย
// อ่าน process.env.* ภายในฟังก์ชันเท่านั้น (server.ts โหลด .env.local หลัง import ถูก hoist)
import { createAdapter } from '@socket.io/redis-adapter';
import { Server as EngineServer } from 'engine.io';
import { Server } from 'socket.io';
import { SOCKET_PATH } from '../shared/types';
import { authMiddleware } from './auth';
import { registerHandlers } from './handlers';
import { getRedis } from './kv';
import type { TypedServer } from './types';

/** WebSocket อย่างเดียว: Vercel ไม่มี sticky session ให้ long-polling (request แต่ละอันอาจไปคนละ instance) */
export const SOCKET_SERVER_OPTIONS = {
  path: SOCKET_PATH,
  addTrailingSlash: false,
  transports: ['websocket' as const],
};

/**
 * Vercel ปิด WebSocket เมื่อ function ครบ maxDuration (Hobby 300s — ดู route.ts) → ตัดเองก่อนนิดหน่อย
 * client ต่อใหม่ทันที (io server disconnect → connect) และผู้เล่นยังอยู่ในช่วงผ่อนผัน offline (OFFLINE_GRACE_MS)
 */
function maxConnectionMs(): number {
  const sec = Number(process.env.SOCKET_MAX_CONNECTION_SEC);
  if (Number.isFinite(sec) && sec > 0) return sec * 1000;
  return process.env.VERCEL ? 280_000 : 0;
}

export function setupRealtime(io: TypedServer): void {
  const redis = getRedis();
  if (redis) {
    // pubClient = client เดียวกับ kv → publish ของ emit ออกก่อนคำสั่งปลด lock ห้อง (ลำดับ room:state ไม่สลับ)
    const sub = redis.duplicate();
    sub.on('error', (err: Error) => console.error('[realtime] redis sub error', err.message));
    io.adapter(createAdapter(redis, sub));
  }
  io.use(authMiddleware);
  registerHandlers(io);

  const maxMs = maxConnectionMs();
  if (maxMs > 0) {
    io.on('connection', (socket) => {
      const timer = setTimeout(() => socket.disconnect(true), maxMs);
      socket.once('disconnect', () => clearTimeout(timer));
    });
  }
  console.log(`[realtime] adapter=${redis ? 'redis' : 'memory'}${maxMs > 0 ? `, max connection ${maxMs / 1000}s` : ''}`);
}

let engine: EngineServer | undefined;

/** engine.io ของ instance นี้ (Vercel) — route.ts ส่ง upgrade request เข้ามาที่นี่ด้วย handleUpgrade() */
export function getSocketEngine(): EngineServer {
  if (!engine) {
    engine = new EngineServer({ transports: SOCKET_SERVER_OPTIONS.transports });
    const io: TypedServer = new Server();
    io.bind(engine);
    setupRealtime(io);
  }
  return engine;
}
