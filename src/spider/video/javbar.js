import { load } from 'cheerio';
import http from 'node:http';
import https from 'node:https';

const SITE = 'https://javbar.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PAGE_SIZE = 20;
const TIMEOUT = 20000;
const PLAY_TTL = 20 * 60 * 1000;

// 列表分类（本站只有这四个 section，都挂在 /category/ 下）
const CATEGORIES = [
  { id: 'censored', name: 'モザあり / 有码' },
  { id: 'uncensored', name: '無修正 / 无码' },
  { id: 'engsub', name: 'Engsub / 英字' },
  { id: 'virtual', name: 'VR' },
];

/* ------------------------------------------------------------------ *
 * HTTP
 * ------------------------------------------------------------------ */

function request(url, opt = {}) {
  const { method = 'GET', headers = {}, body = null, follow = true, referer = '' } = opt;
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      return reject(new Error(`bad url: ${url}`));
    }
    const mod = u.protocol === 'http:' ? http : https;
    const h = {
      'User-Agent': UA,
      'Accept-Encoding': 'identity',
      'Accept-Language': 'ja,en;q=0.8',
      ...headers,
    };
    if (referer) h.Referer = referer;

    const req = mod.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || undefined,
        path: u.pathname + u.search,
        method,
        headers: h,
        timeout: TIMEOUT,
      },
      (res) => {
        const code = res.statusCode || 0;
        if (follow && [301, 302, 303, 307, 308].includes(code) && res.headers.location) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          const nextMethod = code === 303 ? 'GET' : method;
          return resolve(request(next, { ...opt, method: nextMethod, body: nextMethod === 'GET' ? null : body }));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: code,
            url,
            location: res.headers.location || '',
            text: Buffer.concat(chunks).toString('utf8'),
          })
        );
      }
    );
    req.on('timeout', () => req.destroy(new Error(`timeout: ${url}`)));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getHtml(url, referer = '') {
  const res = await request(url, { referer });
  if (res.status >= 400) throw new Error(`HTTP ${res.status} ${url}`);
  if (!res.text || res.text.length < 300) throw new Error(`empty body ${url}`);
  return res.text;
}

function postForm(url, form, referer = '') {
  const body = form;
  return request(url, {
    method: 'POST',
    referer,
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json, text/javascript, */*; q=0.01',
    },
  });
}

function abs(url) {
  if (!url) return '';
  const u = String(url).trim();
  if (!u || u.startsWith('data:')) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return SITE + (u.startsWith('/') ? u : '/' + u);
}

/* ------------------------------------------------------------------ *
 * packer（p.a.c.k.e.d）解包：不 eval 站方脚本，自己还原
 * ------------------------------------------------------------------ */

function decodeJsString(lit) {
  let s = lit;
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) s = s.slice(1, -1);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '\\') {
      out += c;
      continue;
    }
    const n = s[++i];
    if (n === undefined) break;
    if (n === 'n') out += '\n';
    else if (n === 'r') out += '\r';
    else if (n === 't') out += '\t';
    else if (n === 'b') out += '\b';
    else if (n === 'f') out += '\f';
    else if (n === 'x') {
      out += String.fromCharCode(parseInt(s.substr(i + 1, 2), 16));
      i += 2;
    } else if (n === 'u') {
      out += String.fromCharCode(parseInt(s.substr(i + 1, 4), 16));
      i += 4;
    } else out += n;
  }
  return out;
}

function splitTopLevel(s) {
  const parts = [];
  let cur = '';
  let quote = '';
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      cur += c;
      if (c === '\\') {
        cur += s[++i] || '';
      } else if (c === quote) quote = '';
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      cur += c;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    if (c === ')' || c === ']' || c === '}') depth--;
    if (c === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

function unbase(num, radix) {
  const map = (n) => (n > 35 ? String.fromCharCode(n + 29) : n.toString(36));
  let out = '';
  let n = num;
  do {
    out = map(n % radix) + out;
    n = Math.floor(n / radix);
  } while (n > 0);
  return out;
}

function unpackOne(seg) {
  // seg: eval(function(p,a,c,k,e,d){...}(ARGS))
  const body = seg.replace(/^eval\(/, '').replace(/\)\s*$/, '');
  const paren = body.indexOf('}(');
  if (paren < 0) return '';
  const args = splitTopLevel(body.slice(paren + 2));
  if (args.length < 4) return '';
  const code = decodeJsString(args[0].trim());
  const radix = parseInt(args[1], 10);
  let count = parseInt(args[2], 10);
  const km = args[3].match(/^\s*(['"])([\s\S]*)\1\s*\.split\(\s*(['"])[\s\S]*?\3\s*\)\s*$/);
  if (!km || !radix || !count) return '';
  const words = decodeJsString(km[1] + km[2] + km[1]).split('|');
  let out = code;
  while (count--) {
    if (words[count]) {
      out = out.replace(new RegExp('\\b' + unbase(count, radix).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g'), words[count]);
    }
  }
  return out;
}

function unpackAll(html) {
  const out = [];
  const KEY = 'eval(function(p,a,c,k,e,d)';
  let from = 0;
  for (;;) {
    const start = html.indexOf(KEY, from);
    if (start < 0) break;
    const end = html.indexOf('</script>', start);
    if (end < 0) break;
    let seg = html.slice(start, end).trim();
    if (seg.endsWith(')')) seg = seg.slice(0, -1);
    try {
      const decoded = unpackOne(seg);
      if (decoded) out.push(decoded);
    } catch (e) {
      /* 单个块解不开就跳过 */
    }
    from = end;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 播放源解析
 * ------------------------------------------------------------------ */

function pickSrcs(text) {
  const found = new Set();
  const push = (u) => {
    if (!u) return;
    const clean = u.replace(/\\\//g, '/').replace(/["'\\]/g, '').trim();
    if (!clean) return;
    found.add(clean);
  };
  for (const m of text.matchAll(/https?:\/\/[^\s"'<>\\]+?(?:\.m3u8|\.txt|master\.txt)[^\s"'<>\\]*/gi)) push(m[0]);
  for (const m of text.matchAll(/["'](\/[^\s"'<>\\]+(?:master\.m3u8|master\.txt)[^\s"'<>\\]*)/gi)) push(m[1]);
  for (const m of text.matchAll(/(?:file|src|url|hls\d?)\s*[:=]\s*["']([^"']*(?:\.m3u8|master\.txt)[^"']*)["']/gi))
    push(m[1]);
  return [...found];
}

async function looksLikePlaylist(url) {
  try {
    const res = await request(url);
    if (res.status !== 200) return false;
    const head = res.text.slice(0, 200);
    return /#EXTM3U/i.test(head);
  } catch (e) {
    return false;
  }
}

async function resolveJavideo(embed) {
  // https://play.javideo.net/embed/{uuid} -> /api/playlist-token/{uuid} -> /v/{token} 302 -> m3u8
  const key = embed.split('/embed/')[1]?.split(/[?#]/)[0];
  if (!key) throw new Error('javideo: no key');
  const tokRes = await request(`https://play.javideo.net/api/playlist-token/${encodeURIComponent(key)}`, {
    referer: embed,
    headers: { Accept: 'application/json' },
  });
  let t = '';
  try {
    t = JSON.parse(tokRes.text).t || '';
  } catch (e) {
    throw new Error('javideo: token parse failed');
  }
  if (!t) throw new Error('javideo: empty token');
  const res = await request(`https://play.javideo.net/v/${t}`, { referer: embed, follow: false });
  const loc = res.location;
  if (!loc || !/^https?:\/\//i.test(loc)) throw new Error('javideo: no playlist location');
  // 站方把清单后缀伪装成 .sb，补一个 .m3u8 尾巴给只认后缀的播放器
  return loc.includes('.m3u8') ? loc : `${loc}${loc.includes('?') ? '&' : '?'}x=.m3u8`;
}

async function resolveEmbedPage(embed) {
  // iplayerhls / luluvid / dintezuvio 一类：packed JS 里直接躺着 m3u8（含 token）
  const html = await getHtml(embed, SITE + '/');
  const blobs = [html, ...unpackAll(html)];
  const cands = [];
  for (const b of blobs) cands.push(...pickSrcs(b));
  const uniq = [...new Set(cands)].map((u) => (u.startsWith('/') ? new URL(u, embed).toString() : u));
  // iplayerhls 的 /stream/ 相对线路最稳，排前面
  uniq.sort((a, b) => (a.includes('/stream/') ? -1 : 0) - (b.includes('/stream/') ? -1 : 0));
  for (const u of uniq) {
    if (await looksLikePlaylist(u)) return u;
  }
  throw new Error('embed: no playable stream');
}

const resolveCache = new Map();

async function resolveStream(embed) {
  const hit = resolveCache.get(embed);
  if (hit && hit.exp > Date.now()) return hit.url;
  const host = (() => {
    try {
      return new URL(embed).hostname;
    } catch (e) {
      return '';
    }
  })();
  let url = '';
  if (host === 'play.javideo.net') url = await resolveJavideo(embed);
  else url = await resolveEmbedPage(embed);
  resolveCache.set(embed, { url, exp: Date.now() + PLAY_TTL });
  return url;
}

/* ------------------------------------------------------------------ *
 * 列表 / 详情解析
 * ------------------------------------------------------------------ */

function parseList($) {
  const list = [];
  const seen = new Set();
  $('.tray-item').each((i, el) => {
    const $el = $(el);
    const a = $el.find('a[href*="/videos/"]').first();
    const href = a.attr('href') || '';
    if (!/\/videos\/[a-z]+\/\d+\.html/.test(href)) return;
    const id = abs(href);
    if (seen.has(id)) return;
    seen.add(id);
    const img = $el.find('img.tray-item-thumbnail').first();
    const name = ($el.find('.tray-item-title').first().text() || img.attr('alt') || '').trim();
    const date = $el.find('.tray-film-views').first().text().trim();
    const quality = $el.find('.tray-item-quality').first().text().trim();
    const remarks = [quality, date].filter(Boolean).join(' ');
    list.push({
      vod_id: id,
      vod_name: name || '(无标题)',
      vod_pic: abs(img.attr('src') || img.attr('data-src') || img.attr('data-original') || ''),
      vod_remarks: remarks,
      vod_content: '',
    });
  });
  return list;
}

function listUrl(kind, key, page) {
  if (kind === 'cate') {
    const slug = key;
    return page <= 1 ? `${SITE}/category/${slug}.html` : `${SITE}/category/${slug}-${page}.html`;
  }
  if (kind === 'pop') {
    return page <= 1 ? `${SITE}/label/popular.html` : `${SITE}/label/popular/page/${page}.html`;
  }
  const wd = encodeURIComponent(key);
  return page <= 1 ? `${SITE}/search.html?wd=${wd}` : `${SITE}/search/page/${page}/wd/${wd}.html`;
}

async function fetchList(kind, key, page) {
  const url = listUrl(kind, key, page);
  const html = await getHtml(url, SITE + '/');
  const $ = load(html);
  const list = parseList($);
  const pagecount = list.length === 0 && page > 1 ? page - 1 : list.length < PAGE_SIZE ? page : page + 1;
  return {
    page,
    pagecount,
    limit: PAGE_SIZE,
    total: 0,
    list,
  };
}

function detailMeta($) {
  const meta = { code: '', maker: '', tags: [], actors: [], date: '', desc: '' };
  $('.film-info-genre').each((i, el) => {
    const $el = $(el);
    const label = $el.find('.genre_1').first().text().replace(/[:：]/g, '').trim();
    if (label === '品番') meta.code = $el.find('.info-normal').first().text().trim();
    else if (label === 'メーカー') meta.maker = $el.find('.info-area').first().text().trim();
    else if (label === 'ジャンル') meta.tags = $el.find('.info-tag').map((j, e) => $(e).text().trim()).get();
    else if (label === '出演者') meta.actors = $el.find('.info-actor').map((j, e) => $(e).text().trim()).get();
    else if (label === '発売日') meta.date = $el.find('.info-normal').first().text().trim().split('T')[0];
  });
  meta.desc = $('.film-info-description').first().text().trim();
  meta.tags = meta.tags.filter(Boolean);
  meta.actors = meta.actors.filter(Boolean);
  return meta;
}

function coverOf($) {
  const style = $('#onphim-player').attr('style') || '';
  const m = style.match(/url\((['"]?)([^'")]+)\1\)/);
  if (m) return abs(m[2]);
  return abs($('.tray-item img').first().attr('src') || '');
}

function serversOf($) {
  const out = [];
  const seen = new Set();
  $('button[id="playerserver"]').each((i, el) => {
    const $b = $(el);
    const sid = String($b.attr('data-sid') || '1');
    const nid = String($b.attr('data-nid') || '1');
    const name = $b.text().trim() || `Server ${sid}-${nid}`;
    const key = `${sid}-${nid}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ sid, nid, name });
  });
  return out;
}

/* ------------------------------------------------------------------ *
 * 接口实现
 * ------------------------------------------------------------------ */

const detailCache = new Map();

async function loadDetail(url) {
  const hit = detailCache.get(url);
  if (hit && hit.exp > Date.now()) return hit.data;
  const res = await request(url, { referer: SITE + '/' });
  if (res.status >= 400) throw new Error(`HTTP ${res.status} ${url}`);
  const html = res.text;
  if (!html || html.length < 500) throw new Error('detail: empty body');
  const $ = load(html);
  const videoid = (html.match(/var\s+videoid\s*=\s*(\d+)/) || [])[1] || (url.match(/\/(\d+)\.html/) || [])[1] || '';
  const data = { $, html, videoid, realUrl: res.url };
  detailCache.set(url, { data, exp: Date.now() + 10 * 60 * 1000 });
  return data;
}

async function init() {
  return {
    class: [
      { type_id: 'home', type_name: '首页' },
      ...CATEGORIES.map((c) => ({ type_id: c.id, type_name: c.name })),
      { type_id: 'popular', type_name: '人気 / 热门' },
    ],
    filters: {},
  };
}

async function home() {
  const classes = [
    { type_id: 'home', type_name: '推荐' },
    { type_id: 'censored', type_name: 'モザあり / 有码' },
    { type_id: 'uncensored', type_name: '無修正 / 无码' },
    { type_id: 'engsub', type_name: 'Engsub / 英字' },
    { type_id: 'virtual', type_name: 'VR / 虚拟' },
  ];
  return { class: classes, list };
}

async function category(inReq) {
  const tid = String(inReq.body.tid || 'home');
  let page = parseInt(inReq.body.page, 10) || 1;
  if (page < 1) page = 1;
  if (tid === 'home') {
    const res = await home();
    return { ...res, page: 1, pagecount: 1, limit: PAGE_SIZE, total: res.list.length };
  }
  if (tid === 'popular') return fetchList('pop', '', page);
  const cate = CATEGORIES.find((c) => c.id === tid);
  if (!cate) return { page: 1, pagecount: 1, limit: PAGE_SIZE, total: 0, list: [] };
  return fetchList('cate', cate.id, page);
}

async function detail(inReq) {
  const url = abs(String(inReq.body.id || '').trim());
  if (!url) return { list: [] };
  const { $, html } = await loadDetail(url);
  const meta = detailMeta($);
  const name =
    $('h1.film-info-title').first().text().trim() ||
    ($('title').first().text() || '').replace(/\s*-\s*Javbar.*$/i, '').trim();
  const pic = coverOf($);
  const servers = serversOf($);
  const lines = servers.length ? servers : [{ sid: '1', nid: '1', name: '默认线路' }];

  const nameCount = {};
  for (const l of lines) nameCount[l.name] = (nameCount[l.name] || 0) + 1;
  const playUrls = lines
    .map((s) => {
      const label = nameCount[s.name] > 1 ? `${s.name} ${s.sid}-${s.nid}` : s.name;
      return `${label}$${url}?sid=${s.sid}&nid=${s.nid}`;
    })
    .join('#');

  const sec = (url.match(/\/videos\/([a-z]+)\//) || [])[1] || '';
  const typeName = (CATEGORIES.find((c) => c.id === sec) || {}).name || sec;
  return {
    list: [
      {
        vod_id: url,
        vod_name: name,
        vod_pic: pic,
        vod_actor: meta.actors.join(','),
        vod_area: meta.maker,
        vod_lang: '日语',
        vod_year: (meta.date || '').slice(0, 4),
        vod_remarks: meta.code,
        vod_content: [meta.code, meta.maker, meta.tags.join(' '), meta.desc].filter(Boolean).join(' | '),
        type_name: typeName,
        vod_play_from: 'JAVBAR',
        vod_play_url: playUrls,
      },
    ],
  };
}

async function getEmbed(pageUrl, videoid, sid, nid) {
  const res = await postForm(
    `${SITE}/api.php/post/urlget/`,
    `ids=${videoid}&flag=player&sid=${sid}&nid=${nid}`,
    pageUrl
  );
  let embed = '';
  try {
    const data = JSON.parse(res.text);
    embed = (String(data.player || '').match(/src=["']([^"']+)["']/) || [])[1] || '';
  } catch (e) {
    throw new Error('play: bad player response');
  }
  if (!embed) throw new Error('play: no embed src');
  return embed;
}

async function play(inReq) {
  const raw = String(inReq.body.id || '').trim();
  if (!raw) throw new Error('play: empty id');
  let sid = '1';
  let nid = '1';
  let pageUrl = raw;
  try {
    const u = new URL(raw);
    sid = u.searchParams.get('sid') || '1';
    nid = u.searchParams.get('nid') || '1';
    u.search = '';
    pageUrl = u.toString();
  } catch (e) {
    /* 直接给了详情页地址 */
  }

  const { $, videoid } = await loadDetail(pageUrl);
  if (!videoid) throw new Error('play: videoid not found');

  // 先试用户点的那一路，挂了就按顺序换下一条（有的线路被墙/撤档）
  const listed = serversOf($).map((s) => ({ sid: s.sid, nid: s.nid }));
  const order = [{ sid, nid }, ...listed.filter((s) => !(s.sid === sid && s.nid === nid))];

  let lastErr = null;
  for (const s of order.slice(0, 5)) {
    try {
      const embed = await getEmbed(pageUrl, videoid, s.sid, s.nid);
      const url = await resolveStream(embed);
      return {
        parse: 0,
        url,
        header: { 'User-Agent': UA, Referer: SITE + '/' },
      };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('play: no playable stream');
}

async function search(inReq) {
  const wd = String(inReq.body.wd || '').trim();
  let page = parseInt(inReq.body.page, 10) || 1;
  if (page < 1) page = 1;
  if (!wd) return { page: 1, pagecount: 1, limit: PAGE_SIZE, total: 0, list: [] };
  return fetchList('search', wd, page);
}

export default {
  meta: {
    key: 'javbar',
    name: '🌸Javbar',
    type: 3,
  },
  api: async (fastify) => {
    fastify.post('/init', init);
    fastify.post('/home', home);
    fastify.post('/category', category);
    fastify.post('/detail', detail);
    fastify.post('/play', play);
    fastify.post('/search', search);
  },
};
