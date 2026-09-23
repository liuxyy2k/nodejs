import crypto from 'crypto';
import os from 'os';
import zlib from 'zlib';
import req from '../../util/req.js';

/**
 * 青桔短剧 · AES-256-CBC + gzip API
 * ext: {"site":"https://xqjzvcvt.top","token":"","device_id":"","platform_key":""}
 */

const DEFAULT_HOST = 'https://xqjzvcvt.top';
const PLATFORM_KEY = '7961beb44246e3012ce228d6b5ced05a';
const VERSION = '2.0.0';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const DEFAULT_TAB = {
    yuandou: ['246506', 'new:top', ''],
    mod: ['246502', 'new:top', ''],
    caibian: ['246505', 'new:top', ''],
    zhenren: ['817202', 'new:top', ''],
    erciyuan: ['817201', 'new:top', ''],
    aiman: ['6655003', 'new:top', ''],
    zongyi: ['1050905', 'new:top', ''],
    heiliao: ['900012', 'new:top', ''],
};

const FALLBACK_NAV = [
    ['yuandou', '黄豆原创'],
    ['mod', '魔改短剧'],
    ['caibian', '擦边短剧'],
    ['zhenren', '真人短剧'],
    ['erciyuan', '动漫'],
    ['aiman', '影院'],
    ['zongyi', '贤者'],
    ['heiliao', '黑料'],
];

const FALLBACK_TABS = {
    yuandou: [
        { name: '黄豆原创', filter: { cat_id: '246506', order: 'new:top' } },
        { name: 'UP原创', filter: { cat_id: '246506', source: 'up' } },
    ],
    mod: [
        { name: '大神精选', filter: { cat_id: '246502', order: 'new:top' } },
        { name: '单体作品', filter: { cat_id: '246503', order: 'new:top' } },
        { name: '影视魔改', filter: { cat_id: '900011', order: 'new:top' } },
        { name: '国漫AI', filter: { cat_id: '5822103', order: 'new:top' } },
        { name: '魔改短剧', filter: { cat_id: '2345505' } },
    ],
    caibian: [
        { name: '最新', filter: { cat_id: '246505', order: 'new:top' } },
        { name: '推荐', filter: { cat_id: '246505', order: 'hot:top' } },
        { name: '全部', filter: { cat_id: '246505' } },
    ],
    zhenren: [
        { name: '都市', filter: { cat_id: '817202', order: 'new:top' } },
        { name: '古装', filter: { cat_id: '900006', order: 'new:top' } },
        { name: '民国', filter: { cat_id: '1050901', order: 'new:top' } },
        { name: '重生', filter: { cat_id: '900007', order: 'new:top' } },
        { name: '异能', filter: { cat_id: '900008', order: 'new:top' } },
    ],
    erciyuan: [
        { name: '里番', filter: { cat_id: '817201', order: 'new:top' } },
        { name: '国漫', filter: { cat_id: '4324502', order: 'hot:top' } },
        { name: '日漫', filter: { cat_id: '1050906', order: 'new:top' } },
        { name: '动画同人', filter: { cat_id: '481301', order: 'new:top' } },
        { name: '游戏同人', filter: { cat_id: '900002', order: 'new:top' } },
    ],
    aiman: [
        { name: '美剧', filter: { cat_id: '6655003', order: 'new:top' } },
        { name: '韩剧', filter: { cat_id: '6655009', order: 'new:top' } },
        { name: '漫剧', filter: { cat_id: '1050902', order: 'new:top' } },
    ],
    zongyi: [
        { name: '最新', filter: { cat_id: '1050905', order: 'new:top' } },
        { name: '推荐', filter: { cat_id: '1050905', order: 'hot:top' } },
    ],
    heiliao: [
        { name: '最新', filter: { cat_id: '900012', order: 'new:top' } },
        { name: '推荐', filter: { cat_id: '900012', order: 'hot:top' } },
    ],
};

const COMMON_FILTERS = [
    {
        key: 'order',
        name: '排序',
        value: [
            { n: '默认', v: 'new:top' },
            { n: '最新', v: 'new:top' },
            { n: '最热', v: 'hot:top' },
        ],
    },
    {
        key: 'update_status',
        name: '状态',
        value: [
            { n: '全部', v: '' },
            { n: '连载', v: '0' },
            { n: '完结', v: '1' },
        ],
    },
];

let host = DEFAULT_HOST;
let apiBase = `${DEFAULT_HOST}/api`;
let platformKey = PLATFORM_KEY;
let token = '';
let deviceId = '';
let sessionId = crypto.randomUUID().replace(/-/g, '');
let classCache = null;
const filterCache = {};

function applyConfig(extend) {
    let cfg = extend;
    if (!cfg) return;
    if (typeof cfg === 'string') {
        const raw = cfg.trim();
        if (raw.startsWith('http')) {
            host = raw.replace(/\/$/, '');
            apiBase = `${host}/api`;
            return;
        }
        if (raw.startsWith('{')) {
            try {
                cfg = JSON.parse(raw);
            } catch {
                return;
            }
        } else {
            return;
        }
    }
    if (typeof cfg !== 'object' || cfg === null) return;
    const h = cfg.site || cfg.base_url || cfg.host || '';
    if (h) {
        host = String(h).replace(/\/$/, '');
        apiBase = `${host}/api`;
    }
    if (cfg.token) token = String(cfg.token);
    if (cfg.device_id) deviceId = String(cfg.device_id);
    if (cfg.platform_key) platformKey = String(cfg.platform_key);
}

function stableDeviceId() {
    if (deviceId) return deviceId;
    let mac = 'fallback';
    try {
        for (const ifaces of Object.values(os.networkInterfaces())) {
            for (const ni of ifaces || []) {
                if (!ni.internal && ni.mac && ni.mac !== '00:00:00:00:00:00') {
                    mac = ni.mac;
                    break;
                }
            }
        }
    } catch {
        /* ignore */
    }
    deviceId = crypto.createHash('md5').update(`qingju|${mac}|android`).digest('hex');
    return deviceId;
}

function deriveKey(requestId) {
    return crypto
        .createHmac('sha256', Buffer.from(platformKey, 'utf8'))
        .update(Buffer.from(String(requestId).replace(/-/g, ''), 'hex'))
        .digest();
}

function encryptBody(payloadObj, requestId) {
    const raw = Buffer.from(JSON.stringify(payloadObj), 'utf8');
    const gz = zlib.gzipSync(raw);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', deriveKey(requestId), iv);
    const encrypted = Buffer.concat([cipher.update(gz), cipher.final()]);
    return Buffer.concat([iv, encrypted]);
}

function decryptBody(blob, requestId) {
    if (blob.length >= 32 && (blob.length - 16) % 16 === 0) {
        try {
            const iv = blob.subarray(0, 16);
            const body = blob.subarray(16);
            const decipher = crypto.createDecipheriv('aes-256-cbc', deriveKey(requestId), iv);
            let plain = Buffer.concat([decipher.update(body), decipher.final()]);
            if (plain[0] === 0x1f && plain[1] === 0x8b) plain = zlib.gunzipSync(plain);
            return JSON.parse(plain.toString('utf8'));
        } catch {
            /* fallback */
        }
    }
    try {
        let plain = blob;
        if (plain[0] === 0x1f && plain[1] === 0x8b) plain = zlib.gunzipSync(plain);
        return JSON.parse(plain.toString('utf8'));
    } catch {
        return {};
    }
}

async function apiCall(path, data = {}, timeout = 20000) {
    const apiPath = `/${String(path).replace(/^\/+/, '')}`;
    const requestId = crypto.randomUUID();
    const payload = {
        token: token || '',
        deviceId: stableDeviceId(),
        data: data || {},
    };
    const body = encryptBody(payload, requestId);
    const ts = Math.floor(Date.now() / 1000);
    const signRaw = `Dart|${sessionId}|${requestId}|${ts}|${apiPath}`;
    const sign = `${crypto.createHash('sha256').update(signRaw, 'utf8').digest('hex')}-${ts}`;
    const headers = {
        'User-Agent': UA,
        Accept: '*/*',
        Origin: host,
        Referer: `${host}/home`,
        'Content-Type': 'application/octet-stream',
        version: VERSION,
        deviceType: 'web',
        time: String(ts),
        sign,
        requestId,
        sessionId,
        deviceBrand: '',
        deviceModel: '',
        systemName: '',
        systemVersion: '',
    };

    try {
        const resp = await req.post(`${apiBase}${apiPath}`, body, {
            headers,
            timeout,
            responseType: 'arraybuffer',
            validateStatus: () => true,
        });
        if (resp.status !== 200 || !resp.data) return {};
        return decryptBody(Buffer.from(resp.data), requestId);
    } catch {
        return {};
    }
}

function isOk(obj) {
    if (!obj || typeof obj !== 'object') return false;
    const s = String(obj.status || '').toLowerCase();
    return s === 'y' || s === '1' || s === 'true';
}

function extractList(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    for (const k of ['list', 'items', 'data', 'records', 'rows']) {
        const v = data[k];
        if (Array.isArray(v)) return v;
        if (v && typeof v === 'object') {
            const got = extractList(v);
            if (got.length) return got;
        }
    }
    return [];
}

function sid(x) {
    return String(x || '').replace(/^rp_/, '');
}

function toInt(x, d = 0) {
    try {
        return parseInt(String(x).split('.')[0], 10);
    } catch {
        return d;
    }
}

function pic(item) {
    if (!item || typeof item !== 'object') return '';
    return item.img_y || item.img_x || item.img || item.cover || item.pic || '';
}

function vod(item) {
    if (!item || typeof item !== 'object') return null;
    const vid = sid(item.id || item.drama_id || '');
    if (!vid) return null;
    const cnt = item.episode_count;
    let remarks = item.update_label || item.corner || '';
    if (!remarks && cnt) remarks = `全${cnt}集`;
    return {
        vod_id: vid,
        vod_name: item.name || item.title || item.t || vid,
        vod_pic: pic(item),
        vod_remarks: String(remarks || ''),
    };
}

async function getClasses() {
    if (classCache) return classCache;
    const arr = [{ type_id: 'all', type_name: '全部短剧' }];
    let rows = [];
    try {
        const obj = await apiCall('/drama/navList', {});
        rows = extractList(obj);
        if (!rows.length && obj?.data) rows = extractList(obj.data);
    } catch {
        rows = [];
    }
    for (const item of rows) {
        if (!item || typeof item !== 'object') continue;
        const tid = String(item.code || item.id || item.cat_id || '');
        const name = item.name || item.title || tid;
        if (tid && name) arr.push({ type_id: tid, type_name: name });
    }
    if (arr.length <= 1) {
        for (const [code, nm] of FALLBACK_NAV) arr.push({ type_id: code, type_name: nm });
    }
    classCache = arr;
    return arr;
}

async function navFilter(code) {
    const key = String(code);
    if (filterCache[key]) return filterCache[key];
    let rows = [];
    try {
        const obj = await apiCall('/drama/navFilter', { code: key });
        rows = extractList(obj).filter((x) => x && typeof x === 'object');
        if (!rows.length && obj?.data) rows = extractList(obj.data).filter((x) => x && typeof x === 'object');
    } catch {
        rows = [];
    }
    if (!rows.length) rows = (FALLBACK_TABS[key] || []).map((x) => ({ ...x }));
    filterCache[key] = rows;
    return rows;
}

function buildFilters(classes) {
    const fs = {};
    for (const c of classes) {
        if (!c || typeof c !== 'object') continue;
        const tid = c.type_id;
        if (tid === 'all') {
            fs[tid] = COMMON_FILTERS;
            continue;
        }
        const tabs = filterCache[tid] || FALLBACK_TABS[tid] || [];
        const vals = [{ n: '全部', v: 'all' }];
        tabs.forEach((t, i) => {
            if (t && typeof t === 'object') vals.push({ n: t.name || `分类${i}`, v: String(i) });
        });
        const subFilter = vals.length > 1 ? [{ key: 'sub', name: '子分类', value: vals }] : [];
        fs[tid] = subFilter.concat(COMMON_FILTERS);
    }
    return fs;
}

async function resolveTab(tid, extend) {
    const base = DEFAULT_TAB[tid];
    if (!base) {
        if (/^\d+$/.test(String(tid))) return [String(tid), '', ''];
        return ['', '', ''];
    }
    const sub = String(extend?.sub || '');
    if (sub && sub !== 'all' && sub !== '全部') {
        const idx = parseInt(sub, 10);
        const tabs = filterCache[tid] || (await navFilter(tid));
        if (Number.isFinite(idx) && idx >= 0 && idx < tabs.length) {
            const flt = tabs[idx]?.filter || {};
            return [
                String(flt.cat_id || base[0]),
                String(flt.order || ''),
                String(flt.source || ''),
            ];
        }
    }
    return [...base];
}

async function catePage(catId, order, source, page, extend) {
    const reqData = { page: String(page), page_size: '18' };
    if (catId) reqData.cat_id = String(catId);
    if (order) reqData.order = order;
    if (source) reqData.source = source;
    if (extend?.order) reqData.order = extend.order;
    if (extend?.update_status !== undefined && extend?.update_status !== '') {
        reqData.update_status = extend.update_status;
    }
    return apiCall('/drama/list', reqData);
}

function pickLine(lines) {
    if (!Array.isArray(lines)) return '';
    for (const ln of lines) {
        if (ln && typeof ln === 'object' && String(ln.name || '').toLowerCase() === 'free' && ln.url) {
            return ln.url;
        }
    }
    for (const ln of lines) {
        if (ln && typeof ln === 'object' && ln.url) return ln.url;
    }
    if (lines.length && typeof lines[0] === 'string') return lines[0];
    return '';
}

function hlsUrl(vid, seq) {
    return `${host}/api/drama/hls/${sid(vid)}/${seq}/play.m3u8?line=free`;
}

function splitPlayId(x) {
    const parts = String(x).split('|', 2);
    return [sid(parts[0]), parts[1] && parts[1] ? parts[1] : '1'];
}

function parseExtend(raw) {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    return {};
}

async function init(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    classCache = null;
    Object.keys(filterCache).forEach((k) => delete filterCache[k]);
    return { ok: true };
}

async function home(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    const classes = await getClasses();
    for (const c of classes) {
        if (c.type_id && c.type_id !== 'all' && !filterCache[c.type_id]) {
            await navFilter(c.type_id);
        }
    }
    const filters = buildFilters(classes);
    const data = await apiCall('/drama/list', { page: '1', page_size: '18' });
    const list = extractList(data).map(vod).filter(Boolean);
    return { class: classes, filters, list, parse: 0, jx: 0 };
}

async function category(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    const tid = String(inReq.body.tid || inReq.body.id || '');
    const page = Math.max(parseInt(inReq.body.page, 10) || 1, 1);
    const extend = parseExtend(inReq.body.filters || inReq.body.filter || inReq.body.extend || {});

    let items = [];
    if (!tid || tid === 'all' || tid === 'recommend') {
        const data = await apiCall('/drama/list', { page: String(page), page_size: '18' });
        items = extractList(data);
    } else {
        const [catId, order, source] = await resolveTab(tid, extend);
        let data = await catePage(catId, order, source, page, extend);
        items = extractList(data);
        if (!items.length) {
            const fallback = DEFAULT_TAB[tid];
            if (fallback && (fallback[0] !== catId || fallback[1] !== order || fallback[2] !== source)) {
                data = await catePage(fallback[0], fallback[1], fallback[2], page, extend);
                items = extractList(data);
            }
        }
    }

    const list = items.map(vod).filter(Boolean);
    return {
        page,
        pagecount: list.length >= 18 ? page + 1 : page,
        limit: 18,
        total: 99999,
        list,
        parse: 0,
        jx: 0,
    };
}

async function search(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    const page = Math.max(parseInt(inReq.body.page, 10) || 1, 1);
    const keywords = String(inReq.body.wd || inReq.body.key || '').trim();
    const data = await apiCall('/drama/list', {
        page: String(page),
        page_size: '18',
        keywords,
    });
    const list = extractList(data).map(vod).filter(Boolean);
    return {
        page,
        pagecount: list.length >= 18 ? page + 1 : page,
        limit: 18,
        total: 99999,
        list,
        parse: 0,
        jx: 0,
    };
}

async function detail(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    let vid = Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id;
    vid = sid(String(vid || '').replace(/^rp_/, ''));

    const obj = await apiCall('/drama/detail', { id: vid });
    if (!isOk(obj)) return { list: [] };

    const data = obj.data && typeof obj.data === 'object' ? obj.data : obj;
    if (!data || typeof data !== 'object' || !Object.keys(data).length) return { list: [] };

    const vodId = sid(data.id || data.drama_id || vid);
    const name = data.name || data.title || data.t || vodId;
    const eps = Array.isArray(data.episodes) ? data.episodes : [];
    const count = toInt(data.episode_count || data.free_episodes, eps.length || 1);

    const play = [];
    if (eps.length) {
        eps.forEach((ep, i) => {
            if (!ep || typeof ep !== 'object') return;
            const seq = ep.seq || ep.episode || ep.ep || i + 1;
            const title = ep.name || ep.title || `第${seq}集`;
            play.push(`${title}$${vodId}|${seq}`);
        });
    }
    if (!play.length) {
        for (let i = 1; i <= Math.max(count, 1); i++) {
            play.push(`第${i}集$${vodId}|${i}`);
        }
    }

    return {
        list: [
            {
                vod_id: vodId,
                vod_name: name,
                vod_pic: pic(data),
                type_name: data.category || data.type || '',
                vod_year: '',
                vod_area: '',
                vod_remarks: data.update_label || `全${count}集`,
                vod_actor: '',
                vod_director: '',
                vod_content: data.description || data.summary || name,
                vod_play_from: '青桔短剧',
                vod_play_url: play.join('#'),
            },
        ],
        parse: 0,
        jx: 0,
    };
}

async function play(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    let raw = String(inReq.body.id || inReq.body.url || '').trim();
    if (raw.includes('$')) raw = raw.split('$').pop().trim();
    const [vid, seq] = splitPlayId(raw);

    let url = '';
    const obj = await apiCall('/drama/play', { id: vid, seq: String(seq) }, 15000);
    if (isOk(obj)) {
        const d = obj.data || {};
        if (typeof d === 'object') {
            url = pickLine(d.lines) || d.m3u8 || d.url || '';
        }
    }
    if (!url) url = hlsUrl(vid, seq);

    return {
        parse: 0,
        playUrl: '',
        url,
        jx: 0,
        header: {
            'User-Agent': UA,
            Referer: `${host}/home`,
            Origin: host,
        },
    };
}

export default {
    meta: {
        key: 'qingju',
        name: '🔥青桔短剧',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
