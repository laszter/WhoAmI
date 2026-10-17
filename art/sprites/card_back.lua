-- หลังการ์ดบทบาท (ก่อนกดค้างเพื่อดู): พื้นกรมลายตาข่าย กรอบทอง เหรียญหน้าสปายตรงกลาง
local W, H = 48, 64
local c = ART.canvas(W, H)

-- ตัวการ์ด มุมมน
c:rect(1, 1, W - 2, H - 2, "N")
for _, p in ipairs({ { 1, 1 }, { W - 2, 1 }, { 1, H - 2 }, { W - 2, H - 2 } }) do c.px[p[2]][p[1]] = "." end

-- ลายตาข่ายเฉียง
for y = 4, H - 5 do
  for x = 4, W - 5 do
    if (x + y) % 6 == 0 or (x - y) % 6 == 0 then c:set(x, y, "n") end
  end
end

-- กรอบทอง (บน/ซ้ายสว่างกว่า)
for x = 3, W - 4 do c:set(x, 3, "y"); c:set(x, H - 4, "Y") end
for y = 3, H - 4 do c:set(3, y, "y"); c:set(W - 4, y, "Y") end

-- ? สี่มุม
local q = [[
YYY
..Y
.YY
...
.Y.
]]
for _, p in ipairs({ { 6, 6 }, { W - 9, 6 }, { 6, H - 11 }, { W - 9, H - 11 } }) do
  c:rect(p[1] - 1, p[2] - 1, 5, 7, "N")
  c:blit(q, p[1], p[2])
end

-- เหรียญกลาง
local cx, cy = (W - 1) / 2, (H - 1) / 2
for y = 0, H - 1 do
  for x = 0, W - 1 do
    local d = math.sqrt((x - cx) ^ 2 + (y - cy) ^ 2)
    if d <= 13.5 then c:set(x, y, "c")
    elseif d <= 14.5 then c:set(x, y, x + y < cx + cy and "y" or "Y")
    elseif d <= 15.5 then c:set(x, y, "K") end
  end
end

-- หัวสปายจาก char_spy
local head = ART.canvas(26, 17)
head:blit(ART.crop(ART.load("char_spy").frames[1], 4, 2, 24, 15), 1, 1)
head:outline("K")
c:over(head, 11, 23)

return {
  w = W, h = H,
  outline = "K",
  frames = { c:str() },
}
