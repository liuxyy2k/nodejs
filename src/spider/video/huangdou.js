import axios from 'axios';
import crypto from 'crypto';
import zlib from 'zlib';

const PORT = process.env.DEV_HTTP_PORT || 9988;
const PREFIX = '/spider/huangdou/3';
const DEFAULT_HOST = 'https://xqjzvcvt.top';
const PLATFORM_KEY = '7961beb44246e3012ce228d6b5ced05a';
const VERSION = '2.0.0';
const DEVICE_TYPE = 'web';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const NAME = '黄豆短剧';

let host = DEFAULT_HOST;
let api = `${DEFAULT_HOST}/api`;
let token = '';
let sessionId = crypto.randomUUID();
let deviceId = sessionId;
let classCache = null;
const filterCache = {};

let headers = {
    'User-Agent': UA,
    Accept: '*/*',
    Origin: DEFAULT_HOST,
    Referer: `${DEFAULT_HOST}/home`,
    'Content-Type': 'application/octet-stream',
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

function intVal(x, d = 0) {
    const n = parseInt(x, 10);
    return Number.isFinite(n) ? n : d;
}

function sid(x) {
    return String(x || '').replace(/^rp_/, '');
}

function splitPlayId(x) {
    const p = String(x || '').split('|', 2);
    return [sid(p[0]), p[1] || '1'];
}

function deriveKey(rid) {
    const hex = String(rid).replace(/-/g, '');
    return crypto.createHmac('sha256', PLATFORM_KEY).update(Buffer.from(hex, 'hex')).digest();
}

function aesEncrypt(data, key, iv) {
    const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
    return Buffer.concat([cipher.update(data), cipher.final()]);
}

function aesDecrypt(data, key, iv) {
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    return Buffer.concat([decipher.update(data), decipher.final()]);
}

function decodeBlob(blob, rid) {
    if (!blob || blob.length < 32 || (blob.length - 16) % 16 !== 0) {
        try {
            return JSON.parse(blob.toString('utf8'));
        } catch {
            return {};
        }
    }
    let plain = aesDecrypt(blob.subarray(16), deriveKey(rid), blob.subarray(0, 16));
    if (plain[0] === 0x1f && plain[1] === 0x8b) plain = zlib.gunzipSync(plain);
    return JSON.parse(plain.toString('utf8'));
}

function makeSign(path, rid, ts) {
    const raw = `Dart|${sessionId}|${rid}|${ts}|${path}`;
    return `${crypto.createHash('sha256').update(raw, 'utf8').digest('hex')}-${ts}`;
}

async function apiCall(path, data = {}) {
    path = `/${String(path).replace(/^\/+/, '')}`;
    const rid = crypto.randomUUID();
    const key = deriveKey(rid);
    const iv = crypto.randomBytes(16);
    const raw = Buffer.from(
        JSON.stringify({ token: token || '', deviceId, data: data || {} }),
        'utf8',
    );
    const body = Buffer.concat([iv, aesEncrypt(zlib.gzipSync(raw), key, iv)]);
    const ts = Math.floor(Date.now() / 1000);
    const h = {
        ...headers,
        version: VERSION,
        deviceType: DEVICE_TYPE,
        time: String(ts),
        sign: makeSign(path, rid, ts),
        requestId: rid,
        sessionId,
        deviceBrand: '',
        deviceModel: '',
        systemName: '',
        systemVersion: '',
    };
    try {
        const resp = await axios.post(`${api}${path}`, body, {
            headers: h,
            timeout: 20000,
            responseType: 'arraybuffer',
            validateStatus: () => true,
        });
        if (resp.status >= 400) return {};
        return decodeBlob(Buffer.from(resp.data), rid);
    } catch {
        return {};
    }
}

function listData(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    if (Array.isArray(data.list)) return data.list;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.data)) return data.data;
    if (data.data && typeof data.data === 'object') return listData(data.data);
    return [];
}

function pic(item) {
    return item?.img_y || item?.img_x || item?.img || item?.cover || item?.pic || '';
}

function vod(item) {
    item = item || {};
    const vid = sid(item.id || item.drama_id || '');
    const remarks =
        item.update_label ||
        item.corner ||
        (item.episode_count ? `全${item.episode_count}集` : '');
    return {
        vod_id: vid,
        vod_name: item.name || item.title || item.t || vid,
        vod_pic: pic(item),
        vod_remarks: remarks,
    };
}

function navItems(data) {
    const blocks = listData(data?.data ?? data);
    const items = [];
    for (const b of blocks) {
        if (b && typeof b === 'object' && Array.isArray(b.items)) items.push(...b.items);
        else if (b && typeof b === 'object' && (b.id || b.drama_id)) items.push(b);
    }
    return items;
}

function unlock(d) {
    const eps = d.episodes;
    if (Array.isArray(eps)) {
        for (const ep of eps) {
            if (ep && typeof ep === 'object') {
                ep.is_buy = true;
                ep.type = 'free';
                ep.price = 0;
                ep.methods = [];
            }
        }
    }
    Object.assign(d, {
        pay_type: 'free',
        money: 0,
        episode_price: 0,
        points_price: 0,
        can_vip_watch: true,
        is_buy_whole: true,
        vip_episodes: [],
        coin_episodes: [],
        points_episodes: [],
    });
    return d;
}

function hlsUrl(vid, seq) {
    return `${host}/api/drama/hls/${sid(vid)}/${seq}/play.m3u8?line=free`;
}

async function navFilter(code) {
    if (!(code in filterCache)) {
        const data = await apiCall('/drama/navFilter', { code: String(code) });
        filterCache[code] = listData(data?.data ?? data);
    }
    return filterCache[code] || [];
}

async function classes() {
    if (classCache) return classCache;
    const arr = [{ type_id: 'all', type_name: '全部短剧' }];
    const data = await apiCall('/drama/navList', {});
    for (const item of listData(data?.data ?? data)) {
        const tid = String(item.code || item.id || item.cat_id || '');
        const name = item.name || item.title || tid;
        if (tid && name) arr.push({ type_id: tid, type_name: name });
    }
    classCache = arr;
    return arr;
}

async function filters(cls) {
    const common = [
        {
            key: 'order',
            name: '排序',
            value: [
                { n: '默认', v: '' },
                { n: '最新', v: 'new' },
                { n: '最热', v: 'hot' },
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
    const fs = {};
    for (const c of cls) {
        const tid = c.type_id;
        const tabs = tid !== 'all' && tid !== 'yuandou' ? await navFilter(tid) : [];
        fs[tid] = (tabs.length
            ? [
                  {
                      key: 'sub',
                      name: '子分类',
                      value: tabs.map((t, i) => ({ n: t.name || '默认', v: String(i) })),
                  },
              ]
            : []
        ).concat(common);
    }
    return fs;
}

function playHeaders() {
    return {
        'User-Agent': headers['User-Agent'],
        Referer: `${host}/home`,
        Origin: host,
    };
}

async function init(inReq) {
    const cfg = parseExtend(inReq?.body?.extend);
    if (cfg.site || cfg.base_url) {
        host = String(cfg.site || cfg.base_url).replace(/\/$/, '');
        api = `${host}/api`;
        headers = {
            ...headers,
            Origin: host,
            Referer: `${host}/home`,
        };
    }
    if (cfg.token) token = cfg.token;
    classCache = null;
    Object.keys(filterCache).forEach((k) => delete filterCache[k]);
    return {};
}

async function home() {
    const data = await apiCall('/drama/list', { page: '1', page_size: '18' });
    const cls = await classes();
    return {
        class: cls,
        filters: await filters(cls),
        list: listData(data).map(vod),
    };
}

async function category(inReq) {
    const tid = String(inReq.body.id || '');
    const pg = String(inReq.body.page || 1);
    const extend = inReq.body.filters || inReq.body.extend || {};

    let items = [];
    if (tid === 'yuandou') {
        const data = await apiCall('/drama/navBlock', {
            code: 'yuandou',
            tab: 'recommend',
            page: pg,
        });
        items = navItems(data);
    } else {
        const req = { page: pg, page_size: '18' };
        if (tid && tid !== 'all' && tid !== 'recommend') {
            const tabs = await navFilter(tid);
            const idx = intVal(extend.sub, 0);
            const sub = tabs[idx] || {};
            const flt = sub.filter && typeof sub.filter === 'object' ? sub.filter : {};
            req.cat_id = flt.cat_id || '';
            if (flt.tag_id) req.tag_id = flt.tag_id;
            req.order = flt.order || extend.order || '';
        } else if (extend.order) {
            req.order = extend.order;
        }
        if (extend.update_status) req.update_status = extend.update_status;
        const data = await apiCall('/drama/list', req);
        items = listData(data);
    }

    const pgNum = intVal(pg, 1);
    return {
        page: pgNum,
        pagecount: items.length < 18 ? pgNum : pgNum + 1,
        limit: 18,
        total: 99999,
        list: items.map(vod),
    };
}

async function detail(inReq) {
    let vid = inReq.body.id;
    if (Array.isArray(vid)) vid = vid[0];
    vid = sid(String(vid || ''));
    const obj = await apiCall('/drama/detail', { id: vid });
    let data = obj?.data && typeof obj.data === 'object' ? obj.data : obj;
    if (!data || typeof data !== 'object') return { list: [] };
    data = unlock(data);
    const vodId = sid(data.id || data.drama_id || vid);
    const name = data.name || data.title || data.t || vodId;
    const eps = Array.isArray(data.episodes) ? data.episodes : [];
    const count = intVal(data.episode_count || data.free_episodes, eps.length || 1);
    const play = [];
    if (eps.length) {
        eps.forEach((ep, i) => {
            const seq = ep.seq || ep.episode || ep.ep || i + 1;
            play.push(`${ep.name || ep.title || `第${seq}集`}$${vodId}|${seq}`);
        });
    } else {
        for (let i = 1; i <= count; i++) play.push(`第${i}集$${vodId}|${i}`);
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
                vod_play_from: NAME,
                vod_play_url: play.join('#'),
            },
        ],
    };
}

async function search(inReq) {
    const key = String(inReq.body.wd || '');
    const pg = String(inReq.body.page || 1);
    const data = await apiCall('/drama/list', { page: pg, page_size: '18', keywords: key });
    const items = listData(data);
    const pgNum = intVal(pg, 1);
    return {
        page: pgNum,
        pagecount: items.length < 18 ? pgNum : pgNum + 1,
        limit: 18,
        total: 99999,
        list: items.map(vod),
    };
}

async function play(inReq) {
    const [vid, seq] = splitPlayId(inReq.body.id);
    const obj = await apiCall('/drama/play', { id: vid, seq: String(seq) });
    const data = obj?.data && typeof obj.data === 'object' ? obj.data : {};
    const url = data.m3u8 || data.url || hlsUrl(vid, seq);
    return { parse: 0, playUrl: '', url, header: playHeaders() };
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
    },
};
