-- ปุ่มตอนกด: หน้าปุ่มจมลง 2px ฐานเหลือ 1px (สลับกับ ui_button ใน :active)
local def = ART.load("ui_button")
def.frames = { def.button(true) }
return def
