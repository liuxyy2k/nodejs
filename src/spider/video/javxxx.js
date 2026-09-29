import axios from 'axios';
import { load } from 'cheerio';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { config } from './config.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SITE = 'https://www.javxxx.me';
const LANG = '/zh';
const SERVER_API = config.SERVER_API;
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

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

async function requestDirect(targetUrl, referer = `${SITE}${LANG}`) {
  const resp = await axios.get(targetUrl, {
    headers: {
      'User-Agent': UA,
      Referer: referer,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
    httpsAgent: agent,
    timeout: 30000,
    validateStatus: () => true,
  });
  return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
}

async function requestViaServer(targetUrl, referer = `${SITE}${LANG}`) {
  const resp = await axios.post(SERVER_API, {
    url: targetUrl,
    referer,
    key: 'mira123',
  }, {
    timeout: 90000,
    headers: { 'Content-Type': 'application/json' },
    validateStatus: () => true,
  });
  if (resp.status >= 400) throw new Error(`proxy HTTP ${resp.status}`);
  const html = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
  if (html.length < 1000 || /Just a moment/i.test(html)) throw new Error('proxy blocked');
  return html;
}

async function request(targetUrl, referer = `${SITE}${LANG}`) {
  for (let i = 0; i < 2; i++) {
    try {
      return await requestViaServer(targetUrl, referer);
    } catch (e) {
      console.log('[javxxx] proxy fail:', e.message);
    }
  }
  const html = await requestDirect(targetUrl, referer);
  if (html.length < 1000 || /Just a moment/i.test(html)) {
    throw new Error('request blocked by cloudflare');
  }
  return html;
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

function extractDirectMedia(html) {
  const urls = [...String(html || '').matchAll(/https?:\/\/[^"'\s<>]+\.(?:m3u8|mp4)(?:\?[^"'\s<>]*)?/gi)]
    .map((m) => m[0])
    .filter((u) => !/\/preview\.mp4/i.test(u) && !/\/preview\.png/i.test(u));
  return [...new Set(urls)];
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

  const playParts = [];
  const direct = extractDirectMedia(html);
  for (const media of direct) {
    playParts.push(`播放$${media}`);
  }

  if (!playParts.length) {
    playParts.push(`播放$${url}`);
  }

  return {
    list: [{
      vod_id: url,
      vod_name: name,
      vod_pic: pic,
      vod_year: year,
      vod_play_from: 'JAVXXX',
      vod_play_url: playParts.join('#'),
    }],
  };
}

async function play(inReq, _outResp) {
  const url = inReq.body.id || '';
  const header = { 'User-Agent': UA, Referer: `${SITE}/` };

  if (/\.(m3u8|mp4)(\?|$)/i.test(url)) {
    return { parse: 0, url, header };
  }

  if (/javxxx\.me/i.test(url)) {
    try {
      const html = await request(url, url);
      const direct = extractDirectMedia(html);
      if (direct.length) {
        return { parse: 0, url: direct[0], header };
      }
    } catch {}
    return { parse: 1, url, header };
  }

  return { parse: 1, url, header };
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
