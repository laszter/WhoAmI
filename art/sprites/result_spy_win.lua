-- Spy ชนะ: สปายยิ้มเยาะ เลิกคิ้ว ชูแฟ้มลับ TOP SECRET ยืนในควันระเบิดควัน มีประกายวิบวับ
-- วาดด้วยพิกัด (0-based) บน canvas 48×48 แล้วแปลงเป็น pixel map
local W, H = 48, 48
local g

local function put(x, y, ch)
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

local function spy(glintX)
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

  -- คิ้ว: ซ้ายต่ำเรียบ ขวาเลิกขึ้น (หน้ากวนๆ)
  fill(16, 16, 20, "B")
  fill(15, 27, 30, "B"); put(31, 16, "B")

  -- แว่นดำ + แสงสะท้อน
  fill(18, 14, 33, "K")
  for y = 19, 20 do fill(y, 15, 22, "K"); fill(y, 25, 32, "K") end
  fill(21, 16, 21, "K"); fill(21, 26, 31, "K")
  put(glintX, 19, "w"); put(glintX - 1, 20, "w"); put(glintX + 10, 19, "w"); put(glintX + 9, 20, "w")

  -- ยิ้มมุมปาก
  fill(24, 20, 26, "B"); fill(23, 27, 28, "B"); put(27, 24, "S")

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
  for y = 30, 33 do put(10, y, "T") end
  -- ลำตัว: แขนซ้ายห้อย แขนขวายกถือแฟ้ม
  for y = 34, 39 do coatL(y, 6, 23); coatR(y, 24, 38); put(24, y, "T"); put(10, y, "T") end
  fill(38, 11, 37, "b"); fill(39, 11, 37, "B")
  fill(38, 22, 25, "Y"); put(22, 38, "y"); fill(39, 22, 25, "Y"); put(25, 39, "O")
  fill(40, 6, 8, "s"); put(9, 40, "S"); fill(41, 7, 8, "S")
  coatL(40, 11, 23); coatR(40, 24, 37); put(24, 40, "T")
  coatL(41, 10, 23); coatR(41, 24, 37); put(24, 41, "T")
  fill(42, 9, 38, "T"); put(24, 42, "b")
  -- ขา + รองเท้า
  fill(43, 15, 20, "n"); put(15, 43, "g"); put(20, 43, "N")
  fill(44, 15, 20, "n"); put(15, 44, "g"); put(20, 44, "N")
  fill(43, 27, 32, "n"); put(27, 43, "g"); put(32, 43, "N")
  fill(44, 27, 32, "n"); put(27, 44, "g"); put(32, 44, "N")
  fill(45, 14, 20, "B"); fill(45, 14, 15, "b"); fill(46, 13, 20, "B")
  fill(45, 27, 33, "B"); fill(45, 27, 28, "b"); fill(46, 27, 34, "B")
end

local function folder()
  -- กระดาษลับโผล่จากแฟ้ม
  for y = 16, 19 do fill(y, 35, 45, "K") end
  for y = 17, 19 do fill(y, 36, 44, "w"); put(44, y, "l") end
  fill(18, 37, 42, "h")
  -- ตัวแฟ้ม
  for y = 20, 31 do fill(y, 33, 46, "K") end
  for y = 21, 30 do fill(y, 34, 45, "Y"); put(34, y, "y"); put(45, y, "O") end
  fill(21, 34, 44, "y"); fill(30, 35, 45, "O")
  -- ตราประทับแดง TOP SECRET
  fill(23, 36, 43, "r"); fill(28, 36, 43, "r")
  for y = 24, 27 do put(36, y, "r"); put(43, y, "r") end
  fill(25, 38, 39, "r"); fill(25, 41, 42, "r")
  fill(26, 38, 40, "r"); put(42, 26, "r")
end

local FIST = {
  "..KKKK..",
  ".KssssK.",
  "KsssssSK",
  "KSSSSSSK",
  "KsssssSK",
  "KSSSSSSK",
  ".KsssSK.",
  "..KTTK..",
}

local function puff(cx, cy, r)
  for y = cy - r, cy + r do
    for x = cx - r, cx + r do
      local dx, dy = x - cx, y - cy
      if dx * dx + dy * dy <= r * r + r then
        local c = "l"
        if dx + dy < -r * 0.6 then c = "w" elseif dx + dy > r * 0.6 then c = "h" end
        put(x, y, c)
      end
    end
  end
end

local SMOKE = {
  { { 5, 41, 4 }, { 12, 43, 3 }, { 19, 44, 2 }, { 30, 44, 2 }, { 36, 43, 3 }, { 42, 40, 4 } },
  { { 5, 39, 4 }, { 11, 42, 4 }, { 18, 44, 2 }, { 29, 44, 2 }, { 36, 42, 4 }, { 43, 41, 3 } },
}

local BIG = { "..y..", "..y..", "yywyy", "..y..", "..y.." }
local SMALL = { ".y.", "ywy", ".y." }
local DOT = { "w" }

local function frame(glintX, smoke, sparkles)
  g = {}
  for y = 1, H do
    g[y] = {}
    for x = 1, W do g[y][x] = "." end
  end
  spy(glintX)
  folder()
  stamp(29, 27, FIST)
  for _, p in ipairs(SMOKE[smoke]) do puff(p[1], p[2], p[3]) end
  for _, s in ipairs(sparkles) do stamp(s[1], s[2], s[3]) end
  local rows = {}
  for y = 1, H do rows[y] = table.concat(g[y]) end
  return table.concat(rows, "\n")
end

return {
  w = W, h = H,
  outline = "K",
  frames = {
    frame(17, 1, { { 40, 4, BIG }, { 5, 8, SMALL } }),
    frame(17, 2, { { 41, 5, SMALL }, { 4, 7, BIG } }),
    frame(19, 1, { { 42, 6, DOT }, { 5, 8, SMALL }, { 7, 20, SMALL } }),
    frame(21, 2, { { 41, 5, SMALL }, { 6, 9, DOT }, { 6, 19, BIG } }),
  },
  duration = 160,
  tags = { { name = "loop", from = 1, to = 4 } },
}
