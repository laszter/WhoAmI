// process เดียว: Next.js request handler + Socket.IO + /healthz
// รันด้วย tsx (ไฟล์นี้ไม่ผ่าน Next compiler): dev = `tsx watch server.ts`, prod = `NODE_ENV=production tsx server.ts`
// ไม่ตั้ง REDIS_URL → state ห้องอยู่ใน memory ของ process นี้ (รันได้ instance เดียว) · บน Vercel ไม่ใช้ไฟล์นี้ (ดู src/app/api/socket/route.ts)
import { loadEnvConfig } from '@next/env';
import { createServer } from 'node:http';
import next from 'next';
import { Server } from 'socket.io';
import { SOCKET_SERVER_OPTIONS, setupRealtime } from './src/server/realtime';
import type { TypedServer } from './src/server/types';

async function main() {
  const dev = process.env.NODE_ENV !== 'production';
  loadEnvConfig(process.cwd(), dev);   // โหลด .env.local — ต้องเป็นบรรทัดแรกของ main() และห้ามอ่าน process.env.* ที่ top-level ของโมดูลใด ๆ (import ถูก hoist)
  const port = Number(process.env.PORT ?? 3000);

  if (process.env.DEV_AUTH === '1') {
    if (!dev) {
      console.error(
        '[server] ปฏิเสธการ start: DEV_AUTH=1 ใน production (NODE_ENV=production) — ใครก็ปลอมตัวเป็นผู้เล่นได้\n' +
          '[server] ตั้ง DEV_AUTH=0 (หรือลบออกจาก .env.local / environment) แล้วรันใหม่',
      );
      process.exit(1);
    }
    console.warn(
      [
        '',
        '  ************************************************************',
        '  *  DEV_AUTH=1 — server รับ auth.devUser โดยไม่ตรวจกับ LINE  *',
        '  *  ใช้ทดสอบในเครื่องเท่านั้น · ปิด (DEV_AUTH=0) ก่อน demo      *',
        '  ************************************************************',
        '',
      ].join('\n'),
    );
  }

  const app = next({ dev });
  const handle = app.getRequestHandler();
  await app.prepare();

  const httpServer = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }
    handle(req, res).catch((err: unknown) => {
      console.error('[server] request error', req.url, err);
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    });
  });

  // destroyUpgrade: false → ไม่ให้ engine.io ปิด upgrade request ที่ไม่ใช่ SOCKET_PATH (เช่น HMR websocket ของ Next dev)
  const io: TypedServer = new Server(httpServer, { ...SOCKET_SERVER_OPTIONS, destroyUpgrade: false });
  setupRealtime(io);

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port} (dev=${dev}, DEV_AUTH=${process.env.DEV_AUTH ?? '0'})`);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
