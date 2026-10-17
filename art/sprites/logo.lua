-- โลโก้ "SPY PARTY" ใส่หมวกสปาย  ใช้บนหน้า HOME
local GLYPHS = {
  S = { ".####.", "##..##", "##....", ".####.", "....##", "##..##", ".####." },
  P = { "#####.", "##..##", "##..##", "#####.", "##....", "##....", "##...." },
  Y = { "##..##", "##..##", ".####.", "..##..", "..##..", "..##..", "..##.." },
  A = { ".####.", "##..##", "##..##", "######", "##..##", "##..##", "##..##" },
  R = { "#####.", "##..##", "##..##", "#####.", "##.##.", "##..##", "##..##" },
  T = { "######", "..##..", "..##..", "..##..", "..##..", "..##..", "..##.." },
}
local GW, GH = 6, 7

local function textWidth(text, scale, gap)
  return #text * GW * scale + (#text - 1) * gap
end

-- colorAt(row) คืนสีตามแถว (ทำ gradient) และวาดเงาเลื่อน 1px ไปขวาล่าง
local function drawText(c, text, x, y, scale, gap, colorAt, shadow)
  for pass = 1, 2 do
    local cx = x
    for i = 1, #text do
      local g = GLYPHS[text:sub(i, i)]
      for gy = 1, GH do
        for gx = 1, GW do
          if g[gy]:sub(gx, gx) == "#" then
            for sy = 0, scale - 1 do
              for sx = 0, scale - 1 do
                local px, py = cx + (gx - 1) * scale + sx, y + (gy - 1) * scale + sy
                if pass == 1 then
                  c:set(px + 1, py + 1, shadow)
                else
                  c:set(px, py, colorAt((gy - 1) * scale + sy))
                end
              end
            end
          end
        end
      end
      cx = cx + GW * scale + gap
    end
  end
end

local W, H = 48, 36
local c = ART.canvas(W, H)

local hat = ART.crop(ART.load("char_spy").frames[1], 4, 2, 24, 8)
local spyW = textWidth("SPY", 2, 2)
local partyW = textWidth("PARTY", 1, 2)
local spyX, spyY = math.floor((W - spyW) / 2), 10
local partyX, partyY = math.floor((W - partyW) / 2), 27

drawText(c, "SPY", spyX, spyY, 2, 2, function(row)
  if row < 4 then return "w" elseif row < 10 then return "l" else return "h" end
end, "R")
drawText(c, "PARTY", partyX, partyY, 1, 2, function(row)
  if row < 3 then return "y" else return "Y" end
end, "x")
c:blit(hat, math.floor((W - 24) / 2), spyY - 8)

return {
  w = W, h = H,
  outline = "K",
  frames = { c:str() },
}
