import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';

const siteUrl = 'https://872.9n5c2.com';
const searchUrl = siteUrl + '/drama/search/result?keyword=';

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': siteUrl + '/',
    'Content-Type': 'application/json'
};

const PORT   = process.env.DEV_HTTP_PORT || 9988;

async function request(url) {
    const resp = await axios.get(url, { headers});
    return resp.data;
}

function e64(s) {
    try { return Buffer.from(s || '').toString('base64'); } catch { return ''; }
}

function d64(s) {
    try { return Buffer.from(s || '', 'base64').toString('utf-8'); } catch { return ''; }
}

function aesDecrypt(buf) {
    const key      = Buffer.from('f5d965df75336270');
    const iv       = Buffer.from('97b60394abc2fbe1');
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    return Buffer.concat([decipher.update(buf), decipher.final()]);
}

function proxyImgUrl(raw) {
    return `http://127.0.0.1:${PORT}/spider/vlives/3/img?url=${encodeURIComponent(e64(raw))}`;
}

// 解析视频列表（对应 Java 的 parseVods）
function parseVods($) {
    const list = [];
    $('.thumbnail').each((_, element) => {
        const pic = $(element).find('.lozad').attr('data-src') || '';
        const url = $(element).find('a').eq(0).attr('href') || '';
        const name = $(element).find('.my-2 ').text().trim() || '';
        const type = $(element).find('.left-1').text().trim() || '';
        const date = $(element).find('.right-1').text().trim() || '';
        if (pic.endsWith('.gif') || !name) return;
        list.push({
            vod_id: url,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: type + '|' + date,
        });
    });
    return list;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
            { type_id: '/live', type_name: '直播' }
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg = inReq.body.page || 1;
    let url = `https://hgapi-c.k93x6m.vip/api/live/index?channel=vvsjb`
    const resp = await axios.post(
        url,
        {
            id: 1,
            page: pg
        },
        {
            headers: headers
        }
    );
    const videos = []
    for (const item of resp.data.lives) {
        if (item.username) {
            videos.push({
                vod_id: item.id,
                vod_name: item.username,
                vod_pic: proxyImgUrl(item.cover),
                vod_remarks: item.viewCount,
            })
        }
    }

    return { page: pg, list: videos };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    let url = `https://hgapi-c.k93x6m.vip/api/live/detail?channel=vvsjb`
    const resp = await axios.post(url,
        {
            id:  Number.parseInt(id, 10)
        },
        {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': siteUrl + '/',
                'Content-Type': 'application/json',
                'Origin': siteUrl
            }
        }
    );
    const data = resp.data;
    let playUrl = data.hls[0].url
    return {
        list: [{
            vod_id: id,
            vod_name: data.username,
            vod_pic: '',
            vod_play_from: 'Vlives',
            vod_play_url: '高清$' + playUrl,
            vod_content: 'Y2K专线'
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: headers
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const url = searchUrl + text;
    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { list };
}

async function imgProxy(inReq, reply) {
    try {
        let raw = d64(inReq.query.url);

        if (typeof raw === "string") {
            const match = raw.match(/loadBannerDirect\('([^']*)'/);
            if (match) raw = match[1];
        }

        if (!raw) {
            return reply.code(404).send('');
        }

        const resp = await axios.get(raw, {
            headers: headers,
            responseType: 'arraybuffer',
            timeout: 10000,
        });

        const buffer = Buffer.from(resp.data);

        const decrypted = aesDecrypt(buffer);

        // ===== MIME 判断（完整版）=====
        let ct = 'image/jpeg';

        if (decrypted[0] === 0x89 && decrypted[1] === 0x50) {
            ct = 'image/png';
        } 
        else if (
            decrypted[0] === 0x47 &&
            decrypted[1] === 0x49 &&
            decrypted[2] === 0x46
        ) {
            ct = 'image/gif';
        }
        else if (
            decrypted.slice(0, 4).toString() === 'RIFF'
        ) {
            ct = 'image/webp';
        }

        reply
            .header('Content-Type', ct)
            .header('Cache-Control', 'public, max-age=86400')
            .send(decrypted);

    } catch (e) {
        console.error('imgProxy error:', e.message);
        reply.code(500).send('');
    }
}

export default {
    meta: {
        key: 'vlives',
        name: 'V大秀直播',
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