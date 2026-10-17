-- ลูกศรวนตามเข็ม: เล่นอีกรอบ
local outer = { [3] = { 6, 9 }, [4] = { 4, 11 }, [5] = { 3, 12 }, [6] = { 3, 12 }, [7] = { 2, 13 }, [8] = { 2, 13 },
  [9] = { 2, 13 }, [10] = { 2, 13 }, [11] = { 3, 12 }, [12] = { 3, 12 }, [13] = { 4, 11 }, [14] = { 6, 9 } }
local inner = { [5] = { 6, 9 }, [6] = { 5, 10 }, [7] = { 4, 11 }, [8] = { 4, 11 }, [9] = { 4, 11 }, [10] = { 4, 11 },
  [11] = { 5, 10 }, [12] = { 6, 9 } }

local function inside(t, x, y)
  local r = t[y]
  return r ~= nil and x >= r[1] and x <= r[2]
end

local c = ART.canvas(16, 16)
for y = 3, 14 do
  for x = 2, 13 do
    if inside(outer, x, y) and not inside(inner, x, y) and not (x >= 9 and y <= 7) then
      local edge = not inside(outer, x - 1, y) or not inside(outer, x + 1, y)
        or not inside(outer, x, y - 1) or not inside(outer, x, y + 1)
      local d = (x - 7.5) + (y - 8.5)
      c:set(x, y, edge and (d < 0 and "a" or (d > 2 and "U" or "u")) or "u")
    end
  end
end
-- หัวลูกศรชี้ขวาที่ปลายส่วนโค้งด้านบน
c:blit([[
a..
uu.
uuu
uuU
uU.
U..
]], 9, 1)

return {
  w = 16, h = 16,
  outline = "K",
  frames = { c:str() },
}
