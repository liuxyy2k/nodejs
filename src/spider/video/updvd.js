import { load } from 'cheerio';
import req from '../../util/req.js';

const SITE = 'https://updvd13.cc';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const PAGE_SIZE = 24;

const SORTS = [
  { n: '最新更新', v: 'post_date' },
  { n: '最多播放', v: 'video_viewed' },
  { n: '最高评分', v: 'rating' },
  { n: '时长最长', v: 'duration' },
  { n: '最多评论', v: 'most_commented' },
  { n: '最多收藏', v: 'most_favourited' },
];

// 分类对照（站点 /categories/ 页抓的，slug 全是哈希，别自己拼）
const CATEGORIES = [
  { id: 'baa523639e3de7dec0ab0af4d51cc847', name: '国产自拍' },
  { id: '585e256d07aaca27843375cba8ea8f3a', name: '日韩视频' },
  { id: '8eb230a33f43beed8b2a92db7422aa9f', name: '中文字幕' },
  { id: '796f5b559a65a24422af5dbe4d257610', name: '无码视频' },
  { id: 'd63214a23bbd7b6e34bf613959ec8718', name: '成人动漫' },
  { id: 'bb8113b763c49e71677fcfa0411070af', name: '萝莉少女' },
  { id: '0e1e4f28f9abe87c92543e3a4d0bb363', name: '网红少女' },
  { id: 'b6fff71c91f360045dd44bfc64369537', name: '福利姬' },
  { id: 'aab42d9841403c3d08afe50d44af5c38', name: '主播大秀' },
  { id: 'ee3caa78212c3f4b8e9febe65ae9f573', name: '传媒印象' },
  { id: 'e0dba03a3143b28c3a6a91dd6700f282', name: '91探花' },
  { id: 'be6f919781d94cb0c3f0e163442faca9', name: '三级伦理' },
  { id: '8ac7b65433fd3c609b2b00e6ed2f990f', name: '乱伦系列' },
  { id: 'c0ff9b33188425aaf8d4fc44dcb45b47', name: '网爆吃瓜' },
  { id: '52c8290de400403fbd828c3f63728085', name: '伪娘TS' },
  { id: 'e3829b92008f3eed412553838090784d', name: '重口味' },
  { id: 'ai', name: 'AI成人短剧' },
  { id: 'av', name: 'AV解说' },
  { id: 'av2', name: '欧美AV' },
];

const CLASSES = [
  { type_id: 'latest', type_name: '最新更新' },
  { type_id: 'popular', type_name: '最多播放' },
  { type_id: 'rated', type_name: '最高评分' },
  ...CATEGORIES.map((c) => ({ type_id: c.id, type_name: c.name })),
];

const FILTERS = {};
for (const c of CLASSES) {
  FILTERS[c.type_id] = [
    { key: 'sort_by', name: '排序', value: SORTS.map((s) => ({ n: s.n, v: s.v })) },
  ];
}

const playCache = new Map(); // 播放页地址 -> { m3u8, ts }

function abs(url) {
  if (!url) return '';
  const u = String(url).trim();
  if (!u || u.startsWith('data:')) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return SITE + (u.startsWith('/') ? u : '/' + u);
}

function pickFilters(input) {
  if (!input) return {};
  if (typeof input === 'string') {
    try {
      return JSON.parse(input) || {};
    } catch (e) {
      return {};
    }
  }
  return input;
}

function sortOf(filters) {
  const v = (filters && filters.sort_by) || '';
  return SORTS.some((s) => s.v === v) ? v : '';
}

async function getHtml(url, referer = '') {
  const headers = {
    'User-Agent': UA,
    Referer: referer || SITE + '/',
    'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': referer ? 'same-origin' : 'none',
    Connection: 'keep-alive',
  };
  let html = '';
  try {
    const r = await req.get(url, { headers, timeout: 20000 });
    html = typeof r === 'string' ? r : (r && (r.body || r.data || r.text)) || '';
  } catch (e) {
    const res = await fetch(url, { headers });
    if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status} @ ${url}`);
    html = await res.text();
  }
  if (!html) throw new Error(`空响应 @ ${url}`);
  if (/Just a moment|cf-challenge|challenge-platform|Enable JavaScript and cookies/i.test(html) && !/class="item/.test(html)) {
    throw new Error('被 Cloudflare 拦截了，往 cookie.json 塞一份 cf_clearance 再试');
  }
  return html;
}

function parseList($) {
  const list = [];
  const box = $('div.list-videos').first();
  const scope = box.length ? box : $.root();
  scope.find('div.item').each((_, el) => {
    const card = $(el);
    const a = card.find('a[href*="/video/"]').first();
    const href = a.attr('href') || '';
    if (!/\/video\/\d+/.test(href)) return;

    const title = (card.find('strong.title').first().text() || a.attr('title') || '')
      .replace(/\s+/g, ' ')
      .trim();
    const img = card.find('img').first();
    const pic = abs(img.attr('data-original') || img.attr('data-webp') || img.attr('src'));
    const duration = (card.find('div.duration').first().text() || '').trim();
    const views = (card.find('div.views').first().text() || '').trim();
    const rate = (card.find('div.rating').first().text() || '').replace(/\s+/g, ' ').trim();
    const hd = (card.find('span[class^="is-hd"]').first().text() || '').trim();

    const tags = [];
    if (duration) tags.push(duration);
    if (views) tags.push(`${views}次播放`);
    if (hd) tags.push(hd);

    list.push({
      vod_id: abs(href).split('?')[0],
      vod_name: title,
      vod_pic: pic,
      vod_remarks: tags.join(' · '),
      vod_year: '',
      vod_area: '',
      vod_lang: '日语',
      vod_score: rate.replace(/[^\d.]/g, '').slice(0, 4) || '',
    });
  });
  return list;
}

function pageTotal($) {
  const v = $('.pagination-goto').first().attr('data-page-total');
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function listUrl(typeId, page, sortBy) {
  const p = page > 1 ? `${page}/` : '';
  let url = '';
  if (!typeId || typeId === 'latest') url = `${SITE}/latest-updates/${p}`;
  else if (typeId === 'popular') url = `${SITE}/most-popular/${p}`;
  else if (typeId === 'rated') url = `${SITE}/top-rated/${p}`;
  else if (typeId.startsWith('tag:')) url = `${SITE}/tags/${typeId.slice(4)}/${p}`;
  else url = `${SITE}/categories/${typeId}/${p}`;
  if (sortBy) url += `?sort_by=${sortBy}`;
  return url;
}

function parsePlayer(html) {
  // 播放参数在 var t<hex> = { ... } 里，KVS 的 kt_player 初始化对象
  const m = html.match(/var\s+t[0-9a-f]+\s*=\s*\{/);
  if (!m) return null;
  const start = m.index + m[0].length - 1;
  let depth = 0;
  let end = -1;
  for (let i = start; i < html.length; i += 1) {
    const ch = html[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;
  const block = html.slice(start, end + 1);
  const pick = (key) => {
    const mm = block.match(new RegExp(`${key}\\s*:\\s*'((?:[^'\\\\]|\\\\.)*)'`));
    return mm ? mm[1].replace(/\\\//g, '/').replace(/\\'/g, "'") : '';
  };
  return {
    title: pick('video_title'),
    categories: pick('video_categories'),
    tags: pick('video_tags'),
    models: pick('video_models'),
    url: pick('video_url'),
    preview: pick('preview_url'),
  };
}

function splitList(s) {
  return String(s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

async function init() {
  return { class: CLASSES, filters: FILTERS };
}

async function home() {
  const html = await getHtml(`${SITE}/latest-updates/`);
  const $ = load(html);
  return {
    class: CLASSES,
    filters: FILTERS,
    list: parseList($),
  };
}

async function category(inReq) {
  const body = inReq.body || {};
  let page = parseInt(body.page, 10) || 1;
  if (page < 1) page = 1;
  const typeId = String(body.id || body.tid || body.type_id || 'latest');
  const filters = pickFilters(body.filters || body.ext);
  const sortBy = sortOf(filters);

  const url = listUrl(typeId, page, sortBy);
  let html;
  try {
    html = await getHtml(url);
  } catch (e) {
    // 某些分类的伪静态带排序会 404，退回不带排序的地址再试一次
    if (sortBy) {
      html = await getHtml(listUrl(typeId, page, ''));
    } else throw e;
  }
  const $ = load(html);
  const list = parseList($);
  const total = pageTotal($);
  const pagecount = total || (list.length >= PAGE_SIZE ? page + 1 : page);

  return {
    page,
    pagecount,
    limit: PAGE_SIZE,
    total: total ? total * PAGE_SIZE : list.length,
    list,
  };
}

async function detail(inReq) {
  const body = inReq.body || {};
  const ids = String(body.id || body.ids || body.vod_id || '');
  const idList = ids.split(',').map((s) => s.trim()).filter(Boolean);
  const list = [];

  for (const id of idList) {
    const url = abs(id);
    let html;
    try {
      html = await getHtml(url);
    } catch (e) {
      continue;
    }
    const $ = load(html);
    const player = parsePlayer(html);

    // 404 / 已删除的片：既没有播放器对象也没有播放器容器，直接跳过
    if (!player && !/id="kt_player"/.test(html)) continue;

    const name =
      (player && player.title) ||
      $('h1').first().text().replace(/\s+/g, ' ').trim() ||
      ($('meta[property="og:title"]').attr('content') || '').trim();
    if (!name || /^(Not Found|404)/i.test(name)) continue;

    const pic =
      ($('meta[property="og:image"]').attr('content') || '') ||
      (player && player.preview) ||
      '';

    let duration = '';
    let views = '';
    let pubdate = '';
    $('ul.toogle-headline li.headline-item').each((_, el) => {
      const li = $(el);
      const t = li.find('span.text').first().text().trim();
      const cls = li.find('i').attr('class') || '';
      if (!t) return;
      if (cls.includes('icon-playlist')) duration = t;
      else if (cls.includes('icon-visibility')) views = t;
      else if (cls.includes('icon-calendar')) pubdate = t;
    });

    // 分类 / 标签 / 女优：优先用播放器对象里的，最准
    let cats = splitList(player && player.categories);
    let tags = splitList(player && player.tags);
    let models = splitList(player && player.models);

    if (!cats.length) {
      $('.tags-video .tags-list a').each((_, el) => {
        const h = $(el).attr('href') || '';
        const t = $(el).text().replace(/\s+/g, ' ').trim();
        if (t && h.includes('/categories/') && !cats.includes(t)) cats.push(t);
        else if (t && h.includes('/tags/') && !tags.includes(t)) tags.push(t);
      });
    }

    const content = [
      cats.length ? `分类：${cats.join(' / ')}` : '',
      models.length ? `女优：${models.join(' / ')}` : '',
      tags.length ? `标签：${tags.join(' / ')}` : '',
      duration ? `时长：${duration}` : '',
      views ? `播放：${views}` : '',
      pubdate ? `发布：${pubdate}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    list.push({
      vod_id: url,
      vod_name: name,
      vod_pic: abs(pic),
      vod_remarks: duration ? `${duration}${views ? ` · ${views}` : ''}` : views,
      vod_year: '',
      vod_area: '',
      vod_lang: '日语',
      vod_actor: models.join(','),
      vod_director: '',
      vod_content: content,
      vod_play_from: 'UPDVD',
      // play() 现取，页面上源地址带 token，提前存会过期
      vod_play_url: `正片$${url}`,
    });
  }

  return { list };
}

async function resolvePlay(pageUrl) {
  const cached = playCache.get(pageUrl);
  if (cached && Date.now() - cached.ts < 20 * 60 * 1000) return cached;

  const html = await getHtml(pageUrl);
  const player = parsePlayer(html);
  const src = player && player.url;
  if (!src) throw new Error('播放页里没找到 video_url');

  // get_file 直链带 Referer 能 302 到 HLS，不带会被 403
  let target = '';
  try {
    const res = await fetch(src, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': UA, Referer: SITE + '/', Origin: SITE },
    });
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) target = loc;
  } catch (e) {
    target = '';
  }

  const item = { m3u8: target, src, ts: Date.now() };
  playCache.set(pageUrl, item);
  if (playCache.size > 300) playCache.delete(playCache.keys().next().value);
  return item;
}

async function play(inReq) {
  const id = String((inReq.body && (inReq.body.id || inReq.body.flag || inReq.body.url)) || '');
  const parts = id.split('?referer=');
  const pageUrl = abs(parts[0]);

  const header = {
    'User-Agent': UA,
    Referer: SITE + '/',
    Origin: SITE,
  };

  try {
    const r = await resolvePlay(pageUrl);
    // 解出 HLS 优先用（CDN 上的 m3u8/分片不要 Referer，最稳）；没解出来就回直链，客户端自己跟 302
    return { url: r.m3u8 || r.src, header };
  } catch (e) {
    throw new Error(`取源失败：${e.message}`);
  }
}

async function search(inReq) {
  const body = inReq.body || {};
  let page = parseInt(body.page, 10) || 1;
  if (page < 1) page = 1;
  const wd = String(body.wd || body.key || '').trim();
  if (!wd) return { page, pagecount: 0, limit: PAGE_SIZE, total: 0, list: [] };

  const p = page > 1 ? `${page}/` : '';
  const url = `${SITE}/search/${encodeURIComponent(wd)}/${p}`;
  const html = await getHtml(url, `${SITE}/`);
  const $ = load(html);
  const list = parseList($);
  const total = pageTotal($);
  const pagecount = total || (list.length >= PAGE_SIZE ? page + 1 : page);

  return {
    page,
    pagecount,
    limit: PAGE_SIZE,
    total: total ? total * PAGE_SIZE : list.length,
    list,
  };
}

export default {
  meta: {
    key: 'updvd',
    name: '💋UPDVD',
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
