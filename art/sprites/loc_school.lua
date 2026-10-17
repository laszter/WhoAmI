-- โรงเรียน: อาคารเรียนหลังคากระเบื้องส้ม + เสาธงชาติไทย
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
local function frame()
  local rows = {}
  for y = 0, H - 1 do rows[#rows + 1] = table.concat(g[y], "", 0, W - 1) end
  return table.concat(rows, "\n")
end

-- เสาธง + ธงไตรรงค์
rect(4, 2, 4, 28, "l")
g[1][4] = "Y"
rect(5, 3, 12, 3, "r")
rect(5, 4, 12, 4, "w")
rect(5, 5, 12, 6, "U")
rect(5, 7, 12, 7, "w")
rect(5, 8, 12, 8, "r")
rect(3, 29, 5, 29, "h")

-- หลังคา
for i = 0, 5 do
  local y = 10 + i
  rect(12 - i, y, 24 + i, y, "q")
  g[y][12 - i] = "O"
  g[y][24 + i] = "x"
end
rect(12, 10, 24, 10, "O")
rect(7, 15, 29, 15, "x")

-- ผนัง
rect(8, 16, 28, 28, "c")
rect(8, 16, 28, 16, "t")
rect(28, 16, 28, 28, "t")
rect(8, 22, 28, 22, "t")
for _, x in ipairs({ 10, 13, 22, 25 }) do
  for _, y in ipairs({ 18, 24 }) do
    rect(x, y, x + 1, y + 2, "U")
    rect(x, y, x + 1, y, "u")
  end
end

-- ตราโรงเรียน + ประตู
rect(17, 18, 19, 20, "Y")
g[19][18] = "O"
rect(17, 23, 19, 28, "b")
rect(17, 23, 17, 28, "T")

-- ฐาน
rect(7, 29, 29, 29, "h")

return {
  w = W, h = H,
  outline = "K",
  frames = { frame() },
}
