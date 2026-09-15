import http from 'http';
import https from 'https';
import axios from 'axios';

const DEF_UA = 'okhttp/3.15';
const ALT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SRC_TTL = 5 * 60 * 1000;
const CH_TTL = 30 * 60 * 1000;
const CH_ERR_TTL = 60 * 1000;
const PLAY_TTL = 30 * 1000;
const PLAY_PHP_TTL = 10 * 1000;
const PAGE_SIZE = 50;

const srcState = { loaded: false, ts: 0, list: [] };
const domainIdx = new Map();
const chCache = new Map();
const inflight = new Map();
const playCache = new Map();
const hdrMap = new Map();

const RE_IDX = /\[IDX:(\d+)\]/i;
const RE_HOST = /^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:/\n?]+)/i;
const RE_GENRE = /([^,]+)#genre#/;
const RE_EXTGRP = /^#EXTGRP:(.+)$/i;
const TB_REF = {
  'bilibili.com': ['https://live.bilibili.com/', 'https://live.bilibili.com'],
  'douyin.com': ['https://www.douyin.com/', 'https://www.douyin.com'],
  'huya.com': ['https://www.huya.com/', 'https://www.huya.com'],
};

function isUrl(u) {
  return /^(?:https?|rtmps?|rtsp|rtp|udp):\/\//i.test(String(u || ''));
}

function hostOf(u) {
  try {
    const m = String(u || '').match(RE_HOST);
    return m && m[1] ? m[1].toLowerCase() : '';
  } catch {
    return '';
  }
}

function clean(s) {
  return String(s == null ? '' : s).replace(/[$#\r\n\t]/g, '').trim();
}

function parseAttrs(line) {
  const out = {};
  try {
    const re = /([A-Za-z0-9_-]+)="([^"]*)"/g;
    let m;
    while ((m = re.exec(line))) out[m[1].toLowerCase()] = m[2];
  } catch { }
  return out;
}

function infTitle(line) {
  const q = line.lastIndexOf('"');
  const rest = q >= 0 ? line.slice(q + 1) : line;
  const i = rest.indexOf(',');
  return i >= 0 ? rest.slice(i + 1).trim() : '';
}

function parseGroups(text) {
  const map = new Map();
  let cur = '未分组';
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);

  function push(title, url, logo, ua, ref) {
    url = String(url || '').trim();
    if (!isUrl(url)) return false;
    if (!map.has(cur)) map.set(cur, []);
    const list = map.get(cur);
    const nm = clean(title) || ('频道_' + (list.length + 1));
    list.push({
      name: nm,
      url,
      logo: String(logo || '').trim(),
      ua: String(ua || '').trim(),
      referer: String(ref || '').trim(),
    });
    return true;
  }

  for (let i = 0; i < lines.length; i++) {
    const a = lines[i].trim();
    if (!a) continue;
    if (/^#EXTM3U/i.test(a)) continue;
    if (/^#EXTINF/i.test(a)) {
      const at = parseAttrs(a);
      const title = infTitle(a) || at['tvg-name'] || '';
      let grp = at['group-title'] || at['tvg-group'] || at.group || cur;
      let src = '', ua = '', ref = '';
      for (let j = i + 1; j < lines.length; j++) {
        const b = lines[j].trim();
        if (!b) continue;
        if (b.charAt(0) === '#') {
          const g = b.match(RE_EXTGRP);
          if (g) grp = g[1].trim() || grp;
          const o = b.match(/^#EXTVLCOPT:(.+)$/i);
          if (o) {
            const kv = o[1].split('=');
            const k = String(kv.shift() || '').trim().toLowerCase();
            if (k === 'http-user-agent') ua = kv.join('=').trim();
            else if (k === 'http-referrer' || k === 'http-referer') ref = kv.join('=').trim();
          }
          continue;
        }
        src = b;
        i = j;
        break;
      }
      if (grp) cur = String(grp).trim() || cur;
      push(title, src, at['tvg-logo'] || at.logo || '', ua, ref);
      continue;
    }
    if (RE_EXTGRP.test(a)) {
      cur = a.slice(a.indexOf(':') + 1).trim() || cur;
      continue;
    }
    if (a.indexOf('#genre#') >= 0) {
      const gg = a.match(RE_GENRE);
      cur = clean(gg ? gg[1] : a.replace(/#genre#[\s\S]*$/, '').replace(/^#+/, '')) || cur;
      continue;
    }
    if (isUrl(a)) {
      push('', a, '', '', '');
      continue;
    }
    const m = a.match(/^([^,]+?)\s*,\s*(.+)$/);
    if (m && isUrl(m[2])) push(m[1], m[2], '', '', '');
  }

  const out = [];
  map.forEach((list, g) => {
    if (list && list.length) out.push({ groupName: clean(g) || '未分组', channels: list });
  });
  return out;
}

function flatten(groups) {
  const out = [];
  for (const g of groups) {
    for (const c of g.channels || []) out.push(c);
  }
  return out;
}

function liveHeaders(src, url) {
  src = src || {};
  const h = {
    'User-Agent': String(src.ua || '').trim() || DEF_UA,
    Accept: '*/*',
    Connection: 'keep-alive',
  };
  if (src.cookie) h.Cookie = String(src.cookie);
  const host = String(src.domain || '').trim() || hostOf(url);
  if (host) {
    const proto = /^https:/i.test(String(url || '')) ? 'https' : 'http';
    h.Referer = proto + '://' + host + '/';
    h.Origin = proto + '://' + host;
  }
  const where = hostOf(url) || host;
  if (where) {
    for (const k of Object.keys(TB_REF)) {
      if (where.indexOf(k) >= 0) {
        h.Referer = TB_REF[k][0];
        h.Origin = TB_REF[k][1];
        break;
      }
    }
  }
  if (!h.Referer && where) h.Referer = 'https://' + where + '/';
  return h;
}

async function httpText(url, headers) {
  const r = await axios.get(url, {
    timeout: 8000,
    responseType: 'text',
    maxRedirects: 5,
    maxContentLength: 8 * 1024 * 1024,
    maxBodyLength: 8 * 1024 * 1024,
    transformResponse: (d) => d,
    headers,
  });
  const d = r && r.data;
  if (Buffer.isBuffer(d)) return d.toString('utf8');
  return typeof d === 'string' ? d : String(d == null ? '' : d);
}

async function probeGroups(src) {
  const tries = [
    liveHeaders(src, src.url),
    liveHeaders({ ua: ALT_UA, cookie: src.cookie, domain: src.domain }, src.url),
  ];
  let text = null;
  let last = null;
  for (const headers of tries) {
    try {
      const t = await httpText(src.url, headers);
      if (t && t.replace(/\s/g, '').length > 0) {
        text = t;
        break;
      }
    } catch (e) {
      last = e;
    }
  }
  if (text == null) throw new Error((last && last.message) || '拉取直播源失败');
  const gs = parseGroups(text);
  if (!gs.length) throw new Error('未解析到有效频道');
  return gs;
}

function listFromRaw(x) {
  if (Array.isArray(x)) return x;
  if (x && typeof x === 'object') {
    if (Array.isArray(x.list)) return x.list;
    const arr = [];
    for (const k of Object.keys(x)) {
      const v = x[k];
      if (v && typeof v === 'object') arr.push(v);
    }
    return arr;
  }
  return [];
}

function rowNorm(s, idx, origin) {
  s = s || {};
  const url = String(s.url == null ? '' : s.url).trim();
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return {
    idx,
    id: s.id,
    origin,
    enabled: s.enabled !== false,
    name: clean(s.name) || ('直播源 ' + (idx + 1)),
    url,
    ua: String(s.ua == null ? '' : s.ua).trim() || DEF_UA,
    cookie: String(s.cookie == null ? '' : s.cookie).trim(),
    logo: String(s.logo || s.logoUrl || '').trim(),
    domain: hostOf(url),
  };
}

export function reloadLiveCache() {
  srcState.loaded = false;
  srcState.ts = 0;
  srcState.list = [];
  chCache.clear();
  domainIdx.clear();
  playCache.clear();
}

export async function mergeLiveSources(db) {
  const out = [];
  const seen = {};
  const srcs = [
    ['/config/live', 'app'],
    ['/liveSources', 'own'],
    ['/config/liveSources', 'app'],
    ['/live', 'app'],
  ];
  for (const [path, origin] of srcs) {
    let raw = null;
    try { raw = await db.getData(path); } catch { raw = null; }
    const arr = listFromRaw(raw);
    for (const item of arr) {
      const o = rowNorm(item, out.length, origin);
      if (!o || seen[o.url]) continue;
      seen[o.url] = 1;
      out.push(o);
    }
  }
  return out;
}

async function enabledSources(db, force) {
  const now = Date.now();
  if (!force && srcState.loaded && now - srcState.ts < SRC_TTL) return srcState.list;
  let all = [];
  try { all = await mergeLiveSources(db); } catch { all = []; }
  const list = [];
  for (const s of all) {
    if (s.enabled === false) continue;
    s.idx = list.length;
    list.push(s);
  }
  srcState.list = list;
  srcState.loaded = true;
  srcState.ts = now;
  domainIdx.clear();
  for (let k = 0; k < list.length; k++) {
    if (list[k].domain && !domainIdx.has(list[k].domain)) domainIdx.set(list[k].domain, k);
  }
  return list;
}

async function groupsOf(db, src) {
  if (!src || !src.url) return [];
  const key = (src.id != null ? '@' + src.id : '') + '|' + src.url;
  const now = Date.now();
  const hit = chCache.get(key);
  if (hit && now - hit.ts < hit.ttl) return hit.data;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const gs = await probeGroups(src);
      chCache.set(key, { data: gs, ts: Date.now(), ttl: CH_TTL });
      for (const g of gs) {
        for (const c of g.channels) {
          if (c.ua || c.referer) hdrMap.set(c.url, { ua: c.ua, referer: c.referer });
        }
      }
      if (hdrMap.size > 8000) hdrMap.clear();
      console.log('[liveSource] ' + src.name + ' 解析成功：' + flatten(gs).length + ' 个频道 / ' + gs.length + ' 个分组');
      return gs;
    } catch (e) {
      console.log('[liveSource] ' + src.name + ' 解析失败：' + e.message);
      chCache.set(key, { data: [], ts: Date.now(), ttl: CH_ERR_TTL });
      return [];
    }
  })();
  inflight.set(key, p);
  try { return await p; } finally { if (inflight.get(key) === p) inflight.delete(key); }
}

async function playUrl(id, db) {
  const key = String(id == null ? '' : id).trim();
  if (!key) return { parse: 0, url: '' };
  const now = Date.now();
  const hit = playCache.get(key);
  if (hit && now - hit.ts < hit.ttl) return hit.v;
  let list = [];
  try { list = await enabledSources(db, false); } catch { list = []; }
  let idx = -1;
  let url = key;
  const m = key.match(RE_IDX);
  if (m) {
    idx = parseInt(m[1], 10);
    url = key.replace(RE_IDX, '').trim();
  }
  if (!(idx >= 0 && list[idx])) {
    const host = hostOf(url);
    idx = (host && domainIdx.has(host)) ? domainIdx.get(host) : -1;
    if (idx < 0) {
      for (let i = 0; i < list.length; i++) {
        if (list[i].domain && url.indexOf(list[i].domain) >= 0) { idx = i; break; }
      }
    }
  }
  if (!/^https?:\/\//i.test(url)) return { parse: 0, url: '' };
  const src = list[idx] || null;
  const over = hdrMap.get(url) || null;
  const base = {
    ua: (over && over.ua) ? over.ua : (src ? src.ua : DEF_UA),
    cookie: src ? src.cookie : '',
    domain: src ? src.domain : hostOf(url),
  };
  let hd = liveHeaders(base, url);
  if (over && over.referer) {
    hd.Referer = over.referer;
    try { hd.Origin = new URL(over.referer).origin; } catch { }
  }
  let real = url;
  let ttl = PLAY_TTL;
  if (/\.php($|[?#])/i.test(url) || /playlist\//i.test(url)) {
    ttl = PLAY_PHP_TTL;
    let follow = null;
    try {
      const r = await axios.head(url, {
        headers: hd,
        timeout: 5000,
        maxRedirects: 0,
        validateStatus: (st) => st >= 200 && st < 400,
      });
      if (r.status >= 300 && r.status < 400 && r.headers?.location) follow = r.headers.location;
    } catch (e) {
      const loc = e?.response?.headers?.location;
      if (loc) follow = loc;
    }
    if (follow) {
      try { real = new URL(follow, url).href; } catch { real = follow; }
      hd = liveHeaders({ ua: base.ua, cookie: base.cookie, domain: hostOf(real) }, real);
      if (over && over.referer) hd.Referer = over.referer;
    }
  }
  const out = { parse: 0, url: real, header: hd, headers: hd };
  playCache.set(key, { v: out, ts: now, ttl });
  if (playCache.size > 200) {
    const it = playCache.keys();
    for (let n = 0; n < 50; n++) {
      const k = it.next();
      if (k.done) break;
      playCache.delete(k.value);
    }
  }
  return out;
}

function sniff(url, headers, timeoutMs, maxBytes) {
  return new Promise((resolve) => {
    let done = false;
    const chunks = [];
    let total = 0;
    let timer = null;
    let req = null;
    const finish = (res) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      try { if (req && req.destroy) req.destroy(); } catch { }
      resolve(res);
    };
    const lib = /^https:/i.test(String(url)) ? https : http;
    try {
      req = lib.get(url, { headers, timeout: timeoutMs }, (res) => {
        const info = {
          status: res.statusCode,
          type: String(res.headers['content-type'] || ''),
          length: res.headers['content-length'] || '',
          location: res.headers.location || '',
          bytes: 0,
          text: '',
        };
        const collect = () => {
          info.bytes = total;
          try { info.text = Buffer.concat(chunks).toString('utf8').slice(0, 4096); } catch { info.text = ''; }
          finish(info);
        };
        res.on('data', (c) => {
          if (total < maxBytes) { chunks.push(c); total += c.length; }
          if (total >= maxBytes) collect();
        });
        res.on('end', collect);
        res.on('error', (e) => { info.error = e.message; collect(); });
      });
      req.on('timeout', () => finish({ status: 0, error: 'timeout' }));
      req.on('error', (e) => finish({ status: 0, error: e.message || 'request error' }));
      timer = setTimeout(() => finish({ status: 0, error: 'timeout' }), timeoutMs + 500);
    } catch (e) {
      finish({ status: 0, error: e.message });
    }
  });
}

async function follow(url, headers, maxHops) {
  let hops = 0;
  let cur = url;
  let last = null;
  while (hops <= maxHops) {
    const r = await sniff(cur, headers, 8000, 1500);
    last = r;
    last.finalUrl = cur;
    if (r.status >= 300 && r.status < 400 && r.location) {
      let next = '';
      try { next = new URL(r.location, cur).href; } catch { next = ''; }
      if (!next) break;
      cur = next;
      hops++;
      continue;
    }
    break;
  }
  if (last) last.hops = hops;
  return last || { status: 0, error: 'no response' };
}

function firstSeg(text) {
  const lines = String(text || '').split(/\r?\n/);
  for (const line of lines) {
    const l = line.trim();
    if (!l || l.charAt(0) === '#') continue;
    return l;
  }
  return '';
}

async function probeChannel(url, headers, deep) {
  const t0 = Date.now();
  const r = await follow(url, headers, 3);
  const out = {
    status: r.status || 0, type: r.type || '', hops: r.hops || 0,
    ms: Date.now() - t0, bytes: r.bytes || 0, finalUrl: r.finalUrl || url,
    error: r.error || '', ok: false, note: '',
  };
  if (r.status === 200 || r.status === 206) {
    const isM3u8 = /mpegurl/i.test(r.type) || /#EXTM3U/i.test(String(r.text || ''));
    if (isM3u8) {
      out.note = '清单正常';
      out.ok = true;
      if (deep) {
        const seg = firstSeg(r.text);
        if (seg) {
          let su = seg;
          try { su = new URL(seg, r.finalUrl || url).href; } catch { }
          const t1 = Date.now();
          const sr = await sniff(su, headers, 8000, 1024);
          out.seg = { status: sr.status || 0, type: sr.type || '', bytes: sr.bytes || 0, ms: Date.now() - t1, error: sr.error || '' };
          if (sr.status === 200 || sr.status === 206) out.note = '清单 + 分片正常';
          else {
            out.ok = false;
            out.note = '清单正常，分片 ' + (sr.error ? ('失败：' + sr.error) : ('HTTP ' + sr.status));
          }
        }
      }
    } else if (r.bytes > 0) {
      out.ok = true;
      out.note = '媒体流正常';
    } else {
      out.ok = false;
      out.note = '空响应';
    }
  } else {
    out.ok = false;
    out.note = r.error ? ('请求失败：' + r.error) : ('HTTP ' + r.status);
  }
  return out;
}

export async function testLiveParse(src) {
  const gs = await probeGroups(src);
  const channels = flatten(gs);
  return {
    groups: gs.length,
    channels: channels.length,
    sample: gs.slice(0, 8).map((g) => ({ name: g.groupName, count: g.channels.length })),
    channelSample: channels.slice(0, 6).map((c) => c.name),
  };
}

export async function probeLiveSource(src, opts = {}) {
  const gs = await probeGroups(src);
  const groups = [];
  const buckets = [];
  let total = 0;
  for (const g of gs) {
    const chs = g.channels || [];
    groups.push({ name: g.groupName, count: chs.length });
    total += chs.length;
    buckets.push(chs.map((ch) => ({ group: g.groupName, ch })));
  }
  let want = parseInt(opts.sample, 10);
  if (!want || want < 1) want = 8;
  if (want > 20) want = 20;
  const picked = [];
  const wantGroup = String(opts.group || '').trim();
  if (wantGroup) {
    let pool = [];
    for (const b of buckets) if (b.length && b[0].group === wantGroup) pool = b;
    const step = Math.max(1, Math.floor(pool.length / want));
    for (let a = 0; a < pool.length && picked.length < want; a += step) picked.push(pool[a]);
  } else {
    let round = 0;
    while (picked.length < want) {
      let added = false;
      for (let k = 0; k < buckets.length && picked.length < want; k++) {
        if (buckets[k][round]) { picked.push(buckets[k][round]); added = true; }
      }
      if (!added || round > 500) break;
      round++;
    }
  }
  const items = [];
  let ok = 0;
  for (const p of picked) {
    const over = hdrMap.get(p.ch.url) || null;
    const hd = liveHeaders({
      ua: (over && over.ua) ? over.ua : src.ua,
      cookie: src.cookie,
      domain: src.domain,
    }, p.ch.url);
    if (over && over.referer) hd.Referer = over.referer;
    const res = await probeChannel(p.ch.url, hd, opts.deep !== false);
    if (res.ok) ok++;
    items.push({
      group: p.group, name: p.ch.name, url: p.ch.url,
      status: res.status, type: res.type, hops: res.hops, ms: res.ms, bytes: res.bytes,
      seg: res.seg || null, ok: res.ok, note: res.note,
    });
  }
  return {
    groups: gs.length, channels: total, groupList: groups.slice(0, 40),
    sample: picked.length, tested: items.length, ok, fail: items.length - ok,
    rate: items.length ? Math.round(ok * 100 / items.length) : 0, items,
  };
}

async function init() {
  return {};
}

async function home(inReq) {
  const list = await enabledSources(inReq.server.db, false);
  return {
    class: list.map((s, i) => ({ type_id: String(i), type_name: s.name, type_image: s.logo || '' })),
  };
}

async function homeVod(inReq) {
  const list = await enabledSources(inReq.server.db, false);
  return {
    list: list.map((s, i) => ({ vod_id: i + '_0_0', vod_name: s.name, vod_pic: s.logo || '', vod_remarks: '直播源' })),
    page: { page: 1, pagecount: 1, limit: list.length, total: list.length },
  };
}

async function category(inReq) {
  const list = await enabledSources(inReq.server.db, false);
  const i = parseInt(inReq.body.id, 10);
  const page = parseInt(inReq.body.page, 10) || 1;
  const s = list[i];
  if (!s) return { list: [], page: { page: 1, pagecount: 1, limit: 0, total: 0 } };
  const gs = await groupsOf(inReq.server.db, s);
  const total = gs.length;
  const pc = Math.ceil(total / PAGE_SIZE) || 1;
  const start = (page - 1) * PAGE_SIZE;
  const sl = page > pc ? [] : gs.slice(start, start + PAGE_SIZE);
  return {
    list: sl.map((g, gi) => ({
      vod_id: i + '_' + (gi + start) + '_' + page,
      vod_name: g.groupName,
      vod_pic: s.logo || '',
      vod_remarks: g.channels.length + ' 个频道',
    })),
    page: { page, pagecount: pc, limit: PAGE_SIZE, total },
    pagecount: pc,
    limit: PAGE_SIZE,
    total,
  };
}

async function detail(inReq) {
  const list = await enabledSources(inReq.server.db, false);
  const raw = Array.isArray(inReq.body.id) ? inReq.body.id.join(',') : String(inReq.body.id || '');
  const ids = raw.split(',').filter(Boolean);
  const out = [];
  for (const one of ids) {
    const mm = one.match(/^(\d+)_(\d+)(?:_(\d+))?$/);
    let s = null;
    let gi = -1;
    if (mm) {
      s = list[parseInt(mm[1], 10)] || null;
      gi = parseInt(mm[2], 10);
    }
    if (s && gi >= 0) {
      const gs = await groupsOf(inReq.server.db, s);
      const g = gs[gi];
      if (!g) continue;
      const urls = g.channels.map((c) => c.name + '$[IDX:' + (s.idx != null ? s.idx : 0) + ']' + c.url);
      out.push({
        vod_id: one,
        vod_name: s.name + ' - ' + g.groupName,
        vod_pic: s.logo || '',
        vod_remarks: g.channels.length + ' 个频道',
        vod_play_from: s.name + ' · ' + g.groupName,
        vod_play_url: urls.join('#'),
      });
      continue;
    }
    const parts = one.split('_');
    const tail = parts.pop();
    const head = parts.join('_');
    const found = list.find((x) => String(x.id) === String(head));
    if (found) {
      const c = flatten(await groupsOf(inReq.server.db, found))[parseInt(tail, 10)];
      if (c) out.push({ vod_id: one, vod_name: c.name, vod_play_from: found.name, vod_play_url: '播放$' + c.url });
      continue;
    }
    if (/^[a-z]+:\/\//i.test(one)) {
      out.push({ vod_id: one, vod_name: '直播', vod_play_from: '直播', vod_play_url: '播放$' + one });
    }
  }
  return { list: out };
}

async function play(inReq) {
  return playUrl(inReq.body.id, inReq.server.db);
}

async function search(inReq) {
  const wd = String(inReq.body.wd == null ? '' : inReq.body.wd).toLowerCase().trim();
  const page = parseInt(inReq.body.page, 10) || 1;
  const limit = parseInt(inReq.body.limit, 10) || PAGE_SIZE;
  if (!wd) return { list: [], page: { page: 1, pagecount: 1, limit: 0, total: 0 } };
  const list = await enabledSources(inReq.server.db, false);
  const res = await Promise.all(list.map((s) => groupsOf(inReq.server.db, s).catch(() => [])));
  const hits = [];
  for (let si = 0; si < res.length; si++) {
    const gs = res[si] || [];
    const s = list[si];
    for (let gi = 0; gi < gs.length; gi++) {
      for (const ch of gs[gi].channels || []) {
        if (ch.name.toLowerCase().indexOf(wd) < 0) continue;
        hits.push({
          vod_id: si + '_' + gi + '_1',
          vod_name: ch.name + ' (' + s.name + ')',
          vod_pic: s.logo || '',
          vod_remarks: gs[gi].groupName,
        });
      }
    }
  }
  const total = hits.length;
  const pc = Math.ceil(total / limit) || 1;
  const start = (page - 1) * limit;
  return {
    list: page > pc ? [] : hits.slice(start, start + limit),
    page: { page, pagecount: pc, limit, total },
    pagecount: pc,
    limit,
    total,
  };
}

export default {
  meta: {
    key: 'liveSource',
    name: '📺直播源',
    type: 3,
  },
  api: async (fastify) => {
    fastify.post('/init', init);
    fastify.post('/home', home);
    fastify.post('/homeVod', homeVod);
    fastify.post('/category', category);
    fastify.post('/detail', detail);
    fastify.post('/play', play);
    fastify.post('/search', search);
  },
};
