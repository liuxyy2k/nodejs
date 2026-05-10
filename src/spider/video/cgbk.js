import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';

const PORT   = process.env.DEV_HTTP_PORT || 9988;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://www.cgbk100.com';
const img = 'https://image.xhs3.store'

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...headers }
    });
    return resp.data;
}

function e64(s) {
    try { return Buffer.from(s || '').toString('base64'); } catch { return ''; }
}

function d64(s) {
    try { return Buffer.from(s || '', 'base64').toString('utf-8'); } catch { return ''; }
}

function aesDecrypt(buf) {
    const key      = Buffer.from('k9:3zeFq~]-EQMF,gpGx*uRw+x,n]xw9'); // 32 bytes → AES-256
    const iv       = Buffer.from('Zd3!t#t1YN=!fs)D');                   // 16 bytes
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    return Buffer.concat([decipher.update(buf), decipher.final()]);
}

function proxyImgUrl(raw) {
    return `http://127.0.0.1:${PORT}/spider/cgbk/3/img?url=${encodeURIComponent(e64(raw))}`;
}


async function parseVods($) {
    const items = [];

    $('article').each((_, element) => {
        const rawPic = $(element).find('.default-img').attr('data-crypto-src');
        const url = $(element).find('.text-decoration-none').attr('href') || '';
        const name = $(element).find('.fw-bold').text().trim();
        const date  = $(element).find('.d-flex.align-items-center div').eq(0).text().trim();
        const parts = url.split('/');
        const id = parts[2] || '';
        if (name && url) {
            items.push(
                { 
                    vod_id: id, 
                    vod_name: name, 
                    vod_pic: rawPic ? proxyImgUrl(img + rawPic) : '',
                    vod_remarks: date.split(' ')[0]
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
        { type_id: '',     type_name: '全部' },
        { type_id: '17', type_name: '热门大瓜' },
        { type_id: '15', type_name: '海角乱伦' },
        { type_id: '11', type_name: '网黄合集' },
        { type_id: '18', type_name: '开放校园' },
        { type_id: '10', type_name: '官场风月' },
        { type_id: '16', type_name: '香艳职场' },
        { type_id: '12', type_name: '出轨偷晴' },
        { type_id: '14', type_name: '明星黑料' },
        { type_id: '21', type_name: '探花精选' },
        { type_id: '13', type_name: '海外吃瓜' },
        { type_id: '19', type_name: '福利姬' }
    ];

    return { class: classes,  filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;
    let url = `${site}/category_${tid}_${page}`;
    if(tid === '') {
        url = `${site}/page_${page}`;
    }
    const html = await request(url);
    const $ = load(html);
    const list = await parseVods($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const html = await request(`${site}/article/${id}`);
    const $ = load(html);

    const script = $('script[type="application/ld+json"]').text();
    const json = JSON.parse(script)
    console.log(json)
    const playParts = $('.video-list').attr('src') || '';

    return {
        list: [{
            vod_id: id,
            vod_name: json.name,
            vod_pic: json.mainEntity[0].image,
            vod_content: json.mainEntity[0].description,
            vod_play_from: '吃瓜百科',
            vod_play_url: '专线$' + playParts,
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

        console.log('[imgProxy] 请求URL:', raw); // ← 确认拿到的 URL 对不对

        const resp = await axios.get(raw, {
            headers: {
                'User-Agent': UA,
                'Referer':    `${site}/`,
                'Origin':     site,
            },
            responseType: 'arraybuffer',
            timeout:      10000,
        });

        const buf = Buffer.from(resp.data);
        
        const decrypted = aesDecrypt(buf);
        let ct = 'image/jpeg';
        if (decrypted[0] === 0x89 && decrypted[1] === 0x50) ct = 'image/png';
        else if (decrypted.slice(0, 4).toString() === 'GIF8') ct = 'image/gif';

        reply.header('Content-Type', ct).send(decrypted);
    } catch (e) {
        console.error('imgProxy error:', e.message);
        reply.code(500).send('');
    }
}

export default {
    meta: {
        key: 'cgbk',
        name: '🔥吃瓜百科',
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