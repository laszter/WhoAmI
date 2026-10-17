# TASK: Spy Party — เกม Spyfall multiplayer บน LINE MINI App

> Status: DONE (T8 ย้ายไปแผน invite) · Created 2026-10-17 · Source: user request (hackathon 2 ชม.)
> Skill: explore-plan-build
> Spec หลัก: `/Users/earth/Playgrounds/LineHackathon/DESIGN.md` (อ่านทั้งไฟล์ก่อนเริ่มทุก task)

## Goal
สร้างเกม Spyfall แบบ multiplayer 3–8 คนบน LINE MINI App ด้วย Next.js 16 + Socket.IO ใน process เดียว (custom `server.ts`) ไม่มี database (state อยู่ใน memory)
ผู้เล่น login ด้วย LIFF → สร้าง/เข้าห้องด้วย room code → host กด Start → server สุ่มสถานที่ + spy + บทบาท ส่งการ์ดแบบ private → นับถอยหลัง → โหวต → เฉลย → ส่งผลแพ้/ชนะให้แต่ละคนทาง LINE Service Message
ต้องพัฒนาและทดสอบได้ครบบนเครื่องเดียวโดย **ไม่มี** ค่า LINE env (LIFF ID / channel) ผ่าน dev mode (`DEV_AUTH=1`) + smoke test

## Acceptance criteria
- [ ] `npm run typecheck` (= `tsc --noEmit`) และ `npm run build` (= `next build`) ผ่านโดยไม่มี error
- [ ] `npm run smoke` ผ่าน: จำลองผู้เล่น 3 คนใน `DEV_AUTH=1` → create → join → start → ทุกคนได้ `game:you` ถูกต้อง (spy 1 คน คนอื่นเห็น location เดียวกัน + role) → reconnect ได้การ์ดเดิม → `room:state` ก่อน phase `result` ไม่มี `location`/`spyId`/`reveal` → vote → result ถูกต้องตามกติกา → reset กลับ lobby → รอบ 2 timer หมดเวลาเอง + ไม่มีใครโหวต → spy ชนะ
- [ ] เปิด `http://localhost:3000/?devUser=alice` และ `?devUser=bob`, `?devUser=carol` คนละ tab (ตั้ง `DEV_AUTH=1 NEXT_PUBLIC_DEV_AUTH=1`) เล่นครบ flow Home → Lobby → Discussion → Voting → Result → Lobby ได้บนมือถือ/จอแคบ (UI ภาษาไทย mobile-first)
- [ ] ผู้เล่นผูกกับ `userId` ไม่ใช่ `socketId`: ปิด tab แล้วเปิดใหม่ด้วย devUser เดิมระหว่างเกม → กลับเข้าห้องเดิม ได้ `room:state` + `game:you` ใหม่ และคนอื่นเห็นสถานะ online เปลี่ยน
- [ ] Timer เป็น server-authoritative: phase เปลี่ยนเองเมื่อหมดเวลาโดย client ไม่ต้องส่งอะไร และ client แสดงนับถอยหลังจาก `endsAt` + `serverNow`
- [ ] Auth จริง (ไม่ใช่ dev) ตรวจ access token กับ `api.line.me` (verify `client_id` + `expires_in > 0`, แล้วดึง profile เอง) — ห้ามเชื่อ userId/ชื่อที่ client ส่ง
- [ ] Service Message: ขอ notification token ตอน join (cache ต่อ userId) และส่งผลตอนจบเกมแบบ fire-and-forget; ถ้า env ไม่ครบ / ผู้เล่นเป็น dev user / API พัง → log แล้วข้าม **เกมต้องไม่พัง** (smoke ต้องผ่านโดยไม่มี env LINE เลย)
- [ ] `README.md` อธิบายวิธีรัน dev, dev mode หลาย tab, เปิด tunnel, ตั้งค่า LINE Console ครบตาม DESIGN.md ข้อ 9
- [ ] (P1 — ตัดได้ถ้าไม่ทัน) spy ที่ถูกจับทายสถานที่ได้ภายใน 15s; ปุ่มเชิญเพื่อนผ่าน `shareTargetPicker` (fallback = copy ลิงก์/โค้ด)

## Context (จากการสำรวจ spec + ตรวจเวอร์ชันจริง)

**สภาพโปรเจกต์ตอนนี้**
- `/Users/earth/Playgrounds/LineHackathon/` มีแค่ `DESIGN.md` และ `tasks/` ยังไม่เป็น git repo ไม่มี package.json
- เครื่อง: Node v26.12.0, npm 11.20.0, pnpm 10.32.1, git 2.56, มี `ngrok` และ `cloudflared` — ไม่มี bun/yarn

**เวอร์ชันที่ใช้ (ตรวจจาก `npm view` วันที่ 2026-10-17 — pin ตามนี้)**
| package | version | หมายเหตุ |
|---|---|---|
| next | 16.4.2 | engines node >=20.9 · Turbopack เป็น default ทั้ง `next dev` และ `next({ dev })` |
| react / react-dom | 19.3.1 | มาจาก create-next-app |
| typescript | **^5 (5.9.3)** | **ห้าม** อัปเป็น 7.x — ดูเหตุผลใน Assumptions |
| socket.io / socket.io-client | 4.8.4 | |
| @line/liff | 2.31.2 | client only |
| tsx | 4.23.15 | รัน `server.ts` ทั้ง dev (`tsx watch`) และ prod |
| @next/env | 16.4.2 | โหลด `.env.local` ใน `server.ts` ก่อน Next prepare |
| tailwindcss | ^4 | มาจาก create-next-app (ใช้ utility class อย่างเดียว ไม่ต้องแก้ config) |

**ข้อเท็จจริงจากเอกสารทางการที่กระทบแผน**
- Next.js custom server (docs 2026-08): รูปแบบ `const app = next({ dev }); const handle = app.getRequestHandler(); await app.prepare(); createServer(handle).listen(port)` ยังใช้ได้ใน 16.x; `next()` รับ option `turbopack` (default true), `httpServer`, `hostname`, `port`; **ห้าม** ใช้ `output: 'standalone'` ร่วมกับ custom server; `server.ts` ไม่ผ่าน Next compiler → ต้องรันด้วย tsx เอง
- Socket.IO official guide "use with Next.js": `const httpServer = createServer(handler); const io = new Server(httpServer); httpServer.listen(port)` — ยืนยันว่า HMR websocket ของ Next กับ Socket.IO (path `/socket.io/`) อยู่บน http server เดียวกันได้
- **Next dev บล็อก cross-origin request ไปยัง dev asset** (`/_next/*`) จาก host ที่ไม่ใช่ localhost → เปิดผ่าน tunnel ใน dev mode ต้องตั้ง `allowedDevOrigins` ใน `next.config.ts` (รับ wildcard เช่น `*.ngrok-free.app`, `*.trycloudflare.com`) — หรือ demo ด้วย production mode (`npm run build && npm start`) ซึ่งไม่มีข้อจำกัดนี้
- `tsx watch` เฝ้าเฉพาะไฟล์ที่ process import และข้าม `node_modules` + hidden dirs (`.next/`) โดย default → แก้ `src/app/**` จะไม่ทำให้ server restart (Next HMR จัดการเอง) แก้ `server.ts`/`src/server/**` จะ restart ทั้ง process (ห้องใน memory หาย — ปกติ)
- `create-next-app` จะ **exit 1** ถ้า directory มีไฟล์ที่ไม่อยู่ใน allow-list (`DESIGN.md` และ `tasks/` ไม่อยู่ใน list) → ต้อง scaffold ใน temp dir แล้ว copy เข้ามา (ดู T1); negated flag ใช้ได้: `--no-cache-components`, `--no-react-compiler`, `--no-agents-md` (CLI เช็กจาก argv ตรง ๆ); ค่า default ของ `--yes` คือ cacheComponents **true** → ต้องใส่ `--no-cache-components` เอง
- Next 16.4 รองรับ TS 7 ผ่าน `tsc` CLI แล้ว แต่ create-next-app ยัง pin `typescript: ^5` และ ecosystem (eslint typescript parser, tsx) ยังอิง JS API ของ TS 5 → ใช้ ^5
- LIFF 2.31: `liff.init({ liffId, withLoginOnExternalBrowser: true }): Promise<void>`, `liff.isLoggedIn(): boolean`, `liff.login()` (ไม่ต้องเรียกใน LIFF browser — login อัตโนมัติ), `liff.getAccessToken(): string`, `liff.permanentLink.createUrlBy(url): Promise<string>` (reject ถ้า url ไม่ขึ้นต้นด้วย Endpoint URL → localhost จะ reject เสมอ), `liff.shareTargetPicker(messages, { isMultiple }): Promise<{status:'success'} | undefined>`, `liff.isApiAvailable('shareTargetPicker'): boolean` (คืน false ถ้ายังไม่ login/ token หมดอายุ), `liff.isInClient()`; ห้ามแตะ URL/`?room=` ก่อน `init()` resolve
- LINE Login API: `GET https://api.line.me/oauth2/v2.1/verify?access_token=` → `{ scope, client_id, expires_in }` (400 ถ้า token เสีย/หมดอายุ); `GET https://api.line.me/v2/profile` (Bearer) → `{ userId, displayName, pictureUrl?, statusMessage? }`
- Stateless channel access token: `POST https://api.line.me/oauth2/v3/token` `Content-Type: application/x-www-form-urlencoded` body `grant_type=client_credentials&client_id=&client_secret=` → `{ token_type:'Bearer', access_token, expires_in: 900 }` (อายุ 15 นาที, ออกได้ไม่จำกัด) — MINI App ใช้ long-lived/v2.1 token ไม่ได้
- Service Message: `POST https://api.line.me/message/v3/notifier/token` (Bearer channel token, JSON `{ liffAccessToken }`) → `{ notificationToken, expiresIn, remainingCount, sessionId }` (400 ถ้าใช้ LIFF token เดิมขอซ้ำถี่ ๆ); `POST https://api.line.me/message/v3/notifier/send?target=service` JSON `{ templateName, params, notificationToken }` → `{ notificationToken (ตัวใหม่), expiresIn, remainingCount, sessionId }`; `templateName` รูปแบบ `{name}_{lang}` เช่น `xxxx_th` ≤ 30 ตัวอักษร; `params` = object ของ string (ใส่ `{}` ถ้า template ไม่มีตัวแปร); channel ยังไม่ verified → ส่งได้เฉพาะ Developing channel ไปยังผู้ใช้ที่เป็น Admin/Tester

**กฎสำคัญที่ทุก task ต้องยึด (จาก DESIGN.md)**
1. `room:state` **ห้ามมี** `location`, `spyId`, `roles`, `reveal` จนกว่า phase จะเป็น `result` (spy เปิด devtools ต้องไม่เห็นคำตอบ) — `PublicRoomState` คือสิ่งเดียวที่ broadcast ได้
2. ผู้เล่นผูกกับ `userId` (key ของ `room.players`) ไม่ใช่ `socketId`; disconnect = `socketId: null` ยังอยู่ในห้อง; `room:join` ซ้ำด้วย userId เดิม = reconnect → อัปเดต socketId แล้วส่ง `room:state` + `game:you` ให้ใหม่
3. Timer เป็น server-authoritative (`setTimeout` ใน server) — client แค่แสดงเวลาจาก `endsAt - (serverNow - Date.now())`
4. Service Message ห้ามทำให้เกมพัง: fire-and-forget, try/catch ทุกครั้ง, log แล้วข้ามเมื่อ env ไม่ครบ / dev user / `remaining === 0` / API error
5. Server ห้ามเชื่อ userId/ชื่อจาก client (ยกเว้น `DEV_AUTH=1` ที่รับ `auth.devUser` และใส่ prefix `dev:`)
6. `@line/liff` ใช้ได้ฝั่ง client เท่านั้น → `'use client'` + `await import('@line/liff')` ใน `useEffect`
7. State ห้องอยู่ใน process ของ `server.ts` เท่านั้น — ห้ามอ่าน/แก้ `rooms` จาก Route Handler หรือ Server Component (Next อาจรันคนละ worker)

**โครงไฟล์เป้าหมาย** (อิง DESIGN.md ข้อ 8 + เพิ่มไฟล์ที่จำเป็นเพื่อแยก ownership ให้ขนานกันได้)
```
LineHackathon/
├─ server.ts                      # T1  http server: Next handler + Socket.IO + /healthz
├─ next.config.ts                 # T1  allowedDevOrigins
├─ .env.example                   # T1
├─ scripts/smoke.ts               # T6
├─ README.md                      # T9
├─ src/
│  ├─ shared/
│  │  ├─ types.ts                 # T1  contract (ห้ามแก้หลัง T1 เว้นแต่แก้ทั้งสองฝั่ง)
│  │  └─ locations.ts             # T1  สถานที่ + บทบาท
│  ├─ server/
│  │  ├─ types.ts                 # T1  Room/Player/Round/AuthedUser/TypedServer
│  │  ├─ auth.ts                  # T1 stub → T2 เต็ม
│  │  ├─ line-notify.ts           # T1 stub → T2 เต็ม
│  │  ├─ rooms.ts                 # T3
│  │  ├─ game.ts                  # T3 (+T7)
│  │  └─ handlers.ts              # T1 stub → T3 เต็ม (+T7)   registerHandlers(io)
│  ├─ lib/
│  │  ├─ game-client.ts           # T1  interface GameClient (type only)
│  │  ├─ liff.ts                  # T4 (+T8)
│  │  ├─ socket.ts                # T4
│  │  └─ use-game.ts              # T4
│  └─ app/
│     ├─ layout.tsx               # T5
│     ├─ page.tsx                 # T5
│     ├─ globals.css              # scaffold (T5 แก้ได้)
│     └─ components/
│        ├─ Game.tsx              # T5  switch ตาม phase
│        ├─ Home.tsx Lobby.tsx Discussion.tsx Voting.tsx Result.tsx SpyGuess.tsx
│        ├─ Countdown.tsx RoleCard.tsx PlayerList.tsx Button.tsx
```
เหตุผลที่เพิ่มจาก spec: `handlers.ts` แยก socket event wiring ออกจาก `server.ts` เพื่อให้ T1 ปิด `server.ts` ได้เลย, `server/types.ts` + `lib/game-client.ts` เป็น contract ภายในเพื่อให้ T2/T3 และ T4/T5 ขนานกันโดยไม่แตะไฟล์เดียวกัน

**Do-not-touch / Gotchas**
- หลัง T1 ห้าม task อื่นแก้ `src/shared/types.ts`, `src/server/types.ts`, `src/lib/game-client.ts`, `server.ts`, `package.json` — ถ้าจำเป็นจริง ให้บันทึกใน Progress log และแจ้ง Main Agent (T7/T8 เป็นข้อยกเว้นที่ระบุไว้)
- ห้ามใส่ `output: 'standalone'` ใน next.config
- ห้ามใช้ `NodeJS.Timeout`/`setTimeout` ฝั่ง client สำหรับเปลี่ยน phase
- Server code ใช้ relative import (`./src/server/...`, `../shared/types`) — client code ใช้ `@/...` ได้ (alias `@/* → src/*`)
- `.gitignore` ของ create-next-app ignore `.env*` ทั้งหมด → ต้องเพิ่ม `!.env.example`
- `next-env.d.ts` ถูก generate โดย `next build`/`next dev`/`next typegen` — ห้ามแก้มือ

## Open Questions / Assumptions
> User สั่งให้ build เลย — ไม่มีคำถามค้าง ทุกเรื่องที่ spec ไม่ระบุตัดสินใจด้วย default ด้านล่าง (user ทักท้วงได้)

**ถาม user แล้ว (resolved)**
- ❓ stack / DB → ✅ Next.js + Socket.IO, ไม่มี DB (in-memory), hackathon 2 ชม.
- ❓ LINE channel → ✅ มี MINI App channel แล้วแต่ยังไม่ verified; ยังไม่มีค่า env จริง → ต้อง build/test ได้โดยไม่มีค่าเหล่านี้

**ยังค้าง (blocking)**
- ไม่มี — ค่า env ของ LINE (`NEXT_PUBLIC_LIFF_ID`, `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`, `LINE_SERVICE_TEMPLATE`) ไม่ block task ใด เพราะทุก task verify ได้ใน dev mode; ใส่ทีหลังใน `.env.local` ได้โดยไม่ต้องแก้ code (ยกเว้น mapping ใน `buildResultParams()` ที่ต้องแก้ให้ตรง template จริง)

**Assumptions (ตัดสินใจเองด้วย default)**
- 📌 Package manager = **npm** (มากับ Node, ไม่มีปัญหา hoisting กับ Next; pnpm มีแต่ไม่จำเป็น) — ทุก verify command ใช้ `npm run …`
- 📌 Scaffold ด้วย `create-next-app@16.4.2` flags: `--ts --tailwind --eslint --app --src-dir --import-alias "@/*" --no-cache-components --no-react-compiler --skip-install --disable-git --use-npm --yes` ใน temp dir แล้ว copy กลับ (เพราะโฟลเดอร์ไม่ว่าง); ปิด Cache Components เพื่อตัดเงื่อนไข Suspense/`'use cache'` ที่ไม่จำเป็นกับแอปที่เป็น client component ล้วน; เก็บ `AGENTS.md` ที่ scaffold สร้างไว้ (ช่วย implementer)
- 📌 **TypeScript pin `^5`** (ที่ create-next-app ให้มา = 5.9.3) ไม่อัปเป็น 7.0.2 — TS 7 เป็น native port ที่ไม่มี JS compiler API; Next 16.4 รองรับผ่าน `tsc` CLI แล้วก็จริง แต่ `tsx`/typescript-eslint/`@types` ยังอิง TS 5 และไม่มีเวลาไล่ปัญหา; ความเสี่ยงศูนย์ถ้าอยู่ ^5
- 📌 รัน `server.ts` ด้วย `tsx` ทั้ง dev (`tsx watch --clear-screen=false server.ts`) และ prod (`NODE_ENV=production tsx server.ts`) — ใส่ `tsx` ใน `dependencies` (ไม่ใช่ dev) เผื่อ host บน Railway/Render; ไม่ compile server แยกด้วย `tsc` (ประหยัดเวลา) ; package ยังเป็น CommonJS (ไม่ใส่ `"type":"module"`) ตาม scaffold — tsx แปลง ESM syntax ให้เอง
- 📌 `git init` ที่ project root ใน T1 (hackathon ควรมี history) แต่ **ไม่ commit** ให้ — ปล่อย user ตัดสินใจ
- 📌 Styling = Tailwind v4 จาก scaffold, UI ภาษาไทย mobile-first (max-w-md, ปุ่มสูง ≥ 48px, font-size ≥ 16px), `lang="th"`, ไม่ใช้ component library
- 📌 **Dev mode**: server `DEV_AUTH=1` → middleware รับ `auth.devUser` (regex `^[a-z0-9_-]{1,20}$`) → user `{ userId: 'dev:'+devUser, name: devUser, isDev: true }`; client `NEXT_PUBLIC_DEV_AUTH=1` + `?devUser=alice` → ข้าม LIFF ต่อ socket ด้วย `auth.devUser`; server พิมพ์ warning banner ตอน start ถ้า `DEV_AUTH=1`; ถ้า `NODE_ENV=production` และ `DEV_AUTH=1` ให้ **refuse start** (กันลืมปิดก่อน demo — ปิดโดยตั้ง `DEV_AUTH=0`)
- 📌 เพิ่ม event `session:me` (S→C) ตอน connect เพื่อให้ client รู้ `userId`/ชื่อตัวเอง (dev mode ไม่มี LIFF profile) — spec ไม่ได้ระบุแต่ client จำเป็นต้องรู้ว่าตัวเองคือใคร/เป็น host ไหม
- 📌 Ack ของทุก C→S event ใช้รูปแบบเดียว `Ack<T> = ({ ok: true } & T) | { ok: false; error: string }` (ข้อความ error เป็นภาษาไทย แสดงบน UI ได้เลย); `room:create` ack = `{ ok: true, code }` (เป็น superset ของ `{ code }` ใน spec)
- 📌 เวลา: default `DISCUSSION_SEC=180`, `VOTE_SEC=30` (env override ได้); `game:start` รับ `{ discussionSec?, voteSec? }` clamp ให้อยู่ใน `[1, 600]` และ `[1, 120]` (ค่าต่ำ ๆ มีไว้ให้ smoke/dev ทดสอบ; UI ใน lobby ให้ host เลือกได้จาก preset 60/120/180/300 และ 30/45/60)
- 📌 Voting จบก่อนเวลาเมื่อผู้เล่นที่ **online** ทุกคนโหวตแล้ว; โหวตแล้วเปลี่ยนไม่ได้ (1 เสียง); ห้ามโหวตตัวเอง; ผลเสมอ/ไม่มีใครโหวต → spy ชนะ (ตาม spec)
- 📌 เข้าห้องระหว่างเกม (userId ใหม่, phase ≠ lobby) → ack error "เกมเริ่มแล้ว รอรอบหน้า"; reconnect (userId เดิม) ได้ทุก phase; ห้องเต็ม 8 คน; `room:leave` ใน lobby/result = ลบออกจากห้อง, ระหว่างเกม = ทำเหมือน disconnect (offline) เพื่อไม่ให้ roles/votes พัง; host leave ใน lobby → โอน host ให้คนถัดไปที่ online; ห้องว่าง → ลบ
- 📌 Room code 4 ตัวจาก `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (ตัด 0/O/1/I), client แปลงเป็นตัวพิมพ์ใหญ่ก่อนส่ง
- 📌 **Service Message**: ทำงานเฉพาะเมื่อ `LINE_CHANNEL_ID && LINE_CHANNEL_SECRET && LINE_SERVICE_TEMPLATE` ครบ และผู้เล่น `isDev === false`; mapping ตัวแปร template อยู่ที่ `buildResultParams()` ที่เดียวพร้อม comment ให้แก้ตาม template จริง (ชื่อ param ตอนนี้เป็น placeholder); ส่ง 1 ข้อความ/คน/เกม; notification token cache ตาม userId ใน memory (หายเมื่อ server restart — ผู้เล่นต้อง reconnect ด้วย LIFF token ใหม่จึงจะขอได้อีก ซึ่งเป็นพฤติกรรมที่ยอมรับได้ใน hackathon)
- 📌 P1 (spy ทายสถานที่ 15s, shareTargetPicker) อยู่ใน T7/T8 ท้ายสุด ตัดได้ แต่ **contract รองรับไว้ตั้งแต่ T1** (phase `spyGuess`, event `spy:guess`, `reveal.spyGuess`) เพื่อไม่ต้องแก้ types ทีหลัง; ก่อน T7 server จะไม่เข้า phase `spyGuess` เลย และ `spy:guess` ตอบ `{ ok:false, error:'ยังไม่รองรับ' }`
- 📌 Demo ผ่าน tunnel แนะนำ production mode (`npm run build && npm start`) — ถ้าจะใช้ dev mode ผ่าน tunnel ให้ตั้ง `ALLOWED_DEV_ORIGINS=*.ngrok-free.app,*.trycloudflare.com` (next.config อ่าน env นี้)
- 📌 สถานที่ 14 แห่ง (ภาษาไทย) แต่ละแห่ง 5–7 บทบาท; ถ้าผู้เล่นมากกว่าบทบาท ให้วนซ้ำบทบาทได้

## Verify commands (กำหนดใน T1 — ทุก task ใช้ชุดนี้)
- Typecheck: `cd /Users/earth/Playgrounds/LineHackathon && npm run typecheck` (= `tsc --noEmit`) — ครอบคลุม `server.ts`, `src/**`, `scripts/**`
- Build: `npm run build` (= `next build` — type-check ทั้งโปรเจกต์ด้วย)
- Lint (ไม่ gate แต่ควรผ่าน): `npm run lint`
- Run dev: `DEV_AUTH=1 NEXT_PUBLIC_DEV_AUTH=1 npm run dev` → `curl -s http://localhost:3000/healthz` ต้องได้ `ok` และ `curl -s "http://localhost:3000/socket.io/?EIO=4&transport=polling"` ต้องขึ้นต้นด้วย `0{"sid"`
- Smoke (completion gate): `npm run smoke` (= `tsx scripts/smoke.ts` — spawn server เองบน port 3123 ด้วย `DEV_AUTH=1`; หรือ `SMOKE_URL=http://localhost:3000 npm run smoke` ชี้ไป server ที่รันอยู่)
- Final gate ก่อนปิดงาน: `npm run typecheck && npm run build && npm run smoke`

## Tasks
> สถานะ: [ ] = ยังไม่ทำ · [x] = เสร็จ+verify ผ่าน · [!] = ติด blocker (ดูหมายเหตุ)
> ลำดับ: T1 → {T2 ∥ T3 ∥ T4 ∥ T5} → {T6 (หลัง T3) ∥ T9} → {T7 ∥ T8} (หลัง T3+T5/T4+T5) → final gate
> Task ที่ขนานกันต้องแตะเฉพาะไฟล์ใน "ไฟล์ (owner)" ของตัวเอง — ห้ามแก้ไฟล์ของ task อื่น

- [x] **T1 — Scaffold + dependencies + `server.ts` skeleton + contract ทั้งหมด** — เสร็จ 2026-10-17 (ดู Progress log)
  - ทำอะไร:
    1. Scaffold ใน temp dir แล้ว copy เข้า project root (โฟลเดอร์มี `DESIGN.md`/`tasks/` ทำให้ create-next-app exit 1):
       ```bash
       TMP=$(mktemp -d) && npx -y create-next-app@16.4.2 "$TMP/app" --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --no-cache-components --no-react-compiler --skip-install --disable-git --use-npm --yes
       cp -R "$TMP/app/." /Users/earth/Playgrounds/LineHackathon/   # "/." = copy dotfiles ด้วย
       cd /Users/earth/Playgrounds/LineHackathon && git init -q && npm install
       npm install next@16.4.2 socket.io@4.8.4 socket.io-client@4.8.4 @line/liff@2.31.2 tsx@4.23.15 @next/env@16.4.2
       ```
       ตรวจว่า `package.json` มี `typescript: ^5` (ห้ามเปลี่ยนเป็น 7) และ `next`/`react` ตรงตาราง; เพิ่ม `!.env.example` ท้าย `.gitignore`
    2. `package.json` scripts (แทนที่ของ scaffold):
       ```json
       "dev": "tsx watch --clear-screen=false server.ts",
       "build": "next build",
       "start": "NODE_ENV=production tsx server.ts",
       "typecheck": "tsc --noEmit",
       "lint": "eslint",
       "smoke": "tsx scripts/smoke.ts"
       ```
    3. `next.config.ts`:
       ```ts
       import type { NextConfig } from 'next';
       const nextConfig: NextConfig = {
         allowedDevOrigins: (process.env.ALLOWED_DEV_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean),
       };
       export default nextConfig;
       ```
    4. `.env.example` (copy เป็น `.env.local` ตอน dev):
       ```
       NEXT_PUBLIC_LIFF_ID=            # LIFF ID ของ Developing channel
       LINE_CHANNEL_ID=                # ใช้เช็ก client_id ตอน verify และขอ stateless token
       LINE_CHANNEL_SECRET=
       LINE_SERVICE_TEMPLATE=          # "Template name for API use" จาก console เช่น xxxx_th
       DEV_AUTH=0                      # 1 = server รับ auth.devUser (ปิดก่อน demo)
       NEXT_PUBLIC_DEV_AUTH=0          # 1 = client ข้าม LIFF เมื่อมี ?devUser=
       DISCUSSION_SEC=180
       VOTE_SEC=30
       PORT=3000
       ALLOWED_DEV_ORIGINS=            # เช่น *.ngrok-free.app,*.trycloudflare.com (เฉพาะ dev ผ่าน tunnel)
       ```
    5. `src/shared/types.ts` — **ใส่ตามนี้ทั้งก้อน** (contract ที่ T2–T8 ยึด):
       ```ts
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
       ```
    6. `src/shared/locations.ts` — `export interface Location { name: string; roles: string[] }`, `export const LOCATIONS: Location[]` 14 แห่งภาษาไทย (เริ่มจาก 4 ตัวอย่างใน DESIGN.md ข้อ 8 แล้วเพิ่ม ชายหาด, วัด, BTS, ตลาดนัด, โรงหนัง, ฟิตเนส, คอนเสิร์ต, ออฟฟิศ, ร้านกาแฟ, สวนสนุก) แต่ละแห่ง 5–7 บทบาท; `export const LOCATION_NAMES = LOCATIONS.map(l => l.name)`
    7. `src/server/types.ts`:
       ```ts
       import type { Server, Socket } from 'socket.io';
       import type { ClientToServerEvents, ServerToClientEvents, Phase, Winner } from '../shared/types';

       export interface AuthedUser { userId: string; name: string; pictureUrl?: string; isDev: boolean; accessToken?: string }
       export interface SocketData { user: AuthedUser; roomCode?: string }
       export type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
       export type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

       export interface Player { userId: string; name: string; pictureUrl?: string; socketId: string | null; isDev: boolean }
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
         timer?: NodeJS.Timeout;
       }
       ```
    8. Stub ที่ task อื่นจะมาเติม (ต้อง compile ผ่านและทำงานขั้นต่ำได้):
       - `src/server/auth.ts`: `export async function authMiddleware(socket: TypedSocket, next: (err?: Error) => void): Promise<void>` — ตอนนี้รองรับเฉพาะ `DEV_AUTH=1` + `auth.devUser` (ตาม Assumptions) ส่วน path accessToken ให้ `next(new Error('LINE auth ยังไม่พร้อม (T2)'))`
       - `src/server/line-notify.ts`: export signature เต็มแต่ body แค่ log:
         ```ts
         export function isServiceMessageConfigured(): boolean   // env 3 ตัวครบ
         export async function ensureNotificationToken(user: AuthedUser): Promise<void>
         export function buildResultParams(input: { playerName: string; won: boolean; isSpy: boolean; location: string; roomCode: string; link?: string }): Record<string, string>
         export async function sendResultMessage(user: Pick<AuthedUser, 'userId' | 'isDev'>, params: Record<string, string>): Promise<void>
         ```
       - `src/server/handlers.ts`: `export function registerHandlers(io: TypedServer): void` — ตอนนี้แค่ `io.on('connection', s => { s.emit('session:me', {...s.data.user โดยไม่มี accessToken}); console.log('connected', s.data.user.userId) })`
       - `src/lib/game-client.ts` (type only — T4 implement, T5 ใช้):
         ```ts
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
           shareInvite(): Promise<'shared' | 'cancelled' | 'unavailable'>; // P1: ก่อน T8 คืน 'unavailable'
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
           inviteUrl: string | null; // `${origin}/?room=CODE` (หรือ permanent link ถ้าทำได้)
           actions: GameActions;
         }
         ```
    9. `server.ts` (ไฟล์นี้จบใน T1 — task อื่นไม่แก้):
       ```ts
       import { loadEnvConfig } from '@next/env';
       import { createServer } from 'node:http';
       import next from 'next';
       import { Server } from 'socket.io';
       import { authMiddleware } from './src/server/auth';
       import { registerHandlers } from './src/server/handlers';
       import type { TypedServer } from './src/server/types';

       async function main() {
         const dev = process.env.NODE_ENV !== 'production';
         loadEnvConfig(process.cwd(), dev);   // โหลด .env.local — ต้องเป็นบรรทัดแรกของ main() และห้ามอ่าน process.env.* ที่ top-level ของโมดูลใด ๆ (import ถูก hoist)
         const port = Number(process.env.PORT ?? 3000);
         // ...
       }
       main().catch((e) => { console.error(e); process.exit(1); });
       ```
       - ผลที่ตามมา: `auth.ts`/`line-notify.ts`/`rooms.ts` ต้องอ่าน `process.env.*` **ภายในฟังก์ชัน** (lazy) ไม่ใช่ที่ top-level ของโมดูล
       - `DEV_AUTH=1` + `!dev` → `console.error` แล้ว `process.exit(1)`; `DEV_AUTH=1` + dev → พิมพ์ banner เตือน
       - `const app = next({ dev }); const handle = app.getRequestHandler(); await app.prepare();`
       - `createServer((req, res) => { if (req.url === '/healthz') { res.writeHead(200, {'content-type':'text/plain'}); res.end('ok'); return; } handle(req, res); })`
       - `const io: TypedServer = new Server(httpServer, { path: '/socket.io' }); io.use(authMiddleware); registerHandlers(io);`
       - `httpServer.listen(port, () => console.log(\`> Ready on http://localhost:${port} (dev=${dev}, DEV_AUTH=${process.env.DEV_AUTH ?? '0'})\`))` — **ต้องพิมพ์บรรทัดที่ขึ้นต้น `> Ready on` เป๊ะ** (smoke ใช้จับ)
       - ใช้ top-level `async function main()` แทน top-level await (package เป็น CJS)
    10. ลบ boilerplate ใน `src/app/page.tsx` ให้เหลือหน้า placeholder สั้น ๆ "Spy Party (T5)" (T5 จะเขียนทับ) และปล่อย `layout.tsx` ตาม scaffold
  - ไฟล์ (owner): ทุกไฟล์จาก scaffold, `package.json`, `next.config.ts`, `.env.example`, `.gitignore`, `server.ts`, `src/shared/types.ts`, `src/shared/locations.ts`, `src/server/types.ts`, `src/server/auth.ts` (stub), `src/server/line-notify.ts` (stub), `src/server/handlers.ts` (stub), `src/lib/game-client.ts`
  - เดินตาม pattern: Next custom server docs + Socket.IO "use with Next.js" guide (สรุปใน Context)
  - ขึ้นกับ: — · ขนานได้กับ: — (ทุก task รอ T1)
  - verify: `npm run typecheck && npm run build` ผ่าน; `DEV_AUTH=1 npm run dev` แล้ว `curl -s localhost:3000/healthz` = `ok`, `curl -s "localhost:3000/socket.io/?EIO=4&transport=polling"` ขึ้นต้น `0{"sid"`; `NODE_ENV=production DEV_AUTH=1 npm start` ต้อง exit 1 พร้อมข้อความ; หยุด server หลังทดสอบ

- [x] **T2 — Server: LINE auth middleware + Service Message notifier** — เสร็จ 2026-10-17 (ดู Progress log)
  - ทำอะไร:
    - `src/server/auth.ts` (เติม stub): 
      - `DEV_AUTH=1` และมี `auth.devUser` ตรง regex → `socket.data.user = { userId: 'dev:'+devUser, name: devUser, isDev: true }` → `next()`
      - มิฉะนั้นต้องมี `auth.accessToken` (string) ไม่งั้น `next(new Error('ไม่มี access token'))`
      - `GET https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(token)}` → ถ้าไม่ 200 หรือ `client_id !== process.env.LINE_CHANNEL_ID` หรือ `expires_in <= 0` → `next(new Error('access token ไม่ถูกต้อง'))`; ถ้า `LINE_CHANNEL_ID` ว่าง → `next(new Error('server ยังไม่ได้ตั้งค่า LINE_CHANNEL_ID'))`
      - `GET https://api.line.me/v2/profile` header `Authorization: Bearer ${token}` → `{ userId, displayName, pictureUrl? }` → `socket.data.user = { userId, name: displayName, pictureUrl, isDev: false, accessToken: token }`
      - ใช้ global `fetch` ของ Node, timeout 5s ด้วย `AbortSignal.timeout(5000)`, log error แบบไม่พิมพ์ token
    - `src/server/line-notify.ts` (เติม stub ตาม signature ใน T1 ข้อ 8):
      - module state: `let channelToken: { token: string; expiresAt: number } | null`, `const notifyTokens = new Map<string, { token: string; remaining: number }>()`
      - `getChannelToken()`: cache จนถึง `expiresAt - 60_000`; ขอใหม่ด้วย `POST https://api.line.me/oauth2/v3/token` (`application/x-www-form-urlencoded`: `grant_type=client_credentials`, `client_id`, `client_secret`) → `{ access_token, expires_in }`
      - `ensureNotificationToken(user)`: return ทันทีถ้า `user.isDev || !isServiceMessageConfigured() || !user.accessToken || notifyTokens.has(user.userId)`; มิฉะนั้น `POST https://api.line.me/message/v3/notifier/token` (Bearer channel token, JSON `{ liffAccessToken: user.accessToken }`) → เก็บ `{ token: notificationToken, remaining: remainingCount }`; ทุก error → `console.warn('[line-notify] token skip', userId, status/err)` ไม่ throw
      - `buildResultParams(input)`: คืน `Record<string,string>` — **ที่เดียว** ที่ map ตัวแปร template; ใส่ comment หัวฟังก์ชันว่า "แก้ key ให้ตรงกับตัวแปรของ template ที่เลือกใน LINE Developers Console → Service Message" ค่าเริ่มต้น (placeholder) เช่น `{ title: won ? 'คุณชนะ!' : 'คุณแพ้', body: \`ห้อง ${roomCode} · ${isSpy ? 'คุณเป็น Spy' : 'สถานที่คือ ' + location}\`, ...(link ? { link } : {}) }` — ค่าต้องเป็น string ล้วน ห้ามมีโฆษณา/ชวนเล่น
      - `sendResultMessage(user, params)`: skip+log ถ้า dev / ไม่ configured / ไม่มี token / `remaining === 0`; `POST https://api.line.me/message/v3/notifier/send?target=service` JSON `{ templateName: process.env.LINE_SERVICE_TEMPLATE, params, notificationToken }` → อัปเดต `notifyTokens` ด้วย `notificationToken`/`remainingCount` ที่ตอบกลับ; ทุก error → warn ไม่ throw (ห้ามทำให้เกมพัง)
  - ไฟล์ (owner): `src/server/auth.ts`, `src/server/line-notify.ts`
  - เดินตาม pattern: DESIGN.md ข้อ 4 และ 7; endpoint/field ตาม Context
  - ขึ้นกับ: T1 · ขนานได้กับ: T3, T4, T5
  - verify: `npm run typecheck`; `DEV_AUTH=1 npm run dev` แล้ว `node -e "const {io}=require('socket.io-client');const s=io('http://localhost:3000',{auth:{devUser:'alice'}});s.on('session:me',m=>{console.log(m);process.exit(0)});s.on('connect_error',e=>{console.error(e.message);process.exit(1)})"` ได้ `{ userId: 'dev:alice', name: 'alice', isDev: true }`; รันซ้ำด้วย `auth:{accessToken:'bogus'}` ต้องได้ `connect_error` ข้อความไทย (ไม่ใช่ crash); `LINE_CHANNEL_ID` ว่าง + accessToken → error "ยังไม่ได้ตั้งค่า"

- [x] **T3 — Server: rooms store + game engine + socket handlers** — เสร็จ 2026-10-17 (ดู Progress log)
  - ทำอะไร:
    - `src/server/rooms.ts`:
      ```ts
      export const rooms: Map<string, Room>
      export function generateCode(): string                     // 4 ตัวจาก ROOM_CODE_ALPHABET, unique
      export function createRoom(host: AuthedUser, socketId: string): Room   // settings จาก env DISCUSSION_SEC/VOTE_SEC หรือ LIMITS.DEFAULT_*
      export function joinRoom(code: string, user: AuthedUser, socketId: string): { room: Room; reconnected: boolean } | { error: string }
        // ไม่พบห้อง → 'ไม่พบห้องนี้'; userId มีอยู่ → อัปเดต socketId/name/pictureUrl, reconnected=true (ทุก phase)
        // userId ใหม่: phase !== 'lobby' → 'เกมเริ่มแล้ว รอรอบหน้า'; ครบ MAX_PLAYERS → 'ห้องเต็ม'
      export function leaveRoom(room: Room, userId: string): void  // lobby/result ลบ; phase อื่นแค่ socketId=null; host ออกใน lobby → โอน host ให้ online คนแรก; ห้องว่าง → clearTimer + rooms.delete
      export function markOffline(room: Room, socketId: string): void
      export function toPublicState(room: Room): PublicRoomState   // กฎข้อ 1: accusedId เฉพาะ spyGuess/result, reveal เฉพาะ result, ห้ามมี key อื่นจาก round
      ```
    - `src/server/game.ts` (pure logic + timer; ไม่ import socket.io):
      ```ts
      export interface EngineHooks { broadcast(room: Room): void; sendCards(room: Room): void; onResult(room: Room): void }
      export function startRound(room: Room, opts: { discussionSec?: number; voteSec?: number }, hooks: EngineHooks): Ack
        // ตรวจ phase lobby/result, ผู้เล่น >= MIN_PLAYERS (นับทุกคนในห้อง), clamp เวลา; สุ่ม location จาก LOCATIONS, spy 1 คน, แจก roles (shuffle, วนซ้ำถ้าไม่พอ); phase='discussion', endsAt; setTimer → openVote; hooks.broadcast + hooks.sendCards
      export function openVote(room: Room, hooks: EngineHooks): Ack       // discussion → voting, endsAt = now + voteSec*1000, setTimer → finishVoting
      export function castVote(room: Room, voterId: string, targetId: string, hooks: EngineHooks): Ack
        // phase voting, voter ในห้อง, target ในห้องและ != voter ('ห้ามโหวตตัวเอง'), ยังไม่เคยโหวต ('โหวตแล้ว'); ถ้าทุกคนที่ online โหวตครบ → finishVoting ทันที
      export function finishVoting(room: Room, hooks: EngineHooks): void   // resolveVotes → round.result/accusedId, phase='result', endsAt undefined, clearTimer, broadcast, hooks.onResult
      export function spyGuess(room: Room, userId: string, location: string, hooks: EngineHooks): Ack  // T3: คืน { ok:false, error:'ยังไม่รองรับ' } (T7 implement)
      export function resetRoom(room: Room, hooks: EngineHooks): Ack       // phase result (หรือ discussion/voting ถ้า host ต้องการยกเลิก) → lobby, round=undefined, clearTimer, broadcast
      export function cardFor(room: Room, userId: string): PrivateCard | null // null ถ้าไม่มี round
      export function resolveVotes(votes: Map<string, string>, spyId: string): { accusedId: string | null; winner: Winner }  // pure: สูงสุดคนเดียว → accused; เสมอ/ว่าง → null + 'spy'; accused===spy → 'citizens' else 'spy'
      export function clearTimer(room: Room): void
      ```
      ทุก transition ต้อง `clearTimer` ก่อนตั้งใหม่ และ callback ของ timer ต้องเช็กว่า `room.phase` ยังเป็น phase ที่คาดไว้ (กัน timer เก่ายิงหลัง reset)
    - `src/server/handlers.ts` (แทน stub): `registerHandlers(io)`:
      - `io.on('connection')`: emit `session:me` (ไม่ส่ง accessToken); สร้าง `hooks` = `{ broadcast: r => io.to(r.code).emit('room:state', toPublicState(r)), sendCards: r => for each player ที่ socketId → io.to(socketId).emit('game:you', cardFor(r, userId)!), onResult: r => void sendResults(r) }`
      - `room:create` → createRoom → `socket.join(code)`, `socket.data.roomCode = code`, `void ensureNotificationToken(user)`, broadcast, ack `{ ok:true, code }`
      - `room:join` → upper-case/trim code → joinRoom → error → ack; สำเร็จ → join channel, set roomCode, ensureNotificationToken, broadcast; ถ้า `reconnected` และมี round → emit `game:you` ให้ socket นี้; ack `{ ok:true, code }`
      - `room:leave` → leaveRoom + `socket.leave`, clear roomCode, broadcast (ถ้าห้องยังอยู่)
      - `game:start` / `game:openVote` / `game:reset` → ต้องเป็น host (`room.hostId === user.userId`) ไม่งั้น `'เฉพาะ host เท่านั้น'`
      - `vote:cast` → castVote; `spy:guess` → spyGuess
      - `disconnect` → markOffline + broadcast
      - helper `getRoom(socket)` คืน room จาก `socket.data.roomCode` หรือ ack `'คุณยังไม่ได้อยู่ในห้อง'`; ทุก handler ห่อ try/catch → ack `{ ok:false, error:'เกิดข้อผิดพลาด' }` + console.error
      - `sendResults(room)`: วนผู้เล่นทุกคน: `won = (winner === 'spy') === (userId === spyId)` → `sendResultMessage(player, buildResultParams({...}))` แบบ `void`/`Promise.allSettled` — ห้าม await ใน flow เกม
  - ไฟล์ (owner): `src/server/rooms.ts`, `src/server/game.ts`, `src/server/handlers.ts`
  - เดินตาม pattern: DESIGN.md ข้อ 2, 5, 6; กฎสำคัญข้อ 1–3; ใช้ stub signature ของ `line-notify.ts` จาก T1 (ห้ามแก้ไฟล์นั้น)
  - ขึ้นกับ: T1 · ขนานได้กับ: T2, T4, T5
  - verify: `npm run typecheck`; `DEV_AUTH=1 DISCUSSION_SEC=2 VOTE_SEC=2 npm run dev` แล้วใช้ `node -e` กับ socket.io-client 3 ตัว (devUser alice/bob/carol) ทำ create → join → start → เช็กว่า `game:you` มี spy 1 คน และ `room:state` phase เปลี่ยนเป็น voting เองใน ~2s แล้วเป็น result ใน ~2s ถัดมา พร้อม `reveal` (T6 จะทำเป็น script ถาวร — ที่นี่แค่ยืนยันด้วยมือว่าทำงาน)

- [x] **T4 — Client lib: LIFF/dev auth + socket singleton + `useGame()` hook** — เสร็จ 2026-10-17 (ดู Progress log)
  - ทำอะไร:
    - `src/lib/liff.ts` (`'use client'` ไม่จำเป็นในไฟล์ lib แต่ห้าม import `@line/liff` แบบ static — ใช้ `await import('@line/liff')` เสมอ):
      ```ts
      export type AuthResult = { mode: 'dev'; devUser: string } | { mode: 'liff'; accessToken: string };
      export async function authenticate(): Promise<AuthResult>
        // ถ้า process.env.NEXT_PUBLIC_DEV_AUTH === '1' และ URL มี ?devUser= → { mode:'dev' }
        // มิฉะนั้น: ไม่มี NEXT_PUBLIC_LIFF_ID → throw Error('ยังไม่ได้ตั้งค่า NEXT_PUBLIC_LIFF_ID (หรือเปิด dev mode ด้วย ?devUser=)')
        // const liff = (await import('@line/liff')).default; await liff.init({ liffId, withLoginOnExternalBrowser: true });
        // if (!liff.isLoggedIn()) { liff.login(); await new Promise(() => {}) /* redirect */ }
        // const accessToken = liff.getAccessToken(); if (!accessToken) throw …; return { mode:'liff', accessToken }
      export function readInviteCode(): string | null   // อ่าน ?room= จาก window.location — เรียกหลัง authenticate() resolve เท่านั้น (LIFF redirect ผ่าน liff.state ก่อน)
      export async function createInviteUrl(code: string): Promise<string>
        // base = `${window.location.origin}/?room=${code}`; ใน mode liff พยายาม liff.permanentLink.createUrlBy(base) (try/catch → fallback base)
      export async function shareInvite(code: string): Promise<'shared' | 'cancelled' | 'unavailable'>   // T4: คืน 'unavailable' เสมอ (T8 implement)
      ```
    - `src/lib/socket.ts`:
      ```ts
      import { io, type Socket } from 'socket.io-client';
      export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
      let socket: GameSocket | null = null;
      export function connectSocket(auth: { accessToken?: string; devUser?: string }): GameSocket  // สร้างครั้งเดียว (path '/socket.io', reconnection: true, reconnectionDelayMax: 3000); ถ้ามีอยู่แล้วให้ disconnect ตัวเก่าก่อน
      export function getSocket(): GameSocket | null
      export function withAck<T extends Ack<unknown>>(run: (ack: (r: T) => void) => void, timeoutMs = 8000): Promise<T | { ok: false; error: string }>
        // ใช้: withAck<Ack<{ code: string }>>(ack => socket.emit('room:create', ack)); timeout → { ok:false, error:'server ไม่ตอบสนอง' }
      ```
    - `src/lib/use-game.ts` (`'use client'`): `export function useGame(): GameClient` (type จาก `@/lib/game-client`):
      - mount: `authenticate()` → `connectSocket(...)`; `status` ไล่ `booting → connecting → ready`; error → `status:'error'` + ข้อความ
      - listeners: `session:me` → `me`; `room:state` → `room` + คำนวณ `offset = state.serverNow - Date.now()`; ถ้า `phase === 'lobby'` → `card = null`; `game:you` → `card`
      - `connect` (รวม reconnect): ถ้ามี `roomCodeRef` → emit `room:join` ซ้ำอัตโนมัติ; ครั้งแรกหลัง `session:me` ถ้า `readInviteCode()` มีค่าและยังไม่อยู่ในห้อง → `joinRoom(code)` อัตโนมัติ
      - `now`: `setInterval` 250ms อัปเดต `Date.now() + offset` เฉพาะเมื่อ `room?.endsAt` มีค่า (ไม่งั้นหยุด interval)
      - `isHost = !!me && !!room && room.hostId === me.userId`; `isDev = me?.isDev ?? false`; `inviteUrl` คำนวณเมื่อ `room.code` เปลี่ยน (ผ่าน `createInviteUrl`)
      - `actions`: ห่อทุก event ด้วย `withAck`; `createRoom`/`joinRoom` สำเร็จ → set `roomCodeRef`; `leaveRoom` → clear ref + `room=null, card=null`; `shareInvite` → `liff.shareInvite(room.code)`
      - ใช้ `useRef` สำหรับ socket/roomCode, cleanup listener ตอน unmount; ห้ามอ่าน `window` นอก effect (SSR)
  - ไฟล์ (owner): `src/lib/liff.ts`, `src/lib/socket.ts`, `src/lib/use-game.ts`
  - เดินตาม pattern: DESIGN.md ข้อ 4, 11; Socket.IO Next.js guide (client singleton `'use client'`); `GameClient` interface จาก T1 (ห้ามแก้)
  - ขึ้นกับ: T1 · ขนานได้กับ: T2, T3, T5
  - verify: `npm run typecheck`; `npm run build` ผ่าน (ยืนยันว่า `@line/liff` ไม่ถูก import ตอน SSR); ชั่วคราวใช้ `src/app/page.tsx` placeholder ของ T1 ไม่ได้ทดสอบ runtime — runtime ยืนยันใน T5/final gate

- [x] **T5 — Client UI: page/layout + components ทุก phase (ภาษาไทย, mobile-first)** — เสร็จ 2026-10-17 (ดู Progress log)
  - ทำอะไร:
    - `src/app/layout.tsx`: `<html lang="th">`, `metadata = { title: 'Spy Party', description: 'เกมจับสายลับกับเพื่อนบน LINE' }`, `viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 }`, body `bg-slate-950 text-slate-50 min-h-dvh`
    - `src/app/page.tsx` (server component): `export default function Page() { return <Game /> }` (import จาก `./components/Game`)
    - `src/app/components/Game.tsx` (`'use client'`): `const game = useGame()`; แสดงตาม `status`: `booting/connecting` → spinner "กำลังเชื่อมต่อ…"; `error` → การ์ด error + ปุ่ม "ลองใหม่" (`location.reload()`); `ready` และ `!room` → `<Home>`; มี room → switch `room.phase`: `lobby` → `<Lobby>`, `discussion` → `<Discussion>`, `voting` → `<Voting>`, `spyGuess` → `<SpyGuess>`, `result` → `<Result>`; ทุก component รับ prop `game: GameClient`; แสดง banner เล็กด้านบนเมื่อ `game.isDev` ("DEV MODE · {me.name}")
    - `Home.tsx`: ชื่อ/avatar ของ `me`; ปุ่มใหญ่ "สร้างห้อง"; input โค้ด 4 ตัว (`maxLength=4`, `autoCapitalize="characters"`, uppercase อัตโนมัติ, `inputMode="text"`) + ปุ่ม "เข้าห้อง"; แสดง error จาก ack ใต้ฟอร์ม; กำลังทำงาน → disable ปุ่ม
    - `Lobby.tsx`: room code ตัวใหญ่ + ปุ่ม "คัดลอกโค้ด" (`navigator.clipboard`, fallback เลือกข้อความ) + ปุ่ม "ชวนเพื่อน" (เรียก `actions.shareInvite()` → ถ้า `'unavailable'` ให้ copy `inviteUrl` แทนแล้ว toast "คัดลอกลิงก์แล้ว"); `<PlayerList>` (avatar/ตัวอักษรแรก, badge "host", จุดสถานะ online); host เห็น select เวลาคุย (60/120/180/300 วินาที) และเวลาโหวต (30/45/60) ค่าเริ่มต้นจาก `room.settings`; ปุ่ม "เริ่มเกม" (host เท่านั้น, disabled ถ้า `< 3` คนพร้อม hint "ต้องมีอย่างน้อย 3 คน"); คนอื่นเห็น "รอ host เริ่มเกม"; ปุ่ม "ออกจากห้อง"
    - `Discussion.tsx`: `<Countdown endsAt now>` ใหญ่; `<RoleCard card>`; `<PlayerList>`; host มีปุ่ม "เปิดโหวตเลย"; ข้อความแนะนำ "ผลัดกันถามตอบเพื่อหาว่าใครเป็น Spy"
    - `RoleCard.tsx`: การ์ดซ่อนเนื้อหา (blur) จนกว่าจะกดค้าง (`onPointerDown` → show, `onPointerUp/Leave/Cancel` → hide, `touch-action: none`, `select-none`); spy → "คุณคือ SPY" + รายชื่อสถานที่ทั้งหมด (grid เล็ก); citizen → สถานที่ + บทบาท; ถ้า `card === null` → "กำลังรับการ์ด…"
    - `Voting.tsx`: Countdown; รายชื่อผู้เล่น (ยกเว้นตัวเอง) เป็นปุ่มใหญ่ โหวตแล้ว → ปุ่ม disabled + "โหวตแล้ว"; แสดงเครื่องหมายใครโหวตแล้ว (`hasVoted`); error จาก ack
    - `Result.tsx`: banner ผู้ชนะ ("ฝ่ายพลเมืองชนะ!" / "Spy ชนะ!") พร้อมสีต่างกัน; "Spy คือ {name}", "สถานที่: {location}", ถ้ามี `reveal.spyGuess` แสดง "Spy ทายว่า … (ถูก/ผิด)"; ตารางโหวต (ใครโหวตใคร) จาก `reveal.votes`; `accusedId === null` → "ไม่มีใครถูกจับ (เสมอ)"; host ปุ่ม "เล่นอีกรอบ" (`actions.reset()`), คนอื่น "รอ host"; ปุ่ม "ออกจากห้อง"
    - `SpyGuess.tsx` (P1 UI ทำไว้เลย เบา ๆ): Countdown; ถ้า `me.userId === room.accusedId` → "คุณถูกจับแล้ว! ทายสถานที่ให้ถูกเพื่อชนะ" + ปุ่มรายชื่อสถานที่จาก `card` (isSpy → `locations`) → `actions.spyGuess(name)`; คนอื่น → "{name} ถูกจับแล้ว กำลังทายสถานที่…"
    - `Countdown.tsx`: props `{ endsAt?: number; now: number }` → `mm:ss` จาก `Math.max(0, endsAt - now)`; `< 10s` สีแดง
    - `PlayerList.tsx`, `Button.tsx` (variant primary/secondary/danger, `min-h-12 text-lg rounded-xl`, disabled style)
    - ทุก component ภาษาไทย, ไม่มี emoji ในโค้ด UI ไม่จำเป็น, layout `max-w-md mx-auto p-4 flex flex-col gap-4`
  - ไฟล์ (owner): `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/app/components/**`
  - เดินตาม pattern: DESIGN.md ข้อ 2 (flow) และ 10 (UI: การ์ดกดค้าง, นับถอยหลัง, หน้าโหวต, หน้าเฉลย); ใช้ `GameClient` จาก `@/lib/game-client` และ `useGame` จาก `@/lib/use-game` (T4 — ถ้า T4 ยังไม่เสร็จ ให้ compile กับ interface ไปก่อน runtime จะยืนยันทีหลัง)
  - ขึ้นกับ: T1 · ขนานได้กับ: T2, T3, T4 (runtime ต้องรอ T3+T4)
  - verify: `npm run typecheck && npm run build`; เมื่อ T3+T4 เสร็จ: `DEV_AUTH=1 NEXT_PUBLIC_DEV_AUTH=1 DISCUSSION_SEC=20 VOTE_SEC=15 npm run dev` เปิด 3 tab `/?devUser=alice|bob|carol` (ย่อจอกว้าง 390px) เล่นครบ flow + ปิด/เปิด tab bob ระหว่าง discussion แล้วกลับเข้าห้องเดิมได้การ์ดเดิม

- [x] **T6 — `scripts/smoke.ts`: automated end-to-end ผ่าน socket (completion gate)**
  - ทำอะไร: เขียน `scripts/smoke.ts` รันด้วย `npm run smoke` (ไม่ต้องมีมือถือ/LINE/เบราว์เซอร์):
    - Setup: ถ้า `process.env.SMOKE_URL` มี → ใช้ server นั้น; ไม่งั้น `spawn('node_modules/.bin/tsx', ['server.ts'], { env: { ...process.env, NODE_ENV: 'development', DEV_AUTH: '1', NEXT_PUBLIC_DEV_AUTH: '1', PORT: '3123', DISCUSSION_SEC: '180', VOTE_SEC: '30' }, stdio: ['ignore','pipe','pipe'] })` รอ stdout มีบรรทัดขึ้นต้น `> Ready on` (timeout 90s) → url `http://localhost:3123`; `finally` → `child.kill('SIGTERM')`; process exit code 0/1
    - helpers: `connect(devUser)` → `io(url, { auth: { devUser }, transports: ['websocket'] })` รอ `connect` + `session:me`; `emitAck(socket, event, payload?)` → Promise; `waitFor(socket, pred: (s: PublicRoomState) => boolean, label, timeoutMs = 10_000)` รอ `room:state` ที่ตรงเงื่อนไข; ทุก socket เก็บ `room:state` ทุกอันลง array `allStates` (พร้อม `phase`) และ `game:you` ล่าสุดต่อ user; ใช้ `node:assert/strict`; log แต่ละ step `[smoke] ✓ …`
    - Scenario รอบ 1:
      1. alice/bob/carol connect; `me.userId` = `dev:alice` ฯลฯ
      2. alice `room:create` → `ok`, `code` ยาว 4 และอยู่ใน alphabet; bob, carol `room:join` → ok; `room:join` โค้ดมั่ว `ZZZZ` → `ok:false`
      3. ทุกคนเห็น state phase `lobby`, 3 players, `hostId === dev:alice`
      4. bob `game:start` → `ok:false` (ไม่ใช่ host); alice `game:start { discussionSec: 60, voteSec: 2 }` → ok → รอ phase `discussion` ที่ `endsAt > serverNow`
      5. ทุกคนได้ `game:you` ภายใน 3s: นับ `isSpy===true` = 1 คน; อีก 2 คน `location` เท่ากัน และ `role` เป็น string ไม่ว่าง; `locations` ของ spy มี location จริงอยู่ด้วย
      6. Reconnect: bob `disconnect()` → รอ state ที่ bob `online=false`; bob connect ใหม่ (devUser เดิม) → `room:join` → ok → ได้ `game:you` ที่ deep-equal การ์ดเดิม → state bob `online=true`
      7. bob `game:openVote` → `ok:false`; alice `game:openVote` → ok → phase `voting`
      8. bob `vote:cast { targetId: dev:bob }` → `ok:false` (โหวตตัวเอง); ทุกคน (รวม spy) โหวตให้ spy → รอ phase `result` (ต้องมาทันทีเพราะครบทุกคน ไม่ต้องรอ 2s — ยืนยันว่า `endsAt` ไม่มี)
      9. `reveal.spyId` = spy ที่ smoke รู้, `reveal.location` = location จากการ์ด, `reveal.winner === 'citizens'`, `accusedId === spyId`, `reveal.votes` มี 3 entry
      10. alice `game:reset` → phase `lobby`, ไม่มี `reveal`/`accusedId`
    - Scenario รอบ 2 (timer + เสมอ): alice `game:start { discussionSec: 1, voteSec: 1 }` → รอ phase `voting` ภายใน 4s โดยไม่มีใครส่งอะไร → ไม่โหวต → รอ phase `result` ภายใน 4s → `winner === 'spy'`, `accusedId === null`
    - Secrecy check (ท้ายสุด): สำหรับทุก state ใน `allStates` ที่ `phase !== 'result'`: `JSON.stringify(s)` ต้องไม่มี `"reveal"`, `"spyId"`, `"location"`, `"roles"` และไม่มีข้อความ location จริงของทั้งสองรอบ
    - สรุป `[smoke] PASS` / `[smoke] FAIL: …` + exit code
  - ไฟล์ (owner): `scripts/smoke.ts`
  - เดินตาม pattern: contract ใน `src/shared/types.ts` (import type ได้); DESIGN.md ข้อ 5
  - ขึ้นกับ: T1, T3 (ต้องการ T2 เฉพาะ dev path ซึ่ง T1 stub มีแล้ว) · ขนานได้กับ: T4, T5, T9
  - verify: `npm run smoke` → exit 0 และพิมพ์ `[smoke] PASS`; `npm run typecheck` ผ่าน (ไฟล์อยู่ใน include ของ tsconfig)

- [x] **T7 — P1: Spy ที่ถูกจับทายสถานที่ (phase `spyGuess` 15s)** — เสร็จ 2026-10-17 — ตัดได้ถ้าเวลาไม่พอ
  - ทำอะไร:
    - `src/server/game.ts`: ใน `finishVoting` ถ้า `accusedId === spyId` → แทนที่จะไป result ให้ `phase='spyGuess'`, `round.accusedId`, `endsAt = now + SPY_GUESS_SEC*1000`, timer → `resolveSpyGuess(room, null)`; implement `spyGuess(room, userId, location, hooks)`: phase ต้องเป็น `spyGuess` และ `userId === spyId` ไม่งั้น error; location ต้องอยู่ใน `LOCATION_NAMES`; → `resolveSpyGuess(room, location)`: `correct = location === round.location`; `result = { accusedId, winner: correct ? 'spy' : 'citizens', spyGuess: { location, correct } }` (timeout → ไม่มี spyGuess, winner 'citizens'); phase `result`, broadcast, onResult
    - `src/server/rooms.ts` `toPublicState`: phase `spyGuess` ใส่ `accusedId` + `endsAt` (ยังห้ามมี location/reveal)
    - `src/server/handlers.ts`: `spy:guess` ต่อเข้า `spyGuess()` (ถ้ายังไม่ได้ต่อ)
    - `scripts/smoke.ts`: เพิ่มรอบ 3: ทุกคนโหวต spy → รอ phase `spyGuess` (`accusedId === spyId`, state ไม่มี location) → คนที่ไม่ใช่ spy ส่ง `spy:guess` → `ok:false` → spy ส่ง location ผิด (เลือกจาก `locations` ที่ != จริง) → phase `result` `winner==='citizens'`, `reveal.spyGuess.correct === false`; reset
    - UI: `SpyGuess.tsx` ทำไว้แล้วใน T5 — ตรวจว่าทำงานจริง, ปรับถ้าจำเป็น
  - ไฟล์ (owner): `src/server/game.ts`, `src/server/rooms.ts`, `src/server/handlers.ts`, `scripts/smoke.ts`, `src/app/components/SpyGuess.tsx`
  - ขึ้นกับ: T3, T5, T6 · ขนานได้กับ: T8, T9
  - verify: `npm run typecheck && npm run smoke` (รวมรอบ 3) ผ่าน; เล่น 3 tab ให้ spy ถูกจับแล้วเห็นหน้า "ทายสถานที่"

- [ ] **T8 — P1: ระบบเชิญเพื่อน** → **ย้ายไปทำตาม `tasks/2026-10-17-invite-friends/TASK.md` (I0–I6)** ซึ่งแทนที่แผนเดิมทั้งหมด (ลิงก์ + auto-join, shareTargetPicker แบบ Flex, QR, ผู้เล่น 1 คน 1 ห้อง)
  - T4 ทำ `liff.ts` ตามแผนเดิมไปก่อนได้ I1 จะเปลี่ยน `createInviteUrl` ให้ใช้สูตร permanent link แทน `createUrlBy`
  - ขึ้นกับ: T3, T4, T5 (+T6 สำหรับ I5) · ขนานได้กับ: T7, T9

- [x] **T9 — README.md** — เสร็จ 2026-10-17 (ดู Progress log)
  - ทำอะไร: เขียน `README.md` สั้น (≤ 120 บรรทัด) ภาษาไทย หัวข้อ:
    1. สิ่งที่ต้องมี (Node ≥ 20.9, npm) และ `cp .env.example .env.local`
    2. รัน dev: `npm run dev` (port 3000), `npm run build && npm start` (production)
    3. Dev mode หลาย tab: ตั้ง `DEV_AUTH=1 NEXT_PUBLIC_DEV_AUTH=1` (+ `DISCUSSION_SEC`/`VOTE_SEC` สั้น ๆ) เปิด `http://localhost:3000/?devUser=alice` / `bob` / `carol`; **ปิดก่อน demo** (server จะไม่ยอม start ถ้า `NODE_ENV=production` + `DEV_AUTH=1`)
    4. Smoke test: `npm run smoke` และ `SMOKE_URL=…`
    5. เปิด tunnel: `ngrok http 3000` (แนะนำ static domain เพราะ URL เปลี่ยนทุกครั้ง) หรือ `cloudflared tunnel --url http://localhost:3000`; ถ้าใช้ dev mode ผ่าน tunnel ให้ตั้ง `ALLOWED_DEV_ORIGINS=*.ngrok-free.app,*.trycloudflare.com` (ไม่งั้น Next dev บล็อก asset); แนะนำ demo ด้วย production mode
    6. ตั้งค่า LINE Developers Console — ยก checklist จาก DESIGN.md ข้อ 9 มาทั้งหมด (Endpoint URL = tunnel URL, scope `profile` + `chat_message.write`, เปิด shareTargetPicker, เพิ่ม Service Message template ภาษาไทยแล้วจด "Template name for API use" ใส่ `LINE_SERVICE_TEMPLATE`, เพิ่มทุกคนเป็น Tester) + ชี้ว่าต้องแก้ `buildResultParams()` ใน `src/server/line-notify.ts` ให้ตรงตัวแปรของ template
    7. ข้อจำกัด: in-memory → รัน 1 instance เท่านั้น (ห้าม Vercel/serverless), restart = ห้องหาย; Service Message ส่งได้เฉพาะ Admin/Tester จนกว่า channel จะ verified
  - ไฟล์ (owner): `README.md`
  - ขึ้นกับ: T1 · ขนานได้กับ: T2–T8 (ควรทำหลัง T6 เพื่อให้ script ตรงของจริง)
  - verify: อ่านทวนว่า script/env ทุกตัวที่อ้างถึงมีจริงใน `package.json`/`.env.example` (`grep -o '"[a-z:]*":' package.json`)

## Out of scope (รอบนี้ไม่ทำ)
- Database / persistence / หลาย instance (ตาม spec: in-memory, 1 instance)
- Deploy จริง (Railway/Render/Fly) — README บอกแค่ข้อจำกัด
- โอน host อัตโนมัติเมื่อ host หลุดระหว่างเกม (ทำเฉพาะกรณี host กด leave ใน lobby)
- หลายรอบสะสมคะแนน, ประวัติเกม, แชทในแอป, เสียง/แอนิเมชัน
- Unit test framework (ใช้ smoke script + typecheck/build เป็น gate แทน)
- ทดสอบ Service Message/shareTargetPicker บนมือถือจริง — ทำได้หลังมีค่า env และตั้งค่า console (นอกเหนือ build นี้)
- i18n ภาษาอื่นนอกจากไทย

## Progress log (Main Agent อัปเดตระหว่าง build)
- **T1 [x]** verify ผ่านครบ (typecheck, build, lint, healthz, socket.io polling, dev auth `session:me`, prod+DEV_AUTH exit 1, SIGTERM ปิด process tree หมด). จุดที่ต่างจากแผน — **task ถัดไปต้องยึดตามนี้**:
  - `npm run typecheck` = `next typegen && tsc --noEmit` (layout.tsx ใช้ global `LayoutProps` ที่ Next generate)
  - `next.config.ts` เก็บ `turbopack.rules` (`@tailwindcss/turbopack`) ของ scaffold ไว้ + เพิ่ม `allowedDevOrigins` — ไม่มี postcss config
  - `server.ts` ใช้ Socket.IO `destroyUpgrade: false` (กัน HMR websocket ของ Next หลุด) + `handle().catch` → 500
  - **ห้าม** เพิ่ม catch-all route ที่ root (`[...slug]`) — dev upgrade handler ของ Next จะ `socket.end()` ใส่ `/socket.io`
  - สถานที่ "BTS" ใช้ชื่อ "รถไฟฟ้า BTS"; `README.md` ตอนนี้เป็น boilerplate ของ scaffold (T9 เขียนทับ)
  - มี `.env.local` ของ user อยู่แล้ว (มี `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`, `LINE_LIFF_URL`; ยังไม่มี `NEXT_PUBLIC_LIFF_ID`, `LINE_SERVICE_TEMPLATE`) — **ห้ามแก้/พิมพ์ค่า** และ Next โหลดไฟล์นี้อัตโนมัติ ดังนั้น test ที่ต้องการ env ว่างให้ override ผ่าน env ของ process เอง
  - โฟลเดอร์ `art/` เป็นงานของคนอื่น — **ห้ามแตะ**
- **รอบขนาน T2 ∥ T3 ∥ T4 ∥ T5 (กติกาเพิ่มโดย Main):** ระหว่างรอบนี้ห้ามรัน `npm run build` / `npm run dev` / `npm start` (หลาย task จะชน `.next` และ port 3000) — verify ต่อ task = `npm run typecheck` (error ที่อยู่นอกไฟล์ของตัวเองให้รายงาน ไม่ต้องแก้) + runtime test ด้วย bare Socket.IO server (ไม่มี Next) บน port เฉพาะ task; Main จะรัน build รวมหลังรอบนี้
- **T2 [x]** typecheck ไฟล์ตัวเอง 0 error, runtime auth 8/8, line-notify (ไม่มี env / env ปลอม / mock fetch) ผ่าน. เพิ่มจากแผน: `notifyTokens` มี `expiresAt` และขอ token ใหม่ได้เมื่อ remaining=0, in-flight dedupe ของ channel/notification token, 401 → ล้าง channel token cache, error ไทยเพิ่ม "ดึงโปรไฟล์ LINE ไม่สำเร็จ" / "เชื่อมต่อ LINE ไม่สำเร็จ ลองใหม่อีกครั้ง"
- **T8 → ย้ายออกจากรอบนี้:** ถูกแทนด้วย `tasks/2026-10-17-invite-friends/TASK.md` (I0–I6, สถานะ PLANNED, สร้างจาก session อื่น) — build รอบนี้ไม่ทำ T8 และไม่รันแผน invite จนกว่า user สั่ง
- **T3 [x]** typecheck/eslint ไฟล์ตัวเองผ่าน, runtime ครบทุก scenario + secrecy check 43 states. เพิ่มจากแผน: โอน host ทั้ง lobby และ result, `room:leave` ตอบ ok เสมอ, create/join ห้องใหม่ = ออกจากห้องเดิมก่อน, export `clampSec`, รองรับ emit ไม่มี payload (ack มาตำแหน่งแรก); `buildResultParams` ยังไม่ส่ง `link` (ไม่มี env ลิงก์ — รอ user ตัดสินใจ). script runtime อ้างอิงสำหรับ T6: `/private/tmp/claude-501/-Users-earth-Playgrounds-LineHackathon/050985a8-738a-4b54-abad-8ac806b9e754/scratchpad/T3/t3-runtime.ts`
- **T4 [x]** typecheck ทั้งโปรเจกต์ 0 error, eslint ผ่าน, ไม่มี static import `@line/liff`, runtime test (withAck, singleton, `useGame()` ใต้ StrictMode = 1 socket, auto-join `?room=`, reconnect re-join, unmount) ผ่าน. เพิ่มจากแผน: จำ room code ใน localStorage ต่อ userId (`spy-party:room:<userId>`) เพื่อให้ reload กลับห้องเดิม, export `getAuthMode()`/`disconnectSocket()`/`ACK_TIMEOUT_ERROR`, `authenticate()` cache เป็น promise เดียว, `liff.login({ redirectUri })` เก็บ `?room=`, action ตอน disconnect fail ทันที, reconnect → `status='connecting'` (แจ้ง T5 ให้คง UI ไว้ + แถบเชื่อมต่อใหม่), `error` อาจมีค่าตอน `status='ready'`
- **T9 [x]** README.md 119 บรรทัด, script/env ที่อ้างถึงตรงกับ `package.json`/`.env.example`. ต้องทวนส่วน smoke เทียบกับ `scripts/smoke.ts` จริงหลัง T6 เสร็จ; ngrok v3.39 ใช้ `--url`; บอกว่า code ไม่ได้อ่าน `LINE_LIFF_URL` → ต้องเพิ่ม `NEXT_PUBLIC_LIFF_ID`
- **T5 [x]** typecheck ทั้งโปรเจกต์ 0 error, `eslint src/app --max-warnings 0` ผ่าน, render ทุก screen ด้วย mock ผ่าน `react-dom/server`. ต่างจากแผน: RoleCard ไม่ blur (ปกเหมือนกันทุกใบ กันสี spy รั่ว), ตัวเลือกเวลาเป็น segmented buttons, โหวต/ทาย = เลือกแล้วกดยืนยัน, ฟอนต์ Noto Sans Thai + Chakra Petch (`next/font/google` — build ต้องมี network), avatar ใช้ `<img>`; ไฟล์เพิ่ม `Avatar.tsx`, `Toast.tsx`, `helpers.ts`, `use-action.ts`. ต้องเช็ก runtime: กดค้างดูการ์ดใน LINE webview, copy หลัง `await shareInvite()`
- **Invite plan เริ่มแล้ว (user สั่ง 2026-10-17):** I1 ∥ I2 กำลังทำ (ขนานกับ T6); ลำดับต่อ: I3 ∥ I4 (หลัง I1) → I5 (หลัง T6+I1–I3) → I6 (มือถือจริง/เอกสาร). **T7 เลื่อนไปหลัง I2** เพราะแตะ `rooms.ts`/`handlers.ts` เหมือนกัน
- **T6 [~] เขียนเสร็จ ยังไม่ verify เต็ม:** `scripts/smoke.ts` typecheck/eslint สะอาด, โหมดไม่มี server exit 1 ผ่าน แต่โหมด spawn ยังไม่ได้รัน เพราะ user เปิด `npm run dev` บน 3000 อยู่ (Next ไม่ยอมให้มี dev server ตัวที่สอง, และ server ของ user ไม่ได้เปิด DEV_AUTH) → ต้องรัน `npm run smoke` 2 รอบหลัง dev server ของ user ปิด. ต่างจากแผน: spy โหวต citizen (โหวตตัวเองไม่ได้), เช็กเพิ่ม `/healthz`, secrecy เช็ก `votes`/`accessToken`/`socketId` ด้วย; T7 ต้องแก้ round 1 ข้อ 8–9
- **T7 [x]** spyGuess + `ensureOnlineHost` (โอน host ใน lobby/result ผ่าน `hooks.broadcast`); smoke ผ่าน `SMOKE_URL` กับ bare server 5 รอบ (secrecy 56 states), T3/I2 regression ผ่าน. smoke รอบ 1 = ทายถูก (spy ชนะ), รอบ 3 = ทายผิด. ยังค้าง: smoke โหมด spawn (รอ port 3000 ว่าง)
- **Final gate (Main, 2026-10-17) PASS:** `npm run typecheck` ✓, `npm run lint` ✓, `npm run build` ✓, `npm run smoke` (spawn mode) PASS 2 รอบติด, ไม่มี process ค้างบน 3123
