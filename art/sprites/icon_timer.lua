-- นาฬิกาทราย: ทรายไหลจากกระเปาะบนลงล่าง ใช้คู่กับตัวนับถอยหลัง
local glass = { -- แถว → { ซ้าย, ขวา }
  [3] = { 3, 12 }, [4] = { 3, 12 }, [5] = { 4, 11 }, [6] = { 5, 10 }, [7] = { 7, 8 },
  [8] = { 7, 8 }, [9] = { 5, 10 }, [10] = { 4, 11 }, [11] = { 3, 12 }, [12] = { 3, 12 },
}

-- top: แถวในกระเปาะบนที่มีทราย, stream: แถวที่ทรายกำลังตก, pile: แถว → { ซ้าย, ขวา } หรือ true = เต็มแถว
local function frame(top, neck, stream, pile)
  local c = ART.canvas(16, 16)
  c:rect(2, 1, 12, 1, "t"); c:rect(2, 2, 12, 1, "T"); c:set(13, 1, "T"); c:set(13, 2, "b")
  c:rect(2, 13, 12, 1, "t"); c:rect(2, 14, 12, 1, "T"); c:set(13, 13, "T"); c:set(13, 14, "b")
  for y, r in pairs(glass) do
    c:rect(r[1], y, r[2] - r[1] + 1, 1, "l")
    c:set(r[1], y, "w")
  end
  local first = true
  for y = 3, 7 do
    if top[y] then
      local r = glass[y]
      c:rect(r[1], y, r[2] - r[1] + 1, 1, first and "y" or "Y")
      first = false
    end
  end
  if neck then c:rect(7, 8, 2, 1, "Y") end
  for _, y in ipairs(stream) do c:set(7, y, "Y") end
  local surface = true
  for y = 9, 12 do
    local p = pile[y]
    if p then
      local r = p == true and glass[y] or p
      c:rect(r[1], y, r[2] - r[1] + 1, 1, surface and "y" or "Y")
      surface = false
    end
  end
  return c:str()
end

local function set(...)
  local s = {}
  for _, v in ipairs({ ... }) do s[v] = true end
  return s
end

return {
  w = 16, h = 16,
  outline = "K",
  frames = {
    frame(set(4, 5, 6, 7), true, { 9, 10, 11 }, { [12] = { 6, 9 } }),
    frame(set(5, 6, 7), true, { 9, 10 }, { [11] = { 6, 9 }, [12] = true }),
    frame(set(6, 7), true, { 9 }, { [10] = { 6, 9 }, [11] = true, [12] = true }),
    frame(set(7), true, {}, { [9] = { 7, 8 }, [10] = true, [11] = true, [12] = true }),
    frame(set(), false, {}, { [9] = { 6, 9 }, [10] = true, [11] = true, [12] = true }),
  },
  durations = { 350, 350, 350, 350, 600 },
  tags = { { name = "flow", from = 1, to = 5 } },
}
