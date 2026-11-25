import { load } from 'cheerio';
import http from 'node:http';
import https from 'node:https';

// 站点域名（镜像域常换，这里放主备两个，第一个挂了自动切第二个）
const DOMAINS = ['https://91sp-2026114.28g906.xyz', 'https://91sp.28g906.xyz'];
let activeBase = 0;
const base = () => DOMAINS[activeBase];
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PAGE_SIZE = 40;
const TIMEOUT = 20000;
const PLAY_TTL = 5 * 60 * 1000;

// 分类（站点导航里一共这 24 个，rmdg / zjjq / zsmw 目前站方内容为空）
const CATEGORIES = [
  { id: 'gczp', name: '国产自拍' },
  { id: 'gccm', name: '国产传媒' },
  { id: '91yc', name: '91原创' },
  { id: 'hjll', name: '海角乱伦' },
  { id: 'whhl', name: '网红黑料' },
  { id: 'rmdg', name: '热门大瓜' },
  { id: 'fcb', name: '反差婊' },
  { id: 'tqhq', name: '偷情换妻' },
  { id: 'thjx', name: '按摩探花' },
  { id: 'zsmw', name: '真实迷玩' },
  { id: 'zjjq', name: '醉酒剧情' },
  { id: 'gtsj', name: '经典三级' },
  { id: 'kbtj', name: '捆绑调教' },
  { id: 'awlq', name: '暗网猎奇' },
  { id: 'jdjk', name: '酒店监控' },
  { id: 'zscp', name: '真实厕拍' },
  { id: 'jtcd', name: '街头抄底' },
  { id: 'gyds', name: '街头搭讪' },
  { id: 'aihl', name: 'AI换脸' },
  { id: 'AImj', name: 'AI漫剧' },
  { id: 'aicrdj', name: 'AI成人短剧' },
  { id: 'rbav', name: '日本AV' },
  { id: 'fklw', name: '疯狂老外' },
  { id: 'hdm', name: 'H动漫' },
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
      'Accept-Language': 'zh-CN,zh;q=0.9',
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

/* ------------------------------------------------------------------ *
 * 反混淆：整页被包成 hex，脚本里 document.write(unescape(x(hex,'%')))
 * 这里不跑站方脚本，直接 hex -> utf8
 * ------------------------------------------------------------------ */

function unwrap(html) {
  let out = String(html || '');
  for (let layer = 0; layer < 3; layer++) {
    const m = out.match(/<script[^>]*data-xsg-obfuscation[^>]*>([\s\S]*?)<\/script>/i);
    if (!m) break;
    const hex = (m[1].match(/"([0-9a-fA-F]{200,})"/) || [])[1];
    if (!hex || hex.length % 2) break;
    let dec;
    try {
      dec = Buffer.from(hex, 'hex').toString('utf8');
    } catch (e) {
      break;
    }
    if (!/<(?:!doctype|html|body|meta)/i.test(dec)) break;
    out = dec;
  }
  return out;
}

function challenge(html) {
  return (
    /<title>\s*Just a moment/i.test(html) ||
    /cf-browser-verification|cf_chl_opt|Checking your browser before accessing/i.test(html)
  );
}

async function getHtml(url, referer = '') {
  const res = await request(url, { referer });
  if (res.status >= 400) throw new Error(`HTTP ${res.status} ${url}`);
  const raw = res.text;
  if (!raw || raw.length < 300) throw new Error(`empty body ${url}`);
  if (challenge(raw)) throw new Error(`cloudflare challenge: ${url}`);
  const html = unwrap(raw);
  if (!html || html.length < 200) throw new Error(`unwrap failed ${url}`);
  return html;
}

function abs(url) {
  if (!url) return '';
  const u = String(url).trim();
  if (!u || u.startsWith('data:')) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return base() + (u.startsWith('/') ? u : '/' + u);
}

// 按路径取页，主域失败自动换备用域
async function fetchPath(path, refererPath = '/') {
  let lastErr = null;
  for (let i = 0; i < DOMAINS.length; i++) {
    const idx = (activeBase + i) % DOMAINS.length;
    const b = DOMAINS[idx];
    try {
      const html = await getHtml(b + path, b + refererPath);
      activeBase = idx;
      return { html, b };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('fetch failed');
}

/* ------------------------------------------------------------------ *
 * 列表
 * ------------------------------------------------------------------ */

function pushCard(list, seen, $el, href, $) {
  const id = (String(href).match(/\/videos\/(\d+)/) || [])[1] || '';
  if (!id || seen.has(id)) return;
  seen.add(id);
  const img = $el.find('img').first();
  const name = ($el.find('h3').first().text() || $el.find('.title').first().text() || img.attr('alt') || '').trim();
  const duration = ($el.find('i.duration, .duration').first().text() || '').trim();
  const tagTexts = [];
  $el.find('.card-tags a, .tags a').each((j, e) => {
    const t = $(e).text().trim();
    if (t) tagTexts.push(t);
  });
  list.push({
    vod_id: id,
    vod_name: name || '(无标题)',
    vod_pic: abs(img.attr('src') || img.attr('data-src') || img.attr('data-original') || img.attr('data-lazy-src') || ''),
    vod_remarks: duration,
    vod_content: tagTexts.slice(0, 8).join(' '),
  });
}

function parseList($) {
  const list = [];
  const seen = new Set();
  $('article.card').each((i, el) => {
    const $el = $(el);
    const href =
      $el.find('a.card-poster-link').attr('href') || $el.find('a.card-title-link').attr('href') || '';
    pushCard(list, seen, $el, href, $);
  });
  if (!list.length) {
    $('a[href*="/videos/"]').each((i, el) => {
      const $a = $(el);
      const href = $a.attr('href') || '';
      if (!/\/videos\/\d+/.test(href)) return;
      const $ctx = $a.closest('article.card, .card, li, article');
      pushCard(list, seen, $ctx.length ? $ctx : $a.parent(), href, $);
    });
  }
  return list;
}

function hasNext($) {
  let found = false;
  $('div.pager a').each((i, el) => {
    if (/下一页/.test($(el).text())) found = true;
  });
  return found;
}

function listPath(kind, key, page) {
  const p = page > 1 ? `page=${page}` : '';
  if (kind === 'home') return p ? `/?${p}` : '/';
  if (kind === 'sort') return `/videos/sort/${key}${p ? '?' + p : ''}`;
  if (kind === 'cate') return `/videos/category/${key}${p ? '?' + p : ''}`;
  if (kind === 'tag') return `/videos/tag/${encodeURIComponent(key)}${p ? '?' + p : ''}`;
  const q = `q=${encodeURIComponent(key)}`;
  return `/videos/search?${q}${p ? '&' + p : ''}`;
}

async function fetchList(kind, key, page) {
  const { html } = await fetchPath(listPath(kind, key, page), '/');
  const $ = load(html);
  const list = parseList($);
  let pagecount;
  if (list.length === 0 && page > 1) pagecount = page - 1;
  else pagecount = hasNext($) ? page + 1 : page;
  return { page, pagecount, limit: PAGE_SIZE, total: 0, list };
}

/* ------------------------------------------------------------------ *
 * 详情
 * ------------------------------------------------------------------ */

const detailCache = new Map();

function videoIdOf(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  // 完整地址优先按路径取，避免把镜像域里的日期/数字当成 id
  const byPath = s.match(/\/(?:videos|player)\/(\d+)/);
  if (byPath) return byPath[1];
  if (/^\d+$/.test(s)) return s;
  const tail = s.match(/(\d{2,})\s*$/);
  return tail ? tail[1] : '';
}

async function loadDetail(id) {
  const hit = detailCache.get(id);
  if (hit && hit.exp > Date.now()) return hit.data;
  const { html } = await fetchPath(`/videos/${id}`, '/');
  const $ = load(html);
  const data = { $, html, id };
  detailCache.set(id, { data, exp: Date.now() + 10 * 60 * 1000 });
  return data;
}

function detailFields($) {
  const name =
    $('h1').first().text().trim() ||
    ($('meta[itemprop="name"]').attr('content') || '').trim() ||
    ($('title').first().text() || '').split(' - ')[0].trim();

  const pic =
    ($('link[itemprop="thumbnailUrl"]').attr('href') || '').trim() ||
    ($('link[itemprop="contentUrl"]').attr('href') || '').trim() ||
    ($('meta[property="og:image"]').attr('content') || '').trim();

  const metaTexts = $('.video-meta span')
    .map((i, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
  let date = '';
  let views = '';
  for (const t of metaTexts) {
    const d = t.match(/(\d{4})年(\d{2})月(\d{2})日/);
    if (d) date = `${d[1]}-${d[2]}-${d[3]}`;
    else if (/[\d,]{3,}/.test(t) && !views) views = (t.match(/[\d,]+/) || [])[0];
  }

  const tags = $('.detail-tags a')
    .map((i, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
  const author = $('.video-author b').first().text().trim();
  const desc = $('p.video-description').first().text().trim();

  let cateSlug = '';
  let cateName = '';
  const $bc = $('.breadcrumbs a[href*="/videos/category/"]').first();
  if ($bc.length) {
    cateSlug = ($bc.attr('href').match(/\/videos\/category\/([^/?#]+)/) || [])[1] || '';
    cateName = ($bc.text().trim().split(' - ')[0] || '').trim();
  }

  return { name, pic, date, views, tags, author, desc, cateSlug, cateName };
}

const TYPE_NAME = new Map(CATEGORIES.map((c) => [c.id, c.name]));

function homeClasses() {
  return [
    { type_id: 'home', type_name: '推荐' },
    { type_id: 'latest', type_name: '最新更新' },
    { type_id: 'monthly', type_name: '本月最热' },
    ...CATEGORIES.map((c) => ({ type_id: c.id, type_name: c.name })),
  ];
}

function resolveCateId(tid) {
  if (TYPE_NAME.has(tid)) return tid;
  const lower = String(tid).toLowerCase();
  for (const c of CATEGORIES) {
    if (c.id.toLowerCase() === lower) return c.id;
  }
  return '';
}

/* ------------------------------------------------------------------ *
 * 播放：iframe 页 /player/{id} 里的 resolve 接口吐 HLS 清单地址
 * ------------------------------------------------------------------ */

const playCache = new Map();

async function resolvePlay(id) {
  const hit = playCache.get(id);
  if (hit && hit.exp > Date.now()) return hit.url;
  let lastErr = null;
  for (let i = 0; i < DOMAINS.length; i++) {
    const idx = (activeBase + i) % DOMAINS.length;
    const b = DOMAINS[idx];
    const url = `${b}/player/${id}/resolve`;
    try {
      const res = await request(url, {
        referer: `${b}/player/${id}`,
        headers: { Accept: 'application/json, text/plain, */*' },
      });
      if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
      const data = JSON.parse(res.text);
      if (!data || !data.ok || !data.url) throw new Error('resolve rejected');
      const playUrl = data.url;
      activeBase = idx;
      playCache.set(id, { url: playUrl, exp: Date.now() + PLAY_TTL });
      return playUrl;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('play: resolve failed');
}

/* ------------------------------------------------------------------ *
 * 接口实现
 * ------------------------------------------------------------------ */

async function init() {
  return {
    class: [
      { type_id: 'home', type_name: '首页' },
      { type_id: 'latest', type_name: '最新更新' },
      { type_id: 'monthly', type_name: '本月最热' },
      ...CATEGORIES.map((c) => ({ type_id: c.id, type_name: c.name })),
    ],
    filters: {},
  };
}

async function home() {
  const classes = homeClasses();
  try {
    const data = await fetchList('home', '', 1);
    return { class: classes, filters: {}, list: data.list, page: 1, pagecount: data.pagecount, limit: PAGE_SIZE, total: 0 };
  } catch {
    return { class: classes, filters: {}, list: [] };
  }
}

async function category(inReq) {
  const body = inReq.body || {};
  const tid = String(body.id ?? body.tid ?? body.type_id ?? 'home').trim();
  let page = parseInt(body.page ?? body.pg, 10) || 1;
  if (page < 1) page = 1;
  if (tid === 'home') return fetchList('home', '', page);
  if (tid === 'latest') return fetchList('sort', 'renew', page);
  if (tid === 'monthly') return fetchList('sort', 'month_hot', page);
  if (tid.startsWith('tag:')) return fetchList('tag', tid.slice(4), page);
  if (tid.startsWith('search:')) return fetchList('search', tid.slice(7), page);
  const cateId = resolveCateId(tid);
  if (!cateId) {
    return { page, pagecount: page, limit: PAGE_SIZE, total: 0, list: [] };
  }
  return fetchList('cate', cateId, page);
}

async function detail(inReq) {
  const id = videoIdOf(inReq.body.id);
  if (!id) return { list: [] };
  const { $ } = await loadDetail(id);
  const f = detailFields($);
  const typeName = f.cateName || TYPE_NAME.get(f.cateSlug) || '';

  const lines = [`HLS$${id}`];
  return {
    list: [
      {
        vod_id: id,
        vod_name: f.name || '(无标题)',
        vod_pic: f.pic,
        vod_actor: f.author,
        vod_year: (f.date || '').slice(0, 4),
        vod_remarks: [f.date, f.views ? `${f.views} 次播放` : ''].filter(Boolean).join(' · '),
        vod_content: [f.desc, f.tags.length ? `标签:${f.tags.join(',')}` : ''].filter(Boolean).join(' | '),
        type_name: typeName,
        vod_play_from: '91SP',
        vod_play_url: lines.join('#'),
      },
    ],
  };
}

async function play(inReq) {
  const raw = String(inReq.body.id || '').trim();
  if (!raw) throw new Error('play: empty id');
  const id = videoIdOf(raw);
  if (!id) throw new Error('play: bad id');
  const url = await resolvePlay(id);
  return {
    parse: 0,
    url,
    header: { 'User-Agent': UA, Referer: `${new URL(url).origin}/player/${id}` },
  };
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
    key: '91sp',
    name: '🎞️兰狐AV·91SP',
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

export { unwrap, parseList, videoIdOf };
