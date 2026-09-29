import { load } from 'cheerio';
import req from '../../util/req.js';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const SITE = 'https://www.hanime1.my';
const ENTRY = `${SITE}/enter`;
const IGNORE_NAV = ['新番预告', 'H漫画', '无码黄油', '新番預告', '無碼18禁游', 'H漫畫'];

async function fetchPage(url, referer = ENTRY) {
  const resp = await req.get(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      Referer: referer,
    },
    timeout: 20000,
    validateStatus: () => true,
  });
  return resp.data;
}

function cfCheck($) {
  if ($('title').text() === 'Just a moment...') throw new Error('CF blocked');
}

function isSameDomain(href) {
  if (!href?.includes('://')) return true;
  const m = href.match(/https?:\/\/([^/]+)/);
  if (!m) return true;
  const host = m[1].toLowerCase();
  return host === 'hanime1.my' || host.endsWith('.hanime1.my');
}

function fixHref(href) {
  if (!href) return href;
  if (href.startsWith('http')) return href;
  return href.startsWith('/') ? `${SITE}${href}` : `${SITE}/${href}`;
}

function buildPageUrl(raw, page) {
  let url = String(raw || '').trim();
  if (!url) return ENTRY;
  try {
    if (url.includes('%')) url = decodeURIComponent(url);
  } catch {}
  if (url && !url.startsWith('http')) {
    url = SITE + (url.startsWith('/') ? url : `/${url}`);
  }
  if (page > 1) {
    url += `${url.includes('?') ? '&' : '?'}page=${page}`;
  }
  return url;
}

function pickCardTitle($el) {
  return $el.find('.home-rows-videos-title').text().trim()
    || $el.find('.card-mobile-title').text().trim()
    || $el.find('.title').text().trim()
    || $el.find('img').attr('alt')?.trim()
    || '';
}

function parseVideoList($) {
  const videos = [];
  const seen = new Set();

  const pushItem = (href, title, cover, remarks = '') => {
    if (!href || !title || seen.has(href)) return;
    if (!isSameDomain(href)) return;
    href = fixHref(href);
    seen.add(href);
    videos.push({ vod_id: href, vod_name: title, vod_pic: cover || '', vod_remarks: remarks });
  };

  $('.video-item-container').each((_, element) => {
    const $el = $(element);
    const href = $el.find('.video-link').attr('href');
    const title = $el.find('.title').text().trim();
    const cover = $el.find('.main-thumb').attr('src');
    const likes = $el.find('.stat-item').eq(0).text().trim().replace('thumb_up', '').trim();
    const views = $el.find('.stat-item').eq(1).text().trim();
    pushItem(href, title, cover, [likes, views].filter(Boolean).join(' · '));
  });

  $('.home-rows-videos-wrapper > a[href*="/watch"], .content-padding-new > .row > .search-doujin-videos.col-xs-6').each((_, element) => {
    const $el = $(element);
    const href = $el.attr('href') || $el.find('.overlay').attr('href') || $el.find('a[href*="/watch"]').attr('href');
    const title = pickCardTitle($el);
    let cover = $el.find('img').attr('src') || $el.find('img').attr('data-src');
    if (cover?.includes('background')) cover = $el.find('img').eq(1).attr('src');
    pushItem(href, title, cover);
  });

  return videos;
}

function pickTitle($) {
  const og = $('meta[property="og:title"]').attr('content') || '';
  if (og) return og.replace(/\s*-\s*hanime1\.my\s*$/i, '').trim();
  return $('h1').first().text().trim() || $('title').text().split('-')[0].trim() || 'hanime1';
}

async function init(_inReq, _outResp) {
  return {};
}

async function home(_inReq, _outResp) {
  const html = await fetchPage(ENTRY);
  const $ = load(html);
  cfCheck($);

  const classes = [];
  $('#main-nav-home > a.nav-item').each((_, el) => {
    const name = $(el).text().trim();
    const href = $(el).attr('href');
    if (!href || IGNORE_NAV.some((ig) => name.includes(ig))) return;
    classes.push({ type_name: name, type_id: encodeURI(href) });
  });

  return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
  const page = parseInt(inReq.body.page, 10) || 1;
  const url = buildPageUrl(inReq.body.id, page);

  const html = await fetchPage(url);
  const $ = load(html);
  cfCheck($);

  return {
    list: parseVideoList($),
    page,
    pagecount: 9999,
    limit: 90,
    total: 999999,
  };
}

async function detail(inReq, _outResp) {
  const url = fixHref(inReq.body.id);
  const html = await fetchPage(url);
  const $ = load(html);
  cfCheck($);

  const sources = [];
  $('link[rel="preload"][as="video"]').each((_, el) => {
    const src = $(el).attr('href');
    if (src) sources.push({ name: '默认', url: fixHref(src) });
  });

  if (sources.length === 0) {
    $('video#player source').each((_, el) => {
      const src = $(el).attr('src');
      const size = $(el).attr('size') || 'default';
      if (src) sources.push({ name: `${size}p`, url: fixHref(src) });
    });
  }

  if (sources.length === 0) {
    const src = $('video#player').attr('src');
    if (src) sources.push({ name: '默认', url: fixHref(src) });
  }

  sources.sort((a, b) => parseInt(b.name, 10) - parseInt(a.name, 10));

  const playUrl = sources.map((s) => `${s.name}$${s.url}`).join('#');
  const title = pickTitle($);
  const pic = $('meta[property="og:image"]').attr('content') || '';

  return {
    list: [{
      vod_id: url,
      vod_name: title,
      vod_pic: pic,
      vod_play_from: 'hanime1',
      vod_play_url: playUrl,
    }],
  };
}

async function play(inReq, _outResp) {
  return {
    parse: 0,
    url: inReq.body.id,
    header: {
      'User-Agent': UA,
      Referer: ENTRY,
    },
  };
}

async function search(inReq, _outResp) {
  const text = encodeURIComponent(inReq.body.wd || '');
  const page = parseInt(inReq.body.pg || inReq.body.page || '1', 10);
  const url = `${SITE}/search?query=${text}&broad=on&page=${page}`;

  const html = await fetchPage(url);
  const $ = load(html);
  cfCheck($);

  return { list: parseVideoList($), page };
}

export default {
  meta: {
    key: 'hanime1',
    name: '🎌Hanime1.my',
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
