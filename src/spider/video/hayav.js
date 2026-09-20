import axios from 'axios';
import { load } from 'cheerio';
import { HttpsProxyAgent } from 'https-proxy-agent';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SITE = 'https://hayav.com';
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const PACKER_FN = String.raw`function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)`;
const PACKED_EVAL_RE = new RegExp(
  String.raw`eval\(${PACKER_FN}[\s\S]+?}\(\s*'[\s\S]+?',\s*\d+,\s*\d+,\s*'[\s\S]+?'\.split\('\|'\)\s*\)+`
);

const CLASSES = [
  { type_id: '/video/chinese-subtitles/', type_name: '中文字幕' },
  { type_id: '/video/mosaic-reduced/', type_name: '无码破解' },
  { type_id: '/actors/', type_name: '演员' },
];

function parsePackerArgs(code) {
  const patterns = [
    /}\(\s*'([\s\S]+)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/,
    /}\(\s*'([\s\S]+)',\s*(\d+),\s*(\d+),\s*"([\s\S]*?)"\.split\('\|'\)/,
  ];
  for (const re of patterns) {
    const m = code.match(re);
    if (m) return m;
  }
  return null;
}

function unpackPacker(code) {
  const args = parsePackerArgs(code);
  if (!args) return '';
  let payload = args[1];
  const base = parseInt(args[2], 10);
  const count = parseInt(args[3], 10);
  if (!Number.isFinite(base) || base < 2 || base > 36) return '';
  if (!Number.isFinite(count) || count < 0 || count > 100000) return '';
  const dict = args[4].split('|');
  for (let i = count - 1; i >= 0; i--) {
    if (!dict[i]) continue;
    payload = payload.replace(new RegExp('\\b' + i.toString(base) + '\\b', 'g'), dict[i]);
  }
  return payload;
}

function extractStreamUrl(unpacked) {
  if (!unpacked) return '';
  for (const key of ['hls2', 'hls3', 'hls4']) {
    const m = unpacked.match(new RegExp(`["']${key}["']\\s*:\\s*["']([^"']+)["']`));
    if (m?.[1]) return m[1];
  }
  return '';
}

function hglinkId(url) {
  const m = String(url || '').match(/hglink\.to\/e\/([^/?#]+)/i);
  return m?.[1] || '';
}

function pickTitle(raw) {
  return String(raw || '')
    .replace(/\s*-\s*HayAV\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function detailUrl(vid) {
  const id = String(vid || '').trim();
  if (id.startsWith('http')) return id;
  return `${SITE}${id.startsWith('/') ? id : `/${id}`}`;
}

function buildListUrl(tid, page) {
  let path = String(tid || '/video/chinese-subtitles/').replace(/^folder_/, '');
  if (path.startsWith('http')) {
    if (page <= 1) return path;
    return path.replace(/\/?$/, `/page/${page}/`);
  }
  if (!path.startsWith('/')) path = `/${path}`;
  if (page > 1) {
    path = path.replace(/\/?$/, `/page/${page}/`);
  } else if (!path.endsWith('/')) {
    path += '/';
  }
  return `${SITE}${path}`;
}

async function request(url, referer = `${SITE}/`, method = 'GET', data = null) {
  const config = {
    method,
    url,
    headers: {
      'User-Agent': UA,
      Referer: referer,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      ...(method === 'POST' ? {
        Origin: SITE,
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      } : {}),
    },
    timeout: 30000,
    validateStatus: () => true,
  };
  if (data != null) config.data = data;
  const resp = await axios(config);
  return resp;
}

async function requestHtml(url, referer = `${SITE}/`) {
  const resp = await request(url, referer);
  return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
}

async function pickBestM3u8(m3u8, referer) {
  let best = m3u8;
  try {
    const resp = await request(m3u8, referer);
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

async function resolveHglink(embedUrl) {
  const id = hglinkId(embedUrl);
  if (!id) return '';
  const player = `https://iplayerhls.com/e/${id}`;
  const html = await requestHtml(player, player);
  const match = html.match(PACKED_EVAL_RE);
  if (!match) return '';
  let playUrl = extractStreamUrl(unpackPacker(match[0]));
  if (!playUrl) return '';
  if (!playUrl.startsWith('http')) playUrl = `https://iplayerhls.com${playUrl}`;
  return pickBestM3u8(playUrl, player);
}

function extractTokens(html) {
  const tokens = [];
  const seen = new Set();
  for (const m of String(html || '').matchAll(/data-hayav-player-token=["']([^"']+)["']/gi)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    tokens.push(m[1]);
  }
  return tokens;
}

function normalizeEmbedUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (raw.startsWith('//')) return `https:${raw}`;
  return raw;
}

function extractIframeSrc(html) {
  const m = String(html || '').match(/<iframe[^>]+src=["']([^"']+)["']/i);
  return normalizeEmbedUrl(m?.[1] || '');
}

async function fetchPlayerEmbed(token, referer) {
  const body = new URLSearchParams();
  body.set('action', 'hayav_player_pilot_source');
  body.set('token', token);
  const resp = await request(`${SITE}/wp-admin/admin-ajax.php`, referer, 'POST', body.toString());
  const data = resp.data;
  if (!data?.success || !data?.data?.html) return '';
  return extractIframeSrc(data.data.html);
}

function parseVods($, mode = 'video') {
  const items = [];
  const seen = new Set();

  $('article').each((_, element) => {
    const el = $(element);
    const link = el.find('h3 a, .entry-title a').first();
    const href = link.attr('href') || '';
    const name = pickTitle(link.attr('title') || link.text());
    const pic = el.find('img').attr('data-src') || el.find('img').attr('src') || '';
    const views = el.find('.view-count span').last().text().trim();

    if (!href || !name || seen.has(href)) return;

    if (mode === 'actor') {
      if (!/\/actor\//i.test(href)) return;
      seen.add(href);
      items.push({
        vod_id: `folder_${href}`,
        vod_name: name,
        vod_pic: pic,
        vod_tag: 'folder',
        vod_remarks: views,
      });
      return;
    }

    if (/\/actor\//i.test(href)) return;
    seen.add(href);
    items.push({
      vod_id: href,
      vod_name: name,
      vod_pic: pic,
      vod_remarks: views,
    });
  });

  return items;
}

async function init(_inReq, _outResp) {
  return {};
}

async function home(_inReq, _outResp) {
  return { class: CLASSES, filters: {} };
}

async function category(inReq, _outResp) {
  const tid = inReq.body.id || '/video/chinese-subtitles/';
  const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
  const url = buildListUrl(tid, page);
  const html = await requestHtml(url, url);
  const $ = load(html);
  const mode = tid === '/actors/' ? 'actor' : 'video';

  return {
    page,
    pagecount: page + 1,
    limit: 30,
    list: parseVods($, mode),
  };
}

async function detail(inReq, _outResp) {
  const vid = inReq.body.id;
  const url = detailUrl(vid);
  const html = await requestHtml(url, url);
  const $ = load(html);

  const name = pickTitle($('h1').first().text().trim() || $('meta[property="og:title"]').attr('content'));
  const pic = $('meta[property="og:image"]').attr('content')
    || $('img[data-src*="dmm.co.jp"]').attr('data-src')
    || $('img[src*="dmm.co.jp"]').attr('src')
    || '';
  const content = $('meta[property="description"]').attr('content') || '';

  const tokens = extractTokens(html);
  const playParts = [];
  for (let i = 0; i < tokens.length; i++) {
    const embed = await fetchPlayerEmbed(tokens[i], url);
    if (embed) playParts.push(`线路${i + 1}$${embed}`);
  }

  return {
    list: [{
      vod_id: url,
      vod_name: name,
      vod_pic: pic,
      vod_content: content,
      vod_play_from: 'HayAV',
      vod_play_url: playParts.join('#'),
    }],
  };
}

async function play(inReq, _outResp) {
  const url = inReq.body.id || '';
  if (!url) {
    return { parse: 0, url: '', header: { 'User-Agent': UA, Referer: `${SITE}/` } };
  }

  if (/\.(m3u8|mp4|flv)(\?|$)/i.test(url)) {
    return {
      parse: 0,
      url,
      header: { 'User-Agent': UA, Referer: `${SITE}/` },
    };
  }

  let playUrl = '';
  let referer = `${SITE}/`;

  if (/hglink\.to/i.test(url)) {
    playUrl = await resolveHglink(url);
    if (playUrl) referer = `https://iplayerhls.com/e/${hglinkId(url)}`;
  } else if (/iplayerhls\.com/i.test(url)) {
    const html = await requestHtml(url, url);
    const match = html.match(PACKED_EVAL_RE);
    playUrl = match ? extractStreamUrl(unpackPacker(match[0])) : '';
    referer = url;
    if (playUrl && !playUrl.startsWith('http')) playUrl = `https://iplayerhls.com${playUrl}`;
    if (playUrl) playUrl = await pickBestM3u8(playUrl, referer);
  } else if (/hayav\.com/i.test(url)) {
    const html = await requestHtml(url, url);
    const tokens = extractTokens(html);
    for (const token of tokens) {
      const embed = await fetchPlayerEmbed(token, url);
      if (/hglink\.to/i.test(embed)) {
        playUrl = await resolveHglink(embed);
        if (playUrl) {
          referer = `https://iplayerhls.com/e/${hglinkId(embed)}`;
          break;
        }
      }
    }
  }

  if (playUrl) {
    return {
      parse: 0,
      url: playUrl,
      header: { 'User-Agent': UA, Referer: referer },
    };
  }

  return {
    parse: 1,
    url,
    header: { 'User-Agent': UA, Referer: `${SITE}/` },
  };
}

async function search(inReq, _outResp) {
  const wd = encodeURIComponent((inReq.body.wd || '').trim());
  if (!wd) return { list: [] };
  const html = await requestHtml(`${SITE}/?s=${wd}`);
  const $ = load(html);
  return { list: parseVods($) };
}

export default {
  meta: {
    key: 'hayav',
    name: '🔥HayAV',
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
