import crypto from 'crypto';
import req from '../../util/req.js';
import { apiOriginFromReq } from '../../util/m3u8Gateway.js';

const GATEWAY_POOL = [
    'https://pl5kjl.jas49cht5sqrwet.xyz/fast-endecode/main/request',
    'https://pl5kjl.m93abv5upsv4s8f.xyz/fast-endecode/main/request',
    'https://api.y7hvaad8g.xyz/fast-endecode/main/request',
];

const KEYS = {
    0: 'G7i3OPcfNhBnAYpc',
    1: '84UZNK33cSVylz6Y',
    2: 'jeSWRcTwHyAKwJDB',
    3: 'i1hvJx9vuRt5zEBS',
    4: '1Yy1KOa75R7cnmkg',
    6: 'T0RVp7KIPamrtQ33',
    8: 'ugvseZc5Kkj8ecmV',
    9: 'G7i3OPcfNhBnAYpc',
};
const REM = 2;
const ADS_CODE = 'DFH';
const PIC_BASE = 'https://qv1tx2.shoupingxz.com';
const UA = 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const PLAY_LINES = [
    ['国线1', 'https://rr.rxjhwl.com'],
    ['国线2', 'https://ww.wealwelloa.com'],
    ['国线3', 'https://cc.cloudworki.com'],
    ['国线4', 'https://gg.gmdalian.com'],
    ['海线1', 'https://allmusiclub.almusiclub.com'],
];

const THEMES = [
    ['27', '国产精选'], ['9', '主播剧情'], ['26', '业余素人'],
    ['47', '第一视角'], ['7', '欧美精选'], ['35', '日韩精选'],
    ['41', '粉嫩处女'], ['66', '偷窥偷拍监控'], ['50', '网爆偷拍泄密'],
    ['39', 'AV精选'], ['40', '职业探花'], ['55', '网红裸舞'],
    ['59', '抖音风合集'], ['36', '动漫精选'], ['67', '街拍街射'],
    ['42', '明星AI换脸'], ['15', '经典老片'], ['16', '成人综艺'],
    ['24', '恐怖科幻伦理'], ['19', '官方推荐'],
];

const SORT_FILTER = {
    key: 'sort',
    name: '排序',
    value: [
        { n: '最新', v: '1' },
        { n: '最热', v: '2' },
    ],
};

let jwtToken = '';
let jwtTs = 0;
let accessToken = '';
let accessTs = 0;

function rnd(n) {
    const cs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < n; i++) s += cs[Math.floor(Math.random() * cs.length)];
    return s;
}

function mkTime() {
    const t = Date.now();
    return t - (t % 10) + REM;
}

function aesEnc(obj, key) {
    const raw = JSON.stringify(obj);
    const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(key, 'utf8'), null);
    cipher.setAutoPadding(true);
    return Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]).toString('base64');
}

function aesDec(b64, key) {
    const decipher = crypto.createDecipheriv('aes-128-ecb', Buffer.from(key, 'utf8'), null);
    decipher.setAutoPadding(true);
    return Buffer.concat([decipher.update(Buffer.from(b64, 'base64')), decipher.final()]).toString('utf8');
}

function parseJson(text) {
    try {
        return JSON.parse(text);
    } catch {
        return {};
    }
}

function parseFilters(raw) {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    try {
        return JSON.parse(String(raw));
    } catch {
        return {};
    }
}

async function callApi(uri, method, { params, body, useJwt = true, useAccess = false, retry = true } = {}) {
    const key = KEYS[REM];
    const t = mkTime();
    const plain = { method, uri };
    if (body !== undefined) plain.body = body;
    else plain.params = params ?? {};
    const payload = { data: aesEnc(plain, key), time: t };
    const headers = {
        'Content-Type': 'application/json',
        'User-Agent': UA,
        Origin: 'https://xx9.com',
        Referer: 'https://xx9.com/',
    };
    if (useJwt) {
        const jwt = await getJwt();
        if (jwt) headers.jwtToken = jwt;
    }
    if (useAccess) {
        const acc = await getAccess();
        if (acc) headers.accessToken = acc;
    }

    let text = '';
    for (const gw of GATEWAY_POOL) {
        try {
            const resp = await req.post(gw, payload, {
                headers,
                timeout: 30000,
                validateStatus: () => true,
            });
            text = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data || '');
            if (text) break;
        } catch {
            /* try next gateway */
        }
    }
    if (!text) return {};
    let j = parseJson(text);
    if (j && typeof j.data === 'string' && j.data && 'time' in j) {
        try {
            j = JSON.parse(aesDec(j.data, key));
        } catch {
            return j;
        }
    }
    if (useAccess && retry && j && typeof j === 'object') {
        const code = String(j.code || '');
        if (code === '1032' || code === '1019') {
            accessToken = '';
            accessTs = 0;
            return callApi(uri, method, { params, body, useJwt, useAccess, retry: false });
        }
    }
    return j;
}

async function getJwt() {
    const now = Date.now() / 1000;
    if (jwtToken && now - jwtTs < 3600) return jwtToken;
    try {
        const r = await callApi('app/jwt-token', 1, { params: { adsCode: ADS_CODE }, useJwt: false });
        const jwt = r?.result;
        if (jwt) {
            jwtToken = jwt;
            jwtTs = now;
        }
    } catch {
        /* ignore */
    }
    return jwtToken;
}

async function getAccess() {
    const now = Date.now() / 1000;
    if (accessToken && now - accessTs < 1800) return accessToken;
    try {
        const r = await callApi('user/register/free', 2, {
            body: {
                osType: 'h5',
                sign: rnd(32),
                machineCode: 'chrome',
                version: 'xx9.com',
            },
            useJwt: true,
            useAccess: false,
        });
        const acc = r?.result?.accessToken;
        if (acc) {
            accessToken = acc;
            accessTs = now;
        }
    } catch {
        /* ignore */
    }
    return accessToken;
}

function pic(p) {
    if (!p) return '';
    const s = String(p).trim();
    if (!s) return '';
    if (s.startsWith('http://') || s.startsWith('https://')) return s;
    if (s.startsWith('//')) return `https:${s}`;
    return PIC_BASE + (s.startsWith('/') ? s : `/${s}`);
}

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/xx9/3';
    const origin = `http://127.0.0.1:${process.env.DEV_HTTP_PORT || 9988}`;
    return `${origin}${prefix}`;
}

function wrapPic(raw, inReq) {
    const url = pic(raw);
    if (!url) return '';
    if (url.includes('/img?url=') || url.includes('@Referer=')) return url;
    if (inReq) {
        const b64 = Buffer.from(url, 'utf8').toString('base64');
        return `${getProxyBase(inReq)}/img?url=${encodeURIComponent(b64)}`;
    }
    return url;
}

function imgMime(buf) {
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
    if (buf.length >= 4 && buf.subarray(0, 4).toString() === 'GIF8') return 'image/gif';
    if (buf.length >= 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') {
        return 'image/webp';
    }
    return '';
}

function decodeImg(buf) {
    const data = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || []);
    if (data.length < 2) return data;
    if (imgMime(data)) return data;
    const key = data[0];
    const out = Buffer.allocUnsafe(data.length - 1);
    for (let i = 1; i < data.length; i++) out[i - 1] = data[i] ^ key;
    return imgMime(out) ? out : data;
}

async function imgProxy(inReq, reply) {
    try {
        let raw = String(inReq.query.url || '');
        if (!raw) return reply.code(404).send('');
        try {
            raw = Buffer.from(raw, 'base64').toString('utf8');
        } catch {
            /* keep raw */
        }
        const match = raw.match(/loadBannerDirect\('([^']*)'/);
        if (match) raw = match[1];
        if (!raw) return reply.code(404).send('');
        if (!/^https?:\/\//i.test(raw)) {
            raw = pic(raw);
        }
        if (!/^https?:\/\//i.test(raw)) return reply.code(404).send('');

        const resp = await req.get(raw, {
            headers: {
                'User-Agent': UA,
                Referer: '',
            },
            timeout: 30000,
            responseType: 'arraybuffer',
            validateStatus: () => true,
        });
        if (resp.status !== 200 || !resp.data?.byteLength) return reply.code(404).send('');

        const decrypted = decodeImg(Buffer.from(resp.data));
        const ct = imgMime(decrypted) || 'image/jpeg';
        return reply
            .header('Content-Type', ct)
            .header('Access-Control-Allow-Origin', '*')
            .header('Cache-Control', 'public, max-age=86400')
            .send(decrypted);
    } catch (e) {
        console.error('[xx9] imgProxy error:', e.message);
        return reply.code(500).send('');
    }
}

function vodListItem(it, inReq) {
    const vid = it.id ?? it.vodId;
    const dur = Number(it.vodDuration);
    let remark = '';
    if (Number.isFinite(dur) && dur > 0) {
        const m = Math.floor(dur / 60);
        const s = Math.floor(dur % 60);
        remark = `${m}:${String(s).padStart(2, '0')}`;
    }
    if (!remark && Array.isArray(it.tags) && it.tags.length) {
        remark = it.tags.slice(0, 3).join(' ');
    }
    return {
        vod_id: String(vid),
        vod_name: it.title || '',
        vod_pic: wrapPic(it.vodPic || it.gif || it.cover || it.pic || '', inReq),
        vod_remarks: remark,
    };
}

async function searchApi(params) {
    const r = await callApi('cms/vod/search', 2, { params });
    const data = r?.data;
    let items = [];
    if (Array.isArray(data)) items = data;
    else if (data && typeof data === 'object') items = data.list || data.records || [];
    return { items, total: r?.total || 0 };
}

async function init() {
    jwtToken = '';
    jwtTs = 0;
    accessToken = '';
    accessTs = 0;
    return {};
}

async function home(inReq) {
    const classes = THEMES.map(([tid, name]) => ({ type_id: tid, type_name: name }));
    const filters = {};
    for (const [tid] of THEMES) filters[tid] = [SORT_FILTER];
    let list = [];
    try {
        list = (await homeVideo(inReq)).list || [];
    } catch {
        list = [];
    }
    return { class: classes, filters, list };
}

async function homeVideo(inReq) {
    const { items } = await searchApi({
        themeIds: THEMES[0][0],
        page: 1,
        pageSize: 30,
        explore: false,
        sortType: 1,
    });
    return { list: items.map((it) => vodListItem(it, inReq)) };
}

async function category(inReq) {
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const ext = parseFilters(inReq.body.filters || inReq.body.filter || inReq.body.extend);
    let sortType = parseInt(ext.sort || 1, 10);
    if (!sortType) sortType = 1;
    const pageSize = 30;
    const { items, total } = await searchApi({
        themeIds: String(inReq.body.id || ''),
        page,
        pageSize,
        explore: false,
        sortType,
    });
    const vod = items.map((it) => vodListItem(it, inReq));
    const pagecount = total ? Math.ceil(Number(total) / pageSize) : 9999;
    return {
        list: vod,
        page,
        pagecount,
        limit: pageSize,
        total: total ? Number(total) : vod.length,
    };
}

async function detail(inReq) {
    const vid = String(inReq.body.id || '');
    if (!vid) return { list: [] };
    const r = await callApi(`cms/vod/detail/${vid}`, 1, {
        params: { needCdnAuth: true },
        useAccess: true,
    });
    const res = r?.result;
    const vod = res && typeof res === 'object' ? (res.vod || res) : {};
    if (!vod || typeof vod !== 'object' || (!vod.title && !vod.id)) return { list: [] };

    const tags = Array.isArray(vod.tags) ? vod.tags.join(',') : '';
    const dur = vod.vodDuration;
    let remark = '';
    if (Number.isInteger(dur) && dur > 0) {
        const m = Math.floor(dur / 60);
        const s = dur % 60;
        remark = `时长 ${m}:${String(s).padStart(2, '0')}`;
    }
    const full = vod.vodFullPlayUrl;
    const nParts = Array.isArray(full) && full.length ? full.length : 1;
    const froms = [];
    const urls = [];
    for (const [name] of PLAY_LINES) {
        const eps = [];
        if (nParts <= 1) eps.push(`正片$${vid}|0`);
        else {
            for (let i = 0; i < nParts; i++) eps.push(`P${i + 1}$${vid}|${i}`);
        }
        froms.push(name);
        urls.push(eps.join('#'));
    }
    return {
        list: [{
            vod_id: String(vid),
            vod_name: vod.title || '',
            vod_pic: wrapPic(vod.vodPic || vod.gif || vod.cover || '', inReq),
            vod_remarks: remark,
            vod_content: vod.vodIntro || tags,
            vod_tag: tags,
            vod_play_from: froms.join('$$$'),
            vod_play_url: urls.join('$$$'),
        }],
    };
}

async function play(inReq) {
    const raw = String(inReq.body.id || '');
    const flag = String(inReq.body.flag || '');
    let vid = raw;
    let idx = 0;
    if (raw.includes('|')) {
        const [a, b] = raw.split('|');
        vid = a;
        idx = parseInt(b, 10) || 0;
    }
    const line = PLAY_LINES.find(([name]) => name === flag);
    const domain = line ? line[1] : PLAY_LINES[0][1];
    let playUrl = '';
    try {
        const r = await callApi(`cms/vod/detail/${vid}`, 1, {
            params: { needCdnAuth: true },
            useAccess: true,
        });
        const res = r?.result;
        const vod = res && typeof res === 'object' ? (res.vod || res) : {};
        const full = vod.vodFullPlayUrl;
        let addr = '';
        if (Array.isArray(full) && full.length) {
            if (idx >= full.length) idx = 0;
            addr = full[idx]?.addr || '';
        }
        if (!addr) addr = vod.preview || '';
        if (addr) playUrl = domain + addr;
    } catch {
        playUrl = '';
    }
    return {
        parse: 0,
        url: playUrl,
        header: {
            'User-Agent': UA,
            Referer: 'https://xx9.com/',
        },
    };
}

async function search(inReq) {
    const wd = String(inReq.body.wd || '').trim();
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    if (!wd) return { list: [] };
    const { items } = await searchApi({
        title: wd,
        page,
        pageSize: 30,
        explore: false,
        sortType: 1,
    });
    return { list: items.map((it) => vodListItem(it, inReq)) };
}

export default {
    meta: { key: 'xx9', name: '💋XX9', type: 3 },
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
