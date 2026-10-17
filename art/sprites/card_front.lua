-- หน้าการ์ดบทบาท: ช่องบนสำหรับ location icon 32×32 (x 8..39, y 6..37) ส่วนล่างเว้นไว้ให้แอพเขียนชื่อสถานที่/บทบาท
-- variant spy = การ์ดของ Spy (พื้นกรม กรอบแดง) วาง char_spy ในช่องเดียวกัน
local W, H = 48, 64
local c = ART.canvas(W, H)

c:rect(1, 1, W - 2, H - 2, "c")
for _, p in ipairs({ { 1, 1 }, { W - 2, 1 }, { 1, H - 2 }, { W - 2, H - 2 } }) do c.px[p[2]][p[1]] = "." end
for x = 2, W - 3 do c:set(x, 1, "w") end

-- กรอบใน
for x = 3, W - 4 do c:set(x, 3, "t"); c:set(x, H - 4, "t") end
for y = 3, H - 4 do c:set(3, y, "t"); c:set(W - 4, y, "t") end

-- มุมทอง
local corner = { { 0, 0 }, { 1, 0 }, { 2, 0 }, { 0, 1 }, { 0, 2 }, { 1, 1 } }
for _, p in ipairs(corner) do
  c:set(2 + p[1], 2 + p[2], "Y")
  c:set(W - 3 - p[1], 2 + p[2], "Y")
  c:set(2 + p[1], H - 3 - p[2], "Y")
  c:set(W - 3 - p[1], H - 3 - p[2], "Y")
end

-- ช่องรูป
c:rect(7, 5, 34, 34, "t")
c:rect(8, 6, 32, 32, "w")

-- เส้นคั่นเหนือพื้นที่ข้อความ
for x = 10, W - 11 do c:set(x, 42, "t") end
c:set(W / 2 - 1, 42, "Y"); c:set(W / 2, 42, "Y")

return {
  w = W, h = H,
  outline = "K",
  frames = { c:str() },
  variants = {
    spy = { c = "N", w = "n", t = "R" },
  },
}
