import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://missavt.com';

const PORT   = process.env.DEV_HTTP_PORT || 9988;

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...headers },
    });
    return resp.data;
}

function getImgUrl($el) {
    const src = $el.attr('data-src') || '';
    const enc = extractImgFromOnload($el.attr('onload') || '');
    const t   = enc || src;
    if (!t) return '';
    if (enc || shouldDecrypt(t)) {
        return `http://127.0.0.1:${PORT}/spider/missavt/3/img?url=${encodeURIComponent(e64(t))}`;
    }
    return absUrl(t);
}

function extractImgFromOnload(onload) {
    const m = (onload || '').match(/load(?:Share)?Img\s*\([^,]+,\s*['"]([^'"]+)['"]/);
    return m ? m[1] : '';
}

function shouldDecrypt(url) {
    const u = (url || '').toLowerCase();
    return ['pic.gylhaa.cn', 'new.slfpld.cn', '/upload_01/', '/upload/'].some(x => u.includes(x));
}

function absUrl(u) {
    if (!u) return '';
    if (u.startsWith('//'))  return 'https:' + u;
    if (u.startsWith('/'))   return site + u;
    return u;
}

function aesDecrypt(buf) {
    const key      = Buffer.from('f5d965df75336270');
    const iv       = Buffer.from('97b60394abc2fbe1');
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    return Buffer.concat([decipher.update(buf), decipher.final()]);
}

function e64(s) {
    try { return Buffer.from(s || '').toString('base64'); } catch { return ''; }
}

function d64(s) {
    try { return Buffer.from(s || '', 'base64').toString('utf-8'); } catch { return ''; }
}

function parseVods($) {
    const videos = [];
    $('div.video-item').each((_, element) => {
        const imgEl = $(element).find('.w-full');
        const url = $(element).find('a').attr('href') || '';
        const name = $(element).find('.w-full').attr('alt') || '';
        const time = $(element).find('div.w-full').text().trim();
        videos.push({
            vod_id: url,
            vod_name: name,
            vod_pic: imgEl.length ? getImgUrl(imgEl) : '',
            vod_remarks: time,
        });
    });
    return videos;
}



async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '/sort/month_hot/', type_name: '当前最热' },
        { type_id: '/sort/renew/', type_name: '最近更新' },
        { type_id: '/sort/month_hot/', type_name: '本月最热' },
        { type_id: '/sort/favorite/', type_name: '收藏最多' },
        { type_id: '/category/madou/', type_name: '麻豆传媒' },
        { type_id: '/category/swag/', type_name: 'Swg' },
        { type_id: '/category/sweet-heart-vlog/', type_name: '糖心Vlog' },
        { type_id: '/category/ed-mosaic/', type_name: 'Edmosic' },
        { type_id: '/category/douyin/', type_name: '抖阴' },
        { type_id: '/category/91-studio/', type_name: '91制片厂' },
        { type_id: '/category/mr-rabbit/', type_name: '兔子先生' },
        { type_id: '/category/domestic-media/', type_name: '国产传媒' },
        { type_id: '/category/censored/', type_name: '有码' },
        { type_id: '/category/uncensored-leak/', type_name: '无码流出' },
        { type_id: '/category/fc2/', type_name: 'FC2' },
        { type_id: '/category/tokyohot/', type_name: '东京热' },
        { type_id: '/category/marriedslash/', type_name: '人妻斩' },
        { type_id: '/category/heyzo/', type_name: 'HEYZO' },
        { type_id: '/category/1pondo/', type_name: '一本道' },
        { type_id: '/category/amateur/', type_name: '素人' },
        { type_id: '/category/chinese-subtitle/', type_name: '中文字幕' },
        { type_id: '/category/reducing-mosaic/', type_name: '无码破解' }
    ];

    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    let url = `${site}${tid}${page}/`;
    if (page > 1) url += `&page=${page}`;

    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const html = await request(`${site}${id}`);
    const $ = load(html);

    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic = $('meta[property="og:image"]').attr('content') || '';
    const year = $('meta[property="video:release_date"]').attr('content') || '';
    const description = $('meta[name="description"]').attr('content') || '';
    let playUrl = $('.poster').attr('data-url') || '';

    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_year: year,
            vod_play_from: 'MissAvt',
            vod_play_url: '播放$' + playUrl,
            vod_content: description
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
    const text = encodeURIComponent(inReq.body.wd);
    const html = await request(`${site}/search?keywords=${text}`);
    const $ = load(html);
    const list = parseVods($);

    return { list };
}

async function imgProxy(inReq, reply) {
    try {
        let raw = d64(inReq.query.url);
        const match = raw.match(/loadBannerDirect\('([^']*)'/);
        if (match) raw = match[1];
        if (!raw) return reply.code(404).send('');

        const resp = await axios.get(raw, {
            headers: {
                'User-Agent': UA,
                'Referer':    `${site}/`,
                'Origin':     site,
            },
            responseType: 'arraybuffer',
            timeout:      10000,
        });

        const decrypted = aesDecrypt(Buffer.from(resp.data));
        let   ct        = 'image/jpeg';
        if (decrypted[0] === 0x89 && decrypted[1] === 0x50) ct = 'image/png';
        else if (decrypted.slice(0, 4).toString() === 'GIF8')  ct = 'image/gif';

        reply.header('Content-Type', ct).send(decrypted);
    } catch (e) {
        console.error('imgProxy error:', e.message);
        reply.code(500).send('');
    }
}

export default {
    meta: {
        key: 'missavt',
        name: 'MissAvt',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/img',  imgProxy);
    },
};