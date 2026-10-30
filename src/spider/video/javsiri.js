/* ==========================================================================
 *  JAVSIRI  ·  https://javsiri.cc/zh/
 *  视频站采集插件(蜘蛛模块 / type:3)
 *  ---------------------------------------------------------------------------
 *  【站点结构】Kernel-Tube 系(kt_player)
 *   首页      https://javsiri.cc/zh/                     (聚合页,不做分类用)
 *   最新更新  https://javsiri.cc/zh/latest-updates/      (第 N 页: .../latest-updates/2/)
 *   最多播放  https://javsiri.cc/zh/most-popular/
 *   最高评分  https://javsiri.cc/zh/top-rated/
 *   分类      https://javsiri.cc/zh/categories/censored/ (有码)
 *             https://javsiri.cc/zh/categories/jav-uncensored/ (无码)
 *             https://javsiri.cc/zh/categories/amateur/    (业余)
 *             https://javsiri.cc/zh/categories/fc2ppv/     (FC2PPV)
 *   标签      https://javsiri.cc/zh/tags/creampie/       (第 N 页: .../2/)
 *   女优      https://javsiri.cc/zh/models/akari-niimura/ (第 N 页: .../2/)
 *   片商      https://javsiri.cc/zh/makers/attackers/
 *   搜索      https://javsiri.cc/zh/search/<关键词>/     (单页 20 条,无翻页)
 *   详情      https://javsiri.cc/zh/video/<id>/<slug>/
 *   备用播放  https://javsiri.cc/zh/embed/<id>/          (轻量页,只带播放器配置)
 *  ---------------------------------------------------------------------------
 *  【片源链路】站长把 mp4 藏在一层 302 后面,不是 m3u8:
 *
 *    详情页 var flashvars = {
 *        video_url:       .../get_file/5/<hash>/18000/<id>/<id>.mp4/?v-acctoken=...   (480p)
 *        video_alt_url:   ..._720p.mp4/?v-acctoken=...                               (720p)
 *        video_alt_url2:  ..._1080p.mp4/?v-acctoken=...                              (1080p,老片没有)
 *    }
 *        └─ GET 上面地址 → 302 Location: https://cloud.javsiri.cc/remote_control.php
 *                                       ?file=<加密路径>.mp4&acctoken=<签名>
 *              └─ 落地: Content-Type: video/mp4,支持 Range / 206 精确切片
 *
 *    实测:不需要 Referer、不需要 Cookie,跨请求继续可用(v-acctoken 由页面签发,
 *    302 每次重新签发 cloud 的 acctoken),所以默认直接把 get_file 地址交给播放器,
 *    少一层中转、不占带宽。播放器不跟 302 或探活失败时,自动回落到本地 /proxy/stream。
 *
 *  【坑】
 *   · 老片常常只有 480p/720p,video_alt_url2 整个字段缺失 —— 按实际存在的清晰度出线路,
 *     不会给播放器一条 200 空 body 的死链。
 *   · 部分视频详情页给的是 0 条片源(下架/会员片),这类用 /zh/embed/<id>/ 二次兜底,
 *     embed 页只 7KB,但也带完整 flashvars。
 *   · 站点搜索只吃拉丁关键词:ssis / HMN-817 / jun 都有结果,纯中文(黑丝/中文)返回空。
 *     插件在搜索为空时自动回落到「标签中文名 / 女优名 / 片商名」匹配,中文也能搜到东西。
 *   · 分类/标签/女优页翻页是 /.../2/ 这种路径式,不是 ?page=2,/categories/x/2/ 才是对的。
 *  ---------------------------------------------------------------------------
 *  【配置(全部可选,填在 ext 里)】
 *    base        string  镜像域名,默认 https://javsiri.cc
 *    lang        string  语言前缀,默认 zh(可换 ja/de/ko/th/vi/ms)
 *    cookie      string  被 Cloudflare 拦住时,把浏览器 Cookie 贴进来
 *    proxy       string  本插件自己出网用的代理,如 http://127.0.0.1:7897
 *    streamProxy boolean 设为 true 时,/play 一律走本地 /proxy/stream 中转
 *    proxyBase   string  中转对外地址(挂子路由时填,如 https://x.com/js)
 *    timeout     number  出网超时毫秒,默认 15000
 *  ---------------------------------------------------------------------------
 *  接口:POST /init /home /category /detail /play /search + GET /proxy/stream
 * ========================================================================== */

import { load } from 'cheerio';
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';

const META = { key: 'javsiri', name: '🌸JAVsiri', type: 3 };

const DEFAULT_BASE = 'https://javsiri.cc';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/* 站点抓不到分类时用的兜底(实测存在的 4 个主分类 + 3 个榜单) */
const FALLBACK_CLASS = [
    { type_id: '/zh/latest-updates/', type_name: '🆕 最新更新' },
    { type_id: '/zh/most-popular/', type_name: '🔥 最多播放' },
    { type_id: '/zh/top-rated/', type_name: '⭐ 最高评分' },
    { type_id: '/zh/categories/censored/', type_name: '有码' },
    { type_id: '/zh/categories/jav-uncensored/', type_name: '无修正' },
    { type_id: '/zh/categories/amateur/', type_name: '业余' },
    { type_id: '/zh/categories/fc2ppv/', type_name: 'FC2PPV' },
];

/* --------------------------------------------------------------------------
 *  配置
 * ------------------------------------------------------------------------ */
const cfg = {
    base: DEFAULT_BASE,
    lang: 'zh',
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
    const lang = pick('lang', 'locale');
    if (lang) cfg.lang = String(lang).replace(/^\/+|\/+$/g, '') || 'zh';
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
 *  小工具
 * ------------------------------------------------------------------------ */
function absUrl(u, base = cfg.base) {
    const s = String(u || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith('//')) return `https:${s}`;
    if (s.startsWith('/')) return `${base.replace(/\/+$/, '')}${s}`;
    return `${base.replace(/\/+$/, '')}/${s}`;
}

function htmlDecode(s) {
    return String(s || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&nbsp;/g, ' ');
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

/* PHP 风格的 ISO8601 时长(PT1H59M56S) → 1:59:56 */
function isoDurationToText(v) {
    const m = String(v || '').match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
    if (!m) return '';
    const d = parseInt(m[1] || '0', 10);
    const h = parseInt(m[2] || '0', 10) + d * 24;
    const mi = parseInt(m[3] || '0', 10);
    const s = parseInt(m[4] || '0', 10);
    if (!h && !mi && !s) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${pad(mi)}:${pad(s)}` : `${mi}:${pad(s)}`;
}

/* 列表页的时长("2:14:42"),顺手兼容秒数 */
function cleanDuration(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    const m = s.match(/^(\d{1,2}:\d{2}(?::\d{2})?)/);
    if (m) return m[1];
    const n = parseInt(s.replace(/[^\d]/g, ''), 10);
    if (Number.isFinite(n) && n > 0 && n < 40000 && /^\d+$/.test(s)) {
        const h = Math.floor(n / 3600);
        const mi = Math.floor((n % 3600) / 60);
        const se = n % 60;
        const pad = (x) => String(x).padStart(2, '0');
        return h ? `${h}:${pad(mi)}:${pad(se)}` : `${mi}:${pad(se)}`;
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
    if (
        res.status === 403 ||
        /Just a moment|cf-browser-verification|Attention Required|Enable JavaScript and cookies/i.test(head)
    ) {
        throw new Error(`站点 ${res.status} · 被 Cloudflare 校验拦住,可在 ext.cookie 里填浏览器 Cookie 后重试`);
    }
    if (res.status >= 400) throw new Error(`请求失败 HTTP ${res.status}: ${url}`);
    return text;
}

/* --------------------------------------------------------------------------
 *  列表解析
 * ------------------------------------------------------------------------ */
function parseListPage(html) {
    const $ = load(html);
    const out = [];
    const seen = new Set();

    $('div.thumb').each((_, el) => {
        const $el = $(el);
        const $a = $el.find('a[href*="/video/"]').first();
        let href = String($a.attr('href') || '').trim();
        if (!href) return;
        href = absUrl(href);
        const idMatch = href.match(/\/video\/(\d+)\//);
        if (!idMatch) return;
        const key = idMatch[1];
        if (seen.has(key)) return;
        seen.add(key);

        const title = stripTags($el.find('div.title').first().text() || $a.attr('title') || '');
        if (!title) return;

        const pic = String(
            $el.find('img').first().attr('data-original') ||
                $el.find('img').first().attr('data-webp') ||
                $el.find('img').first().attr('src') ||
                '',
        );
        const dur = cleanDuration($el.find('div.time').first().text());
        const quality = stripTags($el.find('span.qualtiy').first().text());
        const date = stripTags($el.find('.thumb-item-date').first().text());

        out.push({
            vod_id: href,
            vod_name: title,
            vod_pic: absUrl(pic),
            vod_remarks: dur || quality || '',
            type_name: quality || '',
            vod_year: '',
            vod_area: '',
            vod_content: '',
        });
    });

    return { list: out, total: out.length };
}

function parsePageCount(html, perPage) {
    const $ = load(html);
    let max = 1;
    $('.pagination a').each((_, el) => {
        const href = String($(el).attr('href') || '');
        const m = href.match(/\/(\d+)\/?$/);
        const n = m ? parseInt(m[1], 10) : 0;
        if (Number.isFinite(n) && n > max && n < 100000) max = n;
    });
    return max;
}

function isEmptyList(html) {
    return /该列表是空的|There are no videos|No videos found/i.test(html);
}

/* --------------------------------------------------------------------------
 *  导航:分类 / 标签 / 女优 / 片商
 * ------------------------------------------------------------------------ */
let _navCache = { at: 0, tags: [], models: [], makers: [], cats: [] };
const NAV_TTL = 10 * 60 * 1000;

function langPath(p) {
    const s = String(p || '').trim();
    const base = `/${cfg.lang}/`;
    if (!s || s === '/') return base;
    if (s.startsWith(base)) return s;
    if (s.startsWith('/')) return `/${cfg.lang}${s}`;
    return `${base}${s}`;
}

async function fetchNav() {
    if (Date.now() - _navCache.at < NAV_TTL && _navCache.tags.length) return _navCache;

    const tags = [];
    const cats = [];
    const models = [];
    const makers = [];

    /* 分类页里同时带「热门标签」swiper 和 4 个主分类卡片 */
    try {
        const html = await getText(`${cfg.base}${langPath('/categories/')}`, `${cfg.base}/`);
        const $ = load(html);

        $('a[href*="/categories/"]').each((_, el) => {
            const $el = $(el);
            const href = String($el.attr('href') || '');
            const m = href.match(/\/categories\/([a-z0-9\-_]+)\/?$/i);
            if (!m) return;
            const name = stripTags($el.find('.title').first().text() || $el.attr('title') || $el.text());
            if (!name || /类别|categories/i.test(name)) return;
            const tid = langPath(`/categories/${m[1]}/`);
            if (!cats.some((c) => c.type_id === tid)) cats.push({ type_id: tid, type_name: name });
        });

        $('a[href*="/tags/"]').each((_, el) => {
            const $el = $(el);
            const href = String($el.attr('href') || '');
            const m = href.match(/\/tags\/([a-z0-9\-_]+)\/?$/i);
            if (!m) return;
            const name = stripTags($el.text());
            if (!name) return;
            const tid = langPath(`/tags/${m[1]}/`);
            if (!tags.some((t) => t.type_id === tid)) tags.push({ type_id: tid, type_name: name, slug: m[1] });
        });
    } catch {
        /* 忽略:用兜底 */
    }

    /* 女优库(第一页 45 个,取前 24) */
    try {
        const html = await getText(`${cfg.base}${langPath('/models/')}`, `${cfg.base}/`);
        const $ = load(html);
        $('a[href*="/models/"]').each((_, el) => {
            const $el = $(el);
            const href = String($el.attr('href') || '');
            const m = href.match(/\/models\/([a-z0-9\-_]+)\/?$/i);
            if (!m || m[1] === '') return;
            const name = stripTags($el.attr('title') || $el.find('div.title').first().text() || '');
            if (!name) return;
            const tid = langPath(`/models/${m[1]}/`);
            if (!models.some((x) => x.type_id === tid)) models.push({ type_id: tid, type_name: `👩 ${name}` });
        });
    } catch {
        /* ignore */
    }

    /* 片商(第一页,取前 12) */
    try {
        const html = await getText(`${cfg.base}${langPath('/makers/')}`, `${cfg.base}/`);
        const $ = load(html);
        $('a[href*="/makers/"]').each((_, el) => {
            const $el = $(el);
            const href = String($el.attr('href') || '');
            const m = href.match(/\/makers\/([a-z0-9\-_]+)\/?$/i);
            if (!m) return;
            const name = stripTags($el.attr('title') || $el.find('div.title').first().text() || '');
            if (!name) return;
            const tid = langPath(`/makers/${m[1]}/`);
            if (!makers.some((x) => x.type_id === tid)) makers.push({ type_id: tid, type_name: `🏷 ${name}` });
        });
    } catch {
        /* ignore */
    }

    _navCache = {
        at: Date.now(),
        cats,
        tags: tags.slice(0, 40),
        models: models.slice(0, 24),
        makers: makers.slice(0, 12),
    };
    return _navCache;
}

/* --------------------------------------------------------------------------
 *  详情解析(ld+json + flashvars)
 * ------------------------------------------------------------------------ */
function parseFlashvars(html) {
    const i = html.indexOf('var flashvars');
    if (i < 0) {
        /* embed 页不写 "var flashvars",配置对象直接内联在脚本里 → 全页扫,
           我们只读几个固定键,不会误伤 */
        const out = {};
        const re0 = /(\w+)\s*:\s*'((?:[^'\\]|\\.)*)'/g;
        let m0;
        while ((m0 = re0.exec(html))) {
            if (!(m0[1] in out)) out[m0[1]] = m0[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
        }
        return out;
    }
    /* 配置块的结束位置:优先找 "var params",没有就退到 </script>,再不行留 20K 余量
       (以前这里写成 Math.max(i+200, -1),页面里没有 var params 时只截到 200 字节,
        720p/1080p 那两个字段全部丢失 —— 别改回去) */
    let end = html.indexOf('var params', i);
    if (end < 0) end = html.indexOf('</script>', i);
    if (end < 0) end = Math.min(html.length, i + 20000);
    const blk = html.slice(i, end);
    const out = {};
    const re = /(\w+)\s*:\s*'((?:[^'\\]|\\.)*)'/g;
    let m;
    while ((m = re.exec(blk))) out[m[1]] = m[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    return out;
}

function parseLd(html) {
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
    if (!m) return null;
    try {
        return JSON.parse(m[1]);
    } catch {
        return null;
    }
}

function metaContent(html, prop) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i');
    const m = html.match(re);
    if (m) return htmlDecode(m[1]);
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i');
    const m2 = html.match(re2);
    return m2 ? htmlDecode(m2[1]) : '';
}

function parseDetail(html, pageUrl) {
    const fv = parseFlashvars(html);
    const ld = parseLd(html) || {};

    const $ = load(html);
    const h1 = stripTags($('h1.title').first().text() || $('h1').first().text());
    const title = stripTags(fv.video_title || ld.name || h1 || metaContent(html, 'og:title') || '') || '未命名';
    const cover = absUrl(ld.thumbnailUrl || metaContent(html, 'og:image') || fv.preview_url || '');
    const desc = stripTags(ld.description || metaContent(html, 'og:description') || '');

    const durSec = parseInt(metaContent(html, 'video:duration') || '0', 10) || 0;
    const duration =
        isoDurationToText(ld.duration) ||
        (durSec > 0 ? cleanDuration(String(durSec)) : '') ||
        cleanDuration($('.count-item').first().text());

    const release = String(metaContent(html, 'video:release_date') || ld.uploadDate || '');
    const date = release ? release.slice(0, 10) : '';

    const cleanList = (v) =>
        String(v || '')
            .split(/[,，]/)
            .map((x) => x.trim())
            .filter(Boolean);

    /* 详情区 .custom-item 是站点自己的字段表(代码/发行年份/制作商/演员/类别/标签),
       比 flashvars 更全,而且带链接文本 —— 优先吃这张表 */
    const fields = {};
    $('.custom-item').each((_, el) => {
        const txt = stripTags($(el).text());
        const m = txt.match(/^([^:：]{1,12})[:：]\s*(.*)$/);
        if (!m) return;
        fields[m[1].trim()] = m[2].trim();
    });
    const fget = (...keys) => {
        for (const k of keys) if (fields[k]) return fields[k];
        return '';
    };

    const maker =
        fget('制作商', '片商', 'Studio', 'Maker', 'Manufacturer') ||
        stripTags($('.custom-item a[href*="/makers/"]').first().text());
    const year = fget('发行年份', 'Release year', 'Year');

    const categories = fget('类别', 'Categories', 'Category') || cleanList(fv.video_categories).join(' / ');
    const tags = fget('标签', 'Tags') || cleanList(fv.video_tags).join(' / ');
    const models = fget('演员', 'Actor', 'Actress', 'Models') || cleanList(fv.video_models).join(' / ');
    const durationText = fget('时长', 'Duration') || duration;
    const code = fget('代码', 'Code');

    const id = (String(pageUrl).match(/\/video\/(\d+)\//) || [])[1] || String(fv.video_id || '');

    /* 清晰度 → 地址,只收实际存在的(老片常常没有 1080p) */
    const sources = collectSources(fv);

    /* 老片的 720p/1080p 不是直链,而是一个带 video_alt_url_redirect:1 的详情页地址,
       抓到它就能补出更高清晰度(embed 页尤其需要) */
    const redirectPages = [];
    for (const k of ['video_alt_url2', 'video_alt_url']) {
        const rd = fv[`${k}_redirect`];
        const v = fv[k];
        if (String(rd) === '1' && /^https?:\/\//i.test(String(v || ''))) {
            if (!isMediaUrl(v) && !redirectPages.includes(v)) redirectPages.push(v);
        }
    }

    /* 顺手抓一下截图(有些皮肤会用到) */
    const shots = [];
    $('a[rel="screenshots"]').each((_, el) => {
        const href = absUrl(String($(el).attr('href') || ''));
        if (href && shots.length < 12) shots.push(href);
    });

    return {
        id,
        title,
        cover,
        desc,
        date,
        duration: durationText,
        year,
        code,
        categories,
        tags,
        models,
        maker,
        sources,
        redirectPages,
        shots,
    };
}

/* 清晰度字段 → 可播地址
   注意:部分老片的 video_alt_url 不是媒体地址,而是一个「跳转到详情页」的页面地址
   (flashvars 里同时带 video_alt_url_redirect: 1),这种必须丢掉,
   否则播放器拿到一个 HTML 页面,必黑屏 */
function isMediaUrl(u) {
    const s = String(u || '').trim();
    if (!/^https?:\/\//i.test(s)) return false;
    const path = s.split('?')[0].toLowerCase();
    return /\/get_file\//.test(path) || /\.(mp4|m3u8|ts|webm)$/.test(path);
}

/* 同一部片、同一清晰度只留一条(embed 页和详情页签发的 token 不一样,
   不按路径去重会出现两条一样的 480p) */
function sourceKey(q, u) {
    const path = String(u || '').split('?')[0];
    return `${qualityScore(q)}|${path}`;
}

function collectSources(fv) {
    const out = [];
    const push = (q, u, redirect) => {
        if (redirect && String(redirect) === '1') return;
        if (!isMediaUrl(u)) return;
        const k = sourceKey(q, u);
        if (out.some((x) => sourceKey(x.q, x.u) === k)) return;
        out.push({ q: q || '', u });
    };
    push(fv.video_alt_url2_text, fv.video_alt_url2, fv.video_alt_url2_redirect);
    push(fv.video_alt_url_text, fv.video_alt_url, fv.video_alt_url_redirect);
    push(fv.video_url_text, fv.video_url, fv.video_url_redirect);
    return out;
}

/* 详情页拿不到片源时,用轻量 embed 页二次兜底(只 6~7KB) */
async function sourcesFromEmbed(id) {
    const url = `${cfg.base}${langPath(`/embed/${id}/`)}`;
    try {
        const html = await getText(url, `${cfg.base}/`);
        return collectSources(parseFlashvars(html));
    } catch {
        return [];
    }
}

/* --------------------------------------------------------------------------
 *  mp4 探活(range 小切片 + 跟随 302 + 文件头校验)
 * ------------------------------------------------------------------------ */
const _probeCache = new Map();
const PROBE_TTL = 5 * 60 * 1000;

function isMp4Head(buf) {
    if (!buf || buf.length < 12) return false;
    const tag = buf.slice(4, 8).toString('latin1');
    if (tag === 'ftyp' || tag === 'moov' || tag === 'mdat' || tag === 'free' || tag === 'skip') return true;
    /* 少数 m3u8 也可能被当成 mp4 返回 */
    if (/^#EXTM3U/.test(buf.slice(0, 8).toString('utf8'))) return true;
    return false;
}

async function probeMp4(url) {
    const key = url;
    const hit = _probeCache.get(key);
    if (hit && Date.now() - hit.at < PROBE_TTL) return hit.result;

    let result = { ok: false, url, needsProxy: false, reason: '' };
    try {
        const res = await httpRequest(url, {
            headers: { ...baseHeaders(`${cfg.base}/`), Range: 'bytes=0-2047', Accept: '*/*' },
            timeout: Math.min(cfg.timeout, 20000),
        });
        const ct = String(res.headers['content-type'] || '').toLowerCase();
        const head = isMp4Head(res.body);
        if ((res.status === 200 || res.status === 206) && res.body.length && (head || /video\/|octet-stream/.test(ct))) {
            /* 交回原始 get_file 地址,不交 302 落地地址:
               落地地址带一枚会过期的签名(长片看到一半 seek 就 403),
               而 get_file 每次请求都会重新签一枚,播放器跟一下 302 就行 */
            result = { ok: true, url, needsProxy: false, reason: '', final: res.url || url };
        } else {
            result = { ok: false, url, needsProxy: false, reason: `HTTP ${res.status} ${ct} ${res.body.length}B` };
        }
    } catch (e) {
        result = { ok: false, url, needsProxy: false, reason: String((e && e.message) || e) };
    }

    _probeCache.set(key, { at: Date.now(), result });
    if (_probeCache.size > 60) _probeCache.delete(_probeCache.keys().next().value);
    return result;
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

/* 边下边发 + 跟随 302(站点 mp4 全是 302 到 cloud.javsiri.cc) */
function pipeToClient(request, reply, target, referer, redirectsLeft) {
    return new Promise((resolve) => {
        let u;
        try {
            u = new URL(target);
        } catch {
            reply.code(400).send('bad target');
            return resolve();
        }
        const isHttps = u.protocol === 'https:';
        const lib = isHttps ? https : http;

        const headers = {
            'User-Agent': UA,
            Accept: '*/*',
            Referer: referer || `${cfg.base}/`,
        };
        const clientRange = request.headers && request.headers.range;
        if (clientRange) headers.Range = clientRange;
        if (cfg.cookie) headers.Cookie = cfg.cookie;

        const reqOpt = {
            protocol: u.protocol,
            hostname: u.hostname,
            port: u.port || (isHttps ? 443 : 80),
            path: `${u.pathname}${u.search}`,
            method: 'GET',
            headers,
            timeout: 30000,
        };

        const req = lib.request(reqOpt, (res) => {
            const status = res.statusCode || 200;
            const loc = res.headers.location;
            if (status >= 300 && status < 400 && loc && redirectsLeft > 0) {
                res.resume();
                let next;
                try {
                    next = new URL(loc, u).href;
                } catch {
                    reply.code(502).send('bad redirect');
                    return resolve();
                }
                resolve(pipeToClient(request, reply, next, referer, redirectsLeft - 1));
                return;
            }
            if (status >= 400) {
                res.resume();
                try {
                    reply.code(status).send(`upstream ${status}`);
                } catch {
                    /* ignore */
                }
                return resolve();
            }

            const ct = String(res.headers['content-type'] || 'video/mp4');
            reply.code(status);
            reply.header('Content-Type', ct);
            for (const h of ['content-length', 'accept-ranges', 'content-range', 'last-modified', 'etag']) {
                if (res.headers[h]) reply.header(h, res.headers[h]);
            }
            reply.header('Access-Control-Allow-Origin', '*');

            reply.send(res);
            res.on('end', resolve);
            res.on('error', () => resolve());
        });
        req.on('timeout', () => {
            req.destroy(new Error('upstream timeout'));
        });
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

    /* m3u8(本站目前没有,但不排除哪天换源):拉全量 → 重写成本地中转地址 */
    if (/\.m3u8(\?|$)/i.test(target)) {
        try {
            const res = await httpRequest(target, {
                headers: { ...baseHeaders(referer || `${cfg.base}/`), Accept: '*/*' },
                timeout: Math.min(cfg.timeout, 20000),
            });
            if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
            const text = res.body.toString('utf8');
            if (!/^#EXTM3U/.test(text.trim())) throw new Error('not playlist');
            const base = selfBase(request);
            reply.header('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
            reply.header('Access-Control-Allow-Origin', '*');
            reply.header('Cache-Control', 'no-cache');
            reply.send(rewriteM3u8(text, res.url || target, base, referer || `${cfg.base}/`));
        } catch (e) {
            reply.code(502).send(`playlist error: ${String((e && e.message) || e)}`);
        }
        return;
    }

    await pipeToClient(request, reply, target, referer, 5);
}

/* --------------------------------------------------------------------------
 *  路由
 * ------------------------------------------------------------------------ */
async function init(inReq) {
    applyExt((inReq && inReq.body && inReq.body.ext) || {});
    return {
        base: cfg.base,
        lang: cfg.lang,
        cookie: cfg.cookie ? '已配置' : '未配置',
        proxy: cfg.proxy ? '已配置' : '直连',
        streamProxy: cfg.streamProxy,
    };
}

async function home(inReq) {
    applyExt((inReq && inReq.body && inReq.body.ext) || {});
    let nav = { cats: [], tags: [], models: [], makers: [] };
    let notice = '';
    try {
        nav = await fetchNav();
    } catch (e) {
        notice = String((e && e.message) || e);
    }

    const classList = [
        { type_id: langPath('/latest-updates/'), type_name: '🆕 最新更新' },
        { type_id: langPath('/most-popular/'), type_name: '🔥 最多播放' },
        { type_id: langPath('/top-rated/'), type_name: '⭐ 最高评分' },
        ...nav.cats,
        ...nav.tags,
        ...nav.models,
        ...nav.makers,
    ];

    if (classList.length <= 3) classList.push(...FALLBACK_CLASS);

    return { class: classList, filters: {}, notice };
}

/* type_id → 列表页地址(路径式翻页:/zh/tags/x/ 第2页 → /zh/tags/x/2/) */
function buildListUrl(tid, page) {
    let p = String(tid ?? '').trim();
    if (/^https?:\/\//i.test(p)) {
        try {
            p = new URL(p).pathname;
        } catch {
            p = '';
        }
    }
    p = p.split('?')[0];
    if (!p || p === '/' || p === `/${cfg.lang}` || p === `/${cfg.lang}/`) p = '/latest-updates/';
    if (!p.startsWith('/')) p = `/${p}`;
    if (!p.startsWith(`/${cfg.lang}/`)) p = `/${cfg.lang}${p}`;
    if (!p.endsWith('/')) p = `${p}/`;
    /* 去掉已有的页码段,统一按 page 重新拼 */
    p = p.replace(/\/\d+\/$/, '/');

    const n = parseInt(page, 10) || 1;
    const path = n > 1 ? `${p}${n}/` : p;
    return `${cfg.base}${path}`;
}

async function category(inReq) {
    const body = (inReq && inReq.body) || {};
    applyExt(body.ext || {});
    const page = parseInt(body.page ?? body.pg ?? 1, 10) || 1;
    const tidRaw = body.id ?? body.tid ?? body.type_id ?? '';
    const url = buildListUrl(tidRaw, page);

    /* 翻过最后一页站点直接回 404,不能让它变成接口报错 */
    let html = '';
    try {
        html = await getText(url, `${cfg.base}/`);
    } catch {
        return { page, pagecount: 1, limit: 0, total: 0, list: [] };
    }

    const { list } = parseListPage(html);
    const pagecount = parsePageCount(html, list.length || 45);

    if (isEmptyList(html) || !list.length) {
        return { page, pagecount: 1, limit: 0, total: 0, list: [] };
    }
    if (page > pagecount) return { page, pagecount, limit: 0, total: list.length, list: [] };

    return { page, pagecount, limit: list.length, total: list.length, list };
}

function lineUrl(src, pageUrl, q) {
    return `${q || '原画'}$${META.key}://${b64encode(JSON.stringify({ u: src, p: pageUrl, q: q || '' }))}`;
}

/* 统一入口:详情页 → (404/无片源)embed 页 → (老片)高清跳转页补线路 */
function qualityScore(q) {
    const m = String(q || '').match(/(\d{3,4})/);
    return m ? parseInt(m[1], 10) : 0;
}

function mergeSources(a, b) {
    const out = [];
    for (const s of [...a, ...b]) {
        if (!s || !s.u) continue;
        const k = sourceKey(s.q, s.u);
        if (out.some((x) => sourceKey(x.q, x.u) === k)) continue;
        out.push(s);
    }
    out.sort((x, y) => qualityScore(y.q) - qualityScore(x.q));
    return out;
}

async function loadDetail(pageUrl) {
    const idGuess = (String(pageUrl).match(/\/(?:video|embed)\/(\d+)/) || [])[1] || '';
    let url = pageUrl;
    let html = '';
    try {
        html = await getText(url, `${cfg.base}/`);
    } catch {
        if (!idGuess) return null;
        url = `${cfg.base}${langPath(`/embed/${idGuess}/`)}`;
        try {
            html = await getText(url, `${cfg.base}/`);
        } catch {
            return null;
        }
    }

    const d = parseDetail(html, url);
    if (!d.sources.length) {
        const alt = await sourcesFromEmbed(d.id || idGuess);
        if (alt.length) d.sources = alt;
    }

    /* 老片:embed/详情页只给 480p,720p 藏在一个跳转页里 → 补抓一次 */
    if (d.sources.length < 2 && d.redirectPages && d.redirectPages.length) {
        for (const p of d.redirectPages.slice(0, 2)) {
            try {
                const h2 = await getText(p, `${cfg.base}/`);
                const d2 = parseDetail(h2, p);
                d.sources = mergeSources(d.sources, d2.sources);
                if (d.sources.length >= 2) break;
            } catch {
                /* ignore */
            }
        }
    }
    d.sources = mergeSources(d.sources, []);
    d.resolvedUrl = url;
    return d;
}

async function detail(inReq) {
    const body = (inReq && inReq.body) || {};
    applyExt(body.ext || {});
    const raw = String(body.id || body.ids || body.url || '').trim().replace(/\$\$\$.*$/, '');
    if (!raw) return { list: [] };

    let url = raw;
    if (!/^https?:\/\//i.test(url)) {
        if (/^\d+$/.test(url)) url = `${cfg.base}${langPath(`/video/${url}/`)}`;
        else url = absUrl(url);
    }

    let d = null;
    try {
        d = await loadDetail(url);
    } catch {
        d = null;
    }
    if (!d) return { list: [] };
    if (!d.id && !d.sources.length && !d.cover) return { list: [] };

    const lines = [];
    if (d.title) lines.push(d.title);
    if (d.code) lines.push(`番号:${d.code}`);
    if (d.desc && d.desc !== d.title) lines.push(d.desc);
    if (d.categories) lines.push(`分类:${d.categories}`);
    if (d.tags) lines.push(`标签:${d.tags}`);
    if (d.models) lines.push(`女优:${d.models}`);
    if (d.maker) lines.push(`片商:${d.maker}`);
    if (d.date) lines.push(`发布:${d.date}`);
    if (d.duration) lines.push(`时长:${d.duration}`);
    if (d.shots.length) lines.push(`截图:${d.shots.length} 张`);
    lines.push(`来源:${url}`);

    const eps = d.sources.map((s) => lineUrl(s.u, url, s.q));
    const best = d.sources[0];

    return {
        list: [
            {
                vod_id: d.resolvedUrl || url,
                vod_name: d.title,
                vod_pic: d.cover,
                vod_content: lines.join('\n'),
                vod_remarks: best ? best.q : '暂无片源',
                vod_year: d.year || (d.date || '').slice(0, 4),
                vod_area: '',
                vod_actor: d.models || '',
                vod_director: d.maker || '',
                type_name: d.categories || d.tags || '',
                vod_play_from: eps.length ? META.key : '',
                vod_play_url: eps.join('#'),
            },
        ],
    };
}

async function linesOfPage(pageUrl) {
    const d = await loadDetail(pageUrl);
    if (!d) return [];
    return d.sources.map((s) => ({ u: s.u, q: s.q, p: pageUrl }));
}

/* 按清晰度从高到低试:能直连就给直连,探活失败/强制中转就给本地中转 */
async function playFromCandidates(inReq, candidates) {
    const ref = `${cfg.base}/`;
    let lastTarget = '';
    let lastPage = '';

    for (const c of candidates) {
        const target = String(c.u || '').trim();
        if (!/^https?:\/\//i.test(target)) continue;
        lastTarget = target;
        lastPage = c.p || '';

        if (cfg.streamProxy) {
            return { parse: 0, url: proxyUrl(selfBaseFromReq(inReq), target, lastPage || ref), header: { 'User-Agent': UA } };
        }

        const probed = await probeMp4(target);
        if (probed.ok) {
            return { parse: 0, url: probed.url, header: { 'User-Agent': UA } };
        }
    }

    /* 全都不通:赌一次中转(探活可能只是瞬时抖动) */
    if (lastTarget) {
        return {
            parse: 0,
            url: proxyUrl(selfBaseFromReq(inReq), lastTarget, lastPage || ref),
            header: { 'User-Agent': UA },
        };
    }
    return null;
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
            payload = raw.trim().startsWith('{') ? JSON.parse(raw) : { u: raw };
        } catch {
            payload = null;
        }
    }

    /* 1) 插件自己发的线路标记 */
    if (payload && payload.u) {
        const r = await playFromCandidates(inReq, [{ u: payload.u, q: payload.q || '', p: payload.p || '' }]);
        if (r) return r;

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
        return {
            parse: 0,
            url: proxyUrl(selfBaseFromReq(inReq), payload.u, payload.p || `${cfg.base}/`),
            header: { 'User-Agent': UA },
        };
    }

    /* 2) 客户端直接丢了详情页地址或视频 id */
    if (/javsiri\.(cc|com)\/(?:[a-z]{2}\/)?(?:video|embed)\//i.test(id) || /^\d+$/.test(id)) {
        const pageUrl = /^\d+$/.test(id) ? `${cfg.base}${langPath(`/video/${id}/`)}` : absUrl(id);
        let all = [];
        try {
            all = await linesOfPage(pageUrl);
        } catch {
            all = [];
        }
        if (!all.length) return { parse: 0, url: '' };
        const r = await playFromCandidates(inReq, all);
        if (r) return r;
        return { parse: 0, url: '' };
    }

    /* 3) 手贴的媒体地址 */
    return { parse: 0, url: absUrl(id), header: { 'User-Agent': UA } };
}

/* 中文关键词搜不到时,拿标签中文名 / 女优名 / 片商名反查列表页 */
async function searchByNav(wd) {
    let nav;
    try {
        nav = await fetchNav();
    } catch {
        return null;
    }
    const k = wd.toLowerCase();
    const hit =
        nav.tags.find((t) => t.type_name.toLowerCase().includes(k)) ||
        nav.models.find((m) => m.type_name.toLowerCase().includes(k)) ||
        nav.makers.find((m) => m.type_name.toLowerCase().includes(k)) ||
        nav.cats.find((c) => c.type_name.toLowerCase().includes(k));
    return hit ? hit.type_id : '';
}

async function search(inReq) {
    const body = (inReq && inReq.body) || {};
    applyExt(body.ext || {});
    const wd = String(body.wd || body.key || body.keyword || '').trim();
    if (!wd) return { list: [] };

    const url = `${cfg.base}${langPath(`/search/${encodeURIComponent(wd)}/`)}`;
    let html = '';
    try {
        html = await getText(url, `${cfg.base}/`);
    } catch {
        html = '';
    }
    let { list } = html ? parseListPage(html) : { list: [] };

    /* 站点搜索只吃拉丁词,中文关键词走标签/女优/片商反查 */
    if (!list.length) {
        const tid = await searchByNav(wd);
        if (tid) {
            try {
                const h2 = await getText(buildListUrl(tid, 1), `${cfg.base}/`);
                list = parseListPage(h2).list;
            } catch {
                /* ignore */
            }
        }
    }

    return { list, page: 1, total: list.length };
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
