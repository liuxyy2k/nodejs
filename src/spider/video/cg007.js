import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
const site = 'https://asdaisftyi.store';

const PORT   = process.env.DEV_HTTP_PORT || 9988;

async function request(reqUrl) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA },
    });
    return resp.data;
}

function getImgUrl($el) {
    const src = $el.attr('z-image-loader-url') || '';
    console.log(src)
    const enc = extractImgFromOnload($el.attr('onload') || '');
    const t   = enc || src;
    if (!t) return '';
    if (enc || shouldDecrypt(t)) {
        return `http://127.0.0.1:${PORT}/spider/cg007/3/img?url=${encodeURIComponent(e64(t))}`;
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

async function parseVods($) {
    const items = [];

    $('article').each((_, element) => {
        const imgEl = $(element).find('img');
        const url = $(element).find('a').attr('href') || '';
        const name = $(element).find('.post-card-title').text().trim();
        const date  = $(element).find('span[itemprop="datePublished"]').text().trim();
        const parts = url.split('/');
        const id = parts[2] || '';
        if (name && url) {
            items.push(
                { 
                    vod_id: id, 
                    vod_name: name, 
                    vod_pic: imgEl.length ? getImgUrl(imgEl) : '',
                    vod_remarks: date.replace(/\s*年\s*|\s*月\s*/g, '-').replace(/\s*日/, '')
                }
            );
        }
    });

    return items
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: 'htzx',            type_name: '最新热瓜' },
        { type_id: 'xpscg',            type_name: '007性癖收藏' },
        { type_id: 'zrbd',            type_name: '最热榜单' },
        { type_id: 'mrjx',            type_name: '每日精选' },
        { type_id: 'bkdg',            type_name: '必看大瓜' },
        { type_id: 'avjs',            type_name: 'AV鉴赏' },
        { type_id: 'shjs',            type_name: '骚货鉴赏' },
        { type_id: 'ofmf',            type_name: 'OnlyFans' },
        { type_id: 'zxlg',            type_name: '最新绿茶' },
        { type_id: 'yyhw',            type_name: '实战约炮' },
        { type_id: 'tldg',            type_name: '偷来的瓜' },
        { type_id: 'qcxy',            type_name: '青春校园' },
    ];

    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    const html = await request(`${site}/category/${tid}/${page}/`);
    const $ = load(html);
    const list = await parseVods($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    let url = site + '/archives/' + id + '/'
    const html = await request(url);
    
    const $ = load(html);

    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic  = $('meta[property="og:image"]').attr('content') || '';
    const year = $('meta[property="video:release_date"]').attr('content') || '';

    const playParts = [];
    let index = 1;
    $('div.dplayer').each((_, element) => {
        try {
            const config = JSON.parse($(element).attr('data-config') || '{}');
            const videoUrl = config?.video?.url || '';
            if (videoUrl) {
                playParts.push(`第${index}集$${videoUrl}`);
                index++;
            }
        } catch (e) {}
    });

    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_year: year,
            vod_play_from: '007吃瓜',
            vod_play_url: playParts.join('#'),
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
    const list = await parseVods($);

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
        key: 'cg007',
        name: '007吃瓜',
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