-- ชายหาด: ต้นมะพร้าว + ร่มชายหาดลายแดงขาว + ทะเล + ทราย
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

-- ทะเล
rect(1, 19, 30, 24, "u")
rect(1, 19, 30, 19, "U")
put(2, 21, "aa    aaa     aa    aaa")
put(5, 23, "aa     aaw     aa")
-- ทราย
rect(1, 25, 30, 29, "c")
put(1, 24, "cc   ccc        cccc    cc")
rect(1, 29, 30, 29, "t")
put(4, 27, "t")
put(19, 26, "t")
put(26, 28, "t")
g[29][1] = "."
g[29][30] = "."
-- ปลาดาว
put(14, 26, "O")
put(13, 27, "OYO")
put(13, 28, "O O")

-- ลำต้นมะพร้าว
for y = 10, 28 do
  local x = 10 - math.floor((y - 10) / 5)
  local ring = (y % 3 == 0)
  g[y][x] = ring and "T" or "t"
  g[y][x + 1] = ring and "b" or "T"
end
-- ใบมะพร้าว
put(1, 3, "    vvvv  vvvv")
put(1, 4, "  vvvvvvvvvvvvvv")
put(1, 5, " vvvGGvvvvvvGGvvv")
put(1, 6, "vvGGGGGvvGvGGGGGvv")
put(1, 7, "vGGEEGGGGGGGGEEGGv")
put(1, 8, "GGE  EGGEGGEGE  EG")
put(1, 9, "GE    E bbbb E   E")
put(1, 10, "E        bb")

-- ร่มชายหาด
local stripes = { "w", "w", "r", "r", "r", "w", "w", "w", "w", "R", "R", "R", "l", "l" }
local rows = { { 9, 21, 26 }, { 10, 19, 28 }, { 11, 18, 29 }, { 12, 17, 30 }, { 13, 17, 30 } }
for _, r in ipairs(rows) do
  for x = r[2], r[3] do g[r[1]][x] = stripes[x - 16] end
end
put(17, 14, "ww r  ww  R  l")
put(23, 8, "Y")
rect(24, 14, 24, 27, "l")
g[14][24] = "w"

return {
  w = W, h = H,
  outline = "K",
  frames = { frame() },
}
