// LIFF / dev auth ฝั่ง client (T4 + I1 + I3 shareInvite)
// กฎ: ห้าม import '@line/liff' แบบ static — ใช้ `await import('@line/liff')` เท่านั้น (SDK แตะ window ตอนโหลด, SSR จะพัง)
// ทุกฟังก์ชันในไฟล์นี้แตะ window → เรียกได้เฉพาะใน useEffect / event handler ฝั่ง browser
import { buildInviteUrl, readRoomParam } from '@/lib/invite';
import { shareViaPicker, type ShareResult } from '@/lib/share-message';
import { LIMITS } from '@/shared/types';

export type AuthResult = { mode: 'dev'; devUser: string } | { mode: 'liff'; accessToken: string };

// type-only (ถูกลบตอน compile) — ไม่ทำให้ SDK ถูก bundle เข้า SSR
type Liff = (typeof import('@line/liff'))['default'];

// regex เดียวกับ server (src/server/auth.ts) — เช็กก่อนเพื่อให้ error ชัดกว่า "ไม่มี access token"
const DEV_USER_RE = /^[a-z0-9_-]{1,20}$/;

// module state — I3 ใช้ต่อ (shareTargetPicker ต้องรู้ว่าอยู่ใน mode ไหน + instance ของ liff)
let authMode: AuthResult['mode'] | null = null;
let liffInstance: Liff | null = null;
// cache promise: React StrictMode รัน effect 2 ครั้ง → ห้าม liff.init() ซ้อน
let authPromise: Promise<AuthResult> | null = null;

export function getAuthMode(): AuthResult['mode'] | null {
  return authMode;
}

/** Login: dev mode (NEXT_PUBLIC_DEV_AUTH=1 + ?devUser=) หรือ LIFF — เรียกซ้ำได้ (คืน promise เดิม) */
export function authenticate(): Promise<AuthResult> {
  if (!authPromise) {
    authPromise = doAuthenticate().catch((err: unknown) => {
      authPromise = null; // ให้ลองใหม่ได้
      throw err;
    });
  }
  return authPromise;
}

async function doAuthenticate(): Promise<AuthResult> {
  // ต้องเขียน process.env.NEXT_PUBLIC_* ตรง ๆ เท่านั้น Next ถึงจะ inline ค่าให้ตอน build
  if (process.env.NEXT_PUBLIC_DEV_AUTH === '1') {
    const devUser = new URLSearchParams(window.location.search).get('devUser');
    if (devUser !== null) {
      if (!DEV_USER_RE.test(devUser)) {
        throw new Error('devUser ต้องเป็น a-z, 0-9, _ หรือ - ยาวไม่เกิน 20 ตัว (เช่น ?devUser=alice)');
      }
      authMode = 'dev';
      return { mode: 'dev', devUser };
    }
  }

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (!liffId) {
    throw new Error('ยังไม่ได้ตั้งค่า NEXT_PUBLIC_LIFF_ID (หรือเปิด dev mode ด้วย ?devUser=)');
  }

  const liff = (await import('@line/liff')).default;
  try {
    await liff.init({ liffId, withLoginOnExternalBrowser: true });
  } catch (err) {
    console.error('[liff] init failed', err);
    throw new Error('เปิด LINE MINI App ไม่สำเร็จ (liff.init ล้มเหลว)');
  }
  liffInstance = liff;
  authMode = 'liff';

  if (!liff.isLoggedIn()) {
    // redirectUri = URL ปัจจุบัน เพื่อไม่ให้ ?room= หายหลัง login (ต้องขึ้นต้นด้วย Endpoint URL ซึ่งหน้านี้คืออยู่แล้ว)
    liff.login({ redirectUri: window.location.href });
    await new Promise<never>(() => {}); // รอ redirect ไปหน้า login — ไม่ resolve
  }

  const accessToken = liff.getAccessToken();
  if (!accessToken) throw new Error('ไม่ได้รับ access token จาก LINE กรุณาเปิดใหม่อีกครั้ง');
  return { mode: 'liff', accessToken };
}

/**
 * อ่าน ?room= ของลิงก์เชิญ — เรียกหลัง authenticate() resolve เท่านั้น
 * (LIFF จะ redirect ผ่าน liff.state ก่อน ทำให้ query ปลายทางมาครบหลัง init)
 */
export function readInviteCode(): string | null {
  const code = readRoomParam(window.location.search);
  if (code) return code;
  // กันเหนียว: ถ้า LIFF ยังไม่ได้แปลง liff.state (เช่น "/?room=ABCD") กลับเป็น path จริง
  const state = new URLSearchParams(window.location.search).get('liff.state');
  const q = state ? state.indexOf('?') : -1;
  return state && q >= 0 ? readRoomParam(state.slice(q)) : null;
}

/**
 * ลิงก์เชิญ (sync) — LIFF: permanent link `https://miniapp.line.me/{liffId}/?room=CODE`, dev: `${origin}/?room=CODE`
 * ไม่ใช้ liff.permanentLink.createUrlBy เพราะ reject เมื่อ origin ไม่ใช่ Endpoint URL (เช่น localhost)
 */
export function createInviteUrl(code: string): string {
  return buildInviteUrl(code, {
    liffId: authMode === 'liff' ? process.env.NEXT_PUBLIC_LIFF_ID : undefined,
    origin: window.location.origin,
  });
}

export interface ShareInviteContext {
  code: string;
  hostName: string;
  playerCount: number;
  inviteUrl: string;
}

// กันกดซ้ำ: ระหว่าง picker เปิดอยู่ให้คืน promise เดิม
let shareInFlight: Promise<ShareResult> | null = null;

/**
 * ชวนเพื่อนผ่าน shareTargetPicker (Flex ตามแบบ MINI App, fallback เป็น text 1 ครั้ง)
 * - 'shared' ส่งแล้ว · 'cancelled' ผู้ใช้ปิด picker · 'unavailable' dev mode / API ใช้ไม่ได้ / ส่งไม่สำเร็จ → UI คัดลอกลิงก์แทน
 * - ไม่ throw
 */
export function shareInvite(ctx: ShareInviteContext): Promise<'shared' | 'cancelled' | 'unavailable'> {
  if (shareInFlight) return shareInFlight;
  const liff = liffInstance;
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (authMode !== 'liff' || !liff || !liffId) return Promise.resolve('unavailable');
  const msgCtx = { ...ctx, maxPlayers: LIMITS.MAX_PLAYERS, liffId, origin: window.location.origin };
  shareInFlight = shareViaPicker(liff, msgCtx)
    .catch(() => 'unavailable' as const)
    .finally(() => {
      shareInFlight = null;
    });
  return shareInFlight;
}
