// scripts/smoke.ts — end-to-end smoke test ผ่าน Socket.IO (completion gate: `npm run smoke`)
//
//   npm run smoke                                  → spawn `tsx server.ts` เอง (port 3123, DEV_AUTH=1) แล้วปิดทุกกรณี (pass/fail/timeout/Ctrl-C)
//   SMOKE_URL=http://localhost:3000 npm run smoke  → ใช้ server ที่รันอยู่แล้ว (server นั้นต้องเปิด DEV_AUTH=1)
//   SMOKE_VERBOSE=1                                → พิมพ์ log ของ server ที่ spawn ออกมาด้วย
//
// ใช้ dev user (alice/bob/carol ฯลฯ) เท่านั้น → ไม่ยิง LINE API (line-notify ข้าม dev user)
//
// โครง: setupRoom() สร้างห้อง 3 คน → SCENARIOS ทีละรอบในห้องเดียวกัน → secrecyCheck() ท้ายสุดเสมอ
// scenario invite (I5) ใช้ dev user แยก (ivan/dave/erin/frank/full1–9) ในห้องของตัวเอง แล้วปิด socket เองตอนจบ
// เพิ่ม scenario: เขียน `async function roundXxx(ctx: Ctx)` ที่ "เริ่มและจบที่ phase lobby"
//   แล้วต่อท้าย SCENARIOS — ใช้ startGame() / resetToLobby() / waitFor() / emitAck() / marks() ซ้ำได้
//   startGame() เก็บ location จริงลง ctx.secretLocations และนับ game:you ที่ควรได้ให้ secrecyCheck() เอง
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { io, type Socket } from 'socket.io-client';
import { buildInviteUrl, normalizeRoomCode, readRoomParam, withRoomParam } from '../src/lib/invite';
import {
  buildInviteFlex,
  buildInviteText,
  FOOTER_ARROW_URL,
  shareViaPicker,
  type InviteContext,
  type ShareMessage,
  type SharePicker,
} from '../src/lib/share-message';
import { LOCATION_NAMES } from '../src/shared/locations';
import {
  LIMITS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  SOCKET_PATH,
  type Ack,
  type ClientToServerEvents,
  type Me,
  type PrivateCard,
  type PublicRoomState,
  type ServerToClientEvents,
} from '../src/shared/types';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type CitizenCard = Extract<PrivateCard, { isSpy: false }>;
type SpyCard = Extract<PrivateCard, { isSpy: true }>;

const SPAWN_PORT = 3123;
const READY_TIMEOUT_MS = 90_000;    // รอบรรทัด "> Ready on" ของ server.ts
const KILL_GRACE_MS = 5_000;        // SIGTERM แล้วรอเท่านี้ก่อน SIGKILL
const SCENARIO_TIMEOUT_MS = 120_000; // เพดานรวมของทุก scenario (กันค้าง)
const WAIT_MS = 10_000;             // default ของ waitFor / connect
const ACK_MS = 5_000;
const CARD_MS = 3_000;              // game:you ต้องมาภายในเวลานี้หลัง game:start

const log = (msg: string) => console.log(`[smoke] ${msg}`);
const pass = (msg: string) => console.log(`[smoke] ✓ ${msg}`);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ───────────────────────────── recorders ─────────────────────────────

interface Client {
  devUser: string;
  socket: GameSocket;
  me: Me;
  states: PublicRoomState[]; // room:state ทุกอันที่ socket นี้ได้ (ตามลำดับ)
  cards: PrivateCard[];      // game:you ทุกอันที่ socket นี้ได้
  expectedCards: number;     // จำนวน game:you ที่ socket นี้ "ควร" ได้ (เช็กใน secrecyCheck ว่าไม่มีการ์ดคนอื่นหลุดมา)
}

/** room:state ทุกอันจากทุก socket (ใช้ใน secrecyCheck) */
const allStates: { devUser: string; state: PublicRoomState }[] = [];
/** game:you ล่าสุดต่อ userId */
const latestCard = new Map<string, PrivateCard>();
/** ทุก client ที่เคย connect สำเร็จ (รวม socket เก่าของ bob ก่อน reconnect) */
const clientsEver: Client[] = [];
/** ทุก socket ที่สร้าง (รวมที่ connect ไม่สำเร็จ) — ปิดให้หมดตอน cleanup */
const openSockets = new Set<GameSocket>();

// ───────────────────────────── socket helpers ─────────────────────────────

async function connect(url: string, devUser: string, timeoutMs = WAIT_MS): Promise<Client> {
  const socket: GameSocket = io(url, {
    auth: { devUser },
    path: SOCKET_PATH,
    addTrailingSlash: false,
    transports: ['websocket'],
    reconnection: false, // หลุดแล้วไม่ต่อเอง: reconnect ทำเองใน scenario และไม่ค้างถ้า server ตาย
    forceNew: true,      // 1 user = 1 connection แยกกัน
    timeout: timeoutMs,
  });
  openSockets.add(socket);

  const states: PublicRoomState[] = [];
  const cards: PrivateCard[] = [];
  let userId = `dev:${devUser}`;
  socket.on('room:state', (state) => {
    states.push(state);
    allStates.push({ devUser, state });
  });
  socket.on('game:you', (card) => {
    cards.push(card);
    latestCard.set(userId, card);
  });

  let me: Me;
  try {
    me = await new Promise<Me>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${devUser}: ไม่ได้ session:me ภายใน ${timeoutMs}ms (${url})`)), timeoutMs);
      socket.once('session:me', (m) => {
        clearTimeout(timer);
        resolve(m);
      });
      socket.once('connect_error', (err) => {
        clearTimeout(timer);
        reject(new Error(`${devUser}: connect_error ${url}: ${err.message}`));
      });
    });
  } catch (err) {
    socket.disconnect();
    throw err;
  }
  userId = me.userId;
  const client: Client = { devUser, socket, me, states, cards, expectedCards: 0 };
  clientsEver.push(client);
  return client;
}

/** emit แบบมี ack → Promise ของ ack (timeout = throw) */
function emitAck<R = Ack>(c: Client, event: keyof ClientToServerEvents, payload?: object, timeoutMs = ACK_MS): Promise<R> {
  return new Promise<R>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${c.devUser}: ไม่ได้ ack ของ ${event} ภายใน ${timeoutMs}ms`)), timeoutMs);
    const ack = (r: R) => {
      clearTimeout(timer);
      resolve(r);
    };
    // event แต่ละตัวมี signature ต่างกัน (มี/ไม่มี payload) → emit แบบ untyped ที่จุดเดียว
    const raw = c.socket as unknown as { emit(ev: string, ...args: unknown[]): unknown };
    if (payload === undefined) raw.emit(event, ack);
    else raw.emit(event, payload, ack);
  });
}

function expectOk<T>(r: Ack<T>, label: string): asserts r is Extract<Ack<T>, { ok: true }> {
  if (!r.ok) assert.fail(`${label}: คาดว่า ok แต่ได้ ${JSON.stringify(r)}`);
}

/** คืนข้อความ error (ต้องเป็น string ไม่ว่าง) */
function expectFail(r: Ack<unknown>, label: string): string {
  if (r.ok) assert.fail(`${label}: คาดว่า ok:false แต่ได้ ${JSON.stringify(r)}`);
  assert.ok(typeof r.error === 'string' && r.error.length > 0, `${label}: ack ok:false แต่ไม่มีข้อความ error`);
  return r.error;
}

/** ตำแหน่งปัจจุบันของ states/cards ของแต่ละ client — ส่งเป็น `since` ให้ waitFor/waitCard เพื่อรอเฉพาะของใหม่ */
function marks(cs: Client[]): { states: number; cards: number }[] {
  return cs.map((c) => ({ states: c.states.length, cards: c.cards.length }));
}

function summarize(s: PublicRoomState | undefined): string {
  if (!s) return '(ยังไม่เคยได้ room:state)';
  const players = s.players.map((p) => `${p.name}:${p.online ? 'on' : 'off'}${p.hasVoted ? ':voted' : ''}`).join(',');
  const ends = s.endsAt === undefined ? '' : ` endsIn=${s.endsAt - s.serverNow}ms`;
  return `phase=${s.phase}${ends} host=${s.hostId} players=[${players}]`;
}

/**
 * รอ room:state ที่ตรง pred — ดูของที่ได้มาแล้วตั้งแต่ index `since` ก่อน แล้วค่อยฟังของใหม่
 * default since = state ล่าสุด (กันกรณี state มาถึงก่อน ack resolve) — ถ้ารอหลายขั้นต่อกันให้ส่ง marks() เอง
 */
function waitFor(
  c: Client,
  pred: (s: PublicRoomState) => boolean,
  label: string,
  opts: { since?: number; timeoutMs?: number } = {},
): Promise<PublicRoomState> {
  const since = opts.since ?? Math.max(0, c.states.length - 1);
  const timeoutMs = Math.max(1, opts.timeoutMs ?? WAIT_MS);
  const hit = c.states.slice(since).find(pred);
  if (hit) return Promise.resolve(hit);
  return new Promise<PublicRoomState>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      c.socket.off('room:state', onState);
      c.socket.off('disconnect', onDisconnect);
    };
    const onState = (s: PublicRoomState) => {
      if (!pred(s)) return;
      cleanup();
      resolve(s);
    };
    const onDisconnect = (reason: string) => {
      cleanup();
      reject(new Error(`${c.devUser}: หลุด (${reason}) ระหว่างรอ "${label}"`));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`${c.devUser}: timeout ${timeoutMs}ms รอ "${label}" — state ล่าสุด: ${summarize(c.states.at(-1))}`));
    }, timeoutMs);
    c.socket.on('room:state', onState);
    c.socket.on('disconnect', onDisconnect);
  });
}

/** รอ game:you อันใหม่ (index >= since) */
function waitCard(c: Client, since: number, label: string, timeoutMs = CARD_MS): Promise<PrivateCard> {
  if (c.cards.length > since) return Promise.resolve(c.cards[since]);
  return new Promise<PrivateCard>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      c.socket.off('game:you', onCard);
    };
    const onCard = (card: PrivateCard) => {
      cleanup();
      resolve(card);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`${c.devUser}: ไม่ได้ "${label}" ภายใน ${timeoutMs}ms`));
    }, Math.max(1, timeoutMs));
    c.socket.on('game:you', onCard);
  });
}

const onlineOf = (s: PublicRoomState, userId: string) => s.players.find((p) => p.userId === userId)?.online;

// ───────────────────────────── game helpers (ใช้ซ้ำได้ทุก scenario) ─────────────────────────────

interface Ctx {
  url: string;
  spawned: boolean;               // true = server ที่ smoke spawn เอง (รู้ env แน่นอน)
  code: string;
  hostId: string;
  clients: Map<string, Client>;   // devUser → client "ปัจจุบัน" (bob ถูกแทนหลัง reconnect)
  secretLocations: string[];      // location จริงของทุกรอบ → secrecyCheck
  rounds: number;
}

const players = (ctx: Ctx): Client[] => [...ctx.clients.values()];
const host = (ctx: Ctx): Client => clientOf(ctx, ctx.hostId);

function clientOf(ctx: Ctx, userId: string): Client {
  const c = players(ctx).find((x) => x.me.userId === userId);
  assert.ok(c, `ไม่พบ client ของ ${userId}`);
  return c;
}

interface RoundInfo {
  spyId: string;
  citizenIds: string[];
  location: string;
  cards: Map<string, PrivateCard>; // userId → การ์ดของรอบนี้
}

/** host กด start → ทุกคนเห็น discussion (endsAt > serverNow) + ได้ game:you ภายใน 3s → ตรวจการ์ดทั้งชุด */
async function startGame(ctx: Ctx, opts: { discussionSec: number; voteSec: number }): Promise<RoundInfo> {
  const cs = players(ctx);
  const m = marks(cs);
  const t0 = Date.now();
  expectOk(await emitAck<Ack>(host(ctx), 'game:start', opts), 'host game:start');

  for (const [i, c] of cs.entries()) {
    const s = await waitFor(c, (x) => x.phase === 'discussion', `${c.devUser}: phase discussion`, { since: m[i].states });
    assert.ok(typeof s.endsAt === 'number' && s.endsAt > s.serverNow, `${c.devUser}: discussion ต้องมี endsAt > serverNow (${summarize(s)})`);
    assert.ok(s.endsAt - s.serverNow <= opts.discussionSec * 1000, `${c.devUser}: endsAt เกิน discussionSec (${summarize(s)})`);
    assert.deepEqual(s.settings, opts, `${c.devUser}: settings ต้องตรงกับที่ host ส่ง`);
  }

  const cards = new Map<string, PrivateCard>();
  for (const [i, c] of cs.entries()) {
    const card = await waitCard(c, m[i].cards, `${c.devUser}: game:you`, CARD_MS - (Date.now() - t0));
    c.expectedCards += 1;
    cards.set(c.me.userId, card);
  }

  const spyIds = cs.filter((c) => cards.get(c.me.userId)!.isSpy).map((c) => c.me.userId);
  assert.equal(spyIds.length, 1, `ต้องมี spy 1 คนพอดี ได้ ${spyIds.length}: ${JSON.stringify([...cards])}`);
  const spyId = spyIds[0];
  const citizenIds = cs.map((c) => c.me.userId).filter((id) => id !== spyId);
  const citizenCards = citizenIds.map((id) => cards.get(id) as CitizenCard);
  const location = citizenCards[0].location;
  assert.ok(typeof location === 'string' && location.length > 0, 'citizen ต้องได้ location');
  for (const k of citizenCards) {
    assert.equal(k.location, location, 'citizen ทุกคนต้องเห็น location เดียวกัน');
    assert.ok(typeof k.role === 'string' && k.role.trim().length > 0, `citizen ต้องมี role (${JSON.stringify(k)})`);
  }
  assert.ok(LOCATION_NAMES.includes(location), `location "${location}" ไม่อยู่ใน LOCATION_NAMES`);
  const spyCard = cards.get(spyId) as SpyCard;
  assert.ok(Array.isArray(spyCard.locations) && spyCard.locations.includes(location), 'locations ของ spy ต้องมี location จริงอยู่ด้วย');
  assert.ok(!('location' in spyCard) && !('role' in spyCard), `การ์ด spy ห้ามมี location/role: ${JSON.stringify(spyCard)}`);

  ctx.secretLocations.push(location);
  ctx.rounds += 1;
  return { spyId, citizenIds, location, cards };
}

/** host กด reset → ทุกคนเห็น lobby ที่ไม่มี reveal/accusedId/endsAt */
async function resetToLobby(ctx: Ctx): Promise<void> {
  const cs = players(ctx);
  const m = marks(cs);
  expectOk(await emitAck<Ack>(host(ctx), 'game:reset'), 'host game:reset');
  for (const [i, c] of cs.entries()) {
    const s = await waitFor(c, (x) => x.phase === 'lobby', `${c.devUser}: lobby หลัง reset`, { since: m[i].states });
    assert.ok(!('reveal' in s), `${c.devUser}: lobby ห้ามมี reveal`);
    assert.ok(!('accusedId' in s), `${c.devUser}: lobby ห้ามมี accusedId`);
    assert.ok(!('endsAt' in s), `${c.devUser}: lobby ห้ามมี endsAt`);
    assert.equal(s.players.length, cs.length);
  }
}

/**
 * หลังโหวตจับ spy ได้: ทุกคนต้องเห็น phase spyGuess ที่ accusedId = spyId + endsAt ≤ SPY_GUESS_SEC
 * (location/reveal ห้ามมี — secrecyCheck ตรวจซ้ำทุก state อีกที)
 */
async function waitSpyGuess(ctx: Ctx, round: RoundInfo, since: { states: number }[]): Promise<PublicRoomState[]> {
  const out: PublicRoomState[] = [];
  for (const [i, c] of players(ctx).entries()) {
    const s = await waitFor(c, (x) => x.phase === 'spyGuess', `${c.devUser}: phase spyGuess`, { since: since[i].states });
    assert.equal(s.accusedId, round.spyId, `${c.devUser}: spyGuess ต้องมี accusedId = spyId (${summarize(s)})`);
    assert.ok(typeof s.endsAt === 'number' && s.endsAt > s.serverNow, `${c.devUser}: spyGuess ต้องมี endsAt > serverNow`);
    assert.ok(s.endsAt - s.serverNow <= LIMITS.SPY_GUESS_SEC * 1000, `${c.devUser}: endsAt ของ spyGuess เกิน ${LIMITS.SPY_GUESS_SEC}s (${summarize(s)})`);
    assert.ok(!('reveal' in s), `${c.devUser}: spyGuess ห้ามมี reveal`);
    assert.ok(!JSON.stringify(s).includes(round.location), `${c.devUser}: spyGuess ห้ามมี location จริง`);
    out.push(s);
  }
  return out;
}

// ───────────────────────────── scenarios ─────────────────────────────

/** ข้อ 1–3: connect 3 คน → create/join → lobby 3 คน */
async function setupRoom(url: string, spawned: boolean): Promise<Ctx> {
  // 1
  const alice = await connect(url, 'alice');
  const bob = await connect(url, 'bob');
  const carol = await connect(url, 'carol');
  for (const c of [alice, bob, carol]) {
    assert.equal(c.me.userId, `dev:${c.devUser}`);
    assert.equal(c.me.name, c.devUser);
    assert.equal(c.me.isDev, true);
    assert.ok(!('accessToken' in c.me), 'session:me ห้ามมี accessToken');
  }
  pass('1. alice/bob/carol connected — session:me = dev:alice, dev:bob, dev:carol (isDev, no accessToken)');

  // 2
  const created = await emitAck<Ack<{ code: string }>>(alice, 'room:create');
  expectOk(created, 'alice room:create');
  const code = created.code;
  assert.equal(typeof code, 'string');
  assert.equal(code.length, ROOM_CODE_LENGTH, `code "${code}" ต้องยาว ${ROOM_CODE_LENGTH}`);
  assert.ok([...code].every((ch) => ROOM_CODE_ALPHABET.includes(ch)), `code "${code}" มีตัวอักษรนอก alphabet`);
  const joinedBob = await emitAck<Ack<{ code: string }>>(bob, 'room:join', { code });
  expectOk(joinedBob, 'bob room:join');
  assert.equal(joinedBob.code, code);
  const bogus = code === 'ZZZZ' ? 'ZZZY' : 'ZZZZ';
  const bogusErr = expectFail(await emitAck<Ack<{ code: string }>>(carol, 'room:join', { code: bogus }), `carol room:join ${bogus}`);
  const joinedCarol = await emitAck<Ack<{ code: string }>>(carol, 'room:join', { code });
  expectOk(joinedCarol, 'carol room:join');
  assert.equal(joinedCarol.code, code);
  pass(`2. room:create → "${code}" (4 chars, alphabet ok); bob/carol room:join ok; room:join "${bogus}" → ok:false ("${bogusErr}")`);

  // 3
  const ids = ['dev:alice', 'dev:bob', 'dev:carol'];
  for (const c of [alice, bob, carol]) {
    const s = await waitFor(c, (x) => x.phase === 'lobby' && x.players.length === 3, `${c.devUser}: lobby 3 คน`, { since: 0 });
    assert.equal(s.code, code);
    assert.equal(s.hostId, 'dev:alice');
    assert.deepEqual(s.players.map((p) => p.userId), ids, 'ลำดับผู้เล่น = ลำดับเข้าห้อง');
    assert.ok(s.players.every((p) => p.online && !p.hasVoted), `ทุกคนต้อง online และยังไม่โหวต (${summarize(s)})`);
    if (spawned) assert.deepEqual(s.settings, { discussionSec: 180, voteSec: 30 }, 'settings เริ่มต้นจาก env DISCUSSION_SEC/VOTE_SEC');
  }
  pass(`3. everyone sees phase lobby, 3 players, hostId=dev:alice${spawned ? ', settings {180,30} from env' : ''}`);

  return {
    url,
    spawned,
    code,
    hostId: 'dev:alice',
    clients: new Map([['alice', alice], ['bob', bob], ['carol', carol]]),
    secretLocations: [],
    rounds: 0,
  };
}

/** ข้อ 4–10: start → การ์ด → reconnect → openVote → โหวตจับ spy ได้ → spyGuess → spy ทายถูก → spy ชนะ → reset */
async function roundVoteSpy(ctx: Ctx): Promise<void> {
  const alice = host(ctx);
  const opts = { discussionSec: 60, voteSec: 2 };

  // 4–5
  const notHostErr = expectFail(await emitAck<Ack>(clientOf(ctx, 'dev:bob'), 'game:start', opts), 'bob game:start');
  const round = await startGame(ctx, opts);
  pass(`4. bob game:start → ok:false ("${notHostErr}"); alice game:start {60s, 2s} → phase discussion, endsAt > serverNow`);
  const roles = round.citizenIds.map((id) => `${id}=${(round.cards.get(id) as CitizenCard).role}`).join(', ');
  pass(`5. game:you to all within ${CARD_MS / 1000}s — 1 spy (${round.spyId}); citizens share location "${round.location}" with roles (${roles}); spy list has it`);

  // 6 reconnect
  const oldBob = clientOf(ctx, 'dev:bob');
  const oldCard = round.cards.get('dev:bob')!;
  const markA = alice.states.length;
  oldBob.socket.disconnect();
  await waitFor(alice, (s) => s.phase === 'discussion' && onlineOf(s, 'dev:bob') === false, 'alice เห็น bob offline', { since: markA });
  const bob = await connect(ctx.url, 'bob');
  ctx.clients.set('bob', bob);
  assert.equal(bob.me.userId, 'dev:bob');
  const rejoined = await emitAck<Ack<{ code: string }>>(bob, 'room:join', { code: ctx.code });
  expectOk(rejoined, 'bob room:join (reconnect)');
  assert.equal(rejoined.code, ctx.code);
  const newCard = await waitCard(bob, 0, 'bob: game:you หลัง reconnect');
  bob.expectedCards += 1;
  assert.deepEqual(newCard, oldCard, 'reconnect ต้องได้การ์ดเดิม');
  assert.deepEqual(latestCard.get('dev:bob'), oldCard);
  await waitFor(alice, (s) => s.phase === 'discussion' && onlineOf(s, 'dev:bob') === true, 'alice เห็น bob online อีกครั้ง', { since: markA });
  await waitFor(bob, (s) => s.phase === 'discussion' && onlineOf(s, 'dev:bob') === true && s.players.length === 3, 'bob ได้ room:state ของห้องเดิม', { since: 0 });
  pass('6. bob disconnect → online=false; reconnect (same devUser) + room:join → ok, same game:you (deep-equal), online=true');

  // 7 openVote
  const openErr = expectFail(await emitAck<Ack>(bob, 'game:openVote'), 'bob game:openVote');
  const cs = players(ctx);
  const mv = marks(cs);
  const tOpen = Date.now();
  expectOk(await emitAck<Ack>(alice, 'game:openVote'), 'alice game:openVote');
  for (const [i, c] of cs.entries()) {
    const s = await waitFor(c, (x) => x.phase === 'voting', `${c.devUser}: phase voting`, { since: mv[i].states });
    assert.ok(typeof s.endsAt === 'number' && s.endsAt > s.serverNow, `${c.devUser}: voting ต้องมี endsAt > serverNow`);
    assert.ok(s.endsAt - s.serverNow <= opts.voteSec * 1000, `${c.devUser}: endsAt ของ voting เกิน voteSec (${summarize(s)})`);
  }
  pass(`7. bob game:openVote → ok:false ("${openErr}"); alice game:openVote → phase voting (endsAt ≤ ${opts.voteSec}s)`);

  // 8 vote — spy โหวตตัวเองไม่ได้ (กติกา) จึงโหวต citizen คนแรก: citizen 2 เสียง → spy ถูกจับ
  const selfErr = expectFail(await emitAck<Ack>(bob, 'vote:cast', { targetId: 'dev:bob' }), 'bob votes himself');
  const expectedVotes: Record<string, string> = {};
  for (const id of round.citizenIds) {
    expectOk(await emitAck<Ack>(clientOf(ctx, id), 'vote:cast', { targetId: round.spyId }), `${id} vote:cast spy`);
    expectedVotes[id] = round.spyId;
  }
  const dupErr = expectFail(await emitAck<Ack>(clientOf(ctx, round.citizenIds[0]), 'vote:cast', { targetId: round.spyId }), 'duplicate vote');
  const aliceIdx = cs.indexOf(alice);
  await waitFor(
    alice,
    (s) => s.phase === 'voting' && s.players.filter((p) => p.hasVoted).length === 2,
    'voting ที่ hasVoted 2 คน',
    { since: mv[aliceIdx].states },
  );
  expectOk(await emitAck<Ack>(clientOf(ctx, round.spyId), 'vote:cast', { targetId: round.citizenIds[0] }), 'spy vote:cast citizen');
  expectedVotes[round.spyId] = round.citizenIds[0];
  await waitSpyGuess(ctx, round, mv);
  const elapsed = Date.now() - tOpen;
  assert.ok(elapsed < opts.voteSec * 1000 - 500, `spyGuess ต้องมาทันทีที่โหวตครบ (ใช้ ${elapsed}ms, timer โหวต ${opts.voteSec}s)`);
  pass(`8. self-vote → ok:false ("${selfErr}"); duplicate → ok:false ("${dupErr}"); all 3 voted → spy caught → phase spyGuess after ${elapsed}ms (< ${opts.voteSec}s timer), accusedId=spyId, endsAt ≤ ${LIMITS.SPY_GUESS_SEC}s, no location`);

  // 9 spy ทายถูก → spy ชนะ
  const spy = clientOf(ctx, round.spyId);
  const bogusErr = expectFail(await emitAck<Ack>(spy, 'spy:guess', { location: 'ดาวอังคาร' }), 'spy:guess ชื่อสถานที่ที่ไม่มีจริง');
  const mg = marks(cs);
  expectOk(await emitAck<Ack>(spy, 'spy:guess', { location: round.location }), 'spy:guess สถานที่จริง');
  const results: PublicRoomState[] = [];
  for (const [i, c] of cs.entries()) {
    results.push(await waitFor(c, (x) => x.phase === 'result', `${c.devUser}: phase result หลังทาย`, { since: mg[i].states }));
  }
  for (const [i, s] of results.entries()) {
    const who = cs[i].devUser;
    assert.ok(!('endsAt' in s), `${who}: result ห้ามมี endsAt (${summarize(s)})`);
    assert.ok(s.reveal, `${who}: result ต้องมี reveal`);
    assert.equal(s.reveal.spyId, round.spyId, `${who}: reveal.spyId`);
    assert.equal(s.reveal.location, round.location, `${who}: reveal.location`);
    assert.equal(s.reveal.winner, 'spy', `${who}: spy ทายถูก → spy ชนะ`);
    assert.deepEqual(s.reveal.spyGuess, { location: round.location, correct: true }, `${who}: reveal.spyGuess`);
    assert.equal(s.accusedId, round.spyId, `${who}: accusedId`);
    assert.equal(Object.keys(s.reveal.votes).length, 3, `${who}: reveal.votes ต้องมี 3 entry`);
    assert.deepEqual(s.reveal.votes, expectedVotes, `${who}: reveal.votes`);
    assert.ok(s.players.every((p) => p.hasVoted), `${who}: ทุกคน hasVoted ใน result`);
  }
  const lateErr = expectFail(await emitAck<Ack>(spy, 'spy:guess', { location: round.location }), 'spy:guess ซ้ำหลัง result');
  pass(`9. unknown location → ok:false ("${bogusErr}"); spy guesses right → result winner=spy, spyGuess.correct=true, accusedId=spyId, 3 votes; guess again → ok:false ("${lateErr}")`);

  // 10 reset
  const resetErr = expectFail(await emitAck<Ack>(bob, 'game:reset'), 'bob game:reset');
  await resetToLobby(ctx);
  pass(`10. bob game:reset → ok:false ("${resetErr}"); alice game:reset → phase lobby without reveal/accusedId/endsAt`);
}

/** รอบ 2: timer เดินเอง (discussion → voting → result) ไม่มีใครส่งอะไร ไม่มีใครโหวต → spy ชนะ, accusedId null */
async function roundTimeoutNoVotes(ctx: Ctx): Promise<void> {
  const cs = players(ctx);
  const m = marks(cs);
  const opts = { discussionSec: 1, voteSec: 1 };
  const t0 = Date.now();
  const round = await startGame(ctx, opts);
  pass(`round 2: game:start {1s, 1s} → discussion + new game:you (spy=${round.spyId}, location="${round.location}")`);

  for (const [i, c] of cs.entries()) {
    const s = await waitFor(c, (x) => x.phase === 'voting', `${c.devUser}: voting จาก timer`, { since: m[i].states, timeoutMs: 4000 - (Date.now() - t0) });
    assert.ok(typeof s.endsAt === 'number' && s.endsAt > s.serverNow && s.endsAt - s.serverNow <= 1000, `${c.devUser}: endsAt ของ voting (${summarize(s)})`);
  }
  const tVoting = Date.now() - t0;
  assert.ok(tVoting >= 900, `voting มาเร็วเกิน (${tVoting}ms) — discussion timer คือ 1s`);
  pass(`round 2: discussion → voting by server timer after ${tVoting}ms (no client input)`);

  const t1 = Date.now();
  const results: PublicRoomState[] = [];
  for (const [i, c] of cs.entries()) {
    results.push(await waitFor(c, (x) => x.phase === 'result', `${c.devUser}: result จาก timer`, { since: m[i].states, timeoutMs: 4000 - (Date.now() - t1) }));
  }
  const tResult = Date.now() - t1;
  for (const [i, s] of results.entries()) {
    const who = cs[i].devUser;
    assert.ok(s.reveal, `${who}: result ต้องมี reveal`);
    assert.equal(s.reveal.winner, 'spy', `${who}: ไม่มีใครโหวต → spy ชนะ`);
    assert.ok('accusedId' in s, `${who}: result ต้องมี key accusedId`);
    assert.equal(s.accusedId, null, `${who}: accusedId ต้องเป็น null`);
    assert.equal(s.reveal.spyId, round.spyId, `${who}: reveal.spyId`);
    assert.equal(s.reveal.location, round.location, `${who}: reveal.location`);
    assert.deepEqual(s.reveal.votes, {}, `${who}: reveal.votes ต้องว่าง`);
    assert.ok(s.players.every((p) => !p.hasVoted), `${who}: ไม่มีใคร hasVoted`);
    assert.ok(!('endsAt' in s), `${who}: result ห้ามมี endsAt`);
  }
  pass(`round 2: voting → result by timer after ${tResult}ms, no votes → winner=spy, accusedId=null`);

  await resetToLobby(ctx);
  pass('round 2: game:reset → lobby');
}

/** รอบ 3 (T7): ทุกคนโหวต spy → spyGuess → คนอื่นทาย = ok:false → spy ทายผิด → citizens ชนะ, spyGuess.correct=false */
async function roundSpyGuessWrong(ctx: Ctx): Promise<void> {
  const cs = players(ctx);
  const opts = { discussionSec: 60, voteSec: 30 };
  const round = await startGame(ctx, opts);
  const mv = marks(cs);
  expectOk(await emitAck<Ack>(host(ctx), 'game:openVote'), 'host game:openVote');
  for (const [i, c] of cs.entries()) await waitFor(c, (x) => x.phase === 'voting', `${c.devUser}: voting`, { since: mv[i].states });

  const early = expectFail(await emitAck<Ack>(clientOf(ctx, round.spyId), 'spy:guess', { location: round.location }), 'spy:guess ระหว่าง voting');
  for (const id of round.citizenIds) expectOk(await emitAck<Ack>(clientOf(ctx, id), 'vote:cast', { targetId: round.spyId }), `${id} vote spy`);
  expectOk(await emitAck<Ack>(clientOf(ctx, round.spyId), 'vote:cast', { targetId: round.citizenIds[1] }), 'spy vote citizen');
  await waitSpyGuess(ctx, round, mv);
  pass(`round 3: spy:guess during voting → ok:false ("${early}"); all voted spy → spyGuess (accusedId=spyId, no location)`);

  const notSpyErr = expectFail(await emitAck<Ack>(clientOf(ctx, round.citizenIds[0]), 'spy:guess', { location: round.location }), 'citizen spy:guess');
  const spyCard = round.cards.get(round.spyId) as SpyCard;
  const wrong = spyCard.locations.find((l) => l !== round.location);
  assert.ok(wrong, 'ต้องมีสถานที่อื่นให้ทายผิด');
  const mg = marks(cs);
  expectOk(await emitAck<Ack>(clientOf(ctx, round.spyId), 'spy:guess', { location: wrong }), 'spy:guess ผิด');
  for (const [i, c] of cs.entries()) {
    const s = await waitFor(c, (x) => x.phase === 'result', `${c.devUser}: result หลังทายผิด`, { since: mg[i].states });
    assert.ok(s.reveal, `${c.devUser}: result ต้องมี reveal`);
    assert.equal(s.reveal.winner, 'citizens', `${c.devUser}: spy ทายผิด → citizens ชนะ`);
    assert.deepEqual(s.reveal.spyGuess, { location: wrong, correct: false }, `${c.devUser}: reveal.spyGuess`);
    assert.equal(s.reveal.location, round.location);
    assert.equal(s.accusedId, round.spyId);
    assert.ok(!('endsAt' in s), `${c.devUser}: result ห้ามมี endsAt`);
  }
  pass(`round 3: citizen spy:guess → ok:false ("${notSpyErr}"); spy guesses "${wrong}" (wrong) → result winner=citizens, spyGuess.correct=false`);

  await resetToLobby(ctx);
  pass('round 3: game:reset → lobby');
}

// ───────────────────────────── invite scenarios (I5) ─────────────────────────────

const INVITE_LIFF_ID = '123-abc';
const INVITE_ORIGIN = 'https://x.app';

function inviteCtx(code: string, inviteUrl: string): InviteContext {
  return { code, hostName: 'alice', playerCount: 3, maxPlayers: LIMITS.MAX_PLAYERS, inviteUrl, liffId: INVITE_LIFF_ID, origin: INVITE_ORIGIN };
}

/** หา node ทุกตัวใน JSON tree ที่ตรง pred */
function findNodes(node: unknown, pred: (n: Record<string, unknown>) => boolean, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    for (const x of node) findNodes(x, pred, out);
  } else if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (pred(obj)) out.push(obj);
    for (const v of Object.values(obj)) findNodes(v, pred, out);
  }
  return out;
}

/** invite 1: pure checks ของ src/lib/invite.ts + src/lib/share-message.ts (ไม่แตะ server) */
async function inviteUnitChecks(): Promise<void> {
  assert.equal(normalizeRoomCode(' k7qx '), 'K7QX');
  assert.equal(normalizeRoomCode('K7Q0'), null, '0 ไม่อยู่ใน alphabet');
  assert.equal(normalizeRoomCode('ABCDE'), null, 'ยาวเกิน');
  assert.equal(normalizeRoomCode(''), null);
  assert.equal(normalizeRoomCode(null), null);
  assert.equal(normalizeRoomCode(undefined), null);

  const liffUrl = buildInviteUrl('K7QX', { liffId: INVITE_LIFF_ID, origin: INVITE_ORIGIN });
  assert.equal(liffUrl, 'https://miniapp.line.me/123-abc/?room=K7QX');
  const devUrl = buildInviteUrl('K7QX', { origin: INVITE_ORIGIN });
  assert.equal(devUrl, 'https://x.app/?room=K7QX');
  assert.equal(buildInviteUrl('K7QX', { origin: `${INVITE_ORIGIN}/` }), devUrl, 'origin ที่มี / ท้าย ต้องไม่ได้ //');
  assert.equal(readRoomParam(new URL(liffUrl).search), 'K7QX');
  assert.equal(readRoomParam(new URL(devUrl).search), 'K7QX');
  assert.equal(readRoomParam('?room=%20k7qx%20&devUser=bob'), 'K7QX');
  assert.equal(readRoomParam('?devUser=bob'), null);
  assert.equal(readRoomParam('?room=K7Q0'), null);

  const added = new URL(withRoomParam('/?devUser=bob', 'K7QX'), 'http://localhost');
  assert.equal(added.searchParams.get('devUser'), 'bob', 'withRoomParam ต้องคง devUser');
  assert.equal(added.searchParams.get('room'), 'K7QX');
  const removed = withRoomParam('/?room=K7QX&devUser=bob', null);
  const removedUrl = new URL(removed, 'http://localhost');
  assert.ok(!removedUrl.searchParams.has('room'), `withRoomParam(null) ต้องลบ room: ${removed}`);
  assert.equal(removedUrl.searchParams.get('devUser'), 'bob');
  assert.equal(withRoomParam('http://localhost:3000/lobby?devUser=bob#x', 'AAAA'), '/lobby?devUser=bob&room=AAAA#x', 'คง path/hash');
  pass('invite 1. normalizeRoomCode / buildInviteUrl (permanent link + dev) / readRoomParam / withRoomParam (keeps devUser) ok');

  const ctx = inviteCtx('K7QX', liffUrl);
  const flex = buildInviteFlex(ctx) as unknown as Record<string, unknown> & { contents: Record<string, unknown> };
  const json = JSON.stringify(flex);
  assert.equal(flex.type, 'flex');
  assert.equal(flex.contents.type, 'bubble');
  assert.ok(typeof flex.altText === 'string' && flex.altText.trim().length > 0, 'altText ต้องไม่ว่าง');
  assert.ok(json.includes(FOOTER_ARROW_URL), 'ต้องมีรูปลูกศร footer ตาม guideline');
  const arrows = findNodes(flex, (n) => n.type === 'image' && n.url === FOOTER_ARROW_URL);
  assert.equal(arrows.length, 1, 'ลูกศร footer ต้องมี 1 อัน');
  assert.deepEqual((arrows[0].action as { uri?: string } | undefined)?.uri, `https://miniapp.line.me/${INVITE_LIFF_ID}`, 'uri ของลูกศร footer');
  const buttons = findNodes(flex, (n) => n.type === 'button');
  const primary = buttons.filter((b) => b.style === 'primary');
  assert.equal(primary.length, 1, 'ต้องมีปุ่ม primary 1 ปุ่ม');
  assert.equal((primary[0].action as { uri?: string }).uri, ctx.inviteUrl, 'ปุ่ม primary ต้องพาไป inviteUrl');
  assert.ok(buttons.length <= 3, 'ปุ่มไม่เกิน 3');
  assert.ok(!json.includes('"secondary"'), 'ห้ามใช้ style secondary');
  assert.ok(!json.includes('"carousel"'), 'ห้ามใช้ carousel');
  const uriActions = findNodes(flex, (n) => n.type === 'uri');
  assert.ok(uriActions.every((a) => typeof a.uri === 'string' && (a.uri as string).startsWith('https://')), 'ทุก action ต้องเป็น uri https');
  const text = buildInviteText(ctx) as unknown as { type: string; text: string };
  assert.equal(text.type, 'text');
  assert.ok(text.text.includes(ctx.inviteUrl) && text.text.includes(ctx.code), `text fallback ต้องมีโค้ดและลิงก์: ${text.text}`);
  const blank = buildInviteFlex({ ...ctx, hostName: '   ' }) as unknown as { altText: string };
  assert.ok(blank.altText.trim().length > 0 && !blank.altText.startsWith(' '), 'hostName ว่าง → altText ยังไม่ว่าง');
  pass('invite 2. buildInviteFlex: flex/bubble, altText, footer arrow → miniapp.line.me/{liffId}, primary button → inviteUrl, no secondary/carousel; text fallback has code+link');

  // shareViaPicker ด้วย mock picker
  type Call = ShareMessage[];
  const mock = (opts: { available?: boolean | 'throw'; results: (('success' | 'cancel' | 'reject'))[] }) => {
    const calls: Call[] = [];
    const picker: SharePicker = {
      isApiAvailable: (name) => {
        assert.equal(name, 'shareTargetPicker');
        if (opts.available === 'throw') throw new Error('boom');
        return opts.available ?? true;
      },
      shareTargetPicker: (messages, options) => {
        calls.push(messages);
        assert.ok(messages.length >= 1 && messages.length <= 5, 'picker รับได้ 1–5 message');
        assert.equal(options?.isMultiple, true);
        const r = opts.results[calls.length - 1];
        if (r === 'success') return Promise.resolve({ status: 'success' as const });
        if (r === 'cancel') return Promise.resolve(undefined);
        return Promise.reject(Object.assign(new Error('INVALID_ARGUMENT'), { code: '400' }));
      },
    };
    return { picker, calls };
  };
  const typeOf = (c: Call) => (c[0] as { type: string }).type;
  const origWarn = console.warn;
  const warns: unknown[][] = [];
  console.warn = (...args: unknown[]) => void warns.push(args);
  try {
    const off = mock({ available: false, results: [] });
    assert.equal(await shareViaPicker(off.picker, ctx), 'unavailable');
    assert.equal(off.calls.length, 0, 'unavailable → ห้ามเปิด picker');
    const thr = mock({ available: 'throw', results: [] });
    assert.equal(await shareViaPicker(thr.picker, ctx), 'unavailable', 'isApiAvailable throw → unavailable');
    const ok = mock({ results: ['success'] });
    assert.equal(await shareViaPicker(ok.picker, ctx), 'shared');
    assert.deepEqual(ok.calls.map(typeOf), ['flex']);
    assert.deepEqual(ok.calls[0][0], buildInviteFlex(ctx), 'ส่ง Flex ตาม buildInviteFlex');
    const cancel = mock({ results: ['cancel'] });
    assert.equal(await shareViaPicker(cancel.picker, ctx), 'cancelled');
    assert.equal(cancel.calls.length, 1, 'cancel → ห้ามลองซ้ำด้วย text');
    const fallback = mock({ results: ['reject', 'success'] });
    assert.equal(await shareViaPicker(fallback.picker, ctx), 'shared');
    assert.deepEqual(fallback.calls.map(typeOf), ['flex', 'text'], 'flex reject → ลอง text 1 ครั้ง');
    const fbCancel = mock({ results: ['reject', 'cancel'] });
    assert.equal(await shareViaPicker(fbCancel.picker, ctx), 'cancelled');
    const both = mock({ results: ['reject', 'reject'] });
    assert.equal(await shareViaPicker(both.picker, ctx), 'unavailable', 'reject ทั้งสองครั้ง → unavailable (ไม่ throw)');
    assert.equal(both.calls.length, 2, 'ลอง text แค่ 1 ครั้ง');
  } finally {
    console.warn = origWarn;
  }
  assert.equal(warns.length, 4, `ต้อง warn ทุกครั้งที่ picker reject (ได้ ${warns.length})`);
  pass('invite 3. shareViaPicker (mock): unavailable/throw → unavailable (no picker); success → shared (Flex); cancel → cancelled (no retry); Flex reject → text once → shared/cancelled; both reject → unavailable');
}

/** connect ชุด dev user ของ scenario (เก็บไว้ปิดตอนจบ) */
async function connectAll(url: string, names: string[], bag: Client[]): Promise<Client[]> {
  const out: Client[] = [];
  for (const name of names) {
    const c = await connect(url, name);
    bag.push(c);
    out.push(c);
  }
  return out;
}

function closeAll(bag: Client[]): void {
  for (const c of bag) c.socket.disconnect();
}

/** invite 2: เข้าห้องด้วยโค้ดจากลิงก์เชิญ + ย้ายห้อง (I2) = ชื่อหายจาก lobby ห้องเก่า */
async function inviteLinkAndMove(ctx: Ctx): Promise<void> {
  const bag: Client[] = [];
  try {
    const [ivan, dave] = await connectAll(ctx.url, ['ivan', 'dave'], bag);
    const created = await emitAck<Ack<{ code: string }>>(ivan, 'room:create');
    expectOk(created, 'ivan room:create');
    const codeA = created.code;
    assert.notEqual(codeA, ctx.code);

    // ลิงก์เชิญทั้ง 2 แบบ → อ่านโค้ดกลับได้ (เหมือน readInviteCode หลังเปิดลิงก์)
    const devLink = buildInviteUrl(codeA, { origin: ctx.url });
    const liffLink = buildInviteUrl(codeA, { liffId: INVITE_LIFF_ID, origin: ctx.url });
    const fromLink = readRoomParam(new URL(devLink).search);
    assert.equal(fromLink, codeA);
    assert.equal(readRoomParam(new URL(liffLink).search), codeA);
    const mi = marks([ivan]);
    const joined = await emitAck<Ack<{ code: string }>>(dave, 'room:join', { code: fromLink });
    expectOk(joined, 'dave room:join (code จากลิงก์)');
    assert.equal(joined.code, codeA);
    const both = await waitFor(ivan, (s) => s.code === codeA && s.players.length === 2, 'ivan เห็น dave เข้าห้อง A', { since: mi[0].states });
    assert.deepEqual(both.players.map((p) => p.userId), ['dev:ivan', 'dev:dave']);
    await waitFor(dave, (s) => s.code === codeA && s.players.length === 2, 'dave ได้ room:state ห้อง A', { since: 0 });
    // โค้ดตัวเล็ก/มีช่องว่างจากลิงก์ที่ผู้ใช้พิมพ์เอง → normalize แล้วเป็นโค้ดเดียวกัน
    assert.equal(readRoomParam(`?room=${encodeURIComponent(` ${codeA.toLowerCase()} `)}`), codeA);
    pass(`invite 4. ivan room:create "${codeA}" → invite link ${devLink} → readRoomParam = "${fromLink}" → dave room:join ok, lobby [ivan, dave]`);

    // dave ปิดแอป (socket หลุด) → ห้อง A ยังเก็บ dave เป็น offline
    const m1 = marks([ivan]);
    dave.socket.disconnect();
    await waitFor(ivan, (s) => s.code === codeA && onlineOf(s, 'dev:dave') === false, 'ivan เห็น dave offline', { since: m1[0].states });

    // dave เปิดแอปใหม่ (socket ใหม่) แล้วสร้างห้อง B → ต้องหายจาก lobby ห้อง A
    const dave2 = (await connectAll(ctx.url, ['dave'], bag))[0];
    const m2 = marks([ivan]);
    const createdB = await emitAck<Ack<{ code: string }>>(dave2, 'room:create');
    expectOk(createdB, 'dave room:create (ห้อง B)');
    const codeB = createdB.code;
    assert.notEqual(codeB, codeA);
    const left = await waitFor(ivan, (s) => s.code === codeA && !s.players.some((p) => p.userId === 'dev:dave'), 'ivan: ห้อง A ไม่มี dev:dave', { since: m2[0].states });
    assert.deepEqual(left.players.map((p) => p.userId), ['dev:ivan']);
    assert.equal(left.hostId, 'dev:ivan');
    const inB = await waitFor(dave2, (s) => s.code === codeB, 'dave ได้ room:state ห้อง B', { since: 0 });
    assert.deepEqual(inB.players.map((p) => p.userId), ['dev:dave']);
    assert.equal(inB.hostId, 'dev:dave');
    assert.ok(dave2.states.every((s) => s.code === codeB), 'socket ใหม่ของ dave ต้องไม่ได้ state ของห้อง A');
    pass(`invite 5. dave disconnect (offline in "${codeA}") → new socket room:create "${codeB}" → ivan's lobby "${codeA}" = [ivan] (no dev:dave), dave alone in "${codeB}"`);

    // host ย้ายห้องตามลิงก์เชิญ (tab เก่ายังเปิดอยู่) → host โอน + socket เก่าถูกถอดออกจากห้อง B
    const [erin] = await connectAll(ctx.url, ['erin'], bag);
    expectOk(await emitAck<Ack<{ code: string }>>(erin, 'room:join', { code: codeB }), 'erin room:join B');
    await waitFor(erin, (s) => s.code === codeB && s.players.length === 2, 'erin เห็นห้อง B 2 คน', { since: 0 });
    const davePhone = (await connectAll(ctx.url, ['dave'], bag))[0];
    const m3 = marks([erin, ivan]);
    expectOk(await emitAck<Ack<{ code: string }>>(davePhone, 'room:join', { code: codeA }), 'dave (tab ใหม่) room:join A จากลิงก์');
    const bAfter = await waitFor(erin, (s) => s.code === codeB && !s.players.some((p) => p.userId === 'dev:dave'), 'erin: ห้อง B ไม่มี dev:dave', { since: m3[0].states });
    assert.equal(bAfter.hostId, 'dev:erin', 'host ย้ายห้อง → โอน host ให้คนที่เหลือ');
    await waitFor(ivan, (s) => s.code === codeA && s.players.length === 2 && onlineOf(s, 'dev:dave') === true, 'ivan เห็น dave กลับเข้าห้อง A', { since: m3[1].states });
    const staleErr = expectFail(await emitAck<Ack>(dave2, 'game:start', { discussionSec: 60, voteSec: 30 }), 'tab เก่าของ dave สั่ง game:start ห้อง B');
    pass(`invite 6. dave (host of "${codeB}", old tab still open) joins "${codeA}" via link → gone from "${codeB}", host → dev:erin; old tab game:start → ok:false ("${staleErr}")`);
  } finally {
    closeAll(bag);
  }
}

/** invite 3: ห้องเต็ม (MAX_PLAYERS) → คนถัดไปเข้าไม่ได้ */
async function inviteRoomFull(ctx: Ctx): Promise<void> {
  const bag: Client[] = [];
  try {
    const names = Array.from({ length: LIMITS.MAX_PLAYERS + 1 }, (_, i) => `full${i + 1}`);
    const cs = await connectAll(ctx.url, names, bag);
    const created = await emitAck<Ack<{ code: string }>>(cs[0], 'room:create');
    expectOk(created, 'full1 room:create');
    const code = created.code;
    const link = buildInviteUrl(code, { origin: ctx.url });
    for (const c of cs.slice(1, LIMITS.MAX_PLAYERS)) {
      expectOk(await emitAck<Ack<{ code: string }>>(c, 'room:join', { code: readRoomParam(new URL(link).search) }), `${c.devUser} room:join`);
    }
    const host0 = cs[0];
    await waitFor(host0, (s) => s.code === code && s.players.length === LIMITS.MAX_PLAYERS, `ห้อง ${LIMITS.MAX_PLAYERS} คน`, { since: 0 });
    const last = cs[LIMITS.MAX_PLAYERS];
    const err = expectFail(await emitAck<Ack<{ code: string }>>(last, 'room:join', { code }), `${last.devUser} room:join ห้องเต็ม`);
    assert.ok(err.includes('เต็ม'), `error ต้องมีคำว่า "เต็ม": "${err}"`);
    await sleep(100);
    assert.equal(last.states.length, 0, 'คนที่เข้าไม่ได้ต้องไม่ได้ room:state');
    assert.equal(host0.states.at(-1)?.players.length, LIMITS.MAX_PLAYERS, 'ห้องยังมี MAX_PLAYERS คน');
    // ผู้เล่นในห้อง reconnect ได้แม้ห้องเต็ม
    const m = marks([host0]);
    cs[1].socket.disconnect();
    await waitFor(host0, (s) => onlineOf(s, `dev:${cs[1].devUser}`) === false, `${cs[1].devUser} offline`, { since: m[0].states });
    const again = (await connectAll(ctx.url, [cs[1].devUser], bag))[0];
    expectOk(await emitAck<Ack<{ code: string }>>(again, 'room:join', { code }), `${again.devUser} reconnect ห้องเต็ม`);
    pass(`invite 7. room "${code}" with ${LIMITS.MAX_PLAYERS} dev users → ${last.devUser} room:join → ok:false ("${err}"); member reconnect while full → ok`);
  } finally {
    closeAll(bag);
  }
}

/** invite 4: เกมเริ่มแล้ว → คนใหม่เข้าไม่ได้ แต่ผู้เล่นเดิม reconnect ได้ (ใช้ห้องหลัก จบที่ lobby) */
async function inviteGameStarted(ctx: Ctx): Promise<void> {
  const bag: Client[] = [];
  try {
    const round = await startGame(ctx, { discussionSec: 60, voteSec: 30 });
    const [frank] = await connectAll(ctx.url, ['frank'], bag);
    const code = readRoomParam(new URL(buildInviteUrl(ctx.code, { origin: ctx.url })).search);
    const err = expectFail(await emitAck<Ack<{ code: string }>>(frank, 'room:join', { code }), 'frank room:join ระหว่างเกม');
    assert.ok(err.includes('เริ่มแล้ว'), `error ต้องมีคำว่า "เริ่มแล้ว": "${err}"`);
    await sleep(100);
    assert.equal(frank.states.length, 0, 'คนที่เข้าไม่ได้ต้องไม่ได้ room:state');
    assert.equal(frank.cards.length, 0, 'คนที่เข้าไม่ได้ต้องไม่ได้ game:you');

    const alice = host(ctx);
    const oldCarol = clientOf(ctx, 'dev:carol');
    const oldCard = round.cards.get('dev:carol');
    const ma = alice.states.length;
    oldCarol.socket.disconnect();
    await waitFor(alice, (s) => s.phase === 'discussion' && onlineOf(s, 'dev:carol') === false, 'alice เห็น carol offline', { since: ma });
    const carol = await connect(ctx.url, 'carol');
    ctx.clients.set('carol', carol);
    const rejoin = await emitAck<Ack<{ code: string }>>(carol, 'room:join', { code });
    expectOk(rejoin, 'carol reconnect ระหว่างเกม');
    const card = await waitCard(carol, 0, 'carol: game:you หลัง reconnect');
    carol.expectedCards += 1;
    assert.deepEqual(card, oldCard, 'reconnect ต้องได้การ์ดเดิม');
    await waitFor(alice, (s) => s.phase === 'discussion' && onlineOf(s, 'dev:carol') === true, 'alice เห็น carol online', { since: ma });
    pass(`invite 8. game started → frank room:join → ok:false ("${err}"); carol reconnect mid-game → ok:true + same card`);

    await resetToLobby(ctx);
    pass('invite 8. game:reset → lobby');
  } finally {
    closeAll(bag);
  }
}

/**
 * ลำดับ scenario หลัง setupRoom — แต่ละตัวต้องเริ่มและจบที่ phase lobby ของห้อง ctx.code
 * (หมดเวลา spyGuess 15s → citizens ทดสอบใน runtime test แยก ไม่ใส่ที่นี่เพื่อไม่ให้ smoke ช้าขึ้น 15s)
 */
const SCENARIOS: [name: string, run: (ctx: Ctx) => Promise<void>][] = [
  ['round 1', roundVoteSpy],
  ['round 2', roundTimeoutNoVotes],
  ['round 3', roundSpyGuessWrong],
  ['invite: pure checks + shareViaPicker', () => inviteUnitChecks()],
  ['invite: link join + move room', inviteLinkAndMove],
  ['invite: room full', inviteRoomFull],
  ['invite: game started', inviteGameStarted],
];

/** ท้ายสุด: ทุก room:state ก่อน phase result ต้องไม่มีคำตอบ + game:you ต้องไม่หลุดไปหาคนอื่น */
async function secrecyCheck(ctx: Ctx): Promise<void> {
  const bannedKeys = ['"reveal"', '"spyId"', '"location"', '"roles"', '"votes"', '"accessToken"', '"socketId"'];
  const secrets = [...new Set(ctx.secretLocations)];
  assert.equal(ctx.secretLocations.length, ctx.rounds, 'ทุกรอบต้องบันทึก location');
  const byPhase: Record<string, number> = {};
  let checked = 0;
  for (const { devUser, state } of allStates) {
    byPhase[state.phase] = (byPhase[state.phase] ?? 0) + 1;
    const json = JSON.stringify(state);
    if (state.phase === 'result') {
      assert.ok(state.reveal, `${devUser}: state result ต้องมี reveal`);
      continue;
    }
    for (const key of bannedKeys) assert.ok(!json.includes(key), `${devUser}: state phase ${state.phase} มี ${key}: ${json}`);
    for (const loc of secrets) assert.ok(!json.includes(loc), `${devUser}: state phase ${state.phase} มี location จริง "${loc}": ${json}`);
    for (const loc of LOCATION_NAMES) assert.ok(!json.includes(loc), `${devUser}: state phase ${state.phase} มีชื่อสถานที่ "${loc}": ${json}`);
    if (state.phase !== 'spyGuess') assert.ok(!('accusedId' in state), `${devUser}: phase ${state.phase} ห้ามมี accusedId: ${json}`);
    checked++;
  }
  for (const phase of ['lobby', 'discussion', 'voting', 'spyGuess', 'result']) {
    assert.ok((byPhase[phase] ?? 0) > 0, `ไม่มี state phase ${phase} ให้ตรวจ (check ไม่มีความหมาย)`);
  }
  const counts = Object.entries(byPhase).map(([p, n]) => `${p}:${n}`).join(' ');
  pass(`secrecy: ${checked} pre-result room:state payloads have no reveal/spyId/location/roles/votes or location names (${secrets.map((s) => `"${s}"`).join(', ')}) [${counts}]`);

  for (const c of clientsEver) {
    assert.equal(c.cards.length, c.expectedCards, `${c.devUser}: ได้ game:you ${c.cards.length} ใบ คาดว่า ${c.expectedCards} (การ์ดคนอื่นหลุดมา?)`);
  }
  pass(`secrecy: game:you private — each socket got only its own card(s) (${clientsEver.map((c) => `${c.devUser}:${c.cards.length}`).join(', ')})`);
}

// ───────────────────────────── server lifecycle ─────────────────────────────

interface ServerHandle {
  url: string;
  child: ChildProcess;
  pid: number | undefined;
  tail: string[];         // stdout/stderr ล่าสุด (พิมพ์ตอน FAIL)
  lifecycle: { stopping: boolean }; // stopping=true → exit ของ child เป็นสิ่งที่เราสั่ง (ไม่ใช่ server ตายเอง)
  ready: Promise<void>;
  died: Promise<never>;   // reject ถ้า server ตายเองก่อนเรา stop
}

let server: ServerHandle | null = null;

function projectRoot(): string {
  return typeof __dirname === 'string' ? path.resolve(__dirname, '..') : process.cwd();
}

function spawnServer(): ServerHandle {
  const root = projectRoot();
  const child = spawn(path.join(root, 'node_modules', '.bin', 'tsx'), ['server.ts'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      DEV_AUTH: '1',
      NEXT_PUBLIC_DEV_AUTH: '1',
      PORT: String(SPAWN_PORT),
      DISCUSSION_SEC: '180',
      VOTE_SEC: '30',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true, // process group ของตัวเอง → kill(-pid) ปิดทั้ง tsx และ node ลูกของมัน
  });

  const tail: string[] = [];
  const verbose = process.env.SMOKE_VERBOSE === '1';
  let onReady: (() => void) | null = null;
  const lineReader = (stream: 'out' | 'err') => {
    let buf = '';
    return (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const line of lines) {
        tail.push(line);
        if (tail.length > 80) tail.shift();
        if (verbose) console.log(`[server${stream === 'err' ? ':err' : ''}] ${line}`);
        if (stream === 'out' && line.trimStart().startsWith('> Ready on')) onReady?.();
      }
    };
  };
  child.stdout?.on('data', lineReader('out'));
  child.stderr?.on('data', lineReader('err'));

  const lifecycle = { stopping: false };
  const died = new Promise<never>((_, reject) => {
    child.once('exit', (code, signal) => {
      if (!lifecycle.stopping) reject(new Error(`server ตายเอง (code=${code}, signal=${signal})`));
    });
    child.once('error', (err) => reject(new Error(`spawn tsx ไม่สำเร็จ: ${err.message}`)));
  });
  died.catch(() => {}); // ถูก race ใน main — กัน unhandled rejection ตอนไม่มีใครรอ
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server ไม่พิมพ์ "> Ready on" ภายใน ${READY_TIMEOUT_MS / 1000}s`)), READY_TIMEOUT_MS);
    onReady = () => {
      clearTimeout(timer);
      resolve();
    };
    died.catch((err: unknown) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  ready.catch(() => {});

  return {
    url: `http://localhost:${SPAWN_PORT}`,
    child,
    pid: child.pid,
    tail,
    lifecycle,
    ready,
    died,
  };
}

function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function killGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // ไม่มี process เหลือแล้ว
  }
}

async function until(cond: () => boolean, timeoutMs: number, stepMs = 50): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (cond()) return true;
    await sleep(stepMs);
  }
  return cond();
}

async function stopServer(h: ServerHandle): Promise<void> {
  h.lifecycle.stopping = true;
  const pid = h.pid;
  if (!pid || !groupAlive(pid)) return;
  killGroup(pid, 'SIGTERM');
  if (await until(() => !groupAlive(pid), KILL_GRACE_MS)) {
    log('server stopped (SIGTERM)');
    return;
  }
  log(`server ไม่ปิดภายใน ${KILL_GRACE_MS / 1000}s → SIGKILL`);
  killGroup(pid, 'SIGKILL');
  await until(() => !groupAlive(pid), 3000);
}

let cleaning: Promise<void> | null = null;
function cleanup(): Promise<void> {
  cleaning ??= (async () => {
    for (const s of openSockets) s.disconnect();
    if (server) await stopServer(server);
  })();
  return cleaning;
}

// กันหลุด: process ตายด้วยเหตุใดก็ตาม → ฆ่า process group ของ server ทิ้ง (sync)
process.on('exit', () => {
  if (server?.pid && groupAlive(server.pid)) killGroup(server.pid, 'SIGKILL');
});
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => {
    log(`FAIL: ถูกขัดจังหวะด้วย ${signal}`);
    void cleanup().finally(() => exit(1));
  });
}

// ───────────────────────────── main ─────────────────────────────

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function step<T>(name: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    throw new Error(`[${name}] ${errMessage(err)}`, { cause: err });
  }
}

async function healthz(url: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(5000) });
  } catch (err) {
    const cause = err instanceof Error ? (err as Error & { cause?: { code?: string } }).cause?.code : undefined;
    throw new Error(`เชื่อมต่อ ${url}/healthz ไม่ได้: ${errMessage(err)}${cause ? ` (${cause})` : ''}`);
  }
  const body = (await res.text()).trim();
  assert.ok(res.ok && body === 'ok', `${url}/healthz ต้องได้ 200 "ok" แต่ได้ ${res.status} "${body.slice(0, 80)}"`);
}

async function runAll(url: string, spawned: boolean): Promise<void> {
  await step('healthz', () => healthz(url));
  pass(`healthz ${url} → ok`);
  const ctx = await step('setup', () => setupRoom(url, spawned));
  for (const [name, run] of SCENARIOS) {
    log(`— ${name}`);
    await step(name, () => run(ctx));
  }
  await step('secrecy', () => secrecyCheck(ctx));
}

function deadline(ms: number, label: string): Promise<never> {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`${label} เกิน ${ms / 1000}s`)), ms).unref();
  });
}

async function main(): Promise<number> {
  const t0 = Date.now();
  let failure: unknown = null;
  try {
    let url: string;
    const external = process.env.SMOKE_URL?.trim();
    if (external) {
      url = external.replace(/\/+$/, '');
      log(`using SMOKE_URL=${url}`);
    } else {
      log(`spawning tsx server.ts on :${SPAWN_PORT} (DEV_AUTH=1) …`);
      server = spawnServer();
      await server.ready;
      url = server.url;
      pass(`server ready ${url} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    }
    const work = runAll(url, !external);
    work.catch(() => {}); // ถ้าแพ้ race (timeout/server ตาย) งานที่ค้างจะ reject ทีหลัง — ไม่ให้เป็น unhandled
    await Promise.race([work, deadline(SCENARIO_TIMEOUT_MS, 'scenarios'), ...(server ? [server.died] : [])]);
  } catch (err) {
    failure = err;
  }

  await cleanup();

  if (failure) {
    log(`FAIL: ${errMessage(failure)}`);
    const cause = failure instanceof Error && failure.cause instanceof Error ? failure.cause : failure;
    const where = cause instanceof Error ? (cause.stack ?? '').split('\n').filter((l) => l.includes('smoke.ts')).slice(0, 3) : [];
    for (const line of where) console.log(`[smoke]   ${line.trim()}`);
    if (server && server.tail.length > 0) {
      log('server log (tail):');
      for (const line of server.tail.slice(-30)) console.log(`  | ${line}`);
      if (server.tail.some((l) => l.includes('Another next dev server is already running'))) {
        log('hint: Next ไม่ยอมให้รัน dev server 2 ตัวในโฟลเดอร์เดียวกัน — ปิด `npm run dev` ก่อน หรือชี้ไปที่ตัวที่รันอยู่: SMOKE_URL=http://localhost:3000 npm run smoke (ต้องเปิด DEV_AUTH=1)');
      }
    }
    return 1;
  }
  log(`PASS (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  return 0;
}

/** exit หลัง flush stdout (stdout เป็น pipe บน macOS = async) */
function exit(code: number): void {
  process.exitCode = code;
  setTimeout(() => process.exit(code), 2000).unref();
  process.stdout.write('', () => process.stderr.write('', () => process.exit(code)));
}

main().then(exit, (err: unknown) => {
  console.error('[smoke] FAIL:', err);
  void cleanup().finally(() => exit(1));
});
