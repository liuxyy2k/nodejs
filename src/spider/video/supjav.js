/**
 * 🔥SupJav 蜘蛛插件
 *
 * 站点：https://supjav.com/zh/
 *
 * 结构要点（2026-10 实抓确认）：
 *  - 列表：.posts .post 卡片 → a.img[href] 详情页、img.thumb 封面（多为 data-original）、h3 a[title] 标题
 *  - 分页：.pagination 数字链，详情路径 /zh/<id>.html，列表 /zh/category/<slug>/page/N
 *  - 热门：/zh/popular?sort=day|week|month，分页 /zh/popular/page/N?sort=week
 *  - 搜索：/zh/?s=<kw>，分页 /zh/page/N/?s=<kw>
 *  - 详情：h1 标题、#player-wrap 的 background-image 封面、meta description 简介
 *  - 线路：.btns 下多组 CD（cdname=1/2），每组 .btn-server[data-link]
 *          标签为 JPA / ST / DS，data-link 是一串 hex token
 *
 * 播放机制（已实测打通 lk1.supremejav.com）：
 *   1. 页面 base.js 里的 JumpChain：iframe src = https://lk1.supremejav.com/supjav.php?l=<token>
 *   2. 该页返回一段 JS，把 token 反转后跳到 ?c=<reversed>
 *   3. ?c= 会 302 到真正播放器：
 *        JPA → japopav.tv/sup/<id>.html      （自建播放器，直给 m3u8）
 *        ST  → streamtape.com/e/<id>/        （第三方托管，需拼 get_video）
 *        DS  → dood.la / playmogo.com/e/<id> （第三方托管，pass_md5 取直链）
 *   4. 各线路都校验 Referer，直链到播放器黑屏 ⇒ 统一走插件中转，中转层补 Referer
 *
 * 设计：详情页只列线路、不探活（探活要连跳三次，太慢）；play 时按优先级逐条试，
 *       哪条能出 m3u8/mp4 就用哪条，失败自动落到下一家。
 */

import axios from 'axios';
import { load } from 'cheerio';
import { createRequire } from 'module';

const nodeRequire = createRequire(import.meta.url);

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const HOSTS = ['https://supjav.com'];
const ROUTE = 'spider/supjav/1';
const SECRET = 'supjav-hls-relay-1f7c';

const LANGS = ['zh', 'ja', 'en'];

const CLASSES = [
    { type_name: '最新', type_id: 'home' },
    { type_name: '今日热门', type_id: 'popular:day' },
    { type_name: '本周热门', type_id: 'popular:week' },
    { type_name: '本月热门', type_id: 'popular:month' },
    { type_name: '有码', type_id: 'cat:censored-jav' },
    { type_name: '无码', type_id: 'cat:uncensored-jav' },
    { type_name: '无码破解', type_id: 'cat:reducing-mosaic' },
    { type_name: '素人', type_id: 'cat:amateur' },
    { type_name: '中文字幕', type_id: 'cat:chinese-subtitles' },
    { type_name: '英文字幕', type_id: 'cat:english-subtitles' },
    { type_name: '有码热门', type_id: 'catv:censored-jav' },
    { type_name: '无码热门', type_id: 'catv:uncensored-jav' },
    { type_name: '女优', type_id: 'cast' },
    { type_name: '制作商', type_id: 'maker' },
    { type_name: '类别', type_id: 'tag' },
];

const cfg = {
    base: '',
    lang: 'zh',
    cookie: '',
    proxy: '',
    proxyBase: '',
    timeout: 15000,
    maxJump: 4,
};

let host = HOSTS[0];

/* ------------------------------------------------------------------ 基础工具 */

function applyExt(ext) {
    if (!ext || typeof ext !== 'object') return;
    for (const k of Object.keys(cfg)) {
        const v = ext[k];
        if (v === undefined || v === null || v === '') continue;
        if (k === 'timeout') cfg.timeout = Math.max(5000, parseInt(v, 10) || cfg.timeout);
        else if (k === 'maxJump') cfg.maxJump = Math.min(8, Math.max(1, parseInt(v, 10) || cfg.maxJump));
        else cfg[k] = String(v);
    }
    if (cfg.base) host = cfg.base.replace(/\/+$/, '');
    if (LANGS.includes(cfg.lang)) lang = cfg.lang;
}

let lang = 'zh';

function cleanText(t) {
    return String(t || '').replace(/\s+/g, ' ').trim();
}

function baseUrl() {
    return `${host}/${lang}`;
}

function fixUrl(url, base) {
    if (!url) return '';
    const u = String(url).trim();
    if (u.startsWith('//')) return `https:${u}`;
    if (u.startsWith('/')) return (base || host) + u;
    if (/^https?:\/\//i.test(u)) return u;
    try {
        return new URL(u, (base || host) + '/').href;
    } catch {
        return u;
    }
}

function buildHeaders(referer) {
    const h = {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Upgrade-Insecure-Requests': '1',
    };
    if (referer) h.Referer = referer;
    if (cfg.cookie) h.Cookie = cfg.cookie;
    return h;
}

function agentOf() {
    if (!cfg.proxy) return undefined;
    if (agentOf._c && agentOf._p === cfg.proxy) return agentOf._c;
    try {
        const { HttpsProxyAgent } = nodeRequire('https-proxy-agent');
        agentOf._c = new HttpsProxyAgent(cfg.proxy);
        agentOf._p = cfg.proxy;
        return agentOf._c;
    } catch {
        return undefined;
    }
}

async function httpGet(url, opt = {}) {
    const useAgent = agentOf();
    return axios.get(url, {
        headers: { ...buildHeaders(opt.referer), ...(opt.headers || {}) },
        timeout: opt.timeout || cfg.timeout,
        responseType: opt.responseType || 'text',
        maxRedirects: 6,
        validateStatus: () => true,
        ...(useAgent ? { httpsAgent: useAgent, httpAgent: useAgent, proxy: false } : {}),
        transformResponse: (opt.responseType || 'text') === 'text' ? [(d) => d] : undefined,
    });
}

async function httpPost(url, body, opt = {}) {
    const useAgent = agentOf();
    return axios.post(url, body, {
        headers: {
            ...buildHeaders(opt.referer),
            'Content-Type': opt.contentType || 'application/x-www-form-urlencoded',
            ...(opt.headers || {}),
        },
        timeout: opt.timeout || cfg.timeout,
        responseType: opt.responseType || 'text',
        maxRedirects: 6,
        validateStatus: () => true,
        ...(useAgent ? { httpsAgent: useAgent, httpAgent: useAgent, proxy: false } : {}),
        transformResponse: [(d) => d],
    });
}

/** 取页面：当前语言失败就换 ja / en，换不到再回 zh */
async function getHtml(url, opt = {}) {
    const target = /^https?:\/\//i.test(url) ? url : fixUrl(url);
    const candidates = [target];
    // 语言兜底：/zh/xxx 拿不到时试 /ja/ /en/
    for (const l of LANGS) {
        if (l === lang) continue;
        const alt = target.replace(/\/(zh|ja|en)\//, `/${l}/`);
        if (alt !== target && !candidates.includes(alt)) candidates.push(alt);
    }

    const deadline = Date.now() + Math.min(opt.budget || 26000, 45000);
    for (const c of candidates) {
        if (Date.now() > deadline) break;
        const left = Math.max(5000, deadline - Date.now());
        try {
            const resp = await httpGet(c, { referer: c, timeout: Math.min(opt.timeout || cfg.timeout, left) });
            const text = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
            if (resp.status === 200 && text.length > 800) {
                if (/\bJust a moment\b|cf-mitigated|challenge-platform/i.test(text) && text.length < 12000) {
                    // Cloudflare 人机验证页：说明这台机器 IP 被挑战，需要 ext.cookie 里贴 cf_clearance
                    continue;
                }
                try {
                    const u = new URL(c);
                    if (/(^|\.)supjav\.com$/i.test(u.host)) {
                        host = `${u.protocol}//${u.host}`;
                        const m = u.pathname.match(/^\/(zh|ja|en)\//);
                        if (m) lang = m[1];
                    }
                } catch { /* ignore */ }
                return text;
            }
        } catch { /* 换下一个 */ }
    }
    return '';
}

/* ------------------------------------------------------------------ 列表解析 */

function isVideoLink(href) {
    return /\/\d+\.html?(?:$|[?#])/i.test(href || '') || /\/\d+\.html$/i.test(href || '');
}

function parseList(html, base) {
    if (!html) return [];
    const $ = load(html);
    const out = [];
    const seen = new Set();

    $('.post, .posts .post, .archive .post, article').each((_, el) => {
        const $el = $(el);
        let href = $el.find('a.img').attr('href') || $el.find('a[rel="bookmark"]').first().attr('href') || '';
        if (!href) href = $el.find('h3 a').first().attr('href') || '';
        if (!href) href = $el.find('a[href]').first().attr('href') || '';
        if (!isVideoLink(href)) return;

        const url = fixUrl(href, base || host);
        if (seen.has(url)) return;
        seen.add(url);

        let title = cleanText($el.find('h3 a').first().attr('title') || $el.find('h3 a').first().text());
        if (!title) title = cleanText($el.find('a.img').attr('title') || '');
        if (!title) title = cleanText($el.find('img.thumb').attr('alt') || '');
        if (!title) return;

        const $img = $el.find('img.thumb').first().length ? $el.find('img.thumb').first() : $el.find('img').first();
        let pic = $img.attr('data-original') || $img.attr('data-src') || $img.attr('src') || '';
        pic = String(pic).split('!')[0]; // 去掉 !320x216.jpg 这类缩略后缀，取原图
        pic = fixUrl(pic, base || host);

        const meta = cleanText($el.find('.meta').text());
        const remarks = cleanText($el.find('.meta .date, .views').first().text()) || (meta.match(/(\d[\d,]*\s*Views)/i) || [])[1] || '';

        out.push({
            vod_id: url,
            vod_name: title,
            vod_pic: pic,
            vod_remarks: remarks,
            vod_year: (meta.match(/(\d{4})\//) || [])[1] || '',
        });
    });

    return out;
}

function pageCount(html, pg) {
    if (!html) return parseInt(pg, 10) || 1;
    const $ = load(html);
    let max = 0;
    $('.pagination a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/\/page\/(\d+)/i);
        if (m) max = Math.max(max, parseInt(m[1], 10));
        else if (/^\d+$/.test(cleanText($(el).text()))) max = Math.max(max, parseInt(cleanText($(el).text()), 10));
    });
    if (!max) {
        // 部分页面把总页码写在 text 里
        const t = cleanText($('.pagination').text());
        for (const m of t.matchAll(/(\d{1,6})/g)) max = Math.max(max, parseInt(m[1], 10));
    }
    return max || Math.max(parseInt(pg, 10) || 1, 1);
}

function listUrl(tid, pg) {
    const page = Math.max(1, parseInt(pg, 10) || 1);
    const base = baseUrl();
    const t = String(tid || 'home');

    if (t === 'home' || t === '') return page === 1 ? `${base}/` : `${base}/page/${page}`;

    if (t.startsWith('popular:')) {
        const sort = t.slice(8) || 'day';
        return page === 1
            ? `${base}/popular?sort=${sort}`
            : `${base}/popular/page/${page}?sort=${sort}`;
    }

    if (t.startsWith('catv:')) {
        const slug = t.slice(5);
        return page === 1
            ? `${base}/category/${slug}?sort=views`
            : `${base}/category/${slug}/page/${page}?sort=views`;
    }

    if (t.startsWith('cat:')) {
        const slug = t.slice(4);
        return page === 1 ? `${base}/category/${slug}` : `${base}/category/${slug}/page/${page}`;
    }

    if (t === 'cast' || t === 'maker' || t === 'tag') {
        return page === 1 ? `${base}/${t}` : `${base}/${t}/page/${page}`;
    }

    if (t.startsWith('search:')) {
        const kw = encodeURIComponent(t.slice(7));
        return page === 1 ? `${base}/?s=${kw}` : `${base}/page/${page}/?s=${kw}`;
    }

    return page === 1 ? `${base}/` : `${base}/page/${page}`;
}

/* ------------------------------------------------------------------ 详情解析 */

function extractServerLinks(html) {
    if (!html) return [];
    const $ = load(html);
    const out = [];
    const seen = new Set();

    const push = (label, token, cd) => {
        const k = `${label}|${token}`;
        if (!token || seen.has(k)) return;
        seen.add(k);
        out.push({ label: cleanText(label).toUpperCase() || 'SRV', token, cd: cd || '1' });
    };

    // 主路径：.btn-server[data-link]
    // 站点按 CD 分组：.cd-server（第一组 CD1，第二组 CD2），每组里是同一批 server 的不同源
    let cdIdx = 0;
    $('.cd-server').each((_, box) => {
        cdIdx += 1;
        const cdName = $(box).attr('cdname') || String(cdIdx);
        $(box).find('.btn-server, a[data-link], a[data-url]').each((__, a) => {
            const $a = $(a);
            const tok = $a.attr('data-link') || $a.attr('data-url') || $a.attr('data-src') || '';
            const label = cleanText($a.text()) || $a.attr('title') || '';
            push(label, tok, cdName);
        });
    });

    // 没有 .cd-server 包裹时，直接取所有 .btn-server
    if (!out.length) {
        $('.btn-server, a[data-link]').each((i, a) => {
            const $a = $(a);
            const tok = $a.attr('data-link') || $a.attr('data-url') || '';
            if (!tok || tok.length < 12) return;
            push(cleanText($a.text()) || `SERVER-${i + 1}`, tok, $a.attr('cdname') || '1');
        });
    }

    // 兜底：任意带 data-link 的元素（主题改版时 class 会变）
    if (!out.length) {
        $('[data-link], [data-url]').each((i, el) => {
            const $e = $(el);
            const tok = $e.attr('data-link') || $e.attr('data-url') || '';
            if (!tok || tok.length < 12) return;
            push(cleanText($e.text()) || $e.attr('title') || `SERVER-${i + 1}`, tok, $e.attr('cdname') || '1');
        });
    }

    // 再兜底：JS 里 serverMap 映射
    if (!out.length) {
        const m = html.match(/serverMap\s*=\s*\{([\s\S]{0,2000}?)\}\s*;?/i);
        if (m) {
            for (const kv of m[1].matchAll(/['"]?([\w-]+)['"]?\s*:\s*['"]([^'"]{12,})['"]/g)) {
                push(kv[1], kv[2], '1');
            }
        }
    }

    return out;
}

function detailMeta(html, url) {
    const $ = load(html);
    const title = cleanText($('h1').first().text()) || cleanText($('title').text()).replace(/\s*[-|].*$/, '');

    let pic = '';
    const style = $('#player-wrap').attr('style') || '';
    const bg = style.match(/background-image\s*:\s*url\(['"]?([^'")]+)/i);
    if (bg) pic = bg[1];
    if (!pic) pic = $('meta[property="og:image"]').attr('content') || '';
    if (!pic) pic = $('.video-wrap img, article img').first().attr('src') || '';
    pic = fixUrl(pic, host);

    let content = cleanText($('meta[name="description"]').attr('content') || '');
    if (!content) content = cleanText($('#video-details, .video-details, .desc').text());

    const code = (title.match(/\b([A-Z]{2,12}[-_ ]?\d{2,7})\b/) || [])[1] || '';

    const tags = [];
    $('.video-wrap a[href*="/tag/"], .video-wrap a[href*="/cast/"], .video-wrap a[href*="/maker/"], .video-details a[href*="/tag/"], .video-details a[href*="/cast/"]').each((_, a) => {
        const t = cleanText($(a).text());
        if (t && t.length < 24 && !tags.includes(t)) tags.push(t);
    });

    return { title, pic, content, code: code.replace(/_/g, '-').toUpperCase(), tags: tags.slice(0, 12), url };
}

/* ------------------------------------------------------------------ 播放解析 */

function jsUnescape(s) {
    return String(s)
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t');
}

function unpackPacker(src) {
    // Dean Edwards packer：只做字符串还原，不执行任何远程代码
    const text = String(src || '');
    const head = text.indexOf('eval(function(p,a,c,k,e,d)');
    if (head < 0) return '';
    const tail = text.slice(head);
    const m = tail.match(
        /\('((?:\\.|[^'\\])*)',\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:\\.|[^'\\])*)'\.split\('\|'\)/s
    );
    if (!m) return '';
    const payload = jsUnescape(m[1]);
    const radix = parseInt(m[2], 10) || 62;
    const count = parseInt(m[3], 10) || 0;
    const words = jsUnescape(m[4]).split('|');

    let p = payload;
    for (let c = count - 1; c >= 0; c--) {
        if (!words[c]) continue;
        p = p.replace(new RegExp('\\b' + c.toString(radix) + '\\b', 'g'), words[c]);
    }
    return p;
}

function decodeEscapes(s) {
    return String(s || '')
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/\\\//g, '/')
        .replace(/&amp;/g, '&');
}

function extractMedia(text) {
    const src = decodeEscapes(text);
    const pats = [
        /(?:file|src|source|url|hls|hls4|hls2|playlist|urlPlay)\s*[:=]\s*['"]([^'"]+\.(?:m3u8|mp4)[^'"]*)['"]/i,
        /['"](https?:\/\/[^'"\s]+\.m3u8(?:\?[^'"\s]*)?)['"]/i,
        /(https?:\/\/[^\s'"<>\\]+\.m3u8(?:\?[^\s'"<>\\]*)?)/i,
        /['"](https?:\/\/[^'"\s]+\.mp4(?:\?[^'"\s]*)?)['"]/i,
        /(https?:\/\/[^\s'"<>\\]+\.mp4(?:\?[^\s'"<>\\]*)?)/i,
    ];
    for (const p of pats) {
        const m = src.match(p);
        if (m && m[1]) {
            let u = m[1].trim();
            if (u.startsWith('//')) u = 'https:' + u;
            if (!/^https?:\/\//i.test(u)) continue;
            return u;
        }
    }
    return '';
}

function extractIframes(text, base) {
    const out = [];
    const src = decodeEscapes(text);
    for (const m of src.matchAll(/<iframe[^>]+src\s*=\s*['"]([^'"]+)['"]/gi)) {
        const u = fixUrl(m[1], base);
        if (/^https?:\/\//i.test(u) && !out.includes(u)) out.push(u);
    }
    // 有些线路用 JS 塞 iframe
    for (const m of src.matchAll(/\.src\s*=\s*['"]([^'"]+)['"]/gi)) {
        const u = fixUrl(m[1], base);
        if (/^https?:\/\//i.test(u) && !out.includes(u)) out.push(u);
    }
    return out;
}

function jumpChainUrls(token) {
    const tok = String(token || '').trim();
    if (!tok) return [];
    const urls = [];
    const q = encodeURIComponent(tok);
    // 官方 JumpChain：?l=<token>，返回页里再反转成 ?c=<reversed>
    urls.push(`https://lk1.supremejav.com/supjav.php?l=${q}`);
    urls.push(`https://lk1.supremejav.com/supjav.php?c=${q}`);
    const rev = tok.split('').reverse().join('');
    const qr = encodeURIComponent(rev);
    urls.push(`https://lk1.supremejav.com/supjav.php?c=${qr}`);
    urls.push(`https://lk1.supremejav.com/supjav.php?l=${qr}`);
    // token 本身可能就是编码后的地址
    try {
        const pad = tok + '='.repeat((4 - (tok.length % 4)) % 4);
        const dec = Buffer.from(pad, 'base64').toString('utf8');
        if (/^https?:\/\//i.test(dec)) urls.push(dec);
    } catch { /* ignore */ }
    if (/^https?:\/\//i.test(tok)) urls.unshift(tok);
    return [...new Set(urls)];
}

async function followToMedia(startUrl, referer, depth = 0, seen = new Set()) {
    if (depth > cfg.maxJump || seen.has(startUrl)) return null;
    seen.add(startUrl);
    if (!/^https?:\/\//i.test(startUrl)) return null;

    let resp;
    try {
        resp = await httpGet(startUrl, { referer: referer || startUrl, timeout: 15000 });
    } catch {
        return null;
    }
    if (resp.status >= 400) return null;

    const text = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    if (!text || text.length < 40) return null;

    // 1) 页面直接给 m3u8 / mp4
    let media = extractMedia(text);
    if (media) return { url: media, referer: startUrl };

    // 2) packer 加密的播放器源码
    const packed = unpackPacker(text);
    if (packed) {
        media = extractMedia(packed);
        if (media) return { url: media, referer: startUrl };
    }

    // 3) streamtape：JS 里拼 get_video
    const st = text.match(/get_video\?[^'"\s<>]+/i);
    if (st) {
        const u = `https://streamtape.com/${st[0].replace(/^\/+/, '')}`;
        return { url: u, referer: startUrl };
    }

    // 4) dood / playmogo：pass_md5 换一段视频基址，再拼 token 与时间戳
    const pm = text.match(/pass_md5\/([^'"\s<>]+)/i);
    if (pm) {
        try {
            const token = pm[1].split('/').filter(Boolean).pop();
            const origin = new URL(startUrl).origin;
            const pr = await httpPost(`${origin}/${pm[0].replace(/^\/+/, '')}`, '', {
                referer: startUrl,
                timeout: 12000,
            });
            const base = String(pr.data || '').trim();
            if (/^https?:\/\//i.test(base)) {
                const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                let rnd = '';
                for (let i = 0; i < 10; i++) rnd += chars[Math.floor(Math.random() * chars.length)];
                return {
                    url: `${base}${rnd}?token=${encodeURIComponent(token)}&expiry=${Date.now()}`,
                    referer: startUrl,
                };
            }
        } catch { /* 落到 iframe 兜底 */ }
    }

    // 4) 跟随 iframe
    for (const iframe of extractIframes(text, startUrl)) {
        const r = await followToMedia(iframe, startUrl, depth + 1, seen);
        if (r) return r;
    }

    // 5) 反转的 token 跳转（lk1 的 ?l= 页就是这么干的）
    const rev = text.match(/OLID\s*=\s*'([0-9a-f]{32,})'/i);
    if (rev) {
        const next = new URL(startUrl);
        next.search = `?c=${encodeURIComponent(rev[1].split('').reverse().join(''))}`;
        const r = await followToMedia(next.toString(), startUrl, depth + 1, seen);
        if (r) return r;
    }

    return null;
}

const streamCache = new Map();

function cacheGet(key) {
    const v = streamCache.get(key);
    if (!v) return null;
    if (v.exp < Date.now()) {
        streamCache.delete(key);
        return null;
    }
    return v;
}

function cacheSet(key, val, ttl = 120000) {
    if (streamCache.size > 300) streamCache.clear();
    streamCache.set(key, { ...val, exp: Date.now() + ttl });
}

/** 从详情页内容里按顺序试线路 */
async function resolveFromDetail(detailUrl, preferIdx = -1) {
    const cacheKey = `d|${detailUrl}|${preferIdx}`;
    const hit = cacheGet(cacheKey);
    if (hit) return hit;

    const html = await getHtml(detailUrl);
    if (!html) return null;

    const servers = extractServerLinks(html);
    if (!servers.length) return null;

    // 排序：用户点的优先，其次 JPA（官方线路最稳），再 ST / DS
    const rank = (s) => {
        const l = s.label.toUpperCase();
        if (l.startsWith('JPA')) return 1;
        if (l.startsWith('EVS')) return 2;
        if (l.startsWith('FST')) return 3;
        if (l.startsWith('VOE')) return 4;
        if (l.startsWith('DS')) return 5;
        if (l.startsWith('ST')) return 6;
        return 7;
    };

    const ordered = servers
        .map((s, i) => ({ ...s, i }))
        .sort((a, b) => (a.i === preferIdx ? -1 : b.i === preferIdx ? 1 : rank(a) - rank(b)));

    // 总预算：点开就等太久用户会以为卡死
    const deadline = Date.now() + 16000;
    const tried = new Set();
    for (const s of ordered.slice(0, 8)) {
        if (tried.has(s.token)) continue;
        tried.add(s.token);
        for (const u of jumpChainUrls(s.token).slice(0, 3)) {
            if (Date.now() > deadline) break;
            const r = await followToMedia(u, detailUrl);
            if (r) {
                const val = { ...r, label: s.label, idx: s.i, detail: detailUrl };
                cacheSet(cacheKey, val, 180000);
                return val;
            }
        }
        if (Date.now() > deadline) break;
    }
    return null;
}

/** 自诊断：哪一步拿不到东西，一眼能看出 */
async function debug(inReq) {
    applyExt(inReq && inReq.ext);
    let url = String((inReq.body && inReq.body.id) || '').trim();
    if (url && !/^https?:\/\//i.test(url)) url = fixUrl(url);
    const out = { url, base: baseUrl(), html: 0, title: '', servers: [], tries: [] };
    if (!url) return out;

    const html = await getHtml(url);
    out.html = html.length;
    if (!html) {
        out.hint = '详情页没拿到（Cloudflare 人机验证 / 网络不通），可在 ext.cookie 里贴浏览器 Cookie 再试';
        return out;
    }
    const meta = detailMeta(html, url);
    out.title = meta.title;
    const servers = extractServerLinks(html);
    out.servers = servers.map((s) => ({ label: s.label, cd: s.cd, token: s.token.slice(0, 16) + '…' }));
    if (!servers.length) {
        out.hint = '详情页拿到了，但没找到 .btn-server[data-link] 线路按钮，可能是页面改版';
        return out;
    }

    for (const s of servers.slice(0, 4)) {
        const t0 = Date.now();
        let ok = null;
        let firstErr = '';
        for (const u of jumpChainUrls(s.token).slice(0, 3)) {
            try {
                ok = await followToMedia(u, url);
            } catch (e) {
                firstErr = firstErr || String(e && e.message ? e.message : e);
            }
            if (ok) break;
        }
        out.tries.push({
            label: s.label,
            cd: s.cd,
            ms: Date.now() - t0,
            ok: ok ? ok.url.slice(0, 120) : '',
            err: ok ? '' : firstErr || '没提取到 m3u8/mp4',
        });
    }
    return out;
}

/* ------------------------------------------------------------------ 中转层 */

function b64e(s) {
    return Buffer.from(String(s || ''), 'utf8').toString('base64url');
}

function b64d(s) {
    try {
        return Buffer.from(String(s || ''), 'base64url').toString('utf8');
    } catch {
        return '';
    }
}

function sign(s) {
    let h = 5381;
    const str = String(s || '') + SECRET;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h.toString(36);
}

function allowedTarget(u) {
    if (!/^https?:\/\//i.test(u || '')) return false;
    let url;
    try {
        url = new URL(u);
    } catch {
        return false;
    }
    const h = url.hostname.toLowerCase();
    if (!h || h === 'localhost' || h.endsWith('.local')) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
        const p = h.split('.').map(Number);
        if (p[0] === 10 || p[0] === 127 || p[0] === 0) return false;
        if (p[0] === 169 && p[1] === 254) return false;
        if (p[0] === 192 && p[1] === 168) return false;
        if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return false;
        if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return false;
    }
    if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return false;
    return true;
}

function relayUrl(origin, target, referer) {
    const u = b64e(target);
    const r = b64e(referer || '');
    // mp4 直链没有播放列表可重写，直接走分片端点（支持 Range 边下边播）
    const endpoint = /\.m3u8(\?|$)/i.test(target) ? 'm3u8' : 'seg';
    return `${origin}/${ROUTE}/${endpoint}?u=${encodeURIComponent(u)}&r=${encodeURIComponent(r)}&s=${sign(u + '|' + r)}`;
}

function requestOrigin(req) {
    const h = req.headers || {};
    const proto = String(h['x-forwarded-proto'] || 'http').split(',')[0].trim();
    const hostname = String(h['x-forwarded-host'] || h.host || '').split(',')[0].trim();
    let prefix = String(h['x-forwarded-prefix'] || '').trim();
    if (prefix && !prefix.startsWith('/')) prefix = '/' + prefix;
    if (prefix.endsWith('/')) prefix = prefix.slice(0, -1);
    const basePath = cfg.proxyBase ? cfg.proxyBase.replace(/\/+$/, '') : '';
    return `${proto}://${hostname}${basePath || prefix || ''}`;
}

function rewritePlaylist(text, playlistUrl, origin, referer) {
    const base = new URL(playlistUrl);
    const ref = referer || playlistUrl;
    const abs = (u) => {
        const s = String(u || '').trim();
        if (!s) return '';
        try {
            return new URL(s, base).href;
        } catch {
            return '';
        }
    };
    const wrap = (u) => {
        const e = b64e(u);
        const kind = /\.m3u8(\?|$)/i.test(u) ? 'm3u8' : 'seg';
        const rr = b64e(ref);
        return `${origin}/${ROUTE}/${kind}?u=${encodeURIComponent(e)}&r=${encodeURIComponent(rr)}&s=${sign(e + '|' + rr)}`;
    };

    return text
        .split('\n')
        .map((line) => {
            const raw = line.trim();
            if (!raw) return line;
            if (raw.startsWith('#')) {
                return line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${wrap(abs(u))}"`);
            }
            const u = abs(raw);
            return u ? wrap(u) : line;
        })
        .join('\n');
}

/* ------------------------------------------------------------------ 接口 */

async function init(inReq) {
    applyExt(inReq && inReq.ext);
    return { class: CLASSES };
}

async function home(inReq) {
    applyExt(inReq && inReq.ext);
    const html = await getHtml(`${baseUrl()}/`);
    return { class: CLASSES, list: parseList(html, host) };
}

async function category(inReq) {
    applyExt(inReq && inReq.ext);
    const tid = String((inReq.body && inReq.body.id) || 'home');
    const pg = String((inReq.body && inReq.body.page) || 1);
    const url = listUrl(tid, pg);
    const html = await getHtml(url);
    const list = parseList(html, host);
    return {
        list,
        page: parseInt(pg, 10) || 1,
        pagecount: pageCount(html, pg),
        limit: list.length || 24,
        total: 999999,
    };
}

async function detail(inReq) {
    applyExt(inReq && inReq.ext);
    let vodId = String((inReq.body && inReq.body.id) || '').trim();
    if (vodId && !/^https?:\/\//i.test(vodId)) vodId = fixUrl(vodId);
    if (!vodId) return { list: [] };

    // 统一到当前语言路径
    const m = vodId.match(/^(https?:\/\/[^/]+)(?:\/(zh|ja|en))?(\/.*)$/i);
    if (m) vodId = `${m[1]}/${lang}${m[3]}`;

    const html = await getHtml(vodId);
    if (!html) return { list: [] };

    const meta = detailMeta(html, vodId);
    const servers = extractServerLinks(html);

    const from = [];
    const urls = [];
    if (servers.length) {
        servers.forEach((s, i) => {
            const label = s.cd && s.cd !== '1' ? `${s.label}-CD${s.cd}` : s.label;
            from.push(label);
            urls.push(`正片$${vodId}|${i}`);
        });
    } else {
        from.push('SupJav');
        urls.push(`正片$${vodId}|-1`);
    }

    return {
        list: [
            {
                vod_id: vodId,
                vod_name: meta.title,
                vod_pic: meta.pic,
                vod_content: meta.content,
                vod_remarks: meta.code,
                vod_year: (meta.content.match(/(20\d{2})/) || [])[1] || '',
                vod_play_from: from.join('$$$'),
                vod_play_url: urls.join('$$$'),
            },
        ],
    };
}

const CN_MAP = [
    [/黑丝|丝袜/, 'black'],
    [/巨乳|爆乳/, 'big tits'],
    [/人妻|已婚|不伦/, 'married woman'],
    [/中出|内射/, 'creampie'],
    [/美少女|少女/, 'beautiful girl'],
    [/熟女/, 'mature woman'],
    [/素人/, 'amateur'],
    [/无码|无修正/, 'uncensored'],
    [/有码|有修正/, 'censored'],
    [/中文字幕|中字/, 'chinese subtitle'],
    [/英文字幕|英字/, 'english subtitle'],
    [/单体/, 'solowork'],
    [/痴女/, 'slut'],
    [/潮吹/, 'squirting'],
    [/口交/, 'blowjob'],
    [/骑乘/, 'cowgirl'],
    [/高清/, 'high definition'],
    [/4k/i, '4k'],
];

function cnFallback(wd) {
    for (const [re, en] of CN_MAP) if (re.test(wd)) return en;
    return '';
}

async function search(inReq) {
    applyExt(inReq && inReq.ext);
    const wd = cleanText((inReq.body && inReq.body.wd) || '');
    const pg = parseInt((inReq.body && inReq.body.page) || 1, 10) || 1;
    if (!wd) return { list: [], page: pg };

    const run = async (kw) => {
        const url = pg === 1
            ? `${baseUrl()}/?s=${encodeURIComponent(kw)}`
            : `${baseUrl()}/page/${pg}/?s=${encodeURIComponent(kw)}`;
        const html = await getHtml(url);
        return { list: parseList(html, host), page: pg, pagecount: pageCount(html, pg), total: 999999 };
    };

    let res = await run(wd);
    // 站内搜索对中文支持一般，中文词换英文关键词再打一次
    if (!res.list.length && /[\u4e00-\u9fa5]/.test(wd)) {
        const alt = cnFallback(wd);
        if (alt) res = await run(alt);
    }
    // 番号搜索兜底：JUR-583 / jur583
    if (!res.list.length) {
        const code = wd.replace(/\s+/g, '-').toUpperCase();
        if (code !== wd) res = await run(code);
    }
    return res;
}

async function play(inReq) {
    applyExt(inReq && inReq.ext);
    const origin = requestOrigin(inReq);

    let raw = String((inReq.body && inReq.body.id) || '').trim();
    if (raw.includes('$')) raw = raw.split('$').pop().trim();
    if (!raw) return { parse: 0, jx: 0, url: '', header: {} };

    let detailUrl = raw;
    let idx = -1;
    const bar = raw.lastIndexOf('|');
    if (bar > 0) {
        const tail = raw.slice(bar + 1);
        if (/^-?\d+$/.test(tail)) {
            idx = parseInt(tail, 10);
            detailUrl = raw.slice(0, bar);
        }
    }
    if (!/^https?:\/\//i.test(detailUrl)) detailUrl = fixUrl(detailUrl);

    const stream = await resolveFromDetail(detailUrl, idx);
    if (!stream) return { parse: 0, jx: 0, url: '', header: {} };

    return {
        parse: 0,
        jx: 0,
        url: relayUrl(origin, stream.url, stream.referer),
        header: {},
    };
}

async function m3u8(inReq, reply) {
    const q = inReq.query || {};
    const u = b64d(q.u);
    const r = b64d(q.r);
    if (!u || !allowedTarget(u) || q.s !== sign(q.u + '|' + (q.r || ''))) {
        reply.code(403);
        return 'forbidden';
    }

    let resp;
    try {
        resp = await httpGet(u, {
            referer: r || u,
            timeout: 20000,
            headers: { Accept: '*/*' },
        });
    } catch {
        reply.code(502);
        return 'playlist failed';
    }

    const text = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    if (resp.status >= 400 || !text.includes('#EXTM3U')) {
        reply.code(502);
        return 'playlist failed';
    }

    const origin = requestOrigin(inReq);
    reply.header('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Cache-Control', 'no-store');
    return reply.send(rewritePlaylist(text, u, origin, r));
}

async function seg(inReq, reply) {
    const q = inReq.query || {};
    const u = b64d(q.u);
    const r = b64d(q.r);
    if (!u || !allowedTarget(u) || q.s !== sign(q.u + '|' + (q.r || ''))) {
        reply.code(403);
        return 'forbidden';
    }

    const headers = { Accept: '*/*' };
    const wantRange = String(inReq.headers.range || '').trim();
    if (wantRange) headers.Range = wantRange;
    let resp;
    try {
        resp = await httpGet(u, {
            referer: r || u,
            timeout: 25000,
            responseType: 'arraybuffer',
            headers,
        });
    } catch {
        reply.code(502);
        return 'segment failed';
    }

    const buf = Buffer.isBuffer(resp.data) ? resp.data : Buffer.from(resp.data || []);
    if (resp.status >= 400 || !buf.length) {
        reply.code(502);
        return 'segment failed';
    }

    // 有些线路的分片地址没有扩展名，内容其实是子播放列表 → 当场重写，别当二进制吐回去
    const head = buf.subarray(0, 16).toString('latin1');
    if (head.includes('#EXTM3U')) {
        const origin = requestOrigin(inReq);
        reply.header('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Cache-Control', 'no-store');
        return reply.send(rewritePlaylist(buf.toString('utf8'), u, origin, r));
    }

    // HLS 分片/密钥都走这里，一律整段返回（Range 会让播放器 seek 错位）
    const ct = /\.m3u8(\?|$)/i.test(u)
        ? 'application/vnd.apple.mpegurl'
        : /\.ts(\?|$)/i.test(u)
            ? 'video/mp2t'
            : /\.m4s(\?|$)/i.test(u) || /\.mp4(\?|$)/i.test(u)
                ? 'video/mp4'
                : (resp.headers['content-type'] || 'application/octet-stream');

    reply.code(resp.status === 206 ? 206 : 200);
    reply.header('Content-Type', ct);
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Cache-Control', 'max-age=60');
    reply.header('Accept-Ranges', 'bytes');
    if (resp.headers['content-range']) reply.header('Content-Range', String(resp.headers['content-range']));
    reply.header('Content-Length', String(buf.length));
    return reply.send(buf);
}

export default {
    meta: {
        key: 'supjav',
        name: '🌸SupJav',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.get('/m3u8', m3u8);
        fastify.get('/seg', seg);
        fastify.post('/search', search);
        fastify.post('/debug', debug);
    },
};
