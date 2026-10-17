-- ร้านหมูกระทะ: กระทะโดม + ขอบน้ำซุป + หมูสไลซ์ วางบนเตาถ่านดินเผา มีควันลอย
local W, H = 32, 32
local g = {}
for y = 0, H - 1 do
  g[y] = {}
  for x = 0, W - 1 do g[y][x] = "." end
end
local function rect(x0, y0, x1, y1, c)
  for y = y0, y1 do
    for x = x0, x1 do g[y][x] = c end
  end
end
local function ellipse(cx, cy, rx, ry, c, y0, y1)
  for y = y0 or 0, y1 or H - 1 do
    for x = 0, W - 1 do
      local dx, dy = (x - cx) / rx, (y - cy) / ry
      if dx * dx + dy * dy <= 1 then g[y][x] = c end
    end
  end
end
local function put(x, y, s)
  for i = 1, #s do
    local c = s:sub(i, i)
    if c ~= " " then g[y][x + i - 1] = c end
  end
end
local function frame()
  local rows = {}
  for y = 0, H - 1 do rows[#rows + 1] = table.concat(g[y], "", 0, W - 1) end
  return table.concat(rows, "\n")
end

-- เตาถ่านดินเผา
for y = 22, 29 do
  local inset = (y >= 28) and 1 or 0
  rect(8 + inset, y, 23 - inset, y, "q")
  rect(20 - inset, y, 23 - inset, y, "x")
  g[y][8 + inset] = "O"
end
rect(8, 22, 23, 22, "x")
rect(13, 24, 18, 27, "B")
put(13, 26, "rOYYOr")
put(13, 27, "OYOOYO")
put(14, 25, " r  r")

-- กระทะ: ขอบโลหะ + น้ำซุป
ellipse(15.5, 17, 13.5, 4.5, "g")
ellipse(15.5, 16.6, 13.5, 4.2, "h", 0, 17)
ellipse(15.5, 17, 12, 3.3, "c")
ellipse(15.5, 17.6, 11.5, 2.8, "t", 17, 31)
-- ผักในน้ำซุป
put(4, 17, "vG")
put(5, 18, "Gv")
put(25, 16, "vG")
put(24, 17, "GvG")
put(7, 19, "w")
put(22, 19, "ww")

-- โดมย่าง
ellipse(15.5, 17.5, 8.5, 8.5, "n", 0, 17)
rect(8, 18, 23, 18, "N")
ellipse(12.5, 13, 3, 3.5, "g", 9, 16)
put(11, 10, "h")
put(10, 11, "h")
-- ร่องบนโดม
put(15, 10, "N")
put(19, 11, "N")
put(21, 13, "N")
put(22, 16, "N")
put(9, 16, "N")
-- ร่องตะแกรงแนวตั้งให้อ่านออกว่าเป็นกระทะย่าง
for y = 10, 17 do
  for x = 8, 23 do
    if x % 3 == 1 then
      if g[y][x] == "n" then g[y][x] = "N" elseif g[y][x] == "g" then g[y][x] = "n" end
    end
  end
end
-- หมูสไลซ์
put(10, 12, " kkkk")
put(10, 13, "kwwkkp")
put(10, 14, " kkpp")
put(16, 14, " TTTT")
put(16, 15, "TbwbbB")
put(16, 16, " bBB")
put(14, 10, " kkk")
put(14, 11, "kwkp")

-- ไอร้อน
put(10, 2, "l")
put(9, 3, "l")
put(9, 4, "l")
put(10, 5, "l")
put(16, 1, "l")
put(15, 2, "l")
put(15, 3, "l")
put(16, 4, "l")
put(16, 5, "l")
put(21, 2, "l")
put(22, 3, "l")
put(22, 4, "l")
put(21, 5, "l")

return {
  w = W, h = H,
  outline = "K",
  frames = { frame() },
}
