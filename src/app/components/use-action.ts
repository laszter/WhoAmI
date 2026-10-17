'use client';

import { useCallback, useState } from 'react';
import type { Ack } from '@/shared/types';

/** ห่อ action ที่คืน Ack: จัดการสถานะ busy + ข้อความ error (ภาษาไทยจาก server) */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (fn: () => Promise<Ack>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      if (!r.ok) {
        setError(r.error);
        return false;
      }
      return true;
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'เกิดข้อผิดพลาด ลองอีกครั้ง');
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, run, setError };
}
