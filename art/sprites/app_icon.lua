-- ไอคอน LINE MINI App: สปายครึ่งตัวบนพื้น LINE green ทึบทั้งภาพ (build.sh export 512×512 ให้)
local spy = ART.load("char_spy").frames[1]
local c = ART.canvas(32, 32, "L")

-- เงาจางด้านขวาล่างให้พื้นไม่แบน
for y = 0, 31 do
  for x = 0, 31 do
    if x + y > 44 then c:set(x, y, "G") end
  end
end

-- หัว + ลำตัวช่วงบน (char_spy แถว 2–22) แล้วต่อแถว 22 ลงไปจนชนขอบล่าง
local body = ART.canvas(26, 29)
body:blit(ART.crop(spy, 4, 2, 24, 21), 1, 1)
local last = ART.crop(spy, 4, 22, 24, 1)
for y = 22, 28 do body:blit(last, 1, y) end
body:outline("K")
c:over(body, 3, 4)

return {
  w = 32, h = 32,
  frames = { c:str() },
}
