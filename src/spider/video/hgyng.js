/**
 * 红裹视频（p1zw.hgyng.com）解析插件  meta.type = 3
 *
 * 零依赖：只用 Node 内置 http / https / zlib / crypto，不引 cheerio、不引 req.js。
 *
 * 站点结构（实测）
 *   首页        /                        三个分区：正在点播 / 每日热播 / 最近更新
 *   全部分类    /categories              39 个栏目（a.cat-all-item），分类树从这儿动态抓
 *   分类列表    /category/{slug}         分页 ?page=N，20 条/页
 *   最近更新    /latest                  分页 ?page=N
 *   搜索        /search?q={词}            分页 &page=N，页头给出「共 N 条」
 *   详情+播放   /video/{id}               详情与播放合并在一页，没有单独的播放页
 *   Feed 接口   /api/feed?type=..&offset=..&limit=20   （返回 html 卡片，count/hasMore/nextOffset）
 *
 * 卡片
 *   <a class="video-card" href="/video/{id}"> img + span.duration + h3.title + meta(likes/views/date)
 *
 * 片源（两种，必须都接）
 *   A 老片  https://m3u8.doyinapi.com/play/{hash}.m3u8
 *      → 明文 MPEG-TS，但分片挂在 http://vfile.meituan.net/....png 上：
 *        扩展名和 Content-Type 都是 png（字节其实是 0x47 开头的 TS），而且是 http（网页 https 下会被混合内容拦）
 *   B 新片  https://c10.hs100.top/{date}/{hash}/index.m3u8
 *      → HLS + AES-128，KEY 在 https://98cdn.vip/... key 16 字节，IV 全 0
 *   两种 CDN 都允许跨域（ACAO: *），不需要 Referer / Cookie / 登录态。
 *   页面上的地址是 /hls/proxy?url=<urlencode 过的 m3u8>，插件把它解出来用。
 *
 * 播放
 *   auto   默认。分片是伪装 png 或 http 的 → 走插件内置代理（补正确 Content-Type、消混合内容、KEY 也转发）
 *          明文 https 分片 → 直连，最省资源
 *   direct 一律把上游 m3u8 直接给播放器
 *   local  一律走插件内置代理
 *
 * ext（可选，不填全默认）
 *   site       换镜像域名，如 https://别的域名
 *   proxy      auto | local | direct
 *   proxyHost  播放器访问不到壳子 Host 时手填，如 192.168.1.10
 *   proxyPort  固定代理端口（默认随机）
 *   decrypt    1 = 代理把 AES-128 分片解成明文 TS（仅代理模式生效）
 *   ttl        m3u8 缓存秒数，默认 300
 *   timeout    请求超时毫秒，默认 15000
 */

import http from 'http';
import https from 'https';
import zlib from 'zlib';
import crypto from 'crypto';
import { URL } from 'url';

const VERSION = '1.0.0';
const DEFAULT_SITE = 'https://p1zw.hgyng.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const PAGE_SIZE = 20;

let site = DEFAULT_SITE;

const DEFAULT_CFG = {
    proxy: 'auto',
    proxyHost: '',
    proxyPort: 0,
    decrypt: 0,
    ttl: 300,
    timeout: 15000,
};
const cfg = { ...DEFAULT_CFG };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ────────────────────────────── 配置 ────────────────────────────── */

function applyExt(inReq) {
    const body = (inReq && inReq.body) || {};
    let ext = (inReq && inReq.ext) || body.ext || body.extend || (inReq && inReq.query && inReq.query.ext);
    if (typeof ext === 'string') {
        const s = ext.trim();
        if (/^https?:\/\//i.test(s)) {
            site = s.replace(/\/+$/, '');
            return;
        }
        if (s.startsWith('{')) {
            try { ext = JSON.parse(s); } catch { ext = {}; }
        } else {
            return;
        }
    }
    if (!ext || typeof ext !== 'object') return;
    // 每轮显式给 ext 就以它为准，避免上一次的配置粘到这一次
    Object.assign(cfg, DEFAULT_CFG);
    if (ext.site && /^https?:\/\//i.test(String(ext.site))) site = String(ext.site).replace(/\/+$/, '');
    if (ext.proxy) cfg.proxy = String(ext.proxy).toLowerCase();
    if (ext.proxyHost) cfg.proxyHost = String(ext.proxyHost).replace(/\/+$/, '');
    if (ext.proxyPort) cfg.proxyPort = parseInt(ext.proxyPort, 10) || 0;
    if (ext.decrypt !== undefined) cfg.decrypt = String(ext.decrypt) === '1' ? 1 : 0;
    if (ext.ttl) cfg.ttl = Math.max(30, parseInt(ext.ttl, 10) || 300);
    if (ext.timeout) cfg.timeout = Math.max(3000, parseInt(ext.timeout, 10) || 15000);
}

/* ────────────────────────────── HTTP 客户端 ────────────────────────────── */

function httpGet(url, opt = {}) {
    const { headers = {}, timeout = cfg.timeout, redirect = 4, method = 'GET' } = opt;
    return new Promise((resolve, reject) => {
        let u;
        try { u = new URL(url); } catch (e) { return reject(e); }
        const mod = u.protocol === 'https:' ? https : http;
        const req = mod.request({
            protocol: u.protocol,
            hostname: u.hostname,
            port: u.port || undefined,
            path: u.pathname + u.search,
            method,
            headers: Object.assign({
                'User-Agent': UA,
                'Accept': '*/*',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'close',
            }, headers),
        }, (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirect > 0) {
                res.resume();
                let next = res.headers.location;
                if (next.startsWith('/')) next = u.origin + next;
                return httpGet(next, { ...opt, redirect: redirect - 1 }).then(resolve, reject);
            }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                let buf = Buffer.concat(chunks);
                const enc = String(res.headers['content-encoding'] || '').toLowerCase();
                try {
                    if (enc === 'gzip') buf = zlib.gunzipSync(buf);
                    else if (enc === 'deflate') buf = zlib.inflateSync(buf);
                    else if (enc === 'br') buf = zlib.brotliDecompressSync(buf);
                } catch { /* 解压失败就用原始字节 */ }
                resolve({ status: res.statusCode || 0, headers: res.headers, body: buf });
            });
        });
        req.setTimeout(timeout, () => req.destroy(new Error('ETIMEDOUT')));
        req.on('error', reject);
        req.end();
    });
}

async function getText(url, opt = {}, tries = 3) {
    let last;
    for (let i = 0; i < tries; i++) {
        try {
            const r = await httpGet(url, opt);
            if (r.status === 429) { await sleep(800 * (i + 1) + Math.random() * 400); last = new Error('HTTP 429'); continue; }
            if (r.status >= 500) { await sleep(500 * (i + 1)); last = new Error('HTTP ' + r.status); continue; }
            return { status: r.status, headers: r.headers, text: r.body.toString('utf8') };
        } catch (e) {
            last = e;
            await sleep(400 * (i + 1) + Math.random() * 300);
        }
    }
    throw last || new Error('fetch failed');
}

async function getBuf(url, opt = {}, tries = 2) {
    let last;
    for (let i = 0; i < tries; i++) {
        try {
            const r = await httpGet(url, opt);
            if (r.status === 429 || r.status >= 500) {
                last = new Error('HTTP ' + r.status);
                await sleep(600 * (i + 1));
                continue;
            }
            return r;
        } catch (e) {
            last = e;
            await sleep(500 * (i + 1) + Math.random() * 300);
        }
    }
    throw last || new Error('fetch failed');
}

function siteHeaders(extra = {}) {
    return Object.assign({ 'User-Agent': UA, Referer: site + '/' }, extra);
}

/* ────────────────────────────── 工具 ────────────────────────────── */

function decodeEnt(s) {
    return String(s || '')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function clean(s) {
    return decodeEnt(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function absUrl(u, base) {
    u = decodeEnt(String(u || '').trim());
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return 'https:' + u;
    const b = String(base || site).replace(/\/+$/, '');
    if (u.startsWith('/')) return b + u;
    return b + '/' + u;
}

function enc(s) { return encodeURIComponent(String(s || '')); }

function intOf(v, d = 1) {
    const n = parseInt(String(v == null ? '' : v).replace(/[^\d-]/g, ''), 10);
    return Number.isFinite(n) && n > 0 ? n : d;
}

/* ────────────────────────────── 列表解析 ────────────────────────────── */

/**
 * 卡片：<a class="video-card" href="/video/{id}">…</a>
 * 返回 [{vod_id, vod_name, vod_pic, vod_remarks, likes, views, date}]
 */
function parseCards(html) {
    const out = [];
    const seen = new Set();
    const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(html))) {
        const attrs = m[1];
        if (!/class="[^"]*video-card/.test(attrs)) continue;
        const href = (attrs.match(/href="([^"]*)"/) || [])[1] || '';
        const idm = href.match(/\/video\/(\d+)/);
        if (!idm) continue;
        const id = idm[1];
        if (seen.has(id)) continue;

        const inner = m[2];
        const pic = (inner.match(/<img[^>]*\ssrc="([^"]+)"/) || [])[1] || '';
        let name = '';
        const h3 = inner.match(/<h3[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/h3>/);
        if (h3) name = clean(h3[1]);
        if (!name) name = clean((inner.match(/<img[^>]*\salt="([^"]*)"/) || [])[1] || '');
        if (!name) continue;
        seen.add(id);

        const dur = clean((inner.match(/<span[^>]*class="[^"]*duration[^"]*"[^>]*>([\s\S]*?)<\/span>/) || [])[1] || '');
        const likes = clean((inner.match(/<span[^>]*class="[^"]*likes[^"]*"[^>]*>([\s\S]*?)<\/span>/) || [])[1] || '');
        const views = clean((inner.match(/<span[^>]*class="[^"]*views[^"]*"[^>]*>([\s\S]*?)<\/span>/) || [])[1] || '');
        const date = clean((inner.match(/<span[^>]*class="[^"]*date[^"]*"[^>]*>([\s\S]*?)<\/span>/) || [])[1] || '');

        out.push({
            vod_id: id,
            vod_name: name,
            vod_pic: absUrl(pic, site),
            vod_remarks: dur,
            likes, views, date,
        });
    }
    return out;
}

/** 首页分区：[{name, list}] */
function parseSections(html) {
    const out = [];
    const re = /<section\b[^>]*data-feed-section="([^"]+)"[^>]*>/g;
    const marks = [];
    let m;
    while ((m = re.exec(html))) marks.push({ key: m[1], start: m.index, bodyStart: re.lastIndex });
    for (let i = 0; i < marks.length; i++) {
        const end = i + 1 < marks.length ? marks[i + 1].start : html.length;
        const block = html.slice(marks[i].bodyStart, end);
        const name = clean((block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/) || [])[1] || '');
        const list = parseCards(block);
        if (!name || !list.length) continue;
        if (out.some((x) => x.name === name)) continue;
        out.push({ name, list });
    }
    return out;
}

/* ────────────────────────────── 分类树 ────────────────────────────── */

const FALLBACK_CATS = [
    { type_id: 'aiduanju', type_name: 'AI短剧' },
    { type_id: '人妻系列-101', type_name: '人妻系列' },
    { type_id: '日韩精品-102', type_name: '日韩精品' },
    { type_id: '原创乱伦-104', type_name: '原创乱伦' },
    { type_id: '中文字幕-112', type_name: '中文字幕' },
    { type_id: '制服诱惑-113', type_name: '制服诱惑' },
    { type_id: 'sm重味-116', type_name: 'SM重味' },
    { type_id: '吃瓜黑料-120', type_name: '吃瓜黑料' },
    { type_id: '国产主播-124', type_name: '国产主播' },
];

let catCache = { at: 0, list: [] };

async function loadCats() {
    if (catCache.list.length && Date.now() - catCache.at < 30 * 60 * 1000) return catCache.list;
    try {
        const r = await getText(site + '/categories', { headers: siteHeaders() }, 2);
        const list = [];
        const seen = new Set();
        if (r.status === 200) {
            const re = /<a\b[^>]*class="[^"]*cat-all-item[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
            let m;
            while ((m = re.exec(r.text))) {
                const slug = decodeURIComponent((m[1].match(/\/category\/(.+)$/) || [])[1] || '');
                const name = clean(m[2]);
                if (!slug || !name || seen.has(slug)) continue;
                seen.add(slug);
                list.push({ type_id: slug, type_name: name });
            }
        }
        if (list.length) {
            catCache = { at: Date.now(), list };
            return list;
        }
    } catch { /* 走兜底 */ }
    return FALLBACK_CATS;
}

/** 大小写 / 编码 / 名字 → 站上真实 slug */
function normalizeSlug(raw, cats) {
    let s = String(raw || '').trim();
    if (!s) return '';
    try { s = decodeURIComponent(s); } catch { /* 保持原样 */ }
    s = s.replace(/^\/?category\//, '').replace(/^\/+|\/+$/g, '');
    if (!s) return '';
    if (s === 'latest' || s === 'hot') return s;

    const hit = cats.find((c) => c.type_id === s);
    if (hit) return hit.type_id;
    const low = s.toLowerCase();
    const byLow = cats.find((c) => c.type_id.toLowerCase() === low);
    if (byLow) return byLow.type_id;
    const byName = cats.find((c) => c.type_name === s);
    if (byName) return byName.type_id;

    const m = s.match(/^(.*?)-(\d+)$/);
    if (m) {
        const byName2 = cats.find((c) => c.type_name.toLowerCase() === m[1].toLowerCase());
        if (byName2) return byName2.type_id;
        return m[1].toLowerCase() + '-' + m[2];
    }
    return s;
}

/* ────────────────────────────── 页面地址 ────────────────────────────── */

function categoryUrl(slug, page) {
    const base = `${site}/category/${enc(slug)}`;
    return page > 1 ? `${base}?page=${page}` : base;
}
function latestUrl(page) {
    const base = `${site}/latest`;
    return page > 1 ? `${base}?page=${page}` : base;
}
function searchUrl(wd, page) {
    const base = `${site}/search?q=${enc(wd)}`;
    return page > 1 ? `${base}&page=${page}` : base;
}
function detailUrl(id) {
    return `${site}/video/${id}`;
}

/** 分页信息：本页有没有「加载更多」按钮 = 后面还有没有页 */
function hasMorePage(html) {
    return /class="[^"]*btn-load-more/.test(html) || /data-feed="[^"]*"[^>]*data-offset=/.test(html);
}

const lastPageCache = new Map();

/** 越界页会被站上回落成最后一页，用 feed 接口核对第一张卡是不是真的属于这一页 */
async function feedProbe(kind, slug, wd, page) {
    const offset = (page - 1) * PAGE_SIZE;
    let u = `${site}/api/feed?type=${kind}&offset=${offset}&limit=${PAGE_SIZE}`;
    if (kind === 'search') u += `&q=${enc(wd)}`;
    else if (slug) u += `&slug=${enc(slug)}`;
    try {
        const r = await getText(u, { headers: siteHeaders({ Accept: 'application/json' }) }, 2);
        if (r.status !== 200) return null;
        const j = JSON.parse(r.text);
        const list = parseCards(String(j.html || ''));
        return { count: Number(j.count || list.length), hasMore: !!j.hasMore, firstId: list.length ? list[0].vod_id : '' };
    } catch {
        return null;
    }
}

/**
 * 精确算最后一页：feed 在 offset = 末页*20 之后返回 count 0，
 * 二分找「第一个 count 为 0 的页」，只在页码翻过头 / 第一次踩到末页时付这点代价，结果缓存 10 分钟。
 */
async function findLastPage(kind, slug, wd, around) {
    const key = kind + '|' + (slug || '') + '|' + (wd || '');
    const hit = lastPageCache.get(key);
    if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.last;

    let lo = 1;
    let hi = Math.max(2, around || 1);
    for (let i = 0; i < 6; i++) {
        const pr = await feedProbe(kind, slug, wd, hi);
        if (!pr) return around || 1;
        if (pr.count === 0) break;
        lo = hi;
        hi *= 2;
    }
    while (lo + 1 < hi) {
        const mid = Math.floor((lo + hi) / 2);
        const pr = await feedProbe(kind, slug, wd, mid);
        if (!pr) break;
        if (pr.count === 0) hi = mid; else lo = mid;
    }
    const last = Math.max(1, hi - 1);
    lastPageCache.set(key, { at: Date.now(), last });
    return last;
}

/* ────────────────────────────── 详情解析 ────────────────────────────── */

/** 播放源按钮：data-url=/hls/proxy?url=<encoded m3u8> */
function parseSources(html) {
    const out = [];
    const re = /<button\b([^>]*class="[^"]*source-btn[^"]*"[^>]*)>([\s\S]*?)<\/button>/g;
    let m;
    while ((m = re.exec(html))) {
        const attrs = m[1];
        const label = clean(m[2]);
        const raw = decodeEnt((attrs.match(/data-url="([^"]*)"/) || [])[1] || '');
        const parseUrl = decodeEnt((attrs.match(/data-parse-url="([^"]*)"/) || [])[1] || '');
        const mode = (attrs.match(/data-mode="([^"]*)"/) || [])[1] || 'native';
        let target = raw;
        const qm = raw.match(/[?&]url=([^&]+)/);
        if (qm) {
            try { target = decodeURIComponent(qm[1]); } catch { target = qm[1]; }
        }
        if (!/^https?:\/\//i.test(target)) continue;
        const epM = label.match(/第\s*0*(\d+)\s*[集话期]/);
        out.push({
            label,
            mode,
            parseUrl,
            url: target,
            ep: epM ? parseInt(epM[1], 10) : 0,
        });
    }
    return out;
}

function parseDetailHtml(html, id) {
    const name = clean((html.match(/<h1[^>]*class="[^"]*play-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '')
        || clean((html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/) || [])[1] || '')
        || ('视频 ' + id);

    const pic = decodeEnt((html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]*)"/) || [])[1] || '');

    const metaBlock = (html.match(/<div[^>]*class="[^"]*play-meta[^"]*"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '';
    const catName = clean((metaBlock.match(/分类：\s*<a[^>]*>([\s\S]*?)<\/a>/) || [])[1] || '');
    const catHref = (metaBlock.match(/分类：\s*<a[^>]*href="([^"]+)"/) || [])[1] || '';
    const catSlug = catHref ? decodeURIComponent((catHref.match(/\/category\/(.+)$/) || [])[1] || '') : '';
    const duration = clean((metaBlock.match(/时长：\s*([^<]*)</) || [])[1] || '');
    const views = clean((metaBlock.match(/播放：\s*([^<]*)</) || [])[1] || '');
    const likes = clean((metaBlock.match(/点赞：\s*([^<]*)</) || [])[1] || '');
    const updated = clean((metaBlock.match(/更新：\s*([^<]*)</) || [])[1] || '');

    const desc = clean((html.match(/<div[^>]*class="[^"]*play-desc[^"]*"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '');

    const sources = parseSources(html);

    return { name, pic, catName, catSlug, duration, views, likes, updated, desc, sources };
}

/** 封面兜底：站上详情页的 og:image 有些是占位广告图，用搜索接口按标题找回同名卡片的封面 */
const picCache = new Map();
async function findCover(id, name) {
    const key = id + '|' + name;
    const hit = picCache.get(key);
    if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.pic;
    let pic = '';
    try {
        const kw = String(name || '').replace(/[《》【】\[\]]/g, ' ').trim().slice(0, 20);
        if (kw) {
            const r = await getText(`${site}/api/feed?type=search&offset=0&limit=20&q=${enc(kw)}`, { headers: siteHeaders({ Accept: 'application/json' }) }, 2);
            if (r.status === 200) {
                const j = JSON.parse(r.text);
                const list = parseCards(String(j.html || ''));
                const same = list.find((x) => String(x.vod_id) === String(id));
                if (same && same.vod_pic) pic = same.vod_pic;
            }
        }
    } catch { /* 拿不到就留空，不影响播放 */ }
    picCache.set(key, { at: Date.now(), pic });
    return pic;
}

/* ────────────────────────────── HLS 处理 ────────────────────────────── */

function playlistSegments(text) {
    const out = [];
    let keyUrl = '';
    let iv = '';
    for (const line of String(text || '').split('\n')) {
        const t = line.trim();
        if (!t) continue;
        if (t.startsWith('#')) {
            if (/^#EXT-X-KEY/i.test(t) && /METHOD=AES-128/i.test(t)) {
                keyUrl = (t.match(/URI="([^"]+)"/) || [])[1] || '';
                iv = (t.match(/IV=0x([0-9a-fA-F]+)/) || [])[1] || '';
            }
            continue;
        }
        out.push(t);
    }
    return { segs: out, keyUrl, iv, aes: /#EXT-X-KEY:METHOD=AES-128/i.test(text) };
}

function rewriteAbs(text, baseUrl) {
    const dir = baseUrl.replace(/[?#].*$/, '').replace(/\/[^/]*$/, '/');
    return String(text || '').split('\n').map((line) => {
        const t = line.trim();
        if (!t) return line;
        if (t.startsWith('#')) {
            return line.replace(/URI="([^"]+)"/g, (all, uri) => {
                if (/^https?:\/\//i.test(uri) || uri.startsWith('data:')) return all;
                return `URI="${absUrl(uri, dir)}"`;
            });
        }
        if (/^https?:\/\//i.test(t)) return line;
        return absUrl(t, dir);
    }).join('\n');
}

function decryptTs(buf, key, iv) {
    const d = crypto.createDecipheriv('aes-128-cbc', key, iv || Buffer.alloc(16));
    try {
        return Buffer.concat([d.update(buf), d.final()]);
    } catch {
        // 分片被截断 / padding 不对时尽量把解出来的部分给出去
        const d2 = crypto.createDecipheriv('aes-128-cbc', key, iv || Buffer.alloc(16));
        d2.setAutoPadding(false);
        return Buffer.concat([d2.update(buf), d2.final()]);
    }
}

function hexToIV(hex) {
    if (!hex) return Buffer.alloc(16);
    const h = String(hex).replace(/[^0-9a-fA-F]/g, '').padEnd(32, '0').slice(0, 32);
    return Buffer.from(h, 'hex');
}

const m3u8Cache = new Map();
async function getPlaylistText(url, force) {
    const k = url;
    const hit = m3u8Cache.get(k);
    if (!force && hit && Date.now() - hit.at < cfg.ttl * 1000) return hit.text;
    const r = await getText(url, { headers: siteHeaders() }, 3);
    if (r.status !== 200) throw new Error('m3u8 HTTP ' + r.status);
    m3u8Cache.set(k, { at: Date.now(), text: r.text });
    if (m3u8Cache.size > 200) {
        const first = m3u8Cache.keys().next().value;
        m3u8Cache.delete(first);
    }
    return r.text;
}

/* ────────────────────────────── 内置代理 ────────────────────────────── */

let proxyServer = null;
let proxyReady = null;
let proxyPort = 0;
const sessions = new Map();

/* 分片缓存 + 预取：上游单分片 ~2s，顺序播时先把下一个拉回来，播放器就不卡 */
const segCache = new Map();
const SEG_CACHE_MAX = 24;

function cachedSeg(url) {
    const hit = segCache.get(url);
    if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit;
    if (hit) segCache.delete(url);
    return null;
}

async function fetchSeg(url) {
    const hit = cachedSeg(url);
    if (hit) return hit.body;
    const gr = await getBuf(url, { headers: siteHeaders({ 'Accept': '*/*' }), timeout: 25000 }, 2);
    if (gr.status !== 200 && gr.status !== 206) throw new Error('seg HTTP ' + gr.status);
    segCache.set(url, { at: Date.now(), body: gr.body });
    if (segCache.size > SEG_CACHE_MAX) segCache.delete(segCache.keys().next().value);
    return gr.body;
}

function prefetchSegs(urls) {
    for (const u of urls) {
        if (!u || cachedSeg(u)) continue;
        fetchSeg(u).catch(() => {});
    }
}

function clientHost(inReq, port) {
    const h = String((inReq && inReq.headers && (inReq.headers['x-forwarded-host'] || inReq.headers.host)) || '')
        .split(',')[0].trim();
    const name = (cfg.proxyHost || h.split(':')[0] || '127.0.0.1').trim();
    return name + ':' + port;
}

function ensureProxy() {
    if (proxyReady) return proxyReady;
    proxyReady = new Promise((resolve) => {
        const srv = http.createServer((rq, rs) => handleProxyRequest(rq, rs));
        srv.on('error', () => { proxyReady = null; proxyServer = null; resolve(null); });
        srv.listen(cfg.proxyPort || 0, '0.0.0.0', () => {
            proxyPort = srv.address().port;
            proxyServer = srv;
            resolve(srv);
        });
        // 15 分钟清一次过期会话
        setInterval(() => {
            const now = Date.now();
            for (const [k, v] of sessions) if (now - v.at > 2 * 3600 * 1000) sessions.delete(k);
        }, 15 * 60 * 1000).unref();
    });
    return proxyReady;
}

function newSession(playUrl, extra = {}) {
    const sid = crypto.randomBytes(6).toString('hex');
    sessions.set(sid, {
        playUrl,
        at: Date.now(),
        segs: [],
        keyUrl: '',
        keyBuf: null,
        iv: '',
        decrypt: 0,
        ...extra,
    });
    return sid;
}

function sendBuf(rs, status, headers, body) {
    rs.writeHead(status, headers);
    rs.end(body);
}

async function handleProxyRequest(rq, rs) {
    try {
        const u = new URL(rq.url, 'http://127.0.0.1');
        const m = u.pathname.match(/^\/p\/([0-9a-f]+)\/(.+)$/);
        if (!m) return sendBuf(rs, 404, { 'Content-Type': 'text/plain' }, 'not found');
        const sess = sessions.get(m[1]);
        if (!sess) return sendBuf(rs, 404, { 'Content-Type': 'text/plain' }, 'session expired');
        sess.at = Date.now();
        const rest = m[2];

        if (rest === 'index.m3u8' || rest.endsWith('.m3u8')) {
            const text = await getPlaylistText(sess.playUrl);
            const info = playlistSegments(text);
            const host = rq.headers.host || ('127.0.0.1:' + proxyPort);

            sess.segs = info.segs.map((s) => absUrl(s, sess.playUrl));
            sess.keyUrl = info.keyUrl ? absUrl(info.keyUrl, sess.playUrl) : '';
            sess.iv = info.iv || '';
            sess.keyBuf = null;

            const decrypt = !!sess.decrypt && info.aes && !!sess.keyUrl;
            if (decrypt) {
                try {
                    const kr = await httpGet(sess.keyUrl, { headers: siteHeaders() });
                    if (kr.status === 200 && kr.body.length >= 16) sess.keyBuf = kr.body.slice(0, 16);
                } catch { /* 拿不到 key 就回原片，别把 KEY 行删了 */ }
            }
            const reallyDecrypt = !!(decrypt && sess.keyBuf);

            const out = [];
            for (const line of text.split('\n')) {
                const t = line.trim();
                if (!t) { out.push(''); continue; }
                if (t.startsWith('#')) {
                    if (/^#EXT-X-KEY/i.test(t) && sess.keyUrl) {
                        if (reallyDecrypt) continue; // 已本地解密，这条 KEY 必须去掉
                        out.push(`#EXT-X-KEY:METHOD=AES-128,URI="http://${host}/p/${m[1]}/key"` + (sess.iv ? `,IV=0x${sess.iv}` : ''));
                        continue;
                    }
                    out.push(line);
                    continue;
                }
                const idx = sess.segs.findIndex((x) => x === absUrl(t, sess.playUrl));
                const i = idx >= 0 ? idx : sess.segs.push(absUrl(t, sess.playUrl)) - 1;
                out.push(`http://${host}/p/${m[1]}/seg/${i}`);
            }

            return sendBuf(rs, 200, {
                'Content-Type': 'application/vnd.apple.mpegurl',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-cache',
            }, out.join('\n'));
        }

        if (rest === 'key') {
            if (!sess.keyUrl) return sendBuf(rs, 404, { 'Content-Type': 'text/plain' }, 'no key');
            const kr = await httpGet(sess.keyUrl, { headers: siteHeaders() });
            return sendBuf(rs, kr.status, {
                'Content-Type': 'application/octet-stream',
                'Content-Length': kr.body.length,
                'Access-Control-Allow-Origin': '*',
            }, kr.body);
        }

        const sm = rest.match(/^seg\/(\d+)/);
        if (!sm) return sendBuf(rs, 404, { 'Content-Type': 'text/plain' }, 'bad path');
        const idx = parseInt(sm[1], 10);
        const target = sess.segs[idx];
        if (!target) return sendBuf(rs, 404, { 'Content-Type': 'text/plain' }, 'no seg');

        const range = rq.headers.range;
        const head = rq.method === 'HEAD';

        if (sess.decrypt && sess.keyBuf && sess.keyUrl) {
            if (head) {
                return sendBuf(rs, 200, { 'Content-Type': 'video/mp2t', 'Accept-Ranges': 'bytes' }, '');
            }
            let raw;
            try { raw = await fetchSeg(target); } catch (e) {
                return sendBuf(rs, 502, { 'Content-Type': 'text/plain' }, 'upstream error');
            }
            let body;
            try { body = decryptTs(raw, sess.keyBuf, hexToIV(sess.iv)); } catch { body = raw; }
            prefetchSegs([sess.segs[idx + 1], sess.segs[idx + 2]]);
            return sendRanged(rs, body, range, 'video/mp2t');
        }

        // 注意：上游 CDN 对 Range 请求响应极慢（实测 30s+，全量只要 2s），
        // 所以一律全量拉回来、按客户端的 Range 自己切片，别把 Range 透传上去。
        let body;
        try { body = await fetchSeg(target); } catch (e) {
            return sendBuf(rs, 502, { 'Content-Type': 'text/plain' }, 'upstream error');
        }
        if (head) {
            return sendBuf(rs, 200, {
                'Content-Type': guessCT(target, null),
                'Content-Length': body.length,
                'Accept-Ranges': 'bytes',
                'Access-Control-Allow-Origin': '*',
            }, '');
        }
        prefetchSegs([sess.segs[idx + 1], sess.segs[idx + 2]]);
        return sendRanged(rs, body, range, guessCT(target, body));
    } catch (e) {
        try { sendBuf(rs, 502, { 'Content-Type': 'text/plain' }, 'proxy error'); } catch { /* ignore */ }
    }
}

function sendRanged(rs, body, range, ct) {
    if (range) {
        const m = String(range).match(/bytes=(\d*)-(\d*)/);
        if (m) {
            let start = m[1] ? parseInt(m[1], 10) : 0;
            let end = m[2] ? parseInt(m[2], 10) : body.length - 1;
            if (start >= body.length) start = 0;
            if (end >= body.length) end = body.length - 1;
            const part = body.slice(start, end + 1);
            return sendBuf(rs, 206, {
                'Content-Type': ct,
                'Content-Range': `bytes ${start}-${end}/${body.length}`,
                'Content-Length': part.length,
                'Accept-Ranges': 'bytes',
                'Access-Control-Allow-Origin': '*',
            }, part);
        }
    }
    return sendBuf(rs, 200, {
        'Content-Type': ct,
        'Content-Length': body.length,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
    }, body);
}

/** 伪装 png 的分片：看字节头判类型，别按扩展名 */
function guessCT(url, body) {
    if (/\.key(\?|$)/i.test(url)) return 'application/octet-stream';
    if (body && body.length && body[0] === 0x47) return 'video/mp2t';
    if (/\.m3u8(\?|$)/i.test(url)) return 'application/vnd.apple.mpegurl';
    if (/\.ts(\?|$)/i.test(url)) return 'video/mp2t';
    if (/\.(png|jpg|jpeg|gif|webp)(\?|$)/i.test(url)) return 'video/mp2t';
    return 'application/octet-stream';
}

/* ────────────────────────────── 播放决策 ────────────────────────────── */

function pickMode(inReq, text) {
    const p = String(cfg.proxy || 'auto').toLowerCase();
    if (p === 'direct') return 'direct';
    if (p === 'local') return 'local';
    const info = playlistSegments(text);
    const disguised = info.segs.some((s) => /\.(png|jpe?g|gif|webp)(\?|$)/i.test(s));
    const mixed = info.segs.some((s) => /^http:\/\//i.test(s));
    if (disguised || mixed) return 'local';
    return 'direct';
}

/** id 形式：144261 / 144261|2 / 144261@2 / /video/144261 */
function parseVodId(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return null;
    const u = s.match(/\/video\/(\d+)/);
    if (u) return { id: u[1], ep: 1 };
    const p = s.match(/^(\d+)\s*[|@]\s*(\d+)$/);
    if (p) return { id: p[1], ep: Math.max(1, parseInt(p[2], 10) || 1) };
    const d = s.match(/^(\d+)$/);
    if (d) return { id: d[1], ep: 1 };
    const any = s.match(/(\d{2,})/);
    return any ? { id: any[1], ep: 1 } : null;
}

const detailCache = new Map();
async function loadDetail(id, force) {
    const hit = detailCache.get(id);
    if (!force && hit && Date.now() - hit.at < cfg.ttl * 1000) return hit.data;
    const r = await getText(detailUrl(id), { headers: siteHeaders() }, 3);
    if (r.status !== 200) return null;
    const data = parseDetailHtml(r.text, id);
    detailCache.set(id, { at: Date.now(), data });
    if (detailCache.size > 300) detailCache.delete(detailCache.keys().next().value);
    return data;
}

/* ────────────────────────────── 壳子接口 ────────────────────────────── */

async function init(inReq) {
    applyExt(inReq);
    const cats = await loadCats();
    return {
        class: [
            { type_id: 'hot', type_name: '🔥 每日热播' },
            { type_id: 'latest', type_name: '🆕 最近更新' },
            ...cats.map((c) => ({ type_id: c.type_id, type_name: c.type_name })),
        ],
        filters: {},
    };
}

async function home(inReq) {
    applyExt(inReq);
    try {
        const r = await getText(site + '/', { headers: siteHeaders() }, 3);
        if (r.status !== 200) return { class: [] };
        const secs = parseSections(r.text);
        if (!secs.length) {
            const list = parseCards(r.text);
            return { class: list.length ? [{ name: '推荐', list }] : [] };
        }
        return {
            class: secs.map((s) => ({
                name: s.name,
                list: s.list.map((x) => ({
                    vod_id: x.vod_id,
                    vod_name: x.vod_name,
                    vod_pic: x.vod_pic,
                    vod_remarks: x.vod_remarks,
                })),
            })),
        };
    } catch {
        return { class: [] };
    }
}

async function category(inReq) {
    applyExt(inReq);
    const body = (inReq && inReq.body) || {};
    const page = Math.max(1, intOf(body.page || body.pg, 1));
    const rawId = String(body.id || body.tid || body.type_id || '').trim();

    const cats = await loadCats();
    const slug = normalizeSlug(rawId, cats);

    try {
        // 首页热播
        if (!slug || slug === 'hot') {
            const r = await getText(site + '/', { headers: siteHeaders() }, 3);
            if (r.status !== 200) return { page, pagecount: 1, list: [] };
            const secs = parseSections(r.text);
            const pick = secs.find((s) => s.name.includes('热播')) || secs[0] || { list: [] };
            return { page, pagecount: 1, list: pick.list.map((x) => ({ vod_id: x.vod_id, vod_name: x.vod_name, vod_pic: x.vod_pic, vod_remarks: x.vod_remarks })) };
        }

        const isLatest = slug === 'latest';
        const url = isLatest ? latestUrl(page) : categoryUrl(slug, page);
        const r = await getText(url, { headers: siteHeaders() }, 3);
        if (r.status !== 200) return { page, pagecount: page, list: [] };

        const list = parseCards(r.text);
        const more = hasMorePage(r.text);

        if (!more) {
            // 没有「加载更多」：要么是最后一页，要么页码翻过头被回落成最后一页
            const kind = isLatest ? 'latest' : 'category';
            const key = kind + '|' + (isLatest ? '' : slug) + '|';
            if (page > 1 && list.length) {
                const probe = await feedProbe(kind, isLatest ? '' : slug, '', page);
                if (probe && (probe.count === 0 || (probe.firstId && probe.firstId !== list[0].vod_id))) {
                    const last = await findLastPage(kind, isLatest ? '' : slug, '', page);
                    return { page, pagecount: last, list: [] };
                }
            }
            lastPageCache.set(key, { at: Date.now(), last: page });
            return { page, pagecount: page, list: list.map(toList) };
        }
        const cached = lastPageCache.get(isLatest ? 'latest||' : ('category|' + slug + '|'));
        const pc = Math.max(page + 1, (cached && Date.now() - cached.at < 10 * 60 * 1000) ? cached.last : 0);
        return { page, pagecount: pc, list: list.map(toList) };
    } catch (e) {
        return { page, pagecount: page, list: [] };
    }
}

function toList(x) {
    return { vod_id: x.vod_id, vod_name: x.vod_name, vod_pic: x.vod_pic, vod_remarks: x.vod_remarks };
}

async function detail(inReq) {
    applyExt(inReq);
    const p = parseVodId(((inReq && inReq.body) || {}).id);
    if (!p) return { list: [] };
    try {
        const d = await loadDetail(p.id);
        if (!d) return { list: [] };

        let pic = d.pic;
        if (!pic || /platform-permanent\.ddimg\.cn/.test(pic)) {
            const alt = await findCover(p.id, d.name);
            if (alt) pic = alt;
        }

        const eps = d.sources.length;
        const playUrl = eps
            ? d.sources.map((s) => {
                const label = eps > 1 ? (s.ep ? `第${String(s.ep).padStart(2, '0')}集` : (s.label || '线路')) : '正片';
                const epIdx = s.ep || (d.sources.indexOf(s) + 1);
                return `${label}$${p.id}|${epIdx}`;
            }).join('#')
            : '';

        const info = [];
        if (d.catName) info.push('分类：' + d.catName);
        if (d.duration && d.duration !== '0:00') info.push('时长：' + d.duration);
        if (d.views) info.push('播放：' + d.views);
        if (d.likes) info.push('点赞：' + d.likes);
        if (d.updated) info.push('更新：' + d.updated);

        let content = d.desc || '';
        if (info.length) content = (content ? content + '\n' : '') + info.join(' · ');

        return {
            list: [{
                vod_id: p.id,
                vod_name: d.name,
                vod_pic: pic || '',
                vod_content: content,
                vod_remarks: eps > 1 ? `共${eps}集` : (d.duration && d.duration !== '0:00' ? d.duration : ''),
                vod_play_from: '红裹视频',
                vod_play_url: playUrl,
            }],
        };
    } catch {
        return { list: [] };
    }
}

async function play(inReq) {
    applyExt(inReq);
    const p = parseVodId(((inReq && inReq.body) || {}).id);
    if (!p) return { parse: 0, url: '', header: {} };

    let src = null;
    try {
        const d = await loadDetail(p.id);
        if (d && d.sources.length) {
            src = d.sources.find((s) => s.ep === p.ep) || d.sources[p.ep - 1] || d.sources[0];
        }
    } catch { /* 落到下面返回空 */ }

    if (!src || !src.url) return { parse: 0, url: '', header: {} };

    const header = { 'User-Agent': UA, Referer: site + '/' };
    let text = '';
    try { text = await getPlaylistText(src.url); } catch { /* 拉不到 m3u8 就走直连，让播放器自己试 */ }

    const mode = text ? pickMode(inReq, text) : (String(cfg.proxy).toLowerCase() === 'local' ? 'local' : 'direct');

    if (mode === 'local') {
        try {
            const srv = await ensureProxy();
            if (srv) {
                let sid = null;
                for (const [k, v] of sessions) {
                    if (v.playUrl === src.url && v.decrypt === cfg.decrypt) { sid = k; break; }
                }
                if (!sid) sid = newSession(src.url, { decrypt: cfg.decrypt });
                const host = clientHost(inReq, proxyPort);
                return { parse: 0, url: `http://${host}/p/${sid}/index.m3u8`, header };
            }
        } catch { /* 起不来就退回直连 */ }
    }

    // 直连：上游 m3u8 里的相对地址站上本来就是绝对地址，直接把地址给播放器，最省资源
    return { parse: 0, url: src.url, header };
}

async function search(inReq) {
    applyExt(inReq);
    const body = (inReq && inReq.body) || {};
    const wd = String(body.wd || body.key || body.keyword || '').trim();
    const page = Math.max(1, intOf(body.page || body.pg, 1));
    if (!wd) return { page, pagecount: 1, list: [] };

    try {
        const r = await getText(searchUrl(wd, page), { headers: siteHeaders() }, 3);
        if (r.status !== 200) return { page, pagecount: page, list: [] };

        const totalM = r.text.match(/共\s*([\d,]+)\s*条/);
        const total = totalM ? parseInt(totalM[1].replace(/,/g, ''), 10) : 0;
        const pagecount = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1);

        if (total === 0) return { page: 1, pagecount: 1, list: [] };
        if (page > pagecount) return { page, pagecount, list: [] };

        return { page, pagecount, list: parseCards(r.text).map(toList) };
    } catch {
        return { page, pagecount: page, list: [] };
    }
}

/* ────────────────────────────── 代理路由（壳子直连用） ────────────────────────────── */

async function proxyStream(inReq, reply) {
    applyExt(inReq);
    try {
        const q = (inReq && inReq.query) || {};
        const target = decodeURIComponent(String(q.url || ''));
        if (!/^https?:\/\//i.test(target)) return reply.code(400).send('bad url');

        const r = await getBuf(target, { headers: siteHeaders({ 'Accept': '*/*' }), timeout: 25000 }, 3);

        const head = r.body.slice(0, 64).toString('utf8').trim();
        const isPlaylist = /\.m3u8(\?|$)/i.test(target) || head.startsWith('#EXTM3U');

        if (isPlaylist) {
            let text = rewriteAbs(r.body.toString('utf8'), target);
            const info = playlistSegments(text);
            const host = (inReq.headers && inReq.headers.host) || '';
            const path = (inReq && inReq.basePath) || '/spider/hgyng/3/proxy/stream';
            const base = host ? `http://${host}${path}` : '';
            if (base) {
                let keyBuf = null;
                const wantDecrypt = String(q.decrypt || '') === '1' || cfg.decrypt === 1;
                if (wantDecrypt && info.keyUrl) {
                    try {
                        const kr = await httpGet(absUrl(info.keyUrl, target), { headers: siteHeaders() });
                        if (kr.status === 200 && kr.body.length >= 16) keyBuf = kr.body.slice(0, 16);
                    } catch { /* ignore */ }
                }
                const lines = [];
                for (const line of text.split('\n')) {
                    const t = line.trim();
                    if (!t) { lines.push(''); continue; }
                    if (t.startsWith('#')) {
                        if (/^#EXT-X-KEY/i.test(t) && info.keyUrl) {
                            if (keyBuf) continue;
                            lines.push(`#EXT-X-KEY:METHOD=AES-128,URI="${base}?url=${enc(absUrl(info.keyUrl, target))}"` + (info.iv ? `,IV=0x${info.iv}` : ''));
                            continue;
                        }
                        lines.push(line);
                        continue;
                    }
                    let p = `${base}?url=${enc(absUrl(t, target))}`;
                    if (keyBuf) p += `&decrypt=1&key=${keyBuf.toString('hex')}&iv=${info.iv || '0'.repeat(32)}`;
                    lines.push(p);
                }
                text = lines.join('\n');
            }
            reply.header('Content-Type', 'application/vnd.apple.mpegurl');
            reply.header('Access-Control-Allow-Origin', '*');
            reply.header('Cache-Control', 'no-cache');
            return reply.send(Buffer.from(text, 'utf8'));
        }

        let body = r.body;
        const wantDecrypt = String(q.decrypt || '') === '1';
        if (wantDecrypt && q.key && /\.ts(\?|$)/i.test(target)) {
            try { body = decryptTs(body, Buffer.from(String(q.key), 'hex'), hexToIV(String(q.iv || ''))); } catch { /* 解不了给原片 */ }
        }
        // 上游 Range 慢，自己切片
        const range = inReq.headers && inReq.headers.range;
        if (range) {
            const m = String(range).match(/bytes=(\d*)-(\d*)/);
            if (m) {
                let start = m[1] ? parseInt(m[1], 10) : 0;
                let end = m[2] ? parseInt(m[2], 10) : body.length - 1;
                if (start >= body.length) start = 0;
                if (end >= body.length) end = body.length - 1;
                const part = body.slice(start, end + 1);
                reply.code(206);
                reply.header('Content-Range', `bytes ${start}-${end}/${body.length}`);
                reply.header('Content-Length', part.length);
                reply.header('Content-Type', guessCT(target, body));
                reply.header('Accept-Ranges', 'bytes');
                reply.header('Access-Control-Allow-Origin', '*');
                return reply.send(part);
            }
        }
        reply.header('Content-Type', guessCT(target, body));
        reply.header('Content-Length', body.length);
        reply.header('Accept-Ranges', 'bytes');
        reply.header('Access-Control-Allow-Origin', '*');
        return reply.send(body);
    } catch {
        return reply.code(502).send('');
    }
}

/* ────────────────────────────── 自检 ────────────────────────────── */

async function debug(inReq) {
    applyExt(inReq);
    const body = (inReq && inReq.body) || {};
    const p = parseVodId(body.id || body.code || '');
    const out = {
        version: VERSION,
        site,
        mode: { proxy: cfg.proxy, decrypt: cfg.decrypt, proxyHost: cfg.proxyHost || '(auto)' },
        parsed: p,
        steps: [],
    };
    if (!p) { out.steps.push({ step: 'id', ok: false, msg: 'id 解析失败' }); return out; }

    try {
        const r = await getText(detailUrl(p.id), { headers: siteHeaders() }, 2);
        out.steps.push({ step: '详情页', url: detailUrl(p.id), status: r.status, bytes: r.text.length });
        if (r.status !== 200) return out;

        const d = parseDetailHtml(r.text, p.id);
        out.steps.push({
            step: '解析',
            name: d.name,
            cat: d.catName,
            duration: d.duration,
            sources: d.sources.length,
            labels: d.sources.map((s) => s.label),
        });

        const src = d.sources.find((s) => s.ep === p.ep) || d.sources[p.ep - 1] || d.sources[0];
        if (!src) { out.steps.push({ step: '片源', ok: false, msg: '页面上没有可用播放源' }); return out; }
        out.steps.push({ step: '选中片源', label: src.label, m3u8: src.url });

        const pl = await getText(src.url, { headers: siteHeaders() }, 2);
        const text = pl.text;
        const info = playlistSegments(text);
        out.steps.push({
            step: 'm3u8',
            status: pl.status,
            bytes: text.length,
            isPlaylist: /^\s*#EXTM3U/i.test(text),
            aes: info.aes,
            segments: info.segs.length,
            key: info.keyUrl || '',
            iv: info.iv || '',
        });
        if (!info.segs.length) return out;

        const first = absUrl(info.segs[0], src.url);
        try {
            const segR = await getBuf(first, { headers: siteHeaders({ Range: 'bytes=0-1023' }), timeout: 25000 }, 3);
            const sync = segR.body.length ? segR.body[0] : 0;
            out.steps.push({
                step: '首个分片',
                url: first,
                status: segR.status,
                bytes: segR.body.length,
                contentType: segR.headers['content-type'],
                contentRange: segR.headers['content-range'] || '',
                firstByte: '0x' + sync.toString(16),
                cleanTS: sync === 0x47,
                encrypted: info.aes && sync !== 0x47,
            });
        } catch (e) {
            out.steps.push({ step: '首个分片', url: first, ok: false, message: e && e.message });
        }

        if (info.keyUrl) {
            try {
                const kr = await getBuf(absUrl(info.keyUrl, src.url), { headers: siteHeaders() }, 2);
                out.steps.push({ step: 'KEY', status: kr.status, bytes: kr.body.length, ok: kr.body.length === 16 });
            } catch (e) {
                out.steps.push({ step: 'KEY', ok: false, message: e && e.message });
            }
        }

        const mode = pickMode(inReq, text);
        out.steps.push({
            step: '播放模式',
            mode,
            decrypt: cfg.decrypt ? '开' : '关',
            note: mode === 'local' ? '分片是伪装 png 或 http，走插件内置代理' : '明文 https 分片，直连给播放器',
        });
        out.steps.push({ step: '播放地址', url: (await play(inReq)).url });
    } catch (e) {
        out.steps.push({ step: 'error', message: e && e.message });
    }
    return out;
}

/* ────────────────────────────── 导出 ────────────────────────────── */

/** 不挂壳子也能直接跑：node hgyng.js 起一个 http 服务 */
function handler(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    let path = url.pathname.replace(/^.*?(?=\/(init|home|category|detail|play|search|debug|proxy)\b)/, '');
    if (!path.startsWith('/')) path = url.pathname;
    const query = Object.fromEntries(url.searchParams.entries());
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
        let body = {};
        if (chunks.length) {
            try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { body = {}; }
        }
        const inReq = { body, query, headers: req.headers, method: req.method, ext: body.ext, basePath: path };
        const reply = {
            _code: 200,
            _headers: {},
            code(n) { this._code = n; return this; },
            header(k, v) { this._headers[k] = v; return this; },
            send(v) {
                const buf = Buffer.isBuffer(v) ? v : Buffer.from(String(v == null ? '' : v), 'utf8');
                if (!this._headers['Content-Type']) this._headers['Content-Type'] = 'application/json; charset=utf-8';
                res.writeHead(this._code, this._headers);
                res.end(buf);
            },
        };
        try {
            if (path === '/proxy/stream') return await proxyStream(inReq, reply);
            let data;
            if (path === '/init') data = await init(inReq);
            else if (path === '/home') data = await home(inReq);
            else if (path === '/category') data = await category(inReq);
            else if (path === '/detail') data = await detail(inReq);
            else if (path === '/play') data = await play(inReq);
            else if (path === '/search') data = await search(inReq);
            else if (path === '/debug') data = await debug(inReq);
            else { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
            reply.send(JSON.stringify(data));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('error: ' + (e && e.message));
        }
    });
}

export default {
    meta: { key: 'hgyng', name: '💋红裹视频', type: 3, version: VERSION },
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
