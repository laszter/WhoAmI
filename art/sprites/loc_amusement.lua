-- สวนสนุก: ชิงช้าสวรรค์ วงล้อแดง กระเช้าหลากสี บนขาตั้ง
local c = ART.canvas(32, 32)
local cx, cy, R = 15.5, 13, 11.5

-- ขาตั้ง (วาดก่อนให้วงล้อทับ)
for y = 13, 28 do
  local t = (y - 13) / 15
  local l = math.floor(15 - t * 8 + 0.5)
  local r = math.floor(16 + t * 8 + 0.5)
  c:set(l, y, "g"); c:set(l + 1, y, "h")
  c:set(r, y, "g"); c:set(r - 1, y, "n")
end
c:rect(4, 29, 24, 1, "n")
c:rect(5, 28, 22, 1, "g")

-- ซี่ล้อ
for a = 0, 7 do
  local ang = a * math.pi / 4
  for i = 1, R - 1, 0.5 do
    c:set(math.floor(cx + math.cos(ang) * i + 0.5), math.floor(cy + math.sin(ang) * i + 0.5), "l")
  end
end

-- ขอบล้อ
for y = 0, 31 do
  for x = 0, 31 do
    local d = math.sqrt((x - cx) ^ 2 + (y - cy) ^ 2)
    if d >= R - 1 and d <= R then c:set(x, y, (x + y < cx + cy) and "r" or "R") end
  end
end

-- ดุมกลาง
c:rect(14, 12, 4, 3, "Y")
c:set(14, 12, "y"); c:set(15, 12, "y")

-- กระเช้า 8 ใบ
local colors = { { "u", "U" }, { "y", "Y" }, { "v", "G" }, { "k", "p" } }
for a = 0, 7 do
  local ang = a * math.pi / 4 + math.pi / 8
  local gx = math.floor(cx + math.cos(ang) * R + 0.5) - 1
  local gy = math.floor(cy + math.sin(ang) * R + 0.5) - 1
  local col = colors[a % 4 + 1]
  c:rect(gx, gy, 3, 3, col[1])
  c:set(gx + 2, gy + 2, col[2]); c:set(gx + 2, gy + 1, col[2]); c:set(gx + 1, gy + 2, col[2])
end

return {
  w = 32, h = 32,
  outline = "K",
  frames = { c:str() },
}
