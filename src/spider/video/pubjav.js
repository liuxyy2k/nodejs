import http from 'http';
import os from 'os';
import { pathToFileURL } from 'url';
import req from '../../util/req.js';

/**
 * PubJav 解析插件  (meta.type = 3)
 *
 * 站点：https://pubjav.com
 *
 * 站点结构（实测）：
 *   最近更新   /movies                 分页 /movies/pg-N
 *   排序       /movies?sort=hot        分页 /movies/pg-N?sort=hot 形式见 buildPageUrl
 *   筛选       /movies?genre=censored|uncensored|amateur
 *   分类       /genre/{slug}           分页 /genre/{slug}/pg-N
 *   详情+播放  /play/{slug}
 *   搜索       POST /ajax/search       { q, page }  → JSON hits / totalPages
 *
 * 片源链路（三层，逐层剥）：
 *   1) 详情页内联 <script> 给出 filmId、window.__pt(一次性 token)、window.__pk(xor key)
 *   2) POST /ajax/player  { episode:线路ID, filmId, pt }  → { player_enc, next_pt, next_pk }
 *      player_enc = base64(xor(html, __pk))，解出来是 <iframe src="第三方播放壳">
 *   3) 播放壳 f4scdn.com/e/{id} → data-api="/api/play/{vid}"
 *      GET /api/play/{vid}?ab=0&r=<嵌入页>  → { url, src, expires_in }
 *      src 就是 master playlist（*.txt，HLS 单档 720p），分片为明文 MPEG-TS（.png 伪装）
 *
 * 两个关键约束（实测）：
 *   - playlist 与**每个分片**都要求请求头 Origin: https://f4scdn.com，缺了直接 403；
 *     播放器自己不会发这个头，所以默认走插件内置代理，由代理补头。
 *   - src 带短时效（expires_in=300）。签名里 uuid 路径是稳定的，换签只换域名/令牌，
 *     所以代理遇到 403/404 时按「相同相对路径 + 新 base」重签重试即可，不打断播放。
 *
 * ext 可选配置：
 *   site       换镜像域名，如 https://别的.com
 *   proxy      local(默认) | auto | direct
 *              local  = 走插件内置代理（推荐，补 Origin + 重签 + 透传 Range）
 *              direct = 直接把上游地址交给播放器（要求播放器会把 header 带上去）
 *              auto   = 探测上游是否可直接播，能直连就直连，否则走代理
 *   proxyHost  播放器访问不到壳子给的 Host 时手填（如 192.168.1.10）
 *   proxyPort  固定本地代理端口，默认随机
 *   ttl        详情/分类缓存秒数，默认 300
 *   timeout    上游超时毫秒，默认 20000
 *   httpProxy  需要经代理出网时填，如 http://127.0.0.1:7890（也认环境变量）
 */

const VERSION = '1.0.0';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const DEFAULT_SITE = 'https://pubjav.com';
const PAGE_SIZE = 24;
const F4_ORIGIN = 'https://f4scdn.com';

let site = DEFAULT_SITE;
const cfg = {
    proxy: 'local',
    proxyHost: '',
    proxyPort: 0,
    ttl: 300,
    timeout: 20000,
    httpProxy: '',
};

/* ────────────────────────────── 小工具 ────────────────────────────── */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();

function intOf(v, def) {
    const n = parseInt(String(v == null ? '' : v).replace(/[^\d-]/g, ''), 10);
    return Number.isFinite(n) ? n : def;
}

function unescapeHtml(s) {
    return String(s || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
        .replace(/&nbsp;/g, ' ');
}

function stripTags(s) {
    return unescapeHtml(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function absUrl(p, base) {
    const raw = String(p || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return 'https:' + raw;
    try { return new URL(raw, base || site + '/').href; } catch { return raw; }
}

function b64url(s) {
    return Buffer.from(String(s), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s) {
    const t = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(t, 'base64').toString('utf8');
}

/* ────────────────────────────── HTTP 层（req.js） ────────────────────────────── */

let outboundAgents = { key: '', httpAgent: undefined, httpsAgent: undefined };

function proxyUrl() {
    return cfg.httpProxy || process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || '';
}

async function ensureOutboundAgents() {
    const p = proxyUrl();
    if (!p) return { httpAgent: undefined, httpsAgent: undefined };
    if (outboundAgents.key === p) return outboundAgents;
    outboundAgents = { key: p, httpAgent: undefined, httpsAgent: undefined };
    try {
        const mod = await import('https-proxy-agent');
        const Ctor = mod.HttpsProxyAgent || (mod.default && mod.default.HttpsProxyAgent) || mod.default;
        if (Ctor) {
            const agent = new Ctor(p);
            outboundAgents = { key: p, httpAgent: agent, httpsAgent: agent };
        }
    } catch { /* 无代理组件则直连 */ }
    return outboundAgents;
}

async function rawRequest(url, opts = {}) {
    const agents = await ensureOutboundAgents();
    const headers = Object.assign({
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
    }, opts.headers || {});

    const config = {
        method: opts.method || 'GET',
        url,
        headers,
        timeout: opts.timeout || cfg.timeout,
        validateStatus: () => true,
        responseType: 'arraybuffer',
        maxRedirects: 0,
        proxy: false,
        httpAgent: agents.httpAgent,
        httpsAgent: agents.httpsAgent,
    };
    if (opts.body != null) {
        config.data = Buffer.isBuffer(opts.body) ? opts.body : Buffer.from(String(opts.body));
    }

    const r = await req(config);
    return {
        status: r.status,
        headers: r.headers,
        body: Buffer.from(r.data || []),
    };
}

/** 带重定向的请求，失败自动重试 */
async function fetchUrl(url, opts = {}) {
    const tries = opts.retry == null ? 2 : opts.retry;
    let lastErr = null;
    for (let i = 0; i <= tries; i++) {
        try {
            let cur = url;
            let method = opts.method || 'GET';
            let body = opts.body;
            for (let hop = 0; hop < 5; hop++) {
                const r = await rawRequest(cur, Object.assign({}, opts, { method, body }));
                const loc = r.headers && r.headers.location;
                if (r.status >= 300 && r.status < 400 && loc) {
                    cur = absUrl(loc, cur);
                    if (r.status !== 307 && r.status !== 308) { method = 'GET'; body = null; }
                    continue;
                }
                return { status: r.status, headers: r.headers, body: r.body, url: cur };
            }
            throw new Error('too many redirects');
        } catch (e) {
            lastErr = e;
            if (i < tries) await sleep(250 * (i + 1));
        }
    }
    throw lastErr;
}

async function getText(url, opts = {}) {
    const r = await fetchUrl(url, opts);
    return { status: r.status, text: r.body.toString('utf8'), url: r.url, headers: r.headers };
}

function siteHeaders(extra) {
    return Object.assign({
        'User-Agent': UA,
        'Referer': site + '/',
        'Accept-Language': 'en-US,en;q=0.9',
    }, extra || {});
}

/* ────────────────────────────── 解析 ────────────────────────────── */

/** 列表卡片 */
function parseCards(html) {
    const out = [];
    const seen = new Set();
    const marks = [];
    const re = /class="ml-item"/g;
    let m;
    while ((m = re.exec(html))) marks.push(m.index);
    for (let i = 0; i < marks.length; i++) {
        const block = html.slice(marks[i], i + 1 < marks.length ? marks[i + 1] : Math.min(html.length, marks[i] + 4000));
        const a = block.match(/<a[^>]+href="\/play\/([^"']+)"[^>]*>/i);
        if (!a) continue;
        const slug = a[1];
        if (seen.has(slug)) continue;
        seen.add(slug);

        const titleAttr = a[0].match(/title="([^"]*)"/i);
        const pic =
            (block.match(/data-original="([^"]+)"/i) || [])[1] ||
            (block.match(/<img[^>]+src="([^"]+)"/i) || [])[1] || '';
        const h2 = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
        let name = titleAttr ? unescapeHtml(titleAttr[1]) : (h2 ? stripTags(h2[1]) : '');
        if (!name && h2) name = stripTags(h2[1]);

        const code = stripTags((block.match(/class="mli-code"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '');
        const runtime = stripTags((block.match(/class="mli-runtimes"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '');
        const hd = /class="mli-quality-hd"/.test(block);

        const bits = [];
        if (code) bits.push(code);
        if (runtime) bits.push(runtime + '分钟');
        if (!code && hd) bits.push('HD');

        out.push({
            vod_id: slug,
            vod_name: name || code || slug,
            vod_pic: absUrl(pic),
            vod_remarks: bits.join(' · '),
        });
    }
    return out;
}

/** 详情页：字段 + 线路 + 签名素材 */
function parseDetail(html) {
    const d = {
        title: '',
        code: '',
        pic: '',
        intro: '',
        info: {},
        actors: [],
        genres: [],
        filmId: '',
        pt: '',
        pk: '',
        lines: [],
    };

    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1) d.title = stripTags(h1[1]);

    const fakeCover = (html.match(/id="clickfakeplayer"[\s\S]{0,600}?<img[^>]+src="([^"]+)"/i) || [])[1] || '';
    const imggle = (html.match(/https:\/\/cdn001\.imggle\.net\/[^"'\s]+/i) || [])[0] || '';
    d.pic =
        fakeCover ||
        imggle ||
        (html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) || [])[1] ||
        (html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i) || [])[1] || '';

    const fid = html.match(/filmId\s*=\s*(\d+)/);
    if (fid) d.filmId = fid[1];
    const pt = html.match(/__pt\s*=\s*["']([^"']+)["']/);
    if (pt) d.pt = pt[1];
    const pk = html.match(/__pk\s*=\s*["']([^"']+)["']/);
    if (pk) d.pk = pk[1];

    // 信息块（Code / Runtime / Studio / Genre(s) ...）
    const descBlock = (html.match(/class="mvic-desc[\s\S]*?(?=<div class="mvic-intro"|<\/div>\s*<\/div>\s*<\/div>)/i) || [html])[0];
    const grab = (label) => {
        const re = new RegExp(label + '\\s*:\\s*(?:<[^>]*>\\s*)*([\\s\\S]{0,300}?)(?:<\\/p>|<\\/h3>|<br)', 'i');
        const m = descBlock.match(re) || html.match(re);
        return m ? stripTags(m[1]) : '';
    };
    d.info.code = grab('Code');
    d.info.contentId = grab('Content ID');
    d.info.released = grab('Released Date');
    d.info.runtime = grab('Runtime');
    d.info.version = grab('Version');
    d.info.studio = grab('Studio');
    d.info.director = grab('Director');
    d.info.label = grab('Label');
    d.info.actors = grab('Actor\\(s\\)');
    d.info.genres = grab('Genre\\(s\\)');
    const views = html.match(/Views:\s*([\d.,]+[KMB]?)/i);
    if (views) d.info.views = views[1];
    d.code = d.info.code || (d.title.match(/^([A-Z0-9]+-[\w-]+)/i) || [])[1] || '';

    for (const m of descBlock.matchAll(/<a[^>]+href="\/actor\/[^"]+"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const n = stripTags(m[1]);
        if (n && !d.actors.includes(n)) d.actors.push(n);
    }
    for (const m of descBlock.matchAll(/<a[^>]+href="\/genre\/[^"]+"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const n = stripTags(m[1]);
        if (n && !d.genres.includes(n)) d.genres.push(n);
    }

    const intro = html.match(/class="mvic-intro"[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/i);
    if (intro) d.intro = stripTags(intro[1]);
    if (!d.intro) {
        const meta = html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i);
        if (meta) d.intro = unescapeHtml(meta[1]);
    }

    // 线路按钮：<button class="switch-source ..." data-source="16951759" data-id="4305421"><i ...></i> F4</button>
    const lineRe = /<button[^>]+class="switch-source[^"]*"[^>]*data-source="(\d+)"[^>]*data-id="(\d+)"[^>]*>([\s\S]*?)<\/button>/gi;
    for (const m of html.matchAll(lineRe)) {
        const name = stripTags(m[3]) || ('线路' + (d.lines.length + 1));
        if (d.lines.some((x) => x.id === m[2])) continue;
        d.lines.push({ id: m[2], name, filmId: m[1] });
    }
    if (!d.lines.length) {
        // 容错：属性顺序不同的写法
        const alt = /<button[^>]+data-id="(\d+)"[^>]*data-source="(\d+)"[^>]*>([\s\S]*?)<\/button>/gi;
        for (const m of html.matchAll(alt)) {
            const name = stripTags(m[3]) || ('线路' + (d.lines.length + 1));
            d.lines.push({ id: m[1], name, filmId: m[2] });
        }
    }
    return d;
}

/** 播放接口密文 → 播放壳 html */
function xorDecode(enc, key) {
    if (!enc || !key) return '';
    const raw = Buffer.from(String(enc), 'base64').toString('latin1');
    const k = String(key);
    let out = '';
    for (let i = 0; i < raw.length; i++) out += String.fromCharCode(raw.charCodeAt(i) ^ k.charCodeAt(i % k.length));
    return out;
}

function pickEmbed(html) {
    const m = String(html).match(/<(?:iframe|embed)[^>]+src=["']([^"']+)["']/i);
    return m ? unescapeHtml(m[1]) : '';
}

/* ────────────────────────────── 数据层 ────────────────────────────── */

const detailCache = new Map();
const catsCache = { at: 0, list: [] };
const sessions = new Map(); // sid -> { slug, epi, base, master, origin, at, expire, signing }

function cacheGet(map, key, ttlMs) {
    const v = map.get(key);
    if (!v) return null;
    if (now() - v.at > ttlMs) { map.delete(key); return null; }
    return v.data;
}
function cacheSet(map, key, data) {
    map.set(key, { at: now(), data });
    if (map.size > 300) {
        const k = map.keys().next().value;
        map.delete(k);
    }
}

function applyExt(inReq) {
    const body = (inReq && inReq.body) || {};
    const ext = (inReq && (inReq.ext || inReq.body?.ext)) || body.ext || {};
    let e = ext;
    if (!e || typeof e !== 'object') e = {};
    if (typeof e === 'string') {
        try { e = JSON.parse(e); } catch { e = {}; }
    }
    if (e.site) site = String(e.site).replace(/\/+$/, '');
    if (e.proxy) cfg.proxy = String(e.proxy).toLowerCase();
    if (e.proxyHost) cfg.proxyHost = String(e.proxyHost);
    if (e.proxyPort) cfg.proxyPort = intOf(e.proxyPort, 0);
    if (e.ttl) cfg.ttl = intOf(e.ttl, cfg.ttl);
    if (e.timeout) cfg.timeout = intOf(e.timeout, cfg.timeout);
    if (e.httpProxy !== undefined) {
        const next = String(e.httpProxy || '');
        if (next !== cfg.httpProxy) outboundAgents = { key: '', httpAgent: undefined, httpsAgent: undefined };
        cfg.httpProxy = next;
    }
    return e;
}

/* ────────────────────────────── 业务 ────────────────────────────── */

const GENRES = [
    ['reducing-mosaic', '🔞 去码'],
    ['uncensored-leaked', '🔓 无码流出'],
    ['amateur', '📱 素人'],
    ['av-idol', '⭐ AV女优'],
    ['beautiful-girl', '💃 美少女'],
    ['big-tits', '🍈 巨乳'],
    ['big-asses', '🍑 美尻'],
    ['anal', '🔻 肛门'],
    ['blowjob', '💋 口交'],
    ['bondage', '⛓ 束缚'],
    ['bukkake', '💦 颜射'],
    ['cheating-wife', '💔 出轨妻子'],
    ['cosplay', '🎭 角色扮演'],
    ['creampie', '🥧 内射'],
    ['cumshot', '🎯 射精'],
    ['beautiful-pussy', '🌸 美穴'],
];

async function init(inReq) {
    applyExt(inReq);
    return {
        class: [
            { type_id: '/movies', type_name: '🆕 最近更新' },
            { type_id: '/movies?sort=hot', type_name: '🔥 最热' },
            { type_id: '/movies?genre=censored', type_name: '🈶 有码' },
            { type_id: '/movies?genre=uncensored', type_name: '🈚 无码' },
            { type_id: '/movies?genre=amateur', type_name: '📱 素人专区' },
            ...GENRES.map(([slug, name]) => ({ type_id: '/genre/' + slug, type_name: name })),
        ],
        filters: {},
    };
}

function buildPageUrl(path, page) {
    const p = String(path || '/movies');
    if (page <= 1) return site + p;
    if (p.includes('?')) return site + p + (/\bpg=/.test(p) ? '' : '&pg=' + page);
    return site + p.replace(/\/+$/, '') + '/pg-' + page;
}

function parsePageCount(html, page) {
    let max = page;
    for (const m of html.matchAll(/[?&]pg=(\d+)/g)) {
        const n = intOf(m[1], 0);
        if (n > max) max = n;
    }
    for (const m of html.matchAll(/\/pg-(\d+)/g)) {
        const n = intOf(m[1], 0);
        if (n > max) max = n;
    }
    // 站点自己的「Last」经常给到不存在的深页（实测 /movies Last=12714 却是 404），
    // 所以只放滑动窗口，翻到空页/404 时由 category() 收敛回真实末页
    return Math.max(page, Math.min(max, page + 50));
}

async function home(inReq) {
    applyExt(inReq);
    try {
        const r = await getText(site + '/', { headers: siteHeaders() });
        if (r.status !== 200) return { class: [] };
        const html = r.text;
        const secs = [
            ['movie-featured', '⭐ 精选'],
            ['most-viewed', '🔥 最多观看'],
            ['most-popular', '💯 人气最高'],
        ];
        const out = [];
        for (const [id, name] of secs) {
            const seg = slicePane(html, id);
            const list = seg ? parseCards(seg) : [];
            if (list.length) out.push({ name, list: list.slice(0, 24) });
        }
        if (!out.length) {
            const list = parseCards(html);
            if (list.length) out.push({ name: '推荐', list: list.slice(0, 24) });
        }
        return { class: out };
    } catch {
        return { class: [] };
    }
}

function slicePane(html, id) {
    const re = new RegExp('id="' + id + '"', 'i');
    const m = html.match(re);
    if (!m) return '';
    const start = m.index;
    const rest = html.slice(start + 20);
    const nxt = rest.search(/id="[a-z-]+" class="movies-list/i);
    return html.slice(start, nxt > 0 ? start + 20 + nxt : Math.min(html.length, start + 200000));
}

async function category(inReq) {
    applyExt(inReq);
    const body = (inReq && inReq.body) || {};
    const page = Math.max(1, intOf(body.page || body.pg, 1));
    let id = String(body.id || body.tid || body.type_id || '/movies').trim();
    if (!id) id = '/movies';
    if (!id.startsWith('/')) id = '/' + id.replace(/^\/+/, '');

    try {
        const url = buildPageUrl(id, page);
        const r = await getText(url, { headers: siteHeaders() });
        if (r.status === 404) {
            return { page, pagecount: Math.max(1, page - 1), list: [] };
        }
        if (r.status !== 200) return { page, pagecount: page, list: [] };
        const list = parseCards(r.text);
        if (!list.length && page > 1) return { page, pagecount: Math.max(1, page - 1), list: [] };
        const pc = list.length < PAGE_SIZE ? page : parsePageCount(r.text, page);
        return { page, pagecount: pc, list };
    } catch {
        return { page, pagecount: page, list: [] };
    }
}

async function loadDetail(slug) {
    const key = String(slug || '').trim();
    if (!key) return null;
    const cached = cacheGet(detailCache, key, cfg.ttl * 1000);
    if (cached) return cached;
    const r = await getText(site + '/play/' + encodeURIComponent(key), { headers: siteHeaders() });
    if (r.status !== 200) return null;
    const d = parseDetail(r.text);
    d.slug = key;
    if (!d.filmId && !d.lines.length) return null;
    cacheSet(detailCache, key, d);
    return d;
}

function durationText(info) {
    const rt = String(info.runtime || '');
    const m = rt.match(/(\d+)\s*min/i);
    if (m) return m[1] + '分钟';
    return rt;
}

async function detail(inReq) {
    applyExt(inReq);
    const body = (inReq && inReq.body) || {};
    const slug = String(body.id || body.vod_id || body.url || '').trim()
        .replace(/^.*\$/, '')
        .replace(/\|.*$/, '')
        .replace(/^.*\/play\//, '')
        .replace(/\/.*$/, '');
    if (!slug) return { list: [] };
    try {
        const d = await loadDetail(slug);
        if (!d || (!d.filmId && !d.lines.length)) return { list: [] };

        const lines = d.lines.length ? d.lines : [{ id: '0', name: 'F4' }];
        const playUrl = lines.map((ln, i) => `${ln.name}$${slug}|${i + 1}`).join('#');

        const info = [];
        if (d.info.released) info.push('发行：' + d.info.released);
        if (d.info.runtime) info.push('时长：' + durationText(d.info));
        if (d.info.version) info.push('版本：' + d.info.version);
        if (d.info.studio) info.push('厂牌：' + d.info.studio);
        if (d.info.label && d.info.label !== d.info.studio) info.push('标签：' + d.info.label);
        if (d.info.director) info.push('监督：' + d.info.director);
        if (d.actors.length) info.push('演员：' + d.actors.join('、'));
        if (d.genres.length) info.push('分类：' + d.genres.join('、'));
        if (d.info.views) info.push('播放：' + d.info.views);

        let content = '';
        if (info.length) content = (content ? content + '\n\n' : '') + info.join('\n');

        return {
            list: [{
                vod_id: slug,
                vod_name: d.title || d.code || slug,
                vod_pic: absUrl(d.pic),
                vod_content: content.trim(),
                vod_remarks: [d.info.version, durationText(d.info)].filter(Boolean).join(' · ') || d.code,
                vod_play_from: 'PubJav',
                vod_play_url: playUrl,
            }],
        };
    } catch {
        return { list: [] };
    }
}

/* ── 签名链路：详情 → ajax/player → 播放壳 → f4 api ── */

async function ajaxPlayer(filmId, episode, pt) {
    const r = await fetchUrl(site + '/ajax/player', {
        method: 'POST',
        headers: siteHeaders({
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Referer': site + '/',
        }),
        body: `episode=${encodeURIComponent(episode)}&filmId=${encodeURIComponent(filmId)}&pt=${encodeURIComponent(pt)}`,
    });
    const txt = r.body.toString('utf8');
    try { return JSON.parse(txt); } catch { return { error: 'bad json', raw: txt.slice(0, 200) }; }
}

async function signF4(embedUrl) {
    const emb = await getText(embedUrl, { headers: { 'User-Agent': UA, 'Referer': site + '/' } });
    if (emb.status !== 200) throw new Error('embed ' + emb.status);
    const m = emb.text.match(/data-api="([^"]+)"/);
    if (!m) throw new Error('embed 无 data-api');
    const origin = new URL(embedUrl).origin;
    const apiUrl = absUrl(unescapeHtml(m[1]), embedUrl) + (unescapeHtml(m[1]).includes('?') ? '&' : '?') + 'ab=0&r=' + encodeURIComponent(site + '/');

    const jr = await getText(apiUrl, { headers: { 'User-Agent': UA, 'Referer': embedUrl, 'Origin': origin, 'Accept': 'application/json' } });
    let j;
    try { j = JSON.parse(jr.text); } catch { throw new Error('api 非 JSON'); }
    if (!j || !j.src) throw new Error('api 无 src: ' + String(j && (j.error || jr.text)).slice(0, 60));

    const master = absUrl(j.src);
    const base = master.replace(/\/[^/]*$/, '');
    const declared = String(j.type || '').toLowerCase();
    // 实测本站两种片源：HLS 播放列表(playlist.txt) 与 整段 mp4(source.mp4)
    const isMp4 = /^video\//.test(declared) || /mp4|webm|m4v/i.test(declared) || /\.(mp4|m4v|webm)(\?|$)/i.test(master);
    return {
        origin,
        master,
        base,
        token: j.url ? absUrl(j.url, origin) : '',
        expire: now() + (intOf(j.expires_in, 300) * 1000),
        kind: isMp4 ? 'mp4' : 'hls',
    };
}

/** 依次尝试线路，拿到真正可播的地址 */
async function signStream(slug, epi) {
    const watchUrl = site + '/play/' + encodeURIComponent(slug);
    const r = await getText(watchUrl, { headers: siteHeaders() });
    if (r.status !== 200) throw new Error('详情 ' + r.status);
    const d = parseDetail(r.text);
    if (!d.filmId) throw new Error('详情无 filmId');
    if (!d.lines.length) throw new Error('详情无线路');

    const want = Math.max(1, intOf(epi, 1));
    const order = [];
    const first = d.lines[want - 1];
    if (first) order.push(first);
    for (const ln of d.lines) if (!order.includes(ln)) order.push(ln);

    let pt = d.pt;
    let pk = d.pk;
    let lastErr = '';

    for (const ln of order) {
        if (!pt || !pk) {
            const p2 = await getText(watchUrl, { headers: siteHeaders() });
            const d2 = parseDetail(p2.text);
            pt = d2.pt || pt; pk = d2.pk || pk;
        }
        try {
            const j = await ajaxPlayer(d.filmId, ln.id, pt);
            const curPk = pk;
            if (j.next_pt) pt = j.next_pt;
            if (j.next_pk) pk = j.next_pk;
            if (!j.player_enc) { lastErr = ln.name + ': ' + (j.code || j.error || 'no enc'); pt = ''; continue; }
            const html = xorDecode(j.player_enc, curPk);
            const embed = pickEmbed(html);
            if (!embed) { lastErr = ln.name + ': 无 iframe'; continue; }
            const host = new URL(embed).hostname;
            if (/f4s?cdn|f4stream/i.test(host)) {
                const s = await signF4(embed);
                return Object.assign(s, { slug, epi: d.lines.indexOf(ln) + 1, lineName: ln.name, embed, filmId: d.filmId, lines: d.lines });
            }
            lastErr = ln.name + ': 暂不支持的壳 ' + host;
        } catch (e) {
            lastErr = ln.name + ': ' + (e && e.message ? e.message : 'fail');
            pt = '';
        }
    }
    throw new Error(lastErr || 'no stream');
}

/* ── 内置代理 ── */

let proxySrv = null;
let proxyPort = 0;

function ensureProxy() {
    return new Promise((resolve, reject) => {
        if (proxySrv && proxySrv.listening) return resolve(proxySrv);
        const srv = http.createServer(handleProxy);
        srv.on('error', (e) => reject(e));
        const port = cfg.proxyPort || 0;
        srv.listen(port, '0.0.0.0', () => {
            proxySrv = srv;
            proxyPort = srv.address().port;
            resolve(srv);
        });
    });
}

function lanIp() {
    const list = [];
    const ifs = os.networkInterfaces();
    for (const k of Object.keys(ifs)) {
        for (const it of ifs[k] || []) {
            if (it.family === 'IPv4' && !it.internal) list.push(it.address);
        }
    }
    const pref = list.find((x) => /^192\.168\./.test(x)) || list.find((x) => /^10\./.test(x)) || list.find((x) => /^172\.(1[6-9]|2\d|3[01])\./.test(x));
    return pref || list[0] || '127.0.0.1';
}

function clientHost(inReq, port) {
    if (cfg.proxyHost) return cfg.proxyHost;
    const h = String((inReq && inReq.headers && inReq.headers.host) || '');
    const name = h.split(':')[0];
    if (name && !/^(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])$/i.test(name)) {
        if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) return name;
        return name;
    }
    return lanIp();
}

function newSession(obj) {
    const sid = 's' + Math.random().toString(36).slice(2, 10) + now().toString(36);
    sessions.set(sid, Object.assign({ at: now() }, obj));
    if (sessions.size > 40) {
        const oldest = [...sessions.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (oldest) sessions.delete(oldest[0]);
    }
    return sid;
}

/** 重新签发（同片同线路），返回新 base */
async function resign(sess) {
    if (sess.signing) return null;
    sess.signing = true;
    try {
        const s = await signStream(sess.slug, sess.epi);
        sess.base = s.base;
        sess.master = s.master;
        sess.origin = s.origin;
        sess.expire = s.expire;
        sess.at = now();
        return s;
    } catch {
        return null;
    } finally {
        sess.signing = false;
    }
}

function upHeaders(sess, extra) {
    return Object.assign({
        'User-Agent': UA,
        'Origin': sess.origin || F4_ORIGIN,
        'Referer': (sess.origin || F4_ORIGIN) + '/',
        'Accept': '*/*',
    }, extra || {});
}

function localizePlaylist(text, sid, baseDir, upstreamResolved) {
    const lines = [];
    for (const raw of text.split(/\r?\n/)) {
        const t = raw.trim();
        if (!t) { lines.push(''); continue; }
        if (t.startsWith('#')) {
            if (/^#EXT-X-KEY/i.test(t) || /^#EXT-X-MAP/i.test(t) || /^#EXT-X-MEDIA/i.test(t)) {
                lines.push(t.replace(/URI="([^"]+)"/i, (_, u) => {
                    const abs = absUrl(u, upstreamResolved || baseDir + '/');
                    return 'URI="/p/' + sid + '/abs?u=' + b64url(abs) + '"';
                }));
                continue;
            }
            lines.push(raw);
            continue;
        }
        const abs = absUrl(t, upstreamResolved || baseDir + '/');
        if (baseDir && abs.startsWith(baseDir + '/')) {
            lines.push('/p/' + sid + '/' + abs.slice(baseDir.length + 1));
        } else {
            lines.push('/p/' + sid + '/abs?u=' + b64url(abs));
        }
    }
    return lines.join('\n');
}

/** 整段 mp4 / 大文件：流式透传，透传 Range 与状态码 */
async function streamThrough(clientReq, res, sess, url) {
    const headers = {
        'User-Agent': UA,
        Accept: '*/*',
        Origin: sess.origin || F4_ORIGIN,
        Referer: (sess.origin || F4_ORIGIN) + '/',
    };
    if (clientReq.headers.range) headers.Range = clientReq.headers.range;

    try {
        const agents = await ensureOutboundAgents();
        const method = clientReq.method === 'HEAD' ? 'HEAD' : 'GET';
        const upstream = await req({
            method,
            url,
            headers,
            responseType: 'stream',
            validateStatus: () => true,
            timeout: 60000,
            proxy: false,
            httpAgent: agents.httpAgent,
            httpsAgent: agents.httpsAgent,
        });
        const h = {
            'Content-Type': upstream.headers['content-type'] || 'video/mp4',
            'Access-Control-Allow-Origin': '*',
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=60',
        };
        if (upstream.headers['content-length']) h['Content-Length'] = upstream.headers['content-length'];
        if (upstream.headers['content-range']) h['Content-Range'] = upstream.headers['content-range'];
        res.writeHead(upstream.status || 200, h);
        upstream.data.pipe(res);
        upstream.data.on('error', () => { try { res.destroy(); } catch { /* ignore */ } });
        res.on('close', () => { try { upstream.data.destroy(); } catch { /* ignore */ } });
    } catch {
        if (!res.headersSent) sendPlain(res, 502, 'upstream err');
        else { try { res.destroy(); } catch { /* ignore */ } }
    }
}

async function handleProxy(req, res) {
    try {
        const u = new URL(req.url, 'http://localhost');
        const m = u.pathname.match(/^\/p\/([^/]+)\/(.+)$/);
        if (!m) return sendPlain(res, 404, 'bad path');
        const sid = m[1];
        let rest = decodeURIComponent(m[2]);
        if (rest === 'abs' || rest.startsWith('abs/') || rest.startsWith('abs?')) {
            const t = u.searchParams.get('u');
            if (t) rest = 'abs?u=' + t;
        }
        const sess = sessions.get(sid);
        if (!sess) return sendPlain(res, 404, 'no session');

        // master playlist
        if (rest === 'index.m3u8') {
            let text = '';
            let upUrl = sess.master;
            for (let i = 0; i < 2; i++) {
                try {
                    const r = await fetchUrl(upUrl, { headers: upHeaders(sess, { 'Accept': 'application/vnd.apple.mpegurl,*/*' }), retry: 0 });
                    if (r.status === 200) { text = r.body.toString('utf8'); break; }
                } catch { /* 下面重签 */ }
                const s = await resign(sess);
                if (!s) break;
                upUrl = sess.master;
            }
            if (!text) return sendPlain(res, 502, 'master fail');
            const out = localizePlaylist(text, sid, sess.base, sess.master);
            res.writeHead(200, {
                'Content-Type': 'application/vnd.apple.mpegurl',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-cache',
            });
            return res.end(out);
        }

        // 上游地址
        let upUrl;
        if (rest.startsWith('abs?u=')) {
            upUrl = unb64url(rest.slice(6));
        } else if (rest === 'video.mp4') {
            upUrl = sess.master;
        } else {
            upUrl = sess.base + '/' + rest;
        }

        // 整段 mp4：流式透传，绝不整片读进内存
        if (rest === 'video.mp4' || /\.(mp4|m4v|webm)$/i.test(upUrl)) {
            await streamThrough(req, res, sess, upUrl);
            return;
        }

        if (process.env.PJ_TEST === '1' && req.headers['x-pj-test-resign'] === '1' && !rest.startsWith('abs')) {
            sess.base = sess.base.replace(/^https:\/\/[^/]+/, 'https://bogus.invalid');
        }
        const rng = req.headers.range;
        if (process.env.PJ_DEBUG) console.error('[pj] rest=%s up=%s', rest, upUrl);
        let r = null;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                r = await fetchUrl(upUrl, {
                    headers: upHeaders(sess, rng ? { Range: rng } : {}),
                    retry: 0,
                    timeout: 30000,
                });
            } catch {
                r = null;
            }
            if (r && (r.status === 200 || r.status === 206)) break;
            if (attempt === 0) {
                const s = await resign(sess);
                if (!s) break;
                if (rest.startsWith('abs?u=')) continue; // 绝对地址不重拼
                upUrl = sess.base + '/' + rest;
            }
        }
        if (!r || (r.status !== 200 && r.status !== 206)) {
            return sendPlain(res, 502, 'upstream ' + (r ? r.status : 'err'));
        }

        const head = r.body.slice(0, 16).toString('utf8');
        const isPlaylist = /^#EXTM3U/.test(head);
        if (isPlaylist) {
            const out = localizePlaylist(r.body.toString('utf8'), sid, sess.base, upUrl);
            res.writeHead(200, {
                'Content-Type': 'application/vnd.apple.mpegurl',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-cache',
            });
            return res.end(out);
        }

        // 分片：透传 Range，统一按 TS 输出
        let body = r.body;
        let status = 200;
        const outHeaders = {
            'Content-Type': 'video/mp2t',
            'Access-Control-Allow-Origin': '*',
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=60',
        };

        if (r.status === 206 && r.headers['content-range']) {
            status = 206;
            outHeaders['Content-Range'] = r.headers['content-range'];
            outHeaders['Content-Length'] = body.length;
        } else if (rng) {
            const mm = String(rng).match(/bytes=(\d*)-(\d*)/);
            if (mm) {
                const start = mm[1] ? intOf(mm[1], 0) : 0;
                const end = mm[2] ? intOf(mm[2], body.length - 1) : body.length - 1;
                const slice = body.slice(start, Math.min(end + 1, body.length));
                status = 206;
                outHeaders['Content-Range'] = `bytes ${start}-${start + slice.length - 1}/${body.length}`;
                outHeaders['Content-Length'] = slice.length;
                body = slice;
            } else {
                outHeaders['Content-Length'] = body.length;
            }
        } else {
            outHeaders['Content-Length'] = body.length;
        }
        res.writeHead(status, outHeaders);
        return res.end(body);
    } catch (e) {
        return sendPlain(res, 500, 'proxy error');
    }
}

function sendPlain(res, code, msg) {
    try {
        res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(msg);
    } catch { /* ignore */ }
}

/* ── 播放路由 ── */

async function play(inReq) {
    applyExt(inReq);
    const body = (inReq && inReq.body) || {};
    const rawId = String(body.id || body.vod_id || body.play_from || '');
    let slug = rawId;
    let ep = 1;
    const pipe = rawId.split('|');
    if (pipe.length > 1) {
        slug = pipe[0];
        ep = intOf(pipe[1], 1);
    } else {
        ep = intOf(body.ep || body.episode || body.n || 1, 1);
    }
    slug = slug.replace(/^.*\$/, '').replace(/^.*\/play\//, '').replace(/\/.*$/, '').trim();
    if (!slug) return { parse: 0, url: '', header: {} };

    try {
        const s = await signStream(slug, ep);

        if (cfg.proxy === 'direct') {
            return {
                parse: 0,
                url: s.master,
                header: { 'User-Agent': UA, 'Origin': s.origin || F4_ORIGIN, 'Referer': (s.origin || F4_ORIGIN) + '/' },
            };
        }

        if (cfg.proxy === 'auto') {
            // 不带 Origin 探一次：本站 CDN 校验 Origin，缺了必 403，能通才说明可以直连
            try {
                const probe = await fetchUrl(s.master, { headers: { 'User-Agent': UA, 'Range': 'bytes=0-2047' }, retry: 0, timeout: 8000 });
                const head = probe.body.slice(0, 16).toString('utf8');
                const reachable = probe.status === 200 || probe.status === 206;
                const isHls = /^#EXTM3U/.test(head);
                if (reachable && (isHls || (s.kind || 'hls') === 'mp4')) {
                    return {
                        parse: 0,
                        url: s.master,
                        header: { 'User-Agent': UA, 'Origin': s.origin || F4_ORIGIN, 'Referer': (s.origin || F4_ORIGIN) + '/' },
                    };
                }
            } catch { /* 走下面代理 */ }
        }

        await ensureProxy();
        const sid = newSession({
            slug,
            epi: s.epi,
            kind: s.kind || 'hls',
            master: s.master,
            base: s.base,
            origin: s.origin,
            expire: s.expire,
        });
        const host = clientHost(inReq, proxyPort);
        const tail = (s.kind || 'hls') === 'mp4' ? 'video.mp4' : 'index.m3u8';
        return {
            parse: 0,
            url: `http://${host}:${proxyPort}/p/${sid}/${tail}`,
            header: { 'User-Agent': UA },
        };
    } catch (e) {
        return { parse: 0, url: '', header: {}, msg: e && e.message ? e.message : 'fail' };
    }
}

async function search(inReq) {
    applyExt(inReq);
    const body = (inReq && inReq.body) || {};
    const wd = String(body.wd || body.key || body.keyword || body.q || '').trim();
    const page = Math.max(1, intOf(body.page || body.pg, 1));
    if (!wd) return { page: 1, pagecount: 1, list: [] };

    try {
        const r = await fetchUrl(site + '/ajax/search', {
            method: 'POST',
            headers: siteHeaders({
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Accept': 'application/json',
            }),
            body: `q=${encodeURIComponent(wd)}&page=${page}`,
        });
        const txt = r.body.toString('utf8');
        let j;
        try { j = JSON.parse(txt); } catch { return { page, pagecount: page, list: [] }; }
        const hits = Array.isArray(j.hits) ? j.hits : [];
        const list = hits.map((h) => ({
            vod_id: h.code || h.id,
            vod_name: h.name || h.code,
            vod_pic: h.poster || '',
            vod_remarks: [h.code, h.runtimes ? h.runtimes + '分钟' : ''].filter(Boolean).join(' · '),
        })).filter((x) => x.vod_id);
        return { page: intOf(j.page, page), pagecount: Math.max(1, intOf(j.totalPages, page)), list };
    } catch {
        return { page, pagecount: page, list: [] };
    }
}

/* ── 自检 ── */

async function debug(inReq) {
    applyExt(inReq);
    const body = (inReq && inReq.body) || {};
    const slug = String(body.id || body.vod_id || body.code || 'dldss-578-rm').replace(/^.*\/play\//, '').replace(/\/.*$/, '');
    const out = { slug, site, proxy: cfg.proxy, steps: {} };

    const t0 = now();
    try {
        const page = await getText(site + '/play/' + encodeURIComponent(slug), { headers: siteHeaders() });
        const d = parseDetail(page.text);
        out.steps.detail = {
            status: page.status,
            ms: now() - t0,
            filmId: d.filmId,
            token: d.pt ? 'ok' : 'missing',
            key: d.pk ? 'ok' : 'missing',
            lines: d.lines.map((x) => x.name),
            title: d.title.slice(0, 80),
        };
    } catch (e) {
        out.steps.detail = { error: String(e && e.message) };
        return out;
    }

    const t1 = now();
    try {
        const s = await signStream(slug, 1);
        out.steps.sign = { ok: true, ms: now() - t1, line: s.lineName, master: s.master, expireIn: Math.round((s.expire - now()) / 1000) };

        if ((s.kind || 'hls') === 'mp4') {
            const mr = await fetchUrl(s.master, { headers: upHeaders(s, { 'Range': 'bytes=0-2047' }), retry: 0 });
            out.steps.mp4 = {
                status: mr.status,
                type: mr.headers['content-type'],
                bytes: mr.body.length,
                head: mr.body.slice(0, 4).toString('hex'),
                range: mr.headers['content-range'] || '',
            };
            return out;
        }

        const pl = await fetchUrl(s.master, { headers: upHeaders(s), retry: 0 });
        out.steps.playlist = { status: pl.status, bytes: pl.body.length, head: pl.body.slice(0, 160).toString('utf8') };

        const text = pl.body.toString('utf8');
        const variant = text.split(/\r?\n/).find((l) => l && !l.startsWith('#'));
        let segUrl = '';
        if (variant) {
            const vUrl = absUrl(variant, s.master);
            const vr = await fetchUrl(vUrl, { headers: upHeaders(s), retry: 0 });
            out.steps.variant = { url: vUrl, status: vr.status, bytes: vr.body.length };
            const first = vr.body.toString('utf8').split(/\r?\n/).find((l) => l && !l.startsWith('#'));
            if (first) segUrl = absUrl(first, vUrl);
        }
        if (segUrl) {
            const sg = await fetchUrl(segUrl, { headers: upHeaders(s, { Range: 'bytes=0-2047' }), retry: 0 });
            out.steps.segment = {
                url: segUrl.slice(0, 100),
                status: sg.status,
                bytes: sg.body.length,
                head: sg.body.slice(0, 4).toString('hex'),
                isTs: sg.body[0] === 0x47,
                range: sg.headers['content-range'] || '',
            };
        }
        const noOrigin = await fetchUrl(segUrl || s.master, { headers: { 'User-Agent': UA }, retry: 0 }).catch((e) => ({ status: 'err' }));
        out.steps.originRequired = noOrigin.status !== 200 && noOrigin.status !== 206;
    } catch (e) {
        out.steps.sign = { ok: false, error: String(e && e.message) };
    }
    return out;
}

/* ────────────────────────────── 路由挂载 ────────────────────────────── */

/** 备用通道：壳子自己拼 /proxy/stream?url=<上游地址> 时走这里（只放行本站片源域名） */
function streamAnyProxy(req, res) {
    const u = new URL(req.url, 'http://localhost');
    let target = u.searchParams.get('url') || u.searchParams.get('u') || '';
    if (target && !/^https?:\/\//i.test(target)) {
        try { target = unb64url(target); } catch { /* 原样 */ }
    }
    let host = '';
    try { host = new URL(target).hostname; } catch { /* ignore */ }
    if (!target || !/(^|\.)(f4scdn\.com|f4stream\.com|pubjav\.com)$/i.test(host)) {
        return sendPlain(res, 403, 'denied');
    }
    return fetchUrl(target, { headers: { 'User-Agent': UA, 'Origin': F4_ORIGIN, 'Referer': F4_ORIGIN + '/' }, retry: 0, timeout: 30000 })
        .then((r) => {
            const head = r.body.slice(0, 16).toString('utf8');
            if (/^#EXTM3U/.test(head)) {
                const text = r.body.toString('utf8').split(/\r?\n/).map((line) => {
                    const t = line.trim();
                    if (!t || t.startsWith('#')) return line;
                    return '/proxy/stream?url=' + b64url(absUrl(t, target));
                }).join('\n');
                res.writeHead(200, {
                    'Content-Type': 'application/vnd.apple.mpegurl',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'no-cache',
                });
                return res.end(text);
            }
            const h = {
                'Content-Type': r.headers['content-type'] || 'video/mp2t',
                'Access-Control-Allow-Origin': '*',
                'Accept-Ranges': 'bytes',
            };
            if (r.headers['content-length']) h['Content-Length'] = r.body.length;
            if (r.headers['content-range']) h['Content-Range'] = r.headers['content-range'];
            res.writeHead(r.status, h);
            res.end(r.body);
        })
        .catch(() => sendPlain(res, 502, 'upstream err'));
}

async function proxyStream(inReq, reply) {
    applyExt(inReq);
    const raw = (reply && reply.raw) || (inReq && inReq.raw);
    if (raw) return streamAnyProxy((inReq && (inReq.raw || inReq)) || inReq, raw);
    return { code: 400, msg: 'bad request' };
}

function handler(req, res) {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname.startsWith('/p/')) return handleProxy(req, res);

    const path = u.pathname.replace(/\/+$/, '');
    if (path === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end(`pubjav spider v${VERSION}  site=${site}  proxy=${cfg.proxy}\nPOST /init /home /category /detail /play /search /debug\nGET  /p/{sid}/index.m3u8\n`);
    }
    if (u.pathname === '/proxy/stream') return streamAnyProxy(req, res);

    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
        let body = {};
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { body = {}; }
        const fake = { body, headers: req.headers, query: Object.fromEntries(u.searchParams) };
        let out;
        const name = path.split('/').pop();
        switch (name) {
            case 'init': out = await init(fake); break;
            case 'home': out = await home(fake); break;
            case 'category': out = await category(fake); break;
            case 'detail': out = await detail(fake); break;
            case 'play': out = await play(fake); break;
            case 'search': out = await search(fake); break;
            case 'debug': out = await debug(fake); break;
            default: res.writeHead(404); return res.end('not found');
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(out));
    });
}

export default {
    meta: { key: 'pubjav', name: '🌸PubJav', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/proxy/stream', proxyStream);
        fastify.post('/debug', debug);
    },
};
