interface Props {
  endsAt?: number;
  /** เวลา server โดยประมาณจาก game.now (ห้ามใช้ Date.now() ตรง ๆ) */
  now: number;
  /** ความยาวทั้งหมดของ phase (วินาที) — ใส่เพื่อแสดงแถบเวลาที่เหลือ */
  totalSec?: number;
  size?: 'lg' | 'md';
  label?: string;
}

/** นับถอยหลังแบบแสดงผลอย่างเดียว — การเปลี่ยน phase เป็นหน้าที่ของ server */
export default function Countdown({ endsAt, now, totalSec, size = 'lg', label }: Props) {
  const remainingMs = endsAt !== undefined && now > 0 ? Math.max(0, endsAt - now) : null;
  const secs = remainingMs === null ? null : Math.ceil(remainingMs / 1000);
  const text =
    secs === null
      ? '--:--'
      : `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  const urgent = remainingMs !== null && remainingMs < 10_000;
  const fraction =
    remainingMs !== null && totalSec ? Math.min(1, Math.max(0, remainingMs / (totalSec * 1000))) : null;

  return (
    <div className="flex flex-col items-center gap-2" role="timer" aria-label={label ? `${label} ${text}` : text}>
      {label && <p className="text-sm text-slate-400">{label}</p>}
      <p
        className={`font-display font-bold tabular-nums leading-none tracking-tight transition-colors ${
          size === 'lg' ? 'text-7xl' : 'text-5xl'
        } ${urgent ? 'text-red-400' : 'text-slate-50'}`}
      >
        {text}
      </p>
      {fraction !== null && (
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ease-linear ${urgent ? 'bg-red-500' : 'bg-indigo-400'}`}
            style={{ width: `${fraction * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
