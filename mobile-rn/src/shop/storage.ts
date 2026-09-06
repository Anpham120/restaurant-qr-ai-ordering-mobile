import { Platform } from 'react-native';
import { khoThietBi } from '../core/luuTruAnToan';
import type { CartLine, OrderReference, Session } from './types';
import { requestKey } from './logic';

// Native tokens live in Keychain/Keystore. Web preview keeps secrets only for the current tab.
// SecureStore implementations can reject values over 2 KB. Chunk long carts and histories,
// then atomically replace the small pointer only after every chunk has been written.
type ChunkPointer = { mayChunks: 1; version: string; count: number };
function pointer(raw: string | null): ChunkPointer | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as ChunkPointer;
    return value.mayChunks === 1 &&
      Number.isInteger(value.count) &&
      value.count > 0 &&
      value.count < 2000
      ? value
      : null;
  } catch {
    return null;
  }
}
const chunkKey = (key: string, value: ChunkPointer, index: number) =>
  `${key}.${value.version}.${index}`;
async function readNative(key: string): Promise<string | null> {
  const raw = await khoThietBi.doc(key);
  const parts = pointer(raw);
  if (!parts) return raw;
  const values = await Promise.all(
    Array.from({ length: parts.count }, (_, index) => khoThietBi.doc(chunkKey(key, parts, index))),
  );
  if (values.some((value) => value === null))
    throw new Error('Dữ liệu lưu trên thiết bị chưa đầy đủ. Vui lòng mở lại ứng dụng.');
  return values.join('');
}
async function clearParts(key: string, parts: ChunkPointer | null) {
  if (parts)
    await Promise.all(
      Array.from({ length: parts.count }, (_, index) =>
        khoThietBi.xoa(chunkKey(key, parts, index)),
      ),
    );
}
async function writeNative(key: string, value: string) {
  const old = pointer(await khoThietBi.doc(key));
  if (value.length > 600) {
    // 600 UTF-16 code units also stay under 2 KB for Vietnamese text encoded as UTF-8.
    const parts: ChunkPointer = {
      mayChunks: 1,
      version: requestKey(),
      count: Math.ceil(value.length / 600),
    };
    await Promise.all(
      Array.from({ length: parts.count }, (_, index) =>
        khoThietBi.ghi(chunkKey(key, parts, index), value.slice(index * 600, (index + 1) * 600)),
      ),
    );
    await khoThietBi.ghi(key, JSON.stringify(parts));
  } else await khoThietBi.ghi(key, value);
  await clearParts(key, old);
}
const read = async (key: string, secret = true) =>
  Platform.OS === 'web' ? (secret ? sessionStorage : localStorage).getItem(key) : readNative(key);
const write = async (key: string, value: string, secret = true) => {
  if (Platform.OS === 'web') (secret ? sessionStorage : localStorage).setItem(key, value);
  else await writeNative(key, value);
};
const remove = async (key: string, secret = true) => {
  if (Platform.OS === 'web') (secret ? sessionStorage : localStorage).removeItem(key);
  else {
    const parts = pointer(await khoThietBi.doc(key));
    await khoThietBi.xoa(key);
    await clearParts(key, parts);
  }
};
const keyFor = (origin: string, name: string) =>
  `may.${encodeURIComponent(origin).replace(/%/g, '_')}.${name}`;
async function json<T>(key: string, fallback: T, secret = true): Promise<T> {
  const raw = await read(key, secret);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    await remove(key, secret);
    return fallback;
  }
}
export const shopStorage = {
  origin: () => read('may.origin', false),
  saveOrigin: (origin: string) => write('may.origin', origin, false),
  cart: (origin: string) => json<CartLine[]>(keyFor(origin, 'cart'), [], false),
  saveCart: (origin: string, cart: CartLine[]) =>
    write(keyFor(origin, 'cart'), JSON.stringify(cart), false),
  async session(origin: string) {
    const session = await json<Session | null>(keyFor(origin, 'session'), null);
    if (
      session &&
      (!session.accessToken ||
        !Number.isFinite(Date.parse(session.expiresAt)) ||
        Date.parse(session.expiresAt) <= Date.now())
    ) {
      await remove(keyFor(origin, 'session'));
      return null;
    }
    return session;
  },
  saveSession: (origin: string, session: Session) =>
    write(keyFor(origin, 'session'), JSON.stringify(session)),
  clearSession: (origin: string) => remove(keyFor(origin, 'session')),
  history: (origin: string) => json<OrderReference[]>(keyFor(origin, 'orders'), []),
  saveHistory: (origin: string, orders: OrderReference[]) =>
    write(keyFor(origin, 'orders'), JSON.stringify(orders.slice(0, 40))),
  clearHistory: (origin: string) => remove(keyFor(origin, 'orders')),
  async orderAttempt(origin: string, fingerprint: string) {
    const key = keyFor(origin, 'order-attempt');
    const existing = await json<{ fingerprint: string; key: string } | null>(key, null);
    if (existing?.fingerprint === fingerprint) return existing.key;
    const next = { fingerprint, key: requestKey() };
    await write(key, JSON.stringify(next));
    return next.key;
  },
  clearAttempt: (origin: string) => remove(keyFor(origin, 'order-attempt')),
};
