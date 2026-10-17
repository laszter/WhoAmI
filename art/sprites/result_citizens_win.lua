-- พลเมืองชนะ: สปายติดคุก มือเกาะลูกกรง ยิ้มแหยะ คิ้วตก เหงื่อตก ตัวสั่น
-- วาดด้วยพิกัด (0-based) บน canvas 48×48 แล้วแปลงเป็น pixel map
local W, H = 48, 48
local g, ox = nil, 0

local function put(x, y, ch)
  x = x + ox
  if x >= 0 and x < W and y >= 0 and y < H then g[y + 1][x + 1] = ch end
end
local function fill(y, x1, x2, ch) for x = x1, x2 do put(x, y, ch) end end
local function stamp(x, y, rows)
  for j, row in ipairs(rows) do
    for i = 1, #row do
      local c = row:sub(i, i)
      if c ~= "." then put(x + i - 1, y + j - 1, c) end
    end
  end
end
local function coatL(y, x1, x2) fill(y, x1, x2, "t"); put(x1, y, "c") end
local function coatR(y, x1, x2) fill(y, x1, x2, "t"); put(x2, y, "T") end

local function spy()
  -- หมวก fedora
  fill(3, 17, 22, "n"); fill(3, 25, 30, "n")
  fill(4, 16, 31, "n"); put(16, 4, "g"); put(31, 4, "N"); fill(4, 23, 24, "N")
  for y = 5, 10 do
    fill(y, 15, 32, "n"); put(15, y, "g"); fill(y, 31, 32, "N")
  end
  fill(5, 23, 24, "N")
  fill(11, 15, 32, "R"); fill(12, 15, 32, "R")
  fill(13, 6, 41, "n"); fill(13, 6, 7, "g"); fill(13, 40, 41, "N")
  fill(14, 7, 40, "N")

  -- หน้า
  local face = { [16] = { 14, 33 }, [17] = { 14, 33 }, [18] = { 14, 33 }, [19] = { 14, 33 }, [20] = { 14, 33 },
    [21] = { 14, 33 }, [22] = { 14, 33 }, [23] = { 15, 32 }, [24] = { 15, 32 }, [25] = { 16, 31 }, [26] = { 17, 30 } }
  for y, r in pairs(face) do fill(y, r[1], r[2], "s"); put(r[2], y, "S") end
  fill(15, 14, 33, "S")
  fill(26, 28, 30, "S")
  fill(27, 18, 29, "S")

  -- คิ้วตก (ปลายในยกขึ้น)
  fill(16, 16, 17, "B"); fill(15, 18, 20, "B")
  fill(15, 27, 29, "B"); fill(16, 30, 31, "B")

  -- แว่นดำ
  fill(18, 14, 33, "K")
  for y = 19, 20 do fill(y, 15, 22, "K"); fill(y, 25, 32, "K") end
  fill(21, 16, 21, "K"); fill(21, 26, 31, "K")
  put(17, 19, "w"); put(16, 20, "w"); put(27, 19, "w"); put(26, 20, "w")

  -- ยิ้มแหยะ กัดฟัน
  fill(23, 19, 28, "K")
  put(18, 24, "K"); fill(24, 19, 28, "w"); put(29, 24, "K")
  put(21, 24, "l"); put(26, 24, "l")
  fill(25, 19, 28, "K"); put(18, 25, "K"); put(29, 25, "K")

  -- ปกโค้ทตั้ง
  local collar = { { 21, 12, 13 }, { 22, 11, 13 }, { 23, 11, 14 }, { 24, 10, 14 }, { 25, 10, 15 }, { 26, 9, 16 }, { 27, 9, 17 } }
  for _, c in ipairs(collar) do
    coatL(c[1], c[2], c[3]); coatR(c[1], 47 - c[3], 47 - c[2])
  end
  -- อก: เสื้อเชิ้ต + เน็คไท
  local shirt = { { 28, 19, 28, 8, 39 }, { 29, 20, 27, 7, 40 }, { 30, 21, 26, 6, 41 }, { 31, 22, 25, 6, 41 },
    { 32, 23, 24, 6, 41 }, { 33, 23, 24, 6, 41 } }
  for _, s in ipairs(shirt) do
    local y = s[1]
    coatL(y, s[4], s[2] - 1); coatR(y, s[3] + 1, s[5])
    fill(y, s[2], s[3], "w"); put(s[3], y, "l")
    put(23, y, "r"); put(24, y, "R")
  end
  -- ลำตัว (แขนยกไปจับลูกกรง)
  for y = 34, 41 do coatL(y, 9, 23); coatR(y, 24, 38); put(24, y, "T") end
  fill(38, 10, 37, "b"); fill(39, 10, 37, "B")
  fill(38, 22, 25, "Y"); put(22, 38, "y"); fill(39, 22, 25, "Y"); put(25, 39, "O")
  fill(42, 9, 38, "T"); put(24, 42, "b")
  -- ขา + รองเท้า
  fill(43, 15, 20, "n"); put(15, 43, "g"); put(20, 43, "N")
  fill(44, 15, 20, "n"); put(15, 44, "g"); put(20, 44, "N")
  fill(43, 27, 32, "n"); put(27, 43, "g"); put(32, 43, "N")
  fill(44, 27, 32, "n"); put(27, 44, "g"); put(32, 44, "N")
  fill(45, 14, 20, "B"); fill(45, 14, 15, "b"); fill(46, 13, 20, "B")
  fill(45, 27, 33, "B"); fill(45, 27, 28, "b"); fill(46, 27, 34, "B")
end

local DROP = { ".a.", "waa", "aau", ".u." }

local function bars()
  for _, x in ipairs({ 2, 10, 34, 42 }) do
    for y = 1, 46 do
      put(x, y, "K"); put(x + 1, y, "l"); put(x + 2, y, "h"); put(x + 3, y, "K")
    end
  end
  for x = 1, 46 do put(x, 36, "K"); put(x, 37, "l"); put(x, 38, "h"); put(x, 39, "K") end
  for _, x in ipairs({ 3, 11, 35, 43 }) do put(x, 37, "w") end
end

local FIST = {
  "..KKKK..",
  ".KssssK.",
  "KsssssSK",
  "KSSSSSSK",
  "KsssssSK",
  "KSSSSSSK",
  ".KsssSK.",
  "..KKKK..",
}

local function frame(dx, dropR, dropL)
  g = {}
  for y = 1, H do
    g[y] = {}
    for x = 1, W do g[y][x] = "." end
  end
  ox = dx
  spy()
  if dropR then stamp(38, dropR, DROP) end
  if dropL then stamp(6, dropL, DROP) end
  ox = 0
  bars()
  stamp(8, 27, FIST)
  stamp(32, 27, FIST)
  local rows = {}
  for y = 1, H do rows[y] = table.concat(g[y]) end
  return table.concat(rows, "\n")
end

return {
  w = W, h = H,
  outline = "K",
  frames = { frame(0, 16, nil), frame(1, 17, 16), frame(0, 18, 17), frame(1, 19, 18) },
  duration = 140,
  tags = { { name = "loop", from = 1, to = 4 } },
}
