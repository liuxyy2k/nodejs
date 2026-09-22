import axios from 'axios';
import crypto from 'crypto';
import { load } from 'cheerio';

const PORT = process.env.DEV_HTTP_PORT || 9988;
const PREFIX = '/spider/baoliao/3';
const SITE = 'https://52baoliao.net';
const AES_KEY = Buffer.from('f5d965df75336270');
const AES_IV = Buffer.from('97b60394abc2fbe1');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-S9080) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  Referer: `${SITE}/`,
  'Accept-Language': 'zh-CN,zh;q=0.9',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

const CLASSES = [
  { type_id: 'home', type_name: '首页' },
  { type_id: 'jinri-baoliao', type_name: '今日爆料' },
  { type_id: 'benzhou-rebang', type_name: '本周热榜' },
  { type_id: 'mingxing-heiliao', type_name: '明星黑料' },
  { type_id: 'wanghong-zhubo', type_name: '网红主播' },
  { type_id: 'xiaoyuan-heiliao', type_name: '校园黑料' },
  { type_id: 'shehui-redian', type_name: '社会热点' },
  { type_id: 'ai-chengrenduanju', type_name: 'AI成人短剧' },
  { type_id: 'ai-huanlian', type_name: 'AI换脸' },
  { type_id: 'ai-tuoyi', type_name: 'AI脱衣' },
  { type_id: 'fuliji', type_name: '福利姬' },
  { type_id: '91-tanhua', type_name: '91探花' },
  { type_id: 'av-kanpian', type_name: 'AV看片' },
  { type_id: 'cunzhi-tiaozhan', type_name: '寸止挑战' },
  { type_id: 'pmv-hunjian', type_name: 'PMV混剪' },
  { type_id: 'cos-erciyuan', type_name: 'cos二次元' },
  { type_id: 'zipai-toupai', type_name: '自拍偷拍' },
  { type_id: 'fancha-renqi', type_name: '反差人妻' },
  { type_id: 'fancha-nvshen', type_name: '反差女神' },
  { type_id: 'luanlun-chigua', type_name: '乱伦吃瓜' },
  { type_id: 'sm-tiaojiao', type_name: 'SM调教' },
  { type_id: 'ts-weiniang', type_name: 'TS伪娘' },
  { type_id: 'lieqi-zhongkou', type_name: '猎奇重口' },
  { type_id: 'yuanchuang-tougao', type_name: '原创投稿' },
];

function unescapeHtml(s) {
  return String(s || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim();
}

function absUrl(u) {
  if (!u) return '';
  const raw = String(u).trim();
  if (raw.startsWith('//')) return `https:${raw}`;
  if (/^https?:\/\//i.test(raw)) return raw;
  try {
    return new URL(raw, `${SITE}/`).href;
  } catch {
    return raw;
  }
}

function e64url(s) {
  return Buffer.from(String(s || ''), 'utf8').toString('base64url');
}

function d64url(s) {
  try {
    return Buffer.from(String(s || ''), 'base64url').toString('utf8');
  } catch {
    return '';
  }
}

function proxyPic(url, inReq) {
  url = absUrl(url);
  if (!url) return '';
  const prefix = inReq?.server?.prefix || PREFIX;
  return `http://127.0.0.1:${PORT}${prefix}/img?url=${encodeURIComponent(e64url(url))}`;
}

function aesDecrypt(buf) {
  const decipher = crypto.createDecipheriv('aes-128-cbc', AES_KEY, AES_IV);
  return Buffer.concat([decipher.update(buf), decipher.final()]);
}

function looksLikeImage(raw) {
  return (
    (raw[0] === 0xff && raw[1] === 0xd8)
    || raw.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    || raw.slice(0, 4).toString('ascii') === 'GIF8'
    || raw.slice(0, 4).toString('ascii') === 'RIFF'
  );
}

function decodePic(data) {
  let raw = Buffer.from(data || []);
  try {
    if (raw.length && raw.length % 16 === 0 && !looksLikeImage(raw)) {
      try {
        raw = aesDecrypt(raw);
      } catch {
        const d = crypto.createDecipheriv('aes-128-cbc', AES_KEY, AES_IV);
        d.setAutoPadding(false);
        raw = Buffer.concat([d.update(raw), d.final()]);
      }
    }
  } catch {}
  let mime = 'image/jpeg';
  if (raw[0] === 0xff && raw[1] === 0xd8) mime = 'image/jpeg';
  else if (raw.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) mime = 'image/png';
  else if (raw.slice(0, 3).toString('ascii') === 'GIF') mime = 'image/gif';
  else if (raw.slice(0, 4).toString('ascii') === 'RIFF' && raw.slice(8, 12).toString('ascii') === 'WEBP') mime = 'image/webp';
  return { raw, mime };
}

function isVideoFormat(url) {
  if (!url) return false;
  const u = String(url).toLowerCase();
  return /\.(?:m3u8|mp4|flv|mkv|ts|avi)(?:$|[?#])/i.test(u) || u.includes('m3u8');
}

async function getHtml(url, referer = HEADERS.Referer) {
  try {
    const resp = await axios.get(url, {
      headers: { ...HEADERS, Referer: referer },
      timeout: 20000,
      maxRedirects: 5,
      validateStatus: () => true,
      responseType: 'text',
    });
    if (resp.status >= 400) return '';
    return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
  } catch {
    return '';
  }
}

function extractPosts(html, allowHot = true, inReq) {
  const $ = load(html);
  const out = [];
  const seen = new Set();

  $('article').each((_, element) => {
    const article = $(element);
    const cls = article.attr('class') || '';
    if (cls.includes('ad-item')) return;

    const href = article.find('a[href*="/archives/"]').first().attr('href') || '';
    const vid = href.match(/\/archives\/(\d+)/)?.[1];
    if (!vid || seen.has(vid)) return;

    const title = article.attr('data-track-item-name')
      || article.find('h2.post-card-title, h2').first().text().trim()
      || article.find('img').attr('alt')
      || '';
    const pic = article.find('img').attr('z-image-loader-url')
      || article.find('[data-banner-src]').attr('data-banner-src')
      || article.find('img').attr('data-src')
      || article.find('img').attr('src')
      || '';

    seen.add(vid);
    out.push({
      vod_id: vid,
      vod_name: unescapeHtml(title),
      vod_pic: proxyPic(pic, inReq),
      vod_remarks: '',
    });
  });

  if (!out.length && allowHot) {
    const hm = html.match(/var\s+hotRankList\s*=\s*(\[[\s\S]*?\]);/);
    if (hm) {
      try {
        const hotList = JSON.parse(hm[1]);
        for (const item of hotList) {
          const vid = String(item?.cid || '');
          if (!vid || seen.has(vid)) continue;
          seen.add(vid);
          out.push({
            vod_id: vid,
            vod_name: unescapeHtml(item.title || ''),
            vod_pic: '',
            vod_remarks: item.hot_formatted || item.hot || '',
          });
        }
      } catch {}
    }
  }

  return out;
}

function extractVideo(html) {
  const tryConfig = (raw) => {
    try {
      const cfg = JSON.parse(raw);
      const url = cfg?.video?.url || '';
      if (url && isVideoFormat(url)) return url;
    } catch {}
    return '';
  };

  const m1 = html.match(/<div[^>]*class="[^"]*dplayer[^"]*"[^>]*data-config='([^']+)'/i);
  if (m1) {
    const url = tryConfig(m1[1]);
    if (url) return url;
  }
  const m2 = html.match(/<div[^>]*class="[^"]*dplayer[^"]*"[^>]*data-config="([^"]+)"/i);
  if (m2) {
    const url = tryConfig(m2[1].replace(/&quot;/g, '"'));
    if (url) return url;
  }

  const m3u8 = html.match(/(https?:\/\/[^\s"'<>]+?\.m3u8[^\s"'<>]*)/i);
  if (m3u8) return m3u8[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
  const mp4 = html.match(/(https?:\/\/[^\s"'<>]+?\.mp4[^\s"'<>]*)/i);
  if (mp4) return mp4[1];
  const iframe = html.match(/<iframe[^>]+src="([^"]+)"/i);
  return iframe ? iframe[1] : '';
}

function buildListUrl(tid, page) {
  const pg = parseInt(page, 10) || 1;
  const id = String(tid || 'home').replace(/^\/+|\/+$/g, '');

  if (!id || id === 'home') {
    return pg > 1 ? `${SITE}/page/${pg}/` : `${SITE}/`;
  }
  return pg > 1 ? `${SITE}/category/${id}/page/${pg}/` : `${SITE}/category/${id}/`;
}

function buildSearchUrl(keyword, page) {
  const q = encodeURIComponent(String(keyword || '').trim());
  const pg = parseInt(page, 10) || 1;
  if (!q) return '';
  return pg > 1 ? `${SITE}/search/${q}/page/${pg}/` : `${SITE}/search/${q}/`;
}

async function init() {
  return {};
}

async function home(inReq, _outResp) {
  const html = await getHtml(`${SITE}/`);
  return {
    class: CLASSES,
    list: extractPosts(html, true, inReq),
  };
}

async function category(inReq, _outResp) {
  const tid = inReq.body.id || 'home';
  const pg = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
  const url = buildListUrl(tid, pg);
  const html = await getHtml(url);
  if (!html) return { list: [], page: pg, pagecount: pg, limit: 20, total: 0 };

  const list = extractPosts(html, true, inReq);
  let pagecount = pg + 1;
  const totalM = html.match(/<span class="page-info" data-total="(\d+)">/);
  if (totalM) pagecount = parseInt(totalM[1], 10);
  else if (!html.includes('下一页') && !html.includes('next')) pagecount = pg;

  return { list, page: pg, pagecount, limit: 20, total: list.length };
}

async function detail(inReq, _outResp) {
  let vid = inReq.body.id;
  if (Array.isArray(vid)) vid = vid[0];
  vid = String(vid || '').trim();
  if (!vid) return { list: [] };

  const html = await getHtml(`${SITE}/archives/${vid}/`);
  if (!html) return { list: [] };

  const $ = load(html);
  let title = $('h1.post-title').first().text().trim();
  if (!title) {
    title = unescapeHtml(html.match(/<title[^>]*>([^<]{2,120})<\/title>/i)?.[1] || '');
  }

  const pic = html.match(/<img[^>]+data-xkrkllgl="([^"]+)"/i)?.[1]
    || $('meta[property="og:image"]').attr('content')
    || $('[data-banner-src]').attr('data-banner-src')
    || '';

  const videoUrl = extractVideo(html);
  return {
    list: [{
      vod_id: vid,
      vod_name: unescapeHtml(title),
      vod_pic: proxyPic(pic, inReq),
      vod_content: $('meta[name="description"]').attr('content') || '',
      vod_play_from: '52爆料',
      vod_play_url: videoUrl ? `正片$${videoUrl}` : '',
    }],
  };
}

async function search(inReq, _outResp) {
  const wd = String(inReq.body.wd || '').trim();
  const pg = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
  if (!wd) return { list: [] };

  const url = buildSearchUrl(wd, pg);
  const html = await getHtml(url);
  return { list: html ? extractPosts(html, false, inReq) : [], page: pg };
}

async function play(inReq, _outResp) {
  let url = inReq.body.id;
  if (Array.isArray(url)) url = url[0];
  url = String(url || '').trim();
  if (!url) return { parse: 0, url: '', header: HEADERS };
  if (isVideoFormat(url)) {
    return { parse: 0, url, header: HEADERS };
  }
  if (/^https?:\/\//i.test(url)) {
    return { parse: 1, url, header: HEADERS };
  }
  return { parse: 0, url: '', header: HEADERS };
}

async function imgProxy(inReq, reply) {
  try {
    let u = decodeURIComponent(String(inReq.query.url || ''));
    const decoded = d64url(u);
    if (decoded.startsWith('http')) u = decoded;
    if (!/^https?:\/\//i.test(u)) return reply.code(403).send('');
    const resp = await axios.get(u, {
      headers: HEADERS,
      timeout: 15000,
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });
    if (resp.status >= 400) return reply.code(resp.status).send('');
    const { raw, mime } = decodePic(Buffer.from(resp.data));
    reply.header('Content-Type', mime).send(raw);
  } catch {
    reply.code(403).send('');
  }
}

export default {
  meta: {
    key: 'baoliao',
    name: '🔥52爆料',
    type: 3,
  },
  api: async (fastify) => {
    fastify.post('/init', init);
    fastify.post('/home', home);
    fastify.post('/category', category);
    fastify.post('/detail', detail);
    fastify.post('/play', play);
    fastify.post('/search', search);
    fastify.get('/img', imgProxy);
  },
};
