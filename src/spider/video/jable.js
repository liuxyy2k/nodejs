import { load } from 'cheerio';
import req from '../../util/req.js';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const SITE = 'https://jable.tv';

let jableActors = [];

async function fetchPage(url, referer = '') {
  const isAsync = url.includes('mode=async');
  const headers = {
    'User-Agent': UA,
    Referer: referer || SITE,
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
  return resp.data;
}

async function init() {
  return {};
}

async function home(inReq) {
  const classes = [];
  const ignore = ['首页'];

  classes.push(
    { type_id: `${SITE}/models/`, type_name: '演员列表' },
    { type_id: `${SITE}/hot/`, type_name: '热度排行' },
  );

  try {
    jableActors = (await inReq.server.db.getData('/jableActors') || [])
      .filter((v) => v.enabled)
      .map((v) => ({ n: v.name, v: v.link }));
  } catch {
    jableActors = [];
  }

  const catUrl = `${SITE}/categories/?mode=async&function=get_block&block_id=list_categories_video_categories_list&sort_by=avg_videos_popularity`;
  const html = await fetchPage(catUrl, SITE);
  const $ = load(html);

  $('.container .col-6.col-sm-4.col-lg-3').each((_, el) => {
    const name = $(el).find('h4').text();
    const href = $(el).find('a').attr('href');
    if (!ignore.includes(name)) {
      classes.push({ type_id: href, type_name: name });
    }
  });

  const hotSort = [{
    key: 'sort',
    name: '排序',
    init: 'video_viewed_month',
    value: [
      { n: '所有时间', v: 'video_viewed' },
      { n: '本月热门', v: 'video_viewed_month' },
      { n: '本周热门', v: 'video_viewed_week' },
      { n: '今日热门', v: 'video_viewed_today' },
    ],
  }];

  const defaultSort = [{
    key: 'sort',
    name: '排序',
    init: 'post_date',
    value: [
      { n: '近期最佳', v: 'post_date_and_popularity' },
      { n: '最近更新', v: 'post_date' },
      { n: '最多观看', v: 'video_viewed' },
      { n: '最高收藏', v: 'most_favourited' },
    ],
  }];

  const modelFilters = [
    defaultSort[0],
    {
      key: 'actor',
      name: '演员',
      init: jableActors.length > 0 ? jableActors[0].v : '',
      value: [...jableActors],
    },
  ];

  const filters = {};
  for (const c of classes) {
    if (c.type_id === `${SITE}/hot/`) filters[c.type_id] = hotSort;
    else if (c.type_id === `${SITE}/models/`) filters[c.type_id] = modelFilters;
    else filters[c.type_id] = defaultSort;
  }

  return { class: classes, filters };
}

async function category(inReq) {
  const typeId = inReq.body.id;
  let page = inReq.body.page || 1;
  if (page === 0) page = 1;

  const filters = inReq.body.filters || {};
  let urlBase = typeId;
  if (filters.actor) {
    urlBase = `${typeId}/${filters.actor}/`;
  }

  const sort = filters.sort || 'post_date';
  const url = `${urlBase}?mode=async&function=get_block&block_id=list_videos_common_videos_list&sort_by=${sort}&from=${page}&_=${Date.now()}`;
  const html = await fetchPage(url, typeId);
  const $ = load(html);
  const list = [];

  $('#list_videos_common_videos_list .container .row > div').each((_, el) => {
    const href = $(el).find('.title a').attr('href');
    const title = $(el).find('.title a').text();
    const pic = $(el).find('.img-box img').attr('data-src');
    const remarks = $(el).find('.label').text();
    list.push({
      vod_id: `${href}?referer=${typeId}`,
      vod_name: title,
      vod_pic: pic,
      vod_remarks: remarks,
    });
  });

  return {
    page,
    pagecount: list.length < 12 ? page : page + 1,
    list,
  };
}

async function detail(inReq) {
  const parts = inReq.body.id.split('?referer=');
  const vodUrl = parts[0];
  const referer = parts.length > 1 ? parts[1] : '';
  const html = await fetchPage(vodUrl, referer);
  const script = load(html)('#site-content .container .col').eq(0).find('section').eq(0).find('script:last').text();
  const hlsUrl = script.match(/var hlsUrl = '(.*)';/)[1];

  return {
    list: [{
      vod_id: vodUrl,
      vod_name: '',
      vod_pic: '',
      vod_play_from: 'Jable',
      vod_play_url: `播放$${hlsUrl}`,
    }],
  };
}

async function play(inReq) {
  return {
    url: inReq.body.id,
    header: {
      'User-Agent': UA,
    },
  };
}

async function search(inReq) {
  let page = inReq.body.page || 1;
  if (page === 0) page = 1;

  const wd = encodeURIComponent(inReq.body.wd);
  const url = `${SITE}/search/${wd}/?mode=async&function=get_block&block_id=list_videos_videos_list_search_result&q=${wd}&sort_by=&from=${page}&_=${Date.now()}`;
  const html = await fetchPage(url);
  const $ = load(html);
  const list = [];

  $('#list_videos_videos_list_search_result .container .row > div').each((_, el) => {
    const href = $(el).find('.title a').attr('href');
    const title = $(el).find('.title a').text();
    const pic = $(el).find('.img-box img').attr('data-src');
    const remarks = $(el).find('.label').text();
    list.push({
      vod_id: href,
      vod_name: title,
      vod_pic: pic,
      vod_remarks: remarks,
    });
  });

  return {
    page,
    pagecount: list.length < 12 ? page : page + 1,
    list,
  };
}

export default {
  meta: {
    key: 'jable',
    name: '🌸Jable',
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
