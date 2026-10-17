// Socket.IO บน Vercel: Next.js ไม่มี API รับ WebSocket upgrade → ใช้ upgrade ระดับล่างของ Vercel runtime
// (ตัวเดียวกับที่ upgradeWebSocket() ของ @vercel/functions ใช้ ซึ่งคืนแค่ ws ที่ต่อเสร็จแล้ว) แล้วส่ง req/socket/head ให้ engine.io
// dev ในเครื่องไม่ผ่านไฟล์นี้: server.ts ดัก SOCKET_PATH ก่อนถึง Next
import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { getSocketEngine } from '@/server/realtime';

export const dynamic = 'force-dynamic';
// connection อยู่ได้นานเท่า invocation (Hobby สูงสุด 300s) — realtime.ts ตัดเองที่ 280s แล้ว client ต่อใหม่
export const maxDuration = 300;

type RawUpgrade = () => { req: IncomingMessage; socket: Socket; head: Buffer };
const REQUEST_CONTEXT = Symbol.for('@vercel/request-context');

function runtimeUpgrade(): RawUpgrade | null {
  const holder = globalThis as { [REQUEST_CONTEXT]?: { get?: () => { upgradeWebSocket?: RawUpgrade } | undefined } };
  const upgrade = holder[REQUEST_CONTEXT]?.get?.()?.upgradeWebSocket;
  return typeof upgrade === 'function' ? upgrade : null;
}

export async function GET(): Promise<Response> {
  // header Upgrade / Sec-WebSocket-Key ให้ engine.io (ws) ตรวจจาก req ดิบเอง — ไม่ผ่าน → ตอบ 400 แล้วปิด socket
  const upgrade = runtimeUpgrade();
  if (!upgrade) return new Response('WebSocket upgrade is only available on Vercel (dev ใช้ server.ts)', { status: 426 });

  const engine = getSocketEngine();
  const { req, socket, head } = upgrade();
  // รอจน engine.io รับ connection (หรือ socket ปิดเพราะ handshake ไม่ผ่าน) ก่อนคืน response — แบบเดียวกับ upgradeWebSocket()
  await new Promise<void>((resolve) => {
    const done = () => {
      engine.off('connection', onConnection);
      socket.off('close', done);
      resolve();
    };
    const onConnection = (conn: { request: unknown }) => {
      if (conn.request === req) done();
    };
    engine.on('connection', onConnection);
    socket.once('close', done);
    try {
      engine.handleUpgrade(req, socket, head);
    } catch (err) {
      console.error('[socket route] handleUpgrade failed', err);
      socket.destroy();
      done();
    }
  });
  return new Response(null, { status: 204 });
}
