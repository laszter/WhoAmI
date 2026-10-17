'use client';
// useGame() — state ทั้งหมดของเกมฝั่ง client (T4)
// เรียกครั้งเดียวที่ root (Game.tsx) แล้วส่ง `game` ลงไปเป็น prop — socket เป็น singleton เรียกหลายที่จะแย่ง socket กัน
// ห้ามแตะ window/localStorage นอก effect/callback (component นี้ถูก SSR ด้วย)
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { Ack, Me, PrivateCard, PublicRoomState } from '@/shared/types';
import type { GameActions, GameClient, GameStatus } from '@/lib/game-client';
import { withRoomParam } from '@/lib/invite';
import { authenticate, createInviteUrl, readInviteCode, shareInvite } from '@/lib/liff';
import {
  ACK_TIMEOUT_ERROR,
  connectSocket,
  disconnectSocket,
  getSocket,
  withAck,
  type GameSocket,
} from '@/lib/socket';

type Fail = { ok: false; error: string };
const NOT_CONNECTED: Fail = { ok: false, error: 'ยังไม่ได้เชื่อมต่อ server' };

// จำห้องล่าสุดต่อ userId (ปิด tab แล้วเปิดใหม่ → กลับห้องเดิม) — key แยกตาม user เพราะ dev mode หลาย tab ใช้ origin เดียวกัน
const savedRoomKey = (userId: string) => `spy-party:room:${userId}`;
function loadSavedRoom(userId: string): string | null {
  try {
    return window.localStorage.getItem(savedRoomKey(userId));
  } catch {
    return null;
  }
}
function saveRoom(userId: string | undefined, code: string | null): void {
  if (!userId) return;
  try {
    if (code) window.localStorage.setItem(savedRoomKey(userId), code);
    else window.localStorage.removeItem(savedRoomKey(userId));
  } catch {
    /* private mode / storage ถูกปิด — ข้าม */
  }
}

/** set/ลบ ?room= ใน URL (คง devUser ฯลฯ) — เรียกได้หลัง authenticate() resolve เท่านั้น และใช้ replaceState เสมอ */
function syncRoomParam(code: string | null): void {
  try {
    const next = withRoomParam(window.location.href, code);
    const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== cur) window.history.replaceState(window.history.state, '', next);
  } catch {
    /* history ใช้ไม่ได้ — ข้าม */
  }
}

export function useGame(): GameClient {
  const [status, setStatus] = useState<GameStatus>('booting');
  const [error, setError] = useState<string | undefined>(undefined);
  const [me, setMe] = useState<Me | null>(null);
  const [room, setRoom] = useState<PublicRoomState | null>(null);
  const [card, setCard] = useState<PrivateCard | null>(null);
  const [now, setNow] = useState(0);
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<{ code: string; message: string } | null>(null);

  const roomCodeRef = useRef<string | null>(null); // ห้องที่อยู่ — ใช้ re-join ตอน reconnect
  const meRef = useRef<Me | null>(null);
  const roomRef = useRef<PublicRoomState | null>(null); // state ล่าสุด — ให้ shareInvite อ่าน (actions เป็น stable)
  const offsetRef = useRef(0); // serverNow - Date.now()
  const autoJoinTriedRef = useRef(false);

  // actions — stable ตลอดอายุ component (อ่าน socket/ref ตอนเรียก)
  const actions = useMemo<GameActions>(() => {
    /** emit ผ่าน withAck — ไม่ต่ออยู่ → error ทันที (กัน socket.io buffer คำสั่งไว้ยิงทีหลังเมื่อ timeout ไปแล้ว) */
    const send = <T extends Ack<unknown>>(run: (s: GameSocket, ack: (r: T) => void) => void): Promise<T | Fail> => {
      const s = getSocket();
      if (!s || !s.connected) return Promise.resolve(NOT_CONNECTED);
      return withAck<T>((ack) => run(s, ack));
    };

    const enteredRoom = (code: string) => {
      roomCodeRef.current = code;
      saveRoom(meRef.current?.userId, code);
      setError(undefined);
    };

    return {
      async createRoom() {
        setInviteError(null);
        const r = await send<Ack<{ code: string }>>((s, ack) => s.emit('room:create', ack));
        if (r.ok) enteredRoom(r.code);
        return r;
      },
      async joinRoom(code: string) {
        const normalized = code.trim().toUpperCase();
        if (!normalized) return { ok: false, error: 'กรุณาใส่โค้ดห้อง' };
        setInviteError(null);
        const r = await send<Ack<{ code: string }>>((s, ack) => s.emit('room:join', { code: normalized }, ack));
        if (r.ok) enteredRoom(r.code);
        return r;
      },
      async leaveRoom() {
        const r = await send<Ack>((s, ack) => s.emit('room:leave', ack));
        // ออกฝั่ง client เสมอ (ผู้ใช้ตั้งใจออก) ไม่ว่า server จะตอบอะไร
        roomCodeRef.current = null;
        roomRef.current = null;
        saveRoom(meRef.current?.userId, null);
        setRoom(null);
        setCard(null);
        syncRoomParam(null);
        return r;
      },
      start(opts) {
        return send<Ack>((s, ack) => s.emit('game:start', opts ?? {}, ack));
      },
      openVote() {
        return send<Ack>((s, ack) => s.emit('game:openVote', ack));
      },
      vote(targetId: string) {
        return send<Ack>((s, ack) => s.emit('vote:cast', { targetId }, ack));
      },
      spyGuess(location: string) {
        return send<Ack>((s, ack) => s.emit('spy:guess', { location }, ack));
      },
      reset() {
        return send<Ack>((s, ack) => s.emit('game:reset', ack));
      },
      async shareInvite() {
        const room = roomRef.current;
        if (!room || room.code !== roomCodeRef.current) return 'unavailable';
        try {
          return await shareInvite({
            code: room.code,
            hostName: room.players.find((p) => p.userId === room.hostId)?.name ?? '',
            playerCount: room.players.length,
            inviteUrl: createInviteUrl(room.code),
          });
        } catch {
          return 'unavailable';
        }
      },
      clearInviteError() {
        setInviteError(null);
      },
    };
  }, []);

  // boot: auth → socket → listeners (StrictMode: effect รัน 2 รอบ — รอบแรกถูก cancel ก่อนสร้าง socket เพราะ authenticate() เป็น async)
  useEffect(() => {
    let cancelled = false;
    let s: GameSocket | null = null;

    const onRoomState = (state: PublicRoomState) => {
      offsetRef.current = state.serverNow - Date.now();
      setNow(state.serverNow);
      roomRef.current = state;
      setRoom(state);
      if (state.phase === 'lobby') setCard(null);
    };
    const onCard = (c: PrivateCard) => setCard(c);

    const rejoin = async (sock: GameSocket, code: string) => {
      const r = await withAck<Ack<{ code: string }>>((ack) => sock.emit('room:join', { code }, ack));
      if (r.ok || r.error === ACK_TIMEOUT_ERROR) return;
      // ห้องหาย (server restart) / เข้าไม่ได้แล้ว → กลับหน้า Home
      if (roomCodeRef.current === code) {
        roomCodeRef.current = null;
        roomRef.current = null;
        saveRoom(meRef.current?.userId, null);
        setRoom(null);
        setCard(null);
        setError(r.error);
      }
    };

    const onConnect = () => {
      // connect ครั้งแรก + ทุกครั้งที่ reconnect: server ผูกผู้เล่นกับ userId → join ซ้ำ = ได้ room:state + game:you ใหม่
      const code = roomCodeRef.current;
      if (s && code) void rejoin(s, code);
    };

    const onMe = (m: Me) => {
      meRef.current = m;
      setMe(m);
      if (autoJoinTriedRef.current || roomCodeRef.current) {
        autoJoinTriedRef.current = true;
        setStatus('ready');
        return;
      }
      autoJoinTriedRef.current = true;
      // ครั้งแรก: ลิงก์เชิญ (?room=) ก่อน แล้วค่อยห้องล่าสุดที่จำไว้ — ห้องที่จำไว้: คง 'connecting' (ไม่ให้หน้า Home กระพริบ)
      // ลิงก์เชิญ: 'ready' + pendingInviteCode → Home แสดงการ์ด "กำลังเข้าห้อง…"
      const inviteCode = readInviteCode();
      const savedCode = loadSavedRoom(m.userId);
      void (async () => {
        let joined = false;
        let inviteFail: { code: string; message: string } | null = null;
        if (inviteCode) {
          // ลิงก์เชิญ: แสดงหน้า Home แบบ "กำลังเข้าห้อง CODE…" ระหว่างรอ ack (ไม่ใช่หน้าโหลดเปล่า ๆ)
          setPendingInviteCode(inviteCode);
          setStatus('ready');
          const r = await actions.joinRoom(inviteCode);
          joined = r.ok;
          if (!r.ok) {
            inviteFail = { code: inviteCode, message: r.error };
            syncRoomParam(null); // ลบ room= ทันที กัน reload แล้ววนลองซ้ำ
            if (savedCode === inviteCode && r.error !== ACK_TIMEOUT_ERROR) saveRoom(m.userId, null);
          }
        }
        if (!joined && savedCode && savedCode !== inviteCode) {
          const r = await actions.joinRoom(savedCode);
          joined = r.ok;
          if (!r.ok && r.error !== ACK_TIMEOUT_ERROR) saveRoom(m.userId, null); // ห้องเก่าไม่มีแล้ว — ลืมไปเงียบ ๆ
        }
        // ลิงก์เชิญใช้ไม่ได้ (ไม่พบห้อง / เกมเริ่มแล้ว / ห้องเต็ม) และไม่ได้กลับห้องเดิม → บอกบน Home + เติมโค้ดให้ (ไม่ fatal)
        // set หลัง fallback เพราะ joinRoom() ล้าง inviteError ทุกครั้ง
        if (!joined && inviteFail) setInviteError(inviteFail);
        else if (inviteFail) console.warn('[invite] auto-join failed, back to saved room', inviteFail);
        setPendingInviteCode(null);
        // หลุดระหว่าง auto-join → คง 'connecting' ไว้ แล้ว session:me รอบหน้าจะตั้ง 'ready' เอง
        if (s?.connected) setStatus('ready');
      })();
    };

    const onDisconnect = (reason: Socket.DisconnectReason) => {
      if (reason === 'io client disconnect') return; // เราตัดเอง (unmount / connectSocket ใหม่)
      setStatus((prev) => (prev === 'error' ? prev : 'connecting'));
      if (reason === 'io server disconnect') s?.connect(); // server ตัดเอง → socket.io ไม่ reconnect ให้ ต้องสั่งเอง
    };

    const onConnectError = (err: Error) => {
      if (s?.active) return; // ชั่วคราว (server ล่ม/เน็ตหลุด) — socket.io retry เอง
      // ถูกปฏิเสธโดย auth middleware (token เสีย/หมดอายุ) — ไม่ retry อัตโนมัติ
      setStatus('error');
      setError(err.message || 'เชื่อมต่อ server ไม่สำเร็จ');
    };

    (async () => {
      try {
        const auth = await authenticate();
        if (cancelled) return;
        setStatus('connecting');
        s = connectSocket(auth.mode === 'dev' ? { devUser: auth.devUser } : { accessToken: auth.accessToken });
        s.on('connect', onConnect);
        s.on('disconnect', onDisconnect);
        s.on('connect_error', onConnectError);
        s.on('session:me', onMe);
        s.on('room:state', onRoomState);
        s.on('game:you', onCard);
      } catch (err) {
        if (cancelled) return;
        console.error('[useGame] boot failed', err);
        setStatus('error');
        setError(err instanceof Error && err.message ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
      }
    })();

    return () => {
      cancelled = true;
      if (!s) return;
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('connect_error', onConnectError);
      s.off('session:me', onMe);
      s.off('room:state', onRoomState);
      s.off('game:you', onCard);
      if (getSocket() === s) disconnectSocket();
      else s.disconnect();
      s = null;
    };
  }, [actions]);

  // นาฬิกา: tick เฉพาะตอนมี endsAt (discussion / voting / spyGuess) — แสดงผลเท่านั้น phase เปลี่ยนโดย server
  const endsAt = room?.endsAt;
  useEffect(() => {
    if (endsAt == null) return;
    const id = setInterval(() => setNow(Date.now() + offsetRef.current), 250);
    return () => clearInterval(id);
  }, [endsAt]);

  // sync ?room= ใน URL: อยู่ในห้อง → ?room=CODE (reload = reconnect, ปุ่ม share บน header ของ MINI App แชร์ห้องนี้)
  // ออกจากห้อง (leave / ห้องหาย) → ลบ room= · room เป็น null จนกว่า authenticate() resolve จึงไม่แตะ URL ก่อน liff.init()
  const roomCode = room?.code ?? null;
  const hadRoomRef = useRef(false);
  useEffect(() => {
    if (roomCode) syncRoomParam(roomCode);
    else if (hadRoomRef.current) syncRoomParam(null);
    hadRoomRef.current = roomCode !== null;
  }, [roomCode]);
  const inviteUrl = useMemo(() => (roomCode ? createInviteUrl(roomCode) : null), [roomCode]);

  return {
    status,
    error,
    isDev: me?.isDev ?? false,
    me,
    room,
    card,
    now,
    isHost: !!me && !!room && room.hostId === me.userId,
    inviteUrl,
    pendingInviteCode,
    inviteError,
    actions,
  };
}
