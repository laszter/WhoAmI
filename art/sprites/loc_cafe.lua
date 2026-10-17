-- ร้านกาแฟ: แก้วลาเต้ใบใหญ่บนจานรอง ลาเต้อาร์ตรูปหัวใจ มีไอร้อน และเมล็ดกาแฟ
local c = ART.canvas(32, 32)

local function ellipse(cx, cy, rx, ry, ch, y0, y1)
  for y = y0 or 0, y1 or 31 do
    for x = 0, 31 do
      local dx, dy = (x - cx) / rx, (y - cy) / ry
      if dx * dx + dy * dy <= 1 then c:set(x, y, ch) end
    end
  end
end

-- จานรอง
ellipse(15.5, 27, 13.5, 2.6, "h")
ellipse(15.5, 26.5, 12.5, 2, "l", 0, 26)

-- หูแก้ว
ellipse(23.5, 19, 4, 4, "l")
ellipse(23.5, 19, 2, 2, ".")
for y = 17, 21 do for x = 22, 24 do if c:get(x, y) ~= "." then c.px[y][x] = "." end end end
ellipse(23.5, 19, 4, 4, "h", 19, 31)
for y = 0, 31 do for x = 0, 31 do
  local dx, dy = (x - 23.5) / 2, (y - 19) / 2
  if dx * dx + dy * dy <= 1 then c.px[y][x] = "." end
end end

-- ตัวแก้ว (ทรงก้นสอบ)
for y = 13, 25 do
  local inset = math.floor((y - 13) / 5)
  for x = 6 + inset, 23 - inset do
    c:set(x, y, x <= 8 + inset and "w" or (x >= 20 - inset and "h" or "l"))
  end
end
for x = 7, 22 do c:set(x, 25, "h") end

-- ปากแก้ว + กาแฟ
ellipse(14.5, 13, 9, 2.6, "w")
ellipse(14.5, 13.2, 7.6, 1.8, "T")
ellipse(14.5, 13.4, 6, 1.3, "t")
c:blit([[
c.c
ccc
.c.
]], 13, 12)

-- ไอร้อน
c:blit([[
..l....l..
.l....l...
.l....l...
..l....l..
...l....l.
...l....l.
..l....l..
]], 9, 2)

-- เมล็ดกาแฟ
c:blit([[
.bb.
bBbb
bbBb
.bb.
]], 25, 4)

return {
  w = 32, h = 32,
  outline = "K",
  frames = { c:str() },
}
