'use client';

import { useState } from 'react';
import type { GameClient } from '@/lib/game-client';
import Avatar from './Avatar';
import Button from './Button';
import Countdown from './Countdown';
import { nameOf } from './helpers';
import { useAction } from './use-action';

export default function Voting({ game }: { game: GameClient }) {
  const { room, me, now, actions } = game;
  const [selected, setSelected] = useState<string | null>(null);
  const [votedFor, setVotedFor] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  if (!room) return null;

  const meId = me?.userId ?? null;
  const myVoteDone = votedFor !== null || !!room.players.find((p) => p.userId === meId)?.hasVoted;
  const candidates = room.players.filter((p) => p.userId !== meId);
  const votedCount = room.players.filter((p) => p.hasVoted).length;

  const onConfirm = async () => {
    if (!selected) return;
    const target = selected;
    if (await run(() => actions.vote(target))) setVotedFor(target);
  };

  return (
    <>
      <section className="flex flex-col items-center gap-2 pt-2">
        <Countdown endsAt={room.endsAt} now={now} totalSec={room.settings.voteSec} size="md" label="เวลาโหวตที่เหลือ" />
        <h1 className="font-display text-3xl font-bold">ใครคือ Spy?</h1>
        <p className="text-center text-base text-slate-400">เลือก 1 คน โหวตแล้วเปลี่ยนไม่ได้ และโหวตตัวเองไม่ได้</p>
      </section>

      <section aria-label="ความคืบหน้าการโหวต" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-900/70 px-4 py-3 ring-1 ring-slate-800">
        <p className="text-base text-slate-300">
          โหวตแล้ว{' '}
          <span className="font-display font-bold text-slate-50 tabular-nums">
            {votedCount}/{room.players.length}
          </span>{' '}
          คน
        </p>
        <ul className="flex -space-x-2">
          {room.players.map((p) => (
            <li key={p.userId} title={`${p.name}${p.hasVoted ? ' โหวตแล้ว' : ' ยังไม่โหวต'}`}>
              <Avatar
                userId={p.userId}
                name={p.name}
                pictureUrl={p.pictureUrl}
                size="sm"
                className={`ring-2 ${p.hasVoted ? 'ring-emerald-400' : 'opacity-35 ring-slate-900'}`}
              />
            </li>
          ))}
        </ul>
      </section>

      <ul className="flex flex-col gap-2">
        {candidates.map((p) => {
          const isSelected = (votedFor ?? selected) === p.userId;
          return (
            <li key={p.userId}>
              <button
                type="button"
                onClick={() => setSelected(p.userId)}
                disabled={myVoteDone || busy}
                aria-pressed={isSelected}
                className={`flex min-h-16 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left ring-inset transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300 disabled:cursor-not-allowed ${
                  isSelected
                    ? 'bg-red-500/15 ring-2 ring-red-400'
                    : 'bg-slate-900/70 ring-1 ring-slate-800 enabled:hover:bg-slate-800 disabled:opacity-50'
                }`}
              >
                <Avatar userId={p.userId} name={p.name} pictureUrl={p.pictureUrl} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-lg font-semibold">{p.name}</span>
                  {!p.online && <span className="text-sm text-slate-500">ออฟไลน์</span>}
                </span>
                {votedFor === p.userId && <span className="text-sm font-semibold text-red-300">โหวตแล้ว</span>}
                {!myVoteDone && isSelected && <Crosshair />}
              </button>
            </li>
          );
        })}
      </ul>

      {myVoteDone ? (
        <p className="rounded-2xl bg-slate-900/70 px-4 py-4 text-center text-base text-slate-300 ring-1 ring-slate-800">
          {votedFor ? `คุณโหวต ${nameOf(room.players, votedFor)} แล้ว` : 'คุณโหวตแล้ว'} รอคนอื่นโหวตให้ครบ
        </p>
      ) : (
        <Button variant="danger" onClick={() => void onConfirm()} disabled={!selected || busy} className="min-h-14 text-xl">
          {selected ? `ยืนยันโหวต ${nameOf(room.players, selected)}` : 'เลือกคนที่คิดว่าเป็น Spy'}
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

function Crosshair() {
  return (
    <svg viewBox="0 0 24 24" className="size-7 shrink-0 text-red-300" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v5M12 17v5M2 12h5M17 12h5" />
    </svg>
  );
}
