import crypto from 'crypto';
import os from 'os';
import req from './req.js';
import {
  loadSettings,
  noteFetchError,
  getStats,
  createAccelPlaylist,
  serveAccelSegment,
} from './m3u8Accel.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0';
const MAX_RECURSE = 4;
const MAX_BODY = 8 * 1024 * 1024;
const GATEWAY_TTL = 30 * 60 * 1000;
const MAX_GATEWAY_SESSIONS = 300;
const RETRY_DELAYS = [0, 400, 1200];
const STRIP_HEADERS = {
  'Sec-Fetch-Dest': null,
  'Sec-Fetch-Mode': null,
  'Sec-Fetch-Site': null,
  'Sec-Fetch-User': null,
};
const SKIP_SPIDERS = new Set(['liveSource', 'qrcode', 'dsav', 'javrate', 'vlxxsex', 'popJav', 'javdirect', 'x3china', 'av591']);

const PAN_HOSTS = [
  'aliyundrive.com', 'alipan.com', 'alihub.net', 'quark.cn', 'pan.quark.cn',
  'uc.cn', 'drive.uc.cn', 'cloud.tianyi.cn', 'tycloud', 'cloud.189.cn', 'caiyun.com',
  'mtyun', 'uc.10086.cn', '移动云盘', '115.com', 'anxia.com', 'baidu.com',
  'baidupcs.com', 'bdimg.com', '123pan.com', '123684.com', '123592.com',
  'lanzou', 'lanzoui.com', 'lanzoux.com', 'lanwtv.com',
];

const gatewaySessions = new Map();

function resolveUrl(raw, base) {
  if (!raw || typeof raw !== 'string') return null;
  try { return new URL(raw.trim(), base).href; } catch { return null; }
}

function isHttpUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}

function isM3u8(url) {
  return !!url && typeof url === 'string' && /^[^?#]+\.m3u8?($|[?#])/i.test(url.trim());
}

function isLocalGateway(url) {
  if (!url || typeof url !== 'string') return false;
  const t = url.trim().toLowerCase();
  if (t.startsWith('/')) {
    return /^\/(?:m3u8-clean|m3u8-ts|m3u8-asset)\b/.test(t)
      || /^\/spider\/[^/]+\/[^/]+\/(?:m3u8-clean|m3u8-ts)\b/.test(t);
  }
  try {
    const u = new URL(t);
    if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(u.hostname)) {
      return /^\/?(?:m3u8-clean|m3u8-ts|m3u8-asset)\b/.test(u.pathname)
        || /^\/spider\/[^/]+\/[^/]+\/(?:m3u8-clean|m3u8-ts)\b/.test(u.pathname);
    }
  } catch {}
  return false;
}

function isPanHost(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return PAN_HOSTS.some((item) => host.includes(item));
  } catch { return false; }
}

function lanIPv4() {
  const cands = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) {
      const v4 = n.family === 'IPv4' || n.family === 4;
      if (!v4 || n.internal) continue;
      cands.push(n.address);
    }
  }
  return (
    cands.find((a) => a.startsWith('192.168.')) ||
    cands.find((a) => a.startsWith('10.')) ||
    cands.find((a) => /^172\.(1[6-9]|2\d|3[0-1])\./.test(a)) ||
    cands[0] ||
    '127.0.0.1'
  );
}

function isLoopbackHost(host) {
  const name = String(host || '').replace(/^\[|\]$/g, '').split(':')[0];
  return !name || ['127.0.0.1', 'localhost', '::1', '0.0.0.0'].includes(name);
}

export function apiOriginFromReq(request) {
  const proto = request.headers?.['x-forwarded-proto'];
  const protocol = proto ? String(proto).split(',')[0].trim() : 'http';
  let host = String(request.headers?.host || '').split(',')[0].trim();
  if (isLoopbackHost(host)) {
    const port = /:(\d+)$/.exec(host)?.[1] || process.env.DEV_HTTP_PORT || '3006';
    host = `${lanIPv4()}:${port}`;
  }
  return `${protocol}://${host}`;
}

function purgeGatewaySessions(now = Date.now()) {
  if (gatewaySessions.size > MAX_GATEWAY_SESSIONS) {
    let oldest = null;
    let at = Infinity;
    for (const [sid, session] of gatewaySessions) {
      if (session.at < at) { at = session.at; oldest = sid; }
    }
    if (oldest) gatewaySessions.delete(oldest);
  }
  for (const [sid, session] of gatewaySessions) {
    if (now - session.at > GATEWAY_TTL) gatewaySessions.delete(sid);
  }
}

function getGatewaySession(sid) {
  const session = gatewaySessions.get(String(sid));
  if (session) session.at = Date.now();
  return session || null;
}

function registerGatewaySession({ headers = {}, allowedHosts = [] } = {}) {
  purgeGatewaySessions();
  const sid = crypto.randomBytes(8).toString('hex');
  gatewaySessions.set(sid, {
    headers: { ...headers },
    allowedHosts: new Set((allowedHosts || []).map((h) => String(h).toLowerCase())),
    at: Date.now(),
  });
  return sid;
}

function adoptGatewaySession(sid, { headers = {}, allowedHosts = [] } = {}) {
  if (!sid || gatewaySessions.has(sid)) return;
  gatewaySessions.set(sid, {
    headers: { ...headers },
    allowedHosts: new Set((allowedHosts || []).map((h) => String(h).toLowerCase())),
    at: Date.now(),
  });
}

function isHostAllowed(url, sid) {
  const session = getGatewaySession(sid);
  if (!session) return false;
  try {
    return session.allowedHosts.has(new URL(url).hostname.toLowerCase());
  } catch { return false; }
}

function addSessionHosts(sid, hosts) {
  const session = getGatewaySession(sid);
  if (!session) return;
  for (const host of hosts || []) {
    if (host) session.allowedHosts.add(String(host).toLowerCase());
  }
}

function splitLines(text) {
  return text.replace(/\r\n/g, '\n').split('\n');
}

function parsePlaylistKind(text) {
  const isMaster = text.includes('#EXT-X-STREAM-INF');
  let isMedia = false;
  for (const line of splitLines(text)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && !isM3u8(trimmed)) {
      isMedia = true;
      break;
    }
  }
  return { isMaster: isMaster && !isMedia, isMedia };
}

function collectHosts(text, baseUrl) {
  const hosts = new Set();
  try { hosts.add(new URL(baseUrl).hostname.toLowerCase()); } catch {}
  for (const line of splitLines(text)) {
    const trimmed = line.trim();
    if (trimmed.includes('URI="')) {
      for (const match of trimmed.matchAll(/URI="([^"]+)"/g)) {
        const resolved = resolveUrl(match[1], baseUrl);
        if (resolved) try { hosts.add(new URL(resolved).hostname.toLowerCase()); } catch {}
      }
      continue;
    }
    if (!trimmed || trimmed.startsWith('#')) continue;
    const resolved = resolveUrl(trimmed, baseUrl);
    if (resolved) try { hosts.add(new URL(resolved).hostname.toLowerCase()); } catch {}
  }
  return [...hosts];
}

async function fetchText(url, headers = {}) {
  const h = {
    'User-Agent': UA,
    'Accept-Encoding': 'identity',
    ...STRIP_HEADERS,
  };
  if (headers.Referer || headers.referer) h.Referer = headers.Referer || headers.referer;
  let lastError = null;
  for (let i = 0; i <= 3; i++) {
    if (i > 0 && RETRY_DELAYS[i - 1]) await new Promise((r) => setTimeout(r, RETRY_DELAYS[i - 1]));
    try {
      const resp = await req.get(url, {
        headers: h,
        timeout: 20000,
        maxContentLength: MAX_BODY + 1,
        maxBodyLength: MAX_BODY + 1,
      });
      let text = resp.data;
      if (Buffer.isBuffer(text)) text = text.toString('utf8');
      else if (typeof text !== 'string') text = JSON.stringify(text ?? '');
      if (resp.status >= 400 && [403, 429, 502, 503, 504].includes(resp.status) && i < 3) {
        lastError = new Error(`HTTP ${resp.status}`);
        continue;
      }
      return { status: resp.status, text };
    } catch (err) {
      lastError = err;
      if (i >= 3) break;
    }
  }
  throw lastError || new Error(`upstream fetch failed: ${url}`);
}

function rewriteMasterPlaylist(text, baseUrl, sid, origin, depth) {
  if (depth > MAX_RECURSE) return text;
  return splitLines(text).map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const resolved = resolveUrl(trimmed, baseUrl);
    if (!resolved || !isHttpUrl(resolved) || isLocalGateway(resolved) || isPanHost(resolved) || !isHostAllowed(resolved, sid)) {
      return line;
    }
    if (isM3u8(resolved)) {
      return `${origin}/m3u8-clean?sid=${encodeURIComponent(sid)}&url=${encodeURIComponent(resolved)}`;
    }
    return line;
  }).join('\n');
}

function rewriteMediaPlaylistSimple(text, sid, origin) {
  return splitLines(text).map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || isM3u8(trimmed) || isLocalGateway(trimmed) || isPanHost(trimmed) || !isHttpUrl(trimmed) || !isHostAllowed(trimmed, sid)) {
      return line;
    }
    return `${origin}/m3u8-ts?sid=${encodeURIComponent(sid)}&url=${encodeURIComponent(trimmed)}`;
  }).join('\n');
}

function rewriteAssetUris(text, baseUrl, sid, origin) {
  if (!text.includes('URI="')) return text;
  return text.replace(/URI="([^"]+)"/g, (full, uri) => {
    const resolved = resolveUrl(uri, baseUrl);
    if (!resolved || !isHttpUrl(resolved) || isLocalGateway(resolved) || !isHostAllowed(resolved, sid)) return full;
    return `URI="${origin}/m3u8-asset?sid=${encodeURIComponent(sid)}&url=${encodeURIComponent(resolved)}"`;
  });
}

function normalizeMediaLines(text, baseUrl) {
  return splitLines(text).map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || isM3u8(trimmed)) return line;
    return resolveUrl(trimmed, baseUrl) || line;
  }).join('\n');
}

function isFmp4Playlist(text) {
  return /#EXT-X-MAP/i.test(text || '') || /\.m4s(?:$|[?#])/i.test(text || '');
}

async function buildAccelPlaylist(text, baseUrl, origin, sid, headers, db) {
  const normalized = normalizeMediaLines(text, baseUrl);
  if (isFmp4Playlist(normalized)) {
    return { content: normalized, sid };
  }
  const settings = await loadSettings(db);
  if (settings.enabled) {
    const built = createAccelPlaylist(normalized, origin, headers);
    if (built.sid) {
      adoptGatewaySession(built.sid, { headers, allowedHosts: collectHosts(normalized, baseUrl) });
      return { content: built.content, sid: built.sid };
    }
  }
  return { content: rewriteMediaPlaylistSimple(normalized, sid, origin), sid };
}

async function cleanPlaylist(url, sid, origin, depth, db) {
  const session = getGatewaySession(sid);
  if (!session) {
    const err = new Error('unknown session');
    err.status = 403;
    throw err;
  }
  if (!isHostAllowed(url, sid)) {
    const err = new Error('forbidden: upstream host not allowed');
    err.status = 403;
    throw err;
  }
  const fetched = await fetchText(url, session.headers || {});
  if (fetched.status !== 200 && fetched.status !== 206) {
    const err = new Error(`upstream http ${fetched.status}`);
    err.status = fetched.status;
    throw err;
  }
  const text = fetched.text;
  if (!text || !text.includes('#EXTM3U')) {
    const err = new Error('upstream is not a playlist');
    err.status = 502;
    throw err;
  }
  const kind = parsePlaylistKind(text);
  let content;
  let activeSid = sid;
  if (kind.isMedia) {
    const hosts = collectHosts(text, url);
    addSessionHosts(sid, hosts);
    const built = await buildAccelPlaylist(text, url, origin, sid, session.headers || {}, db);
    content = built.content;
    activeSid = built.sid || sid;
  } else {
    addSessionHosts(sid, collectHosts(text, url));
    content = rewriteMasterPlaylist(text, url, sid, origin, depth + 1);
  }
  return rewriteAssetUris(content, url, activeSid, origin);
}

function rewritePlayUrl(raw, origin, headers) {
  let value = String(raw).trim();
  if (!value) return raw;
  let candidate = value;
  const parts = value.split('$');
  if (parts.length > 1) {
    const found = parts.find((part) => isHttpUrl(part));
    if (found) candidate = found;
  }
  let url = candidate;
  const hashIndex = url.indexOf('#');
  if (hashIndex >= 0) url = url.slice(0, hashIndex);
  url = url.trim();
  if (!url || isLocalGateway(url) || !isHttpUrl(url) || isPanHost(url)) return raw;
  if (/\/spider\/[^/]+\/\d+\/(?:proxy(?:\.m3u8|\.seg|\/)|master\.m3u8)\b/i.test(url)) return raw;
  if (!(isM3u8(url) || /\.m3u8($|[?#&])/i.test(url))) return raw;
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch { return raw; }
  const sid = registerGatewaySession({ headers, allowedHosts: [host] });
  return `${origin}/m3u8-clean?sid=${encodeURIComponent(sid)}&url=${encodeURIComponent(url)}`;
}

export async function maybeRewritePlay(request, payload, { db } = {}) {
  const parts = (request.url || '').split('?')[0].split('/').filter(Boolean);
  if (parts.length < 4 || parts[0] !== 'spider' || parts[3] !== 'play') return null;
  if (Number(parts[2]) !== 3 || SKIP_SPIDERS.has(parts[1]) || !payload || typeof payload !== 'object') return null;
  const headers = payload.header && typeof payload.header === 'object' ? payload.header : {};
  const origin = apiOriginFromReq(request);
  let changed = false;
  if (typeof payload.url === 'string' && payload.url) {
    const next = rewritePlayUrl(payload.url, origin, headers);
    if (next !== payload.url) { payload.url = next; changed = true; }
  }
  if (Array.isArray(payload.urls)) {
    const next = payload.urls.map((item) => typeof item === 'string' ? rewritePlayUrl(item, origin, headers) : item);
    if (next.some((item, idx) => item !== payload.urls[idx])) {
      payload.urls = next;
      changed = true;
    }
  }
  await loadSettings(db);
  return changed ? payload : null;
}

async function fetchBinary(url, headers = {}) {
  const resp = await req.get(url, {
    headers: { 'User-Agent': UA, ...headers, ...STRIP_HEADERS },
    responseType: 'arraybuffer',
    timeout: 20000,
  });
  const data = resp.data;
  return Buffer.isBuffer(data) ? data : Buffer.from(data ?? '');
}

export async function registerM3u8Gateway(fastify) {
  fastify.get('/m3u8-clean', async (request, reply) => {
    const sid = String(request.query?.sid || '');
    const url = request.query?.url ? String(request.query.url) : '';
    if (!sid || !url) return reply.code(400).send('missing sid or url');
    try {
      const content = await cleanPlaylist(url, sid, apiOriginFromReq(request), 0, request.server?.db);
      return reply
        .header('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8')
        .header('Access-Control-Allow-Origin', '*')
        .header('Cache-Control', 'no-store')
        .send(content);
    } catch (err) {
      return reply.code(err.status || 502).send(err.message || 'clean failed');
    }
  });

  fastify.get('/m3u8-ts', async (request, reply) => {
    const sid = String(request.query?.sid || '');
    const url = request.query?.url ? String(request.query.url) : '';
    const index = request.query?.i !== undefined ? Number(request.query.i) : -1;
    const range = request.headers?.range ? String(request.headers.range) : '';
    const session = getGatewaySession(sid);
    if (!session) return reply.code(403).send('unknown session');

    if (index >= 0) {
      await loadSettings(request.server?.db);
      const result = await serveAccelSegment(sid, index, range);
      for (const [key, value] of Object.entries(result.headers || {})) reply.header(key, value);
      return reply.code(result.status).send(result.body);
    }

    if (!url || !isHostAllowed(url, sid)) return reply.code(403).send('forbidden');
    try {
      const body = await fetchBinary(url, session.headers || {});
      return reply
        .header('Content-Type', 'video/MP2T')
        .header('Access-Control-Allow-Origin', '*')
        .header('Cache-Control', 'no-store')
        .send(body);
    } catch (err) {
      noteFetchError();
      return reply.code(502).send(`fetch ts failed: ${err.message}`);
    }
  });

  fastify.get('/m3u8-asset', async (request, reply) => {
    const sid = String(request.query?.sid || '');
    const url = request.query?.url ? String(request.query.url) : '';
    const session = getGatewaySession(sid);
    if (!session) return reply.code(403).send('unknown session');
    if (!url || !isHostAllowed(url, sid)) return reply.code(403).send('forbidden');
    try {
      const resp = await req.get(String(url), {
        headers: { 'User-Agent': UA, ...(session.headers || {}), ...STRIP_HEADERS },
        responseType: 'arraybuffer',
        timeout: 20000,
      });
      const body = Buffer.isBuffer(resp.data) ? resp.data : Buffer.from(resp.data ?? '');
      return reply
        .header('Content-Type', resp.headers['content-type'] || 'application/octet-stream')
        .header('Access-Control-Allow-Origin', '*')
        .header('Cache-Control', 'no-store')
        .send(body);
    } catch (err) {
      return reply.code(502).send(`asset fetch failed: ${err.message}`);
    }
  });
}

export { getStats };
