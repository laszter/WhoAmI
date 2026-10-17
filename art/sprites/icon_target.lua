-- เป้ายิง: คนที่ถูกโหวตมากที่สุด
local rings = {
  { { [2] = { 6, 9 }, [3] = { 4, 11 }, [4] = { 3, 12 }, [5] = { 3, 12 }, [6] = { 2, 13 }, [7] = { 2, 13 },
      [8] = { 2, 13 }, [9] = { 2, 13 }, [10] = { 3, 12 }, [11] = { 3, 12 }, [12] = { 4, 11 }, [13] = { 6, 9 } },
    "r", "R", "k" },
  { { [4] = { 6, 9 }, [5] = { 5, 10 }, [6] = { 4, 11 }, [7] = { 4, 11 }, [8] = { 4, 11 }, [9] = { 4, 11 },
      [10] = { 5, 10 }, [11] = { 6, 9 } },
    "w", "l", "w" },
  { { [6] = { 7, 8 }, [7] = { 6, 9 }, [8] = { 6, 9 }, [9] = { 7, 8 } }, "r", "R", "r" },
}

local c = ART.canvas(16, 16)
for _, ring in ipairs(rings) do
  local rows, base, shade, light = ring[1], ring[2], ring[3], ring[4]
  for y, r in pairs(rows) do
    for x = r[1], r[2] do
      local d = x + y - 15
      c.px[y][x] = d >= 4 and shade or (d <= -6 and light or base)
    end
  end
end

return {
  w = 16, h = 16,
  outline = "K",
  frames = { c:str() },
}
