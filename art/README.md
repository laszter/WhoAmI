# Pixel art — Spy Party

ต้นฉบับทุกรูปคือ ASCII pixel map ใน `art/sprites/*.lua` (1 ตัวอักษร = 1 พิกเซล, สีตาม `art/palette.lua` = ENDESGA 32 + LINE green)
Aseprite CLI แปลงเป็น `.aseprite` แล้ว export เป็น PNG ลง `public/assets/`

```bash
./art/build.sh                     # gen + export ทั้งหมด
./art/build.sh all 'loc_*'         # เฉพาะบางไฟล์ (คั่นหลาย pattern ด้วย ,)
./art/build.sh export              # แก้ .aseprite ใน GUI แล้ว export อย่างเดียว (gen จะเขียนทับ .aseprite)
ASEPRITE=/path/to/aseprite ./art/build.sh
```

ทุกรูปมี 2 ขนาด: `name.png` (1x) และ `name@4x.png` (ขยายแบบ nearest neighbor)
รูปที่ขยับได้เป็นแถบเฟรมแนวนอน + `name.json` (ขนาดเฟรม, duration, tag) ส่วน GIF ตัวอย่างและ contact sheet อยู่ที่ `art/preview/`

## ใช้ในแอพ

```css
/* ใช้กับทุกรูป ถ้าย่อ/ขยายเองจะได้ไม่เบลอ */
.pixel { image-rendering: pixelated; }

/* 9-slice: ui_panel*, ui_button* ตัดขอบ 8px (= 32px ในไฟล์ @4x) */
.panel  { border: 32px solid transparent; border-image: url(/assets/ui/ui_panel@4x.png) 32 fill stretch; image-rendering: pixelated; }
.btn    { border: 32px solid transparent; border-image: url(/assets/ui/ui_button@4x.png) 32 fill stretch; image-rendering: pixelated; }
.btn:active { border-image-source: url(/assets/ui/ui_button_pressed@4x.png); }

/* animation แถบแนวนอน: steps(จำนวนเฟรม), ความกว้าง = เฟรม × จำนวนเฟรม (ดู duration ใน .json) */
.spy { width: 128px; height: 128px; background: url(/assets/characters/char_spy@4x.png) 0 0 / auto 100%;
       animation: spy-idle 1.81s steps(4) infinite; image-rendering: pixelated; }
@keyframes spy-idle { to { background-position: -512px 0; } }

body { background: #262b44 url(/assets/misc/bg_tile@4x.png) repeat; }
```

`char_spy` มีเฟรมแรกค้างนาน 1600ms แล้วเฟรมแสงวิ่งผ่านแว่นอีก 3 × 70ms ถ้าอยากได้จังหวะเป๊ะให้อ่าน `duration` จาก JSON แทน `steps()`

## รายการ asset

| ไฟล์ | ขนาด | ใช้ที่ |
|---|---|---|
| `misc/logo` | 48×36 | หน้า HOME |
| `misc/app_icon`, `misc/app_icon_1040.png` | 52×52 → 1040 | ไอคอน LINE MINI App: พื้นทึบ, โลโก้ 30px กลางภาพ = 75px บนพื้น 130px ตามสเปก LINE (54–76px) — อัปโหลด `app_icon_1040.png` ที่ Console → Basic settings → Channel icon |
| `misc/bg_tile` | 32×32 | พื้นหลัง repeat |
| `characters/char_spy` | 32×32 × 4 เฟรม | mascot หน้า HOME / การ์ดของ Spy |
| `characters/avatar_player[_red/_green/_yellow/_purple/_orange/_pink/_gray]` | 16×16 | avatar สำรองเมื่อไม่มี `pictureUrl` |
| `ui/card_back` | 48×64 | หลังการ์ด (ก่อนกดค้าง) |
| `ui/card_front`, `ui/card_front_spy` | 48×64 | หน้าการ์ด ช่องรูป 32×32 อยู่ที่ x 8, y 6 ส่วนล่าง (y 44–58) เว้นไว้ให้เขียนชื่อ/บทบาท |
| `ui/ui_panel`, `ui/ui_panel_cream` | 24×24 9-slice | กล่องเนื้อหา |
| `ui/ui_button[_red/_gray/_gold]`, `ui/ui_button_pressed[...]` | 24×24 9-slice | ปุ่ม (เขียว = หลัก, แดง = ออก, เทา = รอง, ทอง = โหวต) |
| `locations/loc_*` | 32×32 | ไอคอนสถานที่ (ด้านล่าง) |
| `icons/icon_*` | 16×16 | ไอคอน UI |
| `result/result_spy_win` | 48×48 × 4 เฟรม (160ms) | หน้า RESULT ฝั่ง Spy ชนะ: ยิ้มเยาะถือแฟ้มลับในควัน |
| `result/result_citizens_win` | 48×48 × 4 เฟรม (140ms) | หน้า RESULT ฝั่งพลเมืองชนะ: สปายติดคุกเหงื่อแตก |

### ไอคอนสถานที่ → `locations.ts`

| icon | สถานที่ |
|---|---|
| `loc_hospital` | โรงพยาบาล |
| `loc_school` | โรงเรียน |
| `loc_mookata` | ร้านหมูกระทะ |
| `loc_airport` | สนามบิน |
| `loc_beach` | ชายหาด |
| `loc_temple` | วัด |
| `loc_bts` | BTS |
| `loc_market` | ตลาดนัด |
| `loc_cinema` | โรงหนัง |
| `loc_gym` | ฟิตเนส |
| `loc_concert` | คอนเสิร์ต |
| `loc_office` | ออฟฟิศ |

### ไอคอน UI

| icon | ใช้ที่ |
|---|---|
| `icon_crown` | ป้าย host |
| `icon_timer` | นับถอยหลัง (5 เฟรม: 350×4 + 600ms = 2s/รอบ) |
| `icon_check` | โหวตแล้ว (`hasVoted`) |
| `icon_vote` | ปุ่มโหวต |
| `icon_eye` | กดค้างเพื่อดูการ์ด |
| `icon_share` | เชิญเพื่อน (shareTargetPicker) |
| `icon_copy` | คัดลอก room code |
| `icon_question` | Spy ไม่รู้สถานที่ |
| `icon_search` | ชี้ตัว spy |
| `icon_exit` | ออกจากห้อง |
| `icon_replay` | เล่นอีกรอบ |
| `icon_offline` | ผู้เล่นหลุด (`online = false`) |
| `icon_spy` | เฉลยว่าใครเป็น spy |
| `icon_target` | คนที่ถูกโหวตมากสุด |

## เพิ่ม/แก้รูป

```lua
-- art/sprites/loc_zoo.lua
return {
  w = 32, h = 32,
  outline = "K",          -- เติมขอบดำรอบนอกให้ (เว้นขอบ 1px)
  frames = { [[ ...32 แถว แถวละ 32 ตัวอักษร... ]] },
  -- duration = 120, tags = { { name = "loop", from = 1, to = 4 } },   -- ถ้าเป็น animation
  -- variants = { red = { u = "r", U = "R" } },                         -- สร้างไฟล์สลับสี
}
```

helper ที่ใช้ได้ในไฟล์ sprite: `ART.edit` (แก้บางพิกเซลเพื่อทำเฟรมใหม่), `ART.load` / `ART.crop` (ยืมส่วนจาก sprite อื่น), `ART.canvas` (วาดด้วยโค้ด) ดูตัวอย่างใน `card_back.lua`, `logo.lua`
