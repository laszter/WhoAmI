# Spy Party — LINE MINI App (Hackathon 2 ชม.)

เกมแนว Spyfall: ผู้เล่น 3–8 คนเข้าห้องเดียวกัน ระบบสุ่ม "สถานที่" 1 แห่ง และสุ่ม Spy 1 คน
ทุกคนยกเว้น Spy จะเห็นสถานที่และบทบาทของตัวเอง ส่วน Spy เห็นแค่รายชื่อสถานที่ที่เป็นไปได้
ทุกคนถามตอบกันจนหมดเวลา → เปิดโหวตในแอพ → เฉลย → ส่งผลให้แต่ละคนทาง Service Message

## 1. ข้อกำหนด → วิธีตอบโจทย์

| ข้อกำหนด | ทำอย่างไร |
|---|---|
| Authenticate ด้วย LINE | `liff.init()` → ส่ง `liff.getAccessToken()` ไปตอน Socket.IO handshake → server verify กับ LINE แล้วดึง profile เอง |
| Service Message | ตอน join ห้อง server แลก access token ของผู้เล่นเป็น notification token → ตอนจบเกมส่งผลแพ้/ชนะให้แต่ละคน |
| ผู้เล่น > 1 คนต่อ session | ห้องเก็บใน memory ของ Socket.IO server, join ด้วย room code หรือลิงก์เชิญจาก `shareTargetPicker` |

## 2. Game flow

```
 [HOME] ──สร้างห้อง / ใส่โค้ด / กดลิงก์เชิญ──▶ [LOBBY]
                                               │ host กด Start (≥ 3 คน)
                                               ▼
                                         [DISCUSSION]   server สุ่ม location + spy + roles
                                         นับถอยหลัง 180s  แล้วส่งการ์ดให้ทีละคนแบบ private
                                               │ หมดเวลา หรือ host กด "เปิดโหวตเลย"
                                               ▼
                                           [VOTING]     30s หรือจนโหวตครบทุกคน
                                               │
                                               ▼
                                           [RESULT]     เฉลย spy / location / ผลโหวต
                                               │        + ส่ง Service Message ให้ทุกคน
                                               │ host กด "เล่นอีกรอบ"
                                               └──────────▶ [LOBBY]
```

กติกา MVP
- โหวตได้คนละ 1 เสียง ห้ามโหวตตัวเอง
- คนที่ได้โหวตสูงสุดถูกจับ: ถ้าเป็น Spy → ฝ่ายพลเมืองชนะ / ถ้าไม่ใช่ → Spy ชนะ
- คะแนนเสมอ หรือไม่มีใครโหวต → Spy ชนะ
- (P1) Spy ถูกจับได้ → มีสิทธิ์ทายสถานที่ 1 ครั้งภายใน 15s ถ้าทายถูก Spy ชนะ

## 3. Architecture

```
 LINE App (ผู้เล่นแต่ละคน)
 ┌──────────────────────────────┐
 │ Next.js page + @line/liff    │
 │  - liff.init / getAccessToken│
 │  - socket.io-client          │
 └──────────────┬───────────────┘
                │ WebSocket (handshake: auth.accessToken)
                ▼
 ┌──────────────────────────────────────────────────────┐
 │ server.ts — process เดียว: Next.js handler + Socket.IO │
 │  ├─ auth middleware ──────▶ api.line.me (verify, profile)
 │  ├─ rooms: Map<code, Room>   (in-memory, ไม่มี DB)
 │  ├─ game engine              (phase, timer, vote)
 │  └─ line notifier ────────▶ api.line.me (stateless token,
 │                               notifier/token, notifier/send)
 └──────────────────────────────────────────────────────┘
                ▲
   ngrok / cloudflared (HTTPS) ← ตั้งเป็น Endpoint URL ของ Developing channel
```

ทำไมต้องเป็น custom server: Socket.IO ต้องการ process ที่รันค้างไว้ และ state ห้องอยู่ใน memory
จึงต้องรันแค่ **instance เดียว** — อย่า deploy ขึ้น serverless เพราะแต่ละ instance ไม่เห็น memory ของกัน
สำหรับ demo ให้รัน local + tunnel ถ้าจะ host จริงให้ใช้ Railway / Render / Fly แบบ 1 instance

## 4. Authentication

1. Client: `await liff.init({ liffId })` → ถ้า `!liff.isLoggedIn()` ให้เรียก `liff.login()` (ใน LINE app จะ login อัตโนมัติ)
2. Client: `io({ auth: { accessToken: liff.getAccessToken() } })`
3. Server `io.use()` middleware:
   - `GET https://api.line.me/oauth2/v2.1/verify?access_token=...` → เช็กว่า `client_id === LINE_CHANNEL_ID` และ `expires_in > 0`
   - `GET https://api.line.me/v2/profile` (Bearer accessToken) → `userId`, `displayName`, `pictureUrl`
   - เก็บไว้ใน `socket.data.user` — **ห้ามเชื่อ userId/ชื่อที่ client ส่งมาเอง**
4. access token ตัวเดียวกันนี้ใช้ขอ notification token ต่อได้ (ข้อ 7) และมีอายุ 12 ชม. พอสำหรับ reconnect ระหว่างเกม

Dev mode: ถ้า `DEV_AUTH=1` ให้ middleware รับ `auth.devUser` (เช่น `alice`) แทน
จะได้เปิดหลาย tab ทดสอบในเบราว์เซอร์ได้โดยไม่ต้องใช้มือถือหลายเครื่อง — **ปิดก่อน demo**

## 5. Socket events

| ทิศทาง | Event | Payload | หมายเหตุ |
|---|---|---|---|
| C→S | `room:create` | – | ack `{ code }` ผู้สร้างเป็น host |
| C→S | `room:join` | `{ code }` | ack `{ ok, error? }` ถ้า userId อยู่ในห้องแล้วให้ถือเป็น reconnect |
| C→S | `room:leave` | – | |
| C→S | `game:start` | `{ discussionSec? }` | host เท่านั้น และต้องมี ≥ 3 คน |
| C→S | `game:openVote` | – | host เท่านั้น ข้ามเวลาที่เหลือ |
| C→S | `vote:cast` | `{ targetId }` | |
| C→S | `spy:guess` | `{ location }` | P1 |
| C→S | `game:reset` | – | host กลับไป lobby |
| S→C | `room:state` | `PublicRoomState` | broadcast ทั้งห้องทุกครั้งที่ state เปลี่ยน |
| S→C | `game:you` | `PrivateCard` | ส่งเฉพาะคนนั้น (`io.to(socketId)`) |

กฎสำคัญ: `room:state` **ห้ามมี location หรือ spyId** จนกว่าจะถึง phase `result`
ไม่อย่างนั้น Spy แค่เปิด devtools ก็เห็นคำตอบ

## 6. State model

```ts
type Phase = 'lobby' | 'discussion' | 'voting' | 'result';

interface Player {
  userId: string;            // LINE userId จาก profile API
  name: string;
  pictureUrl?: string;
  socketId: string | null;   // null = หลุดการเชื่อมต่อ แต่ยังอยู่ในห้อง
}

interface Room {
  code: string;              // 4 ตัวอักษร เช่น "K7QX"
  hostId: string;
  phase: Phase;
  players: Map<string, Player>;           // key = userId
  settings: { discussionSec: number; voteSec: number };
  round?: {
    location: string;
    spyId: string;
    roles: Map<string, string>;           // userId -> บทบาท (spy ไม่มี)
    endsAt: number;                       // epoch ms ที่ phase ปัจจุบันจะจบ
    votes: Map<string, string>;           // voterId -> targetId
    result?: { accusedId: string | null; winner: 'spy' | 'citizens' };
  };
  timer?: NodeJS.Timeout;
}

// เก็บแยกตาม userId เพราะ 1 LIFF access token ออก notification token ได้ครั้งเดียว
const notifyTokens = new Map<string, { token: string; remaining: number }>();

// ส่งให้ทุกคนในห้อง
interface PublicRoomState {
  code: string;
  hostId: string;
  phase: Phase;
  players: { userId: string; name: string; pictureUrl?: string; online: boolean; hasVoted: boolean }[];
  endsAt?: number;
  serverNow: number;         // ให้ client ชดเชยนาฬิกาที่ไม่ตรงกัน
  reveal?: { spyId: string; location: string; votes: Record<string, string>; winner: 'spy' | 'citizens' };
}

// ส่งเฉพาะตัว
type PrivateCard =
  | { isSpy: true; locations: string[] }
  | { isSpy: false; location: string; role: string };
```

Timer เป็นแบบ server-authoritative: server ใช้ `setTimeout` เปลี่ยน phase เอง
ส่วน client มีหน้าที่แค่แสดงนับถอยหลังจาก `endsAt - (serverNow - Date.now())`

## 7. Service Message

```
join ห้อง ─▶ server ใช้ accessToken จาก handshake (ทำเฉพาะเมื่อยังไม่มี token ของ userId นี้)
             POST https://api.line.me/oauth2/v3/token
                  grant_type=client_credentials  → stateless channel token (อายุ 15 นาที, cache ไว้)
             POST https://api.line.me/message/v3/notifier/token
                  { liffAccessToken }            → notificationToken, remainingCount
จบเกม   ─▶ วนส่งให้ผู้เล่นทุกคน:
             POST https://api.line.me/message/v3/notifier/send?target=service
                  { templateName, params, notificationToken }
             → เก็บ notificationToken ตัวใหม่ + remainingCount ที่ตอบกลับมาทุกครั้ง
```

กฎที่ต้องทำตาม
- ส่ง 1 ข้อความต่อเกม (ผลแพ้/ชนะของคนนั้น) → 1 token ใช้ได้ 5 เกม
- `remaining === 0` หรือเรียก API ไม่สำเร็จ → log แล้วข้ามไป **ห้ามทำให้เกมพัง** (เรียกแบบ fire-and-forget)
- ต้องใช้ **stateless** หรือ short-lived channel access token เท่านั้น เพราะ long-lived token ใช้กับ MINI App ไม่ได้
- channel ยังไม่ verified → ใช้ได้เฉพาะ Developing channel และผู้รับต้องเป็น **Admin/Tester**
- template ต้องเลือกจากชุดที่ LY Corp มีให้ (สร้างเองไม่ได้) ให้เลือกแบบที่ใกล้กับ "แจ้งผล / ยืนยันรายการ" ภาษา `_th`
  แล้ว map ตัวแปรของ template ใน `buildResultParams()` ที่เดียว
- เนื้อหาต้องเป็นผลจาก action ของผู้ใช้ ห้ามโฆษณาหรือชวนเล่น
- ถ้า template มีปุ่ม ให้ใช้ permanent link เช่น ลิงก์กลับเข้าเกม

## 8. โครงสร้างไฟล์

```
LineHackathon/
├─ server.ts                # http server: Next handler + Socket.IO
├─ src/
│  ├─ server/
│  │  ├─ auth.ts            # verify access token + profile (+ DEV_AUTH)
│  │  ├─ rooms.ts           # in-memory store, create/join/leave, reconnect
│  │  ├─ game.ts            # start, สุ่ม role, timer, vote, result
│  │  └─ line-notify.ts     # stateless token, notifier/token, notifier/send
│  ├─ shared/
│  │  ├─ types.ts           # PublicRoomState, PrivateCard, ชื่อ event
│  │  └─ locations.ts       # สถานที่ + บทบาท
│  ├─ lib/
│  │  ├─ liff.ts            # init, getAccessToken, ส่งลิงก์เชิญ
│  │  └─ socket.ts          # socket.io-client singleton
│  └─ app/
│     ├─ page.tsx           # render ตาม phase: Home / Lobby / Discussion / Voting / Result
│     └─ components/
├─ .env.local
└─ package.json             # "dev": "tsx watch server.ts"
```

ตัวอย่าง `locations.ts` (ควรมี 12–15 แห่ง)

```ts
export const LOCATIONS = [
  { name: 'โรงพยาบาล', roles: ['หมอ', 'พยาบาล', 'คนไข้', 'ญาติคนไข้', 'เภสัชกร', 'รปภ.'] },
  { name: 'โรงเรียน', roles: ['ครู', 'นักเรียน', 'ภารโรง', 'ผอ.', 'แม่ค้าโรงอาหาร'] },
  { name: 'ร้านหมูกระทะ', roles: ['เจ้าของร้าน', 'เด็กเสิร์ฟ', 'ลูกค้าสายกิน', 'คนปิ้ง', 'แคชเชียร์'] },
  { name: 'สนามบิน', roles: ['นักบิน', 'แอร์โฮสเตส', 'ผู้โดยสาร', 'ตม.', 'พนักงานเช็กอิน'] },
  // ชายหาด, วัด, BTS, ตลาดนัด, โรงหนัง, ฟิตเนส, คอนเสิร์ต, ออฟฟิศ ...
];
```

## 9. ตั้งค่า

`.env.local`

```
NEXT_PUBLIC_LIFF_ID=        # LIFF ID ของ Developing channel
LINE_CHANNEL_ID=            # ใช้เช็ก client_id และขอ stateless token
LINE_CHANNEL_SECRET=
LINE_SERVICE_TEMPLATE=      # ชื่อ template ตามที่ console แสดง เช่น xxxx_th
DEV_AUTH=0
```

LINE Developers Console (ให้ 1 คนทำคู่ขนานตั้งแต่นาทีแรก)
- [ ] Developing channel → Endpoint URL = URL ของ tunnel
- [ ] Scope: `profile` (+ `chat_message.write` ถ้าจะใช้ shareTargetPicker)
- [ ] เปิด shareTargetPicker
- [ ] Service Message → เพิ่ม template ภาษาไทย 1 อัน แล้วจดชื่อเต็มไว้
- [ ] Roles → เพิ่มทุกคนที่จะเล่นตอน demo เป็น **Tester** (เพื่อให้เข้า Developing channel และรับ Service Message ได้)

## 10. แผน 2 ชั่วโมง

| เวลา | งาน |
|---|---|
| 0:00–0:15 | scaffold Next.js + `server.ts` + Socket.IO, เปิด tunnel / อีกคนตั้งค่า console |
| 0:15–0:40 | LIFF init + auth middleware + create/join room + lobby แสดง avatar |
| 0:40–1:10 | game engine: สุ่ม role, timer discussion, voting, คำนวณผล |
| 1:10–1:30 | UI: การ์ดบทบาท (กดค้างเพื่อดู), นับถอยหลัง, หน้าโหวต, หน้าเฉลย |
| 1:30–1:45 | Service Message ตอนจบเกม + ปุ่มเชิญเพื่อน (shareTargetPicker) |
| 1:45–2:00 | ทดสอบกับมือถือจริง 3 เครื่อง + ซ้อม demo |

ถ้าไม่ทัน ให้ตัดตามลำดับนี้: spy ทายสถานที่ → shareTargetPicker (ใช้ room code แทน) → ตั้งเวลาเองใน lobby → avatar
**ห้ามตัด Service Message** เพราะเป็นข้อกำหนดของโจทย์

## 11. จุดที่มักพัง

- อ่าน `?room=` หลัง `liff.init()` resolve แล้วเท่านั้น เพราะ LIFF จะ redirect ผ่าน `liff.state` ก่อน
- `@line/liff` ใช้ได้เฉพาะฝั่ง client → ใส่ `'use client'` และ import แบบ dynamic ใน `useEffect`
- มือถือสลับแอพแล้ว socket จะหลุด → ผูก player กับ `userId` ไม่ใช่ `socketId`
  ตอน reconnect client ส่ง `room:join` ซ้ำ → server อัปเดต socketId แล้วส่ง `room:state` + `game:you` ให้ใหม่
- `liff.getContext()` ไม่คืน `groupId` แล้ว → ต้องใช้ room code ของเราเอง
- ลิงก์เชิญ: `liff.permanentLink.createUrlBy(`${origin}/?room=${code}`)` แล้วส่งผ่าน `liff.shareTargetPicker()`
  (เช็ก `liff.isApiAvailable('shareTargetPicker')` ก่อน)
- ขอ notification token ซ้ำด้วย LIFF access token เดิมในเวลาใกล้กันจะได้ 400 → cache ตาม userId
- URL ของ quick tunnel เปลี่ยนทุกครั้งที่รันใหม่ → ใช้ ngrok static domain หรืออย่าปิด tunnel ระหว่างงาน
- host หลุด → โอน host ให้คนถัดไปที่ยัง online (ทำถ้ามีเวลา)
