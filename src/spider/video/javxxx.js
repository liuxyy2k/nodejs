import axios from 'axios';
import { load } from 'cheerio';
import req from '../../util/req.js';
import { config } from './config.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SITE = 'https://www.javxxx.me';
const LANG = '/zh';
const FLARE_URL = config.FLARE_URL;

const PLAY_HEADER = {
  'User-Agent': UA,
  Referer: `${SITE}/`,
  Origin: SITE,
};

const FALLBACK_CLASSES = [
  { type_id: `${SITE}${LANG}/v24/category/censored/`, type_name: '有码' },
  { type_id: `${SITE}${LANG}/v16/category/english-subtitle/`, type_name: '英文字幕' },
  { type_id: `${SITE}${LANG}/v18/category/chinese-subtitle/`, type_name: '中文字幕' },
  { type_id: `${SITE}${LANG}/v8/category/uncensored/`, type_name: '无码' },
  { type_id: `${SITE}${LANG}/v9/category/decensored/`, type_name: '无码破解' },
  { type_id: `${SITE}${LANG}/v8/category/uncensored-leaked/`, type_name: '无码流出' },
  { type_id: `${SITE}${LANG}/v17/category/amateur/`, type_name: '素人' },
  { type_id: `${SITE}${LANG}/v34/category/fc2-ppv/`, type_name: 'FC2 PPV' },
];

function isBlocked(html) {
  const text = String(html || '');
  return text.length < 1000 || /Just a moment|cf-browser-verification|403 Forbidden/i.test(text);
}

async function requestFlare(targetUrl) {
  const resp = await axios.post(
    FLARE_URL,
    { cmd: 'request.get', url: targetUrl, maxTimeout: 60000 },
    { timeout: 70000, validateStatus: () => true },
  );
  const html = resp.data?.solution?.response;
  if (!html || isBlocked(html)) throw new Error('flare blocked');
  return html;
}

async function requestDirect(targetUrl, referer = `${SITE}${LANG}`) {
  const headers = {
    'User-Agent': UA,
    Referer: referer,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': referer ? 'same-origin' : 'none',
    'Upgrade-Insecure-Requests': '1',
  };
  const resp = await req.get(targetUrl, { headers, timeout: 30000, validateStatus: () => true });
  const html = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
  if (resp.status >= 400 || isBlocked(html)) throw new Error('direct blocked');
  return html;
}

async function request(targetUrl, referer = `${SITE}${LANG}`) {
  try {
    return await requestDirect(targetUrl, referer);
  } catch (e) {
    console.log('[javxxx] direct fail, flare:', e.message);
    return requestFlare(targetUrl);
  }
}

function fixUrl(href) {
  if (!href) return '';
  if (href.startsWith('http')) return href;
  return href.startsWith('/') ? `${SITE}${href}` : `${SITE}/${href}`;
}

function pickPic(el) {
  const img = el.find('img').first();
  return img.attr('data-lazy-src')
    || img.attr('src')
    || img.attr('data-wpsrc')
    || el.find('noscript img').attr('src')
    || '';
}

function pickTitle(raw) {
  return String(raw || '')
    .replace(/\s*-\s*JAVXXX\.Me\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCards($) {
  const list = [];
  const seen = new Set();

  $('.item.thumb-block').each((_, element) => {
    const el = $(element);
    const link = el.find('a[href*="/video/"]').first();
    const href = fixUrl(link.attr('href') || '');
    const name = pickTitle(link.attr('title') || el.find('.video-desc a').text().trim());
    const pic = pickPic(el);
    const duration = el.find('.duration').text().replace(/\s+/g, ' ').trim();
    const release = el.find('.release').text().trim();
    const tag = el.find('.hd-video').text().trim();
    const remarks = [tag, release, duration].filter(Boolean).join(' | ');

    if (!href || !name || seen.has(href)) return;
    seen.add(href);
    list.push({ vod_id: href, vod_name: name, vod_pic: pic, vod_remarks: remarks });
  });

  return list;
}

function parseHomeClasses(html) {
  const $ = load(html);
  const classes = [];
  const seen = new Set();

  $(`a[href*="${LANG}/"][href*="/category/"]`).each((_, element) => {
    const href = fixUrl($(element).attr('href') || '');
    const name = pickTitle($(element).text().replace(/<[^>]+>/g, '').trim());
    if (!href || !name || seen.has(href)) return;
    if (href.includes('/filter/') || href.includes('/page/')) return;
    seen.add(href);
    classes.push({ type_id: href, type_name: name });
  });

  return classes.length ? classes : FALLBACK_CLASSES;
}

function buildListUrl(tid, page, filters = {}) {
  let url = fixUrl(String(tid || `${SITE}${LANG}/v24/category/censored/`));
  const sort = filters.sort || filters.by || '';

  if (sort === 'most-viewed' && !url.includes('/filter/most-viewed')) {
    url = url.replace(/\/?$/, '/filter/most-viewed/');
  }

  if (page > 1) {
    url = url.replace(/\/?$/, `/page/${page}/`);
  } else if (!url.endsWith('/')) {
    url += '/';
  }

  return url;
}

function detailUrl(vid) {
  const id = String(vid || '').trim();
  if (id.startsWith('http')) return id;
  if (id.startsWith('/')) return `${SITE}${id}`;
  return `${SITE}/video/${id.replace(/^\/video\//, '').replace(/\/$/, '')}/`;
}

function extractPlayUrls(html) {
  const urls = [...String(html || '').matchAll(/https?:\/\/[^"'\s<>]+\.(?:m3u8|mp4)(?:\?[^"'\s<>]*)?/gi)]
    .map((m) => m[0])
    .filter((u) => !/\/preview\.(?:mp4|png|webp)/i.test(u) && !/\.png|\.jpg/i.test(u));

  const unique = [...new Set(urls)];
  const cdn = unique.filter((u) => /pornfhd\.com/i.test(u));
  if (cdn.length) return cdn;
  return unique;
}

async function init(_inReq, _outResp) {
  return {};
}

const SORT_FILTER = [{
  key: 'sort',
  name: '排序',
  value: [
    { n: '最新', v: 'latest' },
    { n: '最多观看', v: 'most-viewed' },
  ],
}];

async function home(_inReq, _outResp) {
  try {
    const html = await request(`${SITE}${LANG}`);
    const classes = parseHomeClasses(html);
    const filters = {};
    for (const item of classes.slice(0, 12)) filters[item.type_id] = SORT_FILTER;
    return { class: classes, filters };
  } catch (e) {
    console.log('[javxxx] home fail:', e.message);
    const filters = {};
    for (const item of FALLBACK_CLASSES) filters[item.type_id] = SORT_FILTER;
    return { class: FALLBACK_CLASSES, filters };
  }
}

async function category(inReq, _outResp) {
  const tid = inReq.body.id || `${SITE}${LANG}/v24/category/censored/`;
  const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
  let filters = inReq.body.filters || {};
  if (typeof filters === 'string') {
    try { filters = JSON.parse(filters); } catch { filters = {}; }
  }

  try {
    const html = await request(buildListUrl(tid, page, filters));
    const $ = load(html);
    return {
      page,
      pagecount: page + 1,
      limit: 30,
      list: parseCards($),
    };
  } catch (e) {
    console.log('[javxxx] category fail:', e.message);
    return { page, pagecount: page, limit: 30, list: [] };
  }
}

async function detail(inReq, _outResp) {
  const url = detailUrl(inReq.body.id);
  const html = await request(url, url);
  const $ = load(html);

  const name = pickTitle($('h1').first().text().trim() || $('meta[property="og:title"]').attr('content'));
  const pic = $('meta[property="og:image"]').attr('content') || pickPic($('#player-row-left')) || '';
  const year = $('meta[property="article:published_time"]').attr('content') || '';

  const media = extractPlayUrls(html);
  const playParts = media.map((u, i) => `${i === 0 ? '播放' : `线路${i + 1}`}$${u}`);

  return {
    list: [{
      vod_id: url,
      vod_name: name,
      vod_pic: pic,
      vod_year: year,
      vod_play_from: 'JAVXXX',
      vod_play_url: playParts.length ? playParts.join('#') : '',
    }],
  };
}

async function play(inReq, _outResp) {
  let url = String(inReq.body.id || '').trim();
  if (url.includes('$')) url = url.split('$').pop().trim();

  if (/\.(m3u8|mp4)(\?|$)/i.test(url)) {
    return { parse: 0, jx: 0, url, header: PLAY_HEADER };
  }

  if (/javxxx\.me/i.test(url)) {
    try {
      const html = await request(url, url);
      const media = extractPlayUrls(html);
      if (media.length) {
        return { parse: 0, jx: 0, url: media[0], header: PLAY_HEADER };
      }
    } catch (e) {
      console.log('[javxxx] play fetch fail:', e.message);
    }
  }

  return { parse: 0, jx: 0, url: '', header: PLAY_HEADER };
}

async function search(inReq, _outResp) {
  const wd = encodeURIComponent((inReq.body.wd || '').trim());
  if (!wd) return { list: [] };

  const html = await request(`${SITE}${LANG}/?s=${wd}`);
  const $ = load(html);
  return { list: parseCards($) };
}

export default {
  meta: {
    key: 'javxxx',
    name: '🌸JAVXXX',
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
