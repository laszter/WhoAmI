// ข้อความเชิญที่ส่งผ่าน liff.shareTargetPicker — pure module (I3)
// กฎ: ห้าม import '@line/liff' แบบ value (ใช้ได้แค่ import type), ห้ามแตะ window, import shared ด้วย relative path
// (scripts/smoke.ts import ไฟล์นี้ตรง ๆ ได้)
// โครง Flex ตาม guideline "custom action button" ของ LINE MINI App:
// Bubble (ห้าม Carousel) + Title + Sub-title + Details + Button (primary #17c950) + Footer (icon + ชื่อแอป + ลูกศร)
// ห้ามเพิ่ม/เปลี่ยน property นอกเหนือจาก guideline ("Don't change any properties not described here")
import type liff from '@line/liff';

export type ShareMessage = Parameters<typeof liff.shareTargetPicker>[0][number];

export interface InviteContext {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  inviteUrl: string;
  liffId: string;
  origin: string;
}

/** รูปลูกศรใน footer — ห้ามเปลี่ยน (guideline) */
export const FOOTER_ARROW_URL = 'https://vos.line-scdn.net/service-notifier/footer_go_btn.png';

export const APP_NAME = 'Spy Party';

/** LINE จำกัด altText ไม่เกิน 400 ตัว และ action label ไม่เกิน 40 ตัว */
const ALT_TEXT_MAX = 400;
const LABEL_MAX = 40;

function clip(s: string, max: number): string {
  const chars = Array.from(s);
  return chars.length <= max ? s : chars.slice(0, max - 1).join('') + '…';
}

/** ชื่อว่าง/ช่องว่างล้วน → ใช้ "เพื่อน" แทน (Flex text ว่างจะไม่ผ่าน validation) */
function displayName(hostName: string): string {
  const name = hostName.trim();
  return name ? clip(name, 40) : 'เพื่อน';
}

const row = (label: string, value: string) => ({
  type: 'box' as const,
  layout: 'horizontal' as const,
  contents: [
    { type: 'text' as const, text: label, flex: 20, size: 'sm', color: '#555555' },
    { type: 'text' as const, text: value, flex: 55, size: 'sm', color: '#111111', wrap: true },
  ],
});

export function buildInviteFlex(ctx: InviteContext): ShareMessage {
  const name = displayName(ctx.hostName);
  return {
    type: 'flex',
    altText: clip(`${name} ชวนเล่น ${APP_NAME} ห้อง ${ctx.code}`, ALT_TEXT_MAX),
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          // Title
          { type: 'text', text: 'มาจับ Spy กัน!', size: 'lg', weight: 'bold', color: '#000000', wrap: true },
          // Sub-title
          { type: 'text', text: `${name} ชวนคุณเข้าห้อง`, size: 'sm', color: '#999999', wrap: true },
          // Details
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'sm',
            contents: [row('ห้อง', ctx.code), row('ผู้เล่น', `${ctx.playerCount}/${ctx.maxPlayers} คน`)],
          },
          // Button — พาไปหน้าห้อง (permanent link)
          {
            type: 'button',
            style: 'primary',
            height: 'md',
            color: '#17c950',
            margin: 'lg',
            action: { type: 'uri', label: clip(`เข้าห้อง ${ctx.code}`, LABEL_MAX), uri: ctx.inviteUrl },
          },
        ],
      },
      // Footer
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'separator', color: '#f0f0f0' },
          {
            type: 'box',
            layout: 'horizontal',
            flex: 1,
            spacing: 'md',
            margin: 'md',
            contents: [
              { type: 'image', url: `${ctx.origin}/assets/misc/app_icon@4x.png`, flex: 1, gravity: 'center' },
              {
                type: 'text',
                text: APP_NAME,
                flex: 19,
                size: 'xs',
                color: '#999999',
                weight: 'bold',
                gravity: 'center',
                wrap: false,
              },
              {
                type: 'image',
                url: FOOTER_ARROW_URL,
                flex: 1,
                gravity: 'center',
                size: 'xxs',
                action: { type: 'uri', label: 'action', uri: `https://miniapp.line.me/${ctx.liffId}` },
              },
            ],
          },
        ],
      },
    },
  };
}

/** fallback เมื่อ Flex ไม่ผ่าน validation */
export function buildInviteText(ctx: InviteContext): ShareMessage {
  return {
    type: 'text',
    text: `${displayName(ctx.hostName)} ชวนเล่น ${APP_NAME}\nห้อง ${ctx.code}\n${ctx.inviteUrl}`,
  };
}

/** ส่วนของ liff ที่ใช้ — ประกาศแบบ structural เพื่อให้ mock ทดสอบได้โดยไม่ต้องโหลด SDK */
export interface SharePicker {
  isApiAvailable(apiName: string): boolean;
  shareTargetPicker(
    messages: ShareMessage[],
    options?: { isMultiple?: boolean },
  ): Promise<{ status: 'success' } | void>;
}

export type ShareResult = 'shared' | 'cancelled' | 'unavailable';

function errInfo(err: unknown): [unknown, unknown] {
  if (err && typeof err === 'object') {
    const e = err as { code?: unknown; message?: unknown };
    return [e.code, e.message];
  }
  return [undefined, err];
}

/**
 * เปิด picker ด้วย Flex → ถ้า reject (ปัญหาก่อน picker ขึ้น เช่น Flex ไม่ผ่าน validation) ลองใหม่ด้วย text 1 ครั้ง
 * ไม่ throw เด็ดขาด · ห้าม alert() ใน then/catch (LIFF ค้าง)
 */
export async function shareViaPicker(picker: SharePicker, ctx: InviteContext): Promise<ShareResult> {
  try {
    if (!picker.isApiAvailable('shareTargetPicker')) return 'unavailable';
  } catch {
    return 'unavailable';
  }
  const attempt = async (msg: ShareMessage): Promise<ShareResult> => {
    const res = await picker.shareTargetPicker([msg], { isMultiple: true });
    return res && res.status === 'success' ? 'shared' : 'cancelled';
  };
  try {
    return await attempt(buildInviteFlex(ctx));
  } catch (err) {
    console.warn('[invite] flex failed', ...errInfo(err));
  }
  try {
    return await attempt(buildInviteText(ctx));
  } catch (err) {
    console.warn('[invite] text failed', ...errInfo(err));
    return 'unavailable';
  }
}
