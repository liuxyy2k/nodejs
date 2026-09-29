import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SITE = 'https://591av.ws';
const HOME = `${SITE}/pp1/`;

async function request(reqUrl, headers = {}) {
  const resp = await axios.get(reqUrl, {
    headers: { 'User-Agent': UA, Referer: HOME, ...headers },
    timeout: 30000,
    validateStatus: () => true,
  });
  return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
}

function parseVods($) {
  const videos = [];
  $('.item.card-video').each((_, element) => {
    const url = $(element).find('figure a').attr('href') || '';
    const pic = $(element).find('img').attr('data-src') || $(element).find('img').attr('src') || '';
    const name = $(element).find('.card-video__title').text().trim();
    const remark = $(element).find('.card-video__duration').text().trim();
    if (pic.endsWith('.gif') || !name || !url) return;
    videos.push({
      vod_id: url,
      vod_name: name,
      vod_pic: pic,
      vod_remarks: remark,
    });
  });
  return videos;
}

function fixPath(tid) {
  const raw = String(tid || '').trim();
  if (raw.startsWith('http')) return raw;
  if (raw.startsWith('/')) return `${SITE}${raw}`;
  return `${SITE}/${raw}`;
}

function buildListUrl(tid, page) {
  const pg = parseInt(page, 10) || 1;
  const path = String(tid || '/new/').replace(/^folder_/, '');

  if (path === '/categories/' || path === `${SITE}/categories/`) {
    return `${SITE}/categories/`;
  }

  if (path === '/new/' || path === `${SITE}/new/`) {
    return `${SITE}/new/?mode=async&function=get_block&block_id=list_videos_latest_videos_list&sort_by=post_date&from=${pg}&_=${Date.now()}`;
  }

  if (path === '/pp1/hot/' || path === `${SITE}/pp1/hot/`) {
    return `${SITE}/pp1/hot/?mode=async&function=get_block&block_id=list_videos_common_videos_list&sort_by=video_viewed_today&from=${pg}&_=${Date.now()}`;
  }

  let base = fixPath(path);
  if (!base.endsWith('/')) base += '/';
  return `${base}?mode=async&function=get_block&block_id=list_videos_common_videos_list&sort_by=post_date&from=${pg}&_=${Date.now()}`;
}

function extractM3u8(html) {
  const urls = [...String(html || '').matchAll(/https?:\/\/[^\s'"]+\.m3u8/gi)]
    .map((m) => m[0])
    .filter((u) => !/preview\.m3u8/i.test(u));
  const uniq = [...new Set(urls)];
  return uniq.find((u) => /jmpres|591av\.ws/i.test(u)) || uniq[0] || '';
}

async function init(_inReq, _outResp) {
  return {};
}

async function home(_inReq, _outResp) {
  const classes = [
    { type_id: '/new/', type_name: '最新上架' },
    { type_id: '/pp1/hot/', type_name: '近期热门' },
    { type_id: '/categories/', type_name: '所有分类' },
  ];
  return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
  const tid = inReq.body.id;
  const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
  let list = [];

  if (tid === '/categories/' || tid === `${SITE}/categories/`) {
    const html = await request(`${SITE}/categories/`);
    const $ = load(html);
    $('.card-cat-v2').each((_, element) => {
      const url = $(element).find('a').attr('href') || '';
      const pic = $(element).find('img').attr('src') || '';
      const name = $(element).find('.card-cat-v2__title').text().trim();
      const remark = $(element).find('.card-cat-v2__count').text().trim();
      if (!url || !name) return;
      list.push({
        vod_id: `folder_${url}`,
        vod_name: name,
        vod_pic: pic,
        vod_tag: 'folder',
        style: { ratio: 1.77, type: 'rect' },
        vod_remarks: remark,
      });
    });
  } else if (String(tid || '').startsWith('folder_')) {
    const url = buildListUrl(tid, page);
    const html = await request(url);
    list = parseVods(load(html));
  } else {
    const url = buildListUrl(tid, page);
    const html = await request(url);
    list = parseVods(load(html));
  }

  return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
  const id = inReq.body.id;
  const html = await request(id, { Referer: HOME });
  const $ = load(html);

  const name = $('meta[property="og:title"]').attr('content') || '';
  const pic = $('meta[property="og:image"]').attr('content') || '';
  const description = $('meta[property="description"]').attr('content') || '';
  let playUrl = extractM3u8(html);
  if (!playUrl) {
    const text = $('section.max-width-md').text() || '';
    playUrl = extractM3u8(text);
  }

  return {
    list: [{
      vod_id: id,
      vod_name: name,
      vod_pic: pic,
      vod_play_from: '591AV',
      vod_play_url: playUrl ? `播放$${playUrl}` : '',
      vod_content: description,
    }],
  };
}

async function play(inReq, _outResp) {
  return {
    parse: 0,
    url: inReq.body.id || '',
    header: { 'User-Agent': UA, Referer: HOME },
  };
}

async function search(inReq, _outResp) {
  const wd = encodeURIComponent((inReq.body.wd || '').trim());
  const page = parseInt(inReq.body.pg || inReq.body.page || 1, 10) || 1;
  if (!wd) return { list: [] };

  const url = `${SITE}/search/${wd}/?mode=async&function=get_block&block_id=list_videos_videos_list_search_result&q=${wd}&category_ids=&sort_by=&from_videos=${page}&from_albums=${page}&_=${Date.now()}`;
  const html = await request(url);
  const list = parseVods(load(html));
  if (list.length) return { list };

  const fallback = await request(`${SITE}/search/${wd}/`);
  return { list: parseVods(load(fallback)) };
}

export default {
  meta: {
    key: 'av591',
    name: '🌸亚洲素人',
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
