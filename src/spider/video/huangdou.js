import axios from 'axios';
import crypto from 'crypto';

const PORT = process.env.DEV_HTTP_PORT || 9988;
const PREFIX = '/spider/huangdou/3';
const DEFAULT_HOST = 'https://xqjzvcvt.top';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const NAME = '黄豆短剧';
const KEY_PREFIX = 'xnaichanping';
const ERROR_PLAY_URL =
    'https://kjjsaas-sh.oss-cn-shanghai.aliyuncs.com/u/3401405881/20240818-936952-fc31b16575e80a7562cdb1f81a39c6b0.mp4';

let host = DEFAULT_HOST;
let api = `${DEFAULT_HOST}/api`;
let displayName = NAME;

const headers = {
    'User-Agent': UA,
    Accept: 'application/json, text/plain, */*',
    Referer: `${DEFAULT_HOST}/`,
    Origin: DEFAULT_HOST,
};

function parseExtend(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

function bindHeaders() {
    headers.Referer = `${host}/`;
    headers.Origin = host;
}

function isEncryptedCover(url) {
    return url && (url.includes('encryptimages') || url.includes('.bng'));
}

function proxyPic(url, inReq) {
    if (!url) return '';
    if (!isEncryptedCover(url)) return url;
    const prefix = inReq?.server?.prefix || PREFIX;
    return `http://127.0.0.1:${PORT}${prefix}/img?url=${encodeURIComponent(url)}`;
}

function deriveMediaKey(url) {
    const m = String(url || '').match(/([0-9a-f]{64})/);
    if (!m) return null;
    const ver = String(url).match(/[?&]version=([^&#]+)/);
    const version = ver ? decodeURIComponent(ver[1]) : 'v1';
    return crypto.createHash('md5').update(KEY_PREFIX + m[1] + version).digest();
}

function aesBlock(mode, key, data) {
    const iv = Buffer.alloc(16, 0);
    const c =
        mode === 'encrypt'
            ? crypto.createCipheriv('aes-128-cbc', key, iv)
            : crypto.createDecipheriv('aes-128-cbc', key, iv);
    c.setAutoPadding(false);
    return Buffer.concat([c.update(data), c.final()]);
}

function decryptImg(encrypted, url) {
    const key = deriveMediaKey(url);
    if (!key) return encrypted;
    const t = Math.floor(encrypted.length / 16);
    if (t < 1) return encrypted;
    const last = encrypted.subarray((t - 1) * 16, t * 16);
    const a = Buffer.alloc(16);
    for (let i = 0; i < 16; i++) a[i] = last[i] ^ 16;
    const o = aesBlock('encrypt', key, a).subarray(0, 16);
    const c = aesBlock('decrypt', key, Buffer.concat([encrypted.subarray(0, t * 16), o]));
    const u = Buffer.alloc(c.length);
    c.copy(u, 0, 0, 16);
    for (let f = 1; f < t; f++) {
        for (let h = 0; h < 16; h++) {
            u[f * 16 + h] = c[f * 16 + h] ^ encrypted[(f - 1) * 16 + h];
        }
    }
    const d = u[u.length - 1];
    return d >= 1 && d <= 16 ? u.subarray(0, u.length - d) : u;
}

function imageMime(buf) {
    if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
    if (buf.length >= 6 && buf.subarray(0, 3).toString() === 'GIF') return 'image/gif';
    if (buf.length >= 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') {
        return 'image/webp';
    }
    return 'image/jpeg';
}

function parseVod(item, inReq) {
    item = item || {};
    return {
        vod_id: String(item.id ?? ''),
        vod_name: item.t || '',
        vod_pic: proxyPic(item.cover || '', inReq),
        vod_remarks: `${item.serial || ''}·${item.eps || 0}集`,
    };
}

async function apiGet(path) {
    try {
        const resp = await axios.get(`${api}${path}`, {
            headers,
            timeout: 15000,
            validateStatus: () => true,
        });
        const body = resp.data;
        if (body && typeof body === 'object' && body.code === 0 && body.data != null) return body.data;
        return null;
    } catch {
        return null;
    }
}

function hlsKeyBytes(url) {
    const m = String(url || '').match(/\/hls\/([0-9a-f]{64})\//);
    if (!m) return null;
    const ver = String(url).match(/[?&]version=([^&#]+)/);
    const version = ver ? decodeURIComponent(ver[1]) : 'v1';
    return crypto.createHash('md5').update(KEY_PREFIX + m[1] + version).digest();
}

async function buildM3u8(url) {
    if (!url) return '';
    const resp = await axios.get(url, {
        headers,
        timeout: 15000,
        responseType: 'text',
        validateStatus: () => true,
    });
    if (resp.status >= 400) return '';
    let content = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    const keyBytes = hlsKeyBytes(url);
    if (keyBytes) {
        const keyUri = `data:text/plain;base64,${keyBytes.toString('base64')}`;
        content = content.replace(/(#EXT-X-KEY:.*?URI=")[^"]*(")/, `$1${keyUri}$2`);
    }
    const base = url.slice(0, url.lastIndexOf('/') + 1);
    return content
        .split('\n')
        .map((line) => {
            const s = line.trim();
            if (s && !s.startsWith('#') && !/^https?:\/\//i.test(s)) return base + s;
            return s;
        })
        .join('\n');
}

async function init(inReq) {
    const cfg = parseExtend(inReq?.body?.extend);
    if (cfg.name) displayName = cfg.name;
    if (cfg.base_url) {
        host = String(cfg.base_url).replace(/\/$/, '');
        api = `${host}/api`;
        bindHeaders();
    }
    return {};
}

async function home(inReq) {
    const result = { class: [], filters: {}, list: [] };
    const channel = await apiGet('/channel/home?platform=mobile&size=20');
    const sections = Array.isArray(channel?.sections) ? channel.sections : [];
    for (const sec of sections) {
        if (sec?.l3Id && sec?.name) {
            result.class.push({ type_id: `l3_${sec.l3Id}`, type_name: sec.name });
        }
        if (Array.isArray(sec?.dramas)) {
            for (const item of sec.dramas) result.list.push(parseVod(item, inReq));
        }
    }
    if (!result.list.length) {
        const homeData = await apiGet('/home');
        for (const key of ['guess', 'feature']) {
            if (Array.isArray(homeData?.[key])) {
                for (const item of homeData[key]) result.list.push(parseVod(item, inReq));
            }
        }
    }
    return result;
}

async function category(inReq) {
    const tid = String(inReq.body.id || '').replace(/^l3_/, '');
    const pg = parseInt(inReq.body.page, 10) || 1;
    const data = await apiGet(`/dramas?platform=mobile&l3Id=${tid}&sort=${encodeURIComponent('最新')}&page=${pg}&size=20`);
    const list = Array.isArray(data?.list) ? data.list.map((item) => parseVod(item, inReq)) : [];
    const total = Number(data?.total) || 0;
    return {
        page: pg,
        pagecount: total ? Math.ceil(total / 20) : 999,
        limit: 20,
        total: total || 99999,
        list,
    };
}

async function detail(inReq) {
    let vid = inReq.body.id;
    if (Array.isArray(vid)) vid = vid[0];
    vid = String(vid || '');
    if (!vid) return { list: [] };
    const data = await apiGet(`/dramas/${vid}`);
    if (!data || typeof data !== 'object') return { list: [] };
    const play = [];
    for (const ep of Array.isArray(data.episodes) ? data.episodes : []) {
        if (ep?.playUrl) play.push(`${ep.title || `第${ep.ep || 0}集`}$${ep.playUrl}`);
    }
    return {
        list: [
            {
                vod_id: String(data.id ?? vid),
                vod_name: data.t || '',
                vod_pic: proxyPic(data.cover || '', inReq),
                type_name: data.sub || '',
                vod_year: '',
                vod_area: '',
                vod_remarks: `${data.serial || ''}·${data.plays || ''}播放`,
                vod_actor: '',
                vod_director: '未知',
                vod_content: data.summary || data.t || '',
                vod_play_from: displayName,
                vod_play_url: play.join('#'),
            },
        ],
    };
}

async function search(inReq) {
    const key = String(inReq.body.wd || '').trim();
    const pg = parseInt(inReq.body.page, 10) || 1;
    if (!key) return { list: [], page: pg, pagecount: 1, limit: 20, total: 0 };
    const data = await apiGet(`/search?kw=${encodeURIComponent(key)}&page=${pg}&size=20`);
    const list = Array.isArray(data?.list) ? data.list.map((item) => parseVod(item, inReq)) : [];
    const total = Number(data?.total) || 0;
    return {
        page: pg,
        pagecount: total ? Math.ceil(total / 20) : 0,
        limit: 20,
        total: total || 99999,
        list,
    };
}

async function play(inReq) {
    const id = String(inReq.body.id || '');
    if (!id) return { parse: 0, playUrl: '', url: ERROR_PLAY_URL };
    try {
        const m3u8 = await buildM3u8(id);
        if (m3u8) {
            const b64 = Buffer.from(m3u8, 'utf8').toString('base64');
            return {
                parse: 0,
                playUrl: '',
                url: `data:application/vnd.apple.mpegurl;base64,${b64}`,
            };
        }
    } catch {
        /* fallback */
    }
    return { parse: 0, playUrl: '', url: ERROR_PLAY_URL };
}

async function imgProxy(inReq, reply) {
    try {
        const u = decodeURIComponent(String(inReq.query.url || ''));
        if (!/^https?:\/\//i.test(u)) return reply.code(400).send('');
        const resp = await axios.get(u, {
            headers,
            timeout: 15000,
            responseType: 'arraybuffer',
            validateStatus: () => true,
        });
        if (resp.status >= 400) return reply.code(resp.status).send('');
        const img = decryptImg(Buffer.from(resp.data), u);
        reply.header('Content-Type', imageMime(img)).send(img);
    } catch {
        reply.code(500).send('');
    }
}

export default {
    meta: {
        key: 'huangdou',
        name: '🔥黄豆短剧',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/img', imgProxy);
    },
};
