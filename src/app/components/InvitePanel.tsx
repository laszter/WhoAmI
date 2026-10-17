'use client';

import { useMemo, useRef, useState } from 'react';
import { create as createQr } from 'qrcode';
import type { GameClient } from '@/lib/game-client';
import { LIMITS } from '@/shared/types';
import Button from './Button';
import Toast, { useToast } from './Toast';
import { copyText, selectElementText } from './helpers';

const QR_MARGIN = 2; // quiet zone (หน่วย = module)

/** QR เป็น SVG path เดียว — สร้างแบบ sync จึง render ได้ทั้ง SSR และ client ไม่มีจังหวะว่าง */
function QrCode({ value, className = '' }: { value: string; className?: string }) {
  const qr = useMemo(() => {
    try {
      const { modules } = createQr(value, { errorCorrectionLevel: 'M' });
      const n = modules.size;
      let d = '';
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          if (modules.get(x, y)) d += `M${x + QR_MARGIN} ${y + QR_MARGIN}h1v1h-1z`;
        }
      }
      return { size: n + QR_MARGIN * 2, d };
    } catch {
      return null;
    }
  }, [value]);

  if (!qr) return null;
  return (
    <svg
      role="img"
      aria-label="QR เข้าห้อง"
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={qr.size} height={qr.size} fill="#fff" />
      <path d={qr.d} fill="#0f172a" />
    </svg>
  );
}

export default function InvitePanel({ game }: { game: GameClient }) {
  const { room, inviteUrl, actions } = game;
  const [sharing, setSharing] = useState(false);
  const [showLink, setShowLink] = useState(false); // แสดงลิงก์ดิบให้กดค้างคัดลอกเอง เมื่อ clipboard ใช้ไม่ได้
  const codeRef = useRef<HTMLParagraphElement>(null);
  const toast = useToast();

  if (!room) return null;

  const count = room.players.length;
  const full = count >= LIMITS.MAX_PLAYERS;

  const copyCode = async (okMsg: string) => {
    if (await copyText(room.code)) {
      toast.show(okMsg);
    } else {
      selectElementText(codeRef.current);
      toast.show('คัดลอกไม่ได้ กดค้างที่โค้ดเพื่อคัดลอกเอง');
    }
  };

  const copyLink = async (url: string, okMsg: string) => {
    if (await copyText(url)) {
      toast.show(okMsg);
    } else {
      setShowLink(true);
      toast.show('คัดลอกไม่ได้ กดค้างที่ลิงก์ใต้ QR เพื่อคัดลอกเอง');
    }
  };

  const onCopyCode = () => void copyCode('คัดลอกโค้ดแล้ว');
  const onCopyLink = () => {
    if (inviteUrl) void copyLink(inviteUrl, 'คัดลอกลิงก์แล้ว');
  };

  const onShare = async () => {
    setSharing(true);
    try {
      const r = await actions.shareInvite();
      if (r === 'shared') {
        toast.show('ส่งคำเชิญแล้ว');
      } else if (r === 'unavailable') {
        if (inviteUrl) await copyLink(inviteUrl, 'คัดลอกลิงก์แล้ว วางในแชทได้เลย');
        else await copyCode('คัดลอกโค้ดแล้ว ส่งให้เพื่อนได้เลย');
      }
      // 'cancelled' → ผู้ใช้ปิด picker เอง ไม่ต้องทำอะไร
    } catch {
      toast.show('ส่งคำเชิญไม่สำเร็จ ส่งโค้ดห้องให้เพื่อนแทน');
    } finally {
      setSharing(false);
    }
  };

  return (
    <section className="flex flex-col items-center gap-4 rounded-2xl bg-slate-900/70 p-4 ring-1 ring-slate-800">
      <div className="flex flex-col items-center gap-2">
        <p className="text-base text-slate-400">โค้ดห้อง</p>
        <p ref={codeRef} aria-label={`โค้ดห้อง ${room.code.split('').join(' ')}`} className="flex gap-2 select-all">
          {room.code.split('').map((ch, i) => (
            <span
              key={i}
              className="flex h-16 w-14 items-center justify-center rounded-2xl bg-slate-950 font-display text-4xl font-bold text-slate-50 shadow-[inset_0_-4px_0_rgb(2_6_23)] ring-1 ring-slate-700"
            >
              {ch}
            </span>
          ))}
        </p>
      </div>

      {full ? (
        <p className="w-full rounded-xl bg-slate-950/60 px-4 py-5 text-center font-display text-xl font-semibold text-slate-200 ring-1 ring-slate-800">
          ห้องเต็มแล้ว ({count}/{LIMITS.MAX_PLAYERS})
        </p>
      ) : (
        <>
          {inviteUrl ? (
            <div className="flex flex-col items-center gap-2">
              <div className="rounded-2xl bg-white p-2 shadow-[0_10px_30px_-12px_rgb(0_0_0/0.8)]">
                <QrCode value={inviteUrl} className="block h-52 w-52" />
              </div>
              <p className="text-center text-sm text-slate-400">ให้เพื่อนสแกนด้วยกล้อง LINE</p>
              {(game.isDev || showLink) && (
                <p className="max-w-full break-all text-center font-mono text-xs text-slate-500 select-all">
                  {inviteUrl}
                </p>
              )}
            </div>
          ) : (
            <p className="text-center text-sm text-slate-400">ให้เพื่อนกรอกโค้ดนี้ที่หน้าแรก</p>
          )}

          <Button onClick={() => void onShare()} disabled={sharing}>
            ส่งคำเชิญใน LINE
          </Button>
        </>
      )}

      <div className={`grid w-full gap-2 ${full ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {!full && (
          <Button variant="secondary" onClick={onCopyLink} disabled={!inviteUrl}>
            คัดลอกลิงก์
          </Button>
        )}
        <Button variant="secondary" onClick={onCopyCode}>
          คัดลอกโค้ด
        </Button>
      </div>

      <Toast message={toast.message} />
    </section>
  );
}
