import { load } from 'cheerio';
import req from '../../util/req.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SITE = 'https://www.18porny.tv';
const PAGE_SIZE = 24;

// 列表页排序：?by=time / hits / score
const SORTS = [
  { n: '最新发布', v: 'time' },
  { n: '最多观看', v: 'hits' },
  { n: '评分最高', v: 'score' },
];

// 固定分类（首页导航里的九个主分类，slug 就是站点 /vod/type/id/<slug>.html 里那一段）
const BASE_CLASSES = [
  { slug: 'guochan', name: '国产专区' },
  { slug: 'rihan', name: '日韩专区' },
  { slug: 'oumeihaiwai', name: '欧美海外' },
  { slug: 'dongman', name: '动漫专区' },
  { slug: 'ai', name: 'AI专区' },
  { slug: 'zhuboxiezhen', name: '主播写真' },
  { slug: 'juqinglunli', name: '剧情伦理' },
  { slug: 'renwupianhao', name: '人物偏好' },
  { slug: 'teseticai', name: '特色题材' },
];

const TOPIC_URL = `${SITE}/topic/index.html`;

let navCache = null;

function abs(url) {
  if (!url) return '';
  let u = String(url).trim();
  if (!u || u.startsWith('data:') || u.startsWith('javascript:')) return '';
  u = u.replace(/&amp;/g, '&');
  if (u.startsWith('//')) u = 'https:' + u;
  if (/^https?:\/\//i.test(u)) return u;
  return SITE + (u.startsWith('/') ? u : '/' + u);
}

// 卡片/详情链接统一去掉 ?library=xxx 这类纯前端标记，方便当 id 用
function normId(url) {
  const u = abs(url);
  if (!u) return '';
  return u.replace(/[?#].*$/, '');
}

function decodeJsonText(s) {
  return String(s).replace(/\\\//g, '/');
}

async function fetchPage(url, referer = '') {
  const headers = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-TW,zh;q=0.9,zh-CN;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    Referer: referer || `${SITE}/index/home.html`,
    'Upgrade-Insecure-Requests': '1',
    Connection: 'keep-alive',
  };

  const resp = await req.get(url, { headers });
  const data = resp && resp.data != null ? resp.data : '';

  if (typeof data === 'string' && !/ys2-card|ys2-series|player_aaaa/.test(data) &&
      /Just a moment|Attention Required|cf-browser-verification|Enable JavaScript and cookies to continue/i.test(data)) {
    throw new Error(`[18porny] blocked: ${url}`);
  }

  return typeof data === 'string' ? data : '';
}

// 列表页解析：普通影片卡 .ys2-card + 剧集卡 .ys2-series-card 一起收
function parseList($) {
  const list = [];
  const seen = new Set();

  $('article.ys2-card, article.ys2-series-card').each((_, el) => {
    const $el = $(el);
    const $link = $el.find('a.ys2-card-media, a.ys2-series-media').first();
    const href = $link.attr('href') ||
      $el.find('a[href*="/vod/detail/id/"], a[href*="/vod/play/id/"]').first().attr('href') ||
      '';
    const id = normId(href);
    if (!id) return;
    if (seen.has(id)) return;
    seen.add(id);

    const $img = $el.find('img').first();
    let pic = ($img.attr('data-src') || $img.attr('src') || '').trim();
    if (/asset\/img\/load\.gif/i.test(pic)) pic = '';
    pic = abs(pic.replace(/#.*$/, ''));

    const name = (
      $link.attr('title') ||
      $el.find('h3 a').first().text() ||
      $img.attr('alt') ||
      ''
    ).replace(/\s+/g, ' ').trim();

    let remarks = $el.find('.ys2-card-badge, .ys2-series-episodes').first().text()
      .replace(/\s+/g, ' ').trim();
    if (!remarks) {
      remarks = $el.find('.ys2-series-update').first().text().replace(/\s+/g, ' ').trim();
    }

    list.push({
      vod_id: id,
      vod_name: name.slice(0, 200),
      vod_pic: pic,
      vod_remarks: remarks,
    });
  });

  return list;
}

// 播放页里 <script>var player_aaaa={...}</script> 的原始配置
function readPlayer(html) {
  const m = html.match(/var\s+player_aaaa\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    try {
      return JSON.parse(decodeJsonText(m[1]));
    } catch {
      return null;
    }
  }
}

function pageTotal($) {
  const raw = $('.ys2-pagination').attr('data-page-total');
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function metaMap($) {
  const map = {};
  $('.ys2-vod-metadata div').each((_, el) => {
    const $el = $(el);
    const k = $el.find('dt').first().text().replace(/\s+/g, '').trim();
    const v = $el.find('dd').first().text().replace(/\s+/g, ' ').trim();
    if (k && v && !/暫無|暂无/.test(v)) map[k] = v;
  });
  return map;
}

function tagsOf($) {
  const tags = [];
  $('.ys2-detail-tags a').each((_, el) => {
    const t = $(el).text().replace(/^#\s*/, '').replace(/\s+/g, ' ').trim();
    if (t && !tags.includes(t)) tags.push(t);
  });
  return tags;
}

function episodesOf($) {
  const eps = [];
  const seen = new Set();
  $('.ys2-series-episode-list a, .ys-episodes a, [data-ys-episode-list] a, .ys2-episode-list a').each((_, el) => {
    const $a = $(el);
    const href = $a.attr('href') || '';
    if (!/\/vod\/play\//.test(href)) return;
    const url = normId(href);
    if (!url || seen.has(url)) return;
    seen.add(url);
    const nid = (href.match(/\/nid\/(\d+)/) || [])[1];
    let label = (
      $a.find('strong').first().text() ||
      $a.text() ||
      ''
    ).replace(/\s+/g, ' ').trim();
    if (nid) label = `第${String(nid).padStart(2, '0')}集`;
    if (!label) label = `第${eps.length + 1}集`;
    eps.push({ name: label, url });
  });
  return eps;
}

async function init() {
  return {};
}

async function home(inReq) {
  const classes = [];
  const seen = new Set();

  const push = (typeId, name) => {
    const id = abs(typeId);
    if (!id || seen.has(id)) return;
    if (!name) return;
    seen.add(id);
    classes.push({ type_id: id, type_name: String(name).slice(0, 20) });
  };

  push(TOPIC_URL, '剧集库');

  for (const c of BASE_CLASSES) {
    push(`${SITE}/vod/type/id/${c.slug}.html`, c.name);
  }

  // 首页导航里如果多出新分类，顺手补上
  try {
    const html = await fetchPage(`${SITE}/index/home.html`, `${SITE}/`);
    const $ = load(html);
    $('a[href*="/vod/type/id/"]').each((_, el) => {
      const $a = $(el);
      const href = $a.attr('href') || '';
      const m = href.match(/\/vod\/type\/id\/([a-zA-Z][a-zA-Z0-9_-]*)\.html/);
      if (!m) return;
      if (seen.has(abs(href).replace(/[?#].*$/, ''))) return;
      const name = $a.text().replace(/\s+/g, ' ').trim();
      if (!name || name.length > 12) return;
      push(`${SITE}/vod/type/id/${m[1]}.html`, name);
    });
  } catch {
    // 导航抓不到不影响内置分类
  }

  const sortFilter = {
    key: 'by',
    name: '排序',
    init: 'time',
    value: [...SORTS],
  };

  const filters = {};
  for (const c of classes) {
    filters[c.type_id] = [sortFilter];
  }

  return { class: classes, filters };
}

async function category(inReq) {
  const raw = String((inReq.body && inReq.body.id) || '');
  const page = Math.max(1, parseInt(inReq.body && inReq.body.page, 10) || 1);
  const f = (inReq.body && inReq.body.filters) || {};
  const by = SORTS.some((s) => s.v === f.by) ? f.by : 'time';

  let url = '';
  const referer = abs(raw);

  if (/\/topic\/index\.html/.test(raw)) {
    url = page <= 1
      ? `${TOPIC_URL}?by=${by}`
      : `${TOPIC_URL}?by=${by}&page=${page}`;
  } else {
    const m = raw.match(/\/vod\/type\/id\/([a-zA-Z0-9_-]+?)(?:\.html|\/?$)/);
    const slug = m ? m[1] : String(raw).replace(/[?#].*$/, '').split('/').filter(Boolean).pop();
    if (!slug) throw new Error('[18porny] bad category id');
    url = page <= 1
      ? `${SITE}/vod/type/id/${slug}.html?by=${by}`
      : `${SITE}/vod/show/id/${slug}/page/${page}.html?by=${by}`;
  }

  const html = await fetchPage(url, referer);
  const $ = load(html);
  const list = parseList($);
  const total = pageTotal($);

  let pagecount = page;
  if (list.length > 0) {
    pagecount = total ? total : (list.length >= PAGE_SIZE ? page + 1 : page);
  }

  return { page, pagecount, list };
}

async function detail(inReq) {
  const id = normId(inReq.body && inReq.body.id);
  if (!id) throw new Error('[18porny] bad detail id');

  const html = await fetchPage(id, `${SITE}/`);
  const $ = load(html);
  const cfg = readPlayer(html);

  const title = $('title').first().text().replace(/\s+/g, ' ').trim();
  const isPlayPage = !!cfg || /正在播放/.test(title);

  let name = (cfg && cfg.vod_data && cfg.vod_data.vod_name) ? String(cfg.vod_data.vod_name) : '';
  if (!name) {
    name = $('h1').first().text().replace(/\s+/g, ' ').trim();
  }
  if (!name) {
    name = title.replace(/^正在播放\s*/, '').replace(/\s*-\s*[^-]+-\s*18PORNY\s*$/i, '').trim();
  }

  let pic = '';
  const poster = $('[data-poster]').first().attr('data-poster');
  if (poster) pic = abs(poster);
  if (!pic) pic = abs($('.ys2-vod-series-poster img').first().attr('src') || '');
  if (!pic) {
    $('img').each((_, el) => {
      if (pic) return;
      const src = $(el).attr('src') || '';
      if (/upload\/vod\//i.test(src) && !/load\.gif/i.test(src)) pic = abs(src);
    });
  }

  const meta = metaMap($);
  const tags = tagsOf($);

  let remarks = '';
  const $seriesInfo = $('.ys2-series-detail-copy p').first();
  if ($seriesInfo.length) {
    remarks = $seriesInfo.text()
      .replace(/\s+/g, ' ')
      .replace(/[·]/g, ' ')
      .replace(/\d+\s*次觀看|\d+\s*次观看/g, '')
      .replace(/更新於\s*[\d-]+|更新于\s*[\d-]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (!remarks) {
    const $headCount = $('.ys2-player-episode-panel-head p').first().text().replace(/\s+/g, ' ').trim();
    if (/^(全|更新至)/.test($headCount)) remarks = $headCount;
  }

  const desc = (
    $('.ys2-series-summary').first().text() ||
    $('.ys2-detail-description').first().text() ||
    ''
  ).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  // 播放列表：剧集页拿选集，单片页只有一路正片
  let eps = episodesOf($);
  if (eps.length === 0) {
    const start = normId($('.ys2-series-start').attr('href') || '');
    if (start) eps = [{ name: '正片', url: start }];
  }
  if (eps.length === 0) {
    if (isPlayPage) eps = [{ name: '正片', url: id }];
    else if (cfg && cfg.url) eps = [{ name: '正片', url: id }];
  }

  const playUrl = eps.map((e) => `${e.name}$${e.url}`).join('#');

  return {
    list: [{
      vod_id: id,
      vod_name: name,
      vod_pic: pic,
      vod_actor: meta['主演'] || '',
      vod_area: meta['地區'] || meta['地区'] || '',
      vod_lang: meta['語言'] || meta['语言'] || '',
      vod_year: meta['年份'] || '',
      vod_remarks: remarks,
      vod_content: [desc, tags.length ? `标签：${tags.join(',')}` : ''].filter(Boolean).join('\n'),
      vod_play_from: '18PORNY',
      vod_play_url: playUrl,
    }],
  };
}

const playCache = new Map();

async function play(inReq) {
  const id = normId(inReq.body && inReq.body.id);
  if (!id) throw new Error('[18porny] bad play id');

  if (playCache.has(id)) return playCache.get(id);

  const html = await fetchPage(id, `${SITE}/`);
  const cfg = readPlayer(html);

  let url = cfg && cfg.url ? decodeJsonText(cfg.url) : '';
  if (!url) {
    const m = html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/);
    if (m) url = m[0];
  }
  if (!url) {
    const m = html.match(/https?:(?:\\\/|\/){2}[^"'\s]+\.m3u8[^"'\s]*/);
    if (m) url = decodeJsonText(m[0]);
  }
  if (!url) throw new Error(`[18porny] no play url: ${id}`);

  const result = {
    url,
    header: {
      'User-Agent': UA,
      Referer: `${SITE}/`,
      Origin: SITE,
    },
  };

  if (playCache.size > 500) playCache.clear();
  playCache.set(id, result);
  return result;
}

async function search(inReq) {
  const wd = String((inReq.body && inReq.body.wd) || '').trim();
  if (!wd) return { page: 1, pagecount: 1, list: [] };

  const page = Math.max(1, parseInt(inReq.body && inReq.body.page, 10) || 1);
  const f = (inReq.body && inReq.body.filters) || {};
  const by = SORTS.some((s) => s.v === f.by) ? f.by : 'time';
  const enc = encodeURIComponent(wd);

  const url = page <= 1
    ? `${SITE}/vod/search/wd/${enc}.html?by=${by}`
    : `${SITE}/vod/search/by/${by}/page/${page}/wd/${enc}.html`;

  const html = await fetchPage(url, `${SITE}/`);
  const $ = load(html);
  const list = parseList($);
  const total = pageTotal($);

  let pagecount = page;
  if (list.length > 0) {
    pagecount = total ? total : (list.length >= PAGE_SIZE ? page + 1 : page);
  }

  return { page, pagecount, list };
}

export default {
  meta: {
    key: '18porny',
    name: '💋18Porny',
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
