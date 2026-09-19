import axios from 'axios';
import crypto from 'crypto';
import { load } from 'cheerio';
import { HttpsProxyAgent } from 'https-proxy-agent';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SITE = 'https://jffcz1.mnwnmwqcd.cc';
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const PORT = process.env.DEV_HTTP_PORT || 9988;

function e64(s) {
  try { return Buffer.from(s || '').toString('base64'); } catch { return ''; }
}

function d64(s) {
  try { return Buffer.from(s || '', 'base64').toString('utf-8'); } catch { return ''; }
}

function aesDecrypt(buf) {
  const key = Buffer.from('f5d965df75336270');
  const iv = Buffer.from('97b60394abc2fbe1');
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([decipher.update(buf), decipher.final()]);
}

function proxyImgUrl(raw) {
  if (!raw) return '';
  return `http://127.0.0.1:${PORT}/spider/chig17/3/img?url=${encodeURIComponent(e64(raw))}`;
}

function pickCoverImg(el) {
  const img = el.find('img').first();
  return img.attr('data-xkrkllgl')
    || img.attr('z-image-loader-url')
    || img.attr('data-src')
    || '';
}

const CLASSES = [
  { type_id: '17chiguawang', type_name: '最新吃瓜' },
  { type_id: 'resoudagua', type_name: '热搜大瓜' },
  { type_id: 'meiridasai', type_name: '每日大赛' },
  { type_id: 'lieqichigua', type_name: '吃瓜猎奇' },
  { type_id: 'wanghongchigua', type_name: '网红明星' },
  { type_id: 'wangyoubaoliao', type_name: '反差女神' },
  { type_id: 'xiaoyuanbaoliao', type_name: '校园爆料' },
  { type_id: 'haijiaoshequ', type_name: '海角乱伦' },
  { type_id: 'wanghuangzhuanqu', type_name: '网黄专区' },
  { type_id: 'chiguabaoliao', type_name: '原创专区' },
  { type_id: 'tanhuajingxuan', type_name: '探花精选' },
  { type_id: 'haiwaichigua', type_name: '自拍偷拍' },
  { type_id: 'lpzq', type_name: '撸片专区' },
  { type_id: 'duanjuyingshi', type_name: 'AI短剧' },
  { type_id: 'jinmantiantang', type_name: '禁漫天堂' },
];

async function request(url) {
  const resp = await axios.get(url, {
    headers: {
      'User-Agent': UA,
      Referer: `${SITE}/`,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    timeout: 20000,
    validateStatus: () => true,
  });
  return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
}

function parseVods($) {
  const items = [];
  const seen = new Set();

  $('article').each((_, element) => {
    const el = $(element);
    const url = el.find('a[href*="/archives/"]').first().attr('href') || '';
    const name = el.find('.post-card-title').text().trim();
    const date = el.find('span[itemprop="datePublished"]').text().trim();
    const rawPic = pickCoverImg(el);
    const id = url.match(/\/archives\/(\d+)/)?.[1] || '';

    if (!name || !id || seen.has(id)) return;
    seen.add(id);
    items.push({
      vod_id: id,
      vod_name: name,
      vod_pic: proxyImgUrl(rawPic),
      vod_remarks: date.replace(/\s*年\s*|\s*月\s*/g, '-').replace(/\s*日/, ''),
    });
  });

  return items;
}

function categoryUrl(tid, page) {
  const slug = encodeURIComponent(String(tid || '17chiguawang'));
  if (page > 1) return `${SITE}/category/${slug}/${page}/`;
  return `${SITE}/category/${slug}/`;
}

function detailUrl(id) {
  const vid = String(id || '').replace(/^\/archives\//, '').replace(/\/$/, '');
  return `${SITE}/archives/${vid}/`;
}

function pickTitle(raw) {
  return String(raw || '').replace(/\s*-\s*17吃瓜网\s*$/, '').trim();
}

async function init(_inReq, _outResp) {
  return {};
}

async function home(_inReq, _outResp) {
  return { class: CLASSES, filters: {} };
}

async function category(inReq, _outResp) {
  const tid = inReq.body.id || '17chiguawang';
  const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
  const html = await request(categoryUrl(tid, page));
  const $ = load(html);

  return {
    page,
    pagecount: page + 1,
    limit: 30,
    list: parseVods($),
  };
}

async function detail(inReq, _outResp) {
  const id = inReq.body.id;
  const html = await request(detailUrl(id));
  const $ = load(html);

  const name = pickTitle($('meta[property="og:title"]').attr('content') || $('h1.post-title').text().trim());
  const pic = $('meta[property="og:image"]').attr('content') || '';
  const year = $('meta[property="video:release_date"]').attr('content') || '';

  const playParts = [];
  let index = 1;
  $('div.dplayer').each((_, element) => {
    try {
      const config = JSON.parse($(element).attr('data-config') || '{}');
      const videoUrl = config?.video?.url || '';
      if (videoUrl) {
        playParts.push(`第${index}集$${videoUrl}`);
        index += 1;
      }
    } catch {}
  });

  return {
    list: [{
      vod_id: id,
      vod_name: name,
      vod_pic: pic,
      vod_year: year,
      vod_play_from: '17吃瓜',
      vod_play_url: playParts.join('#'),
    }],
  };
}

async function play(inReq, _outResp) {
  const url = inReq.body.id || '';
  const isDirect = /\.(m3u8|mp4|flv)(\?|$)/i.test(url);
  return {
    parse: isDirect ? 0 : 1,
    url,
    header: {
      'User-Agent': UA,
      Referer: `${SITE}/`,
    },
  };
}

async function search(inReq, _outResp) {
  const wd = encodeURIComponent((inReq.body.wd || '').trim());
  if (!wd) return { list: [] };
  const html = await request(`${SITE}/search/${wd}/`);
  const $ = load(html);
  return { list: parseVods($) };
}

async function imgProxy(inReq, reply) {
  try {
    let raw = d64(inReq.query.url);
    const match = raw.match(/loadBannerDirect\('([^']*)'/);
    if (match) raw = match[1];
    if (!raw) return reply.code(404).send('');

    const resp = await axios.get(raw, {
      headers: {
        'User-Agent': UA,
        Referer: `${SITE}/`,
        Origin: SITE,
      },
      responseType: 'arraybuffer',
      timeout: 10000,
    });

    const decrypted = aesDecrypt(Buffer.from(resp.data));
    let ct = 'image/jpeg';
    if (decrypted[0] === 0x89 && decrypted[1] === 0x50) ct = 'image/png';
    else if (decrypted.slice(0, 4).toString() === 'GIF8') ct = 'image/gif';

    reply.header('Content-Type', ct).send(decrypted);
  } catch (e) {
    console.error('[chig17] imgProxy error:', e.message);
    reply.code(500).send('');
  }
}

export default {
  meta: {
    key: 'chig17',
    name: '🔥17吃瓜',
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
