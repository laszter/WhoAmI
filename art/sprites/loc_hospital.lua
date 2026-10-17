-- โรงพยาบาล: ตึกขาวมีกากบาทแดงกลางอาคาร + ปีกซ้ายขวา + กันสาดหน้าประตู
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

-- ปีกอาคาร
rect(2, 13, 29, 13, "g")
rect(3, 14, 28, 28, "l")
rect(28, 14, 28, 28, "h")
for _, x in ipairs({ 4, 7, 23, 26 }) do
  for _, y in ipairs({ 16, 21 }) do
    rect(x, y, x + 1, y + 2, "u")
    g[y][x] = "a"
  end
end

-- ตึกกลาง
rect(9, 4, 22, 4, "g")
rect(10, 5, 21, 28, "w")
rect(21, 5, 21, 28, "l")
rect(22, 14, 22, 28, "h")

-- กากบาทแดง
rect(14, 6, 17, 15, "r")
rect(11, 9, 20, 12, "r")
rect(17, 6, 17, 8, "R")
rect(20, 9, 20, 12, "R")
rect(11, 12, 13, 12, "R")
rect(18, 12, 19, 12, "R")
rect(17, 13, 17, 15, "R")
rect(14, 15, 16, 15, "R")

-- หน้าต่างตึกกลาง
rect(12, 17, 13, 19, "u")
rect(18, 17, 19, 19, "u")
g[17][12] = "a"
g[17][18] = "a"

-- กันสาด + ประตูกระจก
rect(11, 22, 20, 22, "r")
rect(12, 23, 19, 23, "R")
rect(12, 24, 19, 28, "g")
rect(13, 24, 18, 28, "a")
rect(15, 24, 16, 28, "u")

-- ฐาน
rect(2, 29, 29, 29, "h")
rect(2, 29, 9, 29, "h")

return {
  w = W, h = H,
  outline = "K",
  frames = { frame() },
}
