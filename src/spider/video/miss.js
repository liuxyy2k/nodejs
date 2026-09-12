import { load } from 'cheerio';
import req from '../../util/req.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0';
const DEFAULT_SITE = 'https://missav.live';
const KEY_SITE = '/missavSite';
const KEY_COOKIE = '/missavCookie';

let siteBase = DEFAULT_SITE;

async function getSite(db) {
  try {
    const val = (await db.getData(KEY_SITE))?.missav || '';
    if (!val) return DEFAULT_SITE;
    return val.startsWith('http') ? val : `https://${val}`;
  } catch {
    return DEFAULT_SITE;
  }
}

async function getCookie(db) {
  try {
    return await db.getData(KEY_COOKIE) || '';
  } catch {
    return '';
  }
}

async function buildHeaders(db) {
  const headers = {
    'User-Agent': UA,
    Accept: 'application/json, text/plain, */*',
    'Accept-Encoding': 'gzip, compress, deflate, br',
  };
  const cookie = await getCookie(db);
  if (cookie) headers.Cookie = cookie;
  return headers;
}

async function request(url, db, extra = {}) {
  const headers = await buildHeaders(db);
  const resp = await req.get(url, { headers: { ...headers, ...extra } });
  return resp.data;
}

function parseList(html) {
  const $ = load(html);
  const list = [];
  $('.thumbnail').each((_, el) => {
    list.push({
      vod_id: $(el).find('.text-secondary').attr('href'),
      vod_name: $(el).find('.text-secondary').text().trim().replace(/\s+/g, ' '),
      vod_pic: $(el).find('.w-full').attr('data-src') || '',
      vod_remarks: $(el).find('.left-1').text().trim(),
      vod_duration: $(el).find('.right-1').text().trim(),
    });
  });
  return list;
}

async function init() {
  return {};
}

async function home(inReq) {
  siteBase = await getSite(inReq.server.db);
  const classes = [
    { type_id: 'dm278/cn/chinese-subtitle', type_name: '中文字幕' },
    { type_id: 'dm539/cn/new', type_name: '最近更新' },
    { type_id: 'dm634/cn/release', type_name: '新作上市' },
    { type_id: 'dm817/cn/uncensored-leak', type_name: '无码' },
    { type_id: 'dm170/cn/weekly-hot', type_name: '本周热门' },
    { type_id: 'dm270/cn/monthly-hot', type_name: '本月热门' },
    { type_id: 'dm541/cn/fc2', type_name: 'FC2' },
    { type_id: 'dm63/cn/madou', type_name: '麻豆' },
  ];

  let actors = [];
  try {
    actors = (await inReq.server.db.getData('/missavActors') || [])
      .filter((v) => v.enabled)
      .map((v) => v.name);
  } catch {
    actors = [];
  }

  const options = [
    {
      key: 'filt',
      name: '筛选',
      init: 'all',
      value: [
        { n: '全部', v: 'all' },
        { n: '单人作品', v: 'individual' },
        { n: '多人作品', v: 'multiple' },
        { n: '中文字幕', v: 'chinese-subtitle' },
      ],
    },
    {
      key: 'sort',
      name: '排序',
      init: 'released_at',
      value: [
        { n: '发行时间', v: 'released_at' },
        { n: '最近更新', v: 'published_at' },
        { n: '收藏数', v: 'saved' },
        { n: '今日浏览数', v: 'today_views' },
        { n: '本周浏览数', v: 'weekly_views' },
        { n: '本月浏览数', v: 'monthly_views' },
        { n: '总浏览数', v: 'views' },
      ],
    },
    {
      key: 'actor',
      name: '演员筛选',
      init: 'all',
      value: [
        { n: '全部', v: 'all' },
        ...actors.map((n) => ({ n, v: n })),
      ],
    },
  ];

  const filters = {};
  for (const c of classes) filters[c.type_id] = options;
  return { class: classes, filters };
}

async function category(inReq) {
  let id = inReq.body.id;
  const filters = inReq.body.filters || {};
  let page = inReq.body.page || 1;
  if (page === 0) page = 1;

  if (filters.actor && filters.actor !== 'all') {
    id = `dm74/cn/actresses/${encodeURIComponent(filters.actor)}`;
  }
  if (filters.filt && filters.filt !== 'all') {
    id += `?filters=${filters.filt}`;
  }
  if (filters.sort) {
    const sep = id.includes('?') ? '&' : '?';
    id += `${sep}sort=${filters.sort}`;
  }
  id += id.includes('?') ? `&page=${page}` : `?page=${page}`;

  const html = await request(`${siteBase}/${id}`, inReq.server.db);
  const list = parseList(html);
  return {
    page,
    pagecount: list.length < 12 ? page : page + 1,
    list,
  };
}

async function detail(inReq) {
  const url = inReq.body.id;
  const html = await request(url, inReq.server.db);
  const match = html.match(/surrit\.com\\\/(.+?)\\\/seek\\\/_0\.jpg/);
  const streams = [];

  if (match?.[1]) {
    const uuid = match[1];
    streams.push({
      name: `${uuid.slice(0, 4).toUpperCase()} Master`,
      url: `https://surrit.com/${uuid}/playlist.m3u8`,
    });
  }

  return {
    list: [{
      vod_id: url,
      vod_name: '',
      vod_pic: '',
      vod_play_from: 'MissAV',
      vod_play_url: streams.map((s) => `${s.name}$${s.url}`).join('#'),
    }],
  };
}

async function play(inReq) {
  return {
    url: inReq.body.id,
    header: {
      'User-Agent': UA,
      Referer: siteBase,
    },
  };
}

async function search(inReq) {
  let page = inReq.body.page || 1;
  if (page === 0) page = 1;

  const wd = encodeURIComponent(inReq.body.wd);
  const html = await request(`${siteBase}/cn/search/${wd}?page=${page}`, inReq.server.db);
  const list = parseList(html);
  return {
    page,
    pagecount: list.length < 12 ? page : page + 1,
    list,
  };
}

export default {
  meta: {
    key: 'missav',
    name: '🔥MissAV',
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
