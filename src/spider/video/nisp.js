import axios from 'axios';
import * as cheerio from 'cheerio';

const siteUrl = 'https://www.nivod.vip';
const detailUrl = siteUrl + '/nivod/';

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
};

async function request(url) {
  const resp = await axios.get(url, {
    headers,
    timeout: 30000,
    validateStatus: () => true,
  });
  if (resp.status >= 400) {
    throw new Error(`HTTP ${resp.status}: ${url}`);
  }
  return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
}

function buildListUrl(tid, page, filters = {}) {
  const catId = filters?.class || tid || '1';
  let path = `/t/${catId}/`;
  if (page > 1) path = `/t/${catId}/page/${page}/`;

  const params = new URLSearchParams();
  if (filters?.area) params.set('area', filters.area);
  if (filters?.year) params.set('year', filters.year);
  if (filters?.sort) params.set('sort', filters.sort);
  const qs = params.toString();
  return `${siteUrl}${path}${qs ? `?${qs}` : ''}`;
}

function parseVods(html) {
  const $ = cheerio.load(html);
  const list = [];
  const seen = new Set();

  $('div.module-items a').each((_, el) => {
    const href = $(el).attr('href') || '';
    const picRaw = $(el).find('img').attr('data-original')
      || $(el).find('img').attr('data-src')
      || $(el).find('img').attr('src')
      || '';
    const name = $(el).attr('title') || $(el).find('.module-poster-item-title').text().trim();
    const remark = $(el).find('div.module-item-note').text().trim();
    const id = href.match(/\/nivod\/(\d+)/)?.[1] || href.split('/').filter(Boolean).pop();

    if (!picRaw || picRaw.endsWith('.gif') || picRaw.endsWith('loading.png') || !name || !id) return;
    if (seen.has(id)) return;
    seen.add(id);

    list.push({
      vod_id: id,
      vod_name: name,
      vod_pic: picRaw.startsWith('http') ? picRaw : siteUrl + picRaw,
      vod_remarks: remark,
    });
  });

  return list;
}

function extractPlayUrl(html) {
  const script = cheerio.load(html)('div.player-box-main script').html() || '';
  const match = script.match(/"url"\s*:\s*"([^"]+)"/);
  return match ? match[1].replace(/\\\//g, '/') : '';
}

async function init(_inReq, _outResp) {
  return {};
}

async function home(_inReq, _outResp) {
  const classes = [
    { type_id: '1', type_name: '电影' },
    { type_id: '2', type_name: '电视剧' },
    { type_id: '3', type_name: '综艺' },
    { type_id: '4', type_name: '动漫' },
  ];
  const filterObj = {
    '1': [
      {
        key: 'class',
        name: '类型',
        value: [
          { n: '全部', v: '' },
          { n: '动作片', v: '6' },
          { n: '喜剧片', v: '7' },
          { n: '爱情片', v: '8' },
          { n: '科幻片', v: '9' },
          { n: '奇幻片', v: '10' },
          { n: '恐怖片', v: '11' },
          { n: '剧情片', v: '12' },
          { n: '战争片', v: '20' },
          { n: '悬疑片', v: '22' },
          { n: '犯罪片', v: '24' },
          { n: '惊悚片', v: '45' },
          { n: '灾难片', v: '47' },
          { n: '冒险片', v: '23' },
        ],
      },
      {
        key: 'area',
        name: '地区',
        value: [
          { n: '全部', v: '' },
          { n: '大陆', v: '大陆' },
          { n: '香港', v: '香港' },
          { n: '台湾', v: '台湾' },
          { n: '日本', v: '日本' },
          { n: '韩国', v: '韩国' },
          { n: '欧美', v: '欧美' },
        ],
      },
      {
        key: 'year',
        name: '年份',
        value: [
          { n: '全部', v: '' },
          { n: '2026', v: '2026' },
          { n: '2025', v: '2025' },
          { n: '2024', v: '2024' },
          { n: '2023', v: '2023' },
          { n: '2022', v: '2022' },
          { n: '2021', v: '2021' },
          { n: '2020', v: '2020' },
        ],
      },
      {
        key: 'sort',
        name: '排序',
        value: [
          { n: '添加时间', v: 'time_add' },
          { n: '更新时间', v: 'time_update' },
          { n: '人气', v: 'hits' },
          { n: '评分', v: 'score' },
        ],
      },
    ],
    '2': [
      {
        key: 'class',
        name: '类型',
        value: [
          { n: '全部', v: '' },
          { n: '国产剧', v: '13' },
          { n: '港台剧', v: '14' },
          { n: '日剧', v: '15' },
          { n: '韩剧', v: '33' },
          { n: '欧美剧', v: '16' },
          { n: '泰剧', v: '34' },
          { n: '新马剧', v: '35' },
        ],
      },
      {
        key: 'area',
        name: '地区',
        value: [
          { n: '全部', v: '' },
          { n: '大陆', v: '大陆' },
          { n: '香港', v: '香港' },
          { n: '台湾', v: '台湾' },
          { n: '日本', v: '日本' },
          { n: '韩国', v: '韩国' },
          { n: '欧美', v: '欧美' },
        ],
      },
      {
        key: 'year',
        name: '年份',
        value: [
          { n: '全部', v: '' },
          { n: '2026', v: '2026' },
          { n: '2025', v: '2025' },
          { n: '2024', v: '2024' },
          { n: '2023', v: '2023' },
          { n: '2022', v: '2022' },
          { n: '2021', v: '2021' },
          { n: '2020', v: '2020' },
        ],
      },
      {
        key: 'sort',
        name: '排序',
        value: [
          { n: '添加时间', v: 'time_add' },
          { n: '更新时间', v: 'time_update' },
          { n: '人气', v: 'hits' },
          { n: '评分', v: 'score' },
        ],
      },
    ],
    '3': [
      {
        key: 'class',
        name: '类型',
        value: [
          { n: '全部', v: '' },
          { n: '内地综艺', v: '27' },
          { n: '港台综艺', v: '28' },
          { n: '日本综艺', v: '29' },
          { n: '韩国综艺', v: '36' },
          { n: '欧美综艺', v: '30' },
        ],
      },
      {
        key: 'area',
        name: '地区',
        value: [
          { n: '全部', v: '' },
          { n: '内地', v: '内地' },
          { n: '港台', v: '港台' },
          { n: '日韩', v: '日韩' },
          { n: '欧美', v: '欧美' },
        ],
      },
      {
        key: 'year',
        name: '年份',
        value: [
          { n: '全部', v: '' },
          { n: '2026', v: '2026' },
          { n: '2025', v: '2025' },
          { n: '2024', v: '2024' },
          { n: '2023', v: '2023' },
          { n: '2022', v: '2022' },
          { n: '2021', v: '2021' },
          { n: '2020', v: '2020' },
        ],
      },
      {
        key: 'sort',
        name: '排序',
        value: [
          { n: '添加时间', v: 'time_add' },
          { n: '更新时间', v: 'time_update' },
          { n: '人气', v: 'hits' },
          { n: '评分', v: 'score' },
        ],
      },
    ],
    '4': [
      {
        key: 'class',
        name: '类型',
        value: [
          { n: '全部', v: '' },
          { n: '国产动漫', v: '31' },
          { n: '日本动漫', v: '32' },
          { n: '韩国动漫', v: '39' },
          { n: '港台动漫', v: '40' },
          { n: '新马泰动漫', v: '41' },
          { n: '欧美动漫', v: '42' },
          { n: '其他动漫', v: '43' },
        ],
      },
      {
        key: 'area',
        name: '地区',
        value: [
          { n: '全部', v: '' },
          { n: '国产', v: '国产' },
          { n: '日本', v: '日本' },
          { n: '欧美', v: '欧美' },
          { n: '其他', v: '其他' },
        ],
      },
      {
        key: 'year',
        name: '年份',
        value: [
          { n: '全部', v: '' },
          { n: '2026', v: '2026' },
          { n: '2025', v: '2025' },
          { n: '2024', v: '2024' },
          { n: '2023', v: '2023' },
          { n: '2022', v: '2022' },
          { n: '2021', v: '2021' },
          { n: '2020', v: '2020' },
        ],
      },
      {
        key: 'sort',
        name: '排序',
        value: [
          { n: '添加时间', v: 'time_add' },
          { n: '更新时间', v: 'time_update' },
          { n: '人气', v: 'hits' },
          { n: '评分', v: 'score' },
        ],
      },
    ],
  };
  return { class: classes, filters: filterObj };
}

async function category(inReq, _outResp) {
  const { id, page = 1, filters } = inReq.body;
  let ext = filters;
  if (typeof filters === 'string') {
    try { ext = JSON.parse(filters); } catch { ext = {}; }
  }
  ext = ext || {};

  try {
    const target = buildListUrl(id, parseInt(page, 10) || 1, ext);
    const html = await request(target);
    const list = parseVods(html);
    const pg = parseInt(page, 10) || 1;
    return {
      page: pg,
      pagecount: pg + 1,
      limit: 20,
      total: (pg + 1) * 20,
      list,
    };
  } catch (e) {
    console.log('[nisp] category fail:', e.message);
    return { page: 1, pagecount: 1, limit: 20, total: 0, list: [] };
  }
}

async function detail(inReq, _outResp) {
  const { id } = inReq.body;

  try {
    const html = await request(detailUrl + id);
    const $ = cheerio.load(html);

    const name = ($('meta[property="og:title"]').attr('content') || '').replace(/-免费在线观看$/, '');
    const pic = $('meta[property="og:image"]').attr('content') || '';
    const year = $('meta[property="video:release_date"]').attr('content') || '';
    const description = $('meta[name="description"]').attr('content') || '';

    const playFromArr = [];
    $('div.module-tab-items-box div').each((_, el) => {
      const router = $(el).find('span').text().trim();
      if (router) playFromArr.push(router);
    });

    const playListArr = [];
    const playLists = $('div.module-play-list-content');

    for (let i = 0; i < playLists.length; i++) {
      const element = playLists.eq(i);
      const links = element.find('a');
      const promises = [];

      links.each((_, a) => {
        const href = $(a).attr('href') || '';
        const linkName = $(a).text().trim();
        if (!href) return;

        const playLink = href.startsWith('http') ? href : siteUrl + href;
        promises.push(
          request(playLink)
            .then((playHtml) => {
              const url = extractPlayUrl(playHtml);
              return url ? `${linkName}$${url}` : `${linkName}$`;
            })
            .catch(() => `${linkName}$`),
        );
      });

      playListArr.push((await Promise.all(promises)).join('#'));
    }

    return {
      list: [{
        vod_id: id,
        vod_name: name,
        vod_pic: pic,
        vod_year: year,
        vod_play_from: playFromArr.join('$$$'),
        vod_play_url: playListArr.join('$$$'),
        vod_content: description,
      }],
    };
  } catch (e) {
    console.log('[nisp] detail fail:', e.message);
    return { list: [] };
  }
}

async function search(inReq, _outResp) {
  const { wd } = inReq.body;
  if (!wd) return { list: [] };

  try {
    const url = `${siteUrl}/s/-------------/?wd=${encodeURIComponent(wd)}`;
    const html = await request(url);
    return { list: parseVods(html) };
  } catch (e) {
    console.log('[nisp] search fail:', e.message);
    return { list: [] };
  }
}

async function play(inReq, _outResp) {
  const url = inReq.body.id || '';
  return {
    parse: 0,
    url,
    header: { ...headers, Referer: `${siteUrl}/` },
  };
}

export default {
  meta: {
    key: 'nisp',
    name: '🔥泥视频',
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
