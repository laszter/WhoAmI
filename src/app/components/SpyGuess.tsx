'use client';

import { useState } from 'react';
import type { GameClient } from '@/lib/game-client';
import { LIMITS } from '@/shared/types';
import { LOCATION_NAMES } from '@/shared/locations';
import Button from './Button';
import Countdown from './Countdown';
import { nameOf } from './helpers';
import { useAction } from './use-action';

/** P1: Spy ที่ถูกจับมีสิทธิ์ทายสถานที่ 1 ครั้ง (phase spyGuess) */
export default function SpyGuess({ game }: { game: GameClient }) {
  const { room, me, card, now, actions } = game;
  const [selected, setSelected] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useAction();

  if (!room) return null;

  const accusedId = room.accusedId ?? null;
  const isAccused = !!me && me.userId === accusedId;
  const locations = card?.isSpy ? card.locations : LOCATION_NAMES;

  const onConfirm = async () => {
    if (!selected) return;
    const guess = selected;
    if (await run(() => actions.spyGuess(guess))) setSent(true);
  };

  if (!isAccused) {
    return (
      <section className="flex flex-col items-center gap-3 pt-6 text-center">
        <Countdown endsAt={room.endsAt} now={now} totalSec={LIMITS.SPY_GUESS_SEC} size="md" />
        <h1 className="font-display text-3xl leading-tight font-bold text-red-200">
          {nameOf(room.players, accusedId)} ถูกจับแล้ว
        </h1>
        <p className="text-lg text-slate-300">กำลังทายสถานที่…</p>
        <p className="max-w-[30ch] text-base text-slate-400">ถ้า Spy ทายสถานที่ถูก Spy จะชนะ ห้ามบอกใบ้เด็ดขาด</p>
      </section>
    );
  }

  return (
    <>
      <section className="flex flex-col items-center gap-2 pt-2 text-center">
        <Countdown endsAt={room.endsAt} now={now} totalSec={LIMITS.SPY_GUESS_SEC} size="md" />
        <h1 className="font-display text-2xl leading-tight font-bold text-red-200">คุณถูกจับแล้ว! ทายสถานที่ให้ถูกเพื่อชนะ</h1>
        <p className="text-base text-slate-400">ทายได้ครั้งเดียว</p>
      </section>

      <ul className="grid grid-cols-2 gap-2">
        {locations.map((name) => {
          const active = selected === name;
          return (
            <li key={name}>
              <button
                type="button"
                onClick={() => setSelected(name)}
                disabled={sent || busy}
                aria-pressed={active}
                className={`min-h-12 w-full rounded-xl px-2 py-2 text-base font-medium ring-inset transition-colors focus-visible:outline-2 focus-visible:outline-indigo-300 disabled:cursor-not-allowed ${
                  active
                    ? 'bg-red-500/20 text-red-50 ring-2 ring-red-400'
                    : 'bg-slate-900/70 text-slate-200 ring-1 ring-slate-800 enabled:hover:bg-slate-800 disabled:opacity-50'
                }`}
              >
                {name}
              </button>
            </li>
          );
        })}
      </ul>

      {sent ? (
        <p className="rounded-2xl bg-slate-900/70 px-4 py-4 text-center text-base text-slate-300 ring-1 ring-slate-800">
          ส่งคำตอบแล้ว รอเฉลย…
        </p>
      ) : (
        <Button variant="danger" onClick={() => void onConfirm()} disabled={!selected || busy} className="min-h-14 text-xl">
          {selected ? `ทายว่า ${selected}` : 'เลือกสถานที่ที่คิดว่าใช่'}
        </Button>
      )}

      {error && (
        <p role="alert" className="text-center text-base text-red-300">
          {error}
        </p>
      )}
    </>
  );
}
