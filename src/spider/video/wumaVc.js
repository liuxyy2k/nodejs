import req from '../../util/req.js';

const DEFAULT_HOST = 'https://wuma.vc';
const PAGE_SIZE = 20;
const UA =
    'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const TIMEOUT = 20000;

const MINOR_KEYWORDS = [
    '幼女', '萝莉', '未成年', 'teen', 'loli', 'schoolgirl',
    '小学生', '初中生', '童', '幼齿', '萝莉控',
];

const CATEGORIES = [
    { type_id: '20', type_name: '日韓線上' },
    { type_id: '21', type_name: '亞洲線上' },
    { type_id: '22', type_name: '自拍線上' },
    { type_id: '23', type_name: '歐美線上' },
    { type_id: '24', type_name: '動漫線上' },
    { type_id: '25', type_name: 'AI短劇' },
    { type_id: '26', type_name: '無碼專區' },
    { type_id: '27', type_name: '直播錄播' },
    { type_id: '28', type_name: '短影音' },
    { type_id: '29', type_name: 'COSPLAY' },
    { type_id: '30', type_name: '寫真系列' },
];

const SORT_OPTIONS = [
    { n: '最新', v: '-publishedAt' },
    { n: '最热', v: '-views' },
];

let siteUrl = DEFAULT_HOST;

function isMinorContent(text) {
    if (!text) return false;
    const lower = String(text).toLowerCase();
    return MINOR_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

function sanitizeVod(vod) {
    if (!vod || typeof vod !== 'object') return vod;
    const { vod_name: name = '', vod_remarks: remarks = '', vod_content: content = '' } = vod;
    if (isMinorContent(name) || isMinorContent(remarks) || isMinorContent(content)) return null;
    return vod;
}

function sanitizeList(list) {
    if (!Array.isArray(list)) return list;
    return list.map(sanitizeVod).filter(Boolean);
}

function parseExtend(raw) {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    try {
        const out = JSON.parse(String(raw));
        return out && typeof out === 'object' ? out : {};
    } catch {
        return {};
    }
}

function parseFilters(inReq) {
    const raw = inReq.body.filters || inReq.body.filter || inReq.body.extend;
    const ext = parseExtend(raw);
    if (Array.isArray(raw)) {
        for (const it of raw) {
            if (it?.key) ext[it.key] = it.value ?? it.v;
        }
    }
    return ext;
}

function normPg(pg) {
    const n = parseInt(String(pg ?? ''), 10);
    return Number.isFinite(n) && n >= 1 ? n : 1;
}

function apiHeaders() {
    return {
        'User-Agent': UA,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.6',
        Referer: `${siteUrl}/`,
        Origin: siteUrl,
    };
}

async function apiGet(path) {
    const r = await req.get(`${siteUrl}${path}`, {
        headers: apiHeaders(),
        timeout: TIMEOUT,
        validateStatus: () => true,
    });
    if (r.status >= 400 || !r.data) return null;
    return r.data;
}

function buildFilters() {
    const filters = {};
    for (const cat of CATEGORIES) {
        filters[cat.type_id] = [{
            key: 'sort',
            name: '排序',
            init: '-publishedAt',
            value: SORT_OPTIONS,
        }];
    }
    return filters;
}

function vodFromListItem(v) {
    const name = v.name || '';
    if (isMinorContent(name)) return null;
    const thumbs = v.thumbnails || [];
    const pic = thumbs[0]?.fileUrl || '';
    return {
        vod_id: v.shortUUID || v.uuid,
        vod_name: name,
        vod_pic: pic,
        vod_remarks: v.category?.label || '',
    };
}

async function fetchCategory(tid, pg, sort) {
    const page = normPg(pg);
    const start = (page - 1) * PAGE_SIZE;
    const path =
        `/api/v1/videos?categoryOneOf=${encodeURIComponent(tid)}` +
        `&count=${PAGE_SIZE}&start=${start}&sort=${encodeURIComponent(sort)}&nsfw=true`;
    const data = await apiGet(path);
    if (!data) {
        return { page, pagecount: page, limit: PAGE_SIZE, total: 0, list: [] };
    }
    const total = data.total || 0;
    const items = sanitizeList((data.data || []).map(vodFromListItem).filter(Boolean));
    const pagecount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    return { page, pagecount, limit: PAGE_SIZE, total, list: items };
}

async function init(inReq) {
    const ext = parseExtend(inReq?.body?.extend);
    if (ext.host && String(ext.host).startsWith('http')) {
        siteUrl = String(ext.host).replace(/\/$/, '');
    }
    return {};
}

async function home() {
    const cats = CATEGORIES.filter((c) => !isMinorContent(c.type_name));
    const filters = buildFilters();
    let list = [];
    try {
        const first = cats[0]?.type_id || '20';
        list = (await fetchCategory(first, 1, '-publishedAt')).list;
    } catch {
        list = [];
    }
    return { class: cats, filters, list };
}

async function category(inReq) {
    const tid = String(inReq.body.id || inReq.body.tid || '20');
    const pg = inReq.body.page || inReq.body.pg || 1;
    const ext = parseFilters(inReq);
    const sort = ext.sort || '-publishedAt';
    return fetchCategory(tid, pg, sort);
}

async function detail(inReq) {
    const vid = String(Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id || '').trim();
    if (!vid) return { list: [] };

    const v = await apiGet(`/api/v1/videos/${encodeURIComponent(vid)}`);
    if (!v) return { list: [] };

    const name = v.name || '';
    if (isMinorContent(name)) return { list: [] };

    const thumbs = v.thumbnails || [];
    let pic = '';
    if (thumbs.length) {
        pic = thumbs[thumbs.length - 1]?.fileUrl || thumbs[0]?.fileUrl || '';
    }
    const desc = String(v.description || '').slice(0, 500);

    const playFrom = [];
    const playUrl = [];

    const playlists = v.streamingPlaylists || [];
    if (playlists.length) {
        const files = playlists[0].files || [];
        const lines = [];
        for (const f of files) {
            const res = f.resolution?.label || '未知';
            const m3u8 = f.playlistUrl;
            if (m3u8) lines.push(`${res}$${m3u8}`);
        }
        if (lines.length) {
            playFrom.push('PeerTube HLS');
            playUrl.push(lines.join('#'));
        }
    }

    const files = v.files || [];
    if (files.length && !playUrl.length) {
        const lines = [];
        for (const f of files) {
            const res = f.resolution?.label || '未知';
            const fileUrl = f.fileUrl || f.fileDownloadUrl;
            if (fileUrl) lines.push(`${res}$${fileUrl}`);
        }
        if (lines.length) {
            playFrom.push('直链');
            playUrl.push(lines.join('#'));
        }
    }

    if (!playUrl.length) return { list: [] };

    return {
        list: [{
            vod_id: vid,
            vod_name: name,
            vod_pic: pic,
            vod_content: desc,
            vod_play_from: playFrom.join('$$$'),
            vod_play_url: playUrl.join('$$$'),
        }],
    };
}

function extractPlayUrl(raw) {
    let s = String(raw || '').trim();
    if (!s) return '';
    if (s.includes('#')) s = s.split('#')[0].trim();
    const httpInParts = s.split('$').map((p) => p.trim()).find((p) => /^https?:\/\//i.test(p));
    if (httpInParts) return httpInParts;
    if (/^https?:\/\//i.test(s)) return s;
    return s.split('$').pop().trim();
}

function pickStreamingUrl(v) {
    const files = v?.streamingPlaylists?.[0]?.files || [];
    let best = '';
    let bestH = -1;
    for (const f of files) {
        const u = f.playlistUrl;
        if (!u) continue;
        const h = parseInt(String(f.resolution?.label || '').match(/\d+/)?.[0] || '0', 10);
        if (h >= bestH) {
            bestH = h;
            best = u;
        }
    }
    if (best) return best;
    for (const f of v?.files || []) {
        const u = f.fileUrl || f.fileDownloadUrl;
        if (u) return u;
    }
    return '';
}

function playHeader() {
    return {
        'User-Agent': UA,
        Referer: `${siteUrl}/`,
        Origin: siteUrl,
    };
}

async function search(inReq) {
    const page = normPg(inReq.body.page || inReq.body.pg);
    const keyword = String(inReq.body.wd || '').trim();
    if (!keyword) {
        return { page, pagecount: page, limit: PAGE_SIZE, total: 0, list: [] };
    }
    const start = (page - 1) * PAGE_SIZE;
    const path =
        `/api/v1/search/videos?search=${encodeURIComponent(keyword)}` +
        `&count=${PAGE_SIZE}&start=${start}&sort=-publishedAt&nsfw=true`;
    const data = await apiGet(path);
    if (!data) {
        return { page, pagecount: page, limit: PAGE_SIZE, total: 0, list: [] };
    }
    const total = data.total || 0;
    const items = sanitizeList((data.data || []).map(vodFromListItem).filter(Boolean));
    const pagecount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    return { page, pagecount, limit: PAGE_SIZE, total, list: items };
}

async function play(inReq) {
    let url = extractPlayUrl(inReq.body.id);
    if (!/^https?:\/\//i.test(url)) {
        const vid = url || String(inReq.body.id || '').trim();
        const v = await apiGet(`/api/v1/videos/${encodeURIComponent(vid)}`);
        url = v ? pickStreamingUrl(v) : '';
    }
    return {
        parse: 0,
        url,
        header: playHeader(),
    };
}

async function proxyHandler(inReq, reply) {
    const target = decodeURIComponent(String(inReq.query.url || inReq.query.u || '').trim());
    if (!/^https?:\/\//i.test(target)) {
        return reply.code(404).type('text/plain').send('');
    }
    try {
        const r = await req.get(target, {
            headers: { ...playHeader(), Accept: '*/*' },
            responseType: 'arraybuffer',
            timeout: TIMEOUT,
            validateStatus: () => true,
        });
        if (r.status >= 400) return reply.code(r.status).type('text/plain').send('');
        const ct = r.headers['content-type'] || 'application/octet-stream';
        return reply.header('Access-Control-Allow-Origin', '*').type(ct).send(Buffer.from(r.data));
    } catch {
        return reply.code(502).type('text/plain').send('');
    }
}

export default {
    meta: {
        key: 'wuma_vc',
        name: '📺無碼威視',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/proxy', proxyHandler);
    },
};
