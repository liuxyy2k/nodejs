import axios from 'axios';
import { load } from 'cheerio';
import { HttpsProxyAgent } from 'https-proxy-agent';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SITE = 'https://3xchina.page';
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const PACKER_FN = String.raw`function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)`;
const PACKED_EVAL_RE = new RegExp(
  String.raw`eval\(${PACKER_FN}[\s\S]+?}\(\s*'[\s\S]+?',\s*\d+,\s*\d+,\s*'[\s\S]+?'\.split\('\|'\)\s*\)+`
);

const CLASSES = [
  { type_id: '/?filter=latest&cat=4', type_name: '最新更新' },
  { type_id: '/category/chinese-av/', type_name: 'Chinese AV' },
  { type_id: '/category/chinese-sex/', type_name: 'Chinese Sex' },
  { type_id: '/tag/md-series/', type_name: '麻豆AV' },
  { type_id: '/tag/jvid/', type_name: 'JVID' },
  { type_id: '/tag/91porn/', type_name: '91Porn' },
  { type_id: '/tag/swag/', type_name: 'SWAG' },
  { type_id: '/tag/china-av/', type_name: '国产AV' },
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

function embedId(url) {
  const m = String(url || '').match(/(?:hglink|hgcloud)\.to\/e\/([^/?#]+)/i);
  return m?.[1] || '';
}

async function request(url, referer = `${SITE}/`) {
  const resp = await axios.get(url, {
    headers: {
      'User-Agent': UA,
      Referer: referer,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
    timeout: 20000,
    validateStatus: () => true,
  });
  return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
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

async function resolveHgEmbed(embedUrl) {
  const id = embedId(embedUrl);
  if (!id) return '';
  const player = `https://iplayerhls.com/e/${id}`;
  const html = await request(player, embedUrl || player);
  const match = html.match(PACKED_EVAL_RE);
  if (!match) return '';
  let playUrl = extractStreamUrl(unpackPacker(match[0]));
  if (!playUrl) return '';
  if (!playUrl.startsWith('http')) playUrl = `https://iplayerhls.com${playUrl}`;
  return pickBestM3u8(playUrl, player);
}

function toVid(href) {
  if (!href) return '';
  if (href.startsWith(SITE)) return href.slice(SITE.length) || '/';
  return href.startsWith('/') ? href : `/${href}`;
}

function buildListUrl(tid, page) {
  let raw = String(tid || '/category/chinese-av/').trim();
  if (raw.startsWith('http')) {
    if (page <= 1) return raw;
    const u = new URL(raw);
    u.searchParams.set('paged', String(page));
    return u.toString();
  }

  let path = raw.startsWith('/') ? raw : `/${raw}`;
  if (page > 1) {
    if (path.includes('?')) {
      const qIdx = path.indexOf('?');
      const base = path.slice(0, qIdx);
      const params = new URLSearchParams(path.slice(qIdx + 1));
      params.set('paged', String(page));
      path = `${base}?${params.toString()}`;
    } else {
      path = path.replace(/\/?$/, `/page/${page}/`);
    }
  } else if (!path.includes('?') && !path.endsWith('/')) {
    path += '/';
  }
  return `${SITE}${path}`;
}

function detailUrl(vid) {
  const id = String(vid || '').trim();
  if (id.startsWith('http')) return id;
  return `${SITE}${id.startsWith('/') ? id : `/${id}`}`;
}

function parseVods($) {
  const items = [];
  const seen = new Set();

  $('article').each((_, element) => {
    const el = $(element);
    const link = el.find('a[href*="3xchina.page"]').first();
    const href = link.attr('href') || '';
    const vid = toVid(href);
    const name = (link.attr('title') || el.find('img').attr('alt') || el.find('.entry-title').text() || '').trim();
    const pic = el.find('img').attr('data-src') || el.find('img').attr('src') || '';
    const views = el.find('.views').text().replace(/\s+/g, ' ').trim();

    if (!vid || !name || !href.includes('/archives/') && !href.match(/3xchina\.page\/[^/]+\/$/)) return;
    if (seen.has(vid)) return;
    seen.add(vid);

    items.push({
      vod_id: vid,
      vod_name: name,
      vod_pic: pic,
      vod_remarks: views,
    });
  });

  return items;
}

function pickTitle(raw) {
  return String(raw || '').replace(/\s*-\s*3xchina\.page\s*$/i, '').trim();
}

function extractEmbedUrl(html) {
  const $ = load(html);
  const iframe = $('iframe[src]').first().attr('src')
    || [...String(html).matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1])[0]
    || '';
  return iframe;
}

async function init(_inReq, _outResp) {
  return {};
}

async function home(_inReq, _outResp) {
  return { class: CLASSES, filters: {} };
}

async function category(inReq, _outResp) {
  const tid = inReq.body.id || '/category/chinese-av/';
  const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
  const html = await request(buildListUrl(tid, page));
  const $ = load(html);

  return {
    page,
    pagecount: page + 1,
    limit: 30,
    list: parseVods($),
  };
}

async function detail(inReq, _outResp) {
  const vid = inReq.body.id;
  const html = await request(detailUrl(vid));
  const $ = load(html);

  const name = pickTitle($('h1').text().trim() || $('meta[property="og:title"]').attr('content'));
  const pic = $('meta[property="og:image"]').attr('content') || '';
  const embed = extractEmbedUrl(html);
  let playUrl = '';
  if (/hglink\.to|hgcloud\.to/i.test(embed)) {
    playUrl = await resolveHgEmbed(embed);
  }

  return {
    list: [{
      vod_id: vid,
      vod_name: name,
      vod_pic: pic,
      vod_play_from: '3xChina',
      vod_play_url: playUrl ? `播放$${playUrl}` : (embed ? `播放$${embed}` : ''),
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

  if (/hglink\.to|hgcloud\.to/i.test(url)) {
    playUrl = await resolveHgEmbed(url);
    if (playUrl) referer = `https://iplayerhls.com/e/${embedId(url)}`;
  } else if (/iplayerhls\.com/i.test(url)) {
    const html = await request(url, url);
    const match = html.match(PACKED_EVAL_RE);
    playUrl = match ? extractStreamUrl(unpackPacker(match[0])) : '';
    referer = url;
    if (playUrl && !playUrl.startsWith('http')) playUrl = `https://iplayerhls.com${playUrl}`;
    if (playUrl) playUrl = await pickBestM3u8(playUrl, referer);
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
  const html = await request(`${SITE}/?s=${wd}`);
  const $ = load(html);
  return { list: parseVods($) };
}

export default {
  meta: {
    key: 'x3china',
    name: '🔥3xChina',
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
