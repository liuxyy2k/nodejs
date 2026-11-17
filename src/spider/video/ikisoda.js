import { load } from 'cheerio';
import req from '../../util/req.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SITE = 'https://ikisoda.com';
const LOCALE = '/zh';
const PAGE_SIZE = 30;

const VIDEOS_URL = `${SITE}${LOCALE}/videos/`;
const CATEGORIES_URL = `${SITE}${LOCALE}/categories/`;

// KVS 列表排序：?sort_by=post_date / custom1 / video_viewed / rating
const SORTS = [
  { n: '最近更新', v: 'post_date' },
  { n: '最新发行', v: 'custom1' },
  { n: '最多观看', v: 'video_viewed' },
  { n: '评分最高', v: 'rating' },
];

let classesCache = null;

function abs(url) {
  if (!url) return '';
  let u = String(url).trim().replace(/&amp;/g, '&');
  if (!u || u.startsWith('data:') || u.startsWith('javascript:')) return '';
  if (u.startsWith('//')) u = 'https:' + u;
  if (!/^https?:\/\//i.test(u)) u = SITE + (u.startsWith('/') ? u : '/' + u);
  return u;
}

// 详情/列表 id 统一去掉 query 和末尾多余的 /page 段
function normId(url) {
  const u = abs(url);
  if (!u) return '';
  return u.replace(/[?#].*$/, '');
}

async function fetchPage(url, referer = '') {
  const headers = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    Referer: referer || `${SITE}${LOCALE}/`,
    'Upgrade-Insecure-Requests': '1',
    Connection: 'keep-alive',
  };

  let data = '';
  try {
    const resp = await req.get(url, { headers });
    data = resp && resp.data != null ? resp.data : '';
  } catch (e) {
    // 越界页码站点直接 404，当空列表处理，别把整条列表打断
    const status = (e && e.response && e.response.status) || 0;
    if (status === 404) return '';
    throw e;
  }

  // Cloudflare 挑战页兜底：正常页一定有 is-item 卡片或 kt_player
  if (typeof data === 'string' &&
      !/is-item-link-video|kt_player|is-single-video|is-item item/.test(data) &&
      /Just a moment|Attention Required|cf-browser-verification|Enable JavaScript and cookies to continue/i.test(data)) {
    throw new Error(`[ikisoda] blocked by cloudflare: ${url}`);
  }

  return typeof data === 'string' ? data : '';
}

// 列表卡片：a.is-item-link-video > .is-item-title
function parseList($) {
  const list = [];
  const seen = new Set();

  $('a.is-item-link-video').each((_, el) => {
    const $a = $(el);
    const id = normId($a.attr('href') || '');
    if (!id || seen.has(id)) return;
    if (!/\/videos\//.test(id)) return;

    const $img = $a.find('img.is-thumbnail').first();
    let pic = ($img.attr('data-original') || $img.attr('data-webp') || $img.attr('src') || '').trim();
    if (/^data:/i.test(pic)) pic = '';
    pic = abs(pic);

    const name = (
      $a.find('.is-item-title').first().text() ||
      $img.attr('alt') ||
      ''
    ).replace(/\s+/g, ' ').trim();

    const duration = $a.find('.is-item-duration').first().text().replace(/\s+/g, ' ').trim();

    seen.add(id);
    list.push({
      vod_id: id,
      vod_name: name.slice(0, 200),
      vod_pic: pic,
      vod_remarks: duration,
    });
  });

  return list;
}

// 分页：优先读最后一页链接，其次读 ajax 分页参数，最后靠 next 判断
function readPaging($, page) {
  const href = ($('.is-pagination li.last a').first().attr('href') || '').replace(/\s+/g, '');
  const m = href.match(/\/(\d+)\/(?:\?|$)/) || href.match(/\/(\d+)\?/);
  if (m) {
    const last = parseInt(m[1], 10);
    if (last > 0) return Math.max(last, page);
  }

  let maxFrom = 0;
  $('.is-pagination a[data-parameters]').each((_, el) => {
    const p = $(el).attr('data-parameters') || '';
    const mm = p.match(/from_[a-z_]+:\s*(\d+)/);
    if (mm) {
      const n = parseInt(mm[1], 10);
      if (n > maxFrom) maxFrom = n;
    }
  });
  if (maxFrom > 0) return Math.max(maxFrom, page);

  const hasNext = $('.is-pagination li.next a, .pagination-holder li.next a').length > 0;
  return hasNext ? page + 1 : page;
}

// 列表页 URL：base（/zh/videos/ 或 /zh/categories/xx/） + 页码 + 排序
function buildListUrl(base, page, sortBy) {
  const root = normId(base);
  const bare = root.endsWith('/') ? root : root.replace(/(\d+)$/, '');
  const withSlash = bare.endsWith('/') ? bare : bare + '/';
  const pagePart = page > 1 ? `${page}/` : '';
  return `${withSlash}${pagePart}?videos_per_page=${PAGE_SIZE}&sort_by=${sortBy}`;
}

// 播放器配置 var tdeXXXX = { video_url: '...', ... }
function readFlashvars(html) {
  const i = html.search(/var\s+[A-Za-z0-9_]+\s*=\s*\{\s*[\s\S]{0,200}?video_id:/);
  if (i < 0) return {};
  const seg = html.slice(i, i + 20000);

  const get = (key) => {
    const m = seg.match(new RegExp(`${key}\\s*:\\s*'((?:[^'\\\\]|\\\\.)*)'`));
    return m ? m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\') : '';
  };

  const streams = [];
  const slot = (urlKey, textKey, hdKey) => {
    const url = get(urlKey);
    if (!url) return;
    let label = get(textKey) || '';
    if (!label) {
      const q = url.match(/_(\d+)p?\.mp4/i);
      label = q ? `${q[1]}p` : '';
    }
    if (hdKey && get(hdKey) === '1') label = label || 'HD';
    streams.push({ name: label || '默认', url });
  };

  slot('video_url', 'video_url_text', '');
  slot('video_alt_url', 'video_alt_url_text', '');
  slot('video_alt_url2', 'video_alt_url2_text', 'video_alt_url2_hd');
  slot('video_alt_url3', 'video_alt_url3_text', 'video_alt_url3_hd');

  return {
    videoId: get('video_id'),
    title: get('video_title'),
    categories: get('video_categories'),
    tags: get('video_tags'),
    models: get('video_models'),
    streams,
  };
}

function secToClock(text) {
  const m = String(text).match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return '';
  const h = parseInt(m[1] || 0, 10);
  const mi = parseInt(m[2] || 0, 10);
  const s = parseInt(m[3] || 0, 10);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(mi)}:${pad(s)}` : `${mi}:${pad(s)}`;
}

async function init() {
  return {};
}

async function collectClasses() {
  if (classesCache) return classesCache;

  const classes = [{ type_id: VIDEOS_URL, type_name: '全部视频' }];
  const seen = new Set([VIDEOS_URL]);

  try {
    const html = await fetchPage(`${CATEGORIES_URL}?items_per_page=120&sort_by=total_videos`, `${SITE}${LOCALE}/`);
    const $ = load(html);
    $('a[href*="/categories/"]').each((_, el) => {
      const $a = $(el);
      const id = normId($a.attr('href') || '');
      if (!id || seen.has(id)) return;
      if (!/\/categories\/[^/]+\/$/.test(id)) return;
      const name = $a.text().replace(/\s+/g, ' ').trim();
      if (!name || name.length > 24) return;
      seen.add(id);
      classes.push({ type_id: id, type_name: name });
    });
  } catch {
    // 分类抓不到就只给「全部视频」，不影响主流程
  }

  classesCache = classes;
  return classes;
}

async function home(inReq) {
  const classes = await collectClasses();

  const sortFilter = {
    key: 'sort_by',
    name: '排序',
    init: 'post_date',
    value: [...SORTS],
  };

  const filters = {};
  for (const c of classes) filters[c.type_id] = [sortFilter];

  return { class: classes, filters };
}

async function category(inReq) {
  const raw = String((inReq.body && inReq.body.id) || '');
  const page = Math.max(1, parseInt(inReq.body && inReq.body.page, 10) || 1);
  const f = (inReq.body && inReq.body.filters) || {};
  const sortBy = SORTS.some((s) => s.v === f.sort_by) ? f.sort_by : 'post_date';

  const base = normId(raw) || VIDEOS_URL;
  const url = buildListUrl(base, page, sortBy);

  const html = await fetchPage(url, `${SITE}${LOCALE}/`);
  const $ = load(html);
  const list = parseList($);
  const pagecount = list.length === 0 ? page : readPaging($, page);

  return { page, pagecount, list };
}

async function detail(inReq) {
  const id = normId(inReq.body && inReq.body.id);
  if (!id) throw new Error('[ikisoda] bad detail id');

  const html = await fetchPage(id, `${SITE}${LOCALE}/`);
  const $ = load(html);
  const fv = readFlashvars(html);

  let name = $('.is-video-title').first().text().replace(/\s+/g, ' ').trim();
  if (!name) name = $('.is-video-title-desktop').first().text().replace(/\s+/g, ' ').trim();
  if (!name) name = fv.title;
  if (!name) name = $('h1').first().text().replace(/\s+/g, ' ').trim();

  let pic = $('meta[property="og:image"]').attr('content') || '';
  if (!pic) pic = $('.is-single-video-content-image img').first().attr('src') || '';
  pic = abs(pic);

  const actors = [];
  $('a.link.model, a[href*="/models/"]').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').replace(/[,、\s]+$/, '').trim();
    if (t && !actors.includes(t)) actors.push(t);
  });

  const cats = [];
  const tags = [];
  $('.is-categories').each((_, el) => {
    const $b = $(el);
    const title = $b.find('.title').first().text().replace(/[:：\s]/g, '');
    const box = /标签/.test(title) ? tags : (/类别|分類|分类/.test(title) ? cats : null);
    if (!box) return;
    $b.find('a').each((__, a) => {
      const t = $(a).text().replace(/\s+/g, ' ').trim().replace(/,$/, '');
      if (t && !box.includes(t)) box.push(t);
    });
  });

  if (tags.length === 0 && fv.tags) {
    for (const t of fv.tags.split(',')) {
      const v = t.trim();
      if (v && !tags.includes(v)) tags.push(v);
    }
  }
  if (cats.length === 0 && fv.categories) {
    for (const t of fv.categories.split(',')) {
      const v = t.trim();
      if (v && !cats.includes(v)) cats.push(v);
    }
  }
  if (actors.length === 0 && fv.models) {
    for (const t of fv.models.split(',')) {
      const v = t.trim();
      if (v && !actors.includes(v)) actors.push(v);
    }
  }

  // 时长 / 发布日期从 JSON-LD 里取
  const iso = (html.match(/"duration"\s*:\s*"([^"]+)"/) || [])[1] || '';
  const duration = secToClock(iso);
  const upload = (html.match(/"uploadDate"\s*:\s*"(\d{4})/) || [])[1] || '';

  const views = $('.is-video-views span').first().text().replace(/[^\d.KM]/gi, '').trim();

  const remarks = [duration, views ? `${views} 浏览` : ''].filter(Boolean).join(' · ');

  // 播放列表：按清晰度从高到低排
  const rank = (n) => {
    const m = String(n).match(/(\d{3,4})p/i);
    return m ? parseInt(m[1], 10) : 0;
  };
  const streams = fv.streams.slice().sort((a, b) => rank(b.name) - rank(a.name));

  const playUrl = streams.map((s) => `${s.name}$${s.url}`).join('#');

  const content = [
    cats.length ? `类别：${cats.join(', ')}` : '',
    tags.length ? `标签：${tags.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  return {
    list: [{
      vod_id: id,
      vod_name: name,
      vod_pic: pic,
      vod_actor: actors.join(','),
      vod_area: '日本',
      vod_lang: '日语',
      vod_year: upload,
      vod_remarks: remarks,
      vod_content: content,
      vod_play_from: 'IKISODA',
      vod_play_url: playUrl,
    }],
  };
}

async function play(inReq) {
  const url = abs(inReq.body && inReq.body.id);
  if (!url) throw new Error('[ikisoda] bad play id');

  return {
    url,
    header: {
      'User-Agent': UA,
      Referer: `${SITE}${LOCALE}/`,
      Origin: SITE,
    },
  };
}

async function search(inReq) {
  const wd = String((inReq.body && inReq.body.wd) || '').trim();
  if (!wd) return { page: 1, pagecount: 1, list: [] };

  const page = Math.max(1, parseInt(inReq.body && inReq.body.page, 10) || 1);
  const f = (inReq.body && inReq.body.filters) || {};
  const sortBy = SORTS.some((s) => s.v === f.sort_by) ? f.sort_by : '';

  // 这站搜索翻页走 from_videos=<页码>，不是路径页码
  const params = new URLSearchParams();
  params.set('q', wd);
  if (sortBy) params.set('sort_by', sortBy);
  if (page > 1) params.set('from_videos', String(page));

  const url = `${SITE}${LOCALE}/search/?${params.toString()}`;

  const html = await fetchPage(url, `${SITE}${LOCALE}/`);
  const $ = load(html);
  const list = parseList($);
  const pagecount = list.length === 0 ? page : readPaging($, page);

  return { page, pagecount, list };
}

export default {
  meta: {
    key: 'ikisoda',
    name: '🌸Ikisoda',
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
