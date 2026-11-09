import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

// ─── 可调配置（ext 里传，不传就用默认） ────────────────────────────────────────
const EXT = {
    site:    'https://91pornxx.cc',
    proxy:   'm3u8',      // m3u8=只代理播放清单（默认，省带宽）/ all=清单+分片全代理 / direct=完全不代理直连
    proxyHost: '',        // 播放器访问不到壳子地址时，手填 http://1.2.3.4:4567
    ttl:     300,         // 详情/分类缓存秒数
    timeout: 15000,
    pageSize: 12,
};

const DEFAULTS = { ...EXT };

let site = EXT.site;

const meta = { key: '91pornxx', name: '🎞️91pornxx', type: 3 };

const headers = {
    'Referer': site + '/',
    'Origin':  site,
    'User-Agent': UA,
};

function applyExt(inReq) {
    const e = inReq && inReq.body && inReq.body.ext;
    if (e && typeof e === 'object') {
        for (const k of Object.keys(e)) {
            if (k === 'proxy') continue;                        // 播放模式只对本次请求生效
            if (e[k] !== undefined && e[k] !== null && e[k] !== '') EXT[k] = e[k];
        }
    }
    if (process.env.P91_SITE)   EXT.site = process.env.P91_SITE;
    if (process.env.P91_PROXY)  EXT.proxy = process.env.P91_PROXY;
    site = String(EXT.site || 'https://91pornxx.cc').replace(/\/+$/, '');
    headers['Referer'] = site + '/';
    headers['Origin']  = site;
    EXT.pageSize = Math.min(Math.max(parseInt(EXT.pageSize) || 12, 1), 50);
    EXT.timeout  = parseInt(EXT.timeout) || 15000;
}

// ─── 缓存 ──────────────────────────────────────────────────────────────────────
const cache = new Map();
function cget(k) {
    const v = cache.get(k);
    if (!v) return null;
    if (Date.now() > v.exp) { cache.delete(k); return null; }
    return v.data;
}
function cset(k, data, ttlSec) {
    cache.set(k, { data, exp: Date.now() + (ttlSec || EXT.ttl) * 1000 });
    if (cache.size > 400) {
        const now = Date.now();
        for (const [kk, vv] of cache) if (vv.exp < now) cache.delete(kk);
    }
    return data;
}

// ─── 基础请求 ──────────────────────────────────────────────────────────────────
async function request(reqUrl, opt = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { ...headers, ...(opt.headers || {}) },
        timeout: opt.timeout || EXT.timeout,
        responseType: opt.responseType || 'text',
        maxRedirects: 5,
        validateStatus: s => s >= 200 && s < 400,
        transformResponse: opt.responseType ? [(d) => d] : undefined,
    });
    return opt.responseType ? resp : resp.data;
}

async function getJSON(url, opt = {}) {
    const d = await request(url, opt);
    try { return typeof d === 'string' ? JSON.parse(d) : d; } catch (e) { return null; }
}

// ─── 页面里 RSC 数据提取（列表页 / 搜索页用） ──────────────────────────────────
function parseRsc(html) {
    const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)<\/script>/g;
    let buf = '', m;
    while ((m = re.exec(html))) {
        try { buf += JSON.parse(m[1]); } catch (e) { /* 跳过坏块 */ }
    }
    return buf;
}

// 从文本里按 key 抓一个完整 JSON 对象/数组（括号平衡，不依赖字段顺序）
function extractJson(text, key, kind) {
    const open = kind === 'array' ? '[' : '{';
    const close = kind === 'array' ? ']' : '}';
    const i = text.indexOf('"' + key + '":' + open);
    if (i < 0) return null;
    const start = i + ('"' + key + '":').length;
    let depth = 0, inStr = false, esc = false;
    for (let k = start; k < text.length; k++) {
        const c = text[k];
        if (inStr) {
            if (esc) esc = false;
            else if (c === '\\') esc = true;
            else if (c === '"') inStr = false;
            continue;
        }
        if (c === '"') inStr = true;
        else if (c === open) depth++;
        else if (c === close) {
            depth--;
            if (depth === 0) {
                try { return JSON.parse(text.slice(start, k + 1)); } catch (e) { return null; }
            }
        }
    }
    return null;
}

// ─── 小工具 ────────────────────────────────────────────────────────────────────
function absUrl(u) {
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return 'https:' + u;
    return site + (u.startsWith('/') ? u : '/' + u);
}

// 封面：站点原始路径要加 /cdn/image 前缀
function pic(p) {
    if (!p) return '';
    if (/^https?:\/\//i.test(p)) return p;
    if (p.startsWith('/cdn/image/')) return site + p;
    return site + '/cdn/image' + (p.startsWith('/') ? p : '/' + p);
}

function fmtDur(sec) {
    const s = parseInt(sec, 10) || 0;
    if (!s) return '';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const pad = n => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}

function b64e(s) { return Buffer.from(s, 'utf8').toString('base64url'); }
function b64d(s) { try { return Buffer.from(String(s || ''), 'base64url').toString('utf8'); } catch (e) { return ''; } }

// 列表条目 → 壳子要的 vod 结构
function toVod(it) {
    const ed = it.extra_data || {};
    return {
        vod_id:      it.slug || String(it.id || ''),
        vod_name:    it.title || '',
        vod_pic:     pic(it.cover_image),
        vod_remarks: ed.duration ? fmtDur(ed.duration) : '',
        vod_year:    ed.issue_date ? String(ed.issue_date).slice(0, 4) : '',
        vod_area:    '',
        vod_lang:    '',
        vod_actor:   ed.actor || '',
        vod_director: ed.director || '',
        type_name:   ed.cat_name || '',
        vod_content: it.excerpt || it.content || '',
        vod_pubdate: it.created_at ? String(it.created_at).slice(0, 10) : '',
    };
}

// ─── 分类目录 ──────────────────────────────────────────────────────────────────
async function getNavTags() {
    const hit = cget('nav');
    if (hit) return hit;
    try {
        const html = await request(site + '/');
        const nav = html.match(/<nav class="tl-nav">([\s\S]*?)<\/nav>/);
        const out = [];
        if (nav) {
            const re = /href="(\/tag\/(tags-[a-f0-9]+))"[^>]*>([^<]+)</g;
            let m;
            while ((m = re.exec(nav[1]))) out.push({ slug: m[2], name: m[3].trim() });
        }
        return cset('nav', out, 1800);
    } catch (e) {
        return [];
    }
}

async function getHotTags() {
    const hit = cget('hot');
    if (hit) return hit;
    try {
        const j = await getJSON(`${site}/api/tags?limit=100`);
        const list = (j && j.data) || [];
        return cset('hot', list, 1800);
    } catch (e) {
        return [];
    }
}

// 分类 id 容错：既认 tags-xxxx，也认中文分类名
async function resolveTagId(tid) {
    if (/^tags-[a-f0-9]+$/i.test(tid)) return tid;
    const all = [...(await getNavTags()), ...(await getHotTags())];
    const hit = all.find(t => t.name === tid || t.slug === tid);
    return hit ? hit.slug : tid;
}

// ─── 详情 ──────────────────────────────────────────────────────────────────────
async function getDetail(id) {
    const key = 'd:' + id;
    const hit = cget(key);
    if (hit) return hit;
    let d = null;
    try {
        d = await getJSON(`${site}/api/articles/${encodeURIComponent(id)}`);
    } catch (e) {
        d = null;
    }
    if (d && d.id) return cset(key, d);
    // 接口不认这个 id 时回落到页面解析
    try {
        const html = await request(`${site}/article/${encodeURIComponent(id)}`);
        const obj = extractJson(parseRsc(html), 'article', 'object');
        if (obj && obj.id) return cset(key, obj);
    } catch (e) { /* ignore */ }
    return null;
}

// ─── 路由处理 ──────────────────────────────────────────────────────────────────
async function init(_inReq, _outResp) {
    return {};
}

async function home(inReq, _outResp) {
    applyExt(inReq);
    const nav = await getNavTags();
    const hot = await getHotTags();

    const classes = [
        { type_id: 'latest', type_name: '最近更新' },
        { type_id: 'rank',   type_name: '热门排行' },
    ];
    const seen = new Set(['latest', 'rank']);
    for (const t of [...nav, ...hot.slice(0, 24)]) {
        if (!t || !t.slug || seen.has(t.slug)) continue;
        seen.add(t.slug);
        classes.push({ type_id: t.slug, type_name: t.name });
    }

    let list = [];
    try {
        const j = await getJSON(`${site}/api/articles?page=1&limit=${EXT.pageSize}`);
        list = ((j && j.data) || []).map(toVod);
    } catch (e) { /* ignore */ }

    return { class: classes, filters: {}, list };
}

async function category(inReq, _outResp) {
    applyExt(inReq);
    let tid = String((inReq.body && inReq.body.id) ?? 'latest');
    const pg = Math.max(1, parseInt(inReq.body && inReq.body.page, 10) || 1);

    // 热门排行：站点这个榜是单页 20 条，不翻页
    if (tid === 'rank') {
        const hitRank = cget('rank');
        if (hitRank) return hitRank;
        try {
            const html = await request(`${site}/rankings/latest`);
            const items = extractJson(parseRsc(html), 'items', 'array') || [];
            const list = items.map(it => ({
                vod_id:      it.article_slug || String(it.article_id || ''),
                vod_name:    it.article_title || '',
                vod_pic:     pic(it.article_cover),
                vod_remarks: it.period_views ? `${it.period_views}次播放` : '',
                vod_year:    '',
                type_name:   '热门排行',
            }));
            return cset('rank', { page: 1, pagecount: 1, limit: list.length, total: list.length, list });
        } catch (e) {
            return { page: 1, pagecount: 1, limit: 0, total: 0, list: [] };
        }
    }

    const url = (tid === 'latest' || tid === '' || tid === 'home')
        ? `${site}/api/articles?page=${pg}&limit=${EXT.pageSize}`
        : `${site}/api/tags/${encodeURIComponent(await resolveTagId(tid))}/articles?page=${pg}&limit=${EXT.pageSize}`;

    const key = 'c:' + url;
    const hit = cget(key);
    if (hit) return hit;

    let j = null;
    try { j = await getJSON(url); } catch (e) { j = null; }
    if (!j) return { page: pg, pagecount: pg, limit: 0, total: 0, list: [] };

    const pgInfo = j.pagination || {};
    const result = {
        page:      pgInfo.page || pg,
        pagecount: pgInfo.totalPages || 0,
        limit:     pgInfo.limit || EXT.pageSize,
        total:     pgInfo.total || 0,
        list:      (j.data || []).map(toVod),
    };
    return cset(key, result);
}

async function detail(inReq, _outResp) {
    applyExt(inReq);
    const id = String((inReq.body && inReq.body.id) ?? '');
    if (!id) return { list: [] };

    const data = await getDetail(id);
    if (!data) return { list: [] };

    const ed = data.extra_data || {};
    const links = Array.isArray(ed.links) ? ed.links : [];

    const froms = [];
    const urls  = [];
    links.forEach((l, i) => {
        const raw = l.m3u8_url || l.preview_url || '';
        const u = absUrl(raw);
        if (!u) return;
        const rawName = (l.name && String(l.name).trim()) || '';
        const name = !rawName ? `线路${i + 1}` : (/^\d+$/.test(rawName) ? `线路${rawName}` : rawName);
        froms.push(name);
        urls.push(`${name}$${u}`);
    });

    const vod = {
        vod_id:       data.slug || id,
        vod_name:     data.title || '',
        vod_pic:      pic(data.cover_image),
        vod_content:  data.content || data.excerpt || '',
        vod_remarks:  ed.duration ? fmtDur(ed.duration) : '',
        vod_year:     ed.issue_date ? String(ed.issue_date).slice(0, 4) : '',
        vod_area:     '',
        vod_actor:    ed.actor || '',
        vod_director: ed.director || '',
        type_name:    ed.cat_name || '',
        vod_pubdate:  data.created_at ? String(data.created_at).slice(0, 10) : '',
        vod_play_from: froms.join('$$'),
        vod_play_url:  urls.join('#'),
    };

    if (Array.isArray(data.tags) && data.tags.length) {
        vod.vod_tag = data.tags.map(t => t.name).join(',');
    }

    return { list: [vod] };
}

// 拼出播放器能访问的代理根地址（带上壳子的路由前缀，如 /spider/91pornxx/3）
function proxyBase(inReq) {
    if (EXT.proxyHost) return String(EXT.proxyHost).replace(/\/+$/, '');

    const h = (inReq && inReq.headers) || {};
    let host = h['x-forwarded-host'] || h.host || h[':authority'] || '';
    if (host && host.includes(',')) host = host.split(',')[0].trim();
    if (!host) return '';

    let proto = (h['x-forwarded-proto'] || '').split(',')[0].trim();
    if (!proto) proto = h['x-forwarded-ssl'] === 'on' ? 'https' : 'http';

    // 从当前请求路径反推插件前缀：
    //   /spider/91pornxx/3/play          -> /spider/91pornxx/3
    //   /spider/91pornxx/3/proxy/stream  -> /spider/91pornxx/3
    let path = (inReq && (inReq.url || inReq.rawUrl)) || '';
    path = String(path).split('?')[0].replace(/\/+$/, '');
    path = path.replace(/\/proxy\/stream$/, '');
    path = path.replace(/\/(?:init|home|category|detail|play|search)$/, '');
    const base = path || `/spider/${meta.key}/${meta.type}`;

    return `${proto}://${host}${base}`;
}

async function play(inReq, _outResp) {
    applyExt(inReq);
    const raw = String((inReq.body && inReq.body.id) ?? '').trim();
    // 兼容三种入参：纯地址、"名称$地址"、"名称$$地址"
    let u = raw;
    const i2 = raw.lastIndexOf('$$');
    if (i2 >= 0) {
        u = raw.slice(i2 + 2);
    } else if (!/^https?:\/\//i.test(raw)) {
        const i1 = raw.lastIndexOf('$');
        if (i1 >= 0) u = raw.slice(i1 + 1);
    }
    u = absUrl(u.trim());
    if (!u) return { parse: 1, url: '' };

    const base = proxyBase(inReq);
    const reqExt = (inReq.body && inReq.body.ext) || {};
    const mode = String(reqExt.proxy || EXT.proxy || DEFAULTS.proxy || 'm3u8').toLowerCase();

    // 直连模式，或推导不出代理地址时，退回原地址
    if (mode === 'direct' || !base) {
        return { parse: 0, url: u, header: { 'User-Agent': UA, 'Referer': site + '/' } };
    }

    return {
        parse: 0,
        url: `${base}/proxy/stream?u=${b64e(u)}&m=${encodeURIComponent(mode)}`,
        header: { 'User-Agent': UA, 'Referer': site + '/' },
    };
}

async function search(inReq, _outResp) {
    applyExt(inReq);
    const wd = String((inReq.body && (inReq.body.wd || inReq.body.key || inReq.body.id)) ?? '').trim();
    const pg = Math.max(1, parseInt(inReq.body && (inReq.body.pg || inReq.body.page), 10) || 1);
    if (!wd) return { page: 1, pagecount: 1, limit: 0, total: 0, list: [] };

    const url = `${site}/search?q=${encodeURIComponent(wd)}&page=${pg}`;
    const key = 's:' + url;
    const hit = cget(key);
    if (hit) return hit;

    let html = '';
    try { html = await request(url); } catch (e) { html = ''; }
    if (!html) return { page: pg, pagecount: pg, limit: 0, total: 0, list: [] };

    const rsc  = parseRsc(html);
    const arts = extractJson(rsc, 'articles', 'array') || [];
    const pag  = extractJson(rsc, 'pagination', 'object') || {};

    const result = {
        page:      pag.page || pg,
        pagecount: pag.totalPages || 0,
        limit:     pag.limit || 10,
        total:     pag.total || arts.length,
        list:      arts.map(toVod),
    };
    return cset(key, result);
}


// ─── 自检口（断了甩这一条就行） ────────────────────────────────────────────────
async function debug(inReq, _outResp) {
    applyExt(inReq);
    const id = String((inReq.body && inReq.body.id) ?? '');
    const out = { id, site, mode: EXT.proxy };

    if (!id) return { ...out, error: '需要传 id（详情页里的 slug，如 video-xxx-xxxxxxxx）' };

    const data = await getDetail(id);
    if (!data) return { ...out, detail: 'FAIL', error: '详情拿不到，站点改版或 id 不对' };

    const ed = data.extra_data || {};
    const links = Array.isArray(ed.links) ? ed.links : [];
    out.detail = 'OK';
    out.title = data.title;
    out.duration = ed.duration;
    out.links = links.length;

    if (!links.length) return { ...out, error: '没有片源字段' };

    const target = absUrl(links[0].m3u8_url || links[0].preview_url || '');
    out.m3u8 = target;

    try {
        const body = await request(target);
        const segs = (body.match(/^https:\/\//gm) || []).length;
        out.m3u8_status = 'OK';
        out.segments = segs;
        out.encrypted = /AES-128/.test(body);
        out.first_line = String(body).split('\n')[0];

        const seg = String(body).split('\n').find(l => l.startsWith('http'));
        if (seg) {
            const r = await axios.get(seg.trim(), {
                headers: { ...headers, Range: 'bytes=0-15' },
                timeout: EXT.timeout,
                responseType: 'arraybuffer',
                validateStatus: () => true,
            });
            const buf = Buffer.from(r.data);
            out.segment_status = r.status;
            out.segment_first_byte = '0x' + buf[0].toString(16).padStart(2, '0');
            out.segment_is_ts = buf[0] === 0x47 ? 'clean TS（未加密）' : '加密分片（AES-128，正常）';
        }
        const keyUri = (String(body).match(/URI="([^"]+)"/) || [])[1];
        if (keyUri) {
            const kr = await axios.get(keyUri, { headers: { ...headers }, responseType: 'arraybuffer', validateStatus: () => true, timeout: EXT.timeout });
            out.key_status = kr.status;
            out.key_bytes = Buffer.from(kr.data).length;
        }
    } catch (e) {
        out.m3u8_status = 'FAIL';
        out.m3u8_error = e.message;
    }
    return out;
}

// ─── 代理转发 ──────────────────────────────────────────────────────────────────
function isPrivateHost(host) {
    return /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|::1)/i.test(host)
        || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

function proxyUrlFor(target, inReq) {
    const base = proxyBase(inReq);
    if (!base) return target;
    return `${base}/proxy/stream?u=${b64e(target)}`;
}

// 把 m3u8 里的分片 / KEY 改写成走代理
function rewriteM3u8(body, baseUrl, inReq) {
    const abs = (u) => {
        if (!u) return u;
        if (/^https?:\/\//i.test(u)) return u;
        try { return new URL(u, baseUrl).href; } catch (e) { return u; }
    };
    return body.split('\n').map(line => {
        const t = line.trim();
        if (!t) return line;
        if (t.startsWith('#')) {
            return t.replace(/URI="([^"]+)"/g, (_m, uri) => `URI="${proxyUrlFor(abs(uri), inReq)}"`);
        }
        return proxyUrlFor(abs(t), inReq);
    }).join('\n');
}

async function proxyStream(req, reply) {
    applyExt({});

    const target = b64d(req.query && req.query.u);
    if (!/^https?:\/\//i.test(target)) {
        return reply.code(400).send('bad url');
    }

    let parsed;
    try { parsed = new URL(target); } catch (e) { return reply.code(400).send('bad url'); }
    if (isPrivateHost(parsed.hostname)) return reply.code(403).send('forbidden');

    const fwd = {
        ...headers,
        ...(req.headers.range ? { Range: req.headers.range } : {}),
        ...(req.headers['if-range'] ? { 'If-Range': req.headers['if-range'] } : {}),
    };

    const looksM3u8 = /\.m3u8(\?|$)/i.test(target);

    try {
        const mode = String((req.query && req.query.m) || EXT.proxy || 'm3u8').toLowerCase();

        if (looksM3u8) {
            const r = await axios.get(target, {
                headers: fwd,
                timeout: EXT.timeout,
                responseType: 'text',
                validateStatus: () => true,
                transformResponse: [(d) => d],
                decompress: true,
            });
            if (r.status !== 200) return reply.code(r.status).send(String(r.data || ''));
            const body = String(r.data || '');
            const out = mode === 'all'
                ? rewriteM3u8(body, target, req)
                : body;   // 默认只代理清单，分片由播放器直连 CDN（无鉴权、CORS 全开）
            reply.header('content-type', 'application/vnd.apple.mpegurl');
            reply.header('cache-control', 'no-cache');
            reply.header('access-control-allow-origin', '*');
            return reply.send(out);
        }

        const r = await axios.get(target, {
            headers: fwd,
            timeout: EXT.timeout,
            responseType: 'stream',
            decompress: false,
            validateStatus: () => true,
            maxRedirects: 5,
        });

        reply.code(r.status);
        for (const k of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
            if (r.headers[k]) reply.header(k, r.headers[k]);
        }
        reply.header('access-control-allow-origin', '*');
        reply.header('access-control-expose-headers', '*');
        return reply.send(r.data);
    } catch (e) {
        return reply.code(502).send('upstream error');
    }
}

// ─── Export ────────────────────────────────────────────────────────────────────
export default {
    meta,
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
        fastify.post('/debug',    debug);
        fastify.get('/proxy/stream', proxyStream);
    },
};
