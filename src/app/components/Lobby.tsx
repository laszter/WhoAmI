'use client';

import { useState } from 'react';
import type { GameClient } from '@/lib/game-client';
import { LIMITS } from '@/shared/types';
import Button from './Button';
import InvitePanel from './InvitePanel';
import PlayerList from './PlayerList';
import { useAction } from './use-action';

const DISCUSSION_PRESETS = [60, 120, 180, 300];
const VOTE_PRESETS = [30, 45, 60];

/** ถ้าค่าปัจจุบันของห้อง (เช่นจาก env ตอน dev) ไม่อยู่ใน preset ให้แสดงเป็นตัวเลือกเพิ่ม */
function withCurrent(presets: number[], current: number): number[] {
  return presets.includes(current) ? presets : [...presets, current].sort((a, b) => a - b);
}

const formatDiscussion = (sec: number) => (sec % 60 === 0 ? `${sec / 60} นาที` : `${sec} วิ`);
const formatVote = (sec: number) => `${sec} วินาที`;

export default function Lobby({ game }: { game: GameClient }) {
  const { room, me, isHost, actions } = game;
  const [discussionSec, setDiscussionSec] = useState(room?.settings.discussionSec ?? LIMITS.DEFAULT_DISCUSSION_SEC);
  const [voteSec, setVoteSec] = useState(room?.settings.voteSec ?? LIMITS.DEFAULT_VOTE_SEC);
  const { busy, error, run } = useAction();

  if (!room) return null;

  const count = room.players.length;
  const missing = Math.max(0, LIMITS.MIN_PLAYERS - count);

  return (
    <>
      <InvitePanel game={game} />

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="font-display text-xl font-semibold">ผู้เล่น</h2>
          <p className="font-display text-base text-slate-400 tabular-nums">
            {count}/{LIMITS.MAX_PLAYERS}
          </p>
        </div>
        <PlayerList players={room.players} hostId={room.hostId} meId={me?.userId} />
      </section>

      {isHost ? (
        <section className="flex flex-col gap-4 rounded-2xl bg-slate-900/70 p-4 ring-1 ring-slate-800">
          <Segmented
            label="เวลาถามตอบ"
            options={withCurrent(DISCUSSION_PRESETS, discussionSec)}
            value={discussionSec}
            onChange={setDiscussionSec}
            format={formatDiscussion}
          />
          <Segmented
            label="เวลาโหวต"
            options={withCurrent(VOTE_PRESETS, voteSec)}
            value={voteSec}
            onChange={setVoteSec}
            format={formatVote}
          />
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => void run(() => actions.start({ discussionSec, voteSec }))}
              disabled={missing > 0 || busy}
              className="min-h-14 text-xl"
            >
              เริ่มเกม
            </Button>
            {missing > 0 && (
              <p className="text-center text-sm text-slate-400">
                ต้องมีอย่างน้อย {LIMITS.MIN_PLAYERS} คน (ขาดอีก {missing} คน)
              </p>
            )}
          </div>
        </section>
      ) : (
        <p className="rounded-2xl bg-slate-900/70 px-4 py-5 text-center text-base text-slate-300 ring-1 ring-slate-800">
          รอ host เริ่มเกม
        </p>
      )}

      {error && (
        <p role="alert" className="text-center text-base text-red-300">
          {error}
        </p>
      )}

      <Button variant="ghost" onClick={() => void run(() => actions.leaveRoom())} disabled={busy}>
        ออกจากห้อง
      </Button>

    </>
  );
}

interface SegmentedProps {
  label: string;
  options: number[];
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}

function Segmented({ label, options, value, onChange, format }: SegmentedProps) {
  return (
    <fieldset>
      <legend className="mb-2 text-base font-medium text-slate-200">{label}</legend>
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-slate-950 p-1 ring-1 ring-slate-800">
        {options.map((o) => {
          const active = o === value;
          return (
            <button
              key={o}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(o)}
              className={`min-h-12 rounded-lg px-1 text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-indigo-300 ${
                active ? 'bg-indigo-500 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {format(o)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
