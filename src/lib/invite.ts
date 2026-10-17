// ลิงก์เชิญ / ?room= — pure module (I1)
// กฎ: ห้าม import '@line/liff' แบบ value, ห้ามแตะ window ตอน import, import shared ด้วย relative path
// (scripts/smoke.ts import ไฟล์นี้ตรง ๆ ได้)
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../shared/types';

/** trim + upper-case; ต้องยาว ROOM_CODE_LENGTH และทุกตัวอยู่ใน ROOM_CODE_ALPHABET ไม่งั้นคืน null */
export function normalizeRoomCode(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const code = raw.trim().toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** อ่าน ?room= จาก search string (เช่น `location.search`) */
export function readRoomParam(search: string): string | null {
  return normalizeRoomCode(new URLSearchParams(search).get('room'));
}

/**
 * คืน path+search+hash ใหม่ที่ set (code) / ลบ (null) param `room` โดยคง param อื่นไว้ (devUser ฯลฯ)
 * ใช้กับ `history.replaceState(null, '', withRoomParam(location.href, code))`
 */
export function withRoomParam(href: string, code: string | null): string {
  const url = new URL(href, 'http://localhost');
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * ลิงก์เชิญ
 * - มี liffId → permanent link `https://miniapp.line.me/${liffId}/?room=CODE` (Endpoint URL = root ของ origin)
 * - ไม่มี    → `${origin}/?room=CODE` (dev / localhost)
 */
export function buildInviteUrl(code: string, env: { liffId?: string; origin: string }): string {
  const q = `?room=${encodeURIComponent(code)}`;
  if (env.liffId) return `https://miniapp.line.me/${env.liffId}/${q}`;
  return `${env.origin.replace(/\/+$/, '')}/${q}`;
}
