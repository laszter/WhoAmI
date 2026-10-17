-- ปุ่ม 9-slice (ตัดขอบ 8px) หน้าปุ่ม + ฐานนูน 3px  คู่กับ ui_button_pressed
-- สีหลัก = LINE green, variant: red (ยกเลิก/ออก), gray (รอง/disabled), gold (โหวต)
local S = 24
local LIP = 3

local function button(pressed)
  local c = ART.canvas(S, S)
  local top = pressed and LIP - 1 or 0
  local faceH = S - 2 - LIP
  c:rect(1, 1 + top, S - 2, faceH, "L")
  for x = 2, S - 3 do c:set(x, 1 + top, "v") end
  for y = 2 + top, faceH + top - 1 do c:set(1, y, "v") end
  local lipRows = pressed and 1 or LIP
  for i = 0, lipRows - 1 do
    c:rect(1, 1 + top + faceH + i, S - 2, 1, i == 0 and "G" or "E")
  end
  local bottom = top + faceH + lipRows
  for _, p in ipairs({ { 1, 1 + top }, { S - 2, 1 + top }, { 1, bottom }, { S - 2, bottom } }) do
    c.px[p[2]][p[1]] = "."
  end
  return c:str()
end

return {
  button = button,
  w = S, h = S,
  outline = "K",
  frames = { button(false) },
  variants = {
    red = { L = "r", v = "k", G = "R", E = "B" },
    gray = { L = "h", v = "l", G = "g", E = "n" },
    gold = { L = "Y", v = "y", G = "O", E = "x" },
  },
}
