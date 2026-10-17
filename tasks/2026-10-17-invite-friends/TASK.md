# TASK: ระบบเชิญเพื่อนเข้าห้อง (Invite) — Spy Party บน LINE MINI App

> Status: CODE DONE — เหลือ I0 (console) + I6 (มือถือจริง/เอกสาร) · Created 2026-10-17 · Source: user request "เตรียม task สำหรับทำระบบเชิญเพื่อนมาเล่นด้วย"
> ต่อจาก: `tasks/2026-10-17-spy-party/TASK.md` (แทน T8 เดิม — เริ่มได้เมื่อ T3 + T4 + T5 เสร็จ)
> Spec หลัก: `DESIGN.md` ข้อ 1, 11 (อ่านก่อนเริ่มทุก task) · กฎสำคัญ 1–7 ของ TASK หลักยังใช้ทุกข้อ

## สรุป: ทำได้ไหมใน LINE MINI App → **ทำได้** แต่มีข้อจำกัด 3 ข้อที่ต้องรู้ก่อน demo
API ที่ต้องใช้ทั้งหมด (`shareTargetPicker`, permanent link, ปุ่ม share บน header, custom action button) ใช้ได้กับ MINI App ที่ **ยังไม่ verified**
ฝั่ง server แทบไม่ต้องเพิ่มอะไร เพราะ `room:join { code }` มีอยู่แล้ว งานส่วนใหญ่จึงอยู่ฝั่ง client

| # | ข้อจำกัด | ผลกระทบ | วิธีรับมือ |
|---|---|---|---|
| 1 | internal channel **Developing** เข้าได้เฉพาะ Admin กับ Tester ที่กดยอมรับสิทธิ์แล้ว | เพื่อนที่ไม่ได้เป็น Tester กดลิงก์เชิญแล้วจะเปิดแอปไม่ได้ | เพิ่มทุกคนที่จะเล่นตอน demo (รวมกรรมการ ถ้าจะให้เล่น) เป็น Tester **ล่วงหน้า** (I0) |
| 2 | ถ้าเปลี่ยนไปใช้ channel **Published** ใครก็เปิดได้ (MINI App ที่ยังไม่ verified publish ได้ตั้งแต่ 2024-11-28) แต่ **Service Message ใช้ไม่ได้** กับแอปที่ยังไม่ verified | จะเสียข้อกำหนดของโจทย์ | demo ด้วย Developing + Tester ต่อไป (ห้ามตัด Service Message) |
| 3 | ข้อความที่แชร์ผ่าน custom button ต้องเป็น **Flex bubble ตามแบบที่ LINE กำหนด** (title, sub-title/details, ปุ่ม, footer ที่มี icon + ชื่อแอป + ลูกศร) | ข้อความ text ธรรมดายังส่งได้ แต่ไม่ตรง guideline | ทำ Flex ตามแบบ แล้ว fallback เป็น text (I3) |

ข้อควรรู้อื่น ๆ
- **ห้ามใช้ Service Message ชวนเล่น** (policy: ส่งได้เฉพาะเพื่อยืนยันหรือตอบสนอง action ของผู้ใช้) → การเชิญต้องผ่าน `shareTargetPicker`, ลิงก์ หรือ QR ที่ผู้ใช้เป็นคนกดส่งเองเท่านั้น
- `shareTargetPicker` ใช้ได้เฉพาะตอนเปิดใน LINE จริงหลังตั้งค่า console ส่วน dev mode/localhost จะได้ `'unavailable'` → fallback เป็นคัดลอกลิงก์
- คนที่เข้ามาตอนเกมเริ่มไปแล้วจะถูกปฏิเสธ ("เกมเริ่มแล้ว รอรอบหน้า") ส่วนการเข้ามารอรอบถัดไปอยู่นอกขอบเขต (ดู Out of scope)
- ห้องอยู่ใน memory ถ้า server restart ลิงก์เชิญเก่าจะได้ "ไม่พบห้องนี้" → UI ต้องบอกชัดแล้วให้กรอกโค้ดใหม่

## Goal
เพื่อนเข้าห้องได้ 4 ทาง โดยทุกทางจบที่ `room:join { code }` เดียวกัน
1. **โค้ดห้อง 4 ตัว** (มีแล้วใน T5) ใช้ได้เสมอ เป็น baseline
2. **ลิงก์เชิญ (permanent link)** `https://miniapp.line.me/{liffId}/?room=K7QX` กดแล้วเปิด MINI App และเข้าห้องอัตโนมัติ ถ้าเข้าไม่ได้ให้บอกเหตุผลพร้อมเติมโค้ดไว้ให้
3. **ส่งคำเชิญใน LINE** ผ่าน `liff.shareTargetPicker` ด้วย Flex ตามแบบของ MINI App ที่มีปุ่ม "เข้าห้อง"
4. **QR code** ใน lobby ให้คนที่นั่งด้วยกันสแกนด้วยกล้อง LINE (เร็วที่สุดตอน demo)
- โบนัสที่ไม่ต้องเขียนโค้ดเพิ่ม: เมื่อ sync `?room=` ลง URL ปุ่ม share บน header ของ MINI App จะแชร์ลิงก์ห้องปัจจุบันให้เอง (LINE สร้าง permanent link จากหน้าที่เปิดอยู่)

## Acceptance criteria
- [ ] `npm run typecheck && npm run build && npm run smoke` ผ่าน (smoke มี scenario invite เพิ่มตาม I5)
- [ ] dev: เปิด `/?devUser=alice` สร้างห้อง แล้วเปิด tab ใหม่ `/?devUser=dave&room=<CODE>` → dave เข้า lobby เองโดยไม่ต้องกดอะไร
- [ ] dev: `/?devUser=erin&room=ZZZZ` → หน้า Home ขึ้น "เข้าห้อง ZZZZ ไม่ได้: ไม่พบห้องนี้" ช่องโค้ดมี `ZZZZ` เติมไว้ และ URL ไม่มี `room=` แล้ว (reload ต้องไม่วนลองซ้ำ)
- [ ] ระหว่างอยู่ในห้อง URL มี `?room=<CODE>` (คง `devUser` ไว้) และ reload = กลับเข้าห้องเดิม (reconnect) ส่วนออกจากห้องแล้ว `room=` หายไป
- [ ] Lobby มี invite panel: โค้ด, QR ของลิงก์เชิญ, ปุ่ม "ส่งคำเชิญใน LINE", "คัดลอกลิงก์", "คัดลอกโค้ด" ถ้าห้องเต็มให้แสดง "ห้องเต็มแล้ว" แทน QR/ปุ่มเชิญ
- [ ] `shareInvite` คืน `'shared' | 'cancelled' | 'unavailable'` ถูกต้อง: dev/browser → `'unavailable'` → UI คัดลอกลิงก์แทน + toast; ใน LINE → picker ขึ้น ข้อความเป็น Flex ตามแบบ; ถ้า Flex error → ลองด้วย text 1 ครั้ง
- [ ] ผู้เล่นคนหนึ่งอยู่ได้แค่ 1 ห้อง: ถ้าเข้าห้องใหม่ตามลิงก์เชิญ ชื่อจะหายจาก lobby ห้องเก่า (ไม่ทิ้งผู้เล่น offline ค้างไว้นับเป็นคน)
- [ ] (มือถือจริง, I6) Tester A ส่งคำเชิญให้ Tester B ผ่าน picker → B กดปุ่มใน Flex → เข้า lobby ของ A ได้; Tester C สแกน QR → เข้าห้องได้

## Context

**สภาพตอนวางแผน (2026-10-17)**
- T1 เสร็จแล้ว (scaffold + `server.ts` + contract + stub) ส่วน T2–T9 ยังไม่ทำ ไฟล์ที่ task นี้แตะ (`liff.ts`, `use-game.ts`, `rooms.ts`, `handlers.ts`, `Home.tsx`, `Lobby.tsx`, `smoke.ts`) จะเกิดขึ้นใน T3/T4/T5/T6
- `GameClient.inviteUrl` และ `actions.shareInvite()` มีใน contract แล้ว (`src/lib/game-client.ts`) ตอนนี้ `shareInvite` เป็น stub ที่คืน `'unavailable'`
- T4 วางไว้แล้วว่า `readInviteCode()` อ่าน `?room=` หลัง `authenticate()` resolve และ auto-join ครั้งแรก task นี้เปลี่ยนให้ไปใช้ parser กลางใน `src/lib/invite.ts`
- asset ที่ใช้ใน Flex: `public/assets/misc/app_icon@4x.png` (128×128) → URL `${origin}/assets/misc/app_icon@4x.png`

**ข้อเท็จจริงจากเอกสาร LINE (ตรวจ 2026-10-17)**
- Permanent link = LIFF URL + (page URL − Endpoint URL) เช่น Endpoint `https://x.ngrok-free.app` และหน้า `https://x.ngrok-free.app/?room=K7QX` → `https://miniapp.line.me/{liffId}/?room=K7QX`; path, query และ hash ถูกส่งต่อให้; ลิงก์ `https://liff.line.me/{liffId}` แบบเก่าก็ยังเปิดได้; LINE สร้าง permanent link ให้อัตโนมัติ**เฉพาะ**ตอนกด share บน header นอกนั้นต้องสร้างเอง
- `liff.permanentLink.createUrlBy(url)` จะ reject ถ้า `url` ไม่ขึ้นต้นด้วย Endpoint URL (localhost reject เสมอ) → task นี้ใช้สูตรข้างบนแทน ซึ่งได้ผลเหมือนกัน ทำงานแบบ sync และ dev mode ก็ใช้ได้
- ห้ามแตะ URL (`history.replaceState` ฯลฯ) ก่อน `liff.init()` resolve; SDK อาจเติม `liff.state`, `liff.referrer`, `lineAppVersion` ให้
- `liff.shareTargetPicker(messages, { isMultiple })`: รับได้ไม่เกิน 5 message (text / image / flex ที่มีแต่ URI action ฯลฯ); สำเร็จ → `{ status: 'success' }`; ผู้ใช้กดยกเลิก → `undefined`; ถ้ามีปัญหา**ก่อน** picker ขึ้น → reject `LiffError`; ต้อง login แล้ว และต้องเปิด shareTargetPicker ใน console (ต้องกดยอมรับเงื่อนไขทีละ channel); ใน external browser อาจมีหน้า login ด้วย email ขึ้นมา; **ห้ามเรียก `alert()`** ใน callback ของมัน; ต้องเช็ก `liff.isApiAvailable('shareTargetPicker')` ก่อน (คืน false ถ้ายังไม่ login / token หมดอายุ / environment ไม่รองรับ)
- เอกสาร shareTargetPicker ไม่ได้กำหนด scope `chat_message.write` (scope นี้ใช้กับ `liff.sendMessages`) → DESIGN ข้อ 9 ที่บอกว่าต้องเปิด scope นี้ไม่จำเป็นสำหรับ picker แต่เปิดไว้ก็ไม่เสียอะไร
- ข้อความแชร์แบบ custom ของ MINI App: ใช้ **Bubble** (ห้าม Carousel); ต้องมี Title + (Sub-title หรือ Details) + Button + Footer; ปุ่มมีได้ไม่เกิน 3 ปุ่ม ปุ่มบนสุดใช้ `primary` ส่วนปุ่มรองใช้ `link` (**ห้าม `secondary`**); ต้องมีปุ่มอย่างน้อย 1 ปุ่มที่พาไปหน้าของเนื้อหานั้น (ถ้าไม่ใช่หน้าแรกต้องเป็น permanent link); Footer = separator `#f0f0f0` + app icon + ชื่อแอป (`xs`, `#999999`, bold, บรรทัดเดียว) + รูปลูกศร `https://vos.line-scdn.net/service-notifier/footer_go_btn.png` (**ห้ามเปลี่ยน**) ที่มี URI action ไป `https://miniapp.line.me/{liffId}`; Hero ไม่บังคับ (ถ้าใส่ให้ใช้ 20:13); action ใส่ได้เฉพาะที่ปุ่มกับ footer; ค่าใน example: title `lg` bold `#000000`, sub-title `sm` `#999999`, แถว details แบ่ง label flex 20 `#555555` / value flex 55 `#111111`, ปุ่ม primary `#17c950` สูง `md`
- Developing = Admin + Tester ที่ยอมรับสิทธิ์แล้ว · Published = ผู้ใช้ทั่วไป · Service Message = ❌ สำหรับแอปที่ยังไม่ verified (template จะไม่ถูก reflect ไปที่ Published) · custom action button = ✅ ใช้ได้ทั้งสองแบบ
- picker แสดง Groups (ไม่รวม OpenChat), Friends และ Chats ล่าสุด; ข้อความจะขึ้นเหมือนผู้ใช้เป็นคนส่งเอง

**กฎเพิ่มสำหรับ task นี้**
1. ทุกช่องทางเชิญต้องจบที่ `room:join` เดิม ห้ามเพิ่มทางลัดฝั่ง server ที่ข้ามการตรวจ (phase / ห้องเต็ม / auth)
2. `src/lib/invite.ts` และ `src/lib/share-message.ts` ต้องเป็น pure module: ไม่ import `@line/liff` แบบ value (ใช้ได้แค่ `import type`), ไม่แตะ `window` ตอน import, import shared ด้วย relative path (`../shared/types`) เพื่อให้ `scripts/smoke.ts` import ทดสอบได้
3. แตะ URL ได้หลัง `authenticate()` resolve แล้วเท่านั้น และใช้ `history.replaceState` เสมอ (ห้าม `pushState` / `location.href =`)
4. ห้าม `alert()` / `confirm()` ทุกที่ (LIFF อาจค้างบนบางเครื่อง และ browser automation จะค้าง) → ใช้ toast
5. ใครในห้องก็เชิญได้ ไม่จำเป็นต้องเป็น host

## Open Questions / Assumptions
**ค้าง (ไม่ block การเขียนโค้ด แต่ block การ demo)**
- ❓ ตอน demo ให้ใครเล่นบ้าง? ทุกคนต้องถูกเพิ่มเป็น Tester และกดยอมรับก่อน (I0) ถ้าจะให้กรรมการเล่นด้วยต้องขอ LINE ของกรรมการล่วงหน้า ถ้าทำไม่ได้ ให้เล่นกันเองในทีมแล้วให้กรรมการดูจอ

**Assumptions (ตัดสินใจเองด้วย default)**
- 📌 Endpoint URL ของ Developing channel = **root ของ tunnel** (ไม่มี path) สูตรลิงก์ใน `buildInviteUrl` จึงเป็น `https://miniapp.line.me/${liffId}/?room=${code}` ถ้าจะใช้ endpoint ที่มี path ต้องแก้ฟังก์ชันนี้ที่เดียว
- 📌 ไม่ใช้ `createUrlBy` (เหตุผลอยู่ใน Context) ใช้สูตรตามเอกสาร MINI App แทน
- 📌 Flex ไม่มี Hero: ไม่บังคับ และตัดปัญหารูปเสียเมื่อ tunnel URL เปลี่ยน แต่ footer icon ยังอ้าง `${origin}` อยู่ → แนะนำ ngrok static domain (DESIGN ข้อ 11)
- 📌 QR ใช้ `qrcode@1.5.4` + `@types/qrcode@1.5.6` (`npm view` 2026-10-17) render เป็น data URL ใน `<img>` และ dynamic import ใน `useEffect`
- 📌 auto-join จากลิงก์ทำครั้งเดียวต่อการโหลดหน้า; ถ้าล้มเหลวให้ลบ `room=` ออกจาก URL แล้วแสดง error บน Home พร้อมเติมโค้ด
- 📌 ไม่เปลี่ยน `src/shared/types.ts` (contract server↔client) ส่วน `src/lib/game-client.ts` เพิ่มได้ 2 field + 1 action (ข้อยกเว้นของ I1 เพราะเป็น client ล้วน)

## Verify commands
- ชุดเดียวกับ TASK หลัก: `npm run typecheck`, `npm run build`, `npm run smoke`, final gate `npm run typecheck && npm run build && npm run smoke`
- Manual dev: `DEV_AUTH=1 NEXT_PUBLIC_DEV_AUTH=1 npm run dev` แล้วเปิดตาม Acceptance criteria (ลิงก์เชิญใน dev mode คือ `http://localhost:3000/?room=CODE` ให้เติม `&devUser=<ชื่อ>` เอง)

## Tasks
> สถานะ: [ ] = ยังไม่ทำ · [x] = เสร็จ+verify ผ่าน · [!] = ติด blocker
> ลำดับ: I0 (คน, เริ่มนาทีแรก) ∥ { I1 ∥ I2 } → { I3 ∥ I4 } → I5 → I6
> ถ้าเวลาไม่พอให้ตัดตามลำดับนี้: I4 QR → I2 → Flex ใน I3 (ส่งเป็น text แทน) · **ห้ามตัด I1** เพราะเกือบไม่มีต้นทุน และเป็นทางหลักที่ลิงก์/QR/header share ต้องพึ่ง

- [ ] **I0 — (คน) ตั้งค่า LINE Developers Console สำหรับการเชิญ** — ทำคู่ขนานตั้งแต่นาทีแรก
  - Developing channel → แท็บ LIFF/Web app settings → เปิด **shareTargetPicker** (อ่านเงื่อนไข → ติ๊กยอมรับ → Enable)
  - Endpoint URL = `https://<tunnel>` (root ไม่มี path) เป็นค่าเดียวกับที่ TASK หลักใช้
  - Roles → เพิ่ม **ทุกคน** ที่จะเล่น/สแกน QR เป็น Tester แล้วให้แต่ละคน**กดยอมรับ** (ใช้เวลา จึงต้องทำก่อน)
  - ใส่ `NEXT_PUBLIC_LIFF_ID` ใน `.env.local` (ตอนนี้ไฟล์มี `LINE_LIFF_URL` แต่ยังไม่มีตัวนี้ ค่าที่ต้องใส่คือส่วนท้ายของ `LINE_LIFF_URL` หลัง `/`) ถ้าไม่ใส่ `buildInviteUrl` จะสร้างลิงก์ `${origin}/?room=` ซึ่งเปิดใน LINE ไม่ได้
  - ทดสอบบนมือถือ Tester: เปิด `https://miniapp.line.me/<liffId>/?room=TEST` ใน LINE (ส่งให้ตัวเองในแชท) → แอปเปิด แล้วหลัง `liff.init()` URL ต้องมี `?room=TEST` (ดู log ได้จาก eruda หรือข้อความ error "ไม่พบห้องนี้" บน Home หลัง I1)
  - verify: checklist ครบ + Tester อย่างน้อย 3 คนยอมรับแล้ว

- [x] **I1 — Client: ลิงก์เชิญ + auto-join จากลิงก์ + sync `?room=` ใน URL** — เสร็จ 2026-10-17: `src/lib/invite.ts` (pure), `shareInvite(ctx: ShareInviteContext)` stub ใน liff.ts, `createInviteUrl` เป็น sync, `GameClient` เพิ่ม `pendingInviteCode`/`inviteError`/`clearInviteError()` (P0)
  - ทำอะไร:
    1. สร้าง `src/lib/invite.ts` (pure ตามกฎข้อ 2):
       ```ts
       import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../shared/types';
       export function normalizeRoomCode(raw: string | null | undefined): string | null
         // trim + toUpperCase; ยาวต้องเท่ากับ ROOM_CODE_LENGTH และทุกตัวอยู่ใน ROOM_CODE_ALPHABET ไม่งั้นคืน null
       export function readRoomParam(search: string): string | null      // normalizeRoomCode(new URLSearchParams(search).get('room'))
       export function withRoomParam(href: string, code: string | null): string
         // คืน path+search+hash ใหม่ที่ set/ลบ `room` โดยคง param อื่นไว้ (devUser ฯลฯ) — ใช้กับ history.replaceState
       export function buildInviteUrl(code: string, env: { liffId?: string; origin: string }): string
         // liffId → `https://miniapp.line.me/${liffId}/?room=${code}` (สูตร permanent link, Endpoint = origin root)
         // ไม่มี  → `${origin}/?room=${code}` (dev / localhost)
       ```
    2. `src/lib/liff.ts`: ให้ `readInviteCode()` เรียก `readRoomParam(window.location.search)` และเลิกเรียก `permanentLink.createUrlBy`; `createInviteUrl(code)` ให้เรียก `buildInviteUrl(code, { liffId: mode === 'liff' ? NEXT_PUBLIC_LIFF_ID : undefined, origin: location.origin })` แบบ sync; เปลี่ยน signature ของ `shareInvite` เป็น `shareInvite(ctx: { code: string; hostName: string; playerCount: number; inviteUrl: string })` (body ยังคืน `'unavailable'` ไว้ให้ I3 เติม)
    3. `src/lib/game-client.ts` (ข้อยกเว้นของ contract): เพิ่มใน `GameClient`
       ```ts
       pendingInviteCode: string | null;                          // กำลัง auto-join จากลิงก์
       inviteError: { code: string; message: string } | null;    // auto-join ไม่สำเร็จ
       ```
       และเพิ่ม `clearInviteError(): void` ใน `GameActions`
    4. `src/lib/use-game.ts`:
       - หลัง `session:me` ครั้งแรก ถ้ายังไม่อยู่ในห้องและ `readInviteCode()` มีค่า → set `pendingInviteCode` → `joinRoom(code)` → สำเร็จ: clear pending · ไม่สำเร็จ: `inviteError = { code, message: ack.error }`, clear pending, `history.replaceState(null, '', withRoomParam(location.href, null))` (กัน reload แล้ววนลองซ้ำ)
       - เมื่อ `room?.code` เปลี่ยน → `replaceState(withRoomParam(href, room.code))` ส่วน `leaveRoom` สำเร็จ → `replaceState(withRoomParam(href, null))`
       - `inviteUrl` = `createInviteUrl(room.code)` (sync ไม่ต้องใช้ effect async แล้ว)
       - `actions.shareInvite()` → ส่ง `{ code, hostName: ชื่อของ hostId ใน room.players, playerCount: room.players.length, inviteUrl }`
       - `createRoom`/`joinRoom` แบบ manual ให้ clear `inviteError` ด้วย
    5. `src/app/components/Home.tsx`:
       - `pendingInviteCode` → แสดงการ์ด "กำลังเข้าห้อง {code}…" แทนฟอร์ม และ disable ปุ่ม
       - `inviteError` → banner "เข้าห้อง {code} ไม่ได้: {message}" + เติมช่องโค้ดด้วย `inviteError.code` + ปุ่ม "ลองอีกครั้ง" (`joinRoom`) และ "ปิด" (`clearInviteError`)
  - ไฟล์ (owner): `src/lib/invite.ts` (ใหม่), `src/lib/liff.ts`, `src/lib/game-client.ts`, `src/lib/use-game.ts`, `src/app/components/Home.tsx`
  - ขึ้นกับ: T4, T5 · ขนานได้กับ: I2, I0
  - verify: `npm run typecheck && npm run build`; dev 3 ข้อแรกใน Acceptance criteria (auto-join, ห้องที่ไม่มีอยู่, sync URL + reload = reconnect)

- [x] **I2 — Server: ผู้เล่น 1 คนอยู่ได้ 1 ห้อง** — เสร็จ 2026-10-17: `detachFromOtherRooms()` ใน rooms.ts + `detachUser()` ใน handlers.ts (detach ตอน reconnect ด้วย, ถอด socket แท็บเก่าออกจากห้องเก่า); T3 regression + i2-runtime 8 checks ผ่าน (P1) — กันผู้เล่นค้างในห้องเก่าเมื่อกดลิงก์เชิญของห้องใหม่
  - ปัญหา: กดลิงก์เชิญ = โหลด MINI App ใหม่ = socket ใหม่ แต่ห้องเก่ายังเก็บผู้เล่นไว้เป็น offline → ถูกนับใน MIN_PLAYERS, ห้องเก่าที่ host หายไปจะ start ไม่ได้ และห้องดูเต็มทั้งที่คนไม่อยู่
  - ทำอะไร:
    - `src/server/rooms.ts`: `export function detachFromOtherRooms(userId: string, exceptCode: string): Room[]` วนทุกห้องที่มี userId นี้ (ยกเว้น `exceptCode`) → `leaveRoom(room, userId)` (ใช้กติกาเดิม: lobby/result = ลบ + โอน host · ระหว่างเกม = แค่ offline เพื่อไม่ให้ roles/votes พัง) → คืนห้องที่ยังอยู่และมีการเปลี่ยนแปลง
    - `src/server/handlers.ts`: ใน `room:create` และ `room:join` ที่**สำเร็จแบบไม่ใช่ reconnect** → เรียก `detachFromOtherRooms(user.userId, code)` แล้ว broadcast `room:state` ของทุกห้องที่ได้คืน; ถ้า `socket.data.roomCode` มีค่าและไม่ใช่ห้องใหม่ → `socket.leave(old)` ก่อน
  - ไฟล์ (owner): `src/server/rooms.ts`, `src/server/handlers.ts`
  - ขึ้นกับ: T3 · ขนานได้กับ: I1, I0
  - verify: `npm run typecheck`; ทดสอบจริงใน I5 (scenario "ย้ายห้อง")

- [x] **I3 — ส่งคำเชิญผ่าน `shareTargetPicker` ด้วย Flex ตามแบบ MINI App** — เสร็จ 2026-10-17: `src/lib/share-message.ts` (pure: `buildInviteFlex`, `buildInviteText`, `shareViaPicker(picker, ctx)` สำหรับ I5) + `shareInvite` ใน liff.ts (in-flight dedupe, ไม่ throw) (P1)
  - ทำอะไร:
    1. สร้าง `src/lib/share-message.ts` (pure ตามกฎข้อ 2):
       ```ts
       import type liff from '@line/liff';
       export type ShareMessage = Parameters<typeof liff.shareTargetPicker>[0][number];
       // ถ้าดึง type แบบนี้ไม่ได้ ให้ประกาศ type ขั้นต่ำเอง (ห้ามเพิ่ม @line/bot-sdk)
       export interface InviteContext { code: string; hostName: string; playerCount: number; maxPlayers: number; inviteUrl: string; liffId: string; origin: string }
       export const FOOTER_ARROW_URL = 'https://vos.line-scdn.net/service-notifier/footer_go_btn.png'; // ห้ามเปลี่ยน (guideline)
       export function buildInviteFlex(ctx: InviteContext): ShareMessage
       export function buildInviteText(ctx: InviteContext): ShareMessage   // fallback: `${hostName} ชวนเล่น Spy Party\nห้อง ${code}\n${inviteUrl}`
       ```
       โครง Flex (ห้ามเพิ่ม property นอกจากนี้ — guideline บอกว่า "Don't change any properties not described here"):
       ```ts
       const row = (label: string, value: string) => ({ type: 'box', layout: 'horizontal', contents: [
         { type: 'text', text: label, flex: 20, size: 'sm', color: '#555555' },
         { type: 'text', text: value, flex: 55, size: 'sm', color: '#111111', wrap: true },
       ] });
       {
         type: 'flex',
         altText: `${hostName} ชวนเล่น Spy Party ห้อง ${code}`,
         contents: {
           type: 'bubble',
           body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
             { type: 'text', text: 'มาจับ Spy กัน!', size: 'lg', weight: 'bold', color: '#000000', wrap: true },  // Title
             { type: 'text', text: `${hostName} ชวนคุณเข้าห้อง`, size: 'sm', color: '#999999', wrap: true },     // Sub-title
             { type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm', contents: [                        // Details
               row('ห้อง', code), row('ผู้เล่น', `${playerCount}/${maxPlayers} คน`),
             ] },
             { type: 'button', style: 'primary', height: 'md', color: '#17c950', margin: 'lg',                  // Button
               action: { type: 'uri', label: `เข้าห้อง ${code}`, uri: inviteUrl } },
           ] },
           footer: { type: 'box', layout: 'vertical', contents: [                                                // Footer
             { type: 'separator', color: '#f0f0f0' },
             { type: 'box', layout: 'horizontal', flex: 1, spacing: 'md', margin: 'md', contents: [
               { type: 'image', url: `${origin}/assets/misc/app_icon@4x.png`, flex: 1, gravity: 'center' },
               { type: 'text', text: 'Spy Party', flex: 19, size: 'xs', color: '#999999', weight: 'bold', gravity: 'center', wrap: false },
               { type: 'image', url: FOOTER_ARROW_URL, flex: 1, gravity: 'center', size: 'xxs',
                 action: { type: 'uri', label: 'action', uri: `https://miniapp.line.me/${liffId}` } },
             ] },
           ] },
         },
       }
       ```
    2. `src/lib/liff.ts` เติม `shareInvite(ctx)`:
       - `mode !== 'liff'` หรือ `!liff.isApiAvailable('shareTargetPicker')` → `'unavailable'`
       - กันกดซ้ำ: มี in-flight promise อยู่แล้วให้คืนตัวเดิม
       - `const msgCtx = { ...ctx, maxPlayers: LIMITS.MAX_PLAYERS, liffId, origin: location.origin }`
       - `await liff.shareTargetPicker([buildInviteFlex(msgCtx)], { isMultiple: true })` → `status === 'success'` → `'shared'` · `undefined` → `'cancelled'`
       - ถ้า reject (ปัญหาเกิดก่อน picker ขึ้น เช่น Flex ไม่ผ่าน validation) → `console.warn('[invite] flex failed', err.code, err.message)` → ลองอีกครั้งด้วย `buildInviteText(msgCtx)` → ถ้ายัง reject → `'unavailable'`
       - ห้าม `alert()` ใน then/catch
  - ไฟล์ (owner): `src/lib/share-message.ts` (ใหม่), `src/lib/liff.ts`
  - ขึ้นกับ: I1 (signature ของ `shareInvite`) · ขนานได้กับ: I4
  - verify: `npm run typecheck && npm run build`; dev mode กดปุ่มแล้วได้ `'unavailable'` → UI คัดลอกลิงก์ (I4); โครง Flex ตรวจใน I5; ของจริงตรวจบนมือถือใน I6 (ถ้าอยากเห็นหน้าตา Flex ก่อน วาง JSON ของ `contents` ลงใน Flex Message Simulator ของ LINE ได้)

- [x] **I4 — Invite panel ใน Lobby: QR + ลิงก์ + ปุ่มส่งคำเชิญ** — เสร็จ 2026-10-17: `InvitePanel.tsx` (QR เป็น SVG จาก `qrcode@1.5.4` `create()`), Lobby ใช้ panel นี้; SSR render 33/33 (P1)
  - ทำอะไร:
    1. `npm install qrcode@1.5.4 && npm install -D @types/qrcode@1.5.6`
    2. สร้าง `src/app/components/InvitePanel.tsx` (`'use client'`, props `{ game: GameClient }`):
       - โค้ดห้องตัวใหญ่ + QR ของ `game.inviteUrl` (`useEffect` → `const QR = await import('qrcode'); setSrc(await QR.toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: 'M' }))` → `<img alt="QR เข้าห้อง">` พื้นขาว ขนาด ≥ 200px) + ข้อความ "ให้เพื่อนสแกนด้วยกล้อง LINE"
       - ปุ่ม "ส่งคำเชิญใน LINE" → `actions.shareInvite()` → `'shared'` toast "ส่งคำเชิญแล้ว" · `'cancelled'` ไม่ทำอะไร · `'unavailable'` → คัดลอก `inviteUrl` + toast "คัดลอกลิงก์แล้ว วางในแชทได้เลย"; ระหว่างรอให้ disable ปุ่ม
       - ปุ่ม "คัดลอกลิงก์" และ "คัดลอกโค้ด" (`navigator.clipboard.writeText` ถ้าใช้ไม่ได้ให้แสดงข้อความให้ผู้ใช้กดค้างเพื่อคัดลอกเอง)
       - `game.isDev` → แสดงลิงก์ดิบใต้ QR (ช่วยทดสอบหลาย tab)
       - `room.players.length >= LIMITS.MAX_PLAYERS` → ซ่อน QR/ปุ่มเชิญ แล้วแสดง "ห้องเต็มแล้ว (8/8)"
       - toast ใช้ state ในตัว component (ห้าม `alert`)
    3. `src/app/components/Lobby.tsx`: เอาบล็อกโค้ดห้อง + ปุ่ม "ชวนเพื่อน" ที่ T5 ทำไว้ออก แล้วใส่ `<InvitePanel game={game} />` แทน โดยใช้ style เดียวกับ Lobby (ถ้า T5 ใช้ asset `ui_panel*.png` ก็ใช้ตาม)
  - ไฟล์ (owner): `package.json`, `package-lock.json`, `src/app/components/InvitePanel.tsx` (ใหม่), `src/app/components/Lobby.tsx`
  - ขึ้นกับ: I1 · ขนานได้กับ: I3
  - verify: `npm run typecheck && npm run build`; dev ที่ความกว้าง 390px: lobby มี QR ที่สแกนด้วยมือถือแล้วได้ URL ตรงกับ `inviteUrl`; กด "ส่งคำเชิญใน LINE" ใน browser แล้วได้ toast คัดลอกลิงก์; ห้อง 8 คน → "ห้องเต็มแล้ว"

- [x] **I5 — Smoke: scenario การเชิญ** (completion gate)
  - ทำอะไร: เพิ่มใน `scripts/smoke.ts` (ต่อจาก scenario ของ T6/T7 ห้ามแก้ของเดิม)
    1. **Pure checks** (import `../src/lib/invite` และ `../src/lib/share-message` ตรง ๆ):
       - `normalizeRoomCode(' k7qx ') === 'K7QX'`; `normalizeRoomCode('K7Q0') === null` (มี 0); `normalizeRoomCode('ABCDE') === null`
       - `buildInviteUrl('K7QX', { liffId: '123-abc', origin: 'https://x.app' }) === 'https://miniapp.line.me/123-abc/?room=K7QX'`; ถ้าไม่มี liffId → `'https://x.app/?room=K7QX'`
       - `readRoomParam(new URL(thatUrl).search) === 'K7QX'`; `withRoomParam('/?devUser=bob', 'K7QX')` ยังมี `devUser=bob`; `withRoomParam('/?room=K7QX&devUser=bob', null)` ไม่มี `room`
       - `buildInviteFlex(ctx)`: `type === 'flex'`, `contents.type === 'bubble'`, ใน JSON มี `FOOTER_ARROW_URL`, uri ของ arrow = `https://miniapp.line.me/${liffId}`, ปุ่ม primary มี `uri === inviteUrl`, `JSON.stringify` ไม่มี `"secondary"` และไม่มี `"carousel"`, `altText` ไม่ว่าง
    2. **ย้ายห้อง (I2)**: dave join ห้อง A ของ alice → dave disconnect → dave connect ใหม่ → `room:create` (ห้อง B) → alice ได้ `room:state` ห้อง A ที่ไม่มี `dev:dave`
    3. **ห้องเต็ม**: ห้องใหม่ที่มี 8 dev user → คนที่ 9 `room:join` → `ok:false` และ error มีคำว่า "เต็ม"
    4. **เกมเริ่มแล้ว**: ห้องที่ phase `discussion` → userId ใหม่ `room:join` → `ok:false` และ error มีคำว่า "เริ่มแล้ว"; ส่วนผู้เล่นเดิม reconnect ยังได้ `ok:true`
    5. ปิด socket ทุกตัวที่สร้างใน scenario นี้
  - ไฟล์ (owner): `scripts/smoke.ts`
  - ขึ้นกับ: I1, I2, I3, T6 · ขนานได้กับ: —
  - verify: `npm run typecheck && npm run smoke` → `[smoke] PASS`

- [ ] **I6 — ทดสอบบนมือถือจริง + อัปเดตเอกสาร** (P0 ก่อน demo)
  - ทำอะไร:
    1. ต้องทำ I0 เสร็จก่อน และรันแบบ production (`npm run build && npm start`) ผ่าน tunnel ตาม README
    2. Checklist บนมือถือ (จดผลลง Progress log):
       - [ ] Tester A สร้างห้อง → "ส่งคำเชิญใน LINE" → เลือกแชทของ Tester B → ข้อความเป็น Flex ตามแบบ (ไม่ใช่ text fallback)
       - [ ] B กด "เข้าห้อง K7QX" ใน Flex → MINI App เปิด → เข้า lobby ของ A เองโดยไม่ต้องกรอก
       - [ ] Tester C สแกน QR บนจอ A ด้วยกล้อง LINE → เข้าห้องได้
       - [ ] กด share บน header ของ MINI App (ระหว่างอยู่ใน lobby) → ลิงก์ที่ได้พาเข้าห้องเดิม
       - [ ] กดลิงก์ของห้องที่จบไปแล้ว / หลัง server restart → Home บอก "ไม่พบห้องนี้" พร้อมเติมโค้ด
       - [ ] (ถ้ามีคนที่ไม่ใช่ Tester) กดลิงก์ → ยืนยันว่า LINE ไม่ให้เข้า แล้วจดข้อความที่ LINE แสดงไว้ใน README
    3. `DESIGN.md`: ข้อ 9 แก้ scope (`chat_message.write` ไม่จำเป็นสำหรับ shareTargetPicker) + เพิ่มว่าผู้รับคำเชิญต้องเป็น Tester; ข้อ 11 แทนบรรทัด `permanentLink.createUrlBy` ด้วยสูตร permanent link + กฎ Flex share message + "ห้ามใช้ Service Message ชวนเล่น"
    4. `README.md`: หัวข้อ "เชิญเพื่อน" (4 ช่องทาง, ข้อจำกัด Tester, วิธีทดสอบลิงก์เชิญใน dev mode ด้วย `&devUser=`)
  - ไฟล์ (owner): `DESIGN.md`, `README.md`
  - ขึ้นกับ: I0–I5, T9
  - verify: checklist ข้อ 2 ผ่านอย่างน้อย 4 ข้อแรก

## Out of scope (รอบนี้ไม่ทำ)
- **เข้ามารอรอบถัดไประหว่างที่เกมเล่นอยู่** (spectator/waiting list): ต้องเพิ่ม field ใน `PublicPlayer`, แยกผู้เล่นที่อยู่ในรอบปัจจุบันออกจากการโหวต และแก้ contract ทั้งสองฝั่ง เกินเวลา hackathon → ตอนนี้ปฏิเสธพร้อมข้อความ "เกมเริ่มแล้ว รอรอบหน้า"
- เปิดให้คนที่ไม่ใช่ Tester เข้าได้ (ต้องใช้ LIFF ID ของ Published ซึ่งจะเสีย Service Message) หรือรองรับ 2 LIFF ID พร้อมกัน
- ห้องที่ผูกกับกลุ่ม LINE (`liff.getContext()` ไม่คืน `groupId` แล้ว) / เชิญผ่าน OpenChat (picker ไม่แสดง OpenChat)
- ลิงก์เชิญที่มีวันหมดอายุหรือมี token กันคนนอก: room code 4 ตัว + Tester-only ถือว่าพอสำหรับ demo
- Hero image ใน Flex, ปุ่มรองใน Flex, รายงานว่าใครเป็นคนเชิญใคร

## Progress log
- (ยังไม่เริ่ม)
