import axios from 'axios';
import crypto from 'crypto';

const SITE = 'https://xiangjiaoai.ai';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DEVICE_ID = `nodejs-xjaidj-${crypto.randomBytes(6).toString('hex')}`;
const PAGE_SIZE = 50;

const BASE_CLASSES = [
    { type_id: 'home', type_name: '推荐' },
    { type_id: 'theater', type_name: '剧场' },
    { type_id: 'rank_hot', type_name: '热播榜' },
    { type_id: 'rank_new', type_name: '本周上新' },
    { type_id: 'rank_trending', type_name: '趋势榜' },
    { type_id: 'rank_reputation', type_name: '口碑榜' },
    { type_id: 'must', type_name: '必看' },
];

let guestToken = '';
let guestAt = 0;
let cachedCategories = null;

function siteHeaders(extra = {}) {
    return {
        'User-Agent': UA,
        Accept: 'application/json,text/plain,*/*',
        Referer: `${SITE}/`,
        Origin: SITE,
        ...extra,
    };
}

function parseExtend(raw) {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    try {
        const o = JSON.parse(String(raw));
        return o && typeof o === 'object' ? o : {};
    } catch {
        return {};
    }
}

async function apiGet(path) {
    const resp = await axios.get(path.startsWith('http') ? path : `${SITE}${path}`, {
        headers: siteHeaders(),
        timeout: 20000,
        validateStatus: () => true,
        family: 4,
    });
    if (resp.status >= 400) return null;
    const json = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
    return json?.data ?? null;
}

async function apiPost(path, body, auth = false) {
    const headers = siteHeaders({ 'Content-Type': 'application/json' });
    if (auth) {
        const token = await ensureGuest();
        if (token) headers.Authorization = `Bearer ${token}`;
    }
    const resp = await axios.post(`${SITE}${path}`, body, {
        headers,
        timeout: 20000,
        validateStatus: () => true,
        family: 4,
    });
    if (resp.status >= 400) return null;
    const json = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
    return json?.data ?? null;
}

async function ensureGuest() {
    if (guestToken && Date.now() - guestAt < 50 * 60 * 1000) return guestToken;
    const data = await apiPost('/api/guest-sessions', { device_id: DEVICE_ID });
    if (!data?.access_token) return '';
    guestToken = data.access_token;
    guestAt = Date.now();
    return guestToken;
}

async function loadCategories() {
    if (cachedCategories) return cachedCategories;
    const data = await apiGet('/api/categories');
    cachedCategories = Array.isArray(data) ? data : [];
    return cachedCategories;
}

function buildFilters(categories) {
    return [
        {
            key: 'category_id',
            name: '题材',
            value: [{ n: '全部', v: '' }].concat(
                categories.map((c) => ({ n: c.name, v: c.id })),
            ),
        },
        {
            key: 'sort',
            name: '排序',
            value: [
                { n: '默认', v: '' },
                { n: '热门', v: 'hot' },
                { n: '最新', v: 'new' },
            ],
        },
    ];
}

function dramaOf(it) {
    if (!it) return null;
    return it.drama || it;
}

function remarksOf(d) {
    if (!d) return '';
    const n = d.episode_count || d.latest_episode_number;
    const st =
        d.serial_status === 'completed' || d.serial_status === 'finished'
            ? '完结'
            : d.serial_status === 'serializing'
              ? '连载'
              : '';
    const heat = d.sort_score || d.heat;
    const parts = [];
    if (n) parts.push(`${st ? `${st}·` : ''}${n}集`);
    else if (st) parts.push(st);
    if (heat) parts.push(`${heat}热度`);
    return parts.join(' · ');
}

function toVod(it) {
    const d = dramaOf(it);
    if (!d?.id) return null;
    const score = it?.score;
    return {
        vod_id: d.id,
        vod_name: String(d.title || d.id),
        vod_pic: d.cover_url || '',
        vod_remarks: score ? `${score}热度 · ${remarksOf(d)}`.replace(/^ · /, '') : remarksOf(d),
    };
}

function itemsOf(data) {
    if (!data) return [];
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data)) return data;
    return [];
}

function pageMeta(data, page) {
    const total = Number(data?.total || 0);
    const pagecount = total ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 1;
    return {
        page: Number(page) || 1,
        pagecount,
        limit: PAGE_SIZE,
        total: total || itemsOf(data).length,
    };
}

async function fetchListPath(path, params, page) {
    const pg = Math.max(1, parseInt(page, 10) || 1);
    let cursor = null;
    let last = null;
    for (let i = 1; i <= pg; i++) {
        const q = new URLSearchParams(params);
        if (i === 1) q.set('page', '1');
        else if (cursor) q.set('cursor', cursor);
        else break;
        last = await apiGet(`${path}?${q}`);
        if (!last) return null;
        if (i === pg) return last;
        cursor = last.next_cursor;
        if (!cursor) return last;
    }
    return last;
}

async function listForType(tid, page, ext) {
    const category_id = ext.category_id || '';
    const sort = ext.sort || '';
    if (tid === 'home') {
        return apiGet('/api/home/hot');
    }
    if (tid === 'must') {
        return apiGet('/api/home/must-watch');
    }
    if (tid.startsWith('rank_')) {
        const type = tid.slice(5);
        return fetchListPath(`/api/rankings/${encodeURIComponent(type)}`, {}, page);
    }
    if (tid === 'theater' || tid.startsWith('cat_')) {
        const params = {};
        if (category_id || tid.startsWith('cat_')) {
            params.category_id = category_id || tid.slice(4);
        }
        if (sort) params.sort = sort;
        return fetchListPath('/api/theater', params, page);
    }
    return fetchListPath('/api/theater', {}, page);
}

async function init() {
    await loadCategories();
    return {};
}

async function home() {
    const categories = await loadCategories();
    const filters = {};
    for (const c of BASE_CLASSES) filters[c.type_id] = buildFilters(categories);
    for (const cat of categories) {
        const tid = `cat_${cat.id}`;
        filters[tid] = buildFilters(categories);
    }
    const classes = BASE_CLASSES.concat(
        categories.map((c) => ({ type_id: `cat_${c.id}`, type_name: c.name })),
    );
    const data = await apiGet('/api/home/hot');
    return { class: classes, filters, list: itemsOf(data).map(toVod).filter(Boolean) };
}

async function category(inReq) {
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const tid = String(inReq.body.id || 'home');
    const ext = parseExtend(inReq.body.extend || inReq.body.filters || inReq.body.filter);
    const data = await listForType(tid, page, ext);
    return { list: itemsOf(data).map(toVod).filter(Boolean), ...pageMeta(data, page) };
}

async function detail(inReq) {
    let id = inReq.body.id;
    if (Array.isArray(id)) id = id[0];
    id = String(id || '').trim();
    if (!id) return { list: [] };
    const drama = await apiGet(`/api/dramas/${encodeURIComponent(id)}`);
    const eps = await apiGet(`/api/dramas/${encodeURIComponent(id)}/episodes`);
    const epList = Array.isArray(eps) ? eps : [];
    const urls = epList
        .map((ep) => {
            const n = ep.episode_number || ep.number;
            if (!ep.id) return '';
            return `第${n}集$${ep.id}`;
        })
        .filter(Boolean);
    const tags = (drama?.tags || []).map((t) => t.name).filter(Boolean).join(',');
    return {
        list: [
            {
                vod_id: id,
                vod_name: drama?.title || id,
                vod_pic: drama?.cover_url || '',
                vod_content: drama?.description || '',
                vod_class: tags,
                vod_remarks: remarksOf(drama),
                vod_play_from: '香蕉短剧',
                vod_play_url: urls.join('#'),
            },
        ],
    };
}

function playHeaders() {
    return siteHeaders();
}

async function play(inReq) {
    let raw = String(inReq.body.id || '');
    if (raw.includes('$')) raw = raw.split('$').pop();
    if (/^https?:\/\//i.test(raw)) {
        return { parse: 0, url: raw, header: playHeaders() };
    }
    const episodeId = raw.trim();
    if (!episodeId) return { parse: 0, url: '' };
    const session = await apiPost('/api/playback/sessions', { episode_id: episodeId }, true);
    const url = session?.media?.manifest_url || '';
    return { parse: 0, url, header: playHeaders() };
}

async function search(inReq) {
    const kw = String(inReq.body.wd || '').trim();
    if (!kw) return { list: [] };
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const data = await fetchListPath('/api/search', { q: kw }, page);
    return { list: itemsOf(data).map(toVod).filter(Boolean), ...pageMeta(data, page) };
}

export default {
    meta: { key: 'xjaidj', name: '🍌香蕉短剧', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
