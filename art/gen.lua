-- แปลง art/sprites/*.lua (ASCII pixel map) → art/aseprite/*.aseprite
-- รัน: aseprite -b --script-param root=<project> [--script-param only=loc_*,icon_crown] --script art/gen.lua
--
-- รูปแบบไฟล์ sprite:
--   return {
--     w = 32, h = 32,
--     frames = { [[ ...แถวละ w ตัวอักษร h แถว... ]], ... },
--     duration = 120,              -- ms ต่อเฟรม (หรือ durations = { 120, 80 })
--     tags = { { name = "idle", from = 1, to = 4, dir = "forward" } },  -- มี tag = export เป็น animation
--     outline = "K",               -- (ไม่บังคับ) เติมขอบรอบพิกเซลทึบอัตโนมัติ
--     variants = { red = { u = "r", U = "R" } },  -- (ไม่บังคับ) สร้างไฟล์ <name>_red โดยสลับสี
--   }

local root = assert(app.params.root, "ต้องส่ง --script-param root=<project>")
local fs = app.fs
local artDir = fs.joinPath(root, "art")
local outDir = fs.joinPath(artDir, "aseprite")
fs.makeAllDirectories(outDir)

local paletteDef = dofile(fs.joinPath(artDir, "palette.lua"))
local colors = {}
local palette = Palette(#paletteDef + 1)
palette:setColor(0, Color { r = 0, g = 0, b = 0, a = 0 })
for i, entry in ipairs(paletteDef) do
  local hex = entry[2]
  local r, g, b = tonumber(hex:sub(1, 2), 16), tonumber(hex:sub(3, 4), 16), tonumber(hex:sub(5, 6), 16)
  colors[entry[1]] = app.pixelColor.rgba(r, g, b, 255)
  palette:setColor(i, Color { r = r, g = g, b = b, a = 255 })
end

local only = nil
if app.params.only and app.params.only ~= "" then
  only = {}
  for pat in app.params.only:gmatch("[^,]+") do
    only[#only + 1] = "^" .. pat:gsub("%*", ".*") .. "$"
  end
end

local function wanted(name)
  if not only then return true end
  for _, pat in ipairs(only) do
    if name:match(pat) then return true end
  end
  return false
end

local function splitRows(text)
  local rows = {}
  for line in (text .. "\n"):gmatch("(.-)\r?\n") do
    line = line:match("^%s*(.-)%s*$")
    if line ~= "" then rows[#rows + 1] = line end
  end
  return rows
end

-- helper ให้ไฟล์ sprite ใช้สร้างเฟรมใหม่จากเฟรมเดิม
-- ART.edit(frame, { { x, y, "ccc" }, ... })  เขียนทับเริ่มที่ (x, y) แบบ 0-based
ART = {
  edit = function(text, edits)
    local rows = splitRows(text)
    for _, e in ipairs(edits) do
      local x, y, s = e[1], e[2], e[3]
      local row = rows[y + 1]
      rows[y + 1] = row:sub(1, x) .. s .. row:sub(x + #s + 1)
    end
    return table.concat(rows, "\n")
  end,
}

-- ART.load("char_spy") คืน def ของ sprite อื่น, ART.crop(frame, x, y, w, h) ตัดบางส่วนของเฟรม
function ART.load(name)
  return dofile(fs.joinPath(artDir, "sprites", name .. ".lua"))
end

function ART.crop(text, x, y, w, h)
  local rows = splitRows(text)
  local out = {}
  for i = y + 1, y + h do out[#out + 1] = rows[i]:sub(x + 1, x + w) end
  return table.concat(out, "\n")
end

-- ART.canvas(w, h) สำหรับ sprite ที่วาดด้วยโค้ด (กรอบ, pattern, ตัวอักษร) พิกัด 0-based
local Canvas = {}
Canvas.__index = Canvas

function ART.canvas(w, h, fill)
  local c = setmetatable({ w = w, h = h, px = {} }, Canvas)
  for y = 0, h - 1 do
    c.px[y] = {}
    for x = 0, w - 1 do c.px[y][x] = fill or "." end
  end
  return c
end

function Canvas:get(x, y)
  return self.px[y] and self.px[y][x] or "."
end

function Canvas:set(x, y, ch)
  if x >= 0 and y >= 0 and x < self.w and y < self.h and ch ~= "." then self.px[y][x] = ch end
end

function Canvas:rect(x, y, w, h, ch)
  for yy = y, y + h - 1 do
    for xx = x, x + w - 1 do self:set(xx, yy, ch) end
  end
end

-- วาง ASCII ทับ โดยข้าม "."
function Canvas:blit(text, x, y)
  for i, row in ipairs(splitRows(text)) do
    for j = 1, #row do self:set(x + j - 1, y + i - 1, row:sub(j, j)) end
  end
end

-- วาง canvas อื่นทับ
function Canvas:over(other, x, y)
  for yy = 0, other.h - 1 do
    for xx = 0, other.w - 1 do self:set(x + xx, y + yy, other.px[yy][xx]) end
  end
end

-- เติมขอบรอบพิกเซลทึบ (4 ทิศ) ลงในพิกเซลโปร่งใส
function Canvas:outline(ch)
  local marks = {}
  for y = 0, self.h - 1 do
    for x = 0, self.w - 1 do
      if self.px[y][x] == "." and (self:get(x - 1, y) ~= "." or self:get(x + 1, y) ~= "."
          or self:get(x, y - 1) ~= "." or self:get(x, y + 1) ~= ".") then
        marks[#marks + 1] = { x, y }
      end
    end
  end
  for _, m in ipairs(marks) do self.px[m[2]][m[1]] = ch end
end

function Canvas:str()
  local rows = {}
  for y = 0, self.h - 1 do
    local row = {}
    for x = 0, self.w - 1 do row[#row + 1] = self.px[y][x] end
    rows[#rows + 1] = table.concat(row)
  end
  return table.concat(rows, "\n")
end

local function parseFrame(name, index, text, w, h)
  local rows = splitRows(text)
  if #rows ~= h then
    error(("%s เฟรม %d: มี %d แถว ต้องเป็น %d"):format(name, index, #rows, h))
  end
  local grid = {}
  for y, row in ipairs(rows) do
    if #row ~= w then
      error(("%s เฟรม %d แถว %d: กว้าง %d ต้องเป็น %d  [%s]"):format(name, index, y, #row, w, row))
    end
    grid[y] = {}
    for x = 1, w do
      local ch = row:sub(x, x)
      if ch ~= "." and not colors[ch] then
        error(("%s เฟรม %d แถว %d คอลัมน์ %d: ไม่รู้จักสี '%s'"):format(name, index, y, x, ch))
      end
      grid[y][x] = ch
    end
  end
  return grid
end

local function addOutline(grid, w, h, ch)
  local out = {}
  for y = 1, h do
    out[y] = {}
    for x = 1, w do
      local c = grid[y][x]
      if c == "." then
        local n = (grid[y - 1] and grid[y - 1][x] or ".") ~= "."
          or (grid[y + 1] and grid[y + 1][x] or ".") ~= "."
          or (grid[y][x - 1] or ".") ~= "."
          or (grid[y][x + 1] or ".") ~= "."
        if n then c = ch end
      end
      out[y][x] = c
    end
  end
  return out
end

local function build(name, def, grids, swap)
  local w, h = def.w, def.h
  local spr = Sprite(w, h, ColorMode.RGB)
  spr:setPalette(palette)
  spr.layers[1].name = "art"
  for i, grid in ipairs(grids) do
    if i > 1 then spr:newEmptyFrame() end
    local img = Image(w, h, ColorMode.RGB)
    for y = 1, h do
      for x = 1, w do
        local ch = grid[y][x]
        if swap and swap[ch] then ch = swap[ch] end
        if ch ~= "." then img:drawPixel(x - 1, y - 1, colors[ch]) end
      end
    end
    spr:newCel(spr.layers[1], i, img, Point(0, 0))
    local ms = (def.durations and def.durations[i]) or def.duration or 100
    spr.frames[i].duration = ms / 1000
  end
  for _, t in ipairs(def.tags or {}) do
    local tag = spr:newTag(t.from, t.to)
    tag.name = t.name
    if t.dir == "pingpong" then tag.aniDir = AniDir.PING_PONG
    elseif t.dir == "reverse" then tag.aniDir = AniDir.REVERSE end
  end
  spr:saveAs(fs.joinPath(outDir, name .. ".aseprite"))
  spr:close()
  print("  ✓ " .. name)
end

local spriteDir = fs.joinPath(artDir, "sprites")
local files = fs.listFiles(spriteDir)
table.sort(files)
local count, failed = 0, 0
for _, file in ipairs(files) do
  local name = file:match("^(.-)%.lua$")
  if name and wanted(name) then
    local ok, err = pcall(function()
      local def = dofile(fs.joinPath(spriteDir, file))
      local grids = {}
      for i, text in ipairs(def.frames) do
        local grid = parseFrame(name, i, text, def.w, def.h)
        if def.outline then grid = addOutline(grid, def.w, def.h, def.outline) end
        grids[i] = grid
      end
      build(name, def, grids, nil)
      count = count + 1
      for suffix, swap in pairs(def.variants or {}) do
        build(name .. "_" .. suffix, def, grids, swap)
        count = count + 1
      end
    end)
    if not ok then
      failed = failed + 1
      print("  ✗ " .. tostring(err))
    end
  end
end
print(("gen: สร้าง %d ไฟล์, ผิดพลาด %d"):format(count, failed))
