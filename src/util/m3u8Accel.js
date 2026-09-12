import crypto from 'crypto';
import req from './req.js';

export const DEFAULTS = {
  enabled: true,
  window: 8,
  rangeThreshold: 300 * 1024,
  rangeParts: 2,
  maxTsCache: 30,
  maxSessions: 50,
  sessionTtlMs: 30 * 60 * 1000,
  maxInflightPerSession: 3,
};

const LIMITS = {
  window: [1, 64],
  rangeThreshold: [32 * 1024, 16 * 1024 * 1024],
  rangeParts: [1, 8],
  maxTsCache: [2, 200],
  maxSessions: [1, 500],
  sessionTtlMs: [60 * 1000, 120 * 60 * 1000],
  maxInflightPerSession: [1, 16],
};

const KEY = '/systemSettings/m3u8Accel';
const CACHE_MS = 2000;
const BUF_CLEAR_MS = 3 * 60 * 1000;

let cached = { ...DEFAULTS };
let cachedAt = 0;
let lastSweep = 0;
const sessions = new Map();
const counters = { hits: 0, misses: 0, fetchErrors: 0 };

export function normalizeSettings(input = {}) {
  const next = { ...DEFAULTS, ...input };
  if (typeof input.enabled === 'boolean') next.enabled = input.enabled;
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    const value = Number(input[key]);
    if (Number.isFinite(value)) next[key] = Math.min(max, Math.max(min, Math.round(value)));
  }
  return next;
}

export async function loadSettings(db, { force = false } = {}) {
  if (!db) return { ...DEFAULTS };
  const now = Date.now();
  if (!force && now - cachedAt < CACHE_MS) return { ...cached };
  try {
    cached = normalizeSettings(await db.getData(KEY));
  } catch {
    cached = { ...DEFAULTS };
  }
  cachedAt = now;
  return { ...cached };
}

export async function saveSettings(db, input) {
  if (!db) return { ...DEFAULTS };
  cached = normalizeSettings(input);
  cachedAt = Date.now();
  await db.push(KEY, cached);
  return { ...cached };
}

export async function resetSettings(db) {
  if (!db) return { ...DEFAULTS };
  cached = { ...DEFAULTS };
  cachedAt = Date.now();
  await db.push(KEY, cached);
  return { ...cached };
}

export function getSessionMap() {
  return sessions;
}

export function getStats() {
  let bufferedTs = 0;
  let inflight = 0;
  for (const session of sessions.values()) {
    bufferedTs += session.buf.size;
    inflight += session.fly.size;
  }
  return {
    sessions: sessions.size,
    bufferedTs,
    inflight,
    ...counters,
  };
}

export function noteHit() { counters.hits++; }
export function noteMiss() { counters.misses++; }
export function noteFetchError() { counters.fetchErrors++; }

function toBuffer(data) {
  if (!data) return Buffer.alloc(0);
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (typeof data === 'string') return Buffer.from(data, 'latin1');
  return Buffer.alloc(0);
}

function sweepSessions(now = Date.now()) {
  if (now - lastSweep <= 5 * 60 * 1000) return;
  for (const [sid, session] of sessions) {
    if (now - session.at > cached.sessionTtlMs) sessions.delete(sid);
    else if (now - session.at > BUF_CLEAR_MS && session.buf.size) session.buf.clear();
  }
  lastSweep = now;
}

function trimBuffer(session) {
  while (session.buf.size > cached.maxTsCache) {
    let oldest = Infinity;
    for (const key of session.buf.keys()) if (key < oldest) oldest = key;
    session.buf.delete(oldest);
  }
}

function trimBehind(session, index) {
  for (const key of [...session.buf.keys()]) {
    if (key <= index - 2) session.buf.delete(key);
  }
  trimBuffer(session);
}

async function fetchSegment(url, headers) {
  try {
    const probe = await req.get(url, {
      headers: { ...headers, Range: 'bytes=0-0' },
      responseType: 'arraybuffer',
      timeout: 10000,
    });
    if (probe.status !== 206) return toBuffer(probe.data);
    const rangeHeader = probe.headers?.['content-range'] || probe.headers?.['Content-Range'] || '';
    const match = /\/(\d+)\s*$/.exec(String(rangeHeader));
    const total = match ? Number(match[1]) : 0;
    if (!total || total < cached.rangeThreshold) {
      const full = await req.get(url, { headers, responseType: 'arraybuffer', timeout: 30000 });
      return toBuffer(full.data);
    }
    const partSize = Math.ceil(total / cached.rangeParts);
    const parts = await Promise.all(Array.from({ length: cached.rangeParts }, (_, idx) => {
      const start = idx * partSize;
      const end = Math.min(total - 1, (idx + 1) * partSize - 1);
      return req.get(url, {
        headers: { ...headers, Range: `bytes=${start}-${end}` },
        responseType: 'arraybuffer',
        timeout: 15000,
      }).then((resp) => ({
        k: idx,
        buf: toBuffer(resp.data),
        ok: toBuffer(resp.data).length === end - start + 1,
      }));
    }));
    parts.sort((a, b) => a.k - b.k);
    if (!parts.every((part) => part.ok)) throw new Error('range parts length mismatch');
    return Buffer.concat(parts.map((part) => part.buf));
  } catch {
    const full = await req.get(url, { headers, responseType: 'arraybuffer', timeout: 30000 });
    return toBuffer(full.data);
  }
}

function prefetchSegment(session, index) {
  let pending = session.fly.get(index);
  if (pending) return pending;
  pending = fetchSegment(session.list[index], session.headers).then((buf) => {
    if (!buf?.length) throw new Error('empty body');
    session.buf.set(index, buf);
    session.fly.delete(index);
    trimBuffer(session);
    return buf;
  }).catch((err) => {
    session.fly.delete(index);
    throw err;
  });
  session.fly.set(index, pending);
  pending.catch(() => {});
  return pending;
}

async function readSegment(session, index) {
  const cachedBuf = session.buf.get(index);
  if (cachedBuf) {
    noteHit();
    return cachedBuf;
  }
  noteMiss();
  try {
    return await prefetchSegment(session, index);
  } catch {
    return prefetchSegment(session, index);
  }
}

function prefetchWindow(session, index) {
  for (let i = index + 1; i <= index + cached.window; i++) {
    if (i >= session.list.length || session.buf.has(i) || session.fly.has(i)) continue;
    prefetchSegment(session, i);
    if (session.fly.size >= cached.maxInflightPerSession) break;
  }
}

function parseRange(rangeHeader, size) {
  const match = /^bytes=(\d*)-(\d*)\s*$/.exec(String(rangeHeader || ''));
  if (!match) return null;
  let start = match[1] === '' ? null : Number(match[1]);
  let end = match[2] === '' ? null : Number(match[2]);
  if (start == null && end == null) return null;
  if (start == null) {
    start = Math.max(0, size - end);
    end = size - 1;
  } else if (end == null || end >= size) {
    end = size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || end < start) {
    return { invalid: true };
  }
  return { start, end };
}

export function createAccelSession(list, headers = {}) {
  sweepSessions();
  if (sessions.size >= cached.maxSessions) {
    let oldestSid = null;
    let oldestAt = Infinity;
    for (const [sid, session] of sessions) {
      if (session.at < oldestAt) { oldestAt = session.at; oldestSid = sid; }
    }
    if (oldestSid) sessions.delete(oldestSid);
  }
  const sid = crypto.randomBytes(8).toString('hex');
  sessions.set(sid, {
    list: [...list],
    headers: { ...headers },
    buf: new Map(),
    fly: new Map(),
    at: Date.now(),
  });
  return sid;
}

export function createAccelPlaylist(text, origin, headers = {}) {
  if (!text || typeof text !== 'string' || !text.includes('#EXTM3U')) {
    return { content: text, sid: null };
  }
  const base = (origin || 'http://127.0.0.1:3006').replace(/\/+$/, '');
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const indexMap = new Array(lines.length).fill(-1);
  const segments = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    indexMap[i] = segments.length;
    segments.push(trimmed);
  }
  if (!segments.length) return { content: text, sid: null };
  const sid = createAccelSession(segments, headers);
  return {
    content: lines.map((line, idx) => (
      indexMap[idx] < 0 ? line : `${base}/m3u8-ts?sid=${sid}&i=${indexMap[idx]}`
    )).join('\n'),
    sid,
  };
}

export async function serveAccelSegment(sid, index, rangeHeader = '') {
  sweepSessions();
  const session = typeof sid === 'string' ? sessions.get(sid) : null;
  if (!session || !Number.isInteger(index) || index < 0 || index >= session.list.length) {
    return {
      status: 404,
      headers: {},
      body: Buffer.from('accel session expired or invalid index'),
    };
  }
  session.at = Date.now();
  let body;
  try {
    body = await readSegment(session, index);
  } catch (err) {
    noteFetchError();
    return {
      status: 502,
      headers: {},
      body: Buffer.from(`fetch ts failed: ${err?.message || err}`),
    };
  }
  trimBehind(session, index);
  prefetchWindow(session, index);

  const headers = {
    'Content-Type': 'video/MP2T',
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=60',
  };
  if (rangeHeader) {
    const range = parseRange(rangeHeader, body.length);
    if (!range || range.invalid) {
      return {
        status: 416,
        headers: { ...headers, 'Content-Range': `bytes */${body.length}` },
        body: Buffer.alloc(0),
      };
    }
    const slice = body.subarray(range.start, range.end + 1);
    return {
      status: 206,
      headers: {
        ...headers,
        'Content-Range': `bytes ${range.start}-${range.end}/${body.length}`,
        'Content-Length': String(slice.length),
      },
      body: slice,
    };
  }
  return {
    status: 200,
    headers: { ...headers, 'Content-Length': String(body.length) },
    body,
  };
}

setInterval(() => sweepSessions(), 60 * 1000).unref?.();
