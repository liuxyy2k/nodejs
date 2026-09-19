import axios from 'axios';
import { load } from 'cheerio';
import { HttpsProxyAgent } from 'https-proxy-agent';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SITE = 'https://jav.direct';
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const PACKER_FN = String.raw`function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)`;
const PACKED_EVAL_RE = new RegExp(
  String.raw`eval\(${PACKER_FN}[\s\S]+?}\(\s*'[\s\S]+?',\s*\d+,\s*\d+,\s*'[\s\S]+?'\.split\('\|'\)\s*\)+`
);
const DETAIL_PACKER_RE = /eval\(function\(p,a,c,k,e,d\)[\s\S]+?\.split\('\|'\),0,\{\}\)\)/;

const LINE_NAMES = {
  'iplayerhls.com': 'HG',
  'minochinos.com': 'EV',
  'streamtape.com': 'ST',
};

async function request(url, referer = SITE + '/') {
  const resp = await axios.get(url, {
    headers: { 'User-Agent': UA, Referer: referer },
    timeout: 20000,
    validateStatus: () => true,
  });
  return resp.data;
}

function parsePackerArgs(code) {
  const patterns = [
    /}\(\s*'([\s\S]+)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/,
    /}\(\s*'([\s\S]+)',\s*(\d+),\s*(\d+),\s*"([\s\S]*?)"\.split\('\|'\)/,
    /}\(\s*"([\s\S]+)",\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/,
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

function unpackDetailScript(html) {
  const match = String(html || '').match(DETAIL_PACKER_RE);
  if (!match) return '';
  try {
    return eval(match[0].replace(/^eval/, ''));
  } catch {
    return '';
  }
}

function lineName(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    for (const [key, name] of Object.entries(LINE_NAMES)) {
      if (host.includes(key)) return name;
    }
  } catch {}
  return '播放';
}

function extractEmbeds(unpacked) {
  const urls = [...unpacked.matchAll(/src="(https?:\/\/[^"]+\/(?:e|v)\/[^"?]+)"/gi)]
    .map((m) => m[1]);
  return [...new Set(urls)];
}

function extractStreamUrl(unpacked) {
  if (!unpacked) return '';
  for (const key of ['hls4', 'hls3', 'hls2']) {
    const m = unpacked.match(new RegExp(`["']${key}["']\\s*:\\s*["']([^"']+)["']`));
    if (m?.[1]) return m[1];
  }
  return '';
}

function fixSiteUrl(href) {
  if (!href) return href;
  if (href.startsWith('http')) return href;
  return href.startsWith('/') ? `${SITE}${href}` : `${SITE}/${href}`;
}

function buildPageUrl(tid, page) {
  let path = String(tid || '/censored/').trim();
  if (!path.startsWith('http')) {
    path = path.startsWith('/') ? path : `/${path}`;
    if (!path.endsWith('/')) path += '/';
    path = `${SITE}${path}`;
  }
  if (page > 1) {
    path += path.endsWith('/') ? `page/${page}/` : `/page/${page}/`;
  }
  return path;
}

function parseCards($) {
  const list = [];
  const seen = new Set();
  $('.post-list a').each((_, element) => {
    const href = fixSiteUrl($(element).attr('href') || '');
    const title = $(element).find('img').attr('alt') || $(element).text().trim();
    const cover = $(element).find('img').attr('src') || '';
    if (!href || !title || seen.has(href)) return;
    seen.add(href);
    list.push({ vod_id: href, vod_name: title, vod_pic: cover, vod_remarks: '' });
  });
  return list;
}

async function pickBestM3u8(m3u8, referer) {
  let best = m3u8;
  try {
    const resp = await axios.get(m3u8, {
      headers: { 'User-Agent': UA, Referer: referer },
      httpsAgent: agent,
      timeout: 15000,
      validateStatus: () => true,
    });
    const text = String(resp.data || '');
    if (!text.includes('#EXT-X-STREAM-INF')) return best;
    const lines = text.split('\n');
    let pick = { height: 0, url: '' };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes('#EXT-X-STREAM-INF')) continue;
      const m = line.match(/RESOLUTION=\d+x(\d+)/);
      const streamUrl = lines[i + 1]?.trim();
      if (!streamUrl) continue;
      const height = m ? parseInt(m[1], 10) : 0;
      if (height >= pick.height) {
        pick = { height, url: streamUrl };
      }
    }
    if (pick.url) {
      best = pick.url.startsWith('http')
        ? pick.url
        : m3u8.replace(/[^/?#]+\.(?:m3u8|txt)(\?.*)?$/, pick.url);
    }
  } catch {}
  return best;
}

async function resolveStreamtape(embedUrl) {
  const html = String(await request(embedUrl, embedUrl));
  const m = html.match(/id="robotlink"[^>]*>([^<]+)/);
  const path = m?.[1]?.trim().replace(/^\/streamtape\.com/, '');
  if (!path) return { parse: 1, url: embedUrl };
  const getUrl = `https://streamtape.com${path}`;
  try {
    const resp = await axios.get(getUrl, {
      headers: { 'User-Agent': UA, Referer: embedUrl },
      httpsAgent: agent,
      maxRedirects: 5,
      timeout: 15000,
      validateStatus: () => true,
    });
    const loc = resp.headers?.location;
    if (loc?.includes('.mp4')) {
      return { parse: 0, url: loc };
    }
    const body = typeof resp.data === 'string' ? resp.data : '';
    const mp4 = body.match(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/)?.[0];
    if (mp4) return { parse: 0, url: mp4 };
  } catch {}
  return { parse: 1, url: embedUrl };
}

async function init(_inReq, _outResp) {
  return {};
}

async function home(_inReq, _outResp) {
  const classes = [
    { type_id: '/censored/', type_name: '有码' },
    { type_id: '/uncensored/', type_name: '无码' },
    { type_id: '/amateur/', type_name: '素人' },
    { type_id: '/popularity/', type_name: '人气' },
  ];
  return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
  const tid = inReq.body.id || '/censored/';
  const page = parseInt(inReq.body.page, 10) || 1;
  const url = buildPageUrl(tid, page);
  const html = await request(url);
  const $ = load(html);
  return {
    page,
    pagecount: page + 1,
    limit: 40,
    list: parseCards($),
  };
}

async function detail(inReq, _outResp) {
  const href = fixSiteUrl(inReq.body.id);
  const html = String(await request(href, href));
  const $ = load(html);

  const name = $('h1').first().text().trim().replace(/ライブ配信中\s*$/, '').trim();
  const pic = $('#iframe img').attr('src') || $('.nx_mfbox img').attr('src') || '';

  const unpacked = unpackDetailScript(html);
  const embeds = extractEmbeds(unpacked);
  const fromArr = [];
  const urlArr = [];
  embeds.forEach((url) => {
    fromArr.push(lineName(url));
    urlArr.push(`播放$${url}`);
  });

  return {
    list: [{
      vod_id: href,
      vod_name: name,
      vod_pic: pic,
      vod_content: '',
      vod_play_from: fromArr.join('$$$'),
      vod_play_url: urlArr.join('$$$'),
    }],
  };
}

async function play(inReq, _outResp) {
  const url = inReq.body.id;
  if (!url) {
    return { parse: 0, url: '', header: { 'User-Agent': UA, Referer: SITE + '/' } };
  }

  if (/streamtape\.com/i.test(url)) {
    const st = await resolveStreamtape(url);
    return {
      ...st,
      header: { 'User-Agent': UA, Referer: url },
    };
  }

  const html = String(await request(url, url));
  const match = html.match(PACKED_EVAL_RE);
  let playUrl = match ? extractStreamUrl(unpackPacker(match[0])) : '';
  if (!playUrl) {
    return { parse: 1, url, header: { 'User-Agent': UA, Referer: url } };
  }

  if (!playUrl.startsWith('http')) {
    playUrl = `https://${new URL(url).hostname}${playUrl}`;
  }
  playUrl = await pickBestM3u8(playUrl, url);

  return {
    parse: 0,
    url: playUrl,
    header: { 'User-Agent': UA, Referer: url },
  };
}

async function search(inReq, _outResp) {
  const wd = encodeURIComponent((inReq.body.wd || '').trim());
  if (!wd) return { list: [] };
  const html = await request(`${SITE}/search/${wd}/`);
  const $ = load(html);
  return { list: parseCards($) };
}

export default {
  meta: {
    key: 'javdirect',
    name: '🔥JAV.direct',
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
