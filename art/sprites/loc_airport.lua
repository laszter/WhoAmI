-- สนามบิน: เครื่องบินกำลังบินขึ้นเหนือรันเวย์ + หอบังคับการบิน
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

-- รันเวย์
rect(1, 27, 30, 29, "n")
rect(1, 27, 30, 27, "g")
for _, x in ipairs({ 3, 9, 15 }) do rect(x, 28, x + 2, 28, "w") end

-- หอบังคับการบิน
rect(25, 15, 25, 16, "h")
rect(22, 17, 28, 17, "g")
rect(22, 18, 28, 19, "a")
rect(26, 18, 28, 19, "u")
rect(21, 20, 29, 20, "l")
rect(24, 21, 26, 26, "l")
rect(26, 21, 26, 26, "h")
put(25, 23, "u")

-- เครื่องบิน (หันขวา)
-- แพนหาง
put(3, 2, "uu")
put(3, 3, "uuu")
put(3, 4, "uuuu")
put(4, 5, "uuuu")
put(4, 6, "uuuuu")
put(5, 7, "uuuuU")
put(5, 8, "uuuuUU")
-- ลำตัว
rect(8, 9, 26, 9, "w")
rect(5, 10, 28, 10, "w")
rect(4, 11, 29, 12, "l")
rect(5, 13, 28, 13, "h")
rect(9, 14, 25, 14, "h")
rect(5, 9, 7, 9, "w")
for x = 11, 23, 2 do g[11][x] = "U" end
put(26, 11, "NN")
put(27, 10, "a")
rect(5, 12, 27, 12, "u")
-- หางระดับ
put(1, 11, "lll")
put(1, 12, "hhh")
-- ปีก + เครื่องยนต์
put(13, 14, "llllll")
put(11, 15, "lllllh")
put(9, 16, "lllllh")
put(7, 17, "uuuuh")
put(16, 15, "gggn")
put(16, 16, "nnnN")

return {
  w = W, h = H,
  outline = "K",
  frames = { frame() },
}
