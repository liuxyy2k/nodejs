import req from '../../util/req.js';

const DEFAULT_HOST = 'https://javxu.com';
const UA =
    'Mozilla/5.0 (Linux; Android 13; SGT-AL10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const TIMEOUT = 20000;
const RETRY = 2;
const INDEX_PAGE_SIZE = 100;
const INDEX_CACHE_TTL_MS = 600_000;

const CATS = [
    { type_id: 'home', type_name: '首页' },
    { type_id: 'chinese-subtitle', type_name: '中文字幕' },
    { type_id: 'recent-update', type_name: '最近更新' },
    { type_id: 'new-release', type_name: '新发布' },
    { type_id: 'uncensored', type_name: '未审查' },
    { type_id: 'uncensored-leaked', type_name: '泄露未审查' },
    { type_id: 'genres/vr', type_name: 'VR' },
    { type_id: 'actresses_hot', type_name: '热门女演员' },
    { type_id: 'trending', type_name: '热门' },
    { type_id: 'today-hot', type_name: '今日热门' },
    { type_id: 'weekly-hot', type_name: '本周热门' },
    { type_id: 'monthly-hot', type_name: '本月热门' },
    { type_id: 'playlists', type_name: '公开片单' },
    { type_id: 'genres_index', type_name: '类型' },
    { type_id: 'makers_index', type_name: '制作商' },
    { type_id: 'actresses_index', type_name: '演员' },
    { type_id: 'tags/siro', type_name: 'SIRO' },
    { type_id: 'tags/259luxu', type_name: 'LUXU' },
    { type_id: 'tags/200gana', type_name: '200GANA' },
    { type_id: 'tags/prestige-premium', type_name: 'PRESTIGE PREMIUM' },
    { type_id: 'tags/s-cute', type_name: 'S-CUTE' },
    { type_id: 'tags/261ara', type_name: 'ARA' },
    { type_id: 'tags/fc2', type_name: 'FC2' },
    { type_id: 'tags/heyzo', type_name: 'HEYZO' },
    { type_id: 'tags/tokyo-hot', type_name: 'Tokyo-Hot' },
    { type_id: 'tags/1pondo', type_name: '1pondo' },
    { type_id: 'tags/caribbeancom', type_name: 'Caribbeancom' },
    { type_id: 'tags/caribbeancompr', type_name: 'Caribbeancompr' },
    { type_id: 'tags/10musume', type_name: '10musume' },
    { type_id: 'tags/pacopacomama', type_name: 'pacopacomama' },
    { type_id: 'tags/gachig', type_name: 'Gachinco' },
    { type_id: 'tags/xxx-av', type_name: 'XXX-AV' },
    { type_id: 'tags/c0930', type_name: 'C0930' },
    { type_id: 'tags/h0930', type_name: 'H0930' },
    { type_id: 'tags/h4610', type_name: 'H4610' },
];

const LIST_PATH = {
    home: '/zh/',
    'chinese-subtitle': '/zh/chinese-subtitle',
    'recent-update': '/zh/recent-update',
    'new-release': '/zh/new-release',
    uncensored: '/zh/uncensored',
    'uncensored-leaked': '/zh/uncensored-leaked',
    'genres/vr': '/zh/genres/vr',
    trending: '/zh/trending',
    'today-hot': '/zh/today-hot',
    'weekly-hot': '/zh/weekly-hot',
    'monthly-hot': '/zh/monthly-hot',
};

let extConfig = {};
const indexCache = new Map();

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

function host() {
    const h = extConfig.host || DEFAULT_HOST;
    return String(h).replace(/\/$/, '');
}

function cookieHeader() {
    let ck = '_slide_passed=1';
    const extra = extConfig.cookie;
    if (extra) {
        const s = String(extra).trim();
        ck = s.includes('_slide_passed') ? s : `${ck}; ${s}`;
    }
    return ck;
}

function normPg(pg, fallback = 1) {
    const n = parseInt(String(pg ?? ''), 10);
    return Number.isFinite(n) && n >= 1 ? n : fallback;
}

function txtOf(s) {
    return String(s || '')
        .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function unwrapPic(u) {
    if (!u) return '';
    let url = String(u).trim();
    for (let i = 0; i < 4; i++) {
        const m = url.match(/\/base\/([A-Za-z0-9+/=]+)\.cache/);
        if (!m) break;
        try {
            const d = Buffer.from(m[1], 'base64').toString('utf8');
            if (d.startsWith('http')) url = d;
            else break;
        } catch {
            break;
        }
    }
    if (url.includes('placeholder')) return '';
    return url;
}

function unwrapPage(text) {
    if (!text) return '';
    const head = String(text).slice(0, 300);
    if (head.includes('document.write(')) {
        const m = String(text).match(/\("([0-9a-f]{200,})"/);
        if (m) {
            try {
                return Buffer.from(m[1], 'hex').toString('utf8');
            } catch {
                /* keep */
            }
        }
    }
    return String(text);
}

function pageUrl(path, pg) {
    const p = normPg(pg);
    const h = host();
    if (p <= 1) return `${h}${path}`;
    const sep = path.includes('?') ? '&' : '?';
    return `${h}${path}${sep}page=${p}`;
}

function totalPages(html) {
    const m = String(html || '').match(/data-total-pages="(\d+)"/);
    return m ? parseInt(m[1], 10) : 0;
}

function normZhPath(href) {
    let h = String(href || '').trim();
    if (h.startsWith('/v/')) h = `/zh${h}`;
    try {
        const u = new URL(h, host());
        return u.pathname;
    } catch {
        return h.split('?')[0];
    }
}

async function fetchPage(url, referer) {
    const ref = referer || `${host()}/zh/`;
    for (let attempt = 0; attempt < RETRY; attempt++) {
        try {
            const r = await req.get(url, {
                headers: {
                    'User-Agent': UA,
                    Referer: ref,
                    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'zh-CN,zh;q=0.9',
                    Cookie: cookieHeader(),
                },
                timeout: TIMEOUT,
                validateStatus: (s) => s === 200 || s === 404,
            });
            if (r.data) return unwrapPage(String(r.data));
        } catch {
            /* retry */
        }
        await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
    }
    return '';
}

async function fetchJson(url, referer) {
    const text = await fetchPage(url, referer);
    if (!text) return {};
    try {
        const d = JSON.parse(text);
        return d && typeof d === 'object' ? d : {};
    } catch {
        return {};
    }
}

function parseCards(pageHtml) {
    const out = [];
    const seen = new Set();
    if (!pageHtml) return out;
    for (const chunk of String(pageHtml).split('<div class="movie-item">').slice(1)) {
        const m = chunk.match(/<a href="([^"]+)" class="thumb"/);
        if (!m) continue;
        const path = normZhPath(m[1].replace(/&amp;/g, '&'));
        if (!path.startsWith('/zh/v/') || seen.has(path)) continue;
        seen.add(path);
        let pic = '';
        const pm = chunk.match(/<img class="preview-cover"[^>]+src="([^"]+)"/);
        if (pm) pic = unwrapPic(pm[1].replace(/&amp;/g, '&'));
        const tm = chunk.match(/<div class="title">([\s\S]*?)<\/div>/);
        const title = tm ? txtOf(tm[1]) : '';
        const nm = chunk.match(/class="name">([^<]+)<\/a>/);
        const code = nm ? nm[1].trim() : path.split('/').pop();
        let dur = '';
        const dm = chunk.match(/fa-clock"><\/i>\s*([^<]+)/);
        if (dm) dur = dm[1].trim();
        out.push({
            vod_id: path,
            vod_name: title || code,
            vod_pic: pic,
            vod_remarks: dur,
        });
    }
    return out;
}

function parseIndexEntries(pageHtml, kind) {
    const out = [];
    const seen = new Set();
    if (!pageHtml) return out;
    const pat = new RegExp(`^/zh/${kind}/[^/?#]+$`);
    for (const chunk of String(pageHtml).split('bl-item').slice(1)) {
        const m = chunk.match(/<a href="([^"]+)"/);
        if (!m) continue;
        const path = normZhPath(m[1].replace(/&amp;/g, '&'));
        if (!pat.test(path) || seen.has(path)) continue;
        const nm = chunk.match(/<div class="name">([^<]+)<\/div>/);
        if (!nm) continue;
        seen.add(path);
        const name = nm[1].trim();
        const cm = chunk.match(/<div class="text-muted">([^<]+)<\/div>/);
        const remarks = cm ? cm[1].trim() : '';
        let pic = '';
        const pm = chunk.match(/<img[^>]+src="([^"]+)"/);
        if (pm) {
            pic = unwrapPic(pm[1].replace(/&amp;/g, '&'));
            if (pic && !pic.startsWith('http')) pic = '';
        }
        out.push({
            vod_id: path,
            vod_name: name,
            vod_pic: pic,
            vod_tag: 'folder',
            vod_remarks: remarks,
        });
    }
    return out;
}

async function indexAll(kind) {
    const now = Date.now();
    const ent = indexCache.get(kind);
    if (ent && now - ent[0] < INDEX_CACHE_TTL_MS) return ent[1];
    const path = kind === 'genres' ? '/zh/genres' : '/zh/makers';
    const html = await fetchPage(`${host()}${path}`);
    const items = parseIndexEntries(html, kind);
    indexCache.set(kind, [now, items]);
    return items;
}

function parseVideoConfig(html) {
    const cfg = {};
    const cm = String(html || '').match(/window\.videoConfig\s*=\s*\{([\s\S]*?)\};/);
    if (!cm) return cfg;
    const block = cm[1];
    for (const key of ['fanhao', 'url', 'img', 'title']) {
        const km = block.match(new RegExp(`${key}:\\s*"([^"]*)"`));
        if (km) cfg[key] = km[1].replace(/&amp;/g, '&');
    }
    return cfg;
}

async function init(inReq) {
    extConfig = parseExtend(inReq?.body?.extend);
    return {};
}

async function home() {
    const html = await fetchPage(`${host()}/zh/`);
    return { class: CATS, list: parseCards(html) };
}

async function category(inReq) {
    const pg = normPg(inReq.body.page || inReq.body.pg);
    let tid = String(inReq.body.id || inReq.body.tid || 'home');

    if (tid === 'genres_index' || tid === 'makers_index') {
        const kind = tid === 'genres_index' ? 'genres' : 'makers';
        const allItems = await indexAll(kind);
        const total = allItems.length;
        const pc = Math.max(1, Math.ceil(total / INDEX_PAGE_SIZE));
        const items = allItems.slice((pg - 1) * INDEX_PAGE_SIZE, pg * INDEX_PAGE_SIZE);
        return { list: items, page: pg, pagecount: pc, limit: items.length, total };
    }

    if (tid === 'actresses_index' || tid === 'actresses_hot') {
        const path = tid === 'actresses_hot' ? '/zh/actresses?sort=most_viewed_today' : '/zh/actresses';
        const html = await fetchPage(pageUrl(path, pg));
        const items = parseIndexEntries(html, 'actresses');
        let pc = totalPages(html);
        if (!pc) pc = items.length >= 24 ? pg + 1 : pg;
        return { list: items, page: pg, pagecount: pc, limit: items.length, total: 999999 };
    }

    if (tid === 'playlists') {
        const url = `${host()}/member-api/playlists/public?page=${pg}&limit=20&sort=latest`;
        const data = await fetchJson(url, `${host()}/zh/playlists`);
        const d = data.data || {};
        const items = [];
        for (const it of d.items || []) {
            const pid = it.id;
            if (pid == null) continue;
            const name = String(it.name || '').trim() || `片单 ${pid}`;
            let pic = '';
            const previews = it.preview_items || [];
            if (previews.length) pic = unwrapPic(previews[0].thumbnail_loc || '');
            let remarks = `${it.video_count || 0} 部影片`;
            if (it.username) remarks += ` · ${it.username}`;
            items.push({
                vod_id: `playlist:${pid}`,
                vod_name: name,
                vod_pic: pic,
                vod_tag: 'folder',
                vod_remarks: remarks,
            });
        }
        const pc = parseInt(d.totalPages, 10) || (items.length ? pg : pg);
        return {
            list: items,
            page: pg,
            pagecount: pc,
            limit: items.length,
            total: parseInt(d.total, 10) || 999999,
        };
    }

    if (tid.startsWith('playlist:')) {
        const pid = tid.split(':', 2)[1];
        const url = `${host()}/member-api/playlists/videos/list?id=${encodeURIComponent(pid)}&page=${pg}&limit=20`;
        const data = await fetchJson(url, `${host()}/zh/playlists`);
        const d = data.data || {};
        const items = [];
        for (const it of d.items || []) {
            let href = it.href || '';
            if (href.startsWith('/v/')) href = `/zh${href}`;
            let path = normZhPath(href);
            if (!path.startsWith('/zh/v/')) {
                const rid = it.resource_id;
                if (!rid) continue;
                path = `/zh/v/${rid}`;
            }
            items.push({
                vod_id: path,
                vod_name: it.title || path,
                vod_pic: unwrapPic(it.thumbnail_loc || ''),
                vod_remarks: it.duration || '',
            });
        }
        const pc = parseInt(d.totalPages, 10) || (items.length ? pg : pg);
        return {
            list: items,
            page: pg,
            pagecount: pc,
            limit: items.length,
            total: parseInt(d.total, 10) || 999999,
        };
    }

    let path;
    if (tid.startsWith('/')) path = tid;
    else if (LIST_PATH[tid]) path = LIST_PATH[tid];
    else if (tid.includes('/')) path = `/zh/${tid}`;
    else path = '/zh/';

    const html = await fetchPage(pageUrl(path, pg));
    const items = parseCards(html);
    if (tid === 'home') {
        return { list: items, page: pg, pagecount: 1, limit: items.length, total: items.length };
    }
    const per = path.includes('/actresses/') ? 12 : 20;
    let pc = totalPages(html);
    if (!pc) pc = items.length >= per ? pg + 1 : pg;
    return { list: items, page: pg, pagecount: pc, limit: items.length, total: 999999 };
}

async function detail(inReq) {
    let vid = String(Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id || '').trim();
    if (vid.includes(',')) vid = vid.split(',')[0].trim();
    if (vid.startsWith('/v/')) vid = `/zh${vid}`;
    const pageUrlFull = vid.startsWith('http') ? vid : `${host()}${vid}`;
    const html = await fetchPage(pageUrlFull);

    const vod = {
        vod_id: vid,
        vod_name: vid,
        vod_pic: '',
        vod_content: '',
        vod_play_from: '',
        vod_play_url: '',
    };
    if (!html) return { list: [vod] };

    const cfg = parseVideoConfig(html);
    let title = cfg.title || '';
    if (!title) {
        const hm = html.match(/<h2 class="title">([\s\S]*?)<\/h2>/);
        title = hm ? txtOf(hm[1]) : '';
    }
    vod.vod_name = title || vid;
    if (cfg.img) vod.vod_pic = unwrapPic(cfg.img);
    if (!vod.vod_pic) {
        const pm = html.match(/id="player" data-poster="([^"]+)"/);
        if (pm) vod.vod_pic = unwrapPic(pm[1].replace(/&amp;/g, '&'));
    }

    const fields = {};
    const actors = [];
    const genres = [];
    for (const dm of html.matchAll(
        /<div>\s*<span>([^<]+):<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<\/div>/g,
    )) {
        const label = dm[1].trim();
        const body = dm[2];
        const links = [...body.matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map((x) => txtOf(x[1]));
        fields[label] = links.length ? links.join(', ') : txtOf(body);
        if (label === '女演员') {
            actors.push(...(links.length ? links : fields[label] ? [fields[label]] : []));
        } else if (label === '类型') {
            genres.push(...links);
        }
    }
    if (actors.length) vod.vod_actor = actors.join(', ');

    const info = [];
    for (const label of ['代码', '发布日期', '时长', '女演员', '类型', '制作人']) {
        if (fields[label]) info.push(`${label}: ${fields[label]}`);
    }
    vod.vod_content = info.join(' | ');
    if (fields['时长']) vod.vod_remarks = fields['时长'];
    const ym = (fields['发布日期'] || '').match(/(\d{4})-/);
    if (ym) vod.vod_year = ym[1];

    const code = cfg.fanhao || fields['代码'] || vid.split('/').pop();
    vod.vod_play_from = 'JavXu';
    vod.vod_play_url = `${code}$${pageUrlFull}`;
    return { list: [vod] };
}

async function search(inReq) {
    const pg = normPg(inReq.body.page || inReq.body.pg);
    const kw = String(inReq.body.wd || '').trim();
    const path = `/zh/search?keyword=${encodeURIComponent(kw)}`;
    const html = await fetchPage(pageUrl(path, pg));
    const items = parseCards(html);
    let pc = totalPages(html);
    if (!pc) pc = items.length >= 20 ? pg + 1 : pg;
    return { list: items, page: pg, pagecount: pc };
}

async function play(inReq) {
    const header = { 'User-Agent': UA, Referer: `${host()}/zh/` };
    let pid = String(inReq.body.id || '').trim();
    if (pid.includes('$')) {
        const parts = pid.split('$');
        pid = parts[1] || parts[0];
    }
    pid = pid.trim();
    if (pid.startsWith('/v/')) pid = `/zh${pid}`;
    if (!pid) return { parse: 0, url: '', header };

    const url = pid.startsWith('http') ? pid : `${host()}${pid}`;
    const html = await fetchPage(url);
    const cfg = parseVideoConfig(html);
    if (cfg.url) {
        return { parse: 0, url: cfg.url, header };
    }
    return { parse: 1, url, header };
}

async function proxyHandler(inReq, reply) {
    const target = decodeURIComponent(String(inReq.query.url || inReq.query.u || '').trim());
    if (!/^https?:\/\//i.test(target)) {
        return reply.code(404).type('text/plain').send('');
    }
    try {
        const r = await req.get(target, {
            headers: {
                'User-Agent': UA,
                Referer: `${host()}/zh/`,
                Accept: '*/*',
                Cookie: cookieHeader(),
            },
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
        key: 'javxu',
        name: '🌸JavXu',
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
