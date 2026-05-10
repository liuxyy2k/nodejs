import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';
// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const site = 'https://hongkongdollvideo.com';

async function request(url) {
    const resp = await axios.get(url, {
        headers: { 'User-Agent': UA },
        // httpsAgent: agent
    });
    return resp.data;
}

function parseCards($) {
    const list = [];
    $('.video-item').each((_, element) => {
        const href     = $(element).find('.thumb a').attr('href') || '';
        const title    = $(element).find('.thumb a').attr('title') || '';
        const cover    = $(element).find('.thumb img').attr('data-src') || '';
        const subTitle = $(element).find('.duratio').text().trim();
        if (!href || !title) return;
        list.push({ vod_id: href, vod_name: title, vod_pic: cover, vod_remarks: subTitle });
    });
    return list;
}

// XOR 解码 hex 字符串
function xorDec(hexStr, key) {
    let result = '';
    const klen = key.length;
    for (let i = 0; i < hexStr.length; i += 2) {
        const byte = String.fromCharCode(parseInt(hexStr.substr(i, 2), 16));
        const k    = key[(i / 2) % klen];
        result += String.fromCharCode(byte.charCodeAt(0) ^ k.charCodeAt(0));
    }
    return result;
}

// 解码 __PAGE__PARAMS__
function decode(param) {
    const key          = param.slice(-32);
    const encryptedConf = param.slice(0, -32);
    return JSON.parse(xorDec(encryptedConf, key));
}

function md5(str) {
    return crypto.createHash('md5').update(str).digest('hex');
}

// 与原版 _0x535536 相同
function xorDecKey(hexStr, key) {
    let result = '';
    const klen = key.length;
    for (let i = 0; i < hexStr.length; i += 2) {
        const keyIdx = (i / 2) % klen;
        const byte   = parseInt(hexStr[i] + hexStr[i + 1], 16);
        result += String.fromCharCode(byte ^ key.charCodeAt(keyIdx));
    }
    return result;
}

function getPlayUrl(embedUrl) {
    const token    = embedUrl.split('?token=')[1];
    const suffix   = token.slice(-10);
    const key      = md5(suffix).slice(8, 24).split('').reverse().join('');
    const encoded  = token.slice(0, -10);
    return JSON.parse(xorDecKey(encoded, key)).stream;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const ignore = ['亚洲成人视频'];
    const html   = await request(site);
    const $      = load(html);

    const classes = [];
    $('.scrollbar a').each((_, e) => {
        const name = $(e).text().trim();
        const href = $(e).attr('href') || '';
        if (!name || !href) return;
        if (ignore.some(ig => name.includes(ig))) return;
        classes.push({ type_id: encodeURI(href), type_name: name });
    });

    const list = parseCards($);
    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    // 第1页直接用 tid，后续翻页拼 page + .html
    const url  = page > 1 ? `${tid}${page}.html` : tid;
    const html = await request(url);
    const $    = load(html);
    const list = parseCards($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const href = inReq.body.id;
    const html = await request(href);
    const $    = load(html);

    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic  = $('meta[property="og:image"]').attr('content') || '';

    let playUrl = '';
    try {
        const scriptText = $('script:contains(__PAGE__PARAMS__)').text();
        const param      = scriptText.split('var __PAGE__PARAMS__="')[1].split('"')[0];
        const pageLoader = decode(param);
        const embedUrl   = pageLoader.player.embedUrl;
        playUrl          = getPlayUrl(embedUrl);
    } catch (e) {
        console.error('detail decode error:', e.message);
    }

    return {
        list: [{
            vod_id:        href,
            vod_name:      name,
            vod_pic:       pic,
            vod_play_from: 'hkdoll',
            vod_play_url:  `播放$${playUrl}`,
        }],
    };
}

async function play(inReq, _outResp) {
     return {
        parse: 0,
        url: inReq.body.id,
        header: { 'User-Agent': UA },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd || '');
    const page = parseInt(inReq.body.pg) || 1;
    const html = await request(`${site}/search/${text}/${page}.html`);
    const $    = load(html);
    const list = parseCards($);
    return { list };
}

export default {
    meta: {
        key: 'hkdoll',
        name: '🔥玩偶姐姐',
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