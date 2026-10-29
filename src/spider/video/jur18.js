/* ==========================================================================
 *  JUR18  ·  https://jur18.cc
 *  视频站采集插件(蜘蛛模块 / type:3)
 *  ---------------------------------------------------------------------------
 *  【站点结构】
 *   首页     https://jur18.cc/index            第 N 页: /index?page=N  (共 325 页)
 *   分类索引 https://jur18.cc/category         42 个标签,分 2 页列出
 *   分类列表 https://jur18.cc/tag?id=6         第 N 页: /tag?id=6&page=N
 *   搜索     https://jur18.cc/search?q=关键词   第 N 页: &page=N
 *   详情     https://jur18.cc/video?id=203264
 *   片源     详情页播放器是 JS 驱动的,地址在页面内联的
 *            window.__INITIAL_DATA__.video 里,有两个字段:
 *
 *              videoUrl  真实 CDN 直链  https://2609.senlin2026.com/<日期>/<hash>/index.m3u8
 *              magnet    站点自己的转发壳 https://myavimg.top/VodPlay/videoUrl/play_<md5>.m3u8
 *
 *            真实 CDN 实测不要 Referer、不要 Cookie,分片可直接拉(206 Range 正常)。
 *            主列表(master)里的子列表是根相对路径 /<日期>/<hash>/2000kb/hls/index.m3u8,
 *            播放器按自身 URL 解析即可,不需要改写。
 *
 *  【本插件要处理的两个坑】
 *    ① 整个页面被 XOR 加密:正文塞进 decrypt('<base64>') 里,key 在该页
 *       <script>const CRYPT_KEY="..."</script> 中(会随页面读取,不写死)。
 *       所以每次抓列表/详情都要先在本地解一遍。
 *    ② 部分 CDN 域名 HTTPS 证书过期(实测 240311.sl3split.com),
 *       同域换 http 就正常。探活失败会自动降级到 http 再试一次。
 *  ---------------------------------------------------------------------------
 *  【配置(全部可选,填在 ext 里)】
 *    base        string  镜像域名,默认 https://jur18.cc
 *    cookie      string  站点被 Cloudflare 拦住时,把浏览器 Cookie 贴进来
 *    proxy       string  本插件出网用的代理,如 http://127.0.0.1:7897
 *    streamProxy boolean 设为 true 时,/play 一律走本地 /proxy/stream 中转
 *    proxyBase   string  中转对外地址(挂在子路由时填)
 *    timeout     number  出网超时毫秒,默认 15000
 *  ---------------------------------------------------------------------------
 *  接口:POST /init /home /category /detail /play /search + GET /proxy/stream
 * ========================================================================== */

import { load } from 'cheerio';
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';

const META = { key: 'jur18', name: '🌸JUR18', type: 3 };

const DEFAULT_BASE = 'https://jur18.cc';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/* 兜底分类(站点改版时也不至于空着),数字为 /tag?id=N */
const FALLBACK_CLASS = [
    { id: 6, name: '日本精品' },
    { id: 11, name: '亚洲有码' },
    { id: 18, name: '亚洲无码' },
    { id: 14, name: '中文字幕' },
    { id: 5, name: '女优系列' },
    { id: 23, name: '国产色情' },
    { id: 35, name: '91探花' },
    { id: 36, name: '素人自拍' },
    { id: 38, name: '自拍偷拍' },
    { id: 37, name: '网红流出' },
    { id: 22, name: '网曝门' },
    { id: 24, name: '主播直播' },
    { id: 30, name: 'Cosplay' },
    { id: 40, name: '制服丝袜' },
    { id: 4, name: '人妻熟女' },
    { id: 7, name: '巨乳美乳' },
    { id: 8, name: '恋腿狂魔' },
    { id: 10, name: '欺辱凌辱' },
    { id: 1, name: '强奸乱伦' },
    { id: 20, name: '伦理三级' },
    { id: 16, name: '成人动漫' },
    { id: 15, name: '欧美精品' },
    { id: 3, name: '东南亚AV' },
    { id: 13, name: '韩国御姐' },
    { id: 43, name: '精品推荐' },
    { id: 39, name: '萝莉少女' },
    { id: 19, name: '传媒出品' },
    { id: 29, name: '多人多P' },
].map((c) => ({ type_id: `/tag?id=${c.id}`, type_name: c.name }));

/* --------------------------------------------------------------------------
 *  配置
 * ------------------------------------------------------------------------ */
const cfg = {
    base: DEFAULT_BASE,
    proxy: '',
    cookie: '',
    streamProxy: false,
    proxyBase: '',
    timeout: 15000,
};

function applyExt(ext) {
    const e = ext || {};
    const pick = (...keys) => {
        for (const k of keys) {
            const v = e[k];
            if (typeof v === 'string' && v.trim()) return v.trim();
            if (typeof v === 'boolean') return v;
        }
        return undefined;
    };
    const base = pick('base', 'host', 'site', 'url');
    if (base) cfg.base = String(base).replace(/\/+$/, '');
    const cookie = pick('cookie', 'cookies');
    if (cookie) cfg.cookie = String(cookie);
    const proxy = pick('proxy', 'httpsProxy', 'httpProxy');
    if (proxy) cfg.proxy = String(proxy);
    const sp = pick('streamProxy', 'proxyStream');
    if (typeof sp === 'boolean') cfg.streamProxy = sp;
    const pb = pick('proxyBase', 'selfBase');
    if (pb) cfg.proxyBase = String(pb).replace(/\/+$/, '');
    const t = pick('timeout');
    if (t) {
        const n = parseInt(t, 10);
        if (Number.isFinite(n) && n >= 1000) cfg.timeout = n;
    }
}

/* --------------------------------------------------------------------------
 *  出网(零外部依赖:gzip/br 自动解压 + 跟随跳转 + 可选代理 + 可选跳过证书校验)
 *    跳过证书校验只用于视频 CDN 探活/中转(有些 CDN 证书过期但内容正常),
 *    抓站点页面一律正常校验。
 * ------------------------------------------------------------------------ */
let _agent = null;
let _agentKey = '';

async function getAgent() {
    const p = cfg.proxy;
    if (!p) return undefined;
    if (_agent && _agentKey === p) return _agent;
    _agent = null;
    _agentKey = p;
    try {
        const mod = await import('https-proxy-agent');
        const Ctor = mod.HttpsProxyAgent || (mod.default && mod.default.HttpsProxyAgent);
        if (Ctor) _agent = new Ctor(p);
    } catch {
        _agent = null;
    }
    return _agent;
}

function requestOnce(url, opt, agent) {
    return new Promise((resolve, reject) => {
        let u;
        try {
            u = new URL(url);
        } catch {
            return reject(new Error(`地址不合法: ${url}`));
        }
        const isHttps = u.protocol === 'https:';
        const lib = isHttps ? https : http;
        const headers = {
            'User-Agent': UA,
            Accept: '*/*',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            ...(opt.headers || {}),
        };
        const reqOpt = {
            protocol: u.protocol,
            hostname: u.hostname,
            port: u.port || (isHttps ? 443 : 80),
            path: `${u.pathname}${u.search}`,
            method: opt.method || 'GET',
            headers,
            agent,
            timeout: opt.timeout || cfg.timeout,
        };
        if (isHttps && opt.insecure) reqOpt.rejectUnauthorized = false;

        const req = lib.request(reqOpt, (res) => {
            const status = res.statusCode || 0;
            const loc = res.headers.location;
            if (status >= 300 && status < 400 && loc && (opt.redirect || 0) < 5) {
                res.resume();
                let next;
                try {
                    next = new URL(loc, u).href;
                } catch {
                    return reject(new Error('跳转地址不合法'));
                }
                resolve(requestOnce(next, { ...opt, redirect: (opt.redirect || 0) + 1 }, agent));
                return;
            }
            const enc = String(res.headers['content-encoding'] || '').toLowerCase();
            let stream = res;
            try {
                if (enc === 'gzip') stream = res.pipe(zlib.createGunzip());
                else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
                else if (enc.indexOf('br') >= 0) stream = res.pipe(zlib.createBrotliDecompress());
            } catch {
                stream = res;
            }
            const chunks = [];
            stream.on('data', (c) => chunks.push(c));
            stream.on('end', () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks), url: u.href }));
            stream.on('error', reject);
            res.on('aborted', () => reject(new Error('连接被中断')));
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('请求超时')));
        if (opt.body) req.write(opt.body);
        req.end();
    });
}

async function httpRequest(url, opt = {}) {
    const agent = opt.noProxy ? undefined : await getAgent();
    return requestOnce(url, opt, agent);
}

function baseHeaders(referer) {
    const h = { Referer: referer || `${cfg.base}/` };
    if (cfg.cookie) h.Cookie = cfg.cookie;
    return h;
}

/* --------------------------------------------------------------------------
 *  页面解密(XOR + base64)
 *    key 从当页脚本里读,站点换 key 也不用改代码
 * ------------------------------------------------------------------------ */
function xorDecode(b64, keyBuf) {
    let buf;
    try {
        buf = Buffer.from(String(b64), 'base64');
    } catch {
        return '';
    }
    if (!buf.length || !keyBuf.length) return '';
    const out = Buffer.allocUnsafe(buf.length);
    for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ keyBuf[i % keyBuf.length];
    return out.toString('utf8');
}

function decodePage(raw) {
    const html = String(raw || '');
    if (!/decrypt\(/.test(html)) return html;
    const keyM = html.match(/CRYPT_KEY\s*=\s*["']([^"']{1,64})["']/);
    const blobs = [...html.matchAll(/decrypt\(\s*['"]([A-Za-z0-9+/=_-]{40,})['"]\s*\)/g)].map((m) => m[1]);
    if (!keyM || !blobs.length) return html;

    const keyBuf = Buffer.from(keyM[1], 'utf8');
    let best = '';
    for (const b of blobs) {
        const txt = xorDecode(b, keyBuf);
        if (txt.length > best.length) best = txt;
    }
    /* 解出来得像个页面才算数,否则原样返回 */
    if (best && /<(html|body|main|div|a)\b/i.test(best)) return best;
    return html;
}

/* 从页面里抠出 window.__INITIAL_DATA__ 这段 JSON(括号配平,避免正则被字符串里的 } 坑到) */
function extractJson(text, marker) {
    const i = text.indexOf(marker);
    if (i < 0) return null;
    let j = i + marker.length;
    while (j < text.length && text[j] !== '{') j++;
    if (j >= text.length) return null;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let k = j; k < text.length; k++) {
        const c = text[k];
        if (inStr) {
            if (esc) esc = false;
            else if (c === '\\') esc = true;
            else if (c === '"') inStr = false;
            continue;
        }
        if (c === '"') {
            inStr = true;
            continue;
        }
        if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) {
                try {
                    return JSON.parse(text.slice(j, k + 1));
                } catch {
                    return null;
                }
            }
        }
    }
    return null;
}

/* --------------------------------------------------------------------------
 *  小工具
 * ------------------------------------------------------------------------ */
function absUrl(u, base = cfg.base) {
    const s = String(u || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith('//')) return `https:${s}`;
    return `${base}${s.startsWith('/') ? '' : '/'}${s}`;
}

function htmlDecode(s) {
    return String(s || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&#x27;/gi, "'");
}

function stripTags(s) {
    return htmlDecode(String(s || '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

function b64encode(s) {
    return Buffer.from(String(s), 'utf8').toString('base64url');
}

function b64decode(s) {
    return Buffer.from(String(s), 'base64url').toString('utf8');
}

/* 时长字段站点没洗干净(会出现 "37-294791" / "25-290735" 这种拼了内部 id 的脏值),
   只保留 HH:MM:SS / MM:SS 形态,别把脏数据丢给播放器 */
function cleanDuration(v) {
    const s = String(v || '').trim();
    if (!s || s === '00:00') return '';
    const m = s.match(/^(\d{1,2}:\d{2}(?::\d{2})?)/);
    if (m) return m[1];
    const mins = s.match(/^(\d{1,3})-\d+$/);
    if (mins) {
        const n = parseInt(mins[1], 10);
        if (n > 0 && n < 600) return `${n} 分钟`;
    }
    return '';
}

async function getText(url, referer) {
    const res = await httpRequest(url, {
        headers: {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            ...baseHeaders(referer),
        },
        timeout: cfg.timeout,
    });
    const text = res.body.toString('utf8');
    const head = text.slice(0, 4000);
    if (res.status === 403 || /Just a moment|cf-browser-verification|Attention Required|Enable JavaScript and cookies/i.test(head)) {
        throw new Error(`站点 ${res.status} · 被 Cloudflare 校验拦住,可在 ext.cookie 里填浏览器 Cookie 后重试`);
    }
    if (res.status >= 400) throw new Error(`请求失败 HTTP ${res.status}: ${url}`);
    return decodePage(text);
}

/* --------------------------------------------------------------------------
 *  列表解析:优先吃 window.__INITIAL_DATA__(最稳),吃不到再退回 DOM
 * ------------------------------------------------------------------------ */
function cardOf(v) {
    const id = String(v.id ?? '').trim();
    if (!id) return null;
    return {
        vod_id: `${cfg.base}/video?id=${id}`,
        vod_name: stripTags(v.title || v.desc || '') || '未命名',
        vod_pic: String(v.thumb || ''),
        vod_remarks: cleanDuration(v.duration) || String(v.date || ''),
        type_name: stripTags(v.tag || v.category || ''),
        vod_year: String(v.date || '').slice(0, 4),
        vod_area: '',
        vod_content: '',
    };
}

function parseCardsFromDom(html) {
    const $ = load(html);
    const out = [];
    const seen = new Set();
    $('a.video-card').each((_, el) => {
        const $el = $(el);
        let href = String($el.attr('href') || '').trim();
        if (!href) return;
        href = absUrl(href);
        if (seen.has(href)) return;
        seen.add(href);
        const title = stripTags($el.find('.video-title').first().text());
        if (!title) return;
        const metaSpans = $el.find('.video-meta span');
        let date = '';
        let tag = '';
        metaSpans.each((__, sp) => {
            const t = stripTags($(sp).text());
            if (!t || t === '·') return;
            if (/^\d{4}-\d{2}-\d{2}/.test(t)) date = t;
            else if (!tag) tag = t;
        });
        const pic = String($el.find('img').first().attr('src') || '');
        out.push({
            vod_id: href,
            vod_name: title,
            vod_pic: absUrl(pic),
            vod_remarks: date,
            type_name: tag,
            vod_year: date.slice(0, 4),
            vod_area: '',
            vod_content: '',
        });
    });
    return out;
}

function parseListPage(html) {
    const data = extractJson(html, 'window.__INITIAL_DATA__');
    let list = [];
    if (data && Array.isArray(data.videos)) {
        list = data.videos.map(cardOf).filter(Boolean);
    }
    if (!list.length) list = parseCardsFromDom(html);

    const total = data && Number.isFinite(Number(data.total)) ? Number(data.total) : 0;
    return { list, total: total || list.length };
}

function parsePageCount(html, total, perPage) {
    const $ = load(html);
    let max = 1;
    $('.pagination a').each((_, el) => {
        const href = String($(el).attr('href') || '');
        const t = stripTags($(el).text());
        const m = href.match(/[?&]page=(\d+)/);
        const n = m ? parseInt(m[1], 10) : parseInt(t.replace(/[^\d]/g, ''), 10);
        if (Number.isFinite(n) && n > max && n < 100000) max = n;
    });
    if (total > 0 && perPage > 0) {
        const byTotal = Math.ceil(total / perPage);
        if (byTotal > max) max = byTotal;
    }
    return max;
}

/* --------------------------------------------------------------------------
 *  分类:抓 /category 的两页,拿到 42 个标签
 * ------------------------------------------------------------------------ */
async function fetchCategories() {
    const out = [];
    const seen = new Set();
    for (const p of [1, 2]) {
        const url = p === 1 ? `${cfg.base}/category` : `${cfg.base}/category?page=${p}`;
        let html = '';
        try {
            html = await getText(url, `${cfg.base}/`);
        } catch {
            continue;
        }
        const data = extractJson(html, 'window.__INITIAL_DATA__');
        if (data && Array.isArray(data.categories) && data.categories.length) {
            for (const c of data.categories) {
                const id = String(c.numericId ?? c.id ?? '').trim();
                const name = stripTags(c.name || c.desc || '');
                if (!id || !name) continue;
                const tid = `/tag?id=${id}`;
                if (seen.has(tid)) continue;
                seen.add(tid);
                out.push({ type_id: tid, type_name: name });
            }
            continue;
        }
        /* 没有 __INITIAL_DATA__ 时退回 DOM */
        const $ = load(html);
        $('a.category-card').each((_, el) => {
            const $el = $(el);
            const href = String($el.attr('href') || '').trim();
            const name = stripTags($el.find('.cat-card-name').first().text());
            if (!href || !name || seen.has(href)) return;
            seen.add(href);
            out.push({ type_id: href, type_name: name });
        });
    }
    return out;
}

/* --------------------------------------------------------------------------
 *  详情解析
 * ------------------------------------------------------------------------ */
function parseDetail(html, pageUrl) {
    const data = extractJson(html, 'window.__INITIAL_DATA__');
    const v = (data && data.video) || null;
    if (v) {
        return {
            id: String(v.id || ''),
            title: stripTags(v.title || v.desc || '') || '未命名',
            cover: absUrl(String(v.thumb || '')),
            desc: stripTags(v.desc || ''),
            date: String(v.date || ''),
            category: stripTags(v.category || ''),
            tag: stripTags(v.tag || ''),
            duration: cleanDuration(v.duration),
            videoUrl: String(v.videoUrl || ''),
            magnet: String(v.magnet || ''),
            related: Array.isArray(data.related) ? data.related.map(cardOf).filter(Boolean) : [],
        };
    }

    /* 兜底:直接解析 DOM */
    const $ = load(html);
    const title = stripTags($('.video-detail-title').first().text()) || stripTags($('h1').first().text());
    const cover = absUrl(String($('.player-thumb-img').first().attr('src') || ''));
    const desc = stripTags($('.video-detail-desc').first().text());
    const stats = $('.detail-stats span')
        .map((_, el) => stripTags($(el).text()))
        .get()
        .filter((t) => t && t !== '·');
    return {
        id: (String(pageUrl).match(/[?&]id=(\d+)/) || [])[1] || '',
        title: title || '未命名',
        cover,
        desc: desc || title,
        date: stats.find((t) => /^\d{4}-\d{2}-\d{2}/.test(t)) || '',
        category: stripTags($('#uploaderName').first().text()),
        tag: '',
        duration: '',
        videoUrl: '',
        magnet: '',
        related: parseCardsFromDom(html),
    };
}

/* --------------------------------------------------------------------------
 *  片源探活
 *    目标:确认这条 m3u8 到底能不能播(主列表 → 子列表 → 第一个分片 Range)
 *    顺带处理 https 证书过期(自动降级 http)
 * ------------------------------------------------------------------------ */
const _probeCache = new Map(); // url|insecure -> { ok, url, reason, at }
const PROBE_TTL = 10 * 60 * 1000;

function probeCacheGet(u) {
    const hit = _probeCache.get(u);
    if (hit && Date.now() - hit.at < PROBE_TTL) return hit;
    return null;
}

function probeCacheSet(u, v) {
    _probeCache.set(u, { ...v, at: Date.now() });
    if (_probeCache.size > 500) {
        const first = _probeCache.keys().next().value;
        _probeCache.delete(first);
    }
}

function isM3u8Text(headers, body) {
    const ct = String((headers && headers['content-type']) || '');
    if (/mpegurl/i.test(ct)) return true;
    const txt = body.slice(0, 16).toString('utf8');
    return /^#EXTM3U/.test(txt.trim());
}

function playlistLines(txt) {
    return String(txt)
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
}

async function fetchPlaylist(url, insecure = false) {
    const res = await httpRequest(url, {
        headers: { ...baseHeaders(`${cfg.base}/`), Accept: '*/*' },
        timeout: Math.min(cfg.timeout, 15000),
        insecure,
    });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    if (!isM3u8Text(res.headers, res.body)) throw new Error('不是 m3u8');
    return { text: res.body.toString('utf8'), url: res.url || url };
}

async function probeSegment(url, insecure = false) {
    const res = await httpRequest(url, {
        headers: { ...baseHeaders(`${cfg.base}/`), Range: 'bytes=0-1023' },
        timeout: Math.min(cfg.timeout, 15000),
        insecure,
    });
    if (res.status !== 200 && res.status !== 206) throw new Error(`分片 HTTP ${res.status}`);
    if (!res.body.length) throw new Error('分片为空');
    return true;
}

/* 递归解析到 media playlist,再抽第一个分片验一下
   insecure=false 时按正常证书校验(拿到能给播放器直连的地址)
   insecure=true  只用来判断"内容本身在不在",这时地址不能直接给播放器 */
async function probeMedia(url, depth = 0, insecure = false) {
    const key = `${url}|${insecure ? 1 : 0}`;
    const cached = probeCacheGet(key);
    if (cached) return cached;

    let result = { ok: false, url, reason: '' };
    try {
        const { text, url: baseUrl } = await fetchPlaylist(url, insecure);
        const lines = playlistLines(text);
        const uris = lines.filter((l) => !l.startsWith('#'));

        if (/#EXT-X-STREAM-INF/i.test(text) && uris.length && depth < 2) {
            const mediaUrl = new URL(uris[0], baseUrl).href;
            result = await probeMedia(mediaUrl, depth + 1, insecure);
        } else if (uris.length) {
            const segUrl = new URL(uris[0], baseUrl).href;
            await probeSegment(segUrl, insecure);
            result = { ok: true, url, reason: '' };
        } else {
            result = { ok: false, url, reason: '播放列表为空' };
        }
    } catch (e) {
        result = { ok: false, url, reason: String((e && e.message) || e) };
    }
    probeCacheSet(key, result);
    return result;
}

/* 探活三段式:
 *   ① https 正常校验    → 拿到了播放器能直连的地址
 *   ② 换 http 再试       → 有些 CDN 证书过期但 http 是通的(实测 240311.sl3split.com)
 *   ③ 忽略证书再试一次   → 内容在,但地址不能给播放器直连,必须走本地中转
 */
async function probeWithFallback(url) {
    const first = await probeMedia(url, 0, false);
    if (first.ok) return first;

    if (/^https:\/\//i.test(url)) {
        const alt = url.replace(/^https:\/\//i, 'http://');
        const second = await probeMedia(alt, 0, false);
        if (second.ok) return { ...second, url: alt, downgraded: true };
    }

    const third = await probeMedia(url, 0, true);
    if (third.ok) return { ...third, url, needsProxy: true };

    return first;
}

/* --------------------------------------------------------------------------
 *  本地中转
 * ------------------------------------------------------------------------ */
function protocolOf(request) {
    try {
        const h = (request && request.headers) || {};
        const xf = String(h['x-forwarded-proto'] || '').split(',')[0].trim();
        if (xf === 'http' || xf === 'https') return xf;
        return request && request.protocol === 'http' ? 'http' : 'https';
    } catch {
        return 'https';
    }
}

function selfBase(request) {
    if (cfg.proxyBase) return cfg.proxyBase.replace(/\/+$/, '');
    try {
        const h = (request && request.headers) || {};
        const host = String(h['x-forwarded-host'] || h.host || '').split(',')[0].trim();
        if (host) return `${protocolOf(request)}://${host}`;
    } catch {
        /* ignore */
    }
    return cfg.base;
}

function proxyUrl(base, target, referer) {
    const u = `${base.replace(/\/+$/, '')}/proxy/stream?u=${b64encode(target)}`;
    return referer ? `${u}&ref=${b64encode(referer)}` : u;
}

function rewriteM3u8(raw, playlistUrl, base, referer) {
    const out = [];
    for (const line of String(raw).split(/\r?\n/)) {
        const t = line.trim();
        if (!t) {
            out.push('');
            continue;
        }
        if (t.startsWith('#')) {
            /* 改写 #EXT-X-KEY / #EXT-X-MAP 里的 URI,否则解密 key 拉不到 */
            out.push(
                t.replace(/URI="([^"]+)"/g, (m, uri) => {
                    try {
                        return `URI="${proxyUrl(base, new URL(uri, playlistUrl).href, referer)}"`;
                    } catch {
                        return m;
                    }
                }),
            );
            continue;
        }
        try {
            out.push(proxyUrl(base, new URL(t, playlistUrl).href, referer));
        } catch {
            out.push(t);
        }
    }
    return out.join('\n');
}

/* 分片短缓存:播放器 seek/重试时别反复打上游(这些 CDN 限流很敏感) */
const _segCache = new Map();
const SEG_TTL = 60 * 1000;
const SEG_MAX = 16;

function segGet(u) {
    const hit = _segCache.get(u);
    if (hit && Date.now() - hit.at < SEG_TTL) return hit.body;
    if (hit) _segCache.delete(u);
    return null;
}

function segSet(u, body) {
    if (body.length > 3 * 1024 * 1024) return;
    _segCache.set(u, { body, at: Date.now() });
    if (_segCache.size > SEG_MAX) _segCache.delete(_segCache.keys().next().value);
}

async function streamProxy(request, reply) {
    const q = request.query || {};
    let target = '';
    let referer = '';
    try {
        target = q.u ? b64decode(q.u) : '';
        referer = q.ref ? b64decode(q.ref) : '';
    } catch {
        target = '';
        referer = '';
    }
    if (!target && q.url) target = decodeURIComponent(String(q.url));
    if (!target || !/^https?:\/\//i.test(target)) {
        reply.code(400).send('missing u');
        return;
    }

    const headers = {
        'User-Agent': UA,
        Accept: '*/*',
        Referer: referer || `${cfg.base}/`,
    };
    const clientRange = request.headers && request.headers.range;
    if (clientRange) headers.Range = clientRange;

    /* m3u8:拉全量 → 重写成本地中转地址 */
    const isPlaylist = /\.m3u8(\?|$)/i.test(target);
    if (isPlaylist) {
        try {
            const { text, url } = await fetchPlaylist(target, true);
            const base = selfBase(request);
            reply.header('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
            reply.header('Access-Control-Allow-Origin', '*');
            reply.header('Cache-Control', 'no-cache');
            reply.send(rewriteM3u8(text, url, base, referer || `${cfg.base}/`));
        } catch (e) {
            reply.code(502).send(`playlist error: ${String((e && e.message) || e)}`);
        }
        return;
    }

    /* 分片:命中缓存直接切片返回,支持 Range */
    const cached = segGet(target);
    if (cached) {
        reply.header('Content-Type', 'video/mp2t');
        reply.header('Accept-Ranges', 'bytes');
        reply.header('Access-Control-Allow-Origin', '*');
        const m = String(clientRange || '').match(/bytes=(\d+)-(\d*)/);
        if (m) {
            const start = parseInt(m[1], 10);
            const end = m[2] ? parseInt(m[2], 10) : cached.length - 1;
            const slice = cached.subarray(start, Math.min(end + 1, cached.length));
            reply.code(206);
            reply.header('Content-Range', `bytes ${start}-${start + slice.length - 1}/${cached.length}`);
            reply.header('Content-Length', String(slice.length));
            reply.send(slice);
        } else {
            reply.header('Content-Length', String(cached.length));
            reply.send(cached);
        }
        return;
    }

    /* 视频分片:边下边发(小文件顺便缓存) */
    await new Promise((resolve) => {
        let u;
        try {
            u = new URL(target);
        } catch {
            reply.code(400).send('bad target');
            return resolve();
        }
        const isHttps = u.protocol === 'https:';
        const lib = isHttps ? https : http;
        const reqOpt = {
            protocol: u.protocol,
            hostname: u.hostname,
            port: u.port || (isHttps ? 443 : 80),
            path: `${u.pathname}${u.search}`,
            method: 'GET',
            headers,
            timeout: 30000,
        };
        if (isHttps) reqOpt.rejectUnauthorized = false;

        const req = lib.request(reqOpt, (res) => {
            const status = res.statusCode || 200;
            if (status >= 400) {
                res.resume();
                reply.code(status).send(`upstream ${status}`);
                return resolve();
            }
            const ct = String(res.headers['content-type'] || 'video/mp2t');
            reply.code(status);
            reply.header('Content-Type', ct);
            for (const h of ['content-length', 'accept-ranges', 'content-range', 'last-modified', 'etag']) {
                if (res.headers[h]) reply.header(h, res.headers[h]);
            }
            reply.header('Access-Control-Allow-Origin', '*');

            /* 不支持 Range 的上游 + 小文件 → 先收完再发,顺便进缓存 */
            const noRange = !clientRange;
            const len = parseInt(String(res.headers['content-length'] || '0'), 10);
            if (noRange && len > 0 && len <= 2 * 1024 * 1024) {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    const body = Buffer.concat(chunks);
                    segSet(target, body);
                    try {
                        reply.header('Content-Length', String(body.length));
                        reply.send(body);
                    } catch {
                        /* ignore */
                    }
                    resolve();
                });
                res.on('error', () => resolve());
                return;
            }

            reply.send(res);
            res.on('end', resolve);
            res.on('error', () => resolve());
        });
        req.on('timeout', () => req.destroy(new Error('upstream timeout')));
        req.on('error', (e) => {
            try {
                reply.code(502).send(String((e && e.message) || e));
            } catch {
                /* ignore */
            }
            resolve();
        });
        req.end();
    });
}

/* --------------------------------------------------------------------------
 *  路由
 * ------------------------------------------------------------------------ */
async function init(inReq) {
    applyExt((inReq && inReq.body && inReq.body.ext) || {});
    return {
        base: cfg.base,
        cookie: cfg.cookie ? '已配置' : '未配置',
        proxy: cfg.proxy ? '已配置' : '直连',
        streamProxy: cfg.streamProxy,
    };
}

async function home(inReq) {
    applyExt((inReq && inReq.body && inReq.body.ext) || {});
    let cats = [];
    let notice = '';
    try {
        cats = await fetchCategories();
    } catch (e) {
        notice = String((e && e.message) || e);
    }
    const classList = [{ type_id: '/index', type_name: '🆕 最新更新' }, ...cats];
    if (classList.length < 2) {
        classList.push(...FALLBACK_CLASS);
    }
    return { class: classList, filters: {}, notice };
}

/* 把 type_id 拼成列表页地址(/tag?id=6 + page=2 → /tag?id=6&page=2) */
function buildListUrl(tid, page) {
    let p = String(tid ?? '/index').trim();
    if (/^https?:\/\//i.test(p)) {
        try {
            const u = new URL(p);
            p = u.pathname + (u.search || '');
        } catch {
            p = '/index';
        }
    }
    if (/^\d+$/.test(p)) p = `/tag?id=${p}`;
    if (!p.startsWith('/')) p = `/${p}`;

    const n = parseInt(page, 10) || 1;
    let u;
    try {
        u = new URL(p, cfg.base);
    } catch {
        u = new URL('/index', cfg.base);
    }
    if (n > 1) u.searchParams.set('page', String(n));
    else u.searchParams.delete('page');
    return u.href;
}

async function category(inReq) {
    const body = (inReq && inReq.body) || {};
    applyExt(body.ext || {});
    const page = parseInt(body.page ?? body.pg ?? 1, 10) || 1;
    const tidRaw = body.id ?? body.tid ?? body.type_id ?? '/index';
    const tid = String(tidRaw || '/index');

    let url = buildListUrl(tid, page);
    /* 根路径 / 和 /category(分类索引页本身是一堆标签,没有视频列表)统一走最新更新 */
    if (/^\/(category)?$/.test(new URL(url).pathname)) {
        url = buildListUrl('/index', page);
    }

    const html = await getText(url, `${cfg.base}/`);
    const { list, total } = parseListPage(html);
    const pagecount = parsePageCount(html, total, list.length || 24);

    /* 站点翻过最后一页会回吐内容(不返回空页),这里按总数把越界的页切掉,
       免得播放器一路翻下去全是重复列表 */
    if (pagecount > 1 && page > pagecount) {
        return { page, pagecount, limit: 0, total: total || 0, list: [] };
    }

    return {
        page,
        pagecount,
        limit: list.length,
        total: total || list.length,
        list,
    };
}

async function detail(inReq) {
    const body = (inReq && inReq.body) || {};
    applyExt(body.ext || {});
    const raw = String(body.id || body.ids || '').trim().replace(/\$\$\$.*$/, '');
    if (!raw) return { list: [] };

    let url = raw;
    if (!/^https?:\/\//i.test(url)) {
        if (/^\d+$/.test(url)) url = `${cfg.base}/video?id=${url}`;
        else url = absUrl(url);
    }

    const html = await getText(url, `${cfg.base}/`);
    const d = parseDetail(html, url);

    /* 站点对不存在的 id 会返回 200 + 一张标题为「视频不存在」的空页,别当正常结果吐出去 */
    if (!d.id || /^视频不存在$/.test(d.title) || (!d.videoUrl && !d.magnet && !d.cover)) {
        return { list: [] };
    }

    const lines = [];
    if (d.title) lines.push(d.title);
    if (d.desc && d.desc !== d.title) lines.push(d.desc);
    if (d.category) lines.push(`分类:${d.category}`);
    if (d.tag && d.tag !== d.category) lines.push(`标签:${d.tag}`);
    if (d.date) lines.push(`发布:${d.date}`);
    if (d.duration) lines.push(`时长:${d.duration}`);
    lines.push(`来源:${url}`);

    /* 线路1 = 真实 CDN 直连(实测可直拉,不占中转带宽)
       线路2 = 站点自带的转发壳(作兜底) */
    const eps = [];
    if (d.videoUrl) {
        eps.push(`线路1$${META.key}://${b64encode(JSON.stringify({ u: d.videoUrl, t: 'cdn', p: url }))}`);
    }
    if (d.magnet) {
        eps.push(`线路2$${META.key}://${b64encode(JSON.stringify({ u: d.magnet, t: 'shell', p: url }))}`);
    }

    return {
        list: [
            {
                vod_id: url,
                vod_name: d.title || '未命名',
                vod_pic: d.cover,
                vod_content: lines.join('\n'),
                vod_remarks: eps.length ? `${eps.length} 线路` : '暂无片源',
                vod_year: (d.date || '').slice(0, 4),
                vod_area: '',
                vod_actor: '',
                vod_director: '',
                type_name: d.category || d.tag || '',
                vod_play_from: eps.length ? META.key : '',
                vod_play_url: eps.join('#'),
            },
        ],
    };
}

function selfBaseFromReq(req) {
    if (cfg.proxyBase) return cfg.proxyBase.replace(/\/+$/, '');
    try {
        const headers = (req && req.headers) || {};
        const host = String(headers['x-forwarded-host'] || headers.host || '').split(',')[0].trim();
        if (!host) return cfg.base;
        return `${protocolOf(req)}://${host}`;
    } catch {
        return cfg.base;
    }
}

/* 详情页 ▸ 抓一次,把两条线路都取出来(线路1不通时换线路2) */
async function linesOfPage(pageUrl) {
    const html = await getText(pageUrl, `${cfg.base}/`);
    const d = parseDetail(html, pageUrl);
    const out = [];
    if (d.videoUrl) out.push({ u: d.videoUrl, t: 'cdn', p: pageUrl });
    if (d.magnet) out.push({ u: d.magnet, t: 'shell', p: pageUrl });
    return out;
}

let lastRef = '';

/* 逐条线路试:能直连就给直连地址,证书有问题/必须带头的给中转地址,
   这条彻底验不过就换下一条(不在这里直接返回中转,否则线路1一挂就看不到线路2) */
async function playFromCandidates(inReq, candidates) {
    const ref = `${cfg.base}/`;
    let lastTarget = '';
    let lastPage = '';

    for (const c of candidates) {
        const target = String(c.u || '').trim();
        if (!/^https?:\/\//i.test(target)) continue;
        lastTarget = target;
        lastPage = c.p || '';
        const refUrl = c.p ? absUrl(c.p, cfg.base) : ref;

        /* 强制中转:不探活了,直接给中转地址 */
        if (cfg.streamProxy) {
            return { parse: 0, url: proxyUrl(selfBaseFromReq(inReq), target, refUrl), header: { 'User-Agent': UA } };
        }

        const probed = await probeWithFallback(target);
        if (probed.ok && !probed.needsProxy) {
            return { parse: 0, url: probed.url, header: { 'User-Agent': UA } };
        }
        if (probed.ok && probed.needsProxy) {
            /* 内容在,但证书有问题 / 地址不能直连 → 交给本地中转 */
            return { parse: 0, url: proxyUrl(selfBaseFromReq(inReq), probed.url, refUrl), header: { 'User-Agent': UA } };
        }
        /* 这条不通,试下一条 */
    }

    /* 全都不通:返回 null,交给上层去做「先换备用线路、再兜底中转」的决定,
       这里不能直接甩中转地址,否则线路1一挂用户就永远看不到线路2 */
    lastRef = lastTarget ? (lastPage ? absUrl(lastPage, cfg.base) : ref) : '';
    return null;
}

async function play(inReq) {
    const body = (inReq && inReq.body) || {};
    applyExt(body.ext || {});
    let id = String(body.id || body.url || body.play || '').trim();
    if (id.includes('$')) id = id.split('$').pop().trim();
    if (!id) return { parse: 0, url: '' };

    const marker = `${META.key}://`;
    let payload = null;

    if (id.startsWith(marker)) {
        try {
            const raw = b64decode(id.slice(marker.length));
            payload = raw.trim().startsWith('{') ? JSON.parse(raw) : { u: raw, t: 'cdn' };
        } catch {
            payload = null;
        }
    }

    /* 1) 插件自己发的线路标记 */
    if (payload && payload.u) {
        const r = await playFromCandidates(inReq, [{ u: payload.u, t: payload.t || 'cdn', p: payload.p || '' }]);
        if (r) return r;

        /* 这条不通:去详情页把另一条线路补上再试(线路1 挂了一般线路2 还在) */
        if (payload.p) {
            try {
                const all = await linesOfPage(absUrl(payload.p, cfg.base));
                const rest = all.filter((x) => x.u !== payload.u);
                if (rest.length) {
                    const r2 = await playFromCandidates(inReq, rest);
                    if (r2) return r2;
                }
            } catch {
                /* ignore */
            }
        }

        /* 都不通:交给中转再赌一次(探活可能只是瞬时抖动) */
        return {
            parse: 0,
            url: proxyUrl(selfBaseFromReq(inReq), payload.u, lastRef || `${cfg.base}/`),
            header: { 'User-Agent': UA },
        };
    }

    /* 2) 客户端直接丢了详情页地址(m3u8 直链也在这里兼容) */
    if (/^https?:\/\/[^/]*jur18\.cc\/video/i.test(id) || /^\d+$/.test(id)) {
        const pageUrl = /^\d+$/.test(id) ? `${cfg.base}/video?id=${id}` : id;
        let all = [];
        try {
            all = await linesOfPage(pageUrl);
        } catch {
            all = [];
        }
        if (!all.length) return { parse: 0, url: '' };

        const r = await playFromCandidates(inReq, all);
        if (r) return r;

        return {
            parse: 0,
            url: proxyUrl(selfBaseFromReq(inReq), all[0].u, pageUrl),
            header: { 'User-Agent': UA },
        };
    }

    /* 3) 手贴的媒体地址 */
    const direct = absUrl(id);
    return { parse: 0, url: direct, header: { 'User-Agent': UA } };
}

async function search(inReq) {
    const body = (inReq && inReq.body) || {};
    applyExt(body.ext || {});
    const wd = String(body.wd || body.key || body.keyword || '').trim();
    if (!wd) return { list: [] };
    const page = parseInt(body.page ?? body.pg ?? 1, 10) || 1;

    const u = new URL('/search', cfg.base);
    u.searchParams.set('q', wd);
    if (page > 1) u.searchParams.set('page', String(page));

    const html = await getText(u.href, `${cfg.base}/`);
    const { list, total } = parseListPage(html);
    return { list, page, total };
}

export default {
    meta: META,
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/proxy/stream', streamProxy);
    },
};
