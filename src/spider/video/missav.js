/**
 * MissAV 爬虫 — 从 index.js (hs 控制台 v3.0) 还原
 *
 * 相较 src/spider/video/miss.js 的增强点：
 * 1. detail 拉取 surrit playlist.m3u8，解析 video.m3u8 变体并取最高清晰度
 * 2. 播放地址经 /spider/missav/3/m3u8|seg 代理（跨域 / Referer 透传）
 */
import { load } from 'cheerio';
import req from './src/util/req.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0';
const DEFAULT_SITE = 'https://missav.live';
const KEY_SITE = '/missavSite';
const KEY_COOKIE = '/missavCookie';
const PROXY_BASE = '/spider/miss/3';
const SURRIT_ORIGIN = 'https://surrit.com/';

let siteBase = DEFAULT_SITE;

async function getSite(db) {
  try {
    const val = (await db.getData(KEY_SITE))?.missav || '';
    if (!val) return DEFAULT_SITE;
    return val.startsWith('http') ? val : `https://${val}`;
  } catch {
    return DEFAULT_SITE;
  }
}

async function getCookie(db) {
  try {
    return await db.getData(KEY_COOKIE) || '';
  } catch {
    return '';
  }
}

async function buildHeaders(db, extra = {}) {
  const headers = {
    'User-Agent': UA,
    Accept: 'application/json, text/plain, */*',
    'Accept-Encoding': 'gzip, compress, deflate, br',
    ...extra,
  };
  const cookie = await getCookie(db);
  if (cookie) headers.Cookie = cookie;
  return headers;
}

async function request(url, db, extra = {}) {
  const headers = await buildHeaders(db, extra);
  const resp = await req.get(url, { headers });
  return resp.data;
}

async function fetchText(url, { referer, maxBytes = 1048576, timeout = 20000, db } = {}) {
  const headers = { 'User-Agent': UA, 'Accept-Encoding': 'identity' };
  if (referer) headers.Referer = referer;
  if (db) {
    const cookie = await getCookie(db);
    if (cookie) headers.Cookie = cookie;
  }
  const resp = await req.get(url, {
    headers,
    timeout,
    maxContentLength: maxBytes + 1,
    maxBodyLength: maxBytes + 1,
    validateStatus: () => true,
  });
  const text = typeof resp.data === 'string'
    ? resp.data
    : Buffer.from(resp.data ?? '').toString('utf8');
  return { status: resp.status, text };
}

function parseList(html) {
  const $ = load(html);
  const list = [];
  $('.thumbnail').each((_, el) => {
    list.push({
      vod_id: $(el).find('.text-secondary').attr('href'),
      vod_name: $(el).find('.text-secondary').text().trim().replace(/\s+/g, ' '),
      vod_pic: $(el).find('.w-full').attr('data-src') || '',
      vod_remarks: $(el).find('.left-1').text().trim(),
      vod_duration: $(el).find('.right-1').text().trim(),
    });
  });
  return list;
}

function apiOrigin(inReq) {
  const proto = inReq.headers['x-forwarded-proto'];
  const scheme = proto
    ? String(proto).split(',')[0].trim()
    : (inReq.socket?.encrypted ? 'https' : 'http');
  return `${scheme}://${inReq.headers.host}`;
}

function isAllowedHost(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (host === 'surrit.com' || host.endsWith('.surrit.com')) return true;
  try {
    return host === new URL(siteBase).hostname.toLowerCase();
  } catch {
    return false;
  }
}

function resolveReferer(ref) {
  if (ref) {
    try {
      const u = new URL(String(ref));
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        const siteHost = (() => {
          try { return new URL(siteBase).hostname.toLowerCase(); } catch { return ''; }
        })();
        if (siteHost && u.hostname.toLowerCase() === siteHost) return String(ref);
      }
    } catch { /* ignore */ }
  }
  return siteBase;
}

function proxyLineUrl(line, baseUrl, origin, referer) {
  let abs;
  try {
    abs = new URL(line, baseUrl).href;
  } catch {
    return line;
  }
  if (!isAllowedHost(abs)) return line;
  const kind = /\.m3u8($|[?#])/i.test(abs) ? 'm3u8' : 'seg';
  return `${origin}${PROXY_BASE}/${kind}?url=${encodeURIComponent(abs)}&ref=${encodeURIComponent(resolveReferer(referer))}`;
}

function rewriteM3u8(text, baseUrl, origin, referer) {
  return String(text).split('\n').map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith('#')) {
      if (trimmed.includes('URI="')) {
        return line.replace(/URI="([^"]+)"/g, (_all, uri) => `URI="${proxyLineUrl(uri, baseUrl, origin, referer)}"`);
      }
      return line;
    }
    return proxyLineUrl(trimmed, baseUrl, origin, referer);
  }).join('\n');
}

function wrapPlayUrl(inReq, url, referer) {
  const origin = apiOrigin(inReq);
  return `${origin}${PROXY_BASE}/m3u8?url=${encodeURIComponent(url)}&ref=${encodeURIComponent(referer)}`;
}

async function init() {
  return {};
}

async function home(inReq) {
  siteBase = await getSite(inReq.server.db);
  const classes = [
    { type_id: 'dm539/cn/new',                type_name: '最近更新' },
    { type_id: 'dm634/cn/release',            type_name: '新作上市' },
    { type_id: 'dm278/cn/chinese-subtitle',   type_name: '中文字幕' },
    { type_id: 'dm817/cn/uncensored-leak',    type_name: '无码' },
    { type_id: 'dm301/cn/today-hot',          type_name: '今日热门' },
    { type_id: 'dm170/cn/weekly-hot',         type_name: '本周热门' },
    { type_id: 'dm270/cn/monthly-hot',        type_name: '本月热门' },
    { type_id: 'dm541/cn/fc2',                type_name: 'FC2' },
    { type_id: 'dm63/cn/madou',               type_name: '麻豆' },
  ];

  let actors = [];
  try {
    actors = (await inReq.server.db.getData('/missavActors') || [])
      .filter((v) => v.enabled)
      .map((v) => v.name);
  } catch {
    actors = [];
  }

  const options = [
    {
      key: 'filt',
      name: '筛选',
      init: 'all',
      value: [
        { n: '全部', v: 'all' },
        { n: '单人作品', v: 'individual' },
        { n: '多人作品', v: 'multiple' },
        { n: '中文字幕', v: 'chinese-subtitle' },
      ],
    },
    {
      key: 'sort',
      name: '排序',
      init: 'released_at',
      value: [
        { n: '发行时间', v: 'released_at' },
        { n: '最近更新', v: 'published_at' },
        { n: '收藏数', v: 'saved' },
        { n: '今日浏览数', v: 'today_views' },
        { n: '本周浏览数', v: 'weekly_views' },
        { n: '本月浏览数', v: 'monthly_views' },
        { n: '总浏览数', v: 'views' },
      ],
    },
    {
      key: 'actor',
      name: '演员筛选',
      init: 'all',
      value: [
        { n: '全部', v: 'all' },
        ...actors.map((n) => ({ n, v: n })),
      ],
    },
  ];

  const filters = {};
  for (const c of classes) filters[c.type_id] = options;
  return { class: classes, filters };
}

async function category(inReq) {
  let id = inReq.body.id;
  const filters = inReq.body.filters || {};
  let page = inReq.body.page || 1;
  if (page === 0) page = 1;

  if (filters.actor && filters.actor !== 'all') {
    id = `dm74/cn/actresses/${encodeURIComponent(filters.actor)}`;
  }
  if (filters.filt && filters.filt !== 'all') {
    id += `?filters=${filters.filt}`;
  }
  if (filters.sort) {
    const sep = id.includes('?') ? '&' : '?';
    id += `${sep}sort=${filters.sort}`;
  }
  id += id.includes('?') ? `&page=${page}` : `?page=${page}`;

  const html = await request(`${siteBase}/${id}`, inReq.server.db);
  const list = parseList(html);
  return {
    page,
    pagecount: list.length < 12 ? page : page + 1,
    list,
  };
}

async function detail(inReq) {
  const pageUrl = inReq.body.id;
  const html = await request(pageUrl, inReq.server.db);
  const match = html.match(/surrit\.com\\\/(.+?)\\\/seek\\\/_0\.jpg/);
  const streams = [];

  if (match?.[1]) {
    const uuid = match[1];
    const playlistUrl = `${SURRIT_ORIGIN}${uuid}/playlist.m3u8`;
    let playlistText = '';

    try {
      const resp = await fetchText(playlistUrl, {
        referer: pageUrl,
        maxBytes: 1048576,
        timeout: 20000,
        db: inReq.server.db,
      });
      if (resp.status === 200 || resp.status === 206) {
        playlistText = resp.text;
      } else {
        console.warn(`[missav] surrit 播放列表响应 HTTP ${resp.status}`);
      }
    } catch (err) {
      console.warn(`[missav] 拉取播放列表失败: ${err.message}`);
    }

    const variants = playlistText
      .split('\n')
      .filter((line) => line.includes('/video.m3u8'))
      .map((line) => {
        const name = line.replace('/video.m3u8', '');
        const m = name.match(/(\d+)p|(\d+)x(\d+)/);
        const resolution = m ? parseInt(m[1] || m[3], 10) : 0;
        return {
          name,
          resolution,
          url: `${SURRIT_ORIGIN}${uuid}/${line}`,
        };
      })
      .filter((v) => v.resolution > 0)
      .sort((a, b) => b.resolution - a.resolution);

    if (variants.length > 0) {
      const best = variants[0];
      streams.push({
        name: best.name,
        url: wrapPlayUrl(inReq, best.url, pageUrl),
      });
    }
  }

  return {
    list: [{
      vod_id: pageUrl,
      vod_name: '',
      vod_pic: '',
      vod_play_from: 'MissAV',
      vod_play_url: streams.map((s) => `${s.name}$${s.url}`).join('#'),
    }],
  };
}

async function play(inReq) {
  return {
    url: inReq.body.id,
    header: {
      'User-Agent': UA,
      Referer: siteBase,
    },
  };
}

async function search(inReq) {
  let page = inReq.body.page || 1;
  if (page === 0) page = 1;

  const wd = encodeURIComponent(inReq.body.wd);
  const html = await request(`${siteBase}/cn/search/${wd}?page=${page}`, inReq.server.db);
  const list = parseList(html);
  return {
    page,
    pagecount: list.length < 12 ? page : page + 1,
    list,
  };
}

async function proxyM3u8(inReq, reply) {
  const url = inReq.query?.url;
  const referer = resolveReferer(inReq.headers.referer || inReq.query?.ref);
  if (!url || !isAllowedHost(String(url))) {
    return reply.code(403).send('forbidden: upstream host not allowed');
  }

  let upstream;
  try {
    upstream = await fetchText(String(url), {
      referer,
      maxBytes: 2 * 1024 * 1024,
      db: inReq.server.db,
    });
  } catch (err) {
    return reply.code(502).send(`upstream fetch failed: ${err.message}`);
  }

  if (upstream.status !== 200 && upstream.status !== 206) {
    return reply.code(upstream.status).send(`upstream http ${upstream.status}`);
  }

  const origin = apiOrigin(inReq);
  const body = rewriteM3u8(upstream.text, String(url), origin, referer);
  return reply
    .header('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8')
    .header('Access-Control-Allow-Origin', '*')
    .header('Cache-Control', 'no-store')
    .send(body);
}

async function proxySeg(inReq, reply) {
  const url = inReq.query?.url;
  const referer = resolveReferer(inReq.headers.referer || inReq.query?.ref);
  if (!url || !isAllowedHost(String(url))) {
    return reply.code(403).send('forbidden: upstream host not allowed');
  }

  const headers = { 'User-Agent': UA, Referer: referer, 'Accept-Encoding': 'identity' };
  const cookie = await getCookie(inReq.server.db);
  if (cookie) headers.Cookie = cookie;
  if (inReq.headers.range) headers.Range = String(inReq.headers.range);
  if (inReq.headers['if-range']) headers['If-Range'] = String(inReq.headers['if-range']);

  let upstream;
  try {
    upstream = await req.get(String(url), {
      headers,
      responseType: 'stream',
      timeout: 20000,
      validateStatus: () => true,
    });
  } catch (err) {
    return reply.code(502).send(`upstream fetch failed: ${err.message}`);
  }

  reply.code(upstream.status);
  for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
    if (upstream.headers[key] !== undefined) reply.header(key, upstream.headers[key]);
  }
  reply.header('Access-Control-Allow-Origin', '*');

  const close = () => {
    try { upstream.data.destroy(); } catch { /* ignore */ }
  };
  inReq.raw.once('aborted', close);
  reply.raw.once('close', close);

  try {
    await reply.send(upstream.data);
  } catch {
    close();
    if (!reply.sent) {
      try { reply.code(502).send('upstream stream error'); } catch { /* ignore */ }
    }
  }
}

export default {
  meta: {
    key: 'miss',
    name: '🔥Miss',
    type: 3,
  },
  api: async (fastify) => {
    fastify.post('/init', init);
    fastify.post('/home', home);
    fastify.post('/category', category);
    fastify.post('/detail', detail);
    fastify.post('/play', play);
    fastify.post('/search', search);
    fastify.get('/m3u8', proxyM3u8);
    fastify.get('/seg', proxySeg);
  },
};
