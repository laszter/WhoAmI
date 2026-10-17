// LINE Service Message notifier (DESIGN.md ข้อ 7)
// กฎ: ห้ามทำให้เกมพัง — fire-and-forget, ไม่ throw, log แล้วข้ามเมื่อ env ไม่ครบ / dev user / remaining 0 / API error
// อ่าน process.env.* ภายในฟังก์ชันเท่านั้น (ห้ามอ่านที่ top-level ของโมดูล)
// ห้าม log token ใด ๆ (LIFF access token, channel token, notification token) และ channel secret
import { kv } from './kv';
import type { AuthedUser } from './types';

const CHANNEL_TOKEN_URL = 'https://api.line.me/oauth2/v3/token';
const NOTIFIER_TOKEN_URL = 'https://api.line.me/message/v3/notifier/token';
const NOTIFIER_SEND_URL = 'https://api.line.me/message/v3/notifier/send?target=service';
const FETCH_TIMEOUT_MS = 5000;
const CHANNEL_TOKEN_REFRESH_MARGIN_MS = 60_000; // ขอ stateless token ใหม่ก่อนหมดอายุ 60s

// ---- module state (in-memory ต่อ instance — หายเมื่อ server restart) ----
/** stateless channel access token (อายุ 15 นาที, ออกใหม่ได้ไม่จำกัด) */
let channelToken: { token: string; expiresAt: number } | null = null;
/** กันยิงขอ channel token ซ้อนกันตอนจบเกม (ส่งหลายคนพร้อมกัน) */
let channelTokenInflight: Promise<string> | null = null;
/** กันขอ notification token ซ้ำด้วย LIFF token เดิมในเวลาใกล้กัน (LINE ตอบ 400) */
const notifyInflight = new Map<string, Promise<void>>();

// ---- notification token ต่อ userId (kv — instance ที่ส่งผลอาจไม่ใช่ instance ที่ผู้เล่น join) ----
/** expiresAt = epoch ms ตาม expiresIn ที่ LINE ตอบ (Infinity = LINE ไม่บอก) */
interface NotifyEntry { token: string; remaining: number; expiresAt: number }
const NOTIFY_MAX_TTL_SEC = 30 * 24 * 60 * 60;
const notifyKey = (userId: string) => `notify:${userId}`;

async function loadNotifyToken(userId: string): Promise<NotifyEntry | null> {
  const raw = await kv().get(notifyKey(userId));
  if (!raw) return null;
  const entry = JSON.parse(raw) as Omit<NotifyEntry, 'expiresAt'> & { expiresAt: number | null };
  return { ...entry, expiresAt: entry.expiresAt ?? Number.POSITIVE_INFINITY };
}

async function saveNotifyToken(userId: string, entry: NotifyEntry): Promise<void> {
  const finite = Number.isFinite(entry.expiresAt);
  const ttlSec = finite ? Math.min(NOTIFY_MAX_TTL_SEC, Math.ceil((entry.expiresAt - Date.now()) / 1000)) : NOTIFY_MAX_TTL_SEC;
  if (ttlSec <= 0) return;
  await kv().set(notifyKey(userId), JSON.stringify({ ...entry, expiresAt: finite ? entry.expiresAt : null }), ttlSec);
}

class LineApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`HTTP ${status}${detail ? ` ${detail}` : ''}`);
  }
}

/** ข้อความ error สำหรับ log (ไม่มี token) */
function describe(err: unknown): string {
  if (err instanceof LineApiError) return err.message.slice(0, 300);
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: { code?: unknown } }).cause;
    const code = cause && typeof cause.code === 'string' ? ` (${cause.code})` : '';
    return `${err.name}: ${err.message}${code}`.slice(0, 300);
  }
  return String(err).slice(0, 300);
}

/** ดึงเฉพาะ field ที่อธิบาย error จาก body ของ LINE (ไม่มี token) */
function errorDetail(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const b = body as Record<string, unknown>;
  const parts = [b.error, b.error_description, b.message].filter((v): v is string => typeof v === 'string');
  if (Array.isArray(b.details)) {
    for (const d of b.details) {
      if (d && typeof d === 'object' && typeof (d as { message?: unknown }).message === 'string') {
        const prop = (d as { property?: unknown }).property;
        parts.push(`${typeof prop === 'string' ? prop + ': ' : ''}${(d as { message: string }).message}`);
      }
    }
  }
  return parts.join(' / ').slice(0, 200);
}

/** POST ไป LINE แล้วคืน JSON body; ไม่ใช่ 2xx → throw LineApiError */
async function postLine(url: string, headers: Record<string, string>, body: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new LineApiError(res.status, errorDetail(json));
  return json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
}

/** env 3 ตัวครบ: LINE_CHANNEL_ID, LINE_CHANNEL_SECRET, LINE_SERVICE_TEMPLATE */
export function isServiceMessageConfigured(): boolean {
  return Boolean(
    process.env.LINE_CHANNEL_ID?.trim() && process.env.LINE_CHANNEL_SECRET?.trim() && process.env.LINE_SERVICE_TEMPLATE?.trim(),
  );
}

/** ขอ stateless channel access token ใหม่ (POST /oauth2/v3/token, form-urlencoded) */
async function issueChannelToken(): Promise<string> {
  const form = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: (process.env.LINE_CHANNEL_ID ?? '').trim(),
    client_secret: (process.env.LINE_CHANNEL_SECRET ?? '').trim(),
  });
  const body = await postLine(CHANNEL_TOKEN_URL, { 'Content-Type': 'application/x-www-form-urlencoded' }, form.toString());
  const token = body.access_token;
  if (typeof token !== 'string' || !token) throw new Error('channel token response ไม่มี access_token');
  const expiresInSec = Number(body.expires_in);
  const ttlMs = Number.isFinite(expiresInSec) && expiresInSec > 0 ? expiresInSec * 1000 : 900_000;
  channelToken = { token, expiresAt: Date.now() + ttlMs };
  return token;
}

/** channel token จาก cache (จนถึง expiresAt - 60s) หรือขอใหม่ — throw ได้ (caller ต้อง catch) */
async function getChannelToken(): Promise<string> {
  if (channelToken && Date.now() < channelToken.expiresAt - CHANNEL_TOKEN_REFRESH_MARGIN_MS) return channelToken.token;
  if (!channelTokenInflight) {
    channelTokenInflight = issueChannelToken().finally(() => {
      channelTokenInflight = null;
    });
  }
  return channelTokenInflight;
}

function expiresAtFrom(expiresIn: unknown, fallback: number): number {
  const sec = Number(expiresIn);
  return Number.isFinite(sec) && sec > 0 ? Date.now() + sec * 1000 : fallback;
}

/** ขอ notification token จริง — ไม่ throw (log warn แทน) */
async function requestNotificationToken(userId: string, liffAccessToken: string): Promise<void> {
  try {
    const channel = await getChannelToken();
    const body = await postLine(
      NOTIFIER_TOKEN_URL,
      { Authorization: `Bearer ${channel}`, 'Content-Type': 'application/json' },
      JSON.stringify({ liffAccessToken }),
    );
    const token = body.notificationToken;
    if (typeof token !== 'string' || !token) throw new Error('notifier/token response ไม่มี notificationToken');
    const remaining = Number(body.remainingCount);
    const entry: NotifyEntry = {
      token,
      remaining: Number.isFinite(remaining) ? remaining : 0,
      expiresAt: expiresAtFrom(body.expiresIn, Number.POSITIVE_INFINITY),
    };
    await saveNotifyToken(userId, entry);
    console.log('[line-notify] token ok', userId, `remaining=${entry.remaining}`);
  } catch (err) {
    if (err instanceof LineApiError && err.status === 401) channelToken = null; // channel token ใช้ไม่ได้ → ขอใหม่รอบหน้า
    console.warn('[line-notify] token skip', userId, describe(err));
  }
}

/** ขอ notification token ด้วย LIFF access token ของผู้เล่น (cache ต่อ userId) — ไม่ throw */
export async function ensureNotificationToken(user: AuthedUser): Promise<void> {
  try {
    if (user.isDev) {
      console.log('[line-notify] token skip', user.userId, '(dev user)');
      return;
    }
    if (!isServiceMessageConfigured()) {
      console.log('[line-notify] token skip', user.userId, '(env LINE_CHANNEL_ID/LINE_CHANNEL_SECRET/LINE_SERVICE_TEMPLATE ไม่ครบ)');
      return;
    }
    if (!user.accessToken) {
      console.log('[line-notify] token skip', user.userId, '(ไม่มี LIFF access token)');
      return;
    }
    const cached = await loadNotifyToken(user.userId);
    // มี token ที่ยังใช้ได้อยู่แล้ว → ไม่ขอซ้ำ (ขอถี่ ๆ ด้วย LIFF token เดิมจะได้ 400)
    if (cached && cached.remaining > 0 && cached.expiresAt > Date.now()) return;

    let inflight = notifyInflight.get(user.userId);
    if (!inflight) {
      inflight = requestNotificationToken(user.userId, user.accessToken).finally(() => {
        notifyInflight.delete(user.userId);
      });
      notifyInflight.set(user.userId, inflight);
    }
    await inflight;
  } catch (err) {
    console.warn('[line-notify] token skip', user.userId, describe(err));
  }
}

/**
 * ที่เดียวที่ map ตัวแปรของ template
 * template ปัจจุบัน: `result_d_t_th` (Entry → Lottery results (detailed), ภาษาไทย)
 * หัวข้อคงที่ "ประกาศผลจับสลากแล้ว" — ตัวแปรที่ใช้: number, entry_detail, name, raffle_announce, result, btn1_url
 * (payment_date / payment_shop / deposit / btn2–4_url ไม่เกี่ยวกับเกม จึงไม่ส่ง)
 * ค่าต้องเป็น string ล้วน และเป็นผลจาก action ของผู้ใช้เท่านั้น ห้ามมีโฆษณา/ชวนเล่น
 */
export function buildResultParams(input: { playerName: string; won: boolean; isSpy: boolean; location: string; roomCode: string; link?: string }): Record<string, string> {
  const { playerName, won, isSpy, location, roomCode } = input;
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  const link = input.link ?? (liffId ? `https://miniapp.line.me/${liffId}` : undefined);
  const now = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' });
  return {
    number: roomCode,
    entry_detail: `Spy Party · สถานที่: ${location}`,
    name: playerName || 'ผู้เล่น',
    raffle_announce: now,
    result: `${won ? 'คุณชนะ!' : 'คุณแพ้'} (${isSpy ? 'คุณเป็น Spy' : 'ฝ่ายพลเมือง'})`,
    ...(link ? { btn1_url: link } : {}),
  };
}

/** ส่งผลแพ้/ชนะให้ผู้เล่น 1 คน (เรียกแบบ fire-and-forget) — ไม่ throw */
export async function sendResultMessage(user: Pick<AuthedUser, 'userId' | 'isDev'>, params: Record<string, string>): Promise<void> {
  const { userId } = user;
  try {
    if (user.isDev) {
      console.log('[line-notify] send skip', userId, '(dev user)');
      return;
    }
    if (!isServiceMessageConfigured()) {
      console.log('[line-notify] send skip', userId, '(env LINE_CHANNEL_ID/LINE_CHANNEL_SECRET/LINE_SERVICE_TEMPLATE ไม่ครบ)');
      return;
    }
    const entry = await loadNotifyToken(userId);
    if (!entry) {
      console.log('[line-notify] send skip', userId, '(ไม่มี notification token)');
      return;
    }
    if (entry.remaining <= 0) {
      console.log('[line-notify] send skip', userId, '(remaining 0)');
      return;
    }
    if (entry.expiresAt <= Date.now()) {
      await kv().del(notifyKey(userId));
      console.log('[line-notify] send skip', userId, '(notification token หมดอายุ)');
      return;
    }

    const channel = await getChannelToken();
    const stringParams = Object.fromEntries(Object.entries(params ?? {}).map(([k, v]) => [k, String(v)]));
    const body = await postLine(
      NOTIFIER_SEND_URL,
      { Authorization: `Bearer ${channel}`, 'Content-Type': 'application/json' },
      JSON.stringify({
        templateName: (process.env.LINE_SERVICE_TEMPLATE ?? '').trim(),
        params: stringParams,
        notificationToken: entry.token,
      }),
    );

    // LINE ตอบ notificationToken ตัวใหม่ + remainingCount ทุกครั้ง → เก็บทับเสมอ
    const nextToken = typeof body.notificationToken === 'string' && body.notificationToken ? body.notificationToken : entry.token;
    const remaining = Number(body.remainingCount);
    const next: NotifyEntry = {
      token: nextToken,
      remaining: Number.isFinite(remaining) ? remaining : Math.max(0, entry.remaining - 1),
      expiresAt: expiresAtFrom(body.expiresIn, entry.expiresAt),
    };
    await saveNotifyToken(userId, next);
    console.log('[line-notify] sent', userId, `remaining=${next.remaining}`);
  } catch (err) {
    if (err instanceof LineApiError && err.status === 401) channelToken = null;
    console.warn('[line-notify] send failed', userId, describe(err));
  }
}
