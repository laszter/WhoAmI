-- วัด: โบสถ์หลังคาซ้อนชั้นสีแดง ขอบใบระกาสีทอง ช่อฟ้าบนยอด หางหงส์ปลายชายคา
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

-- ช่อฟ้า
put(16, 1, "Y")
put(15, 2, "YY")

-- หลังคาชั้นหลัง
for y = 3, 12 do
  local half = y - 3
  rect(15 - half, y, 16 + half, y, "r")
  g[y][15 - half] = "Y"
  g[y][16 + half] = "O"
end

-- ชายคาข้าง + หางหงส์
rect(3, 15, 28, 15, "r")
rect(2, 16, 29, 16, "R")
rect(1, 17, 30, 17, "G")
put(1, 15, "Y")
put(30, 15, "Y")
put(1, 16, "Y")
put(30, 16, "Y")

-- หน้าบันชั้นหน้า
for y = 6, 15 do
  local half = y - 6
  local xl, xr = 15 - half, 16 + half
  rect(xl, y, xr, y, "R")
  if half >= 1 then
    g[y][xl + 1] = "r"
    g[y][xr - 1] = "r"
  end
  g[y][xl] = "Y"
  g[y][xr] = "O"
  if y % 2 == 0 and y >= 8 then
    g[y][xl - 1] = "Y"
    g[y][xr + 1] = "O"
  end
end
rect(6, 16, 25, 16, "Y")
put(15, 10, "YY")
put(14, 11, "YOOY")
put(14, 12, "YOOY")
put(15, 13, "YY")

-- ผนัง เสา หน้าต่าง ประตู
rect(5, 18, 26, 26, "w")
rect(26, 18, 26, 26, "l")
rect(5, 18, 26, 18, "l")
for _, x in ipairs({ 6, 11, 20, 25 }) do rect(x, 19, x, 26, "c") end
rect(8, 20, 9, 23, "Y")
rect(22, 20, 23, 23, "Y")
rect(9, 21, 9, 22, "R")
rect(23, 21, 23, 22, "R")
put(15, 18, "YY")
put(14, 19, "YYYY")
rect(13, 20, 18, 26, "Y")
rect(15, 21, 16, 26, "O")
rect(18, 20, 18, 26, "O")

-- ฐาน + บันได
rect(4, 27, 27, 27, "l")
rect(3, 28, 28, 28, "h")
rect(2, 29, 29, 29, "g")
rect(12, 27, 19, 27, "w")
rect(11, 28, 20, 28, "l")
rect(10, 29, 21, 29, "h")

return {
  w = W, h = H,
  outline = "K",
  frames = { frame() },
}
