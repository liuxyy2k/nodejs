import crypto from 'crypto';
import req from '../../util/req.js';

/**
 * 推特APP · SuiRui/twitter · AES API + 图片 XOR 解密
 */

const PORT = process.env.DEV_HTTP_PORT || 9988;

const UA =
    'Mozilla/5.0 (Linux; Android 11; M2012K10C Build/RP1A.200720.011; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.141 Mobile Safari/537.36;SuiRui/twitter/ver=1.4.4';

const HS = ['wcyfhknomg', 'pdcqllfomw', 'alxhzjvean', 'bqeaaxzplt', 'hfbtpixjso'];
const PIC_RE =
    /(?:(?:jpe|image|img|cover|video|pic)\/[^\s"'&,;]+|[\w/\-.]+\.(?:jpg|jpeg|png|gif|webp|bmp))/i;

let did = '';
let token = '';
let phost = '';
let host = '';

const apiCache = new Map();
const imgCache = new Map();

function md5(text) {
    return crypto.createHash('md5').update(String(text), 'utf8').digest('hex');
}

function getSign() {
    const t = String(Math.floor(Date.now()));
    return { sign: md5(t), t };
}

function getHeaders() {
    const { sign, t } = getSign();
    return {
        'User-Agent': UA,
        deviceid: did,
        t,
        s: sign,
        aut: token,
    };
}

function aesDecrypt(word) {
    try {
        const key = Buffer.from('SmhiR2NpT2lKSVV6STFOaQ==', 'base64');
        const decipher = crypto.createDecipheriv('aes-128-cbc', key, key);
        const decoded = Buffer.from(word, 'base64');
        const dec = Buffer.concat([decipher.update(decoded), decipher.final()]);
        return JSON.parse(dec.toString('utf-8'));
    } catch {
        return {};
    }
}

function dtim(seconds) {
    try {
        const s = parseInt(seconds || 0, 10);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        const mm = String(m).padStart(2, '0');
        const ss = String(sec).padStart(2, '0');
        if (h > 0) return `${String(h).padStart(2, '0')}:${mm}:${ss}`;
        return `${mm}:${ss}`;
    } catch {
        return '';
    }
}

function imgDecode(data, length, key) {
    const GIF = Buffer.from([0x47, 0x49, 0x46]);
    const JPG = Buffer.from([0xff, 0xd8, 0xff]);
    const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    if (data.length > 7 && data.slice(1, 8).equals(PNG.slice(1, 8))) return data;
    if (data.length > 2 && data.slice(0, 3).equals(GIF)) return data;
    if (data.length > 2 && data.slice(0, 3).equals(JPG)) return data;

    const keyBytes = Buffer.from(key, 'utf-8');
    const result = Buffer.from(data);
    for (let i = 0; i < length && i < result.length; i++) {
        result[i] ^= keyBytes[i % keyBytes.length];
    }
    return result;
}

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/suirui/3';
    const hostHeader = inReq?.headers?.['x-forwarded-host'] || inReq?.headers?.host;
    if (hostHeader) {
        const proto = inReq?.headers?.['x-forwarded-proto'] || 'http';
        return `${proto}://${hostHeader}${prefix}`;
    }
    return `http://127.0.0.1:${PORT}${prefix}`;
}

function proxyPic(u, inReq) {
    if (!u) return '';
    const encoded = encodeURIComponent(u);
    return `${getProxyBase(inReq)}/img?do=img&type=img&u=${encoded}&url=${encoded}`;
}

function imgUrl(u) {
    if (!u) return '';
    if (String(u).startsWith('http')) return u;
    return `${phost || ''}${u}`;
}

function parseExt(extend) {
    if (!extend) return {};
    if (typeof extend === 'string') {
        try {
            return JSON.parse(extend);
        } catch {
            return {};
        }
    }
    return typeof extend === 'object' ? extend : {};
}

function getCache(db, key) {
    try {
        return db?.getDataSync?.(`/suirui_${key}`) || '';
    } catch {
        return '';
    }
}

function setCache(db, key, val) {
    try {
        db?.push(`/suirui_${key}`, val);
    } catch {
        /* ignore */
    }
}

function getDid(db) {
    let cached = getCache(db, 'did');
    if (cached) return cached;
    cached = md5(String(Math.floor(Date.now() / 1000)) + String(Math.floor(Math.random() * 9000) + 1000));
    setCache(db, 'did', cached);
    return cached;
}

async function tryLine(domain) {
    try {
        const { sign, t } = getSign();
        const headers = {
            'User-Agent': UA,
            Accept: 'application/json',
            deviceid: did,
            t,
            s: sign,
        };
        const body = { deviceId: did, tt: 'U', code: '##X-4m6Goo4zzPi1hF##', chCode: 'tt09' };
        const resp = await req.post(`${domain}/api/user/traveler`, body, {
            headers,
            timeout: 6000,
            validateStatus: () => true,
        });
        if (resp.status >= 400) return ['', '', ''];
        const data1 = resp.data?.data;
        if (data1?.token && data1?.imgDomain) {
            return [data1.token, data1.imgDomain, domain];
        }
    } catch {
        /* ignore */
    }
    return ['', '', ''];
}

async function getToken(db, i = 0, maxAttempts = 10) {
    if (i >= HS.length || i >= maxAttempts) return ['', '', ''];

    if (i === 0) {
        const line = getCache(db, 'twline');
        if (line) {
            const [d] = line.split('|', 2);
            const r = await tryLine(d);
            if (r[0]) return r;
        }
    }

    const randLen = Math.floor(Math.random() * 6) + 5;
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const randStr = Array.from({ length: randLen }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const domain = `https://${randStr}.${HS[i]}.work`;
    const r = await tryLine(domain);
    if (r[0]) {
        setCache(db, 'twline', `${domain}|${did}`);
        return r;
    }
    return getToken(db, i + 1, maxAttempts);
}

async function httpGet(url) {
    try {
        return await req.get(url, { headers: getHeaders(), timeout: 12000, validateStatus: () => true });
    } catch {
        return null;
    }
}

async function fetchApi(path, post = null) {
    if (!host) return {};
    const url = path.startsWith('http') ? path : `${host}${path.startsWith('/') ? path : `/${path}`}`;
    const key = post != null ? `POST:${url}` : `GET:${url}`;
    if (apiCache.has(key)) return apiCache.get(key);

    try {
        let resp;
        if (post != null) {
            resp = await req.post(url, post, { headers: getHeaders(), timeout: 12000, validateStatus: () => true });
        } else {
            resp = await httpGet(url);
        }
        if (!resp || resp.status >= 400) return {};
        const j = resp.data;
        const data = j?.encData ? aesDecrypt(j.encData) : j;
        if (apiCache.size > 80) apiCache.clear();
        apiCache.set(key, data);
        return data || {};
    } catch {
        return {};
    }
}

async function watch(vid) {
    try {
        const resp = await httpGet(`${host}/api/video/can/watch?videoId=${encodeURIComponent(vid)}`);
        if (!resp || resp.status >= 400) return {};
        const j = resp.data;
        return j?.encData ? aesDecrypt(j.encData) : j || {};
    } catch {
        return {};
    }
}

function buildFilters(classes) {
    const sort = [
        {
            key: 'fl',
            name: '分类',
            value: [
                { n: '最近更新', v: '1' },
                { n: '最多播放', v: '2' },
                { n: '好评榜', v: '3' },
            ],
        },
    ];
    const filters = {};
    for (const c of classes) {
        if (c.type_id === 'jx') {
            filters.jx = [
                {
                    key: 'type',
                    name: '精选',
                    value: [
                        { n: '日榜', v: '1' },
                        { n: '周榜', v: '2' },
                        { n: '月榜', v: '3' },
                        { n: '总榜', v: '4' },
                    ],
                },
            ];
        } else {
            filters[c.type_id] = sort;
        }
    }
    return filters;
}

function items(arr, clicked = false, inReq) {
    const res = [];
    for (const k of arr || []) {
        const cover = k?.coverImg;
        let pic = '';
        if (Array.isArray(cover) && cover.length) pic = cover[0];
        else if (typeof cover === 'string') pic = cover;

        const vid = String(k?.videoId || '');
        const uid = String(k?.userId || '');
        const nick = String(k?.nickName || '');
        if (!vid) continue;

        const title = k?.title || nick || vid;
        let id = `${vid}?${uid}?${encodeURIComponent(nick)}?${encodeURIComponent(title)}`;
        if (clicked) id += 'click';

        res.push({
            vod_id: id,
            vod_name: title,
            vod_pic: proxyPic(pic, inReq),
            vod_remarks: dtim(k?.playTime),
            style: { type: 'rect', ratio: 1.33 },
        });
    }
    return res;
}

function unwrapList(data) {
    const d = data?.data;
    if (Array.isArray(d)) return d;
    if (Array.isArray(data?.videoList)) return data.videoList;
    return [];
}

async function categoryList(tid, pg, ext, inReq) {
    const page = String(pg || '1');
    const tidStr = String(tid || 'jx');
    let path = `/api/video/queryVideoByClassifyId?pageSize=20&page=${page}&classifyId=${encodeURIComponent(tidStr)}&sortType=${ext.fl || '1'}`;

    if (tidStr.includes('click')) {
        path = `/api/video/queryPersonVideoByType?pageSize=20&page=${page}&userId=${encodeURIComponent(tidStr.replace(/click/g, ''))}`;
    }
    if (tidStr === 'jx') {
        path = `/api/video/getRankVideos?pageSize=20&page=${page}&type=${ext.type || '1'}`;
    }

    const data = await fetchApi(path);
    return items(unwrapList(data), tidStr.includes('click'), inReq);
}

function parseDetailId(raw) {
    let id = String(raw || '');
    if (!id.includes('?') && id.toLowerCase().includes('%3f')) {
        try {
            id = decodeURIComponent(id);
        } catch {
            /* ignore */
        }
    }
    const click = id.endsWith('click');
    if (click) id = id.slice(0, -5);
    const pp = id.split('?', 4);
    return {
        click,
        vid: pp[0] || id,
        uid: pp[1] || '',
        nick: decodeURIComponent(pp[2] || '推特APP'),
        title: decodeURIComponent(pp[3] || ''),
    };
}

function paramStrict(param) {
    try {
        if (param && typeof param === 'object') {
            const u = param.u || param.url || param.img || param.src || '';
            if (u) return [param.do || param.type || 'img', decodeURIComponent(String(u))];
            const qstr = param.query || param.params || param.param || '';
            if (qstr) {
                const q = new URLSearchParams(String(qstr));
                return [q.get('do') || q.get('type') || 'img', decodeURIComponent(q.get('u') || q.get('url') || q.get('img') || q.get('src') || '')];
            }
        }
        const q = new URLSearchParams(String(param || ''));
        return [q.get('do') || q.get('type') || 'img', decodeURIComponent(q.get('u') || q.get('url') || q.get('img') || q.get('src') || '')];
    } catch {
        return ['img', ''];
    }
}

function proxyParam(param) {
    const [tp, u] = paramStrict(param);
    if (u) return [tp, u];

    const vals = [];
    try {
        if (param && typeof param === 'object') {
            for (const [k, v] of Object.entries(param)) {
                vals.push(String(v));
                vals.push(String(k));
            }
        } else if (param != null) {
            vals.push(String(param));
        }
    } catch {
        return ['img', ''];
    }

    for (const v of vals) {
        try {
            const m = PIC_RE.exec(decodeURIComponent(v));
            if (m) return ['img', m[0]];
        } catch {
            /* continue */
        }
    }
    return ['img', ''];
}

async function imgAsset(u) {
    if (imgCache.has(u)) return imgCache.get(u);
    try {
        const resp = await req.get(imgUrl(u), {
            headers: { 'User-Agent': UA },
            responseType: 'arraybuffer',
            timeout: 15000,
            validateStatus: () => true,
        });
        if (!resp || resp.status >= 400 || !resp.data) {
            return ['text/plain', Buffer.alloc(0)];
        }
        const body = imgDecode(Buffer.from(resp.data), 100, '2020-zq3-888');
        const ct = String(resp.headers?.['content-type'] || 'image/jpeg').split(';')[0];
        const result = [ct, body];
        if (imgCache.size > 160) imgCache.clear();
        imgCache.set(u, result);
        return result;
    } catch {
        return ['text/plain', Buffer.alloc(0)];
    }
}

async function init(inReq, _outResp) {
    apiCache.clear();
    imgCache.clear();
    const db = inReq.server?.db;
    did = getDid(db);
    [token, phost, host] = await getToken(db);
    return {};
}

async function home(inReq, _outResp) {
    const data = await fetchApi('/api/video/classifyList');
    const classes = [{ type_name: '精选', type_id: 'jx' }];
    for (const k of data?.data || []) {
        const tid = String(k?.classifyId || '');
        const name = k?.classifyTitle || '';
        if (tid && name) classes.push({ type_name: name, type_id: tid });
    }

    const list = await categoryList('jx', 1, { type: '1' }, inReq);
    return { class: classes, filters: buildFilters(classes), list };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.tid ?? inReq.body.id ?? 'jx';
    const pg = inReq.body.page || inReq.body.pg || 1;
    const ext = parseExt(inReq.body.filters || inReq.body.filter || inReq.body.extend || {});
    const list = await categoryList(tid, pg, ext, inReq);

    return {
        list,
        page: parseInt(String(pg), 10) || 1,
        pagecount: 9999,
        limit: 20,
        total: 999999,
    };
}

async function detail(inReq, _outResp) {
    const raw = Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id;
    const { click, vid, uid, nick, title } = parseDetailId(raw);
    const name = (title || nick || '推特APP').replace(/\$/g, '＄');

    let clj = nick;
    if (!click && uid) {
        clj = `[a=cr:${JSON.stringify({ id: `${uid}click`, name: nick })}/]${nick}[/a]`;
    }

    return {
        list: [
            {
                vod_id: String(raw),
                vod_name: name,
                vod_pic: '',
                vod_director: clj,
                vod_content: name,
                vod_play_from: '酷鱼专线',
                vod_play_url: `${name}$${vid}`,
            },
        ],
    };
}

async function play(_inReq, _outResp) {
    let vid = String(_inReq.body.id || '');
    if (vid.includes('$')) vid = vid.split('$').pop();
    vid = vid.split('?')[0].trim();

    const data = await watch(vid);
    const ak = data?.authKey || '';
    const vu = data?.videoUrl || '';
    let url = '';
    if (ak && vu) {
        url = `${host}/api/m3u8/decode/authPath?auth_key=${encodeURIComponent(ak)}&path=${encodeURIComponent(vu)}`;
    }
    if (!url) url = data?.playPath || '';

    return {
        parse: 0,
        playUrl: '',
        url,
        header: getHeaders(),
    };
}

async function search(inReq, _outResp) {
    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    const pg = String(inReq.body.page || inReq.body.pg || 1);
    if (!key) {
        return { list: [], page: parseInt(pg, 10) || 1, pagecount: 9999, limit: 20, total: 0 };
    }

    const data = await fetchApi(
        `/api/search/keyWord?pageSize=20&page=${pg}&searchWord=${encodeURIComponent(key)}&searchType=1`,
    );
    const list = items(data?.videoList || [], false, inReq);

    return {
        list,
        page: parseInt(pg, 10) || 1,
        pagecount: 9999,
        limit: 20,
        total: 999999,
    };
}

async function imgProxy(inReq, reply) {
    try {
        const [, u] = proxyParam(inReq.query || {});
        if (!u) return reply.code(404).send('');

        const [ct, body] = await imgAsset(u);
        return reply.code(200).header('Content-Type', ct).header('Access-Control-Allow-Origin', '*').send(body);
    } catch (e) {
        console.warn('[suirui] imgProxy err', e.message);
        return reply.code(500).send('');
    }
}

export default {
    meta: {
        key: 'suirui',
        name: '💙推特APP',
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
