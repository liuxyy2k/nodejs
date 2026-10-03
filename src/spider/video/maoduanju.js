import axios from 'axios';
import crypto from 'crypto';
import https from 'https';

const DEFAULT_HOST = 'https://7maoduanju.com';
const API_PATH = '/api/toc/v1';
const UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const PAGE_SIZE = 12;
const BRAND = '蝴蝶影视';

const LINES = [
    ['10000000-0000-4000-8000-0000000000c0', '热门短剧'],
    ['10000000-0000-4000-8000-000000000002', '原创短剧'],
    ['10000000-0000-4000-8000-0000000000b0', '真人短剧'],
    ['10000000-0000-4000-8000-000000000005', '擦边短剧'],
    ['10000000-0000-4000-8000-0000000000b3', 'AI短剧'],
    ['10000000-0000-4000-8000-000000000003', 'AI漫剧'],
    ['10000000-0000-4000-8000-0000000000b1', 'AI魔改'],
    ['10000000-0000-4000-8000-0000000000b2', 'AI换脸'],
    ['10000000-0000-4000-8000-0000000000b4', '影视综艺'],
];

const FILTERS = [
    {
        key: 'sort',
        name: '排序',
        value: [
            { n: '默认', v: 'default' },
            { n: '最新', v: 'latest' },
            { n: '最热', v: 'hot' },
        ],
    },
    {
        key: 'status',
        name: '状态',
        value: [
            { n: '全部', v: 'all' },
            { n: '连载中', v: 'ongoing' },
            { n: '已完结', v: 'completed' },
        ],
    },
];

const UUID_RE =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

let host = DEFAULT_HOST;
let doProbe = true;
let token = '';
let tokenAt = 0;
const dramaCache = new Map();

function parseExtend(raw) {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    const txt = String(raw).trim();
    if (!txt) return {};
    if (txt.startsWith('{')) {
        try {
            const o = JSON.parse(txt);
            return o && typeof o === 'object' ? o : {};
        } catch {
            return {};
        }
    }
    if (txt.startsWith('http')) return { host: txt };
    return {};
}

function applyExtend(ext) {
    const h = ext.host || ext.url || ext.ext;
    if (h) {
        let u = String(h).trim();
        if (!u.startsWith('http')) u = `https://${u}`;
        host = u.replace(/\/$/, '');
    }
    if (ext.probe != null) {
        doProbe = !['0', 'false', 'False'].includes(String(ext.probe));
    }
}

function headers(withToken) {
    const h = {
        'User-Agent': UA,
        Accept: 'application/json, text/plain, */*',
        Referer: `${host}/`,
        Origin: host,
    };
    if (withToken && token) h.Authorization = `Bearer ${token}`;
    return h;
}

async function apiGet(path, auth = false) {
    const resp = await axios.get(`${host}${API_PATH}${path}`, {
        headers: headers(auth),
        httpsAgent,
        timeout: 15000,
        validateStatus: () => true,
        family: 4,
    });
    if (resp.status >= 400) return null;
    return typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
}

async function apiPost(path, body) {
    const resp = await axios.post(`${host}${API_PATH}${path}`, body, {
        headers: { ...headers(), 'Content-Type': 'application/json' },
        httpsAgent,
        timeout: 15000,
        validateStatus: () => true,
        family: 4,
    });
    if (resp.status >= 400) return null;
    return typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
}

async function ensureToken() {
    if (token && Date.now() - tokenAt < 25 * 60 * 1000) return token;
    const r = await apiPost('/auth/device', { deviceId: crypto.randomUUID() });
    token = r?.token || '';
    tokenAt = Date.now();
    return token;
}

function pic(url) {
    if (!url) return '';
    let u = String(url).trim();
    if (u.startsWith('//')) u = `https:${u}`;
    return u.split('@Referer')[0].split('@User-Agent')[0].trim();
}

function formatRemarks(info) {
    const i = String(info || '').trim();
    return i ? `${BRAND} · ${i}` : BRAND;
}

function cardNotes(d) {
    const eps = Number(d.episodeCount) || 0;
    const free = Number(d.freeEpisodeCount) || 0;
    const pay = String(d.payMode || '');
    const vip = !!d.isVipBadge;
    const notes = [];
    if (eps > 0) notes.push(`${eps}集`);
    if (vip || pay === 'vip_only') {
        notes.push(free < 9000 ? `免${free}·VIP` : 'VIP');
    } else if (free < 9000 && eps > 0) {
        notes.push(`免${free}集`);
    }
    return notes.join(' · ');
}

function toVod(item) {
    if (!item?.id || !item?.title) return null;
    return {
        vod_id: String(item.id),
        vod_name: String(item.title),
        vod_pic: pic(item.coverUrl),
        vod_remarks: formatRemarks(cardNotes(item)),
    };
}

function seoUrl(prefix, index) {
    if (!prefix || index <= 0) return '';
    const n = String(index).padStart(2, '0');
    return `${prefix}/hls/ep${n}/ep${n}.m3u8`;
}

async function fetchDrama(did, force = false) {
    const hit = dramaCache.get(did);
    if (hit && !force && Date.now() - hit.at < 300000) {
        return { prefix: hit.prefix, eps: hit.eps };
    }
    const d = await apiGet(`/dramas/${encodeURIComponent(did)}`);
    if (!d || typeof d !== 'object') return { prefix: '', eps: [] };
    const eps = (d.episodes || [])
        .filter((e) => e && e.id)
        .map((e) => ({
            id: String(e.id),
            index: Number(e.indexNo) || 0,
            title: String(e.title || ''),
            locked: !!e.locked,
            seo: String(e.seoContentUrl || ''),
        }))
        .sort((a, b) => a.index - b.index);
    let prefix = '';
    for (const e of eps) {
        const m = e.seo.match(/(https?:\/\/[^/\s]+\/7cat\/[^/\s]+)\/hls\//);
        if (m) {
            prefix = m[1];
            break;
        }
    }
    dramaCache.set(did, { at: Date.now(), prefix, eps, meta: d });
    return { prefix, eps, meta: d };
}

async function probeM3u8(url) {
    if (!url || !doProbe) return true;
    try {
        const resp = await axios.get(url, {
            headers: { 'User-Agent': UA, Range: 'bytes=0-1023', Referer: `${host}/` },
            httpsAgent,
            timeout: 4000,
            responseType: 'arraybuffer',
            validateStatus: () => true,
            family: 4,
        });
        const buf = Buffer.from(resp.data || []);
        return buf.includes('#EXTM3U') || buf.toString('utf8').includes('#EXTM3U');
    } catch {
        return false;
    }
}

async function scanCover(prefix, eps) {
    if (!prefix || !eps.length) return 0;
    const idxs = eps.map((e) => e.index).filter((n) => n > 0);
    if (!idxs.length) return 0;
    const points = new Set([idxs[idxs.length - 1]]);
    const locked = eps.filter((e) => e.locked).map((e) => e.index);
    if (locked.length) {
        points.add(locked[0]);
        points.add(locked[Math.floor(locked.length / 2)]);
    }
    let cover = 0;
    for (const p of [...points].sort((a, b) => a - b)) {
        const u = seoUrl(prefix, p);
        if (await probeM3u8(u)) cover = Math.max(cover, p);
    }
    return cover;
}

async function officialPlayUrl(did, epId) {
    await ensureToken();
    const r = await apiGet(
        `/dramas/${encodeURIComponent(did)}/episodes/${encodeURIComponent(epId)}/play`,
        true,
    );
    return r?.playUrl || '';
}

function unwrapPlayId(raw) {
    let s = String(raw || '').trim();
    if (!s) return { direct: '', flag: '' };
    if (s.includes('$$$')) s = s.split('$$$')[0].trim();
    if (s.includes('#') && !s.startsWith('http')) s = s.split('#')[0].trim();
    for (let i = 0; i < 3 && s.includes('$'); i++) s = s.split('$').pop().trim();
    if (s.startsWith('http')) return { direct: s, flag: '' };
    const parts = s.split('|');
    if (parts.length >= 2 && UUID_RE.test(parts[0].trim())) return { direct: '', flag: s };
    if (parts.length >= 3) return { direct: '', flag: s };
    return { direct: '', flag: s };
}

async function init(inReq) {
    applyExtend(parseExtend(inReq.body?.extend || inReq.body?.ext || ''));
    await ensureToken();
    return {};
}

async function home() {
    const classes = LINES.map(([id, name]) => ({ type_id: id, type_name: name }));
    const filters = {};
    for (const [id] of LINES) filters[id] = FILTERS;
    const data = await apiGet('/home');
    const seen = new Set();
    const list = [];
    for (const blk of data?.blocks || []) {
        for (const it of blk?.items || []) {
            const vod = toVod(it);
            if (!vod || seen.has(vod.vod_id)) continue;
            seen.add(vod.vod_id);
            list.push(vod);
        }
    }
    return { class: classes, filters, list };
}

async function category(inReq) {
    const tid = String(inReq.body.id || LINES[0][0]);
    const page = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);
    const ext = parseExtend(inReq.body.extend || inReq.body.filters || inReq.body.filter);
    const offset = (page - 1) * PAGE_SIZE;
    const params = new URLSearchParams({ line: tid, offset: String(offset) });
    const sort = String(ext.sort || '');
    const status = String(ext.status || '');
    if (sort && sort !== 'sort' && sort !== 'default') params.set('sort', sort);
    if (status && status !== 'all') params.set('status', status);
    const data = await apiGet(`/browse?${params}`);
    const items = (data?.items || []).map(toVod).filter(Boolean);
    const hasMore = !!data?.hasMore;
    const total = Number(data?.total) || 0;
    return {
        list: items,
        page,
        pagecount: hasMore ? page + 1 : page,
        limit: PAGE_SIZE,
        total: total || page * PAGE_SIZE + (hasMore ? 1 : 0),
    };
}

async function detail(inReq) {
    let id = inReq.body.id;
    if (Array.isArray(id)) id = id[0];
    id = String(id || '').split('|')[0].trim();
    if (!id) return { list: [] };
    const { prefix, eps, meta } = await fetchDrama(id);
    const d = meta || (await apiGet(`/dramas/${encodeURIComponent(id)}`)) || {};
    if (!eps.length) return { list: [] };

    let cover = Number.MAX_SAFE_INTEGER;
    if (doProbe) {
        try {
            const c = await scanCover(prefix, eps);
            if (c > 0) cover = c;
        } catch {
            cover = Number.MAX_SAFE_INTEGER;
        }
    }
    const marked = doProbe && cover < Number.MAX_SAFE_INTEGER;
    const epLines = eps.map((e) => {
        const idx = e.index;
        const url = e.seo || seoUrl(prefix, idx);
        const mark = marked && idx <= cover ? '✅ ' : '';
        const name = e.title || `第${idx}集`;
        const flag = `${id}|${e.id}|${idx}`;
        return `${mark}${name}$${flag}`;
    });
    const playBlock = epLines.join('#');

    const notes = [];
    const epsN = Number(d.episodeCount) || eps.length;
    const free = Number(d.freeEpisodeCount) || 0;
    if (epsN) notes.push(`${epsN}集`);
    if (free && free < 9000) notes.push(`免${free}集`);
    if (Array.isArray(d.tags) && d.tags.length) notes.push(d.tags.slice(0, 3).join('/'));

    const coverPic = pic(d.coverUrl);
    const desc = String(d.description || '蝴蝶影视超清短剧聚合，全网同步上新。');

    return {
        list: [
            {
                vod_id: id,
                vod_name: String(d.title || id),
                vod_pic: coverPic,
                vod_actor: '🦋 TG群: @tvshare23',
                vod_remarks: formatRemarks(notes.join(' · ')),
                vod_content: `【官方交流群: @tvshare23】\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${desc}`,
                vod_play_from: '蝴蝶专线$$全集秒播',
                vod_play_url: `${playBlock}$$$${playBlock}`,
            },
        ],
    };
}

async function play(inReq) {
    const { direct, flag } = unwrapPlayId(inReq.body.id || inReq.body.flag);
    if (direct) {
        return { parse: 0, url: direct, header: { 'User-Agent': UA, Referer: `${host}/` } };
    }
    const parts = String(flag || '').split('|');
    const did = parts[0]?.trim() || '';
    let epId = parts[1]?.trim() || '';
    let idx = parseInt(parts[2], 10) || 0;
    if (!did) return { parse: 0, url: '' };

    const { prefix, eps } = await fetchDrama(did);
    let target = '';
    for (const e of eps) {
        if (epId && e.id === epId) {
            if (!idx) idx = e.index;
            target = e.seo || seoUrl(prefix, e.index);
            break;
        }
    }
    if (!target && eps.length) {
        const e = eps[0];
        if (!idx) idx = e.index;
        if (!epId) epId = e.id;
        target = e.seo || seoUrl(prefix, idx);
    }
    if (!target && epId) target = await officialPlayUrl(did, epId);
    if (target && doProbe && !(await probeM3u8(target))) {
        const alt = epId ? await officialPlayUrl(did, epId) : '';
        if (alt) target = alt;
    }
    if (target && !/\.m3u8|\.mp4|\.flv|\.mkv|\.ts/i.test(target)) {
        target += (target.includes('?') ? '&' : '?') + 'format=.m3u8';
    }
    return { parse: 0, url: target || '', header: { 'User-Agent': UA, Referer: `${host}/` } };
}

async function search(inReq) {
    const kw = String(inReq.body.wd || '').trim();
    if (!kw) return { list: [] };
    const data = await apiGet(`/search?q=${encodeURIComponent(kw)}`);
    const arr = Array.isArray(data) ? data : data?.items || [];
    return { list: arr.map(toVod).filter(Boolean), page: 1, pagecount: 1 };
}

export default {
    meta: { key: '7maodj', name: '🦋七猫短剧', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
