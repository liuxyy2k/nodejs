import crypto from 'crypto';
import req from '../../util/req.js';

/**
 * theporny.com · POST 网关 + OpenSSL AES-256-CBC 解密
 * ext: "https://theporny.com|interval=1.2|img=direct|proxy=1"
 */

const HOST = 'https://theporny.com';
const APP = 'theporny.com';
const VER = '260901';
const PASS = 'xxx';
const UA =
    'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36';
const PORT = process.env.DEV_HTTP_PORT || 9988;

const GATES = [
    'https://v2.cdn199.com',
    'https://v2.kekecdn.net',
    'https://v2.luchu.org',
    'https://v2.madou.ws',
    'https://v2.papapa.biz',
    'https://v2.tianmtv.com',
];

const CATS = [
    ['hot', '热门'],
    ['recent', '最近更新'],
    ['high', '高清'],
    ['japan', '日本AV'],
    ['west', '欧美风尚'],
    ['torture', '重口味'],
    ['swag', '台湾SWAG'],
    ['banana', '汝工作室'],
    ['pissvids', '欧美VIP'],
    ['home_91_8', '91精选'],
    ['home_vip_8', '国产制片厂'],
    ['home_hot_8', '国产自拍'],
    ['home_japan_8', '日本精选'],
    ['home_west_8', '欧美精选'],
    ['home_torture_8', '重口精选'],
    ['home_high_8', '站长推荐'],
    ['home_swag_8', 'SWAG全辑'],
    ['home_banana_8', '汝工作室精选'],
    ['home_pissvids_8', '欧美VIP精选'],
];

const MINOR_WORDS = ['未成年', '幼女', '女童', '小学生', '初中生', '初一', '初二', '初三', '儿童色情', '萝莉幼', '萝莉妹'];
const AGE_RE = /(\d{1,2})\s*岁/;

let options = {};
let gateIdx = 0;
let lastReq = 0;
let interval = 1.0;
let imgRelay = false;
let useProxy = true;
const detailCache = new Map();

function parseExtend(extend) {
    if (!extend) return {};
    if (typeof extend === 'object' && !Array.isArray(extend)) return { ...extend };
    const s = String(extend).trim();
    if (!s) return {};
    if (s.startsWith('{')) {
        try {
            const v = JSON.parse(s);
            return typeof v === 'object' && v ? v : {};
        } catch {
            return {};
        }
    }
    const d = {};
    for (const part of s.split('|')) {
        const p = part.trim();
        if (!p) continue;
        if (p.startsWith('http') && !d.base) d.base = p;
        else if (p.includes('=')) {
            const [k, v] = p.split('=', 2);
            d[k.trim()] = v.trim();
        }
    }
    return d;
}

function applyConfig(extend) {
    options = parseExtend(extend);
    try {
        interval = Math.max(parseFloat(options.interval ?? 1.0) || 1.0, 0);
    } catch {
        interval = 1.0;
    }
    imgRelay = String(options.img || 'direct').toLowerCase() === 'relay';
    useProxy = !['0', 'false', 'no'].includes(String(options.proxy ?? '1').toLowerCase());
}

function normalizeBase(raw) {
    let b = String(raw || '').trim().replace(/\/$/, '');
    if (!b.startsWith('http')) b = `https://${b}`;
    return b;
}

function getGateList() {
    if (options.base) {
        const b = normalizeBase(options.base);
        return [b, ...GATES.filter((g) => g !== b)];
    }
    return [...GATES];
}

function apiHeaders() {
    return {
        'User-Agent': UA,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
        Origin: HOST,
        Referer: `${HOST}/`,
    };
}

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/theporny/3';
    const hostHeader = inReq?.headers?.['x-forwarded-host'] || inReq?.headers?.host;
    if (hostHeader) {
        const proto = inReq?.headers?.['x-forwarded-proto'] || 'http';
        return `${proto}://${hostHeader}${prefix}`;
    }
    return `http://127.0.0.1:${PORT}${prefix}`;
}

async function throttle() {
    if (interval <= 0) return;
    const now = Date.now() / 1000;
    const gap = now - lastReq;
    if (gap < interval) {
        await new Promise((r) => setTimeout(r, (interval - gap) * 1000));
    }
    lastReq = Date.now() / 1000;
}

function evpBytesToKey(password, salt, need = 48) {
    let d = Buffer.alloc(0);
    let prev = Buffer.alloc(0);
    const pw = Buffer.from(String(password), 'utf8');
    while (d.length < need) {
        prev = crypto.createHash('md5').update(Buffer.concat([prev, pw, salt])).digest();
        d = Buffer.concat([d, prev]);
    }
    return d.subarray(0, need);
}

function decryptResponse(raw) {
    let b;
    try {
        b = Buffer.from(String(raw || ''), 'base64');
    } catch {
        return null;
    }
    if (!b.subarray(0, 8).equals(Buffer.from('Salted__')) || b.length < 32) {
        try {
            return JSON.parse(b.toString('utf8'));
        } catch {
            return null;
        }
    }
    const salt = b.subarray(8, 16);
    const ct = b.subarray(16);
    const material = evpBytesToKey(PASS, salt, 48);
    try {
        const decipher = crypto.createDecipheriv('aes-256-cbc', material.subarray(0, 32), material.subarray(32, 48));
        const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
        return JSON.parse(pt.toString('utf8'));
    } catch {
        return null;
    }
}

async function apiPost(path, tries = 3) {
    const payload = {
        url: path,
        app: APP,
        version: VER,
        deviceInfo: {},
        uuid: 'novalue',
        theLink: 'novaluenull',
        isStandalone: false,
    };
    const gates = getGateList();
    for (let i = 0; i < tries; i++) {
        const base = gates[(gateIdx + i) % gates.length];
        try {
            await throttle();
            const resp = await req.post(`${base}/js`, payload, {
                headers: apiHeaders(),
                timeout: 25000,
                validateStatus: () => true,
            });
            if (resp.status !== 200) continue;
            let obj = resp.data;
            if (typeof obj === 'string') {
                try {
                    obj = JSON.parse(obj);
                } catch {
                    continue;
                }
            }
            if (obj && obj.r) {
                gateIdx = (gateIdx + i) % gates.length;
                return decryptResponse(obj.r);
            }
            if (obj && obj.blocked) continue;
            return obj;
        } catch {
            /* try next gate */
        }
    }
    return null;
}

async function httpGet(url, referer = '') {
    const hdr = { 'User-Agent': UA };
    if (referer) hdr.Referer = referer;
    try {
        await throttle();
        const resp = await req.get(url, {
            headers: hdr,
            timeout: 25000,
            responseType: 'arraybuffer',
            validateStatus: () => true,
        });
        if (resp.status === 200 && resp.data) return Buffer.from(resp.data);
    } catch {
        /* ignore */
    }
    return null;
}

function fixUrl(u) {
    if (!u) return '';
    let s = String(u).trim();
    if (s.startsWith('//')) return `https:${s}`;
    if (s.startsWith('http')) return s;
    return new URL(s, `${HOST}/`).href;
}

function relayUrl(kind, target, inReq) {
    const raw = Buffer.from(String(target), 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    return `${getProxyBase(inReq)}/${kind}?u=${encodeURIComponent(raw)}`;
}

function isMinor(title) {
    const t = String(title || '');
    if (!t) return false;
    let m;
    const ageRe = new RegExp(AGE_RE.source, 'g');
    while ((m = ageRe.exec(t)) !== null) {
        const age = parseInt(m[1], 10);
        if (Number.isFinite(age) && age < 18) return true;
    }
    return MINOR_WORDS.some((w) => t.includes(w));
}

function picUrl(vid, item, inReq) {
    const thumbs = item?.thumbnails || item?.thumbNails || [];
    let pic = thumbs.length ? fixUrl(thumbs[0]) : `https://tp.helloye.com/${vid}.jpg`;
    if (imgRelay && inReq) pic = relayUrl('img', pic, inReq);
    return pic;
}

function unwrap(data) {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
        for (const k of ['list', 'videos', 'data', 'sevenVideos', 'result']) {
            if (Array.isArray(data[k])) return data[k];
        }
    }
    return [];
}

function videoItem(v, inReq) {
    const vid = String(v?.id || v?.vId || '').trim();
    let name = String(v?.title || '').trim();
    if (!name) name = String(v?.title_en || vid).trim();
    if (!vid || !name) return null;
    if (isMinor(name) || isMinor(v?.title_en)) return null;
    return {
        vod_id: vid,
        vod_name: name,
        vod_pic: picUrl(vid, v, inReq),
        vod_remarks: String(v?.size || v?.durationStr || ''),
    };
}

async function fetchList(tid, pg, inReq) {
    const data = await apiPost(`/sevenVideos?page=${pg}&type=${encodeURIComponent(tid)}`);
    const raw = unwrap(data);
    const out = [];
    const seen = new Set();
    for (const v of raw) {
        if (!v || typeof v !== 'object') continue;
        const it = videoItem(v, inReq);
        if (!it || !it.vod_id || seen.has(it.vod_id)) continue;
        seen.add(it.vod_id);
        out.push(it);
    }
    return out;
}

async function fetchDetail(vid, ttl = 120) {
    const now = Date.now() / 1000;
    const cached = detailCache.get(vid);
    if (cached && now - cached[0] < ttl) return cached[1];

    const d = await apiPost(`/sevenVideos/${encodeURIComponent(vid)}`);
    if (d && typeof d === 'object' && (d.m3u8s || d.m3u8 || d.title)) {
        detailCache.set(vid, [now, d]);
        return d;
    }
    return d && typeof d === 'object' ? d : null;
}

function m3u8Lines(d) {
    const lines = d?.m3u8s || [];
    if (!lines.length && d?.m3u8) return [d.m3u8];
    return lines;
}

function cleanM3u8(text, base) {
    const out = [];
    for (const line of String(text || '').split(/\r?\n/)) {
        const s = line.trim();
        if (!s) {
            out.push(line);
            continue;
        }
        if (s.startsWith('#')) {
            if (s.includes('URI=')) {
                out.push(s.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${fixUrl(new URL(uri, base).href)}"`));
            } else {
                out.push(s);
            }
            continue;
        }
        out.push(fixUrl(new URL(s, base).href));
    }
    return out.join('\n');
}

function decodeRelayParam(val) {
    let s = String(val || '');
    try {
        s = decodeURIComponent(s);
    } catch {
        /* ignore */
    }
    const pad = (4 - (s.length % 4)) % 4;
    if (pad) s += '='.repeat(pad);
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(s, 'base64').toString('utf8');
}

function imageMime(buf) {
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
    if (buf.length >= 8 && buf.subarray(0, 8).toString('hex').startsWith('89504e47')) return 'image/png';
    if (buf.length >= 12 && buf.subarray(0, 4).toString() === 'RIFF') return 'image/webp';
    return 'image/jpeg';
}

async function init(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    return { ok: true };
}

async function home(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    const classes = CATS.map(([type_id, type_name]) => ({ type_id, type_name }));
    const list = [];
    const seen = new Set();
    for (const [tid] of CATS.slice(0, 4)) {
        for (const it of await fetchList(tid, 1, inReq)) {
            if (seen.has(it.vod_id)) continue;
            seen.add(it.vod_id);
            list.push(it);
        }
    }
    return { class: classes, filters: {}, list };
}

async function category(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    const tid = String(inReq.body.tid || inReq.body.id || CATS[0][0]).trim();
    const pg = Math.max(parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1, 1);
    const list = await fetchList(tid, pg, inReq);
    return {
        list,
        page: pg,
        pagecount: list.length ? pg + 1 : pg,
        limit: 24,
        total: list.length,
    };
}

async function detail(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    let vid = inReq.body.ids?.[0] ?? inReq.body.id ?? '';
    vid = String(vid).split('|')[0].split('$')[0].trim();
    if (!vid) return { list: [] };

    const d = await fetchDetail(vid, 120);
    if (!d) return { list: [] };

    const name = String(d.title || d.title_en || vid).trim();
    if (isMinor(name) || isMinor(d.title_en)) return { list: [] };

    const lines = m3u8Lines(d);
    const froms = [];
    const urls = [];
    if (lines.length > 1) {
        for (let i = 0; i < lines.length; i++) {
            froms.push(`线路${i + 1}`);
            urls.push(`正片$${vid}`);
        }
    } else {
        froms.push('theporny');
        urls.push(`正片$${vid}`);
    }

    const cont = [
        `片名: ${name}`,
        `主演/来源: ${d.user || ''}`,
        `时长: ${d.durationStr || ''}`,
        `大小: ${d.size || ''}`,
        `播放: ${d.views || ''}`,
        `时间: ${d.time || ''}`,
    ].join('\n');

    return {
        list: [
            {
                vod_id: vid,
                vod_name: name,
                vod_pic: picUrl(vid, d, inReq),
                vod_content: cont,
                vod_play_from: froms.join('$$$'),
                vod_play_url: urls.join('$$$'),
            },
        ],
    };
}

async function play(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    let vid = inReq.body.id ?? inReq.body.ids?.[0] ?? '';
    vid = String(vid).split('$').pop().split('|')[0].trim();

    const header = {
        'User-Agent': UA,
        Referer: `${HOST}/`,
        Origin: HOST,
    };

    const d = await fetchDetail(vid, 60);
    if (!d) return { parse: 0, jx: 0, playUrl: '', url: '', header };

    let url = '';
    for (const u of m3u8Lines(d)) {
        url = fixUrl(u);
        if (url) break;
    }
    if (!url) return { parse: 0, jx: 0, playUrl: '', url: '', header };

    if (useProxy) {
        return {
            parse: 0,
            jx: 0,
            playUrl: '',
            url: relayUrl('m3u8', url, inReq),
            header,
            format: 'application/x-mpegURL',
        };
    }
    return { parse: 0, jx: 0, playUrl: '', url, header, format: 'application/x-mpegURL' };
}

async function search(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    const pg = Math.max(parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1, 1);
    if (!key) return { list: [], page: pg, pagecount: pg };

    let data = await apiPost(`/sevenVideos/s?page=${pg}&q=${encodeURIComponent(key)}&sortBy=time`);
    let raw = unwrap(data);
    if (!raw.length) {
        data = await apiPost(`/searchSevenVideos?page=${pg}&keywords=${encodeURIComponent(key)}`);
        raw = unwrap(data);
    }

    const out = [];
    const seen = new Set();
    for (const v of raw) {
        if (!v || typeof v !== 'object') continue;
        const it = videoItem(v, inReq);
        if (!it || !it.vod_id || seen.has(it.vod_id)) continue;
        seen.add(it.vod_id);
        out.push(it);
    }
    return {
        list: out,
        page: pg,
        pagecount: out.length ? pg + 1 : pg,
        limit: 24,
        total: out.length,
    };
}

async function relayDispatch(target) {
    const q = target.includes('?') ? target.split('?', 2)[1] : '';
    let kind = 'm3u8';
    if (target.startsWith('/img')) kind = 'img';

    let val = '';
    for (const kv of q.split('&')) {
        if (kv.startsWith('u=')) {
            val = kv.slice(2);
            break;
        }
    }
    if (!val) return { body: Buffer.from('no url'), mime: 'text/plain', code: 400 };

    const real = decodeRelayParam(val);
    if (kind === 'img') {
        const data = await httpGet(real, `${HOST}/`);
        if (!data) return { body: Buffer.alloc(0), mime: 'image/jpeg', code: 404 };
        return { body: data, mime: imageMime(data), code: 200 };
    }

    const raw = await httpGet(real, `${HOST}/`);
    if (!raw) return { body: Buffer.alloc(0), mime: 'application/vnd.apple.mpegurl', code: 502 };
    const clean = cleanM3u8(raw.toString('utf8'), real);
    return { body: Buffer.from(clean, 'utf8'), mime: 'application/vnd.apple.mpegurl', code: 200 };
}

async function m3u8Proxy(inReq, reply) {
    try {
        const { body, mime, code } = await relayDispatch(`/m3u8?${new URL(inReq.url, 'http://x').search.slice(1)}`);
        return reply.code(code).header('Content-Type', mime).header('Access-Control-Allow-Origin', '*').send(body);
    } catch (e) {
        console.warn('[theporny] m3u8Proxy err', e.message);
        return reply.code(500).send('');
    }
}

async function imgProxy(inReq, reply) {
    try {
        const { body, mime, code } = await relayDispatch(`/img?${new URL(inReq.url, 'http://x').search.slice(1)}`);
        return reply.code(code).header('Content-Type', mime).header('Access-Control-Allow-Origin', '*').send(body);
    } catch (e) {
        console.warn('[theporny] imgProxy err', e.message);
        return reply.code(500).send('');
    }
}

export default {
    meta: {
        key: 'theporny',
        name: '🔥ThePorny',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/m3u8', m3u8Proxy);
        fastify.get('/img', imgProxy);
    },
};
