// Socket event wiring: ต่อ event ของ client เข้ากับ rooms store + game engine
// กฎ: room:state = toPublicState เท่านั้น, game:you ส่งเฉพาะ socket ของเจ้าของการ์ด,
//     Service Message เป็น fire-and-forget (ห้าม await ใน flow เกม), ทุก handler ห่อ try/catch
import type { Ack, Me } from '../shared/types';
import { cardFor, castVote, openVote, resetRoom, spyGuess, startRound, type EngineHooks } from './game';
import { buildResultParams, ensureNotificationToken, sendResultMessage } from './line-notify';
import { createRoom, detachFromOtherRooms, ensureOnlineHost, joinRoom, leaveRoom, markOffline, rooms, toPublicState } from './rooms';
import type { AuthedUser, Room, TypedServer, TypedSocket } from './types';

const NOT_IN_ROOM = { ok: false, error: 'คุณยังไม่ได้อยู่ในห้อง' } as const;
const HOST_ONLY = { ok: false, error: 'เฉพาะ host เท่านั้น' } as const;
const INTERNAL_ERROR = { ok: false, error: 'เกิดข้อผิดพลาด' } as const;

/** รัน handler แล้วตอบ ack — exception ใด ๆ → ack error + log (ไม่ให้ process ล่ม) */
function guard<T>(event: string, ack: unknown, run: () => Ack<T>): void {
  let result: Ack<T>;
  try {
    result = run();
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
}

/** รองรับ client ที่ emit โดยไม่มี payload (ack มาอยู่ตำแหน่งแรก) และ payload ที่ไม่ใช่ object */
function argsOf<P extends object>(payload: unknown, ack: unknown): { p: Partial<P>; ack: unknown } {
  if (typeof payload === 'function' && ack === undefined) return { p: {}, ack: payload };
  return { p: payload && typeof payload === 'object' ? (payload as Partial<P>) : {}, ack };
}

/** room ที่ socket นี้อยู่ (และ user ยังเป็นผู้เล่นในห้องนั้น) — ไม่งั้น null */
function getRoom(socket: TypedSocket): Room | null {
  const code = socket.data.roomCode;
  if (!code) return null;
  const room = rooms.get(code);
  if (!room || !room.players.has(socket.data.user.userId)) return null;
  return room;
}

function toMe(user: AuthedUser): Me {
  // ห้ามส่ง accessToken กลับไปที่ client
  return { userId: user.userId, name: user.name, isDev: user.isDev, ...(user.pictureUrl ? { pictureUrl: user.pictureUrl } : {}) };
}

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
  const hooks: EngineHooks = {
    broadcast: (room) => {
      // จุดเดียวที่ทุกการเปลี่ยนแปลงผ่าน (เข้า result, reset, disconnect, leave) → host offline ใน lobby/result ถูกโอนก่อนส่ง
      if (ensureOnlineHost(room)) console.log('[handlers] host transferred', room.code, '→', room.hostId);
      io.to(room.code).emit('room:state', toPublicState(room));
    },
    sendCards: (room) => {
      for (const player of room.players.values()) {
        if (!player.socketId) continue;
        const card = cardFor(room, player.userId);
        if (card) io.to(player.socketId).emit('game:you', card);
      }
    },
    onResult: (room) => {
      sendResults(room);
    },
  };

  /** ออกจากห้องปัจจุบันของ socket (ใช้ตอน room:leave และตอนสร้าง/เข้าห้องอื่น) */
  function leaveCurrent(socket: TypedSocket): void {
    const code = socket.data.roomCode;
    socket.data.roomCode = undefined;
    if (!code) return;
    void socket.leave(code);
    const room = rooms.get(code);
    if (!room || !room.players.has(socket.data.user.userId)) return;
    leaveRoom(room, socket.data.user.userId);
    if (rooms.has(room.code)) hooks.broadcast(room);
  }

  /**
   * ผู้เล่น 1 คนอยู่ได้ 1 ห้อง: หลังเข้า/สร้างห้อง keepCode สำเร็จ → เอา userId ออกจากห้องอื่นทั้งหมด
   * (กรณี socket ใหม่ / reload / หลาย tab ที่ห้องเก่ายังเก็บผู้เล่นไว้) แล้ว broadcast ห้องที่เปลี่ยน
   * จากนั้นถอด socket อื่นของ userId เดียวกันออกจากห้องเก่า (หลังได้ room:state สุดท้ายแล้ว) ไม่ให้สั่งงานแทนได้อีก
   */
  function detachUser(userId: string, keepCode: string): void {
    for (const room of detachFromOtherRooms(userId, keepCode)) hooks.broadcast(room);
    for (const [code, socketIds] of io.sockets.adapter.rooms) {
      if (code === keepCode || !socketIds) continue;
      for (const id of [...socketIds]) {
        const other = io.sockets.sockets.get(id);
        if (!other || other.data.user?.userId !== userId || other.data.roomCode !== code) continue;
        other.data.roomCode = undefined;
        void other.leave(code);
      }
    }
  }

  io.on('connection', (socket) => {
    const user = socket.data.user;
    if (!user) {
      socket.disconnect(true);
      return;
    }
    socket.emit('session:me', toMe(user));
    console.log('[handlers] connected', user.userId, socket.id);

    socket.on('room:create', (ack) =>
      guard<{ code: string }>('room:create', ack, () => {
        leaveCurrent(socket);
        const room = createRoom(user, socket.id);
        void socket.join(room.code);
        socket.data.roomCode = room.code;
        detachUser(user.userId, room.code);
        requestNotificationToken(user);
        hooks.broadcast(room);
        console.log('[handlers] room created', room.code, 'by', user.userId);
        return { ok: true, code: room.code };
      }),
    );

    socket.on('room:join', (payload, rawAck) => {
      const { p, ack } = argsOf<{ code: string }>(payload, rawAck);
      guard<{ code: string }>('room:join', ack, () => {
        const code = typeof p.code === 'string' ? p.code.trim().toUpperCase() : '';
        if (!code) return { ok: false, error: 'กรุณาใส่โค้ดห้อง' };

        const joined = joinRoom(code, user, socket.id);
        if ('error' in joined) return { ok: false, error: joined.error };
        const { room, reconnected } = joined;

        if (socket.data.roomCode && socket.data.roomCode !== room.code) leaveCurrent(socket);
        void socket.join(room.code);
        socket.data.roomCode = room.code;
        // ทั้ง join ใหม่และ reconnect: ถ้ายังค้างอยู่ห้องอื่น (เช่นถูกเก็บเป็น offline กลางเกม) ให้หลุดจากห้องนั้น
        detachUser(user.userId, room.code);
        requestNotificationToken(user);
        hooks.broadcast(room);
        if (reconnected && room.round) {
          const card = cardFor(room, user.userId);
          if (card) socket.emit('game:you', card);
        }
        return { ok: true, code: room.code };
      });
    });

    socket.on('room:leave', (ack) =>
      guard('room:leave', ack, () => {
        // idempotent: ไม่ได้อยู่ในห้อง (เช่น server restart ไปแล้ว) ก็ตอบ ok ให้ client เคลียร์ state ได้
        leaveCurrent(socket);
        return { ok: true };
      }),
    );

    socket.on('game:start', (payload, rawAck) => {
      const { p, ack } = argsOf<{ discussionSec: number; voteSec: number }>(payload, rawAck);
      guard('game:start', ack, () => {
        const room = getRoom(socket);
        if (!room) return NOT_IN_ROOM;
        if (room.hostId !== user.userId) return HOST_ONLY;
        return startRound(room, { discussionSec: p.discussionSec, voteSec: p.voteSec }, hooks);
      });
    });

    socket.on('game:openVote', (ack) =>
      guard('game:openVote', ack, () => {
        const room = getRoom(socket);
        if (!room) return NOT_IN_ROOM;
        if (room.hostId !== user.userId) return HOST_ONLY;
        return openVote(room, hooks);
      }),
    );

    socket.on('vote:cast', (payload, rawAck) => {
      const { p, ack } = argsOf<{ targetId: string }>(payload, rawAck);
      guard('vote:cast', ack, () => {
        const room = getRoom(socket);
        if (!room) return NOT_IN_ROOM;
        return castVote(room, user.userId, typeof p.targetId === 'string' ? p.targetId : '', hooks);
      });
    });

    socket.on('spy:guess', (payload, rawAck) => {
      const { p, ack } = argsOf<{ location: string }>(payload, rawAck);
      guard('spy:guess', ack, () => {
        const room = getRoom(socket);
        if (!room) return NOT_IN_ROOM;
        return spyGuess(room, user.userId, typeof p.location === 'string' ? p.location : '', hooks);
      });
    });

    socket.on('game:reset', (ack) =>
      guard('game:reset', ack, () => {
        const room = getRoom(socket);
        if (!room) return NOT_IN_ROOM;
        if (room.hostId !== user.userId) return HOST_ONLY;
        return resetRoom(room, hooks);
      }),
    );

    socket.on('disconnect', (reason) => {
      try {
        console.log('[handlers] disconnected', user.userId, socket.id, reason);
        const code = socket.data.roomCode;
        const room = code ? rooms.get(code) : undefined;
        if (!room) return;
        markOffline(room, socket.id);
        hooks.broadcast(room);
      } catch (err) {
        console.error('[handlers] disconnect error', err);
      }
    });
  });
}
