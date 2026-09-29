import req from '../../util/req.js';

const SITE = 'https://av.dugqsegfaed.cc';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const PAGE_SIZE = 20;

const SORT_OPTS = [
    { n: '最新', v: 'latest' },
    { n: '热门', v: 'hot' },
    { n: '月榜', v: 'monthly_popular' },
];

let catCache = {};
const listState = {};

function txt(s) {
    return String(s || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function abs(u) {
    if (!u) return '';
    if (u.startsWith('//')) return `https:${u}`;
    try {
        return new URL(u, `${SITE}/`).href;
    } catch {
        return u;
    }
}

function fmtDur(sec) {
    const n = parseInt(sec, 10);
    if (!Number.isFinite(n) || n <= 0) return '';
    const h = Math.floor(n / 3600);
    const m = Math.floor((n % 3600) / 60);
    const s = n % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function pageNo(v) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
}

function parseExtend(raw) {
    if (!raw) return {};
    if (typeof raw === 'string') {
        const text = raw.trim();
        if (!text) return {};
        try {
            return parseExtend(JSON.parse(text));
        } catch {
            const out = {};
            for (const part of text.split(/[&;]/)) {
                const [k, v] = part.split('=');
                if (k) out[decodeURIComponent(k.trim())] = decodeURIComponent((v || '').trim());
            }
            return out;
        }
    }
    if (Array.isArray(raw)) {
        const out = {};
        for (const item of raw) {
            if (!item || typeof item !== 'object') continue;
            const key = item.key || item.k || item.name;
            const val = item.value ?? item.v ?? item.id;
            if (key != null && val != null) out[String(key)] = String(val);
        }
        return out;
    }
    if (typeof raw === 'object') return raw;
    return {};
}

function parseLibTid(tid) {
    const parts = String(tid || '').split('@@');
    if (parts[0] !== 'lib' || !parts[1]) return null;
    return {
        slug: parts[1],
        cat: parts[2] || '',
        sort: parts[3] || '',
    };
}

function hasField(obj, keys) {
    return keys.some((k) => obj[k] != null && String(obj[k]).trim() !== '');
}

function pickCat(ext, fallback = '0') {
    const val = ext.cat ?? ext.category ?? ext.categoryId ?? ext.categoryIds ?? fallback;
    const text = String(val ?? '0').trim();
    return !text || text === '0' ? '0' : text.split(',')[0];
}

function pickSort(ext, fallback = 'latest') {
    return ext.sort ?? ext.order ?? fallback;
}

function resolveCatId(meta, cat) {
    const text = String(cat || '0').trim();
    if (!text || text === '0') return '0';
    if (/^\d+$/.test(text)) return text;
    for (const c of meta?.children || []) {
        const id = String(c.id ?? '');
        const slug = String(c.slug ?? '').trim();
        const name = String(c.categoryName || c.name || '').trim();
        if (text === id || text === slug || text === name) return id;
    }
    return text;
}

function mergeExtend(body) {
    const ext = parseExtend(body.filters || body.filter || body.extend);
    if (body.cat != null && body.cat !== '') ext.cat = body.cat;
    if (body.category != null && body.category !== '') ext.category = body.category;
    if (body.sort != null && body.sort !== '') ext.sort = body.sort;
    return ext;
}

function resolveLibQuery(slug, pg, ext, embedded) {
    const prev = listState[slug];
    const embeddedCat = embedded?.cat && embedded.cat !== '0' ? embedded.cat : '';
    const embeddedSort = embedded?.sort || '';
    let cat = embeddedCat || prev?.cat || '0';
    let sort = embeddedSort || prev?.sort || 'latest';

    if (hasField(ext, ['cat', 'category', 'categoryId', 'categoryIds'])) {
        cat = pickCat(ext, '0');
    }
    if (hasField(ext, ['sort', 'order'])) {
        sort = pickSort(ext, sort);
    }

    if (
        pg > 1 &&
        !hasField(ext, ['cat', 'category', 'categoryId', 'categoryIds']) &&
        prev
    ) {
        cat = prev.cat;
        if (!hasField(ext, ['sort', 'order'])) sort = prev.sort;
    }

    listState[slug] = { cat, sort };
    return { cat, sort };
}

function mapSort(sort) {
    const s = String(sort || 'latest').trim();
    if (s === 'hot') return 'popular';
    return s || 'latest';
}

async function request(url, { json = false, responseType } = {}) {
    const resp = await req.get(url, {
        headers: {
            'User-Agent': UA,
            Referer: `${SITE}/`,
            Accept: json ? 'application/json,*/*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        timeout: 20000,
        validateStatus: () => true,
        responseType: responseType || (json ? 'json' : 'text'),
    });
    if (resp.status < 200 || resp.status >= 400) return json ? null : '';
    return resp.data;
}

async function fetchJson(path) {
    const data = await request(`${SITE}${path}`, { json: true });
    return data?.data ?? data ?? null;
}

function mapVideoItem(item, prefix = 'v') {
    const id = item.id ?? item.videoId;
    if (!id) return null;
    const pic = abs(item.coverUrl || item.t || item.cover || '');
    const remark = txt(item.ct || fmtDur(item.durationSeconds) || item.code || '');
    return {
        vod_id: `${prefix}:${id}`,
        vod_name: txt(item.title || item.code || item.name || id),
        vod_pic: 'https://av.dugqsegfaed.cc/_img?u=' + encodeURIComponent(pic),
        vod_remarks: remark,
    };
}

function buildLibFilters(children = []) {
    const cats = [{ n: '全部', v: '0' }];
    for (const c of children) {
        cats.push({ n: c.categoryName || c.name, v: String(c.id) });
    }
    return [
        { key: 'sort', name: '排序', value: SORT_OPTS },
        { key: 'cat', name: '子分类', value: cats },
    ];
}

async function loadCategory(slug) {
    if (catCache[slug]) return catCache[slug];
    const data = await fetchJson(`/api/v1/category/${slug}`);
    catCache[slug] = data || { children: [] };
    return catCache[slug];
}

async function fetchLibraryList(slug, page, sort, cat) {
    const pg = pageNo(page);
    const meta = await loadCategory(slug);
    const catId = resolveCatId(meta, cat);
    const params = new URLSearchParams({
        sort: mapSort(sort),
        page: String(pg),
        size: String(PAGE_SIZE),
    });
    const rootId = String(meta?.id || '').trim();
    if (catId !== '0' && catId !== '') {
        params.append('categoryIds', catId);
    } else if (rootId) {
        params.append('categoryIds', rootId);
    } else {
        params.set('slug', slug);
    }
    const data = await fetchJson(`/api/v1/video/list?${params.toString()}`);
    const block = data?.videos || {};
    const total = block.total || 0;
    const list = (block.items || []).map((x) => mapVideoItem(x)).filter(Boolean);
    return {
        page: pg,
        pagecount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        limit: PAGE_SIZE,
        total,
        list,
    };
}

async function fetchCollectionList(id, page) {
    const pg = pageNo(page);
    const data = await fetchJson(`/api/v1/collection/${id}?page=${pg}&size=${PAGE_SIZE}`);
    const block = data?.detail?.videos || {};
    const total = block.total || 0;
    const list = (block.items || []).map((x) => mapVideoItem(x)).filter(Boolean);
    return {
        page: pg,
        pagecount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        limit: PAGE_SIZE,
        total,
        list,
    };
}

async function fetchShortList(page) {
    const pg = pageNo(page);
    const data = await fetchJson(`/api/v1/short-video/list?page=${pg}&size=${PAGE_SIZE}`);
    const block = data?.shortVideos || {};
    const total = block.total || 0;
    const list = (block.items || []).map((x) => mapVideoItem(x, 's')).filter(Boolean);
    return {
        page: pg,
        pagecount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        limit: PAGE_SIZE,
        total,
        list,
    };
}

async function fetchActressLibrary(page) {
    const pg = pageNo(page);
    const data = await fetchJson(`/api/v1/actress/library?page=${pg}&size=${PAGE_SIZE}`);
    const block = data?.items?.items ? data.items : data?.items || data;
    const items = block?.items || [];
    const total = block?.total || data?.total || items.length;
    const list = items.map((a) => ({
        vod_id: `act:${a.id}`,
        vod_name: txt(a.nameZh || a.nameJa || a.nameRomaji || a.id),
        vod_pic: abs(a.coverUrl || a.sourceImageUrl || ''),
        vod_remarks: `${a.workCount || 0}部`,
        vod_tag: 'folder',
    }));
    return {
        page: pg,
        pagecount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        limit: PAGE_SIZE,
        total,
        list,
    };
}

async function fetchActressVideos(id, page) {
    const pg = pageNo(page);
    const data = await fetchJson(`/api/v1/actress/${id}?page=${pg}&size=${PAGE_SIZE}`);
    const block = data?.detail?.videos || {};
    const total = block.total || 0;
    const list = (block.items || []).map((x) => mapVideoItem(x)).filter(Boolean);
    return {
        page: pg,
        pagecount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        limit: PAGE_SIZE,
        total,
        list,
    };
}

async function fetchCollectionFolder(page) {
    const pg = pageNo(page);
    const data = await fetchJson(`/api/v1/collection/list?page=${pg}&size=${PAGE_SIZE}`);
    const block = data?.collections || {};
    const total = block.total || 0;
    const list = (block.items || []).map((c) => ({
        vod_id: `col:${c.id}`,
        vod_name: txt(c.name || c.title),
        vod_pic: abs(c.coverUrl || ''),
        vod_remarks: `${c.videoCount || 0}部`,
        vod_tag: 'folder',
    }));
    return {
        page: pg,
        pagecount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        limit: PAGE_SIZE,
        total,
        list,
    };
}

async function fetchSearch(wd, page, sort = 'hot') {
    const pg = pageNo(page);
    const q = encodeURIComponent(String(wd || '').trim());
    if (!q) return { list: [] };
    const data = await fetchJson(`/api/v1/search?q=${q}&sort=${encodeURIComponent(sort)}&page=${pg}&size=${PAGE_SIZE}`);
    const block = data?.result?.videos || data?.videos || {};
    const list = (block.items || []).map((x) => mapVideoItem(x)).filter(Boolean);
    return { list };
}

function playUrl(sourceUrl) {
    if (!sourceUrl) return '';
    return abs(sourceUrl);
}

async function loadDetail(rawId) {
    const id = String(rawId || '');
    if (id.startsWith('s:')) {
        const data = await fetchJson(`/api/v1/short-video/${id.slice(2)}`);
        const d = data?.detail || data;
        if (!d) return null;
        return {
            vod_id: id,
            vod_name: txt(d.title),
            vod_pic: abs(d.coverUrl || ''),
            vod_remarks: fmtDur(d.durationSeconds),
            vod_content: txt(d.description || d.title),
            vod_play_from: 'AVPorn',
            vod_play_url: `播放$${playUrl(d.sourceUrl)}`,
        };
    }
    const vid = id.startsWith('v:') ? id.slice(2) : id;
    const data = await fetchJson(`/api/v1/video/${vid}`);
    const d = data?.detail || data;
    if (!d) return null;
    const actress = (d.actresses || []).map((a) => a.nameZh || a.nameJa).filter(Boolean).join(' / ');
    return {
        vod_id: id.startsWith('v:') ? id : `v:${vid}`,
        vod_name: txt(d.title || d.code),
        vod_pic: abs(d.coverUrl || ''),
        vod_remarks: txt([d.code, fmtDur(d.durationSeconds)].filter(Boolean).join(' | ')),
        vod_actor: actress,
        vod_content: txt(d.description || d.title),
        vod_play_from: 'AVPorn',
        vod_play_url: `播放$${playUrl(d.sourceUrl)}`,
    };
}

async function init(_inReq, _outResp) {
    catCache = {};
    for (const key of Object.keys(listState)) delete listState[key];
    return {};
}

async function home(_inReq, _outResp) {
    const [riben, guochan] = await Promise.all([loadCategory('riben-av'), loadCategory('guochan-av')]);
    const classes = [
        { type_id: 'lib@@riben-av', type_name: '日本AV' },
        { type_id: 'lib@@guochan-av', type_name: '国产精选' },
        { type_id: 'short@@list', type_name: 'AV解说' },
        { type_id: 'folder@@collection', type_name: '专题合集' },
        { type_id: 'folder@@actress', type_name: '女优库' },
    ];
    const filters = {
        'lib@@riben-av': buildLibFilters(riben.children || []),
        'lib@@guochan-av': buildLibFilters(guochan.children || []),
    };
    const latest = await fetchLibraryList('riben-av', 1, 'latest', 0);
    return { class: classes, filters, list: latest.list.slice(0, 20) };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || inReq.body.tid || '');
    const pg = pageNo(inReq.body.page);
    const ext = mergeExtend(inReq.body);

    if (tid.startsWith('lib@@')) {
        const embedded = parseLibTid(tid);
        const slug = embedded?.slug || tid.slice(5).split('@@')[0];
        const { cat, sort } = resolveLibQuery(slug, pg, ext, embedded);
        return fetchLibraryList(slug, pg, sort, cat);
    }
    if (tid.startsWith('col@@')) {
        return fetchCollectionList(tid.slice(5), pg);
    }
    if (tid.startsWith('short@@')) {
        return fetchShortList(pg);
    }
    if (tid.startsWith('act@@')) {
        return fetchActressVideos(tid.slice(5), pg);
    }
    if (tid.startsWith('folder@@')) {
        const folder = tid.slice(8);
        if (folder === 'collection') return fetchCollectionFolder(pg);
        if (folder === 'actress') return fetchActressLibrary(pg);
    }
    if (tid === 'folder_collection' || tid === 'collection') {
        return fetchCollectionFolder(pg);
    }
    if (tid === 'folder_actress' || tid === 'actress') {
        return fetchActressLibrary(pg);
    }
    return { page: pg, pagecount: 1, limit: PAGE_SIZE, total: 0, list: [] };
}

async function detail(inReq, _outResp) {
    const rawId = Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id;
    const id = String(rawId || '');

    if (id.startsWith('folder@@') || id === 'folder_collection' || id === 'folder_actress') {
        return category({ body: { id, page: 1 } }, _outResp);
    }
    if (id.startsWith('col:')) {
        return category({ body: { id: `col@@${id.slice(4)}`, page: 1 } }, _outResp);
    }
    if (id.startsWith('act:')) {
        return category({ body: { id: `act@@${id.slice(4)}`, page: 1 } }, _outResp);
    }

    const item = await loadDetail(id);
    if (!item) {
        return {
            list: [{
                vod_id: id,
                vod_name: '未找到',
                vod_play_from: 'AVPorn',
                vod_play_url: '',
            }],
        };
    }
    return { list: [item] };
}

async function play(inReq, _outResp) {
    const src = String(inReq.body.id || '');
    return {
        parse: 0,
        url: playUrl(src),
        header: {
            'User-Agent': UA,
            Referer: `${SITE}/`,
        },
    };
}

async function search(inReq, _outResp) {
    const wd = inReq.body.wd;
    const pg = pageNo(inReq.body.page);
    return fetchSearch(wd, pg, 'hot');
}

export default {
    meta: {
        key: 'avporn',
        name: '🌸AVPorn',
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
