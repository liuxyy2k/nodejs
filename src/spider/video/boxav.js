import axios from 'axios';
import { load } from 'cheerio';
import { HttpsProxyAgent } from 'https-proxy-agent';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SITE = 'https://boxav.net';
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const CLASSES = [
  { type_id: '/', type_name: '全部' },
  { type_id: '/category/english-subbed', type_name: '英文字幕' },
  { type_id: '/category/jav', type_name: 'JAV' },
  { type_id: '/category/decensored', type_name: '无码破解' },
  { type_id: '/category/Uncensored', type_name: '无码' },
  { type_id: '/category/Uncensored_Leaked', type_name: '无码流出' },
  { type_id: '/category/fc2', type_name: 'FC2' },
  { type_id: '/category/heyzo', type_name: 'HEYZO' },
  { type_id: '/category/caribbeancom', type_name: 'Caribbeancom' },
  { type_id: '/category/10musume', type_name: '10musume' },
  { type_id: '/category/pacopacomama', type_name: 'Pacopacomama' },
  { type_id: '/category/amateur', type_name: '素人' },
  { type_id: '/category/idol', type_name: 'Idol' },
  { type_id: '/category/4k', type_name: '4K' },
];

const SORT_FILTER = [{
  key: 'sort',
  name: '排序',
  value: [
    { n: '最佳', v: 'best' },
    { n: '最新', v: 'newest' },
    { n: '发布日期', v: 'release_date' },
  ],
}];

function fixUrl(href) {
  const raw = String(href || '').trim();
  if (!raw) return '';
  if (raw.startsWith('http')) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  return `${SITE}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

function detailUrl(vid) {
  const id = String(vid || '').trim();
  if (id.startsWith('http')) return id;
  return fixUrl(id);
}

function buildListUrl(tid, page, filters = {}) {
  let path = String(tid || '/').replace(/^folder_/, '');
  let base;

  if (path.startsWith('http')) {
    base = new URL(path);
  } else {
    if (!path.startsWith('/')) path = `/${path}`;
    base = new URL(`${SITE}${path}`);
  }

  const sort = filters.sort || filters.by || '';
  if (sort) base.searchParams.set('sort', sort);
  else base.searchParams.delete('sort');

  if (page > 1) base.searchParams.set('page', String(page));
  else base.searchParams.delete('page');

  return base.toString();
}

async function requestHtml(url, referer = `${SITE}/`) {
  const resp = await axios.get(url, {
    headers: {
      'User-Agent': UA,
      Referer: referer,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
    timeout: 30000,
    validateStatus: () => true,
  });
  return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
}

async function requestPost(url, data, referer) {
  const resp = await axios.post(url, data, {
    headers: {
      'User-Agent': UA,
      Referer: referer,
      Origin: new URL(referer).origin,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    timeout: 30000,
    validateStatus: () => true,
  });
  return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
}

function unpackMaxstream(code) {
  const m = code.match(/}\('([\s\S]+)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)\)/);
  if (!m) return '';
  let payload = m[1];
  const base = parseInt(m[2], 10);
  const count = parseInt(m[3], 10);
  const dict = m[4].split('|');
  for (let i = count - 1; i >= 0; i--) {
    if (!dict[i]) continue;
    payload = payload.replace(new RegExp('\\b' + i.toString(base) + '\\b', 'g'), dict[i]);
  }
  return payload;
}

function extractMaxstreamFile(unpacked) {
  const m = unpacked.match(/file\s*:\s*["']([^"']+)["']/i);
  return m?.[1] || '';
}

function extractNjavM3u8(html) {
  const cfg = html.match(/window\.PLAYER_CONFIG\s*=\s*(\{[\s\S]*?\});/);
  if (cfg) {
    try {
      const data = JSON.parse(cfg[1]);
      if (data.m3u8) return data.m3u8;
    } catch {}
  }
  const raw = html.match(/https:\\\/\\\/helvid\.com\\\/m\\\/[^"']+/i)?.[0]
    || html.match(/https:\/\/helvid\.com\/m\/[^"'\s]+/i)?.[0];
  return raw ? raw.replace(/\\\//g, '/').replace(/\\u0026/g, '&') : '';
}

function maxstreamCode(url) {
  return String(url || '').match(/embed-([a-z0-9]+)\.html/i)?.[1]
    || String(url || '').match(/maxstream\.org\/e\/([^/?#]+)/i)?.[1]
    || '';
}

async function pickBestM3u8(m3u8, referer) {
  let best = m3u8;
  try {
    const resp = await axios.get(m3u8, {
      headers: { 'User-Agent': UA, Referer: referer },
      timeout: 15000,
      validateStatus: () => true,
    });
    const text = String(resp.data || '');
    if (!text.includes('#EXT-X-STREAM-INF')) return best;
    const lines = text.split('\n');
    let pick = { height: 0, url: '' };
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes('#EXT-X-STREAM-INF')) continue;
      const m = lines[i].match(/RESOLUTION=\d+x(\d+)/);
      const streamUrl = lines[i + 1]?.trim();
      if (!streamUrl) continue;
      const height = m ? parseInt(m[1], 10) : 0;
      if (height >= pick.height) pick = { height, url: streamUrl };
    }
    if (pick.url) {
      best = pick.url.startsWith('http')
        ? pick.url
        : m3u8.replace(/[^/?#]+\.(?:m3u8|txt)(\?.*)?$/, pick.url);
    }
  } catch {}
  return best;
}

async function resolveMaxstreamM3u8(embedUrl) {
  const code = maxstreamCode(embedUrl);
  if (!code) return '';
  const referer = `https://maxstream.org/e/${code}`;
  const body = new URLSearchParams({
    op: 'embed',
    file_code: code,
    auto: '1',
    referer: '',
  });
  const html = await requestPost('https://maxstream.org/dl', body.toString(), referer);
  const match = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]+?'\.split\('\|'\)\)/);
  if (!match) return '';
  const file = extractMaxstreamFile(unpackMaxstream(match[0]));
  if (!file) return '';
  return pickBestM3u8(file, 'https://maxstream.org/');
}

async function resolveNjavM3u8(inputUrl) {
  let jmUrl = inputUrl;
  let referer = `${SITE}/`;

  if (/njav\.com\/vv\//i.test(inputUrl)) {
    const vvHtml = await requestHtml(inputUrl, `${SITE}/`);
    const jmPath = vvHtml.match(/videoFrame\.src\s*=\s*"(\/jm\/[^"]+)"/)?.[1];
    if (!jmPath) return { url: '', referer: inputUrl };
    jmUrl = `https://www.njav.com${jmPath}`;
    referer = jmUrl;
  }

  const jmHtml = await requestHtml(jmUrl, /njav\.com\/vv\//i.test(inputUrl) ? inputUrl : jmUrl);
  const m3u8 = extractNjavM3u8(jmHtml);
  return { url: m3u8, referer: jmUrl };
}

function pickTitle(raw) {
  return String(raw || '')
    .replace(/\s*-\s*Watch Free JAV\s*\|?\s*BoxAV\s*$/i, '')
    .replace(/\s*\[[^\]]+\]\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseVods($) {
  const items = [];
  const seen = new Set();

  const pushItem = (href, name, pic, remarks) => {
    const url = fixUrl(href);
    if (!url || !name || seen.has(url)) return;
    seen.add(url);
    items.push({
      vod_id: url,
      vod_name: pickTitle(name),
      vod_pic: fixUrl(pic),
      vod_remarks: remarks,
    });
  };

  $('.video-card').each((_, element) => {
    const card = $(element);
    const link = card.find('a[href*="/video/"]').first();
    const href = link.attr('href') || '';
    const name = card.find('.video-title').text().trim() || link.attr('title') || '';
    const pic = card.find('img').attr('src') || card.find('img').attr('data-src') || '';
    const badge = card.find('.thumb-category-badge').text().trim();
    const views = card.find('.video-info span').last().text().trim();
    pushItem(href, name, pic, [badge, views].filter(Boolean).join(' | '));
  });

  if (!items.length) {
    $('a[href*="/video/"]').each((_, element) => {
      const link = $(element);
      const href = link.attr('href') || '';
      const name = link.find('.video-title').text().trim() || link.attr('title') || link.text().trim();
      const pic = link.find('img').attr('src') || '';
      const badge = link.find('.thumb-category-badge').text().trim();
      pushItem(href, name, pic, badge);
    });
  }

  return items;
}

function extractIframe(html) {
  const $ = load(html);
  const iframe = $('iframe[src]').first().attr('src')
    || html.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1]
    || '';
  return fixUrl(iframe);
}

async function init(_inReq, _outResp) {
  return {};
}

async function home(_inReq, _outResp) {
  const filters = {};
  for (const item of CLASSES) filters[item.type_id] = SORT_FILTER;
  return { class: CLASSES, filters };
}

async function category(inReq, _outResp) {
  const tid = inReq.body.id || '/';
  const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
  let filters = inReq.body.filters || {};
  if (typeof filters === 'string') {
    try { filters = JSON.parse(filters); } catch { filters = {}; }
  }

  const url = buildListUrl(tid, page, filters);
  const html = await requestHtml(url, url);
  const $ = load(html);

  return {
    page,
    pagecount: page + 1,
    limit: 40,
    list: parseVods($),
  };
}

async function detail(inReq, _outResp) {
  const url = detailUrl(inReq.body.id);
  const html = await requestHtml(url, url);
  const $ = load(html);

  const name = pickTitle($('meta[property="og:title"]').attr('content') || $('h1').first().text().trim());
  const pic = fixUrl($('meta[property="og:image"]').attr('content') || $('img[src*="/thumbs/"]').attr('src') || '');
  const content = $('meta[name="description"]').attr('content') || '';
  const embed = extractIframe(html);

  return {
    list: [{
      vod_id: url,
      vod_name: name,
      vod_pic: pic,
      vod_content: content,
      vod_play_from: 'BoxAV',
      vod_play_url: embed ? `播放$${embed}` : '',
    }],
  };
}

async function play(inReq, _outResp) {
  let url = inReq.body.id || '';
  const header = { 'User-Agent': UA, Referer: `${SITE}/` };

  if (!url) {
    return { parse: 0, url: '', header };
  }

  if (/\.(m3u8|mp4|flv)(\?|$)/i.test(url)) {
    return { parse: 0, url, header };
  }

  if (/boxav\.net\/video\//i.test(url)) {
    const html = await requestHtml(url, url);
    url = extractIframe(html) || url;
  }

  if (/maxstream\.org/i.test(url)) {
    const playUrl = await resolveMaxstreamM3u8(url);
    if (playUrl) {
      return {
        parse: 0,
        url: playUrl,
        header: { 'User-Agent': UA, Referer: 'https://maxstream.org/' },
      };
    }
  }

  if (/njav\.com/i.test(url)) {
    const { url: playUrl, referer } = await resolveNjavM3u8(url);
    if (playUrl) {
      return {
        parse: 0,
        url: playUrl,
        header: { 'User-Agent': UA, Referer: referer },
      };
    }
  }

  return { parse: 1, url, header };
}

async function search(inReq, _outResp) {
  const wd = encodeURIComponent((inReq.body.wd || '').trim());
  const page = parseInt(inReq.body.pg || inReq.body.page || 1, 10) || 1;
  if (!wd) return { list: [] };

  const url = `${SITE}/search?q=${wd}${page > 1 ? `&page=${page}` : ''}`;
  const html = await requestHtml(url, `${SITE}/`);
  const $ = load(html);
  return { list: parseVods($) };
}

export default {
  meta: {
    key: 'boxav',
    name: '🌸BoxAV',
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
