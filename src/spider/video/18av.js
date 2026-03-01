import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const site    = 'https://18av.mm-cg.com/zh/';
const cateUrl = site + '/best/';

async function request(url) {
    const resp = await axios.get(url, {
        headers: { 'User-Agent': UA },
    });
    return resp.data;
}

function parseCards($) {
    const list = [];
    $('div.post').each((_, element) => {
        try {
            const pic  = $(element).find('img').attr('src') || '';
            const href = $(element).find('a').attr('href') || '';
            const id   = href.replace(site, '');
            const name = $(element).find('h3').text().trim();
            if (!id || !name) return;
            list.push({ vod_id: id, vod_name: name, vod_pic: pic });
        } catch (e) {}
    });
    return list;
}

// 动态检测分隔符（非 hex 字符）
function getSeparator(encoded) {
    const m = encoded.match(/[^0-9a-f]/);
    return m ? m[0] : 'q';
}

// Step1: 自定义解码 encoded → base64 字符串
function decrSun(encoded, radix, xor) {
    const sep   = getSeparator(encoded);
    const parts = encoded.split(sep);
    return parts.map(p => String.fromCharCode(parseInt(p, radix) ^ xor)).join('');
}

// Step2: AES-CBC 解密
function aesDecrypt(base64Cipher, key, iv) {
    const data    = Buffer.from(base64Cipher, 'base64');
    const decipher = crypto.createDecipheriv(
        'aes-128-cbc',
        Buffer.from(key, 'utf-8'),
        Buffer.from(iv, 'utf-8')
    );
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf-8');
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: 'chinese_random',         type_name: '中文字幕' },
        { type_id: 'amateurjav_random',       type_name: '有码AV'   },
        { type_id: 'uncensored_random',       type_name: '无码AV'   },
        { type_id: 'amateurjav_random',       type_name: '素人AV'   },
        { type_id: 'reducing-mosaic_random',  type_name: '无码破解' },
        { type_id: 'animation_random',        type_name: 'H动漫'    },
        { type_id: 'dt_random',               type_name: '国产自拍' },
    ];

    const html = await request(cateUrl);
    const $    = load(html);
    const list = parseCards($);

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    const url  = `${site}${tid}/all/${page}.html`;
    const html = await request(url);
    const $    = load(html);
    const list = parseCards($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const id   = inReq.body.id;
    const html = await request(`${site}${id}`);
    const $    = load(html);

    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic  = $('meta[property="og:image"]').attr('content') || '';

    // 提取 encoded 串
    const encodedMatch = html.match(/\['[^']+',\s*'([^']+)'/);
    const encoded = encodedMatch ? encodedMatch[1] : '';

    // 提取 xor / radix / key / iv
    const xorMatch   = html.match(/hadeedg252\s*=\s*(\d+)/);
    const radixMatch = html.match(/hcdeedg252\s*=\s*(\d+)/);
    const keyMatch   = html.match(/argdeqweqweqwe\s*=\s*'([^']+)'/);
    const ivMatch    = html.match(/hdddedg252\s*=\s*'([^']+)'/);

    const xor   = xorMatch   ? parseInt(xorMatch[1])   : 0;
    const radix = radixMatch ? parseInt(radixMatch[1]) : 0;
    const key   = keyMatch   ? keyMatch[1]             : '';
    const iv    = ivMatch    ? ivMatch[1]              : '';

    // Step1 + Step2 解密
    const base64Cipher = decrSun(encoded, radix, xor);
    const videoId      = aesDecrypt(base64Cipher, key, iv);

    // 获取播放源列表
    const playerHtml = await request(`https://18av.mm-cg.com/js/player/play.php?id=${videoId}`);
    const arrayMatch = playerHtml.match(/const videoSources\s*=\s*\[([\s\S]*?)\]/);

    const srcList  = [];
    const sizeList = [];
    if (arrayMatch) {
        const content = arrayMatch[1];
        const srcReg  = /src\s*:\s*'([^']+)'/g;
        const sizeReg = /size\s*:\s*'([^']+)'/g;
        let m;
        while ((m = srcReg.exec(content))  !== null) srcList.push(m[1]);
        while ((m = sizeReg.exec(content)) !== null) sizeList.push(m[1]);
    }

    const playUrl = srcList.map((src, i) => `${sizeList[i] || i + 1}$${src}`).join('#');

    return {
        list: [{
            vod_id:        id,
            vod_name:      name,
            vod_pic:       pic,
            vod_play_from: '18AV',
            vod_play_url:  playUrl,
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
    const key  = encodeURIComponent(inReq.body.wd || '');
    const html = await request(`${site}/?k=${key}&p=1`);
    const $    = load(html);
    const list = parseCards($);
    return { list };
}

export default {
    meta: {
        key: 'av18',
        name: '18AV',
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