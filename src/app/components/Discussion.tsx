'use client';

import type { GameClient } from '@/lib/game-client';
import Button from './Button';
import Countdown from './Countdown';
import PlayerList from './PlayerList';
import RoleCard from './RoleCard';
import { useAction } from './use-action';

export default function Discussion({ game }: { game: GameClient }) {
  const { room, me, card, now, isHost, actions } = game;
  const { busy, error, run } = useAction();

  if (!room) return null;

  return (
    <>
      <section className="flex flex-col items-center gap-2 pt-2">
        <Countdown endsAt={room.endsAt} now={now} totalSec={room.settings.discussionSec} label="เวลาถามตอบที่เหลือ" />
        <p className="text-center text-base text-slate-300">ผลัดกันถามตอบเพื่อหาว่าใครเป็น Spy</p>
      </section>

      <RoleCard card={card} />

      {isHost ? (
        <div className="flex flex-col gap-2">
          <Button onClick={() => void run(() => actions.openVote())} disabled={busy}>
            เปิดโหวตเลย
          </Button>
          <p className="text-center text-sm text-slate-400">หรือรอให้หมดเวลา ระบบจะเปิดโหวตให้เอง</p>
        </div>
      ) : (
        <p className="text-center text-sm text-slate-400">หมดเวลาแล้วระบบจะเปิดโหวตให้เอง</p>
      )}

      {error && (
        <p role="alert" className="text-center text-base text-red-300">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="px-1 font-display text-xl font-semibold">ผู้เล่นในวง</h2>
        <PlayerList players={room.players} hostId={room.hostId} meId={me?.userId} />
      </section>
    </>
  );
}
