import axios from 'axios';
import { load } from 'cheerio';
import { config } from './config.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36';


const site = 'https://123av.com/zh';

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
    }
  });
  return data;
}

function parseCards($) {
    const list = [];
    $('.box-item').each((_, element) => {
        const href     = $(element).find('.thumb a').attr('href') || '';
        const subTitle = $(element).find('.detail').text().trim();
        const duration = $(element).find('.duration').text().trim();
        const style    = $(element).find('img').attr('data-src') || '';

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
    const classes = []
    const html = await request(site);
    const $    = load(html);
    $('.has-child ul li a').each((_, element) => {
         const typeId = $(element).attr('href') || '';
         const typeName = $(element).text() || '';
         classes.push({
            type_id: typeId,
            type_name: typeName
         })
    });
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    let url = `${site}/${tid}?page=${page}`
    console.log(url)
    const html = await request(url);
    const $    = load(html);
    const list = parseCards($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
  const id = inReq.body.id;
  const url = `${site}/${id}`;
  console.log(url);

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

    //嗅探资源
    const data = await requestM3u8(url);
    return {
      list: [
        {
          vod_id: id,
          vod_name: title,
          vod_pic: pic,
          vod_content: desc,
          vod_play_from: '123AV',
          // 这里直接把详情页ID交给play接口
          vod_play_url: `播放$${data.m3u8}`,
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
      Referer: 'https://surrit.store/',
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
    name: '123AV',
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