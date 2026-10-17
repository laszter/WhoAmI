'use client';

import { useEffect, useState, type CSSProperties } from 'react';

/** รูป pixel art จาก art/ (build ด้วย ./art/build.sh) ใช้ไฟล์ 1x แล้วขยายแบบ pixelated ให้คมทุกขนาด */
export function PixelImage({ src, w, h, scale, alt = '', className = '' }: {
  src: string; w: number; h: number; scale: number; alt?: string; className?: string;
}) {
  return (
    // ไฟล์ใน public/ เป็นภาพเล็กมาก และต้องไม่ผ่าน image optimizer (resample แล้วเบลอ)
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={w * scale}
      height={h * scale}
      draggable={false}
      className={`shrink-0 select-none [image-rendering:pixelated] ${className}`}
    />
  );
}

/** animation แบบแถบเฟรมแนวนอน (ค่า w/h/durations ตรงกับ public/assets/**\/*.json) */
export const SPRITES = {
  spy: { src: '/assets/characters/char_spy.png', w: 32, h: 32, durations: [1600, 70, 70, 70] },
  timer: { src: '/assets/icons/icon_timer.png', w: 16, h: 16, durations: [350, 350, 350, 350, 600] },
  spyWin: { src: '/assets/result/result_spy_win.png', w: 48, h: 48, durations: [160, 160, 160, 160] },
  citizensWin: { src: '/assets/result/result_citizens_win.png', w: 48, h: 48, durations: [140, 140, 140, 140] },
} as const;

export function PixelSprite({ sprite, scale, className = '' }: {
  sprite: keyof typeof SPRITES; scale: number; className?: string;
}) {
  const { src, w, h, durations } = SPRITES[sprite];
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setTimeout(() => setFrame((f) => (f + 1) % durations.length), durations[frame]);
    return () => clearTimeout(timer);
  }, [frame, durations]);

  const style: CSSProperties = {
    width: w * scale,
    height: h * scale,
    backgroundImage: `url(${src})`,
    backgroundSize: `${w * scale * durations.length}px ${h * scale}px`,
    backgroundPosition: `${-frame * w * scale}px 0`,
    imageRendering: 'pixelated',
  };
  return <span aria-hidden="true" className={`inline-block shrink-0 ${className}`} style={style} />;
}

/** ไอคอนสถานที่ตามชื่อใน src/shared/locations.ts */
const LOCATION_ICONS: Record<string, string> = {
  'โรงพยาบาล': 'loc_hospital',
  'โรงเรียน': 'loc_school',
  'ร้านหมูกระทะ': 'loc_mookata',
  'สนามบิน': 'loc_airport',
  'ชายหาด': 'loc_beach',
  'วัด': 'loc_temple',
  'รถไฟฟ้า BTS': 'loc_bts',
  'ตลาดนัด': 'loc_market',
  'โรงหนัง': 'loc_cinema',
  'ฟิตเนส': 'loc_gym',
  'คอนเสิร์ต': 'loc_concert',
  'ออฟฟิศ': 'loc_office',
  'ร้านกาแฟ': 'loc_cafe',
  'สวนสนุก': 'loc_amusement',
};

export function LocationIcon({ name, scale = 2, className = '' }: { name: string; scale?: number; className?: string }) {
  const icon = LOCATION_ICONS[name];
  if (!icon) return null;
  return <PixelImage src={`/assets/locations/${icon}.png`} w={32} h={32} scale={scale} className={className} />;
}
