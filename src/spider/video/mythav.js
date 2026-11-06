import { load } from 'cheerio';
import req from '../../util/req.js';
import http from 'http';
import crypto from 'crypto';

/**
 * MythAV 解析插件  (meta.type = 3)
 *
 * 站点：mythav.org（WordPress + WP-Script 模板，同 CMS 系可在 ext 里换域名）
 *
 * 站点结构（实测）：
 *   最新上传   /update/        分页 /update/page/N/
 *   新发布     /release/       分页 /release/page/N/  ；老片 /release/old/
 *   分类       /site/{id}/{slug}/   分页 /site/{id}/{slug}/page/N/
 *   标签       /tag/{id}/{slug}/    分页 /tag/{id}/{slug}/page/N/
 *   演员       /actress/{id}/{slug}/
 *   搜索       /search/?s={关键词}  分页 /search/page/N/?s={关键词}
 *   详情       /video/{post_id}/code-{code}/{slug}
 *
 * 列表卡片（全站一套皮肤）：
 *   <article class="loop-video thumb-block post-{id}">
 *     <a href="/video/{id}/code-{code}/{slug}" title="[code] 标题">
 *       <img data-src="/i.php?i=/{code}/cover-t.jpg">
 *       <span class="duration">02:04:29</span>
 *   </article>
 *
 * 片源链路（三段，全部实测）：
 *   1) 详情页 .happy-sidebar a[data-value] → https://{site}/player/r.php?r={base64}
 *      base64 解开 = https://upload18.org/play/index/{code}?ref=mythav.org
 *   2) 播放页里 window.PLAYER_CONFIG.m3u8 → https://helvid.com/m/{base64路径}?e=&h=&s=&x=&d=&i=&v=&k=
 *      直连拿到的是 "U18E" 封装包（单字节替换 + UTF-8），要用 URL 里的 k/s 两个参数当密钥解
 *      解开是 "紧凑播放列表"：每行 \x01{路径}\x02{h签名&sn&sd}\x03，首行 #U18C1 给 base/exp/query
 *   3) 展开成标准 m3u8，分片是 helvid.com 上的**明文 MPEG-TS**（0x47 开头），支持 Range，不需要 AES 解密
 *
 * 两个必须知道的点：
 *   - helvid 的 m3u8 / 分片都校验 `sec-fetch-site: cross-site`，少这个头直接 403。
 *     播放器（ffmpeg / 盒子播放器）不会发这个头，所以默认走插件内置代理转发。
 *   - 签名带 IP 段（i=1.2.3.0/24）和过期时间（x=，约 2 小时）。插件跑在 A 机、播放器在别的网段时，
 *     分片会 403；且长片播到一小时后签名过期，代理会自动换新签名重试。
 *
 * CF 说明：mythav.org 挂在全站 Cloudflare 挑战下，机房 IP 基本必吃 403 挑战页。
 *   ext 里配 cookie（cfClearance）就能过：浏览器打开站过一次验证 → F12 → 复制 Cookie 里的
 *   cf_clearance=... 整段贴进来即可。家用宽带通常直连就能通，不用配。
 *
 * ext 可选配置：
 *   site          覆盖站点域名，如 https://别的镜像.cc
 *   cookie        cf_clearance=xxx（Cloudflare 挑战用）
 *   userAgent     覆盖 UA（跟 cookie 配套，换 UA 会让 cf_clearance 失效）
 *   proxy         auto(默认) | local（强制本地代理） | direct（直接把上游地址给播放器）
 *   proxyHost     播放器访问不到壳子 Host 时手填局域网 IP
 *   proxyPort     固定本地代理端口
 *   ttl           m3u8 明文缓存秒数，默认 300；到期或快过期自动重新签名
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const DEFAULT_SITE = 'https://mythav.org';
const PLAYER_HOST = 'https://upload18.org';
const PORT = process.env.DEV_HTTP_PORT || 9988;

let site = DEFAULT_SITE;
const cfg = { proxy: 'auto', proxyHost: '', proxyPort: 0, cookie: '', userAgent: '', ttl: 300 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ────────────────────────────── 基础工具 ────────────────────────────── */

function absUrl(p) {
    const raw = String(p || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return 'https:' + raw;
    return site + (raw.startsWith('/') ? raw : '/' + raw);
}

function e64(s) {
    try { return Buffer.from(String(s || ''), 'utf-8').toString('base64'); } catch { return ''; }
}

function d64(s) {
    try { return Buffer.from(String(s || ''), 'base64').toString('utf-8'); } catch { return ''; }
}

function stripTags(s) {
    return String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ').trim();
}

/** 站内地址一律记「路径」，换镜像域名后 id 不失效 */
function toPath(u) {
    const raw = String(u || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) {
        try {
            const x = new URL(raw);
            return (x.pathname + x.search) || '/';
        } catch { return raw; }
    }
    return raw;
}

/** 从 /video/129128/code-ktkp-067/slug 里取 code → ktkp-067 */
function codeOf(p) {
    const m = String(p || '').match(/\/code-([^/?#]+)/i);
    return m ? decodeURIComponent(m[1]) : '';
}

/** 封面 CDN 用大写 code */
function picOf(p) {
    const code = codeOf(p);
    return code ? code.toUpperCase() : '';
}

function ua() {
    return cfg.userAgent || UA;
}

function isChallenge(html, status) {
    const s = String(html || '');
    if (/cf-mitigated|Just a moment|_cf_chl_opt|cf-browser-verification|challenge-platform/i.test(s.slice(0, 6000))) return true;
    return status === 403 && /cloudflare/i.test(s.slice(0, 3000));
}

/* ────────────────────────── U18E 封装包解密（实测还原） ────────────────────────── */

const U18_MAGIC = [85, 49, 56, 69]; // "U18E"

function u18Mul(f, h) {
    const c = f >>> 16 & 65535, s = f & 65535, g = h >>> 16 & 65535, l = h & 65535;
    return s * l + (c * l + s * g << 16 >>> 0) | 0;
}
function u18Fnv(f) {
    let h = 2166136261;
    for (let c = 0; c < f.length; c++) { h ^= f.charCodeAt(c) & 255; h = u18Mul(h, 16777619) >>> 0; }
    return h >>> 0;
}
function u18Rng(f) {
    let h = f | 0;
    return function () {
        h = h + 1831565813 | 0;
        let c = u18Mul(h ^ h >>> 15, 1 | h);
        c = c + u18Mul(c ^ c >>> 7, 61 | c) ^ c;
        return (c ^ c >>> 14) >>> 0;
    };
}
function u18Ksa(f, h) {
    const c = [];
    for (let s = 0; s < 256; s++) c[s] = s;
    const A = u18Rng(u18Fnv('u18e1|' + f + '|' + h));
    for (let s = 255; s > 0; s--) {
        const g = A() % (s + 1);
        const l = c[s]; c[s] = c[g]; c[g] = l;
    }
    return c;
}
/** KSA 结果的逆置换：拿它做单字节替换，替换完就是 UTF-8 明文 */
function u18Map(f, h) {
    const c = u18Ksa(f, h), s = [];
    for (let g = 0; g < 256; g++) s[c[g]] = g;
    return s;
}
function u18Utf8(f, h, c) {
    let l = h, A = f.length, x = f;
    if (c) {
        x = new Uint8Array(A - h);
        for (let H = h; H < A; H++) x[H - h] = c[f[H]];
        l = 0; A = x.length;
    }
    const g = [];
    while (l < A) {
        const E = x[l++];
        let T, M, N, D;
        if (E < 128) T = E;
        else if (E >= 194 && E < 224 && l < A && (x[l] & 192) === 128) T = (E & 31) << 6 | x[l++] & 63;
        else if (E >= 224 && E < 240 && l + 1 < A && (x[l] & 192) === 128 && (x[l + 1] & 192) === 128) {
            M = x[l++]; N = x[l++]; T = (E & 15) << 12 | (M & 63) << 6 | N & 63;
            if (T < 2048 || (T >= 55296 && T <= 57343)) T = 65533;
        } else if (E >= 240 && E < 245 && l + 2 < A && (x[l] & 192) === 128 && (x[l + 1] & 192) === 128 && (x[l + 2] & 192) === 128) {
            M = x[l++]; N = x[l++]; D = x[l++];
            T = (E & 7) << 18 | (M & 63) << 12 | (N & 63) << 6 | D & 63;
            if (T < 65536 || T > 1114111) T = 65533;
        } else T = 65533;
        if (T > 65535) { T -= 65536; g.push(55296 + (T >> 10), 56320 + (T & 1023)); }
        else g.push(T);
    }
    return Buffer.from(Uint16Array.from(g).buffer).toString('utf16le');
}
function u18IsEnvelope(s) {
    return s.length >= 8 && s[0] === U18_MAGIC[0] && s[1] === U18_MAGIC[1] && s[2] === U18_MAGIC[2] && s[3] === U18_MAGIC[3];
}
function qparam(url, name) {
    const c = String(url || '');
    const s = c.indexOf('?');
    if (s < 0) return '';
    const g = c.indexOf('#', s);
    const parts = c.slice(s + 1, g < 0 ? c.length : g).split('&');
    for (const one of parts) {
        const x = one.indexOf('=');
        let k = x < 0 ? one : one.slice(0, x);
        let v = x < 0 ? '' : one.slice(x + 1);
        try { k = decodeURIComponent(k.replace(/\+/g, ' ')); v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch { continue; }
        if (k === name) return v;
    }
    return '';
}

/** 密文 → 紧凑播放列表文本；不是封装包就原样当 UTF-8 */
function u18Decode(buf, url) {
    const u = new Uint8Array(buf.buffer ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : buf);
    if (!u18IsEnvelope(u)) return u18Utf8(u, 0, null);
    if (u[4] !== 1) throw new Error('u18e 版本不支持: ' + u[4]);
    if ((u[5] & ~1) !== 0) throw new Error('u18e 标志不支持: ' + u[5]);
    const text = u18Utf8(u, 8, u18Map(qparam(url, 'k'), qparam(url, 's')));
    return (u[5] & 1) ? u18Expand(text) : text;
}

/**
 * 紧凑播放列表展开：
 *   #U18C1 B={base} E={exp} Q={query}
 *   \x01{路径}\x02{签名&sn&sd}\x03
 * → {base}{路径}?e={exp}&h={签名}&sn&sd&{query}
 */
function u18Expand(text) {
    const lines = String(text || '').split('\n');
    const head = lines[0] || '';
    if (head.indexOf('#U18C1 ') !== 0) return text;
    const B = (head.match(/B=(\S+)/) || [])[1] || '';
    const E = (head.match(/\sE=(\S+)/) || [])[1] || '';
    const Q = (head.match(/\sQ=(\S+)/) || [])[1] || '';
    if (!B) return text;
    const out = [];
    for (let i = 1; i < lines.length; i++) {
        let l = lines[i];
        if (l.indexOf('#U18-CANARY') >= 0) continue;           // 校验用行，播放器用不上
        if (l.indexOf('\x01') >= 0) {
            l = l.replace(/\x01/g, B)
                .replace(/\x02/g, '?e=' + E + '&h=')
                .replace(/\x03/g, '&' + Q);
        }
        out.push(l);
    }
    return out.join('\n');
}

/* ────────────────────────────── 请求封装 ────────────────────────────── */

function siteHeaders(referer) {
    const h = {
        'User-Agent': ua(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: referer || (site + '/'),
    };
    if (cfg.cookie) h.Cookie = cfg.cookie;
    return h;
}

async function request(url, opts = {}) {
    const { headers = {}, retries = 3, binary = false } = opts;
    let lastErr = null;
    for (let i = 0; i <= retries; i++) {
        try {
            const resp = await req.get(url, {
                headers,
                timeout: 30000,
                responseType: binary ? 'arraybuffer' : 'text',
                validateStatus: () => true,
                decompress: true,
                maxRedirects: 5,
            });
            const status = (resp && (resp.status || resp.statusCode)) || 200;
            if ((status === 429 || status === 502 || status === 503) && i < retries) {
                const ra = parseInt(((resp && resp.headers) || {})['retry-after'], 10);
                await sleep(ra > 0 ? ra * 1000 : 1200 * (i + 1));
                continue;
            }
            return { status, data: resp ? resp.data : '', headers: (resp && resp.headers) || {} };
        } catch (e) {
            lastErr = e;
            if (i < retries) { await sleep(600 * (i + 1)); continue; }
        }
    }
    throw lastErr || new Error('request failed: ' + url);
}

async function requestHtml(url, referer) {
    const r = await request(url, { headers: siteHeaders(referer) });
    const txt = typeof r.data === 'string' ? r.data : Buffer.from(r.data || '').toString('utf-8');
    if (isChallenge(txt, r.status)) {
        const err = new Error('CF_CHALLENGE');
        err.code = 'CF';
        throw err;
    }
    if (r.status >= 400) throw new Error('HTTP ' + r.status + ' ' + url);
    return txt;
}

/** 播放站的请求头：sec-fetch-site 是硬要求，少这个直接 403 */
function playerHeaders(extra) {
    return Object.assign({
        'User-Agent': ua(),
        Referer: PLAYER_HOST + '/',
        Origin: PLAYER_HOST,
        Accept: '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'sec-fetch-site': 'cross-site',
        'sec-fetch-mode': 'cors',
        'sec-fetch-dest': 'empty',
    }, extra || {});
}

/* ────────────────────────────── 图片 ────────────────────────────── */

function getProxyBase(inReq) {
    const prefix = (inReq && inReq.server && inReq.server.prefix) || '/spider/mythav/3';
    const host = String(
        (inReq && inReq.headers && (inReq.headers['x-forwarded-host'] || inReq.headers.host)) || ''
    ).split(',')[0].trim();
    if (host) {
        const proto = String((inReq && inReq.headers && inReq.headers['x-forwarded-proto']) || 'http').split(',')[0].trim();
        return `${proto}://${host}${prefix}`;
    }
    return `http://127.0.0.1:${PORT}${prefix}`;
}

/** 封面走本地代理：优先站外封面 CDN（不吃 CF），失败再回源站点 */
function proxyPic(p, inReq) {
    const code = picOf(p);
    if (!code) return '';
    return `${getProxyBase(inReq)}/img?c=${encodeURIComponent(code)}`;
}

function picCandidates(code) {
    const raw = String(code || '').trim();
    if (!raw) return [];
    const out = [];
    const push = (u) => { if (u && !out.includes(u)) out.push(u); };
    push(`${PLAYER_HOST.replace('upload18.org', 'upload18.cc')}/v/${raw}/poster.jpg`);
    // 带 -uncensored-leak / -english-subtitle 这类后缀的，CDN 上一般用不带后缀的版本
    const base = raw.replace(/-(uncensored-leak|english-subtitle|chinese-subtitle|leak|subtitle)$/i, '');
    if (base !== raw) push(`${PLAYER_HOST.replace('upload18.org', 'upload18.cc')}/v/${base}/poster.jpg`);
    push(absUrl(`/i.php?i=/${base.toLowerCase()}/cover-n.jpg`));
    return out;
}

async function imgProxy(inReq, reply) {
    try {
        let raw = String((inReq.query && inReq.query.c) || '').trim();
        if (!raw && inReq.query && inReq.query.url) raw = d64(inReq.query.url);
        if (!raw) return reply.code(404).send('');

        let buf = null, status = 404;
        if (/^https?:\/\//i.test(raw)) {
            const r = await request(raw, { headers: playerHeaders(), binary: true, retries: 1 });
            status = r.status;
            if (r.status === 200 && r.data) buf = Buffer.isBuffer(r.data) ? r.data : Buffer.from(r.data);
        } else {
            for (const cand of picCandidates(raw)) {
                try {
                    const r = await request(cand, { headers: /upload18/.test(cand) ? playerHeaders() : siteHeaders(), binary: true, retries: 1 });
                    status = r.status;
                    if (r.status === 200 && r.data) {
                        buf = Buffer.isBuffer(r.data) ? r.data : Buffer.from(r.data);
                        if (buf.length > 200) break;
                        buf = null;
                    }
                } catch { /* 下一个候选 */ }
            }
        }
        if (!buf || !buf.length) return reply.code(status >= 400 ? status : 502).send('');

        let ct = 'image/jpeg';
        if (buf[0] === 0x89 && buf[1] === 0x50) ct = 'image/png';
        else if (buf.slice(0, 4).toString() === 'GIF8') ct = 'image/gif';
        else if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') ct = 'image/webp';

        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Cache-Control', 'public, max-age=86400');
        return reply.header('Content-Type', ct).send(buf);
    } catch (e) {
        console.error('mythav imgProxy error:', e && e.message);
        return reply.code(500).send('');
    }
}

/* ────────────────────────────── 列表解析 ────────────────────────────── */

function cleanTitle(t) {
    return stripTags(t)
        .replace(/^\s*(?:[A-Z][a-z]{2}\s+\d{1,2}\s*:?\s*)/, '')   // 卡片里那个 "Aug 11:" 日期前缀
        .replace(/\s*[-\u2013\u2014|]\s*MythAV[^-]*$/i, '')
        .trim();
}

function parseVods(html, inReq) {
    const $ = load(html);
    const seen = new Set();
    const list = [];

    const push = (href, title, pic, dur, views) => {
        const path = toPath(href);
        if (!path || !/\/video\/\d+/.test(path)) return;
        if (seen.has(path)) return;
        const name = cleanTitle(title);
        if (!name) return;
        seen.add(path);
        list.push({
            vod_id: path,
            vod_name: name,
            vod_pic: proxyPic(path, inReq),
            vod_remarks: stripTags(dur) || (stripTags(views) ? stripTags(views) + ' 次' : ''),
        });
    };

    $('article.loop-video, article.thumb-block, .videos-list article').each((i, el) => {
        const node = $(el);
        const a = node.find('a[href*="/video/"]').first();
        const href = a.attr('href') || '';
        const img = node.find('img').first();
        const title = a.attr('title') || node.find('.entry-header').first().text() || img.attr('alt') || '';
        const pic = img.attr('data-src') || img.attr('data-original') || img.attr('src') || '';
        const dur = node.find('.duration').first().text().trim();
        const views = node.find('.views').first().text().trim();
        push(href, title, pic, dur, views);
    });

    // 兜底：没有卡片壳但有 /video/ 链接的页面（老模板 / 相关推荐）
    if (!list.length) {
        $('a[href*="/video/"]').each((i, el) => {
            const a = $(el);
            const href = a.attr('href') || '';
            const title = a.attr('title') || a.text() || '';
            const img = a.find('img').first();
            push(href, title, img.attr('data-src') || img.attr('src') || '', '', '');
        });
    }
    return list;
}

/** 总页数：pagination 里最大的 /page/N/，没有就按本页有没有数据判断 */
function parsePageCount(html, page, listLen) {
    const t = String(html || '');
    const nums = [];
    const re = /href="[^"]*\/page\/(\d+)\/?"/g;
    let m;
    while ((m = re.exec(t))) {
        const n = parseInt(m[1], 10);
        if (n > 0) nums.push(n);
    }
    if (nums.length) return Math.max(...nums);
    return listLen > 0 ? page + 1 : page;
}

function listUrl(tid, page) {
    const id = String(tid || 'update').trim().replace(/^\/+/, '').replace(/\/+$/, '');
    const base = '/' + id + '/';
    return page <= 1 ? absUrl(base) : absUrl(base + 'page/' + page + '/');
}

/* ────────────────────────────── 详情 ────────────────────────────── */

function extractEmbedPages(html) {
    const out = [];
    const push = (u) => {
        const v = String(u || '').trim();
        if (v && /^https?:\/\//i.test(v) && !out.includes(v)) out.push(v);
    };
    // 线路按钮：<a class="svrplaying" data-value="https://{site}/player/r.php?r={base64}">
    const re = /data-value=['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(String(html)))) {
        const raw = m[1].replace(/&amp;/g, '&');
        const b = raw.match(/[?&]r=([A-Za-z0-9+/=_-]+)/);
        if (b) {
            let s = b[1].replace(/-/g, '+').replace(/_/g, '/');
            while (s.length % 4) s += '=';
            const dec = d64(s);
            if (/^https?:\/\//i.test(dec)) push(dec);
        } else if (/^https?:\/\//i.test(raw)) {
            push(raw);
        }
    }
    // iframe 里的 embedURL（没有线路按钮时的兜底）
    const ifr = /<iframe[^>]+src="([^"]+)"/gi;
    while ((m = ifr.exec(String(html)))) {
        const raw = m[1].replace(/&amp;/g, '&');
        const b = raw.match(/[?&]r=([A-Za-z0-9+/=_-]+)/);
        if (b) {
            let s = b[1].replace(/-/g, '+').replace(/_/g, '/');
            while (s.length % 4) s += '=';
            const dec = d64(s);
            if (/^https?:\/\//i.test(dec)) push(dec);
        }
    }
    // 页面里直接写死 upload18 地址的
    const dir = /https?:\/\/upload18\.[a-z]+\/play\/index\/[^"'\s<>]+/gi;
    while ((m = dir.exec(String(html)))) push(m[0].replace(/&amp;/g, '&'));
    return out;
}

/** 详情页里的线路名，跟 data-value 一一对应，用来给多线路命名 */
function extractLines(html) {
    const $ = load(html);
    const out = [];
    $('.happy-sidebar a[data-value], a.svrplaying, a.svrwaiting').each((i, el) => {
        const t = stripTags($(el).text());
        if (t && !out.includes(t)) out.push(t);
    });
    return out;
}

function isoDurToText(iso) {
    const m = String(iso || '').match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return '';
    const d = parseInt(m[1] || 0, 10), h = parseInt(m[2] || 0, 10);
    const mi = parseInt(m[3] || 0, 10), s = parseInt(m[4] || 0, 10);
    const total = ((d * 24 + h) * 60 + mi) * 60 + s;
    if (!total) return '';
    const hh = Math.floor(total / 3600), mm = Math.floor(total % 3600 / 60), ss = total % 60;
    const p = (n) => String(n).padStart(2, '0');
    return (hh ? p(hh) + ':' : '') + p(mm) + ':' + p(ss);
}

async function detail(inReq) {
    const body = (inReq && inReq.body) || {};
    const rawId = String(body.id || body.vod_id || '').trim();
    if (!rawId) return { list: [] };
    const path = toPath(rawId);
    const url = absUrl(path);

    const html = await requestHtml(url, url);
    const $ = load(html);

    const name = stripTags(
        $('h1').first().text() ||
        $('meta[property="og:title"]').attr('content') ||
        $('title').text()
    ).replace(/\s*[-\u2013\u2014|]\s*MythAV[^-]*$/i, '').trim() || '未知标题';

    const durIso = $('meta[itemprop="duration"]').attr('content') || '';
    const dur = isoDurToText(durIso);
    const date = stripTags($('#video-date').text()).replace(/^Release date:\s*/i, '');
    const pic = proxyPic(path, inReq);

    const actors = [];
    $('#video-actors a').each((i, el) => { const t = stripTags($(el).text()); if (t) actors.push(t); });
    const labels = [];
    $('#video-author a, #video-maker a, #video-label a').each((i, el) => { const t = stripTags($(el).text()); if (t && !labels.includes(t)) labels.push(t); });
    const tags = [];
    $('.tags-list a.label').each((i, el) => { const t = stripTags($(el).text()); if (t) tags.push(t); });

    const desc = stripTags(
        $('.video-description .desc').first().text() ||
        $('meta[property="og:description"]').attr('content') ||
        $('meta[name="description"]').attr('content') ||
        ''
    ).replace(/^MythAV\.Org\s+Code:\s*/i, '');

    const embeds = extractEmbedPages(html);
    const lines = extractLines(html);

    const contentParts = [];
    if (desc) contentParts.push(desc);
    if (actors.length) contentParts.push('演员: ' + actors.join(' / '));
    if (labels.length) contentParts.push('厂牌: ' + labels.join(' / '));
    if (date) contentParts.push('发行: ' + date);
    if (tags.length) contentParts.push('标签: ' + tags.join(' / '));

    const remarks = [dur, embeds.length ? '多线路' : ''].filter(Boolean).join(' · ') || (date || '');

    const item = {
        vod_id: path,
        vod_name: name,
        vod_pic: pic,
        vod_content: contentParts.join('\n').slice(0, 1200),
        vod_remarks: remarks,
    };

    if (embeds.length) {
        // 线路名从 el 有序取，取不到就叫 线路N
        const from = (lines.length ? lines : embeds.map((_, i) => '线路' + (i + 1))).join('$$$');
        const urls = embeds.map((_, i) => `${(lines[i] || '线路' + (i + 1))}$${path}#ep${i}`).join('#');
        item.vod_play_from = from;
        item.vod_play_url = urls;
    } else {
        item.vod_play_from = 'MythAV';
        item.vod_play_url = '';
    }

    return { list: [item] };
}

/* ────────────────────────────── 播放链路 ────────────────────────────── */

/** 从播放页 HTML 里抠 window.PLAYER_CONFIG（括号计数，比正则稳） */
function extractPlayerConfig(html) {
    const t = String(html || '');
    const i = t.indexOf('window.PLAYER_CONFIG');
    if (i < 0) return null;
    const s = t.indexOf('{', i);
    if (s < 0) return null;
    let depth = 0, inStr = false, esc = false;
    for (let p = s; p < t.length; p++) {
        const ch = t[p];
        if (inStr) {
            if (esc) esc = false;
            else if (ch === '\\') esc = true;
            else if (ch === '"') inStr = false;
            continue;
        }
        if (ch === '"') { inStr = true; continue; }
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (!depth) {
                const raw = t.slice(s, p + 1);
                try { return JSON.parse(raw); } catch { return null; }
            }
        }
    }
    return null;
}

async function fetchPlayerConfig(detailPath, ep) {
    const target = absUrl(toPath(detailPath));
    const html = await requestHtml(target, target);
    const embeds = extractEmbedPages(html);
    if (!embeds.length) {
        const err = new Error('no embed');
        err.code = 'NO_EMBED';
        throw err;
    }
    // 点了第 N 条线路就先试第 N 条，失败再顺着往下试
    const order = [];
    const want = parseInt(ep, 10);
    if (want >= 0 && want < embeds.length) order.push(embeds[want]);
    for (const e of embeds) if (!order.includes(e)) order.push(e);
    let lastErr = null;
    for (const page of order) {
        try {
            const r = await request(page, { headers: siteHeaders(site + '/') });
            const ph = typeof r.data === 'string' ? r.data : Buffer.from(r.data || '').toString('utf-8');
            if (isChallenge(ph, r.status)) { lastErr = new Error('CF_CHALLENGE'); continue; }
            const pc = extractPlayerConfig(ph);
            if (pc && pc.m3u8) return { page, config: pc };
            lastErr = new Error('no PLAYER_CONFIG');
        } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('no player config');
}

/** 拉 m3u8：拿到的可能是 U18E 封装包，解完统一成标准 m3u8 文本 */
async function fetchPlaylistText(m3u8Url) {
    const r = await request(m3u8Url, { headers: playerHeaders(), binary: true, retries: 2 });
    if (r.status !== 200) throw new Error('m3u8 HTTP ' + r.status);
    const buf = Buffer.isBuffer(r.data) ? r.data : Buffer.from(r.data || []);
    if (buf.length > 4) fetchPlaylistText.lastEnvelope = u18IsEnvelope(new Uint8Array(buf.slice(0, 8)));
    let text = u18Decode(buf, m3u8Url);

    // master playlist：挑最高码率那档再取一次
    if (/#EXT-X-STREAM-INF/i.test(text)) {
        const lines = text.split(/\r?\n/);
        let best = '', bestScore = -1;
        for (let i = 0; i < lines.length; i++) {
            if (!/^#EXT-X-STREAM-INF/i.test(lines[i])) continue;
            const h = /RESOLUTION=(\d+)x(\d+)/i.exec(lines[i]);
            const bw = /BANDWIDTH=(\d+)/i.exec(lines[i]);
            const score = h ? parseInt(h[1], 10) * parseInt(h[2], 10) : (bw ? parseInt(bw[1], 10) : 0);
            let u = '';
            for (let j = i + 1; j < lines.length; j++) {
                if (lines[j].trim() && !lines[j].startsWith('#')) { u = lines[j].trim(); break; }
            }
            if (u && score > bestScore) { bestScore = score; best = u; }
        }
        if (best) {
            const next = /^https?:\/\//i.test(best) ? best : new URL(best, m3u8Url).toString();
            const r2 = await request(next, { headers: playerHeaders(), binary: true, retries: 2 });
            if (r2.status === 200) {
                const b2 = Buffer.isBuffer(r2.data) ? r2.data : Buffer.from(r2.data || []);
                text = u18Decode(b2, next);
            }
        }
    }
    if (!/#EXTM3U/.test(text)) throw new Error('解密后不是播放列表');
    // 明文返回时也可能带校验行，统一清掉
    if (text.indexOf('#U18-CANARY') >= 0) {
        text = text.split(/\r?\n/).filter((l) => l.indexOf('#U18-CANARY') < 0).join('\n');
    }
    return text;
}

/** 完整解析一段播放地址（详情页 → 播放页 → m3u8 → 解密 → 明文） */
async function resolveStream(detailPath, ep) {
    const { page, config } = await fetchPlayerConfig(detailPath, ep);
    fetchPlaylistText.lastEnvelope = null;
    const text = await fetchPlaylistText(config.m3u8);
    const exp = parseInt(qparam(config.m3u8, 'x') || '0', 10);
    return {
        text,
        page,
        m3u8Url: config.m3u8,
        // 上游直接给明文时，direct 模式可以把地址丢给播放器（前提是它能带 sec-fetch 头）
        plain: fetchPlaylistText.lastEnvelope === false,
        code: config.videoKey || '',
        exp: exp || (Math.floor(Date.now() / 1000) + 3600),
        poster: config.thumb || '',
    };
}


/* ────────────────────────────── 本地代理 ────────────────────────────── */

const sessions = new Map();
let proxyServer = null;
let proxyPort = 0;

function newSessionId() {
    return crypto.randomBytes(6).toString('hex');
}

function clientHost(inReq, port) {
    const h = String(
        (inReq && inReq.headers && (inReq.headers['x-forwarded-host'] || inReq.headers.host)) || ''
    ).split(',')[0].trim();
    const name = (cfg.proxyHost || h.split(':')[0] || '127.0.0.1').trim();
    return name + ':' + port;
}

/** 把明文 m3u8 里的分片改写成代理地址，顺带记下真实分片地址 */
function rewritePlaylist(text, sess, sid, host) {
    const lines = String(text || '').split(/\r?\n/);
    const out = [];
    sess.segs = [];
    for (const line of lines) {
        const t = line.trim();
        if (!t) { out.push(line); continue; }
        if (t.startsWith('#')) { out.push(t); continue; }
        const idx = sess.segs.length;
        sess.segs.push(/^https?:\/\//i.test(t) ? t : new URL(t, sess.base || site).toString());
        out.push(`http://${host}/mv/${sid}/seg/${idx}`);
    }
    return out.join('\n');
}

async function refreshSession(sess) {
    const r = await resolveStream(sess.detail, sess.ep);
    sess.text = r.text;
    sess.base = r.page;
    sess.exp = r.exp;
    sess.at = Date.now();
}

function ensureProxy() {
    if (proxyServer) return proxyServer;
    proxyServer = http.createServer(async (rq, rs) => {
        const cors = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
            'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges',
        };
        if (rq.method === 'OPTIONS') { rs.writeHead(204, cors); return rs.end(); }
        try {
            const u = new URL(rq.url, 'http://127.0.0.1');
            const m = u.pathname.match(/^\/mv\/([0-9a-f]+)\/(playlist\.m3u8|seg\/\d+)$/);
            const sess = m ? sessions.get(m[1]) : null;
            if (!sess) { rs.writeHead(404, cors); return rs.end('no session'); }

            const host = rq.headers.host || ('127.0.0.1:' + proxyPort);
            const now = Math.floor(Date.now() / 1000);

            if (m[2] === 'playlist.m3u8') {
                // 缓存到期或签名快过期就重新签一次
                if (!sess.text || now > sess.exp - 300 || Date.now() - sess.at > cfg.ttl * 1000) {
                    try { await refreshSession(sess); } catch (e) {
                        if (!sess.text) { rs.writeHead(502, cors); return rs.end('upstream: ' + ((e && e.message) || e)); }
                    }
                }
                const out = rewritePlaylist(sess.text, sess, m[1], host);
                rs.writeHead(200, { ...cors, 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-cache' });
                return rs.end(out);
            }

            const idx = parseInt(m[2].split('/')[1], 10);
            let seg = sess.segs[idx];
            if (!seg) { rs.writeHead(404, cors); return rs.end('no seg'); }

            const pull = async (target) => {
                const h = playerHeaders();
                if (rq.headers.range) h.Range = rq.headers.range;
                return request(target, { headers: h, binary: true, retries: 1 });
            };

            let r = await pull(seg);
            // 分片签名过期 / 地址失效：重新签一次再试
            if (r.status === 403 || r.status === 404 || r.status === 410) {
                try {
                    await refreshSession(sess);
                    const np = rewritePlaylist(sess.text, sess, m[1], host);
                    void np;
                    seg = sess.segs[idx];
                    if (seg) r = await pull(seg);
                } catch { /* 保持原结果 */ }
            }
            if (r.status !== 200 && r.status !== 206) { rs.writeHead(502, cors); return rs.end('upstream ' + r.status); }

            const buf = Buffer.isBuffer(r.data) ? r.data : Buffer.from(r.data || []);
            const head = { ...cors, 'Content-Type': 'video/mp2t', 'Accept-Ranges': 'bytes' };
            if (r.headers && r.headers['content-range']) head['Content-Range'] = String(r.headers['content-range']);
            if (r.headers && r.headers['content-length']) head['Content-Length'] = String(r.headers['content-length']);
            else head['Content-Length'] = buf.length;
            rs.writeHead(r.status, head);
            return rs.end(buf);
        } catch (e) {
            rs.writeHead(500, cors);
            return rs.end(String((e && e.message) || 'err'));
        }
    });
    proxyServer.on('error', (e) => { console.error('mythav proxy error:', e && e.message); proxyServer = null; });
    proxyPort = cfg.proxyPort || 0;
    proxyServer.listen(proxyPort, '0.0.0.0');
    proxyServer.on('listening', () => { proxyPort = proxyServer.address().port; });
    return proxyServer;
}

async function play(inReq) {
    const body = (inReq && inReq.body) || {};
    let rawId = String(body.id || body.url || '').trim();
    if (!rawId) return { parse: 0, url: '', header: {} };

    // 详情里给的是 "/video/1/code-x/slug#ep0"，取路径部分
    const epMatch = rawId.match(/#ep(\d+)/i);
    const ep = epMatch ? parseInt(epMatch[1], 10) : -1;
    rawId = rawId.split('#')[0].trim();
    if (/\.m3u8/i.test(rawId) && /^https?:\/\//i.test(rawId)) {
        return { parse: 0, url: rawId, header: playerHeaders() };
    }
    const path = toPath(rawId);

    const mode = String(cfg.proxy || 'auto').toLowerCase();
    if (mode !== 'direct') {
        try {
            ensureProxy();
            for (let i = 0; i < 40 && !proxyPort; i++) await sleep(50);
            if (proxyPort) {
                const sid = newSessionId();
                const sess = { sid, detail: path, ep, text: '', segs: [], base: site, exp: 0, at: 0 };
                sessions.set(sid, sess);
                // 先签一次，失败就让播放器那边重试（代理里还会再试）
                try { await refreshSession(sess); } catch (e) {
                    console.error('mythav play pre-resolve:', e && e.message);
                }
                for (const [k, v] of sessions) if (Date.now() - v.at > 6 * 3600 * 1000) sessions.delete(k);
                return { parse: 0, url: `http://${clientHost(inReq, proxyPort)}/mv/${sid}/playlist.m3u8`, header: {} };
            }
        } catch (e) {
            console.error('mythav proxy fallback:', e && e.message);
        }
    }

    // direct：上游给明文时直接把地址丢给播放器（播放器得自己能带 sec-fetch 头）；
    // 上游给密文（U18E）时播放器解不了，还是退回代理
    const r = await resolveStream(path, ep);
    if (r && r.plain && r.m3u8Url) {
        return { parse: 0, url: r.m3u8Url, header: playerHeaders() };
    }
    ensureProxy();
    for (let i = 0; i < 40 && !proxyPort; i++) await sleep(50);
    const sid2 = newSessionId();
    const sess2 = { sid: sid2, detail: path, ep, text: r ? r.text : '', segs: [], base: (r && r.page) || site, exp: (r && r.exp) || 0, at: Date.now() };
    sessions.set(sid2, sess2);
    return { parse: 0, url: `http://${clientHost(inReq, proxyPort)}/mv/${sid2}/playlist.m3u8`, header: {} };
}

/* ────────────────────────────── 分类 / 搜索 ────────────────────────────── */

const STATIC_CLASSES = [
    { type_id: 'update', type_name: '最新上传' },
    { type_id: 'release', type_name: '新发布' },
    { type_id: 'release/old', type_name: '经典老片' },
    { type_id: 'site/24/english-subtitle', type_name: '英文字幕' },
    { type_id: 'site/25/chinese-subtitle', type_name: '中文字幕' },
    { type_id: 'site/7/uncensored-leak', type_name: '无码流出' },
    { type_id: 'tag/343/vr', type_name: 'VR' },
    { type_id: 'site/1/siro', type_name: 'SIRO' },
    { type_id: 'site/2/luxu', type_name: 'LUXU' },
    { type_id: 'site/3/gana', type_name: 'GANA' },
    { type_id: 'site/4/maan', type_name: 'PRESTIGE' },
    { type_id: 'site/5/scute', type_name: 'S-CUTE' },
    { type_id: 'site/6/ara', type_name: 'ARA' },
    { type_id: 'site/8/fc2', type_name: 'FC2' },
    { type_id: 'site/9/heyzo', type_name: 'HEYZO' },
    { type_id: 'site/10/tokyohot', type_name: 'Tokyo Hot' },
    { type_id: 'site/11/1pondo', type_name: '1pondo' },
    { type_id: 'site/12/caribbeancom', type_name: 'Caribbeancom' },
    { type_id: 'site/13/caribbeancompr', type_name: 'Caribbeancompr' },
    { type_id: 'site/14/10musume', type_name: '10musume' },
    { type_id: 'site/15/pacopacomama', type_name: 'pacopacomama' },
    { type_id: 'site/16/gachinco', type_name: 'Gachinco' },
    { type_id: 'site/17/xxxav', type_name: 'XXX-AV' },
    { type_id: 'site/18/marriedslash', type_name: 'Married Slash' },
    { type_id: 'site/19/naughty4610', type_name: 'Naughty 4610' },
    { type_id: 'site/20/naughty0930', type_name: 'Naughty 0930' },
    { type_id: 'site/21/madou', type_name: '中文 AV' },
    { type_id: 'site/22/twav', type_name: 'TWAV' },
    { type_id: 'site/23/furuke', type_name: 'Furuke' },
    { type_id: 'rate', type_name: '高分排行' },
    { type_id: 'beingwatched', type_name: '正在看' },
];

async function init(inReq) {
    const body = (inReq && inReq.body) || {};
    const ext = String(body.ext || body.extend || '').trim();
    if (/^https?:\/\//i.test(ext)) site = ext.replace(/\/+$/, '');
    if (ext.startsWith('{')) {
        try {
            const j = JSON.parse(ext);
            if (j.site && /^https?:\/\//i.test(j.site)) site = String(j.site).replace(/\/+$/, '');
            if (j.proxy) cfg.proxy = String(j.proxy);
            if (j.proxyHost) cfg.proxyHost = String(j.proxyHost);
            if (j.proxyPort) cfg.proxyPort = parseInt(j.proxyPort, 10) || 0;
            if (j.cookie) cfg.cookie = String(j.cookie);
            if (j.cfClearance) cfg.cookie = 'cf_clearance=' + String(j.cfClearance).replace(/^cf_clearance=/i, '');
            if (j.userAgent) cfg.userAgent = String(j.userAgent);
            if (j.ttl) cfg.ttl = Math.max(60, parseInt(j.ttl, 10) || 300);
        } catch { /* ignore */ }
    }
    return {};
}

async function home() {
    return {
        class: STATIC_CLASSES,
        filters: {},
    };
}

async function category(inReq) {
    const body = (inReq && inReq.body) || {};
    const page = Math.max(1, parseInt(body.page || body.pg || 1, 10) || 1);
    const tid = String(body.id || body.tid || body.type_id || 'update').trim();

    const url = listUrl(tid, page);
    const html = await requestHtml(url);
    const list = parseVods(html, inReq);

    if (!list.length && page > 1) {
        // 深页抓空：可能是翻过头，也可能是被限流，回第一页比给空列表好
        try {
            const first = await requestHtml(listUrl(tid, 1));
            const l1 = parseVods(first, inReq);
            if (l1.length) return { page: 1, pagecount: parsePageCount(first, 1, l1.length), list: l1 };
        } catch { /* ignore */ }
    }
    return { page, pagecount: parsePageCount(html, page, list.length), list };
}

async function search(inReq) {
    const body = (inReq && inReq.body) || {};
    const wd = String(body.wd || body.keyword || body.key || '').trim();
    if (!wd) return { list: [] };
    const page = Math.max(1, parseInt(body.page || body.pg || 1, 10) || 1);
    const enc = encodeURIComponent(wd);

    // 站上搜索是 GET /search/?s=词，翻页在路径里
    const cands = page > 1
        ? [absUrl('/search/page/' + page + '/?s=' + enc), absUrl('/search/' + enc + '/page/' + page + '/'), absUrl('/search/?s=' + enc + '&paged=' + page)]
        : [absUrl('/search/?s=' + enc), absUrl('/search/' + enc + '/')];

    let html = '', list = [];
    for (const url of cands) {
        try {
            html = await requestHtml(url);
            list = parseVods(html, inReq);
            if (list.length) break;
        } catch { /* 换下一种 */ }
    }
    // 词是番号的话（如 dass-534），站点详情页有时能直接命中，补一刀
    if (!list.length && /^[a-z]{2,6}-?\d{2,5}$/i.test(wd)) {
        try {
            const guess = absUrl('/?s=' + enc);
            const h2 = await requestHtml(guess);
            list = parseVods(h2, inReq);
            if (list.length) html = h2;
        } catch { /* ignore */ }
    }
    return { page, pagecount: parsePageCount(html, page, list.length), list };
}

/* ────────────────────────────── 自检 ────────────────────────────── */

async function debug(inReq) {
    const body = (inReq && inReq.body) || {};
    const id = String(body.id || body.vod_id || '').trim();
    const codeIn = String(body.code || '').trim();
    const out = {
        site,
        proxyMode: cfg.proxy,
        localProxy: { running: !!proxyServer, port: proxyPort },
        cfCookie: cfg.cookie ? '已配置(' + cfg.cookie.slice(0, 24) + '...)' : '未配置',
        steps: [],
    };

    // 直连 code 自检：不经过站点页面，直接测播放站链路
    if (codeIn) {
        const page = `${PLAYER_HOST}/play/index/${encodeURIComponent(codeIn)}?ref=${(new URL(site)).hostname}`;
        out.steps.push({ step: 'playPageUrl', url: page });
        try {
            const r = await request(page, { headers: siteHeaders(site + '/') });
            const html = typeof r.data === 'string' ? r.data : Buffer.from(r.data || '').toString('utf-8');
            out.steps.push({ step: 'playPage', status: r.status, bytes: html.length, hasConfig: /PLAYER_CONFIG/.test(html) });
            const pc = extractPlayerConfig(html);
            if (pc && pc.m3u8) {
                out.steps.push({ step: 'm3u8Url', url: pc.m3u8.slice(0, 120) + '...' });
                const pr = await request(pc.m3u8, { headers: playerHeaders(), binary: true, retries: 1 });
                const buf = Buffer.isBuffer(pr.data) ? pr.data : Buffer.from(pr.data || []);
                out.steps.push({ step: 'm3u8Fetch', status: pr.status, bytes: buf.length, envelope: u18IsEnvelope(buf) ? 'U18E' : 'plain' });
                if (pr.status === 200) {
                    const text = u18Decode(buf, pc.m3u8);
                    const segs = text.split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
                    out.steps.push({ step: 'decrypt', ok: /#EXTM3U/.test(text), lines: text.split('\n').length, segs: segs.length, head: text.slice(0, 200) });
                    if (segs.length) {
                        const segUrl = /^https?:\/\//i.test(segs[0]) ? segs[0] : '';
                        if (segUrl) {
                            const sr = await request(segUrl, { headers: playerHeaders({ Range: 'bytes=0-1023' }), binary: true, retries: 1 });
                            const sb = Buffer.isBuffer(sr.data) ? sr.data : Buffer.from(sr.data || []);
                            out.steps.push({ step: 'segment', status: sr.status, bytes: sb.length, ts: sb[0] === 0x47 ? 'yes(0x47)' : 'no' });
                        }
                    }
                }
            }
        } catch (e) {
            out.steps.push({ step: 'playPage', error: String((e && e.message) || e) });
        }
        return out;
    }

    if (!id) return out;
    const path = toPath(id.split('#')[0]);
    const target = absUrl(path);
    out.target = target;

    try {
        const t0 = Date.now();
        const r = await request(target, { headers: siteHeaders(target) });
        const html = typeof r.data === 'string' ? r.data : Buffer.from(r.data || '').toString('utf-8');
        out.steps.push({
            step: 'detail',
            status: r.status,
            bytes: Buffer.byteLength(html),
            ms: Date.now() - t0,
            challenge: isChallenge(html, r.status),
        });
        if (isChallenge(html, r.status)) return out;

        const embeds = extractEmbedPages(html);
        out.steps.push({ step: 'embeds', count: embeds.length, first: embeds[0] || '' });
        if (!embeds.length) return out;

        const pc = await fetchPlayerConfig(path);
        out.steps.push({ step: 'playerConfig', m3u8: (pc.config.m3u8 || '').slice(0, 120) + '...', videoKey: pc.config.videoKey });

        const text = await fetchPlaylistText(pc.config.m3u8);
        const segs = text.split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
        out.steps.push({ step: 'playlist', ok: /#EXTM3U/.test(text), lines: text.split('\n').length, segs: segs.length });

        if (segs.length && /^https?:\/\//i.test(segs[0])) {
            const sr = await request(segs[0], { headers: playerHeaders({ Range: 'bytes=0-1023' }), binary: true, retries: 1 });
            const sb = Buffer.isBuffer(sr.data) ? sr.data : Buffer.from(sr.data || []);
            out.steps.push({ step: 'segment', status: sr.status, bytes: sb.length, ts: sb[0] === 0x47 ? 'yes(0x47)' : 'no' });
        }
    } catch (e) {
        out.steps.push({ step: 'error', error: String((e && e.message) || e), code: (e && e.code) || '' });
    }
    return out;
}

export default {
    meta: { key: 'mythav', name: '🔞MythAV', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.post('/debug', debug);
        fastify.get('/img', imgProxy);
    },
};
