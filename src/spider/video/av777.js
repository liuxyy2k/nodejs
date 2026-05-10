import axios from 'axios';
import { load } from 'cheerio';
import { config } from './config.js';

const siteUrl = 'https://av77.com';
const searchUrl = siteUrl + '/vodsearch/-------------/?wd=';
// const FLARE_URL = config.FLARE_URL;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const SERVER_API = config.SERVER_API;

async function request(targetUrl) {
    try {
        const resp = await axios.post(SERVER_API, {
            url: targetUrl,
            referer: siteUrl + '/',
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

// async function request(url) {
//     const resp = await axios.get(url, { headers,httpsAgent: agent});
//     return resp.data;
// }

// 解析视频列表（对应 Java 的 parseVods）
function parseVods($) {
    const list = [];
    $('.item-wrapper').each((_, element) => {
        const pic = $(element).find('.w-full').attr('data-src') || '';
        const url = $(element).find('a').eq(0).attr('href') || '';
        const name = $(element).find('.text-secondary').text().trim() || '';
        const type = $(element).find('.left-1').text().trim() || '';
        const date = $(element).find('.right-1').text().trim() || '';
        if (pic.endsWith('.gif') || !name) return;
        list.push({
            vod_id: url,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: type === '' ? date : type + '|' + date,
        });
    });
    return list;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
            { type_id: 'https://av77.com/chinese-subtitle',    type_name: '中文字幕' },
            { type_id: 'https://av77.com/madou',               type_name: '国产AV' },
            { type_id: 'https://av77.com/genres/外国女优',     type_name: '欧美大片' }
    ];
    const html = await request(siteUrl);
    const $ = load(html);
    const exclude = ['類型', '觀看日本 AV','素人','無碼影片','亞洲 AV']
    $('.text-nord0').each((_, element) => {
        const typeId = $(element).attr('href') || '';
        const typeName = $(element).text().trim() || '';
        // 是否命中黑名单
        if (exclude.some(keyword => typeName.includes(keyword))) return
        if(typeId && typeName) {
            classes.push(
                {
                    type_id: typeId,
                    type_name: typeName
                }
            )
        }
        
    });
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    let url = inReq.body.id;
    const pg = inReq.body.page || 1;
    if(pg > 1) url = `${url}?page=${page}`
    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return {
        page: parseInt(pg),
        pagecount: parseInt(pg) + 1,
        limit: 20,
        total: (parseInt(pg) + 1) * 20,
        list,
    };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const url = siteUrl + id;
    const html = await request(url);
    const $ = load(html);

    const name =  $('meta[property="og:title"]').attr('content') || '';
    const description =  $('meta[property="og:description"]').attr('content') || '';
    const pic = $('meta[property="og:image"]').attr('content') || '';
    const evalMatch = html.match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\([\s\S]*?\)\)/);
    let evalStr = evalMatch[0];
    const unpacked = unpackPacker(evalStr)
    const m3u8Match = unpacked.match(/https?:\/\/[^\s'"]+\.m3u8/);
    let playUrl = 'https://pl3.vvvvvvvv.top/api/play?url=' + m3u8Match[0]
    const resp = await axios.get(playUrl, {
        headers: { 'User-Agent': UA, 'Referer': url }
    });
    let media = getBestM3u8(resp.data)
    console.log(media)
    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_play_from: 'AV77',
            vod_play_url: '播放$' + media,
            vod_content: description
        }],
    };
}

function getBestM3u8(m3u8Text) {
    const lines = m3u8Text
        .split('\n')
        .map(v => v.trim())
        .filter(Boolean);

    const urls = lines.filter(v => v.startsWith('http'));
    return urls.length ? urls[urls.length - 1] : '';
}

function unpackPacker(code) {
    const match = code.match(
        /}\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/
    );

    if (!match) return code;

    let [, p, a, c, k] = match;
    a = parseInt(a);
    c = parseInt(c);
    k = k.split('|');

    while (c--) {
        if (k[c]) {
            p = p.replace(
                new RegExp('\\b' + c.toString(a) + '\\b', 'g'),
                k[c]
            );
        }
    }

    return p;
}


async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: {
            'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
        },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const url = `${siteUrl}/cn/search/${text}`;
    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { list };
}

export default {
    meta: {
        key: 'av77',
        name: '🔥AV77',
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