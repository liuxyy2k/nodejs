import axios from 'axios';
import crypto from 'crypto';
import https from 'https';
import zlib from 'zlib';

const API_DOMAIN = 'https://api-al.yuytyr.online';
const IMG_DOMAIN = 'https://images.yxdesign.art';
const PORT = process.env.DEV_HTTP_PORT || 9988;
const META_KEY = 'fulao2';

const REQ_KEY = Buffer.from('euZN1Gg3JIwWOEWhmE7C4l5dSSRU34fyuPMXjtuoqVs=', 'base64');
const RESP_KEY = Buffer.from('db6f7f9e5d7a770e0e3497a7d7a077f5', 'utf8');
const IMG_KEY = Buffer.from('svOEKGb5WD0ezmHE4FXCVQ==', 'base64');
const IMG_IV = Buffer.from('4B7eYzHTevzHvgVZfWVNIg==', 'base64');
const PAYLOAD_IV = Buffer.from('B3nBQVSgjRuC09mgsdbgIg==', 'base64');

const UA_APP = 'Fulao2/Android 2.40; Lenovo TB-J606F';
const UA_CDN = 'com.ilulutv.fulao2.main.MyApplication/2.40 (Linux;Android 11) ExoPlayerLib/2.11.1';
const UA_IMG = 'Dalvik/2.1.0 (Linux; U; Android 11; Lenovo TB-J606F Build/RKQ1.210303.002)';

const X_INFO_LAUNCH = 'eyJjcGFnZSI6ImxhdW5jaCIsInBsYXRmb3JtIjoyLCJwcGFnZSI6IiIsInZlcnNpb24iOiIyLjQwIn0=';
const X_INFO_CENSOR = 'eyJjcGFnZSI6ImNlbnNvciIsInBsYXRmb3JtIjoyLCJwcGFnZSI6ImxhdW5jaCIsInZlcnNpb24iOiIyLjQwIn0=';
const X_INFO_PLAY = 'eyJjcGFnZSI6InBsYXkiLCJwbGF0Zm9ybSI6MiwicHBhZ2UiOiJjZW5zb3IiLCJ2ZXJzaW9uIjoiMi40MCJ9';

const TARGET_CATEGORIES = [
    '推荐',
    'H动画',
    '最新',
    '抢先看',
    '中字',
    'NTR',
    '火爆',
    'FC2',
    '91大神',
    '传媒',
];

const STREAM_HOSTS = [
    ['VIP高速3', 'https://stream.yxdesign.art'],
    ['VIP高速1', 'https://stream.lingqi.co'],
    ['VIP高速2', 'https://stream-hua.hangbo.xyz'],
    ['海外线路', 'https://stream.ass6.store'],
];

const QUALITIES = [
    ['480', '高清'],
    ['240', '标清'],
];

const m3u8Cache = new Map();

let token = '';

const http = axios.create({
    timeout: 20000,
    validateStatus: () => true,
    headers: {
        'user-agent': UA_APP,
        authorization: 'Bearer ',
        'accept-encoding': 'gzip',
        'x-info': X_INFO_LAUNCH,
    },
});

function log(msg) {
    console.log(`[Fulao2] ${msg}`);
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function getBase(inReq) {
    const prefix = inReq?.server?.prefix || `/spider/${META_KEY}/3`;
    return `http://127.0.0.1:${PORT}${prefix}`;
}

function pkcs7Unpad(buf) {
    if (!buf.length) return buf;
    const pad = buf[buf.length - 1];
    if (pad < 1 || pad > 16) return buf;
    return buf.subarray(0, buf.length - pad);
}

function encryptPayload(path) {
    const payload = JSON.stringify({
        path,
        device_id: 'aeffaaa7-166c-4545-8971-c669ff59f611',
        utm_medium: '',
        model: 'LENOVOLenovo TB-J606F',
        universal_id: '3027776cc331ee45',
        platform: 'Android',
        key: 'f7787644a1f6b8e41a580fdfb4501acb9c095dda346567fa82a15c68a55b4ce1',
        timestamp: '1785928268',
    });
    const cipher = crypto.createCipheriv('aes-256-cbc', REQ_KEY, PAYLOAD_IV);
    const ct = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
    return `${PAYLOAD_IV.toString('base64')}.${ct.toString('base64')}`;
}

function deriveIv(ct, xorText) {
    const ecb = crypto.createDecipheriv('aes-256-ecb', RESP_KEY, null);
    ecb.setAutoPadding(false);
    const block = ecb.update(ct.subarray(0, 16));
    const xorBuf = Buffer.alloc(16, 0);
    xorBuf.write(xorText.slice(0, 16));
    return Buffer.from(block.map((b, i) => b ^ xorBuf[i]));
}

function decryptResp(text) {
    try {
        const ct = Buffer.from(text, 'base64');
        const iv = deriveIv(ct, '{"status":{"code');
        const decipher = crypto.createDecipheriv('aes-256-cbc', RESP_KEY, iv);
        let raw = Buffer.concat([decipher.update(ct), decipher.final()]);
        raw = pkcs7Unpad(raw);
        if (raw[0] === 0x1f && raw[1] === 0x8b) raw = zlib.gunzipSync(raw);
        return JSON.parse(raw.toString('utf8'));
    } catch (e) {
        log(`decrypt_err: ${e.message}`);
        return null;
    }
}

function decryptM3u8(text) {
    try {
        const ct = Buffer.from(text, 'base64');
        const iv = deriveIv(ct, '#EXTM3U\n#EXT-X-V');
        const decipher = crypto.createDecipheriv('aes-256-cbc', RESP_KEY, iv);
        let raw = Buffer.concat([decipher.update(ct), decipher.final()]);
        raw = pkcs7Unpad(raw);
        if (raw[0] === 0x1f && raw[1] === 0x8b) raw = zlib.gunzipSync(raw);
        return raw.toString('utf8');
    } catch (e) {
        log(`decrypt_m3u8_err: ${e.message}`);
        return null;
    }
}

async function api(method, path, xinfo = null) {
    const enc = encryptPayload(path);
    const url = `${API_DOMAIN}/${path}`;
    const h = {};
    if (xinfo) h['x-info'] = xinfo;
    try {
        let r;
        if (method === 'POST') {
            h['content-type'] = 'application/x-www-form-urlencoded';
            r = await http.post(url, `payload=${encodeURIComponent(enc)}`, { headers: h, timeout: 15000 });
        } else {
            r = await http.get(`${url}?payload=${encodeURIComponent(enc)}`, { headers: h, timeout: 15000 });
        }
        if (r.status === 200) return decryptResp(String(r.data || ''));
        return null;
    } catch (e) {
        log(`api_err ${path}: ${e.message}`);
        return null;
    }
}

async function getToken() {
    const data = await api('POST', 'v1/register/token');
    if (data?.response) {
        const resp = data.response;
        token = resp.token || resp.access_token || '';
        http.defaults.headers.authorization = `Bearer ${token}`;
    }
}

function imgUrl(path, inReq) {
    if (!path) return '';
    const full = path.startsWith('http') ? path : `${IMG_DOMAIN}${path.startsWith('/') ? '' : '/'}${path}`;
    return `${getBase(inReq)}/img?url=${encodeURIComponent(full)}`;
}

function playUrl(cacheKey, inReq) {
    return `${getBase(inReq)}/m3u8?vid=${encodeURIComponent(cacheKey)}`;
}

async function fetchM3u8(vid, hLabel, hHost, quality) {
    const cacheKey = `${vid}_${hLabel}_${quality}`;
    if (m3u8Cache.has(cacheKey)) return cacheKey;

    const url = `${API_DOMAIN}/v3/media/${quality}/${vid}.m3u8?&token=${token}&h=${encodeURIComponent(hHost)}`;
    try {
        const resp = await http.get(url, { timeout: 20000, maxRedirects: 5 });
        if (resp.status !== 200) {
            log(`fetch_m3u8 ${hLabel}-${quality} status=${resp.status}`);
            return null;
        }
        const text = decryptM3u8(String(resp.data || ''));
        if (!text) return null;
        m3u8Cache.set(cacheKey, text);
        log(`fetch_m3u8 ${hLabel}-${quality} OK`);
        return cacheKey;
    } catch (e) {
        log(`fetch_m3u8 ${hLabel}-${quality} ${e.message}`);
        return null;
    }
}

function prefetchAll(vid) {
    const tasks = [];
    for (const [hLabel, hHost] of STREAM_HOSTS) {
        for (const [q] of QUALITIES) {
            const ck = `${vid}_${hLabel}_${q}`;
            if (!m3u8Cache.has(ck)) tasks.push([vid, hLabel, hHost, q]);
        }
    }
    if (!tasks.length) return;
    (async () => {
        const chunk = 4;
        for (let i = 0; i < tasks.length; i += chunk) {
            await Promise.all(tasks.slice(i, i + chunk).map((args) => fetchM3u8(...args)));
        }
    })().catch((e) => log(`prefetch: ${e.message}`));
}

async function init(_inReq, _outResp) {
    token = '';
    await getToken();
    return {};
}

async function home(_inReq, _outResp) {
    const data = await api('GET', 'v2/menu/type');
    const classes = [];
    const seen = new Set();
    if (data?.response) {
        for (const group of ['pixeled', 'unpixeled']) {
            for (const item of data.response[group] || []) {
                const t = item.title || '';
                if (TARGET_CATEGORIES.includes(t) && !seen.has(t)) {
                    seen.add(t);
                    classes.push({ type_id: String(item.id), type_name: t });
                }
            }
        }
    }
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg = parseInt(inReq.body.page, 10) || 1;
    const data = await api('GET', `v1/menu/${tid}/layout`, X_INFO_CENSOR);
    const videos = [];
    if (data?.response) {
        for (const layout of data.response) {
            let items = layout.data;
            if (items && typeof items === 'object' && !Array.isArray(items)) items = [items];
            if (!Array.isArray(items)) continue;
            for (const v of items) {
                const vid = v.video_id;
                const title = v.video_title || '';
                if (!vid || !title) continue;
                const rawPic = v.cover || v.thumb || '';
                let actor = v.actor || '';
                if (Array.isArray(actor)) actor = actor.join('、');
                videos.push({
                    vod_id: String(vid),
                    vod_name: title,
                    vod_pic: imgUrl(rawPic, inReq),
                    vod_remarks: actor,
                });
            }
        }
    }
    return {
        list: videos,
        page: pg,
        pagecount: 99,
        limit: videos.length || 20,
    };
}

async function detail(inReq, _outResp) {
    const vid = String(inReq.body.id || '');
    const info = await api('GET', `v1/video/info/${vid}`, X_INFO_PLAY);

    let rawPic = '';
    let title = '';
    let number = '';
    let desc = '';
    let actor = '';
    let tags = '';
    if (info?.response) {
        const r = info.response;
        rawPic = r.cover_url || r.cover || r.thumb || '';
        title = r.video_title || '';
        number = r.video_number || '';
        desc = r.video_description || '';
        const a = r.actor || [];
        actor = Array.isArray(a) ? a.join('、') : String(a);
        const tg = r.video_tags || [];
        tags = Array.isArray(tg) ? tg.join(' ') : String(tg);
    }

    const [defaultLabel, defaultHost] = STREAM_HOSTS[0];
    let defaultKey = await fetchM3u8(vid, defaultLabel, defaultHost, '480');
    if (!defaultKey) defaultKey = await fetchM3u8(vid, defaultLabel, defaultHost, '240');
    if (!defaultKey) {
        log(`detail 默认线路解析失败 vid=${vid}`);
        return { list: [] };
    }

    prefetchAll(vid);

    const fromParts = [];
    const urlGroups = [];
    for (const [hLabel] of STREAM_HOSTS) {
        const parts = [];
        for (const [quality, qLabel] of QUALITIES) {
            const ck = `${vid}_${hLabel}_${quality}`;
            parts.push(`${qLabel}$${playUrl(ck, inReq)}`);
        }
        fromParts.push(hLabel);
        urlGroups.push(parts.join('$$$'));
    }

    return {
        list: [
            {
                vod_id: vid,
                vod_name: title,
                vod_pic: imgUrl(rawPic, inReq),
                vod_remarks: number,
                vod_content: desc || tags,
                vod_actor: actor,
                vod_play_from: fromParts.join('$$$'),
                vod_play_url: urlGroups.join(':::'),
            },
        ],
    };
}

async function play(_inReq, _outResp) {
    return {
        parse: 0,
        url: _inReq.body.id || '',
        header: {
            'User-Agent': UA_CDN,
            Cookie: 'jwt=token',
        },
    };
}

async function search(_inReq, _outResp) {
    return { list: [] };
}

async function m3u8Handler(inReq, reply) {
    const key = decodeURIComponent(inReq.query.vid || '');
    let content = '';
    for (let i = 0; i < 40; i++) {
        content = m3u8Cache.get(key) || '';
        if (content) break;
        await sleep(500);
    }
    if (!content) return reply.code(404).send('');
    return reply
        .code(200)
        .header('Content-Type', 'application/vnd.apple.mpegurl')
        .header('Cache-Control', 'no-cache')
        .send(content);
}

async function imgHandler(inReq, reply) {
    const url = decodeURIComponent(inReq.query.url || '');
    if (!url) return reply.code(404).send('');
    try {
        const r = await axios.get(url, {
            headers: {
                'User-Agent': UA_IMG,
                'Accept-Encoding': 'gzip',
                Connection: 'Keep-Alive',
            },
            httpsAgent,
            responseType: 'arraybuffer',
            timeout: 10000,
            maxRedirects: 5,
            validateStatus: () => true,
        });
        let body = Buffer.from(r.data);
        try {
            const decipher = crypto.createDecipheriv('aes-128-cbc', IMG_KEY, IMG_IV);
            body = Buffer.concat([decipher.update(body), decipher.final()]);
        } catch {
            /* raw */
        }
        return reply.code(200).header('Content-Type', 'image/jpeg').send(body);
    } catch (e) {
        log(`img proxy: ${e.message}`);
        return reply.code(500).send('');
    }
}

export default {
    meta: {
        key: META_KEY,
        name: '🔥Fulao2',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/m3u8', m3u8Handler);
        fastify.get('/img', imgHandler);
    },
};
