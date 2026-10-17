'use client';

import type { GameClient } from '@/lib/game-client';
import { useGame } from '@/lib/use-game';
import Button from './Button';
import { PixelSprite } from './Pixel';
import Discussion from './Discussion';
import Home from './Home';
import Lobby from './Lobby';
import Result from './Result';
import SpyGuess from './SpyGuess';
import Voting from './Voting';

/** ตัวเดียวที่เรียก useGame() — component อื่นรับ prop game */
export default function Game() {
  const game = useGame();

  return (
    <div className="flex min-h-dvh flex-col">
      {game.isDev && (
        <p className="bg-amber-400 px-4 py-1 text-center text-sm font-semibold text-amber-950">
          DEV MODE · {game.me?.name ?? '…'}
        </p>
      )}
      {game.room && game.status !== 'ready' && game.status !== 'error' && (
        <p role="status" className="bg-slate-800 px-4 py-1.5 text-center text-sm text-slate-200">
          การเชื่อมต่อหลุด กำลังเชื่อมต่อใหม่…
        </p>
      )}
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {game.room && <RoomBar code={game.room.code} showCode={game.room.phase !== 'lobby'} />}
        <Screen game={game} />
      </main>
    </div>
  );
}

function Screen({ game }: { game: GameClient }) {
  if (game.status === 'error') {
    return <ErrorCard message={game.error} />;
  }

  if (!game.room) {
    if (game.status !== 'ready') return <Connecting />;
    return <Home game={game} />;
  }

  // ระหว่าง reconnect (status = connecting) ยังแสดงหน้าเกมเดิมไว้ ไม่เด้งไปหน้าโหลด
  const key = `${game.room.code}:${game.room.phase}`;
  switch (game.room.phase) {
    case 'lobby':
      return <Lobby key={key} game={game} />;
    case 'discussion':
      return <Discussion key={key} game={game} />;
    case 'voting':
      return <Voting key={key} game={game} />;
    case 'spyGuess':
      return <SpyGuess key={key} game={game} />;
    case 'result':
      return <Result key={key} game={game} />;
    default:
      return <Connecting />;
  }
}

function RoomBar({ code, showCode }: { code: string; showCode: boolean }) {
  return (
    <header className="flex items-center justify-between">
      <span className="font-display text-lg font-bold tracking-tight text-slate-300">Spy Party</span>
      {showCode && (
        <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-sm text-slate-400 ring-1 ring-slate-800">
          ห้อง <span className="font-display font-bold tracking-wider text-slate-100">{code}</span>
        </span>
      )}
    </header>
  );
}

function Connecting() {
  return (
    <div role="status" className="flex flex-1 flex-col items-center justify-center gap-4 py-24">
      <PixelSprite sprite="spy" scale={4} />
      <p className="text-lg text-slate-300">กำลังเชื่อมต่อ…</p>
    </div>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div className="flex flex-1 flex-col justify-center">
      <div role="alert" className="flex flex-col gap-4 rounded-2xl bg-slate-900/80 p-5 ring-1 ring-red-500/40">
        <h1 className="font-display text-2xl font-bold">เชื่อมต่อไม่สำเร็จ</h1>
        <p className="text-base break-words text-slate-300">{message || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'}</p>
        <Button onClick={() => window.location.reload()}>ลองใหม่</Button>
      </div>
    </div>
  );
}
