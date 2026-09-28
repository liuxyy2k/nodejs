import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';

import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const PORT   = process.env.DEV_HTTP_PORT || 9988;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://heiliaodi.com';

const headers = {
    'User-Agent': UA,
    Referer: `${site}/`,
    Origin: site,
};

async function request(reqUrl, extraHeaders = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { ...headers, ...extraHeaders },
        // httpsAgent: agent,
        timeout: 20000,
    });
    return resp.data;
}

function e64(s) {
    try { return Buffer.from(s || '').toString('base64'); } catch { return ''; }
}

function d64(s) {
    try { return Buffer.from(s || '', 'base64').toString('utf-8'); } catch { return ''; }
}



const AES_KEY = 'f5d965df75336270';
const AES_IV  = '97b60394abc2fbe1';

function isImgMagic(buf) {
    return (
        (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) ||
        (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) ||
        (buf.slice(0,3).toString() === 'GIF') ||
        (buf.slice(0,4).toString() === 'RIFF')
    );
}

function imgDecrypt(buf) {
    const out = Buffer.from(buf);
    const key = Buffer.from('2019ysapp7527');
    for (let i = 0; i < 100 && i < out.length; i++) {
        out[i] ^= key[i % key.length];
    }
    return out;
}

function aesDecrypt(buf) {
    const decipher = crypto.createDecipheriv(
        'aes-128-cbc',
        Buffer.from(AES_KEY, 'utf8'),
        Buffer.from(AES_IV, 'utf8')
    );

    decipher.setAutoPadding(true);

    return Buffer.concat([
        decipher.update(buf),
        decipher.final()
    ]);
}

function decodeImg(buf) {

    if (isImgMagic(buf)) {
        return buf;
    }

    if (buf.length % 16 === 0) {
        try {
            const aes = aesDecrypt(buf);

            if (isImgMagic(aes)) {
                return aes;
            }

            const aesXor = imgDecrypt(aes);

            if (isImgMagic(aesXor)) {
                return aesXor;
            }
        } catch (e) {}
    }

    const plainXor = imgDecrypt(buf);
    if (isImgMagic(plainXor)) return plainXor;
    return buf;
}

function normalizePlayUrl(url, fallbackHost) {
    const u = String(url || '').trim();
    if (!u) return '';
    if (u.startsWith('http')) return u;
    if (u.startsWith('//')) return `https:${u}`;
    const base = fallbackHost.replace(/\/$/, '');
    return `${base}${u.startsWith('/') ? u : `/${u}`}`;
}

function extractCdnHost(html) {
    return String(html).match(/https?:\/\/[^/"'\s]+\.tjacq\.com/i)?.[0] || 'https://3grr4rd.tjacq.com';
}

function proxyImgUrl(raw) {
    return `http://127.0.0.1:${PORT}/spider/heiliaodi/3/img?url=${encodeURIComponent(e64(raw))}`;
}


async function parseVods($) {
    const items = [];

    $('article').each((_, element) => {
        const rawPic = $(element).find('.post-card').attr('data-banner') || '';
        const url = $(element).find('a').attr('href') || '';
        const name = $(element).find('h2').text().trim();
        const date  = $(element).find('span[itemprop="datePublished"]').text().trim();
        if (name && url) {
            items.push(
                { 
                    vod_id: url, 
                    vod_name: name, 
                    vod_pic: rawPic ? proxyImgUrl(rawPic) : '',
                    vod_remarks: date.replace(/\s*年\s*|\s*月\s*/g, '-').replace(/\s*日/, '').trim()
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
    $('.nav-link').each((_, element) => {
        const href = $(element).attr('href') || '';
        const name = $(element).find('div').text().trim() || '';
        if(name === '首页' || name === '' || href == '#' ) return
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
    let url = `${site}${tid}${page}/`;
    if(tid === '') {
        url = `${site}/page/${page}/`;
    }
    const html = await request(url);
    const $ = load(html);
    const list = await parseVods($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const html = await request(`${site}${id}`);
    const $ = load(html);

    const name = $('meta[property="og:title"]').attr('content') || '';
    let pic = $('meta[property="og:image"]').attr('content') || '';
    if (!pic || /logo\.png/i.test(pic)) {
        const banner = $('.post-card').attr('data-banner') || $('[data-banner]').first().attr('data-banner') || '';
        pic = banner ? proxyImgUrl(banner) : pic;
    } else if (pic.startsWith('http')) {
        pic = proxyImgUrl(pic);
    }
    const des = $('meta[property="og:description"]').attr('content') || '';
    const playRaw = $('#article-videos').attr('data-url') || '';
    const host = extractCdnHost(html);
    let vodPlayUrl = '';
    if (playRaw) {
        try {
            const urls = JSON.parse(playRaw);
            vodPlayUrl = urls
                .map((url, index) => `线路${index + 1}$${normalizePlayUrl(url, host)}`)
                .filter((item) => /\$https?:\/\//.test(item))
                .join('#');
        } catch (e) {}
    }
    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_content: des,
            vod_play_from: '黑料不打烊',
            vod_play_url: vodPlayUrl,
        }],
    };
}

async function play(inReq, _outResp) {
    const url = inReq.body.id || '';
    let referer = `${site}/`;
    try {
        if (/tjacq\.com/i.test(url)) referer = new URL(url).origin + '/';
    } catch {}
    return {
        parse: 0,
        url,
        header: { ...headers, Referer: referer },
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
                ...headers,
                Referer: `${site}/`,
            },
            httpsAgent: agent,
            responseType: 'arraybuffer',
            timeout:      10000,
        });

        const decrypted = decodeImg(Buffer.from(resp.data));
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
        key: 'heiliaodi',
        name: '🍉黑料帝',
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