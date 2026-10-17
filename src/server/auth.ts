// Socket.IO auth middleware
// กฎ: ห้ามเชื่อ userId/ชื่อที่ client ส่งมา ยกเว้น DEV_AUTH=1 ที่รับ auth.devUser แล้วใส่ prefix 'dev:'
// อ่าน process.env.* ภายในฟังก์ชันเท่านั้น (server.ts โหลด .env.local หลัง import ถูก hoist)
// ห้าม log access token (รวมถึง URL ของ verify ที่มี token อยู่ใน query)
import type { AuthedUser, TypedSocket } from './types';

const DEV_USER_RE = /^[a-z0-9_-]{1,20}$/;
const LINE_VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';
const LINE_PROFILE_URL = 'https://api.line.me/v2/profile';
const FETCH_TIMEOUT_MS = 5000;
const MAX_TOKEN_LENGTH = 4096;

/** error ที่ส่งกลับไปให้ client (ข้อความไทย แสดงบน UI ได้เลย) */
class AuthError extends Error {}

/** ข้อความ error สำหรับ log — ตัด token ออกเผื่อ library ใส่ URL/ค่ามาใน message */
function safeErr(err: unknown, token?: string): string {
  let msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const cause = err instanceof Error ? (err as Error & { cause?: { code?: unknown } }).cause : undefined;
  if (cause && typeof cause.code === 'string') msg += ` (${cause.code})`;
  if (token) msg = msg.split(token).join('***');
  return msg.slice(0, 300);
}

/** อ่านเฉพาะ field error ของ LINE (ไม่มี token) สำหรับ log */
async function lineErrorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as Record<string, unknown>;
    const parts = [body.error, body.error_description, body.message].filter((v) => typeof v === 'string');
    return parts.join(' / ').slice(0, 200);
  } catch {
    return '';
  }
}

/**
 * dev mode: DEV_AUTH=1 + auth.devUser ตรง regex → { user }
 * ไม่ได้ส่ง devUser → null; ส่งมาแต่ใช้ไม่ได้ → { error } (ใช้เป็นข้อความเมื่อไม่มี accessToken ให้ fallback)
 */
function devUserFrom(auth: Record<string, unknown>): { user: AuthedUser } | { error: string } | null {
  const devUser = auth.devUser;
  if (devUser === undefined || devUser === null || devUser === '') return null;
  if (process.env.DEV_AUTH !== '1') return { error: 'server ไม่ได้เปิด dev mode (DEV_AUTH=1)' };
  if (typeof devUser !== 'string' || !DEV_USER_RE.test(devUser)) {
    return { error: 'devUser ไม่ถูกต้อง (ใช้ได้เฉพาะ a-z 0-9 _ - ยาว 1-20 ตัว)' };
  }
  return { user: { userId: `dev:${devUser}`, name: devUser, isDev: true } };
}

/** verify access token กับ LINE แล้วดึง profile เอง — คืน AuthedUser (พร้อม accessToken ไว้ขอ notification token) */
async function lineUserFrom(token: string): Promise<AuthedUser> {
  const channelId = (process.env.LINE_CHANNEL_ID ?? '').trim();
  if (!channelId) throw new AuthError('server ยังไม่ได้ตั้งค่า LINE_CHANNEL_ID');
  if (token.length > MAX_TOKEN_LENGTH) throw new AuthError('access token ไม่ถูกต้อง');

  let verifyRes: Response;
  try {
    verifyRes = await fetch(`${LINE_VERIFY_URL}?access_token=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    console.warn('[auth] verify request failed', safeErr(err, token));
    throw new AuthError('เชื่อมต่อ LINE ไม่สำเร็จ ลองใหม่อีกครั้ง');
  }
  if (!verifyRes.ok) {
    console.warn('[auth] verify rejected', verifyRes.status, await lineErrorDetail(verifyRes));
    throw new AuthError('access token ไม่ถูกต้อง');
  }
  const verify = (await verifyRes.json().catch(() => null)) as { client_id?: unknown; expires_in?: unknown } | null;
  const clientId = verify?.client_id;
  const expiresIn = Number(verify?.expires_in);
  if ((typeof clientId !== 'string' && typeof clientId !== 'number') || String(clientId) !== channelId) {
    console.warn('[auth] verify: client_id ไม่ตรงกับ LINE_CHANNEL_ID');
    throw new AuthError('access token ไม่ถูกต้อง');
  }
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    console.warn('[auth] verify: token หมดอายุ', verify?.expires_in);
    throw new AuthError('access token ไม่ถูกต้อง');
  }

  let profileRes: Response;
  try {
    profileRes = await fetch(LINE_PROFILE_URL, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    console.warn('[auth] profile request failed', safeErr(err, token));
    throw new AuthError('เชื่อมต่อ LINE ไม่สำเร็จ ลองใหม่อีกครั้ง');
  }
  if (!profileRes.ok) {
    console.warn('[auth] profile rejected', profileRes.status, await lineErrorDetail(profileRes));
    throw new AuthError('ดึงโปรไฟล์ LINE ไม่สำเร็จ');
  }
  const profile = (await profileRes.json().catch(() => null)) as
    | { userId?: unknown; displayName?: unknown; pictureUrl?: unknown }
    | null;
  if (!profile || typeof profile.userId !== 'string' || !profile.userId) {
    console.warn('[auth] profile: ไม่มี userId');
    throw new AuthError('ดึงโปรไฟล์ LINE ไม่สำเร็จ');
  }

  const name = typeof profile.displayName === 'string' && profile.displayName.trim() ? profile.displayName : 'ผู้เล่น LINE';
  const pictureUrl = typeof profile.pictureUrl === 'string' && profile.pictureUrl ? profile.pictureUrl : undefined;
  return { userId: profile.userId, name, ...(pictureUrl ? { pictureUrl } : {}), isDev: false, accessToken: token };
}

export async function authMiddleware(socket: TypedSocket, next: (err?: Error) => void): Promise<void> {
  try {
    const auth = (socket.handshake.auth ?? {}) as Record<string, unknown>;
    const accessToken = typeof auth.accessToken === 'string' ? auth.accessToken.trim() : '';

    const dev = devUserFrom(auth);
    if (dev && 'user' in dev) {
      socket.data.user = dev.user;
      next();
      return;
    }
    if (!accessToken) {
      next(new Error(dev ? dev.error : 'ไม่มี access token'));
      return;
    }

    socket.data.user = await lineUserFrom(accessToken);
    next();
  } catch (err) {
    if (err instanceof AuthError) {
      next(new Error(err.message));
      return;
    }
    console.error('[auth] unexpected error', safeErr(err));
    next(new Error('ยืนยันตัวตนไม่สำเร็จ'));
  }
}
