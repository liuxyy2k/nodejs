import axios from 'axios';
import { load } from 'cheerio';
import { config } from './config.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const site = 'https://njavtv.com/dm265';

// const FLARE_URL = config.FLARE_URL;

const SERVER_API = config.SERVER_API;

async function request(targetUrl) {
    try {
        const resp = await axios.post(SERVER_API, {
            url: targetUrl,
            referer: site + '/',
            key: 'mira123'  // 👈 必须加上这个，对应你 server.js 里的 AUTH_KEY
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

function parseCards($) {
    const list = [];
    $('.thumbnail').each((_, element) => {
        const href     = $(element).find('.text-secondary').attr('href') || '';
        const name = $(element).find('.text-secondary').text().trim();
        const duration = $(element).find('.left-1').text().trim();
        const style    = $(element).find('.w-full').attr('data-src') || '';

        list.push({
            vod_id:      href,
            vod_name:    name,
            vod_pic:     style,
            vod_remarks: duration,
        });
    });
    return list;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const html = await request(site);
    const $    = load(html);

    const classes = [
        {
            type_id: 'https://njavtv.com/dm265/chinese-subtitle',
            type_name: '中文字幕'
        }
    ];
    $('.relative .text-nord0').each((_, e) => {
        const name = $(e).text().trim();
        const href = $(e).attr('href') || '';
        if(href && href != '#') {
            classes.push({
                type_id:   href,
                type_name: name,
            });
        }
    });

    return { class: classes,  filters: {} };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    const url  = page > 1 ? `${tid}?page=${page}` : tid;
    const html = await request(url);
    const $    = load(html);
    const list = parseCards($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const href = inReq.body.id;

    const html = await request(href);
    const $ = load(html);

    const description = $('meta[property="description"]').eq(0).attr('content') || '';
    const name = $('meta[property="og:title"]').eq(0).attr('content') || '';
    const pic = $('meta[property="og:image"]').eq(0).attr('content') || '';

    let playUrl = '';

    // 👉 抓 eval
    const match = html.match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]+?\}\(([\s\S]+?)\)\)/);

    if (match) {
        try {
            // 👉 解析参数
            const args = eval(`[${match[1]}]`);
            const [p, a, c, k] = args;

            // 👉 解混淆函数
            function unpack(p, a, c, k) {
                while (c--) {
                    if (k[c]) {
                        p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
                    }
                }
                return p;
            }

            // 👉 还原代码
           const result = unpack(p, a, c, k);

            // 👉 提取 m3u8
            const urls = result.match(/https?:\/\/[^'"]+\.m3u8/g) || [];

            // 👉 优先选清晰度流
            playUrl =
                urls.find(u => u.includes('source')) ||
                urls.find(u => u.includes('playlist')) ||
                urls[0] ||
                '';

        } catch (e) {
            console.log('解析失败:', e);
        }
    }

    return {
        list: [{
            vod_id: href,
            vod_name: name,
            vod_pic: pic,
            vod_play_from: 'njavtv',
            vod_play_url: `播放$${playUrl}`,
            vod_content: description
        }],
    };
}

async function play(inReq, _outResp) {
    const url = inReq.body.id;
    return {
        parse: 0,
        url,
        header: {
            'User-Agent': UA,
            'Referer': site + '/',
        },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd || '');
    const page = parseInt(inReq.body.pg) || 1;

    const html = await request(`${site}/search?s=${text}&page=${page}`);
    const $    = load(html);
    const list = parseCards($);

    return { list };
}

export default {
    meta: {
        key: 'njvtv',
        name: '🌸Njavtv',
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