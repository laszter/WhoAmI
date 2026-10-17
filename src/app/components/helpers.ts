import type { PublicPlayer } from '@/shared/types';

/** ชื่อผู้เล่นจาก userId (คนที่ออกจากห้องไปแล้วจะไม่อยู่ใน players) */
export function nameOf(players: PublicPlayer[], userId: string | null | undefined): string {
  if (!userId) return '';
  return players.find((p) => p.userId === userId)?.name ?? 'ผู้เล่นที่ออกไปแล้ว';
}

/** คัดลอกข้อความ: Clipboard API ก่อน แล้ว fallback เป็น textarea + execCommand */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // ไปลอง fallback ต่อ
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.opacity = '0';
    ta.style.fontSize = '16px'; // กัน iOS zoom
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** เลือกข้อความใน element ให้ผู้ใช้กดคัดลอกเอง (fallback สุดท้าย) */
export function selectElementText(el: HTMLElement | null): void {
  if (!el) return;
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(el);
  sel.addRange(range);
}

/** สีพื้นของ avatar แบบตัวอักษร — คงที่ต่อ userId (ไม่ใช้แดง เพราะแดง = Spy) */
const AVATAR_COLORS = [
  'bg-indigo-600',
  'bg-sky-700',
  'bg-violet-700',
  'bg-teal-700',
  'bg-amber-700',
  'bg-fuchsia-800',
  'bg-emerald-700',
  'bg-cyan-800',
];

function hashId(userId: string): number {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function avatarColor(userId: string): string {
  return AVATAR_COLORS[hashId(userId) % AVATAR_COLORS.length];
}

/** ตัวละคร pixel สำรองเมื่อไม่มีรูปโปรไฟล์ (public/assets/characters/avatar_player*.png) — สีเสื้อคงที่ต่อ userId */
const AVATAR_SPRITES = ['', '_green', '_yellow', '_purple', '_orange', '_pink', '_gray', '_red'];

export function avatarSprite(userId: string): string {
  const suffix = AVATAR_SPRITES[Math.floor(hashId(userId) / AVATAR_COLORS.length) % AVATAR_SPRITES.length];
  return `/assets/characters/avatar_player${suffix}.png`;
}
