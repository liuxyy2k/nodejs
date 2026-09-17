import axios from 'axios';
import crypto from 'crypto';

/**
 * 韩小圈 / 韩剧TV
 * https://hanxiaoquan.com
 * API: hxqapi.hiyun.tv / hxqapi.zmdcq.com
 * 请求头 AES 签名 + 响应体 AES 解密
 */

const SITE_URL = 'https://hanxiaoquan.com';
const APP_HOSTS = [
    'https://hxqapi.hiyun.tv',
    'https://hxqapi.zmdcq.com',
];

const UA = 'HanjuTV/6.8.2 (Redmi Note 12; Android 14; Scale/2.00)';
const VN = '6.8.2';
const VC = 'a_8280';
const CH = 'xiaomi';
const UK_KEY = Buffer.from('f349wghhe784tqwh', 'utf8');
const UK_IV = Buffer.from('d3w8hf94fidk38lk', 'utf8');
const RESPONSE_SECRET = '34F9Q53w/HJW8E6Q';
const PAGE_SIZE = 16;

const CHANNELS = {
    1: '韩剧',
    2: '综艺',
    3: '电影',
    4: '日剧',
    5: '美剧',
    6: '泰剧',
    7: '国产剧',
};

let uid = '';

const http = axios.create({
    timeout: 12000,
    headers: { 'Accept-Encoding': 'gzip' },
    validateStatus: () => true,
});

function md5(s) {
    return crypto.createHash('md5').update(String(s), 'utf8').digest('hex');
}

function randomUid(n = 20) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let out = '';
    for (let i = 0; i < n; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
}

function aesCbc(data, key, iv, encrypt = true) {
    const k = Buffer.isBuffer(key) ? key.subarray(0, 16) : Buffer.from(String(key), 'utf8').subarray(0, 16);
    const v = Buffer.isBuffer(iv) ? iv.subarray(0, 16) : Buffer.from(String(iv), 'utf8').subarray(0, 16);
    if (encrypt) {
        const plain = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
        const cipher = crypto.createCipheriv('aes-128-cbc', k, v);
        return Buffer.concat([cipher.update(plain), cipher.final()]);
    }
    const raw = Buffer.isBuffer(data)
        ? data
        : Buffer.from(String(data).replace(/\s/g, ''), 'base64');
    const decipher = crypto.createDecipheriv('aes-128-cbc', k, v);
    const pt = Buffer.concat([decipher.update(raw), decipher.final()]);
    return pt.toString('utf8');
}

function buildHeaders() {
    if (!uid) uid = randomUid();
    const headers = {
        'User-Agent': UA,
        app: 'hj',
        ch: CH,
        vn: VN,
        vc: VC,
        Accept: 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip',
        Connection: 'Keep-Alive',
    };
    try {
        const uk = aesCbc(uid, UK_KEY, UK_IV, true).toString('base64');
        const mix = md5(uid);
        const payload = JSON.stringify({
            uid,
            model: 'Redmi Note 12',
            maker: 'Xiaomi',
            osv: '14',
            ts: Date.now(),
        });
        const sign = aesCbc(
            payload,
            Buffer.from(mix.slice(0, 16), 'utf8'),
            Buffer.from(mix.slice(16, 32), 'utf8'),
            true,
        ).toString('base64');
        headers.uk = uk;
        headers.sign = sign;
        headers.said = md5(uid).slice(0, 16);
    } catch (e) {
        console.warn('[hanxiaoquan] build header fail', e.message);
    }
    return headers;
}

function decodeBody(obj) {
    if (obj == null) return {};
    if (typeof obj === 'string') {
        try { return decodeBody(JSON.parse(obj)); } catch { return {}; }
    }
    if (!obj || typeof obj !== 'object') return {};

    const data = obj.data;
    if (typeof data === 'string' && data.length > 20 && !data.startsWith('http')) {
        try {
            const key = obj.key || md5(uid + String(obj.ts || ''));
            const mix = md5(String(key) + RESPONSE_SECRET);
            const text = aesCbc(
                data,
                Buffer.from(mix.slice(0, 16), 'utf8'),
                Buffer.from(mix.slice(16, 32), 'utf8'),
                false,
            );
            if (text) return JSON.parse(text);
        } catch (e) {
            console.warn('[hanxiaoquan] decode_body decrypt err', e.message);
        }
    }
    return obj;
}

async function fetchApi(path, params = {}) {
    for (const host of APP_HOSTS) {
        try {
            const resp = await http.get(`${host}${path}`, {
                headers: buildHeaders(),
                params,
            });
            if (resp.status >= 400) continue;
            let raw = resp.data;
            if (typeof raw === 'string') {
                try { raw = JSON.parse(raw); } catch { /* keep string */ }
            }
            const dec = decodeBody(raw);
            if (dec && (typeof dec !== 'object' || Object.keys(dec).length > 0 || Array.isArray(dec))) {
                return dec;
            }
        } catch (e) {
            console.warn(`[hanxiaoquan] fetch err ${host}${path}:`, e.message);
        }
    }
    return {};
}

function pickList(payload) {
    if (!payload || typeof payload !== 'object') {
        return Array.isArray(payload) ? payload : [];
    }
    for (const k of ['seriesList', 'list', 'items', 'series', 'result', 'records', 'searchList', 'playItems', 'data']) {
        const v = payload[k];
        if (Array.isArray(v)) return v;
        if (v && typeof v === 'object') {
            for (const kk of ['list', 'seriesList', 'items']) {
                if (Array.isArray(v[kk])) return v[kk];
            }
        }
    }
    const d = payload.data;
    if (Array.isArray(d)) return d;
    if (d && typeof d === 'object') return pickList(d);
    return [];
}

function pickPic(item) {
    if (!item || typeof item !== 'object') return '';
    const img = item.image;
    if (img && typeof img === 'object') {
        const u = img.thumb || img.poster || img.url || '';
        if (u) return u;
    }
    for (const k of ['thumb', 'poster', 'posterThumb', 'cover', 'pic']) {
        const u = item[k];
        if (typeof u === 'string' && u.startsWith('http')) return u;
    }
    return '';
}

function mapItem(item) {
    if (!item || typeof item !== 'object') return null;
    const sid = item.sid || item.seriesId || item.id || item.series_id;
    if (!sid) return null;

    let remarks = item.upInfo || item.updateInfo || item.corner || item.shorthand || item.score || '';
    if (item.isFinished || item.finish || item.isFinish) {
        remarks = remarks ? `${remarks} 完结` : '完结';
    } else if (item.count) {
        remarks = remarks ? `${remarks} 共${item.count}集` : `共${item.count}集`;
    }

    return {
        vod_id: String(sid),
        vod_name: item.name || item.title || item.seriesName || String(sid),
        vod_pic: pickPic(item),
        vod_remarks: String(remarks),
    };
}

function epName(ep, idx) {
    let name = String(ep?.title || ep?.name || ep?.alias || '');
    if (name && !/^\d+$/.test(name)) return name;
    const no = ep?.serialNo || ep?.episode || ep?.num || idx;
    return `第${no}集`;
}

async function fetchEpisodes(sid) {
    let drama = {};
    let episodes = [];

    let js = await fetchApi('/api/series/detail', { sid });
    if (js && typeof js === 'object') {
        drama = js.series || js.data || {};
        if (typeof drama !== 'object') drama = {};
        episodes = js.playItems || pickList(js);
    }

    if (!episodes.length) {
        js = await fetchApi('/api/series2/episodes', { sid });
        episodes = pickList(js);
    }
    if (!episodes.length) {
        js = await fetchApi('/api/series/programs_v2', { sid });
        episodes = pickList(js);
        if (!episodes.length && Array.isArray(js?.qxkPrograms)) {
            episodes = js.qxkPrograms;
        }
    }

    return { drama, episodes };
}

function pickUrl(obj) {
    if (!obj) return '';
    if (typeof obj === 'string' && obj.startsWith('http')) return obj;
    if (typeof obj === 'object' && !Array.isArray(obj)) {
        for (const k of ['playUrl', 'playurl', 'url', 'm3u8', 'src', 'path', 'srcUrl']) {
            const v = obj[k];
            if (typeof v === 'string' && v.startsWith('http')) return v;
            if (v && typeof v === 'object') {
                const u = pickUrl(v);
                if (u) return u;
            }
        }
        for (const nest of ['play', 'media', 'video', 'data', 'result']) {
            const u = pickUrl(obj[nest]);
            if (u) return u;
        }
    }
    if (Array.isArray(obj)) {
        for (const it of obj) {
            const u = pickUrl(it);
            if (u) return u;
        }
    }
    return '';
}

function isVideoFormat(url) {
    if (!url) return false;
    const u = String(url).toLowerCase();
    return ['.m3u8', '.mp4', '.mpd', '.flv'].some((x) => u.includes(x));
}

function playHeaders() {
    return {
        'User-Agent': UA,
        Referer: `${SITE_URL}/`,
        Origin: SITE_URL,
    };
}

async function init(inReq, _outResp) {
    uid = randomUid();
    try {
        const extend = inReq.body?.extend ?? inReq.body?.ext ?? '';
        let ext = extend;
        if (typeof ext === 'string' && ext.trim()) {
            try { ext = JSON.parse(ext); } catch { ext = {}; }
        }
        if (ext && typeof ext === 'object' && ext.uid) {
            uid = String(ext.uid);
        }
    } catch { /* ignore */ }
    return {};
}

async function home(_inReq, _outResp) {
    const classes = Object.entries(CHANNELS).map(([type_id, type_name]) => ({ type_id, type_name }));
    let list = [];
    try {
        let js = await fetchApi('/api/series/index', { type: '1', offset: '0', size: String(PAGE_SIZE) });
        for (const item of pickList(js).slice(0, 24)) {
            const v = mapItem(item);
            if (v) list.push(v);
        }
        if (!list.length) {
            js = await fetchApi('/api/search/s5', { k: '', srefer: 'home', type: '1', page: '1' });
            for (const item of pickList(js).slice(0, 24)) {
                const v = mapItem(item);
                if (v) list.push(v);
            }
        }
    } catch (e) {
        console.warn('[hanxiaoquan] home error', e.message);
    }
    return { class: classes, filters: {}, list };
}

async function category(inReq, _outResp) {
    const pg = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);
    const cate = String(inReq.body.id || '1');
    const offset = (pg - 1) * PAGE_SIZE;
    let videos = [];
    let more = false;

    try {
        let js = await fetchApi('/api/series/index', {
            type: cate,
            category: cate,
            offset: String(offset),
            size: String(PAGE_SIZE),
        });
        for (const item of pickList(js)) {
            const v = mapItem(item);
            if (v) videos.push(v);
        }
        more = Boolean(js?.more) || videos.length >= PAGE_SIZE - 2;

        if (!videos.length) {
            js = await fetchApi('/api/search/s5', {
                k: '', srefer: 'cate', type: cate, page: String(pg),
            });
            for (const item of pickList(js)) {
                const v = mapItem(item);
                if (v) videos.push(v);
            }
            more = videos.length >= 10;
        }
    } catch (e) {
        console.warn('[hanxiaoquan] category error', e.message);
    }

    return {
        list: videos,
        page: pg,
        pagecount: more ? pg + 1 : pg,
        limit: PAGE_SIZE,
        total: more ? 9999 : offset + videos.length,
    };
}

async function search(inReq, _outResp) {
    const pg = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);
    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    let videos = [];

    try {
        let js = await fetchApi('/api/search/s5', {
            k: key, srefer: 'search_input', type: '0', page: String(pg),
        });
        for (const item of pickList(js)) {
            const v = mapItem(item);
            if (v) videos.push(v);
        }

        if (!videos.length && pg === 1) {
            js = await fetchApi('/api/series/index', {
                keyword: key, offset: '0', size: String(PAGE_SIZE),
            });
            for (const item of pickList(js)) {
                const name = item?.name || '';
                if (name.includes(key)) {
                    const v = mapItem(item);
                    if (v) videos.push(v);
                }
            }
        }
    } catch (e) {
        console.warn('[hanxiaoquan] search error', e.message);
    }

    return {
        list: videos,
        page: pg,
        pagecount: videos.length >= 10 ? pg + 1 : pg,
        limit: 20,
        total: videos.length,
    };
}

async function detail(inReq, _outResp) {
    const sid = String(Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id || '');
    try {
        let { drama, episodes } = await fetchEpisodes(sid);

        if (!drama?.name && !drama?.title) {
            const extra = await fetchApi('/api/series/detail', { sid });
            if (extra && typeof extra === 'object') {
                drama = extra.series || extra.data || drama;
            }
        }

        const parts = [];
        for (let i = 0; i < episodes.length; i++) {
            const ep = episodes[i];
            if (!ep || typeof ep !== 'object') continue;
            const pid = ep.pid || ep.playItemId || ep.id || ep.eid;
            const src = ep.srcUrl || '';
            if (pid) {
                let token = `${sid}|${pid}`;
                if (src && String(src).startsWith('http')) {
                    token += `|${encodeURIComponent(src)}`;
                }
                parts.push(`${epName(ep, i + 1)}$${token}`);
            } else if (src && String(src).startsWith('http')) {
                parts.push(`${epName(ep, i + 1)}$${src}`);
            }
        }
        if (!parts.length) parts.push(`正片$${sid}`);

        let intro = String(drama.intro || drama.description || drama.brief || '');
        intro = intro.replace(/<[^>]+>/g, '').trim();

        let actor = drama.actor || drama.actors || '';
        const crew = drama.crew || '';
        if (!actor && crew.includes('主演')) {
            const m = crew.match(/主演[:：]\s*([^\n]+)/);
            if (m) actor = m[1].trim();
        }

        return {
            list: [{
                vod_id: sid,
                vod_name: drama.name || drama.title || drama.seriesName || sid,
                vod_pic: pickPic(drama),
                vod_year: String(drama.year || ''),
                vod_area: drama.area || '韩国',
                vod_actor: actor,
                vod_director: drama.director || '',
                vod_remarks: drama.upInfo || drama.updateInfo || (drama.isFinished ? '完结' : ''),
                vod_content: intro,
                vod_play_from: '韩小圈',
                vod_play_url: parts.join('#'),
            }],
        };
    } catch (e) {
        console.warn('[hanxiaoquan] detail error', e.message);
        return {
            list: [{
                vod_id: sid,
                vod_name: sid,
                vod_play_from: '韩小圈',
                vod_play_url: `正片$${sid}`,
            }],
        };
    }
}

async function play(inReq, _outResp) {
    const hdr = playHeaders();
    const playId = String(inReq.body.id || '');

    if (playId.startsWith('http') && isVideoFormat(playId)) {
        return { parse: 0, jx: 0, url: playId, header: hdr };
    }
    if (playId.startsWith('http')) {
        return { parse: 1, jx: 1, url: playId, header: hdr };
    }

    const parts = playId.split('|');
    const sid = parts[0] || playId;
    const pid = parts[1] || '';
    let src = '';
    if (parts.length > 2) {
        try { src = decodeURIComponent(parts[2]); } catch { src = parts[2]; }
    }

    let finalUrl = '';
    try {
        if (pid) {
            const playPaths = [
                ['/api/play/playurl', { pid, sid }],
                ['/api/play/get', { pid, sid }],
                ['/api/series/play', { pid, sid }],
                ['/api/play/playurl', { pid }],
            ];
            for (const [path, params] of playPaths) {
                const js = await fetchApi(path, params);
                const url = pickUrl(js);
                if (url) {
                    finalUrl = url;
                    break;
                }
            }
        }
        if (!finalUrl && src.startsWith('http')) {
            finalUrl = src;
        }
    } catch (e) {
        console.warn('[hanxiaoquan] play error', e.message);
    }

    if (finalUrl) {
        const direct = isVideoFormat(finalUrl);
        return { parse: direct ? 0 : 1, jx: direct ? 0 : 1, url: finalUrl, header: hdr };
    }

    return { parse: 1, jx: 1, url: `${SITE_URL}/`, header: hdr };
}

export default {
    meta: {
        key: 'hanxiaoquan',
        name: '🔥韩小圈',
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
