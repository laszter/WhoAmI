import type { PublicPlayer } from '@/shared/types';
import Avatar from './Avatar';

interface Props {
  players: PublicPlayer[];
  hostId: string;
  meId?: string | null;
  /** แสดงเครื่องหมายว่าใครโหวตแล้ว (phase voting) */
  showVoted?: boolean;
}

export default function PlayerList({ players, hostId, meId, showVoted = false }: Props) {
  return (
    <ul className="flex flex-col divide-y divide-slate-800/80 overflow-hidden rounded-2xl bg-slate-900/70 ring-1 ring-slate-800">
      {players.map((p) => (
        <li key={p.userId} className="flex min-h-14 items-center gap-3 px-3 py-2">
          <span className="relative">
            <Avatar userId={p.userId} name={p.name} pictureUrl={p.pictureUrl} className={p.online ? '' : 'opacity-40 grayscale'} />
            <span
              aria-hidden="true"
              className={`absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full ring-2 ring-slate-900 ${p.online ? 'bg-emerald-400' : 'bg-slate-500'}`}
            />
          </span>

          <span className="flex min-w-0 flex-1 flex-col">
            <span className={`truncate text-base font-medium ${p.online ? 'text-slate-100' : 'text-slate-400'}`}>
              {p.name}
              {p.userId === meId && <span className="font-normal text-slate-400"> (คุณ)</span>}
            </span>
            {!p.online && <span className="text-sm text-slate-500">ออฟไลน์</span>}
          </span>

          {p.userId === hostId && (
            <span className="rounded-md bg-indigo-500/15 px-2 py-0.5 text-sm font-semibold text-indigo-300 ring-1 ring-inset ring-indigo-400/30">
              host
            </span>
          )}
          {showVoted && (
            <span className={`text-sm ${p.hasVoted ? 'font-semibold text-emerald-300' : 'text-slate-500'}`}>
              {p.hasVoted ? 'โหวตแล้ว' : 'ยังไม่โหวต'}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
