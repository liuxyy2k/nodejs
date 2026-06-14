import axios from 'axios';

const base = 'https://www.pandalive.co.kr';
const api  = 'https://api.pandalive.co.kr';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

let xDeviceInfo = { t: 'webPc', v: '1.0', ui: '0', ck: { sessKeyAsp: '' } };
let extraCookie = '';

const http = axios.create({
    timeout: 8_000,
    headers: {
        'User-Agent': UA,
        Accept:       'application/json, text/plain, */*',
        Origin:       base,
        Referer:      base + '/',
    },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function withXDevice(headers = {}) {
    return {
        ...headers,
        'x-device-info': JSON.stringify(xDeviceInfo),
    };
}

function playHeaders() {
    return { 'User-Agent': UA, Referer: base + '/', Origin: base };
}

function findFirstM3u8(obj) {
    try {
        const text = JSON.stringify(obj);
        const m    = text.match(/https?:\/\/[^\s"\\]+\.m3u8[^\s"\\]*/);
        return m ? m[0] : '';
    } catch { return ''; }
}

function toVod(it) {
    const title   = it.title || it.userNick || it.userId || 'LIVE';
    const pic     = it.thumbUrl || it.ivsThumbnail || '';
    const userId  = it.userId  || '';
    const playId  = it.code    || userId;
    const remarks = `观众 ${it.user || 0} | 点赞 ${it.likeCnt || 0}`;
    return {
        vod_id:      `${playId}|${userId}|${title}`,
        vod_name:    title,
        vod_pic:     pic,
        vod_remarks: remarks,
    };
}

function tidToSort(tid) {
    const t = (tid || '').toLowerCase();
    if (t === 'live_newbj') return ['user', 'Y'];
    if (t === 'live_hot')   return ['hot',  'N'];
    if (t === 'live_new')   return ['new',  'N'];
    return ['user', 'N'];
}

// ─── API 封装 ─────────────────────────────────────────────────────────────────

async function appToken() {
    return http.get(`${api}/v1/member/app_token`, {
        headers: withXDevice(),
    });
}

async function listLive({ page = null, pageSize = 60, orderBy = 'user', onlyNew = 'N' } = {}) {
    const limit  = pageSize;
    const offset = page == null ? 0 : Math.max(0, (page - 1) * limit);
    const data   = new URLSearchParams({
        orderBy, onlyNewBj: onlyNew, limit: String(limit), offset: String(offset),
    });
    try {
        const { data: j } = await http.post(`${api}/v1/live`, data, {
            headers: withXDevice({ 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }),
        });
        if (j?.list?.length > 0) return j;
    } catch { /* ignore */ }
    try {
        const { data: j } = await http.get(`${api}/v1/live`);
        return j;
    } catch { return {}; }
}

async function listLivePage(page, pageSize, orderBy = 'user', onlyNew = 'N') {
    const j = await listLive({ page, pageSize, orderBy, onlyNew });
    return j?.list || [];
}

async function listLiveAggregate({ maxPages = 5, pageSize = 60, minExpect = 60, orderBy = 'user', onlyNew = 'N' } = {}) {
    const seen   = new Set();
    const result = [];

    const first = await listLive({ pageSize, orderBy, onlyNew });
    for (const it of first?.list || []) {
        const code = it.code || it.userId;
        if (code && !seen.has(code)) { seen.add(code); result.push(it); }
    }

    let p = 1;
    while (result.length < minExpect && p <= maxPages) {
        const items = await listLivePage(p, pageSize, orderBy, onlyNew);
        let added = 0;
        for (const it of items) {
            const code = it.code || it.userId;
            if (code && !seen.has(code)) { seen.add(code); result.push(it); added++; }
        }
        if (added === 0 && p > 1) break;
        p++;
    }
    return result;
}

async function livePlay(playId) {
    const body    = { play_id: playId, device: 'webPc', player: 'ivs' };
    const headers = withXDevice({
        'Content-Type': 'application/json',
        Referer:        `${base}/play/${playId.split('_')[0]}`,
    });
    let res = await http.post(`${api}/v1/live/play`, body, { headers }).catch(() => null);
    if (!res || res.status !== 200) {
        try { await appToken(); } catch { /* ignore */ }
        res = await http.post(`${api}/v1/live/play`, body, { headers }).catch(() => null);
    }
    return res?.data || { result: false };
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(inReq, _outResp) {
    try {
        const ext = inReq.body?.extend || '';
        if (ext) {
            const cfg = typeof ext === 'object' ? ext : JSON.parse(ext);
            if (cfg.x_device_info) xDeviceInfo = cfg.x_device_info;
            if (cfg.cookie)        extraCookie  = cfg.cookie;
        }
    } catch { /* ignore */ }
    if (extraCookie) http.defaults.headers.Cookie = extraCookie;
    try { await http.get(base); await appToken(); } catch { /* ignore */ }
    return {};
}

async function home(inReq, _outResp) {
    const filter  = inReq.body?.filter;
    const filters = filter ? {
        live: [{ key: 'sort', value: [
            { n: '观看次数', v: 'user-N' },
            { n: '热门',     v: 'hot-N'  },
            { n: '最新',     v: 'new-N'  },
            { n: '新人',     v: 'user-Y' },
        ]}],
    } : {};

    let list = [];
    try {
        const items = await listLiveAggregate({ maxPages: 3, pageSize: 60, minExpect: 48 });
        list = (items.length ? items : (await listLive()).list || [])
            .slice(0, 48).map(toVod);
    } catch { /* ignore */ }

    return {
        class:   [{ type_id: 'live', type_name: 'LIVE' }],
        filters,
        list,
    };
}

async function category(inReq, _outResp) {
    const tid      = inReq.body.id;
    const pg       = parseInt(inReq.body.page) || 1;
    const pageSize = 24;

    let orderBy = 'user', onlyNew = 'N';
    try {
        let extend = inReq.body.extend || {};
        if (typeof extend === 'string') {
            try { extend = extend.trim().startsWith('{') ? JSON.parse(extend) : {}; } catch { extend = {}; }
        }
        const s = extend?.sort;
        if (typeof s === 'string' && s.includes('-')) {
            [orderBy, onlyNew] = s.split('-', 2);
        } else if (tid?.toLowerCase() !== 'live') {
            [orderBy, onlyNew] = tidToSort(tid);
        }
    } catch { /* ignore */ }

    const serverItems = await listLivePage(pg, pageSize, orderBy, onlyNew);
    if (serverItems.length >= pageSize) {
        return { page: pg, pagecount: 99999, limit: pageSize, total: 999999, list: serverItems.map(toVod) };
    }

    const allItems = await listLiveAggregate({ maxPages: 12, pageSize: 100, minExpect: 120, orderBy, onlyNew });
    const total    = allItems.length;
    if (!total) {
        const base_list = (await listLive()).list || [];
        if (!base_list.length) return { page: pg, pagecount: 1, limit: pageSize, total: 0, list: [] };
        const start = (pg - 1) * pageSize;
        const part  = base_list.slice(start, start + pageSize);
        return {
            page: pg,
            pagecount: Math.ceil(base_list.length / pageSize),
            limit: pageSize,
            total: base_list.length,
            list: part.map(toVod),
        };
    }

    const start = ((pg - 1) * pageSize) % total;
    const part  = Array.from({ length: pageSize }, (_, i) => allItems[(start + i) % total]);
    return { page: pg, pagecount: 99999, limit: pageSize, total: 999999, list: part.map(toVod) };
}

async function detail(inReq, _outResp) {
    const vid    = inReq.body.id;
    const parts  = vid.split('|');
    const userId = parts[1] || parts[0].split('_')[0];
    const title  = parts[2] || userId;

    return {
        list: [{
            vod_id:        vid,
            vod_name:      title,
            vod_pic:       '',
            type_name:     'LIVE',
            vod_remarks:   'PandaLive',
            vod_content:   title,
            vod_play_from: 'IVS',
            vod_play_url:  `直播$${vid}`,
        }],
    };
}

async function play(inReq, _outResp) {
    const id     = inReq.body.id;
    const playId = id.split('|')[0];

    try {
        const j    = await livePlay(playId);
        const m3u8 = findFirstM3u8(j);
        if (m3u8) return { parse: 0, url: m3u8, header: playHeaders() };
    } catch { /* ignore */ }

    return { parse: 1, url: `${base}/play/${playId.split('_')[0]}`, header: playHeaders() };
}

async function search(inReq, _outResp) {
    const key  = (inReq.body.wd || '').toLowerCase();
    const all  = (await listLive()).list || [];
    const list = all
        .filter((it) =>
            (it.title    || '').toLowerCase().includes(key) ||
            (it.userId   || '').toLowerCase().includes(key) ||
            (it.userNick || '').toLowerCase().includes(key)
        )
        .map(toVod);
    return { list, page: 1 };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'pandalive',
        name: '🔥PandaLive',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
    },
};