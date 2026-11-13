import { load } from 'cheerio';
import req from '../../util/req.js';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const SITE = 'https://xmorex.com';
const PAGE_SIZE = 12;

const SORTS = [
  { n: '最近更新', v: '' },
  { n: '正在观看', v: 'bw' },
  { n: '最多观看', v: 'mv' },
  { n: '最多收藏', v: 'tf' },
  { n: '时长最长', v: 'lg' },
];

let xmoreActors = [];

function abs(url) {
  if (!url) return '';
  const u = String(url).trim();
  if (!u || u.startsWith('data:')) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return SITE + (u.startsWith('/') ? u : '/' + u);
}

async function fetchPage(url, referer = '') {
  const isAsync = url.includes('mode=async');
  const headers = {
    'User-Agent': UA,
    Referer: referer || SITE + '/',
    'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive',
  };

  if (isAsync) {
    headers.Accept = 'application/json, text/plain, */*';
    headers['X-Requested-With'] = 'XMLHttpRequest';
    headers['Sec-Fetch-Dest'] = 'empty';
    headers['Sec-Fetch-Mode'] = 'cors';
    headers['Sec-Fetch-Site'] = 'same-origin';
  } else {
    headers.Accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
    headers['Sec-Fetch-Dest'] = 'document';
    headers['Sec-Fetch-Mode'] = 'navigate';
    headers['Sec-Fetch-Site'] = referer ? 'same-origin' : 'none';
    headers['Sec-Fetch-User'] = '?1';
    headers['Upgrade-Insecure-Requests'] = '1';
  }

  // 走 req.js：自动带上 cookie.json 里的 Cookie，并保存响应 Set-Cookie
  const resp = await req.get(url, { headers });
  const data = resp.data;

  // Cloudflare 挑战页拦截兜底
  if (typeof data === 'string' && !/class="thumbnail"/.test(data) &&
      /Just a moment|Attention Required|cf-browser-verification|Enable JavaScript and cookies to continue/i.test(data)) {
    throw new Error(`[xmorex] blocked by cloudflare: ${url}`);
  }

  return data;
}

// 列表页统一卡片解析：.thumbnail
function parseList($) {
  const list = [];

  $('.thumbnail').each((_, el) => {
    const $el = $(el);
    const link = $el.find('a[href*="/video/"]').first();
    const href = link.attr('href');
    if (!href) return;

    const img = $el.find('img').first();
    const pic = abs(img.attr('data-src') || img.attr('src'));

    const title = (
      $el.find('a[title]').first().attr('title') ||
      link.attr('title') ||
      $el.find('.my-2 a').first().text() ||
      link.text() ||
      ''
    ).trim();

    let remarks = '';
    $el.find('span').each((__, sp) => {
      const t = $(sp).text().trim();
      if (/^\d{1,2}(:\d{2}){1,2}$/.test(t)) remarks = t;
    });

    list.push({
      vod_id: abs(href),
      vod_name: title.slice(0, 200),
      vod_pic: pic,
      vod_remarks: remarks,
    });
  });

  return list;
}

// 解析 master m3u8，拿到各清晰度地址（拿不到就退回原地址）
async function resolveStreams(m3u8Url) {
  try {
    const text = await fetchPage(m3u8Url, SITE + '/');
    if (typeof text !== 'string' || !/#EXTM3U/i.test(text)) return [];

    const lines = text.split(/\r?\n/);
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line.startsWith('#EXT-X-STREAM-INF')) continue;
      const nameMatch = line.match(/NAME="([^"]+)"/i);
      const resMatch = line.match(/RESOLUTION=\d+x(\d+)/i);
      const name = nameMatch ? nameMatch[1] : resMatch ? `${resMatch[1]}p` : `线路${out.length + 1}`;
      let url = '';
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (!next || next.startsWith('#')) continue;
        url = next;
        break;
      }
      if (url) out.push({ name, url: abs(url) });
    }
    return out;
  } catch {
    return [];
  }
}

async function init() {
  return {};
}

async function home(inReq) {
  const classes = [];
  const seen = new Set();

  const push = (type_id, type_name) => {
    const id = abs(type_id);
    if (!id || seen.has(id)) return;
    seen.add(id);
    classes.push({ type_id: id, type_name });
  };

  push(`${SITE}/videos/japanese`, '最近更新');
  push(`${SITE}/videos/uncensored`, '无码');
  push(`${SITE}/videos/uncensored-leak`, '无码流出');
  push(`${SITE}/videos/amateur`, '素人');

  try {
    xmoreActors = (await inReq.server.db.getData('/xmoreActors') || [])
      .filter((v) => v.enabled)
      .map((v) => ({ n: v.name, v: v.link }));
  } catch {
    xmoreActors = [];
  }

  // 频道分类：从首页导航里动态取
  try {
    const html = await fetchPage(SITE + '/', SITE + '/');
    const $ = load(html);
    $('a[href*="/c/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const name = $(el).text().replace(/\s+/g, ' ').trim();
      if (!name || name.length > 30) return;
      if (classes.length >= 32) return;
      push(href, `频道·${name}`);
    });
  } catch {
    // 频道抓不到不影响主分类
  }

  const sortFilter = {
    key: 'sort',
    name: '排序',
    init: '',
    value: [...SORTS],
  };

  const actorFilter = xmoreActors.length > 0
    ? [{
      key: 'actor',
      name: '演员',
      init: xmoreActors[0].v,
      value: [...xmoreActors],
    }]
    : [];

  const filters = {};
  for (const c of classes) {
    filters[c.type_id] = actorFilter.length > 0 ? [sortFilter, ...actorFilter] : [sortFilter];
  }

  return { class: classes, filters };
}

async function category(inReq) {
  const typeId = inReq.body.id;
  let page = inReq.body.page || 1;
  if (page === 0) page = 1;

  const filters = inReq.body.filters || {};
  let base = typeId;
  if (filters.actor) {
    base = abs(filters.actor);
  }

  const url = new URL(base);
  if (filters.sort) url.searchParams.set('o', filters.sort);
  if (page > 1) url.searchParams.set('page', String(page));

  const html = await fetchPage(url.toString(), abs(typeId));
  const $ = load(html);
  const list = parseList($);

  return {
    page,
    pagecount: list.length < PAGE_SIZE ? page : page + 1,
    list,
  };
}

async function detail(inReq) {
  const parts = String(inReq.body.id).split('?referer=');
  const vodUrl = parts[0];
  const referer = parts.length > 1 ? parts[1] : SITE + '/';

  const html = await fetchPage(vodUrl, referer);
  const $ = load(html);

  const name = $('h1').first().text().replace(/\s+/g, ' ').trim();

  let pic = '';
  $('img').each((_, el) => {
    const src = $(el).attr('src') || '';
    if (!pic && /img\.xmorex\.com/i.test(src)) pic = abs(src);
  });

  const actors = [];
  $('a[href*="/actresses/"]').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (t && !actors.includes(t)) actors.push(t);
  });

  const tags = [];
  $('a[href*="/search/videos/"]').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (t && !tags.includes(t)) tags.push(t);
  });

  // 播放源：页面里 <video id="vidstack-target" src="/media/videos/v_<vkey>.m3u8">
  let srcUrl = $('#vidstack-target').attr('src') || '';
  if (!srcUrl) {
    const matched = html.match(/\/media\/videos\/v_[a-zA-Z0-9]+\.m3u8/);
    if (matched) srcUrl = matched[0];
  }
  if (!srcUrl) {
    const vkey = vodUrl.split('/video/')[1];
    if (vkey) srcUrl = `/media/videos/v_${vkey.split(/[?#]/)[0]}.m3u8`;
  }

  const m3u8 = abs(srcUrl);
  const streams = m3u8 ? await resolveStreams(m3u8) : [];
  const items = [];
  if (m3u8) items.push(`自动$${m3u8}`);
  for (const s of streams) items.push(`${s.name}$${s.url}`);
  const playUrls = items.join('#');

  return {
    list: [{
      vod_id: vodUrl,
      vod_name: name,
      vod_pic: pic,
      vod_actor: actors.join(','),
      vod_area: '',
      vod_lang: '日语',
      vod_year: '',
      vod_remarks: '',
      vod_content: tags.join(','),
      vod_play_from: 'XMOREX',
      vod_play_url: playUrls,
    }],
  };
}

async function play(inReq) {
  return {
    url: inReq.body.id,
    header: {
      'User-Agent': UA,
      Referer: SITE + '/',
      Origin: SITE,
    },
  };
}

async function search(inReq) {
  let page = inReq.body.page || 1;
  if (page === 0) page = 1;

  const wd = encodeURIComponent(inReq.body.wd);
  let url = `${SITE}/search/videos/${wd}`;
  if (page > 1) url += `?page=${page}`;

  const html = await fetchPage(url, SITE + '/');
  const $ = load(html);
  const list = parseList($);

  return {
    page,
    pagecount: list.length < PAGE_SIZE ? page : page + 1,
    list,
  };
}

export default {
  meta: {
    key: 'xmorex',
    name: '🌸Xmorex',
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
