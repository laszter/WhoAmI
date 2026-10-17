# Spy Party — เกมจับสายลับบน LINE MINI App

เกมแนว Spyfall สำหรับ 3–8 คน ระบบสุ่มสถานที่ 1 แห่งและ Spy 1 คน ทุกคนผลัดกันถามตอบจนหมดเวลา → โหวต → เฉลย → ส่งผลแพ้/ชนะให้แต่ละคนทาง LINE Service Message
Stack: Next.js 16 + Socket.IO · dev = process เดียว (`server.ts`, state ใน memory) · Vercel = route `/api/socket` + Upstash Redis · อ่านเพิ่ม: [DESIGN.md](./DESIGN.md) (spec) และ [tasks/](./tasks/) (แผนงาน)

## 1. สิ่งที่ต้องมี

- Node.js ≥ 20.9 และ npm · ถ้าจะเปิดใน LINE ต้องมี `ngrok` หรือ `cloudflared` และ MINI App channel

```bash
npm install
cp .env.example .env.local
```

ถ้ามี `.env.local` อยู่แล้ว **อย่า copy ทับ** ให้เพิ่มเฉพาะ key ที่ยังขาดจาก `.env.example` โดยเฉพาะ
- `NEXT_PUBLIC_LIFF_ID` = ส่วนท้ายของ LIFF URL เช่น `https://miniapp.line.me/1234567890-AbCdEfGh` → `1234567890-AbCdEfGh` (code ไม่ได้อ่าน `LINE_LIFF_URL`)
- `LINE_SERVICE_TEMPLATE` = "Template name for API use" ของ Service Message (ดูข้อ 6)

| env | ใช้ทำอะไร |
|---|---|
| `NEXT_PUBLIC_LIFF_ID` | LIFF ID ของ Developing channel (ฝั่ง client) |
| `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET` | verify access token และขอ stateless channel access token |
| `LINE_SERVICE_TEMPLATE` | ชื่อ template ของ Service Message เช่น `xxxx_th` |
| `DEV_AUTH`, `NEXT_PUBLIC_DEV_AUTH` | dev mode (ข้อ 3) — ต้องเป็น `0` ตอน demo |
| `DISCUSSION_SEC`, `VOTE_SEC` | เวลาเริ่มต้นของห้องใหม่เป็นวินาที (default 180 / 30) host เปลี่ยนใน lobby ได้ |
| `PORT` | port ของ server (default 3000) |
| `ALLOWED_DEV_ORIGINS` | ใช้เฉพาะตอนรัน dev ผ่าน tunnel (ข้อ 5) |

ค่าที่ตั้งใน shell ชนะค่าใน `.env.local` · แก้แล้วต้อง restart server · `NEXT_PUBLIC_*` ถูกฝังลง bundle ตอน build → production ต้อง `npm run build` ใหม่

## 2. รัน

```bash
npm run dev                          # dev (tsx watch server.ts) → http://localhost:3000
npm run build && npm start           # production (NODE_ENV=production)
curl http://localhost:3000/healthz   # ต้องได้ ok
```

- แก้ `src/app/**` → Next HMR อัปเดตให้เอง · แก้ `server.ts` หรือ `src/server/**` → server restart ทั้ง process (ห้องหาย)
- ตรวจโค้ด: `npm run typecheck` (= `next typegen && tsc --noEmit`) และ `npm run lint`

## 3. Dev mode: เล่นหลายคนในเครื่องเดียว

ไม่ต้องมี LINE env ไม่ต้องใช้มือถือ — server รับชื่อผู้เล่นจาก `?devUser=` แทนการ login ด้วย LINE

```bash
DEV_AUTH=1 NEXT_PUBLIC_DEV_AUTH=1 DISCUSSION_SEC=20 VOTE_SEC=15 npm run dev
```

เปิดคนละ tab: `http://localhost:3000/?devUser=alice`, `/?devUser=bob`, `/?devUser=carol`
- `devUser` ใช้ได้เฉพาะ `a-z 0-9 _ -` ยาว 1–20 ตัว ได้ userId เป็น `dev:alice` และจะไม่ได้รับ Service Message (server log ว่า skip)
- ตั้ง `DISCUSSION_SEC`/`VOTE_SEC` สั้น ๆ เพื่อทดสอบครบรอบได้เร็ว · ปิด tab แล้วเปิดใหม่ด้วย `devUser` เดิม = reconnect กลับห้องเดิมพร้อมการ์ดใบเดิม

> **ปิด dev mode ก่อน demo** — ตอน `DEV_AUTH=1` ใครก็ปลอมเป็นผู้เล่นคนไหนก็ได้
> ตั้ง `DEV_AUTH=0` และ `NEXT_PUBLIC_DEV_AUTH=0` แล้ว build ใหม่ (server จะไม่ยอม start ถ้า `NODE_ENV=production` คู่กับ `DEV_AUTH=1`)

## 4. Smoke test

```bash
npm run smoke                                   # spawn server เองบน port 3123 (DEV_AUTH=1) แล้วปิดให้
SMOKE_URL=http://localhost:3000 npm run smoke   # ใช้ server ที่รันอยู่แล้ว (ต้องรันด้วย DEV_AUTH=1)
```

จำลองผู้เล่น 3 คนผ่าน socket: create → join → start → แจกการ์ด → reconnect → vote → result → reset → รอบ 2 ปล่อยให้ timer หมดเอง
และตรวจว่า `room:state` ก่อนเฉลยไม่มี location/spyId หลุดออกไป · ผ่าน = พิมพ์ `[smoke] PASS` และ exit 0 · ไม่ต้องมี LINE env

## 5. เปิด tunnel ให้ LINE เข้าถึงเครื่อง

LINE ต้องการ HTTPS → เปิด tunnel ไปที่ port 3000 แล้วนำ URL ไปใส่ Endpoint URL (ข้อ 6)

```bash
ngrok http 3000 --url https://<static-domain>.ngrok-free.app   # แนะนำ: static domain (ฟรี) URL ไม่เปลี่ยน
cloudflared tunnel --url http://localhost:3000                 # quick tunnel: ได้ *.trycloudflare.com ใหม่ทุกครั้ง
```

- **แนะนำให้ demo ด้วย production mode** (`npm run build && npm start`) เร็วกว่าและไม่ติดข้อจำกัดของ dev
- ถ้าต้องใช้ `npm run dev` ผ่าน tunnel ให้ตั้ง `ALLOWED_DEV_ORIGINS=*.ngrok-free.app,*.trycloudflare.com` แล้ว restart ไม่งั้น Next dev จะบล็อก `/_next/*` และหน้าเว็บใช้งานไม่ได้
- URL ของ quick tunnel เปลี่ยนทุกครั้งที่รันใหม่ → ต้องแก้ Endpoint URL ตาม หรืออย่าปิด tunnel ระหว่างงาน · ngrok แบบฟรีอาจแสดงหน้าเตือนก่อนเข้าเว็บ ให้กดผ่านหนึ่งครั้ง

## 6. ตั้งค่า LINE Developers Console

ทำใน MINI App channel ฝั่ง **Developing** (ให้ 1 คนทำคู่ขนานตั้งแต่ต้น)

- [ ] Endpoint URL = URL ของ tunnel เช่น `https://<static-domain>.ngrok-free.app` (หน้าเกมอยู่ที่ `/`)
- [ ] Scope: `profile` + `chat_message.write` (ใช้กับ shareTargetPicker)
- [ ] เปิด shareTargetPicker
- [ ] Service Message → เพิ่ม template ภาษาไทย 1 อัน (เลือกแบบที่ใกล้ "แจ้งผล / ยืนยันรายการ") แล้วจด **Template name for API use** (เช่น `xxxx_th`) ใส่ `LINE_SERVICE_TEMPLATE`
- [ ] Roles → เพิ่มทุกคนที่จะเล่นตอน demo เป็น **Tester** และให้กดยอมรับคำเชิญ (ไม่งั้นเปิดแอปและรับ Service Message ไม่ได้)
- [ ] คัดลอกค่าใส่ `.env.local`: LIFF ID → `NEXT_PUBLIC_LIFF_ID`, Channel ID → `LINE_CHANNEL_ID`, Channel secret → `LINE_CHANNEL_SECRET` แล้ว build/restart ใหม่

จากนั้นแก้ `buildResultParams()` ใน `src/server/line-notify.ts` ให้ key ตรงกับตัวแปรของ template ที่เลือก (ตอนนี้ `title` / `body` / `link` เป็นแค่ placeholder)
ค่าต้องเป็น string ไม่เกินความยาวที่ template กำหนด ห้ามมีโฆษณาหรือชวนเล่น · ถ้า env ไม่ครบหรือ LINE API error server จะ log `[line-notify] … skip` แล้วเกมเล่นต่อได้ตามปกติ

## 7. ข้อจำกัด

- ไม่ได้ตั้ง `REDIS_URL` (dev) → ห้อง เกม และ notification token อยู่ใน memory ของ `server.ts` → รันได้ **instance เดียว** และ server restart (รวมถึงตอน `npm run dev` restart เพราะแก้ไฟล์ฝั่ง server) = ห้องทั้งหมดหาย
- Vercel: Socket.IO วิ่งผ่าน WebSocket ของ Vercel Functions (`src/app/api/socket/route.ts`) และ state อยู่ใน Upstash Redis (`REDIS_URL` จาก Marketplace) เพราะผู้เล่นห้องเดียวกันอาจต่อเข้าคนละ instance · WebSocket อย่างเดียว (ไม่มี long-polling) · connection ถูกตัดทุก ~280s (Hobby maxDuration 300s) แล้ว client ต่อใหม่เอง ผู้เล่นยังนับเป็น online ระหว่างนั้น (ผ่อนผัน 5s)
- channel ยังไม่ verified → ใช้ได้เฉพาะ Developing channel และ Service Message ส่งได้เฉพาะผู้ใช้ที่เป็น Admin/Tester
- Service Message ส่ง 1 ข้อความต่อคนต่อเกม (notification token 1 อันใช้ได้ 5 เกม)
- ระบบเชิญเพื่อนแบบเต็ม (permanent link, shareTargetPicker, QR) ยังไม่ได้ทำ — มีแผนแยกที่ [tasks/2026-10-17-invite-friends/TASK.md](./tasks/2026-10-17-invite-friends/TASK.md)

## โครงสร้างโปรเจกต์

```
server.ts                  dev: http server: Next handler + Socket.IO + /healthz (รันด้วย tsx)
next.config.ts             allowedDevOrigins จาก ALLOWED_DEV_ORIGINS, serverExternalPackages ของ Socket.IO
vercel.json                region ของ function = sin1 (ที่เดียวกับ Upstash Redis)
src/app/api/socket/route.ts  Vercel: รับ WebSocket upgrade แล้วส่งให้ engine.io
src/shared/types.ts        contract ระหว่าง server/client: socket events, PublicRoomState, PrivateCard
src/shared/locations.ts    รายชื่อสถานที่ + บทบาท
src/server/auth.ts         Socket.IO middleware: verify LINE access token + ดึง profile (+ DEV_AUTH)
src/server/kv.ts           ที่เก็บ state: Redis (REDIS_URL / KV_URL) หรือ memory + lock ต่อห้อง
src/server/realtime.ts     ตั้งค่า Socket.IO ที่ใช้ร่วมกัน (Redis adapter, auth, ตัด connection ก่อน maxDuration)
src/server/rooms.ts        rooms ใน kv: create / join / leave / reconnect / offline grace, toPublicState
src/server/game.ts         สุ่ม spy และบทบาท, timer (endsAt), โหวต, คำนวณผล
src/server/handlers.ts     ผูก socket events เข้ากับ rooms/game (withRoom: lock → แก้ → บันทึก → emit), timer ต่อ instance, Service Message
src/server/line-notify.ts  Service Message: stateless token, notification token, buildResultParams
src/lib/liff.ts            LIFF init/login หรือ dev mode (?devUser=), ลิงก์เชิญ
src/lib/socket.ts          socket.io-client singleton + withAck
src/lib/use-game.ts        hook useGame(): state ห้อง การ์ด เวลา และ actions
src/app/                   page/layout + components/ ของแต่ละ phase (Home, Lobby, Discussion, Voting, Result)
scripts/smoke.ts           end-to-end test ผ่าน socket (npm run smoke)
```
