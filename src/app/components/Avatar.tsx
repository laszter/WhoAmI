'use client';

import { useState } from 'react';
import { avatarColor, avatarSprite } from './helpers';

const SIZES = {
  sm: 'size-8 text-sm',
  md: 'size-11 text-lg',
  lg: 'size-14 text-2xl',
} as const;

interface Props {
  userId: string;
  name: string;
  pictureUrl?: string;
  size?: keyof typeof SIZES;
  className?: string;
}

/** รูปโปรไฟล์ LINE ถ้ามี (โหลดไม่ได้ → ตัวละคร pixel) */
export default function Avatar({ userId, pictureUrl, size = 'md', className = '' }: Props) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = !!pictureUrl && failedUrl !== pictureUrl;

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-display font-bold text-white ${SIZES[size]} ${showImage ? 'bg-slate-800' : avatarColor(userId)} ${className}`}
    >
      {showImage ? (
        // รูปโปรไฟล์มาจาก LINE CDN (โดเมนไม่แน่นอน) จึงใช้ <img> ธรรมดาแทน next/image
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={pictureUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={() => setFailedUrl(pictureUrl ?? null)}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarSprite(userId)} alt="" draggable={false} className="mt-[12%] size-full object-contain [image-rendering:pixelated]" />
      )}
    </span>
  );
}
