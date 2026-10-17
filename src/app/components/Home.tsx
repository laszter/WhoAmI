'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import type { GameClient } from '@/lib/game-client';
import { LIMITS, ROOM_CODE_LENGTH } from '@/shared/types';
import Avatar from './Avatar';
import Button from './Button';
import { PixelImage, PixelSprite } from './Pixel';
import { useAction } from './use-action';

export default function Home({ game }: { game: GameClient }) {
  const { me, actions, pendingInviteCode, inviteError } = game;
  const [code, setCode] = useState(inviteError?.code ?? '');
  const { busy, error, run } = useAction();

  // ลิงก์เชิญใช้ไม่ได้ → เติมโค้ดจากลิงก์ไว้ในช่องให้ (ปรับ state ระหว่าง render ตามแบบของ React แทน effect)
  const [seenInviteError, setSeenInviteError] = useState(inviteError);
  if (seenInviteError !== inviteError) {
    setSeenInviteError(inviteError);
    if (inviteError) setCode(inviteError.code);
  }

  const locked = busy || pendingInviteCode !== null; // กำลังเข้าห้องจากลิงก์เชิญ → ห้ามกดซ้อน
  const canJoin = code.length === ROOM_CODE_LENGTH && !locked;
  // error ที่ไม่ fatal จาก useGame (เช่น ลิงก์เชิญใช้ไม่ได้ / ห้องเดิมหายไป) — ถูกล้างเองเมื่อเข้าห้องสำเร็จ
  const notice = !error && game.error ? game.error : null;

  const onJoin = (e: FormEvent) => {
    e.preventDefault();
    if (!canJoin) return;
    void run(() => actions.joinRoom(code));
  };

  return (
    <>
      <section className="flex flex-col gap-3 pt-6 pb-2">
        <div className="flex items-end justify-between gap-2">
          <h1>
            <PixelImage src="/assets/misc/logo.png" w={48} h={36} scale={4} alt="Spy Party" />
          </h1>
          <PixelSprite sprite="spy" scale={3} />
        </div>
        <p className="font-display text-2xl font-semibold text-indigo-200">หนึ่งในพวกคุณคือสายลับ</p>
        <p className="max-w-[34ch] text-base text-slate-400">
          ทุกคนรู้ว่าอยู่ที่ไหน ยกเว้น Spy คนเดียว ถามตอบให้เนียน แล้วโหวตจับตัวให้ได้
        </p>
      </section>

      {me && (
        <div className="flex items-center gap-3 rounded-2xl bg-slate-900/70 px-3 py-2.5 ring-1 ring-slate-800">
          <Avatar userId={me.userId} name={me.name} pictureUrl={me.pictureUrl} />
          <p className="min-w-0 truncate text-base text-slate-300">
            เล่นในชื่อ <span className="font-semibold text-slate-50">{me.name}</span>
          </p>
        </div>
      )}

      {inviteError && (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl bg-amber-400/10 p-4 ring-1 ring-amber-400/30">
          <p className="text-base text-amber-200">
            เข้าห้อง <span className="font-display font-bold tracking-wider">{inviteError.code}</span> ไม่ได้:{' '}
            {inviteError.message}
          </p>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              disabled={locked}
              onClick={() => void run(() => actions.joinRoom(inviteError.code))}
            >
              ลองอีกครั้ง
            </Button>
            <Button variant="ghost" disabled={locked} onClick={() => actions.clearInviteError()}>
              ปิด
            </Button>
          </div>
        </div>
      )}

      {notice && (
        <p role="alert" className="rounded-2xl bg-amber-400/10 px-4 py-3 text-base text-amber-200 ring-1 ring-amber-400/30">
          {notice}
        </p>
      )}

      {pendingInviteCode ? (
        <div
          role="status"
          className="flex flex-col items-center gap-3 rounded-2xl bg-slate-900/70 px-4 py-8 ring-1 ring-slate-800"
        >
          <span className="size-8 animate-spin rounded-full border-4 border-slate-700 border-t-indigo-400" aria-hidden />
          <p className="text-lg text-slate-200">
            กำลังเข้าห้อง{' '}
            <span className="font-display font-bold tracking-wider text-slate-50">{pendingInviteCode}</span>…
          </p>
        </div>
      ) : (
        <>
          <Button onClick={() => void run(() => actions.createRoom())} disabled={locked} className="min-h-14 text-xl">
            สร้างห้อง
          </Button>

          <form onSubmit={onJoin} className="flex flex-col gap-3 rounded-2xl bg-slate-900/70 p-4 ring-1 ring-slate-800">
            <label htmlFor="room-code" className="text-base font-medium text-slate-200">
              มีโค้ดห้องจากเพื่อน?
            </label>
            <div className="flex flex-col gap-3">
              <input
                id="room-code"
                name="room-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH))}
                maxLength={ROOM_CODE_LENGTH}
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                enterKeyHint="go"
                placeholder="ABCD"
                aria-describedby={error ? 'home-error' : undefined}
                className="min-h-14 w-full rounded-xl bg-slate-950 px-4 text-center indent-[0.4em] font-display text-3xl font-bold tracking-[0.4em] text-slate-50 uppercase ring-1 ring-slate-700 placeholder:text-slate-700 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              />
              <Button type="submit" variant="secondary" disabled={!canJoin}>
                เข้าห้อง
              </Button>
            </div>
            {error && (
              <p id="home-error" role="alert" className="text-base text-red-300">
                {error}
              </p>
            )}
          </form>
        </>
      )}

      <section className="flex flex-col gap-3 pt-2">
        <h2 className="font-display text-lg font-semibold text-slate-300">วิธีเล่น</h2>
        <ol className="flex flex-col gap-2.5 text-base text-slate-400">
          <Step n={1}>
            สร้างห้องแล้วชวนเพื่อน {LIMITS.MIN_PLAYERS}–{LIMITS.MAX_PLAYERS} คน
          </Step>
          <Step n={2}>กดค้างที่การ์ดลับเพื่อดูสถานที่และบทบาท Spy จะไม่รู้สถานที่</Step>
          <Step n={3}>ผลัดกันถามตอบจนหมดเวลา แล้วโหวตว่าใครคือ Spy</Step>
        </ol>
      </section>
    </>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-800 font-display text-sm font-bold text-slate-300">
        {n}
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}
