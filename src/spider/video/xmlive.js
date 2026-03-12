import axios from 'axios';

const base = 'https://www.pandalive.co.kr';
const api  = 'https://api.pandalive.co.kr';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

// ─── 模块级状态 ────────────────────────────────────────────────────────────

let xDeviceInfo = { t: 'webPc', v: '1.0', ui: '0', ck: { sessKeyAsp: '' } };
let extraCookie = '';
let aggCache    = {};

// ─── 工具函数 ──────────────────────────────────────────────────────────────

function buildHeaders() {
    const h = {
        'User-Agent': UA,
        'Accept':     'application/json, text/plain, */*',
        'Origin':     base,
        'Referer':    `${base}/`,
    };
    if (extraCookie) h['Cookie'] = extraCookie;
    return h;
}

function withXDeviceInfo(headers) {
    return {
        ...headers,
        'x-device-info': JSON.stringify(xDeviceInfo),
    };
}

function playHeaders() {
    return { 'User-Agent': UA, 'Referer': `${base}/`, 'Origin': base };
}

function toVod(it) {
    const title   = it.title || it.userNick || it.userId || 'LIVE';
    const pic     = it.thumbUrl || it.ivsThumbnail || '';
    const userId  = it.userId  || '';
    const playId  = it.code    || userId;
    const vodId   = `${playId}|${userId}|${title}`;
    const remarks = `观众 ${it.user || 0} | 点赞 ${it.likeCnt || 0}`;
    return { vod_id: vodId, vod_name: title, vod_pic: pic, vod_remarks: remarks };
}

function findFirstM3u8(obj) {
    try {
        const m = JSON.stringify(obj).match(/https?:\/\/[^\s"\\]+\.m3u8[^\s"\\]*/);
        return m ? m[0] : '';
    } catch { return ''; }
}

function tidToSort(tid) {
    const t = (tid || '').toLowerCase();
    if (t === 'live_newbj') return ['user', 'Y'];
    if (t === 'live_hot')   return ['hot',  'N'];
    if (t === 'live_new')   return ['new',  'N'];
    return ['user', 'N'];
}

// ─── API 请求封装 ──────────────────────────────────────────────────────────

async function appToken() {
    try {
        await axios.get(`${api}/v1/member/app_token`, {
            headers: withXDeviceInfo(buildHeaders()),
            timeout: 8000,
        });
    } catch {}
}

async function listLive({ page, pageSize = 60, orderBy = 'user', onlyNew = 'N' } = {}) {
    const limit  = pageSize;
    const offset = page ? Math.max(0, (page - 1) * limit) : 0;
    const h      = withXDeviceInfo(buildHeaders());
    h['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';

    try {
        const params = new URLSearchParams({
            orderBy,
            onlyNewBj: onlyNew,
            limit:     String(limit),
            offset:    String(offset),
        });
        const resp = await axios.post(`${api}/v1/live`, params.toString(), { headers: h, timeout: 8000 });
        const j    = resp.data;
        if (j?.list?.length) return j;
    } catch {}

    try {
        const resp = await axios.get(`${api}/v1/live`, { headers: buildHeaders(), timeout: 8000 });
        return resp.data || {};
    } catch { return {}; }
}

async function listLivePage(page, pageSize, orderBy = 'user', onlyNew = 'N') {
    const j = await listLive({ page, pageSize, orderBy, onlyNew });
    return Array.isArray(j?.list) ? j.list : [];
}

async function listLiveAggregate({ maxPages = 5, pageSize = 60, minExpect = 60, orderBy = 'user', onlyNew = 'N' } = {}) {
    const cacheKey = `pandalive_agg_v2_${orderBy}_${onlyNew}`;
    const cached   = aggCache[cacheKey];
    if (cached?.list && Date.now() / 1000 < cached.expiresAt) return cached.list;

    const seen   = new Set();
    const result = [];

    const first = await listLive({ pageSize, orderBy, onlyNew });
    for (const it of (first?.list || [])) {
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

    aggCache[cacheKey] = { expiresAt: Math.floor(Date.now() / 1000) + 20, list: result };
    return result;
}

async function livePlay(playId) {
    const body = JSON.stringify({ play_id: playId, device: 'webPc', player: 'ivs' });
    const h    = withXDeviceInfo(buildHeaders());
    h['Content-Type'] = 'application/json';
    h['Referer']      = `${base}/play/${playId.split('_')[0]}`;

    let resp;
    try {
        resp = await axios.post(`${api}/v1/live/play`, body, { headers: h, timeout: 8000 });
        if (resp.status !== 200) throw new Error('non-200');
    } catch {
        await appToken();
        try {
            resp = await axios.post(`${api}/v1/live/play`, body, { headers: h, timeout: 8000 });
        } catch { return { result: false }; }
    }
    return resp.data || { result: false };
}

// ─── API 处理函数 ──────────────────────────────────────────────────────────

async function init(inReq, _outResp) {
    try {
        const extend = inReq.body?.extend || '';
        if (extend) {
            const cfg = typeof extend === 'object' ? extend : JSON.parse(extend);
            if (cfg.x_device_info) xDeviceInfo = cfg.x_device_info;
            if (cfg.cookie)        extraCookie  = cfg.cookie;
        }
    } catch {}

    try {
        await axios.get(base, { headers: buildHeaders(), timeout: 8000 });
        await appToken();
    } catch {}

    return {};
}

async function home(_inReq, _outResp) {
    // 对应 Python 的 homeVideoContent：聚合最多3页，取前48条
    const items = await listLiveAggregate({ maxPages: 3, pageSize: 60, minExpect: 48, orderBy: 'user', onlyNew: 'N' });
    const list  = (items.length ? items : (await listLive()).list || [])
                    .slice(0, 48)
                    .map(toVod);

    return {
        class: [{ type_name: 'LIVE', type_id: 'live' }],
        filters: {
            live: [{
                key:   'sort',
                value: [
                    { n: '观看次数', v: 'user-N' },
                    { n: '热门',     v: 'hot-N'  },
                    { n: '最新',     v: 'new-N'  },
                    { n: '新人',     v: 'user-Y' },
                ],
            }],
        },
        list,
    };
}

async function category(inReq, _outResp) {
    const tid      = inReq.body.id;
    const pg       = parseInt(inReq.body.page) || 1;
    const pageSize = 24;
    let orderBy = 'user', onlyNew = 'N';

    try {
        // 对应 Python 的 extend 参数
        let ext = inReq.body.extend || {};
        if (typeof ext === 'string') {
            try { ext = ext.trim().startsWith('{') ? JSON.parse(ext) : {}; } catch { ext = {}; }
        }
        const s = ext.sort;
        if (typeof s === 'string' && s.includes('-')) {
            const [ob, on] = s.split('-', 2);
            orderBy = ob || 'user';
            onlyNew = on || 'N';
        }
        if (orderBy === 'user' && onlyNew === 'N' && tid?.toLowerCase() !== 'live') {
            [orderBy, onlyNew] = tidToSort(tid);
        }
    } catch {}

    const serverItems = await listLivePage(pg, pageSize, orderBy, onlyNew);
    if (serverItems.length >= pageSize) {
        return { page: pg, pagecount: 99999, limit: pageSize, total: 999999, list: serverItems.map(toVod) };
    }

    const allItems = await listLiveAggregate({ maxPages: 12, pageSize: 100, minExpect: 120, orderBy, onlyNew });
    const total    = allItems.length;

    if (total <= 0) {
        const baseList = (await listLive()).list || [];
        const t2       = baseList.length;
        if (!t2) return { page: pg, pagecount: 1, limit: pageSize, total: 0, list: [] };
        const start = (pg - 1) * pageSize;
        return {
            page:      pg,
            pagecount: Math.ceil(t2 / pageSize),
            limit:     pageSize,
            total:     t2,
            list:      baseList.slice(start, start + pageSize).map(toVod),
        };
    }

    const start = ((pg - 1) * pageSize) % total;
    const part  = Array.from({ length: pageSize }, (_, i) => allItems[(start + i) % total]);
    return { page: pg, pagecount: 99999, limit: pageSize, total: 999999, list: part.map(toVod) };
}

async function detail(inReq, _outResp) {
    const vid    = inReq.body.id;
    const parts  = vid.split('|');
    const playId = parts[0];
    const userId = parts[1] || playId.split('_')[0];
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
    const vid    = inReq.body.id;
    const parts  = vid.split('|');
    const playId = parts[0];

    try {
        const j    = await livePlay(playId);
        const m3u8 = findFirstM3u8(j);
        if (m3u8) return { parse: 0, url: m3u8, header: playHeaders() };
    } catch {}

    return { parse: 1, url: `${base}/play/${playId.split('_')[0]}`, header: playHeaders() };
}

// 对应 Python 的 liveContent
async function live(inReq, _outResp) {
    const playId = inReq.body.id;
    try {
        const j    = await livePlay(playId);
        const m3u8 = findFirstM3u8(j);
        if (m3u8) return { parse: 0, url: m3u8, header: playHeaders() };
    } catch {}
    return { parse: 1, url: `${base}/play/${playId}`, header: playHeaders() };
}

async function search(inReq, _outResp) {
    const key   = (inReq.body.wd || '').toLowerCase();
    const items = (await listLive()).list || [];

    const result = items.filter(it =>
        key && (
            (it.title    || '').toLowerCase().includes(key) ||
            (it.userId   || '').toLowerCase().includes(key) ||
            (it.userNick || '').toLowerCase().includes(key)
        )
    ).map(toVod);

    return { list: result, page: 1 };
}

// ─── 导出 ──────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'pandalive',
        name: 'PandaLive',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/live',     live);
        fastify.post('/search',   search);
    },
};