'use client';

import { useState, type KeyboardEvent } from 'react';
import type { PrivateCard } from '@/shared/types';
import { LocationIcon, PixelImage, PixelSprite } from './Pixel';

/**
 * การ์ดลับ: ปิดไว้จนกว่าจะกดค้าง ปล่อยนิ้วแล้วปิดเอง
 * หน้าปกตอนปิดเหมือนกันทุกคน (ไม่ render เนื้อหาจริงไว้ใต้ blur) — คนข้าง ๆ จะเดาไม่ได้จากสี/ขนาดว่าใครเป็น Spy
 */
export default function RoleCard({ card }: { card: PrivateCard | null }) {
  const [revealed, setRevealed] = useState(false);

  if (!card) {
    return (
      <div className="flex min-h-[26rem] flex-col items-center justify-center gap-3 rounded-3xl bg-slate-900/70 p-6 text-slate-400 ring-1 ring-slate-800">
        <Spinner />
        <p className="text-base">กำลังรับการ์ด…</p>
      </div>
    );
  }

  const show = () => setRevealed(true);
  const hide = () => setRevealed(false);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      show();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') hide();
  };

  const tone = !revealed
    ? 'bg-slate-900 ring-slate-700'
    : card.isSpy
      ? 'bg-red-950/60 ring-red-500/70 shadow-[0_0_60px_-20px_rgb(239_68_68/0.8)]'
      : 'bg-indigo-950/60 ring-indigo-400/60 shadow-[0_0_60px_-20px_rgb(99_102_241/0.8)]';

  return (
    <div className="flex flex-col gap-2">
      <div
        role="button"
        tabIndex={0}
        aria-pressed={revealed}
        aria-label="การ์ดลับของคุณ กดค้างไว้เพื่อดู"
        onPointerDown={show}
        onPointerUp={hide}
        onPointerLeave={hide}
        onPointerCancel={hide}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={hide}
        className={`relative flex min-h-[26rem] cursor-pointer touch-none flex-col overflow-hidden rounded-3xl p-5 ring-2 transition-[background-color,box-shadow] duration-150 select-none [-webkit-touch-callout:none] [-webkit-user-select:none] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-300 ${tone}`}
      >
        {!revealed ? <Cover /> : card.isSpy ? <SpyFace locations={card.locations} /> : <CitizenFace location={card.location} role={card.role} />}
      </div>
      <p className="text-center text-sm text-slate-400">แอบดูแล้วปล่อยนิ้ว อย่าให้คนข้าง ๆ เห็น</p>
    </div>
  );
}

function Cover() {
  return (
    <div className="bg-hatch absolute inset-0 flex flex-col items-center justify-center gap-5 p-6">
      <span className="absolute top-5 left-5 font-display text-base font-semibold text-slate-400">แฟ้มลับ</span>
      <span className="absolute top-4 right-4 -rotate-6 rounded-md border-2 border-slate-500/70 px-2 py-0.5 font-display text-sm font-bold text-slate-400">
        เฉพาะคุณ
      </span>
      <PixelImage src="/assets/ui/card_back.png" w={48} h={64} scale={3} />
      <p className="font-display text-2xl font-semibold text-slate-100">กดค้างไว้เพื่อดูการ์ด</p>
    </div>
  );
}

function CitizenFace({ location, role }: { location: string; role: string }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <LocationIcon name={location} scale={4} className="self-center" />
      <div>
        <p className="text-sm text-indigo-200/80">สถานที่</p>
        <p className="font-display text-4xl leading-tight font-bold text-white">{location}</p>
      </div>
      <div className="h-px bg-indigo-400/30" />
      <div>
        <p className="text-sm text-indigo-200/80">บทบาทของคุณ</p>
        <p className="font-display text-3xl leading-tight font-semibold text-indigo-100">{role}</p>
      </div>
      <p className="text-base text-indigo-100/80">ตอบให้คนในทีมรู้ว่าคุณรู้สถานที่ แต่อย่าพูดชื่อตรง ๆ จน Spy เดาได้</p>
    </div>
  );
}

function SpyFace({ locations }: { locations: string[] }) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center gap-3">
        <PixelSprite sprite="spy" scale={3} />
        <div>
          <p className="font-display text-4xl leading-tight font-bold text-red-300">คุณคือ SPY</p>
          <p className="mt-1 text-base text-red-100/80">คุณไม่รู้ว่าทุกคนอยู่ที่ไหน ฟังคำตอบแล้วตีเนียนให้รอด</p>
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm text-red-200/70">สถานที่ที่เป็นไปได้</p>
        <ul className="grid grid-cols-2 gap-1.5">
          {locations.map((name) => (
            <li key={name} className="flex items-center gap-1.5 rounded-lg bg-red-500/10 py-1 pr-2.5 pl-1 text-sm text-red-50 ring-1 ring-inset ring-red-400/20">
              <LocationIcon name={name} scale={1} />
              <span className="truncate">{name}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Spinner() {
  return <span aria-hidden="true" className="size-6 animate-spin rounded-full border-2 border-slate-600 border-t-indigo-400" />;
}
