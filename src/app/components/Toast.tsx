'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** toast ข้อความสั้น ๆ หายเองใน ~2 วินาที (timer นี้เป็น UI ล้วน ไม่เกี่ยวกับ phase ของเกม) */
export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((m: string) => {
    setMessage(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 2200);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { message, show };
}

export default function Toast({ message }: { message: string | null }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-50 flex justify-center px-4"
    >
      {message && (
        <p className="rounded-full bg-slate-100 px-5 py-2.5 text-base font-medium text-slate-900 shadow-lg shadow-black/40">
          {message}
        </p>
      )}
    </div>
  );
}
