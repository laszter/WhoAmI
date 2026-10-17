'use client';

import type { ReactNode } from 'react';
import type { GameClient } from '@/lib/game-client';
import Avatar from './Avatar';
import Button from './Button';
import { LocationIcon, PixelSprite } from './Pixel';
import { nameOf } from './helpers';
import { useAction } from './use-action';

export default function Result({ game }: { game: GameClient }) {
  const { room, me, isHost, actions } = game;
  const { busy, error, run } = useAction();

  if (!room) return null;

  const reveal = room.reveal;
  const leaveButton = (
    <Button variant="ghost" onClick={() => void run(() => actions.leaveRoom())} disabled={busy}>
      ออกจากห้อง
    </Button>
  );

  if (!reveal) {
    return (
      <>
        <p className="py-10 text-center text-lg text-slate-300">กำลังเฉลย…</p>
        {leaveButton}
      </>
    );
  }

  const { players } = room;
  const spyWins = reveal.winner === 'spy';
  const meId = me?.userId;
  const iAmSpy = meId === reveal.spyId;
  const iWon = meId ? spyWins === iAmSpy : null;
  const accusedId = room.accusedId ?? null;
  const votes = reveal.votes;
  const noVotes = Object.keys(votes).length === 0;
  const spy = players.find((p) => p.userId === reveal.spyId);

  const tally: Record<string, number> = {};
  for (const target of Object.values(votes)) tally[target] = (tally[target] ?? 0) + 1;
  // แถวของตาราง: ผู้เล่นในห้อง + คนที่โหวตแล้วออกจากห้องไปก่อน
  const rowIds = [...players.map((p) => p.userId), ...Object.keys(votes).filter((id) => !players.some((p) => p.userId === id))];

  let accusedText: string;
  if (accusedId === null) accusedText = noVotes ? 'ไม่มีใครถูกจับ (ไม่มีใครโหวต)' : 'ไม่มีใครถูกจับ (เสมอ)';
  else accusedText = `${nameOf(players, accusedId)} ${accusedId === reveal.spyId ? '(จับถูกตัว)' : '(จับผิดคน)'}`;

  return (
    <>
      <section
        className={`flex flex-col items-center gap-2 rounded-3xl px-5 py-7 text-center ring-2 ${
          spyWins
            ? 'bg-red-950/60 ring-red-500/70 shadow-[0_0_80px_-24px_rgb(239_68_68/0.8)]'
            : 'bg-indigo-950/60 ring-indigo-400/60 shadow-[0_0_80px_-24px_rgb(99_102_241/0.8)]'
        }`}
      >
        <PixelSprite sprite={spyWins ? 'spyWin' : 'citizensWin'} scale={4} />
        <h1 className={`font-display text-5xl leading-tight font-bold ${spyWins ? 'text-red-200' : 'text-indigo-100'}`}>
          {spyWins ? 'Spy ชนะ!' : 'ฝ่ายพลเมืองชนะ!'}
        </h1>
        {iWon !== null && (
          <p className="text-lg text-slate-200">
            {iWon ? 'คุณชนะรอบนี้' : 'คุณแพ้รอบนี้'} ({iAmSpy ? 'คุณเป็น Spy' : 'คุณอยู่ฝ่ายพลเมือง'})
          </p>
        )}
      </section>

      <dl className="flex flex-col divide-y divide-slate-800/80 overflow-hidden rounded-2xl bg-slate-900/70 ring-1 ring-slate-800">
        <Fact label="Spy คือ">
          <span className="flex items-center gap-2">
            <Avatar userId={reveal.spyId} name={spy?.name ?? '?'} pictureUrl={spy?.pictureUrl} size="sm" />
            <span className="font-semibold text-red-300">{nameOf(players, reveal.spyId)}</span>
          </span>
        </Fact>
        <Fact label="สถานที่">
          <span className="flex items-center gap-2">
            <LocationIcon name={reveal.location} scale={1} />
            <span className="font-display text-xl font-semibold">{reveal.location}</span>
          </span>
        </Fact>
        <Fact label="ผลการจับ">{accusedText}</Fact>
        {reveal.spyGuess && (
          <Fact label="Spy ทายว่า">
            {reveal.spyGuess.location}{' '}
            <span className={reveal.spyGuess.correct ? 'font-semibold text-red-300' : 'font-semibold text-emerald-300'}>
              ({reveal.spyGuess.correct ? 'ถูก' : 'ผิด'})
            </span>
          </Fact>
        )}
      </dl>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 font-display text-xl font-semibold">ผลโหวต</h2>
        <div className="overflow-hidden rounded-2xl bg-slate-900/70 ring-1 ring-slate-800">
          <table className="w-full table-fixed text-left text-base">
            <thead className="bg-slate-900 text-sm text-slate-400">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">ผู้เล่น</th>
                <th scope="col" className="px-3 py-2 font-medium">โหวตให้</th>
                <th scope="col" className="w-20 px-3 py-2 text-right font-medium">ได้กี่เสียง</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {rowIds.map((id) => {
                const target = votes[id];
                const isAccused = id === accusedId;
                return (
                  <tr key={id} className={isAccused ? 'bg-slate-800/50' : ''}>
                    <td className="truncate px-3 py-2.5">
                      <span className={id === reveal.spyId ? 'font-semibold text-red-300' : ''}>{nameOf(players, id)}</span>
                      {id === reveal.spyId && <span className="ml-1.5 text-sm text-red-400">Spy</span>}
                    </td>
                    <td className="truncate px-3 py-2.5">
                      {target ? nameOf(players, target) : <span className="text-slate-500">ไม่ได้โหวต</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-display font-semibold tabular-nums">{tally[id] ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {isHost ? (
        <Button onClick={() => void run(() => actions.reset())} disabled={busy} className="min-h-14 text-xl">
          เล่นอีกรอบ
        </Button>
      ) : (
        <p className="rounded-2xl bg-slate-900/70 px-4 py-4 text-center text-base text-slate-300 ring-1 ring-slate-800">
          รอ host เริ่มรอบใหม่
        </p>
      )}

      {error && (
        <p role="alert" className="text-center text-base text-red-300">
          {error}
        </p>
      )}

      {leaveButton}
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 px-4 py-2.5">
      <dt className="shrink-0 text-base text-slate-400">{label}</dt>
      <dd className="min-w-0 text-right text-base text-slate-100">{children}</dd>
    </div>
  );
}
