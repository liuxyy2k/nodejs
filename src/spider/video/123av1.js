import axios from 'axios';
import { load } from 'cheerio';
import { config } from './config.js';

import vm from 'node:vm';

// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36';


const site = 'https://123av.com';

const SERVER_API = config.SERVER_API;

async function requestM3u8(targetUrl) {
    try {
        const resp = await axios.post(SERVER_API, {
            url: targetUrl,
            referer: site + '/',
            key: 'mira123',
            sniff: true
        }, {
            timeout: 60000,
            // 明确指定是 JSON 格式，确保宝塔那边的 express.json() 能解析
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // 如果服务器返回的是字符串（HTML），resp.data 就是源码
        return resp.data;
    } catch (e) {
        console.log('中转请求失败:', e.message);
        // 如果这里报错 403，就说明是 key 的问题
        // 如果报错 404，说明 SERVER_API 地址写错了
        throw e;
    }
}

async function request(url) {
  const { data } = await axios.get(url, {
    headers: {
      'User-Agent': UA,
      Referer: site,
    },
    // httpsAgent: agent
  });
  return data;
}

function parseCards($) {
    const list = [];
    $('.card').each((_, element) => {
        const href     = $(element).find('.card__cover').attr('href') || '';
        const subTitle = $(element).find('h3').text().trim();
        const duration = $(element).find('.card__dur').text().trim();
        const style    = $(element).find('.card__img').attr('src') || '';

        list.push({
            vod_id:      href,
            vod_name:    subTitle,
            vod_pic:     style,
            vod_remarks: duration,
        });
    });
    return list;
}

async function init() {
  return {};
}

async function home(_inReq, _outResp) {
  const classes = [
    { type_id: '/cn/new', type_name: '最新' },
        { type_id: '/cn/hot', type_name: '热门' },
        { type_id: '/cn/recent', type_name: '最近' },
        { type_id: '/cn/censored', type_name: '有码' },
        { type_id: '/cn/uncensored', type_name: '无码' },
        { type_id: '/cn/uncensored-leaked', type_name: '无码泄露' },
        { type_id: '/cn/new', type_name: '最新' },
        { type_id: '/cn/all?sort=today', type_name: '今日' },
        { type_id: '/cn/all?sort=week', type_name: '本周' },
        { type_id: '/cn/all?sort=month', type_name: '本月' },
        { type_id: '/cn/makers/fc2', type_name: 'FC2' },
        { type_id: '/cn/makers/heyzo', type_name: 'HEYZO' },
        { type_id: '/cn/tags/siro', type_name: 'SIRO' },
        { type_id: '/cn/tags/259luxu', type_name: 'LUXU' },
        { type_id: '/cn/makers/xxx-av', type_name: 'XXX-AV' },
        { type_id: '/cn/makers/tokyo-hot', type_name: '东京热' },
        { type_id: '/cn/makers/10musume', type_name: '10Musume' }
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    let url = `${site}${tid}?page=${page}`
    const html = await request(url);
    const $    = load(html);
    const list = parseCards($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
  const id = inReq.body.id;
  const url = `${site}${id}`;

  const html = await request(url);
  const $ = load(html);

  const title =
    $('.favourite:first').attr('data-code') ||
    $('h1').first().text().trim();

  const pic =
    $('#player').attr('data-poster') ||
    $('meta[property="og:image"]').attr('content') ||
    '';

  const desc =
    $('.justify-content-between h1').text().trim() ||
    $('h1').first().text().trim();

  let result = null;

  const sandbox = {
      player: (...args) => {
          result = args;
      },
      JSON
  };

  const player = $('.watch__main').attr('x-data');
  vm.runInNewContext(player, sandbox);
  // 第一个参数就是视频数组
  const videos = result[0];

  // 取第一个视频地址
  const dataUrl = videos[0].url;
  const u = new URL(dataUrl);
  // 提取 E0NEZM
    const code = u.pathname.split('/').pop();

    // 提取 poster 参数（保持编码状态）
    const poster = u.searchParams.get('poster');
    //嗅探资源
    // const data = await requestM3u8(url);
    let playUrl = `https://javplayer.cc/stream?poster=${poster}&id=${code}`;
    const { data } = await axios.get(playUrl, {
      headers: {
        'User-Agent': UA,
        Referer: dataUrl,
      }
    });
    playUrl = data.media.stream
    return {
      list: [
        {
          vod_id: id,
          vod_name: title,
          vod_pic: pic,
          vod_content: desc,
          vod_play_from: '123AV',
          vod_play_url: `播放$${playUrl}`,
        },
      ],
    };
}

async function play(inReq, _outResp) {
  const id = inReq.body.id;
  return {
    // 强制播放器自己网页嗅探
    parse: 0,
    url: id,
    header: {
      'User-Agent': UA,
      Referer: 'https://javplayer.cc/',
    },
  };
}


async function search(inReq, _outResp) {
  const wd = encodeURIComponent(inReq.body.wd);
  const pg = parseInt(inReq.body.pg || 1);

  const url = `${site}/zh/search/${wd}?page=${pg}`;
  const html = await request(url);
  const $ = load(html);

  const list = pageList($, '#page-list .box-item-list .box-item');

  return {
    page: pg,
    list,
  };
}

export default {
  meta: {
    key: '123av',
    name: '🔥123AV',
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