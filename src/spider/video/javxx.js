import axios from 'axios';
import { load } from 'cheerio';
import CryptoJS from 'crypto-js';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
const site = 'https://javxx.com';

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...headers }
    });
    return resp.data;
}

// ─── 加解密工具 ────────────────────────────────────────────────────────────

function customBase64Decode(str) {
    const TABLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    const idx = {};
    for (let i = 0; i < TABLE.length; i++) idx[TABLE[i]] = i;

    const eqPos = str.indexOf('=');
    const hasEq = eqPos > -1;
    const len = hasEq ? eqPos : str.length;
    let i = -1;
    let result = '';

    while (i < len) {
        const n =
            idx[str[++i]] << 18 |
            idx[str[++i]] << 12 |
            idx[str[++i]] << 6  |
            idx[str[++i]];
        if (n !== 0) {
            result += String.fromCharCode((n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
        }
    }
    if (hasEq) result = result.slice(0, eqPos - str.length);
    return result;
}

function xorDecryptUrl(encoded, key = 'G9zhUyphqPWZGWzZ') {
    const decoded = customBase64Decode(encoded);
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
        result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return decodeURIComponent(result);
}

function xorEncryptToBase64(str, key = 'ym1eS4t0jTLakZYQ') {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
        bytes.push(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    const wordArray = CryptoJS.lib.WordArray.create(Uint8Array.from(bytes));
    return CryptoJS.enc.Base64.stringify(wordArray);
}

function decodeMedia(encoded, key = 'ym1eS4t0jTLakZYQ') {
    const decoded = customBase64Decode(encoded);
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
        result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return decodeURIComponent(result);
}

// ─── API 处理函数 ──────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: `/cn/hot`,        type_name: '热门' },
        { type_id: `/cn/new`,        type_name: '最新' },
        { type_id: `/cn/recent`,     type_name: '最近' },
        { type_id: `/cn/censored`,   type_name: '有码' },
        { type_id: `/cn/uncensored`, type_name: '无码' },
    ];
    let filterObj = {
         '/cn/hot': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '发布日期', v: 'release_date' },
                    { n: '添加日期', v: 'added_date' },
                    { n: '热门',     v: 'hot' },
                    { n: '今日观看', v: 'today_views' },
                    { n: '每周观看', v: 'weekly_views' },
                    { n: '每月观看', v: 'monthly_views' },
                    { n: '最受欢迎', v: 'most_viewed' },
                    { n: '最喜欢', v: 'most_favorited' }
                ]
            }
        ],
        '/cn/new': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '发布日期', v: 'release_date' },
                    { n: '添加日期', v: 'added_date' },
                    { n: '热门',     v: 'hot' },
                    { n: '今日观看', v: 'today_views' },
                    { n: '每周观看', v: 'weekly_views' },
                    { n: '每月观看', v: 'monthly_views' },
                    { n: '最受欢迎', v: 'most_viewed' },
                    { n: '最喜欢', v: 'most_favorited' }
                ]
            }
        ],
        '/cn/recent': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '发布日期', v: 'release_date' },
                    { n: '添加日期', v: 'added_date' },
                    { n: '热门',     v: 'hot' },
                    { n: '今日观看', v: 'today_views' },
                    { n: '每周观看', v: 'weekly_views' },
                    { n: '每月观看', v: 'monthly_views' },
                    { n: '最受欢迎', v: 'most_viewed' },
                    { n: '最喜欢',   v: 'most_favorited' }
                ]
            }
        ]
    }
    return { class: classes, filters: filterObj};
}

async function category(inReq, _outResp) {
    //https://javxx.com/cn/all?type=&year=&actress=&sort=today_views&page=
    const typeurl = site + inReq.body.id;
    const page = inReq.body.page || 1;
    let ext = inReq.body.filters;
    if (typeof ext === 'string') {
        try {
            ext = JSON.parse(filters)
        } catch (e) {
            ext = {}
        }
    }
    ext = ext || {}
    let by = ext?.by || ''
    let url = page > 1 ? `${typeurl}?page=${page}` : typeurl;
    if(by === '') {
        url = page > 1 ? `${typeurl}?page=${page}` : typeurl;
    } else {
        url =  `https://javxx.com/cn/all?type=&year=&actress=&sort=${by}&page=${page}`
    }
    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.vid-items > div.item').each((_, element) => {
        const href     = $(element).find('.title').attr('href');
        const title    = $(element).find('.title').text();
        const cover    = $(element).find('.image > img').attr('src');
        const duration = $(element).find('.duration').text();
        if (href) {
            videos.push({
                vod_id:      href,
                vod_name:    title,
                vod_pic:     cover,
                vod_remarks: duration,
            });
        }
    });

    return { page: parseInt(page), list: videos };
}

async function detail(inReq, _outResp) {
    const url = inReq.body.id;
    const html = await request(`${site}${url}`);
    const $ = load(html);

    let playUrl = '';
    try {
        const encodedDataUrl = $('#video-files div').attr('data-url');
        const realUrl = xorDecryptUrl(encodedDataUrl);
        console.log(realUrl)
        const filename = realUrl.split('/').pop().split('?')[0];
        const token = xorEncryptToBase64(filename);
        console.log(token)
        const streamData = await request(
            `https://surrit.store/stream?src=javxx&poster=&token=${token}`,
            { origin: 'https://surrit.store', referer: 'https://surrit.store/' }
        );
        console.log(streamData)
        const mediaEncoded = streamData.result.media;
        console.log(mediaEncoded)
        const mediaJson = decodeMedia(mediaEncoded);
        const media = JSON.parse(mediaJson);
        playUrl = media.stream || '';
    } catch (e) {}

    const title = $('h1, h2').first().text().trim();
    const pic = $('.detail-header img, .cover img').attr('src') || '';

    return {
        list: [{
            vod_id:        url,
            vod_name:      title,
            vod_pic:       pic,
            vod_play_from: 'Javxx',
            vod_play_url:  '播放$' + playUrl,
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse:  0,
        url:    inReq.body.id,
        header: {
            'User-Agent': UA,
            'Origin':     'https://surrit.store',
            'Referer':    'https://surrit.store/',
        },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const page = inReq.body.pg || 1;
    const url = `${site}/cn/search/?keyword=${text}&page=${page}`;

    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.vid-items > div.item').each((_, element) => {
        const href     = $(element).find('.title').attr('href');
        const title    = $(element).find('.title').text();
        const cover    = $(element).find('.image > img').attr('src');
        const duration = $(element).find('.duration').text();
        if (href) {
            videos.push({
                vod_id:      href,
                vod_name:    title,
                vod_pic:     cover,
                vod_remarks: duration,
            });
        }
    });

    return { list: videos };
}


export default {
    meta: {
        key:  'javxx',
        name: '🔥Javxx',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
    },
};