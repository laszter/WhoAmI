-- พื้นหลังหน้าเว็บแบบ repeat (background-repeat) สีกรมเข้ม มีหมวกกับ ? จางๆ
local c = ART.canvas(32, 32, "N")

local hat = [[
..nnn..
.nnnnn.
.nnnnn.
nnnnnnn
]]
local q = [[
nnn
..n
.nn
...
.n.
]]
c:blit(hat, 3, 5)
c:blit(q, 22, 20)
for _, p in ipairs({ { 22, 6 }, { 6, 22 }, { 14, 14 }, { 30, 30 } }) do c:set(p[1], p[2], "n") end

return {
  w = 32, h = 32,
  frames = { c:str() },
}
