-- กล่อง 9-slice (ตัดขอบ 8px) ใช้กับ CSS border-image
-- variant cream = กล่องสีครีมสำหรับเนื้อหาที่ต้องเด่น
local S = 24
local c = ART.canvas(S, S)
c:rect(1, 1, S - 2, S - 2, "n")
for i = 2, S - 3 do
  c:set(i, 1, "g"); c:set(1, i, "g")
  c:set(i, S - 2, "N"); c:set(S - 2, i, "N")
end
for _, p in ipairs({ { 1, 1 }, { S - 2, 1 }, { 1, S - 2 }, { S - 2, S - 2 } }) do c.px[p[2]][p[1]] = "." end

return {
  w = S, h = S,
  outline = "K",
  frames = { c:str() },
  variants = {
    cream = { n = "c", g = "w", N = "t" },
  },
}
