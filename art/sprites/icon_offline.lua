-- ขีดสัญญาณสีเทา + กากบาทแดง: ผู้เล่นหลุดการเชื่อมต่อ (online = false)
local c = ART.canvas(16, 16)
for i, top in ipairs({ 11, 8, 5, 2 }) do
  local x = 2 + (i - 1) * 3
  c:rect(x, top, 1, 14 - top, "l")
  c:rect(x + 1, top, 1, 14 - top, "h")
end
c:blit([[
rr.rr
.rrR.
..R..
.rRR.
RR.RR
]], 1, 1)

return {
  w = 16, h = 16,
  outline = "K",
  frames = { c:str() },
}
