// Socket event wiring: ต่อ event ของ client เข้ากับ rooms store + game engine
// กฎ: room:state = toPublicState เท่านั้น, game:you ส่งเฉพาะ socket ของเจ้าของการ์ด,
//     Service Message เป็น fire-and-forget (ห้าม await ใน flow เกม), ทุก handler ห่อ try/catch
// state ห้องอยู่ใน kv (Vercel: Redis + หลาย instance) → ทุกการแก้ห้องผ่าน withRoom(): lock → โหลด → แก้ → บันทึก → emit
// (emit ก่อนปลด lock ให้ลำดับ room:state ตรงกับลำดับการแก้) · event ของ socket เดียวกันรันทีละตัวตามลำดับที่มาถึง
import type { Ack, Me } from '../shared/types';
import { advanceDuePhase, cardFor, castVote, openVote, phaseDeadline, resetRoom, spyGuess, startRound, type EngineHooks } from './game';
import { buildResultParams, ensureNotificationToken, sendResultMessage } from './line-notify';
import {
  clearUserRoom,
  createRoom,
  deleteRoom,
  detachFromRoom,
  ensureOnlineHost,
  expireOffline,
  getUserRoom,
  joinRoom,
  leaveRoom,
  lockRoom,
  markOffline,
  offlineDeadline,
  saveRoom,
  swapUserRoom,
  toPublicState,
} from './rooms';
import type { AuthedUser, Room, TypedServer, TypedSocket } from './types';

const NOT_IN_ROOM = { ok: false, error: 'คุณยังไม่ได้อยู่ในห้อง' } as const;
const HOST_ONLY = { ok: false, error: 'เฉพาะ host เท่านั้น' } as const;
const INTERNAL_ERROR = { ok: false, error: 'เกิดข้อผิดพลาด' } as const;
const TIMER_SLACK_MS = 25; // ยิง timer หลัง deadline นิดหน่อย (กันนาฬิกาต่าง instance เหลื่อมกัน)

/** event ของ socket เดียวกันรันทีละตัว (handler เป็น async แล้ว — ไม่งั้น room:join กับ event ถัดไปอาจสลับลำดับกัน) */
const socketQueues = new WeakMap<TypedSocket, Promise<void>>();
function serial(socket: TypedSocket, run: () => Promise<void>): void {
  const next = (socketQueues.get(socket) ?? Promise.resolve()).then(run);
  socketQueues.set(socket, next.catch(() => undefined));
}

/** รัน handler แล้วตอบ ack — exception ใด ๆ → ack error + log (ไม่ให้ process ล่ม) */
function guard<T>(socket: TypedSocket, event: string, ack: unknown, run: () => Promise<Ack<T>>): void {
  serial(socket, async () => {
    let result: Ack<T>;
    try {
      result = await run();
    } catch (err) {
      console.error(`[handlers] ${event} error`, err);
      result = INTERNAL_ERROR;
    }
    if (typeof ack !== 'function') return; // client ไม่ได้ส่ง ack มา
    try {
      (ack as (r: Ack<T>) => void)(result);
    } catch (err) {
      console.error(`[handlers] ${event} ack error`, err);
    }
  });
}

/** รองรับ client ที่ emit โดยไม่มี payload (ack มาอยู่ตำแหน่งแรก) และ payload ที่ไม่ใช่ object */
function argsOf<P extends object>(payload: unknown, ack: unknown): { p: Partial<P>; ack: unknown } {
  if (typeof payload === 'function' && ack === undefined) return { p: {}, ack: payload };
  return { p: payload && typeof payload === 'object' ? (payload as Partial<P>) : {}, ack };
}

function toMe(user: AuthedUser): Me {
  // ห้ามส่ง accessToken กลับไปที่ client
  return { userId: user.userId, name: user.name, isDev: user.isDev, ...(user.pictureUrl ? { pictureUrl: user.pictureUrl } : {}) };
}

/** socket.io room ของ user (ทุก socket/tab ของ user เดียวกัน ทุก instance) — ใช้ถอด tab เก่าออกจากห้องเก่า */
const userChannel = (userId: string) => `user:${userId}`;

/** ขอ notification token แบบ fire-and-forget — error ใด ๆ แค่ log */
function requestNotificationToken(user: AuthedUser): void {
  try {
    ensureNotificationToken(user).catch((err: unknown) => {
      console.warn('[handlers] ensureNotificationToken failed', user.userId, err instanceof Error ? err.message : err);
    });
  } catch (err) {
    console.warn('[handlers] ensureNotificationToken failed', user.userId, err instanceof Error ? err.message : err);
  }
}

/** ส่งผลแพ้/ชนะให้ทุกคนทาง Service Message — fire-and-forget, ห้าม throw */
function sendResults(room: Room): void {
  try {
    const round = room.round;
    const result = round?.result;
    if (!round || !result) return;
    const tasks = [...room.players.values()].map(async (player) => {
      const isSpy = player.userId === round.spyId;
      const won = (result.winner === 'spy') === isSpy;
      const params = buildResultParams({ playerName: player.name, won, isSpy, location: round.location, roomCode: room.code });
      await sendResultMessage({ userId: player.userId, isDev: player.isDev }, params);
    });
    void Promise.allSettled(tasks).then((settled) => {
      settled.forEach((s, i) => {
        if (s.status === 'rejected') {
          console.warn('[handlers] sendResultMessage failed', [...room.players.keys()][i], s.reason instanceof Error ? s.reason.message : s.reason);
        }
      });
    });
  } catch (err) {
    console.error('[handlers] sendResults error', err);
  }
}

export function registerHandlers(io: TypedServer): void {
  /** timer ของห้องใน instance นี้ (1 ตัวต่อห้อง = deadline ที่ใกล้ที่สุด) — ยิงแล้วแค่เรียก withRoom ให้มันเช็กเวลาเอง */
  const dueTimers = new Map<string, { at: number; handle: NodeJS.Timeout }>();

  function schedule(code: string, at: number | null): void {
    if (at === null) return;
    const current = dueTimers.get(code);
    if (current && current.at <= at) return; // ตัวที่ตั้งไว้ยิงก่อน แล้ว withRoom จะตั้งตัวถัดไปเอง
    if (current) clearTimeout(current.handle);
    const handle = setTimeout(() => {
      if (dueTimers.get(code)?.handle === handle) dueTimers.delete(code);
      withRoom(code, () => undefined).catch((err: unknown) => console.error(`[handlers] timer error (room ${code})`, err));
    }, Math.max(0, at - Date.now()) + TIMER_SLACK_MS);
    dueTimers.set(code, { at, handle });
  }

  function unschedule(code: string): void {
    const current = dueTimers.get(code);
    if (current) clearTimeout(current.handle);
    dueTimers.delete(code);
  }

  /**
   * แก้ห้องแบบ exclusive: ก่อน op จะจัดการเวลาที่ถึงแล้ว (offline จริง / phase หมดเวลา) แล้วค่อยรัน op
   * hooks ของ engine แค่จดว่าต้อง emit อะไร → emit หลังบันทึกด้วย state สุดท้าย · ห้องไม่มีอยู่ → null
   * ห้ามเรียก withRoom ซ้อนใน op
   */
  async function withRoom<T>(code: string, op: (room: Room, hooks: EngineHooks) => T): Promise<{ value: T } | null> {
    return lockRoom(code, async (room) => {
      if (!room) {
        unschedule(code);
        return null;
      }
      const fx = { broadcast: false, cards: false, result: false };
      const hooks: EngineHooks = {
        broadcast: () => {
          fx.broadcast = true;
        },
        sendCards: () => {
          fx.cards = true;
        },
        onResult: () => {
          fx.result = true;
        },
      };

      const now = Date.now();
      if (expireOffline(room, now)) hooks.broadcast(room);
      advanceDuePhase(room, hooks, now);
      const value = op(room, hooks);

      if (room.players.size === 0) {
        await deleteRoom(code);
        unschedule(code);
        return { value };
      }
      // ทุกการเปลี่ยนแปลงที่ต้อง broadcast (เข้า result, reset, disconnect, leave) → host offline ใน lobby/result ถูกโอนก่อนส่ง
      if (fx.broadcast && ensureOnlineHost(room)) console.log('[handlers] host transferred', room.code, '→', room.hostId);
      await saveRoom(room);

      if (fx.broadcast) io.to(room.code).emit('room:state', toPublicState(room));
      if (fx.cards) {
        for (const player of room.players.values()) {
          if (!player.socketId) continue;
          const card = cardFor(room, player.userId);
          if (card) io.to(player.socketId).emit('game:you', card);
        }
      }
      if (fx.result) sendResults(room);

      const deadlines = [phaseDeadline(room), offlineDeadline(room)].filter((t): t is number => t !== null);
      schedule(code, deadlines.length ? Math.min(...deadlines) : null);
      return { value };
    });
  }

  /**
   * ห้องที่ socket นี้สั่งงานได้: socket ยังอยู่ใน socket.io room ของห้อง (tab เก่าถูกถอดออกตอน user ย้ายห้อง — detachUser)
   * และ user ยังเป็นผู้เล่นในห้องนั้น
   */
  async function withSocketRoom<T>(socket: TypedSocket, op: (room: Room, hooks: EngineHooks) => Ack<T>): Promise<Ack<T>> {
    const code = socket.data.roomCode;
    const userId = socket.data.user.userId;
    if (!code || !socket.rooms.has(code)) return NOT_IN_ROOM;
    const res = await withRoom(code, (room, hooks) => (room.players.has(userId) ? op(room, hooks) : NOT_IN_ROOM));
    return res ? res.value : NOT_IN_ROOM;
  }

  /** ออกจากห้องปัจจุบันของ socket (ใช้ตอน room:leave และตอนสร้าง/เข้าห้องอื่น) */
  async function leaveCurrent(socket: TypedSocket): Promise<void> {
    const code = socket.data.roomCode;
    socket.data.roomCode = undefined;
    if (!code) return;
    void socket.leave(code);
    const userId = socket.data.user.userId;
    await withRoom(code, (room, hooks) => {
      if (!room.players.has(userId)) return;
      leaveRoom(room, userId);
      hooks.broadcast(room);
    });
    if ((await getUserRoom(userId)) === code) await clearUserRoom(userId);
  }

  /**
   * ผู้เล่น 1 คนอยู่ได้ 1 ห้อง: หลังเข้า/สร้างห้อง keepCode สำเร็จ → เอา userId ออกจากห้องเก่า
   * (กรณี socket ใหม่ / reload / หลาย tab ที่ห้องเก่ายังเก็บผู้เล่นไว้) แล้ว broadcast ห้องเก่า
   * จากนั้นถอด socket อื่นของ userId เดียวกันออกจากห้องเก่า (หลังได้ room:state สุดท้ายแล้ว)
   */
  async function detachUser(socket: TypedSocket, keepCode: string): Promise<void> {
    const userId = socket.data.user.userId;
    const prev = await swapUserRoom(userId, keepCode);
    if (!prev || prev === keepCode) return;
    await withRoom(prev, (room, hooks) => {
      if (detachFromRoom(room, userId)) hooks.broadcast(room);
    });
    io.in(userChannel(userId)).except(socket.id).socketsLeave(prev);
  }

  io.on('connection', (socket) => {
    const user = socket.data.user;
    if (!user) {
      socket.disconnect(true);
      return;
    }
    void socket.join(userChannel(user.userId));
    socket.emit('session:me', toMe(user));
    console.log('[handlers] connected', user.userId, socket.id);

    socket.on('room:create', (ack) =>
      guard<{ code: string }>(socket, 'room:create', ack, async () => {
        await leaveCurrent(socket);
        const room = await createRoom(user, socket.id);
        void socket.join(room.code);
        socket.data.roomCode = room.code;
        await detachUser(socket, room.code);
        requestNotificationToken(user);
        await withRoom(room.code, (r, hooks) => hooks.broadcast(r));
        console.log('[handlers] room created', room.code, 'by', user.userId);
        return { ok: true, code: room.code };
      }),
    );

    socket.on('room:join', (payload, rawAck) => {
      const { p, ack } = argsOf<{ code: string }>(payload, rawAck);
      guard<{ code: string }>(socket, 'room:join', ack, async () => {
        const code = typeof p.code === 'string' ? p.code.trim().toUpperCase() : '';
        if (!code) return { ok: false, error: 'กรุณาใส่โค้ดห้อง' };

        const res = await withRoom(code, (room, hooks) => {
          const joined = joinRoom(room, user, socket.id);
          if ('error' in joined) return joined;
          void socket.join(room.code); // ก่อน broadcast — socket นี้ต้องได้ room:state ด้วย
          hooks.broadcast(room);
          return { card: joined.reconnected ? cardFor(room, user.userId) : null };
        });
        if (!res) return { ok: false, error: 'ไม่พบห้องนี้' };
        if ('error' in res.value) return { ok: false, error: res.value.error };

        if (socket.data.roomCode && socket.data.roomCode !== code) await leaveCurrent(socket);
        socket.data.roomCode = code;
        // ทั้ง join ใหม่และ reconnect: ถ้ายังค้างอยู่ห้องอื่น (เช่นถูกเก็บเป็น offline กลางเกม) ให้หลุดจากห้องนั้น
        await detachUser(socket, code);
        requestNotificationToken(user);
        if (res.value.card) socket.emit('game:you', res.value.card);
        return { ok: true, code };
      });
    });

    socket.on('room:leave', (ack) =>
      guard(socket, 'room:leave', ack, async () => {
        // idempotent: ไม่ได้อยู่ในห้อง (เช่นห้องหมดอายุไปแล้ว) ก็ตอบ ok ให้ client เคลียร์ state ได้
        await leaveCurrent(socket);
        return { ok: true };
      }),
    );

    socket.on('game:start', (payload, rawAck) => {
      const { p, ack } = argsOf<{ discussionSec: number; voteSec: number }>(payload, rawAck);
      guard(socket, 'game:start', ack, () =>
        withSocketRoom(socket, (room, hooks) => {
          if (room.hostId !== user.userId) return HOST_ONLY;
          return startRound(room, { discussionSec: p.discussionSec, voteSec: p.voteSec }, hooks);
        }),
      );
    });

    socket.on('game:openVote', (ack) =>
      guard(socket, 'game:openVote', ack, () =>
        withSocketRoom(socket, (room, hooks) => {
          if (room.hostId !== user.userId) return HOST_ONLY;
          return openVote(room, hooks);
        }),
      ),
    );

    socket.on('vote:cast', (payload, rawAck) => {
      const { p, ack } = argsOf<{ targetId: string }>(payload, rawAck);
      guard(socket, 'vote:cast', ack, () =>
        withSocketRoom(socket, (room, hooks) => castVote(room, user.userId, typeof p.targetId === 'string' ? p.targetId : '', hooks)),
      );
    });

    socket.on('spy:guess', (payload, rawAck) => {
      const { p, ack } = argsOf<{ location: string }>(payload, rawAck);
      guard(socket, 'spy:guess', ack, () =>
        withSocketRoom(socket, (room, hooks) => spyGuess(room, user.userId, typeof p.location === 'string' ? p.location : '', hooks)),
      );
    });

    socket.on('game:reset', (ack) =>
      guard(socket, 'game:reset', ack, () =>
        withSocketRoom(socket, (room, hooks) => {
          if (room.hostId !== user.userId) return HOST_ONLY;
          return resetRoom(room, hooks);
        }),
      ),
    );

    // withRoom จัดการ phase ที่หมดเวลาแล้วให้เอง (กรณี timer ของ instance ที่ถือห้องไม่ได้ยิง)
    socket.on('room:sync', (ack) => guard(socket, 'room:sync', ack, () => withSocketRoom(socket, (): Ack => ({ ok: true }))));

    socket.on('disconnect', (reason) => {
      console.log('[handlers] disconnected', user.userId, socket.id, reason);
      serial(socket, async () => {
        try {
          const code = socket.data.roomCode;
          if (!code) return;
          // client ตั้งใจตัด (ปิดเกมเอง) → offline ทันที · หลุดเอง/server ตัด → รอ reconnect ก่อน (OFFLINE_GRACE_MS)
          const graceful = reason !== 'client namespace disconnect';
          await withRoom(code, (room, hooks) => {
            if (markOffline(room, socket.id, graceful) || !graceful) hooks.broadcast(room);
          });
        } catch (err) {
          console.error('[handlers] disconnect error', err);
        }
      });
    });
  });
}
