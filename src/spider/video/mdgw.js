import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';


const PORT  = process.env.DEV_HTTP_PORT || 9988;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://duh9tkabj8z9p.cloudfront.net';

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...headers },
    });
    return resp.data;
}

function e64(s) {
    try { return Buffer.from(s || '').toString('base64'); } catch { return ''; }
}

function d64(s) {
    try { return Buffer.from(s || '', 'base64').toString('utf-8'); } catch { return ''; }
}

function imgDecrypt(buf) {
    const data = Buffer.from(buf);
    const key  = Buffer.from('2019ysapp7527');
    // 只有前100字节做了 XOR，后面不动
    for (let i = 0; i < 100 && i < data.length; i++) {
        data[i] ^= key[i % key.length];
    }
    return data;
}

function proxyImgUrl(raw) {
    return `http://127.0.0.1:${PORT}/spider/mdgw/3/img?url=${encodeURIComponent(e64(raw))}`;
}


async function parseVods($) {
    const items = [];
    $('article').each((_, element) => {
        const rawPic = $(element).find('.videoCover').attr('data-src');
        const url = $(element).find('a').attr('href') || '';
        const name = $(element).find('.videoTitle').text().trim();
        const parts = url.split('/');
        const id = parts[2] || '';
        if (name && url) {
            items.push(
                { 
                    vod_id: id, 
                    vod_name: name, 
                    vod_pic: rawPic ? proxyImgUrl(rawPic) : ''
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
    const classes = [];
    const html = await request(site);
    const $ = load(html);
    $('.pcNavList a').each((_, element) => {
        const href = $(element).attr('href') || '';
        const name = $(element).find('.pcNavName').text() || '';
        if(name === '首页' || name === '' ) return
        classes.push(
            { 
                type_id: href, 
                type_name: name,
            }
        );
    });
    return { class: classes,  filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    const url = `${site}${tid}${page}/`;
    const html = await request(url);
    const $ = load(html);
    const list = await parseVods($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const html = await request(`${site}/archives/${id}/`);
    const $ = load(html);
    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic = $('meta[property="og:image"]').attr('content') || '';
    const des = $('meta[name="description"]').attr('content') || '';
    const info = $('script[type="application/ld+json"]').text().trim();
    const json = JSON.parse(info)
    let playUrl = site + '/h5/m3u8/' + json.video.embedUrl
    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_content: des,
            vod_play_from: '第一吃瓜',
            vod_play_url: '播放$' + playUrl,
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: { 'User-Agent': UA ,'Referer' : site+ '/'},
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

        const decrypted = imgDecrypt(Buffer.from(resp.data));
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
        key: 'mdgw',
        name: '麻豆瓜网',
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