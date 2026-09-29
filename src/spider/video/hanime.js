import { load } from 'cheerio';
import req from '../../util/req.js';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const SITE = 'https://hanime1.me';
const IGNORE_NAV = ['新番预告', 'H漫画', '无码黄油'];

async function fetchPage(url, referer = SITE) {
  const resp = await req.get(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'X-Requested-With': '',
      Referer: referer,
    },
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
  return m[1] === 'hanime1.me' || m[1].endsWith('.hanime1.me');
}

function fixHref(href) {
  if (!href) return href;
  return href.startsWith('/') ? `${SITE}${href}` : href;
}

async function init() {
  return {};
}

async function home() {
  const html = await fetchPage(SITE);
  const $ = load(html);
  cfCheck($);

  const classes = [];
  $('#main-nav-home > a.nav-item').each((_, el) => {
    const name = $(el).text();
    const href = $(el).attr('href');
    if (IGNORE_NAV.some((ig) => name.includes(ig))) return;
    classes.push({ type_name: name, type_id: encodeURI(href) });
  });

  return { class: classes, filters: {} };
}

async function category(inReq) {
  let url = inReq.body.id;
  let page = inReq.body.page || 1;
  if (page === 0) page = 1;

  if (url && !url.startsWith('http')) {
    url = SITE + (url.startsWith('/') ? url : `/${url}`);
  }
  if (page > 1) {
    url += `${url.includes('?') ? '&' : '?'}page=${page}`;
  }

  const html = await fetchPage(url);
  const $ = load(html);
  cfCheck($);

  const videos = [];
  let containers = $('.video-item-container');
  if (containers.length === 0) {
    containers = $('.home-rows-videos-wrapper > a, .content-padding-new > .row > .search-doujin-videos.col-xs-6');
  }

  containers.each((_, element) => {
    if ($(element).hasClass('video-item-container')) {
      let href = $(element).find('.video-link').attr('href');
      if (!isSameDomain(href)) return;
      href = fixHref(href);

      const title = $(element).find('.title').text().trim();
      const cover = $(element).find('.main-thumb').attr('src');
      const likes = $(element).find('.stat-item').eq(0).text().trim().replace('thumb_up', '').trim();
      const views = $(element).find('.stat-item').eq(1).text().trim();
      const remarks = [likes, views].filter(Boolean).join(' · ');

      videos.push({ vod_id: href, vod_name: title, vod_pic: cover, vod_remarks: remarks });
    } else {
      let href = $(element).attr('href') || $(element).find('.overlay').attr('href');
      if (!isSameDomain(href)) return;
      href = fixHref(href);

      const title = $(element).find('.home-rows-videos-title').text() || $(element).find('.card-mobile-title').text();
      let cover = $(element).find('img').attr('src');
      if (cover?.includes('background')) cover = $(element).find('img').eq(1).attr('src');

      videos.push({ vod_id: href, vod_name: title, vod_pic: cover, vod_remarks: remarks });
    }
  });

  return { list: videos, page, pagecount: 9999, limit: 90, total: 999999 };
}

async function detail(inReq) {
  const url = inReq.body.id;
  const html = await fetchPage(url);
  const $ = load(html);
  cfCheck($);

  const videoEl = $('video#player');
  const sources = [];

  $('link[rel="preload"][as="video"]').each((_, el) => {
    const src = $(el).attr('href');
    if (src) sources.push({ name: '默认', url: src });
  });

  if (sources.length === 0) {
    videoEl.find('source').each((_, el) => {
      const src = $(el).attr('src');
      const size = $(el).attr('size') || 'default';
      if (src) sources.push({ name: `${size}p`, url: src });
    });
  }

  if (sources.length === 0) {
    const src = videoEl.attr('src');
    if (src) sources.push({ name: '默认', url: src });
  }

  const playUrl = sources.map((s) => `${s.name}$${s.url}`).join('#');
  const title = $('h1').first().text().trim() || 'hanime';
  const pic = $('meta[property="og:image"]').attr('content') || '';

  return {
    list: [{
      vod_id: url,
      vod_name: title,
      vod_pic: pic,
      vod_play_from: 'hanime',
      vod_play_url: playUrl,
    }],
  };
}

async function play(inReq) {
  return {
    parse: 0,
    url: inReq.body.id,
    header: { 'User-Agent': UA },
  };
}

async function search(inReq) {
  const text = encodeURIComponent(inReq.body.wd || '');
  const page = parseInt(inReq.body.pg || inReq.body.page || '1', 10);
  const url = `${SITE}/search?query=${text}&broad=on&page=${page}`;

  const html = await fetchPage(url);
  const $ = load(html);

  const videos = [];
  $('.video-item-container').each((_, element) => {
    let href = $(element).find('.video-link').attr('href');
    if (!isSameDomain(href)) return;
    href = fixHref(href);

    const title = $(element).find('.title').text().trim();
    const cover = $(element).find('.main-thumb').attr('src');
    const likes = $(element).find('.stat-item').eq(0).text().trim().replace('thumb_up', '').trim();
    const views = $(element).find('.stat-item').eq(1).text().trim();
    const remarks = [likes, views].filter(Boolean).join(' · ');

    videos.push({ vod_id: href, vod_name: title, vod_pic: cover, vod_remarks: remarks });
  });

  return { list: videos };
}

export default {
  meta: {
    key: 'hanime',
    name: '🎌Hanime',
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
