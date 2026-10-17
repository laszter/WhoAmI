// Key-value store ของ server — ที่เก็บ state ร่วม (ห้อง, ห้องปัจจุบันของ user, notification token)
//   REDIS_URL / KV_URL (Upstash จาก Vercel Marketplace) → Redis: บน Vercel ผู้เล่นห้องเดียวกันอาจต่อเข้าคนละ function instance
//   ไม่ได้ตั้ง → memory ใน process (dev: server.ts process เดียว)
// อ่าน process.env.* ภายในฟังก์ชันเท่านั้น (server.ts โหลด .env.local หลัง import ถูก hoist)
// ห้าม log URL ของ Redis (มีรหัสผ่านอยู่ใน URL)
import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';

export interface Kv {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
  /** set เฉพาะเมื่อยังไม่มี key — คืน true ถ้า set ได้ */
  setNx(key: string, value: string, ttlSec: number): Promise<boolean>;
  del(key: string): Promise<void>;
  /** set แล้วคืนค่าเดิม */
  swap(key: string, value: string, ttlSec: number): Promise<string | null>;
  /** รัน fn ทีละตัวต่อ key (Redis: ข้าม instance ด้วย) พร้อมค่าปัจจุบันของ key ที่อ่านหลังได้ lock */
  withLock<T>(key: string, fn: (current: string | null) => Promise<T>): Promise<T>;
}

const LOCK_TTL_MS = 10_000;  // lock ค้าง (instance ตายกลางทาง) หมดอายุเอง
const LOCK_WAIT_MS = 8_000;  // รอ lock นานกว่านี้ → error (handler ตอบ ack error)
const SWEEP_MS = 10 * 60_000;
const RELEASE_LOCK = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** ทีละตัวต่อ key ภายใน process — กัน operation ของห้องเดียวกันใน instance เดียวกันแย่ง lock ของ Redis กันเอง */
class LocalMutex {
  private tails = new Map<string, Promise<void>>();

  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    const result = prev.then(fn);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return result;
  }
}

class MemoryKv implements Kv {
  private data = new Map<string, { value: string; expiresAt: number }>();
  private mutex = new LocalMutex();

  constructor() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.data) if (entry.expiresAt <= now) this.data.delete(key);
    }, SWEEP_MS).unref();
  }

  async get(key: string): Promise<string | null> {
    const entry = this.data.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.data.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSec: number): Promise<void> {
    this.data.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
  }

  async setNx(key: string, value: string, ttlSec: number): Promise<boolean> {
    if ((await this.get(key)) !== null) return false;
    await this.set(key, value, ttlSec);
    return true;
  }

  async del(key: string): Promise<void> {
    this.data.delete(key);
  }

  async swap(key: string, value: string, ttlSec: number): Promise<string | null> {
    const prev = await this.get(key);
    await this.set(key, value, ttlSec);
    return prev;
  }

  withLock<T>(key: string, fn: (current: string | null) => Promise<T>): Promise<T> {
    return this.mutex.run(key, async () => fn(await this.get(key)));
  }
}

class RedisKv implements Kv {
  private mutex = new LocalMutex();

  constructor(private redis: Redis) {}

  get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSec: number): Promise<void> {
    await this.redis.set(key, value, 'EX', ttlSec);
  }

  async setNx(key: string, value: string, ttlSec: number): Promise<boolean> {
    return (await this.redis.set(key, value, 'EX', ttlSec, 'NX')) === 'OK';
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  swap(key: string, value: string, ttlSec: number): Promise<string | null> {
    return this.redis.set(key, value, 'EX', ttlSec, 'GET');
  }

  /**
   * ขอ lock กับอ่านค่าใน pipeline เดียว (GET รันหลัง SET NX บน connection เดียวกัน → ได้ lock = ค่าที่อ่านเป็นปัจจุบัน)
   * ปลด lock โดยไม่รอผล: คำสั่งที่ fn ส่งไปก่อนหน้า (SET ห้อง, PUBLISH ของ emit) อยู่ก่อนในคิวของ connection เดียวกันแล้ว
   */
  withLock<T>(key: string, fn: (current: string | null) => Promise<T>): Promise<T> {
    return this.mutex.run(key, async () => {
      const lockKey = `lock:${key}`;
      const token = randomUUID();
      const giveUpAt = Date.now() + LOCK_WAIT_MS;
      let current: string | null;
      for (;;) {
        const res = await this.redis.pipeline().set(lockKey, token, 'PX', LOCK_TTL_MS, 'NX').get(key).exec();
        const [[lockErr, locked], [getErr, value]] = res ?? [[new Error('pipeline aborted'), null], [null, null]];
        if (lockErr) throw lockErr;
        if (locked === 'OK') {
          if (getErr) {
            this.release(key, lockKey, token);
            throw getErr;
          }
          current = value as string | null;
          break;
        }
        if (Date.now() > giveUpAt) throw new Error(`[kv] รอ lock ไม่ได้: ${key}`);
        await sleep(10 + Math.random() * 30);
      }
      try {
        return await fn(current);
      } finally {
        this.release(key, lockKey, token);
      }
    });
  }

  private release(key: string, lockKey: string, token: string): void {
    this.redis.eval(RELEASE_LOCK, 1, lockKey, token).catch((err: unknown) => {
      console.warn('[kv] release lock failed', key, err instanceof Error ? err.message : err);
    });
  }
}

let redis: Redis | null | undefined;
let store: Kv | undefined;

/** Redis client ตัวเดียวของ process (null = ไม่ได้ตั้ง REDIS_URL / KV_URL) — ใช้เป็น pubClient ของ Socket.IO adapter ด้วย */
export function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = (process.env.REDIS_URL || process.env.KV_URL || '').trim();
  if (!url) {
    redis = null;
    return redis;
  }
  redis = new Redis(url, { maxRetriesPerRequest: 3 });
  redis.on('error', (err: Error) => console.error('[kv] redis error', err.message));
  return redis;
}

export function kv(): Kv {
  if (!store) {
    const client = getRedis();
    store = client ? new RedisKv(client) : new MemoryKv();
    console.log(`[kv] store = ${client ? 'redis' : 'memory'}`);
  }
  return store;
}
