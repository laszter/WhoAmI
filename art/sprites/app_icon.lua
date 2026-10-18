-- ไอคอน LINE MINI App ตามสเปก LINE: พื้น 130×130, โลโก้อยู่กลางขนาด 54–76px (แนะนำ)
-- canvas 52×52 = 130/2.5 → โลโก้ (หน้าอกสปาย + outline) 30×29px = 75×73px ที่ขนาดจริง
-- LINE ครอปขอบภาพอัตโนมัติ จึงห้ามมีอะไรสำคัญนอกโซนกลาง  build.sh export ×20 = 1040×1040
local W = 52

-- หน้าอกสปาย 28×27 วาดหยาบ ๆ ให้ยังอ่านออกตอนย่อเหลือ 40px: หมวก + แว่นดำคือ silhouette หลัก
local bust = ART.canvas(30, 29)
local function px(x, y, ch) bust:set(x + 1, y + 1, ch) end
local function box(x, y, w, h, ch) bust:rect(x + 1, y + 1, w, h, ch) end

-- หมวก fedora: ยอดบุ๋มกลาง, แถบแดง, ปีกกว้างเต็มความกว้าง
box(8, 0, 5, 1, "n")
box(15, 0, 5, 1, "n")
box(7, 1, 14, 4, "n")
box(7, 1, 1, 4, "g")
box(8, 2, 1, 2, "g")
box(20, 1, 1, 4, "N")
px(13, 1, "N")
px(14, 1, "N")
box(7, 5, 14, 1, "r")
box(7, 6, 14, 1, "R")
box(1, 7, 26, 1, "n")
box(2, 7, 3, 1, "g")
box(0, 8, 28, 1, "N")

-- หน้า + เงาใต้ปีกหมวก + เงาคาง (แยกหน้าออกจากโค้ท)
box(6, 9, 16, 9, "s")
box(7, 18, 14, 1, "S")
box(6, 9, 16, 1, "S")
box(21, 10, 1, 8, "S")

-- แว่นดำ 2 เลนส์ + สะพานแว่น + แสงสะท้อน
box(6, 11, 7, 3, "K")
box(7, 14, 5, 1, "K")
box(15, 11, 7, 3, "K")
box(16, 14, 5, 1, "K")
box(13, 11, 2, 1, "K")
box(8, 12, 2, 1, "w")
box(17, 12, 2, 1, "w")
px(11, 13, "n")
px(20, 13, "n")

-- ยิ้มมุมปาก
box(11, 16, 4, 1, "b")
px(15, 15, "b")

-- โค้ทสีเข้มกว่าผิว ให้หัวไม่กลืนกับตัว: ตัวโค้ท T, ปกตั้ง + ปกเสื้อ t, เสื้อเชิ้ต + เนกไทแดง
for y = 19, 26 do
  local x0 = math.max(2, 5 - (y - 19))
  box(x0, y, 28 - 2 * x0, 1, "T")
  px(x0, y, "t")
  px(27 - x0, y, "b")
end
px(5, 15, "c")
box(4, 16, 2, 1, "t")
box(3, 17, 3, 2, "t")
px(3, 17, "c")
px(22, 15, "t")
box(22, 16, 2, 1, "t")
box(22, 17, 3, 2, "t")
px(24, 18, "T")
for i = 0, 3 do
  box(8 + i, 19 + i, 2, 1, "t")
  box(18 - i, 19 + i, 2, 1, "t")
end
box(11, 19, 6, 1, "w")
box(12, 20, 4, 1, "w")
box(13, 19, 2, 1, "R")
box(13, 20, 2, 5, "r")
box(14, 21, 1, 4, "R")
bust:outline("K")

-- พื้น LINE green ทึบ + เงาแข็งเยื้องขวาล่าง 2px ให้ตัวโลโก้ลอยจากพื้น
local c = ART.canvas(W, W, "L")
local shadow = ART.canvas(30, 29)
for y = 0, 28 do
  for x = 0, 29 do
    if bust:get(x, y) ~= "." then shadow:set(x, y, "G") end
  end
end
local ox, oy = 11, 11
c:over(shadow, ox + 2, oy + 2)
c:over(bust, ox, oy)

return {
  w = W, h = W,
  frames = { c:str() },
}
