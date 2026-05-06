import axios from 'axios';
import { load } from 'cheerio';


// import { HttpsProxyAgent } from 'https-proxy-agent';
// // 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const host = 'https://qswyt4444.com';
const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const headers = {
    'User-Agent':      UA,
    Referer:           `${host}/`,
    'Accept-Language': 'zh-CN,zh;q=0.9',
};

async function request(url) {
    const resp = await axios.get(url, { headers, timeout: 10000});
    return resp.data;
}

function parseList(html) {
    const $    = load(html);
    const seen = new Set();
    const list = [];
    const data = $('#__NUXT_DATA__').text() || ''
    const raw = JSON.parse(data)
    $('.aspect-ratio').each((_, e) => {
        const href    = $(e).find('.listing_a').attr('href') || '';
        if (seen.has(href)) return;
        const title   = $(e).find('.video_title').text().trim();
        const imgEl   = $(e).find('img');
        const pic     = getCover(raw, href.split('/')[3])
        const remarks = $(e).find('.absolute_top_left').text();
        if (href && title) {
            seen.add(href);
            list.push({
                vod_id:      href,
                vod_name:    title.trim(),
                vod_pic:     pic,
                vod_remarks: remarks,
            });
        }
    });

    return list;
}

function findCover(decoded, targetId) {
    const list = decoded?.data?.data || [];

    const item = list.find(v => v.id === targetId);

    return item?.img || null;
}

function getList(raw) {
  const api = raw[3];

  for (const key in api) {
    if (key.includes('/search/movie')) {
      const pageObj = raw[api[key].data];   // data:503
      return raw[pageObj.data];             // 真正列表
    }
  }

  return [];
}

function getCover(raw, targetId) {
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];

    if (item && typeof item === 'object' && !Array.isArray(item)) {

      // 只处理有 id 和 img 的对象
      if (typeof item.id === 'number' && typeof item.img === 'number') {

        const realId = raw[item.id];

        if (realId === targetId) {
          return raw[item.img] || null;
        }
      }
    }
  }

  return null;
}
function decodeNuxtPayload(raw) {
  const cache = new Map();

  function decode(value) {
    // 基础类型直接返回
    if (value === null || typeof value !== 'object') {
      return value;
    }

    // 防止循环引用
    if (cache.has(value)) {
      return cache.get(value);
    }

    // 数组处理
    if (Array.isArray(value)) {
      const res = [];
      cache.set(value, res);

      for (let i = 0; i < value.length; i++) {
        res[i] = decode(value[i]);
      }
      return res;
    }

    // 对象处理（重点）
    const obj = {};
    cache.set(value, obj);

    for (const key in value) {
      const v = value[key];

      // ⭐ 关键：如果是数字，说明是索引
      if (typeof v === 'number' && raw[v] !== undefined) {
        obj[key] = decode(raw[v]);
      } else {
        obj[key] = decode(v);
      }
    }

    return obj;
  }

  return decode(raw);
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    let classes = [];

    try {
        const html = await request(host);
        const $    = load(html);
        const seen = new Set();

        $('a[href^="/movie/block/"]').each((_, e) => {
            const href  = $(e).attr('href') || '';
            const match = href.match(/\/movie\/block\/(\d+)/);
            if (!match) return;
            const tid  = match[1];
            const name = $(e).text().trim() || $(e).find('span').text().trim();
            if(name === '查看更多') return
            if (tid && name && !seen.has(tid)) {
                seen.add(tid);
                classes.push({ type_id: tid, type_name: name });
            }
        });
    } catch { /* ignore */ }

    // fallback 手动分类
    if (classes.length === 0) {
        classes = [
            { type_id: 'newest', type_name: '最新'   },
            { type_id: '50',     type_name: '国产'   },
            { type_id: '21',     type_name: '淫荡少妇' },
            { type_id: '22',     type_name: '人妻诱惑' },
            { type_id: '23',     type_name: '大奶萝莉' },
            { type_id: '24',     type_name: '丝袜制服' },
            { type_id: '45',     type_name: '强奸'   },
            { type_id: '46',     type_name: '群P'    },
        ];
    }

    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const page = Math.max(parseInt(inReq.body.page) || 1, 1);

    const url  = /^\d+$/.test(tid)
        ? `${host}/movie/block/${tid}?page=${page}`
        : `${host}/movie/${tid}?page=${page}`;

    try {
        const html = await request(url);
        const list = parseList(html);
        return { page, pagecount: 999, limit: 20, total: 9999, list };
    } catch {
        return { page, pagecount: 1, list: [] };
    }
}

async function detail(inReq, _outResp) {
    const id  = inReq.body.id;
    const url = id.startsWith('http') ? id
              : id.startsWith('/')    ? `${host}${id}`
              :                         `${host}/movie/detail/${id}`;

    const html = await request(url);

    const titleMatch = html.match(/<meta property="og:title" content="(.*?)">/);
    const picMatch   = html.match(/<meta property="og:image" content="(.*?)">/);
    const title      = titleMatch ? titleMatch[1].split(' - ')[0] : '';
    const pic        = picMatch   ? picMatch[1]                   : '';

    const matches    = [...html.matchAll(/\/api\/m3u8\/p\/[a-zA-Z0-9]+\.m3u8/g)];
    const seen       = new Set();
    const uniqueUrls = [];

    for (const m of matches) {
        const fullUrl = m[0].startsWith('http') ? m[0] : `${host}${m[0]}`;
        if (!seen.has(fullUrl)) { seen.add(fullUrl); uniqueUrls.push(fullUrl); }
    }

    const fromList = uniqueUrls.map((_, i) => `线路${i + 1}`);

    return {
        list: [{
            vod_id:        id,
            vod_name:      title,
            vod_pic:       pic,
            vod_play_from: fromList.join('$$$'),
            vod_play_url:  uniqueUrls.map(u => `播放$${u}`).join('$$$'),
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse:  0,
        url:    inReq.body.id,
        header: { 'User-Agent': UA },
    };
}

async function search(inReq, _outResp) {
    const key  = inReq.body.wd  || '';
    const page = Math.max(parseInt(inReq.body.page) || 1, 1);

    try {
        const html = await request(`${host}/search/${key}?page=${page}`);
        return { list: parseList(html) };
    } catch {
        return { list: [] };
    }
}

export default {
    meta: { key: 'qswyt', name: '五月天', type: 3 },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
    },
};