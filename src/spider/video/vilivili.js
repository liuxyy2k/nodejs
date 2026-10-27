/* ==========================================================================
 *  VIDLILI  ·  https://vidlili.com
 *  WordPress 视频站采集插件(蜘蛛模块 / type:3)
 *  ---------------------------------------------------------------------------
 *  【站点结构】
 *   分类页   https://vidlili.com/kc            (第 N 页: /kc/page/2,不带斜杠)
 *            一级: /kc 限时快餐 /gc 国产影片 /rh 日韩AV /om 欧美激情
 *                  /hm 成人动漫 /ku 历史库 /km KMAV库 /hxc HXCAV库
 *                  /atv ATVAV库 /10mav 十分钟AV /xvideos /vip
 *            二级: /gc/{cm,jp,zp,hl,91porn} /rh/{zz,ym,wm,sj} /hm/{dm,3d,cos}
 *   搜索     https://vidlili.com/?s=关键词       (第 N 页: /page/2?s=关键词)
 *   详情     https://vidlili.com/video/<slug>.html
 *   片源     详情页正文里只有一层 iframe,真正地址藏在 iframe 的 url 参数里:
 *
 *      ① /videojs.php?url=<直链 m3u8>                 → 直接可用
 *      ② /kb.php?url=https://mplay.8dy.one/url-<m3u8> → mplay 代理壳,再剥一层
 *      ③ /m3u8.php?url=https://daili.vidlili.com/?url=<m3u8|mp4>
 *                                                     → daili 代理壳,再剥一层
 *
 *    这些 CDN(v155p.com / gg155gg1.com / aaportal.com / video.twimg.com)实测
 *    不需要 Referer 也不需要 Cookie,分片可直接拉取,所以默认返回真实地址;
 *    只有当真实地址探活失败时,才回落到站点自带的代理壳地址。
 *  ---------------------------------------------------------------------------
 *  【配置(全部可选,填在 ext 里)】
 *    base        string  镜像域名,默认 https://vidlili.com
 *    cookie      string  站点被 Cloudflare 拦住时,把浏览器 Cookie 贴进来
 *    proxy       string  本插件自己出网用的代理,如 http://127.0.0.1:7897
 *    streamProxy boolean 设为 true 时,/play 强制走本地 /proxy/stream 中转
 *                        (只有在播放器不认 CDN 时才需要,常规别开,省带宽)
 *    timeout     number  出网超时毫秒,默认 15000
 *  ---------------------------------------------------------------------------
 *  接口:POST /init /home /category /detail /play /search + GET /proxy/stream
 * ========================================================================== */

import { load } from 'cheerio';
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';

const META = { key: 'vidlili', name: '🍭VIDLILI', type: 3 };

const DEFAULT_BASE = 'https://vidlili.com';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/* 兜底分类(首页导航改版时也不至于空着) */
const FALLBACK_CLASS = [
    { type_id: '/kc', type_name: '限时快餐' },
    { type_id: '/gc', type_name: '国产影片' },
    { type_id: '/gc/cm', type_name: '传媒映画' },
    { type_id: '/gc/jp', type_name: '国产精品' },
    { type_id: '/gc/zp', type_name: '网友自拍' },
    { type_id: '/gc/hl', type_name: 'AI换脸' },
    { type_id: '/gc/91porn', type_name: '91porn' },
    { type_id: '/rh', type_name: '日韩AV' },
    { type_id: '/rh/zz', type_name: '中文字幕' },
    { type_id: '/rh/ym', type_name: '日韩有码' },
    { type_id: '/rh/wm', type_name: '日韩无码' },
    { type_id: '/rh/sj', type_name: '素人剧情' },
    { type_id: '/om', type_name: '欧美激情' },
    { type_id: '/xvideos', type_name: 'Xvideos' },
    { type_id: '/hm', type_name: '成人动漫' },
    { type_id: '/hm/dm', type_name: 'H动漫' },
    { type_id: '/hm/3d', type_name: '3D' },
    { type_id: '/hm/cos', type_name: 'Cosplay' },
    { type_id: '/km', type_name: 'KMAV库' },
    { type_id: '/atv', type_name: 'ATVAV库' },
    { type_id: '/hxc', type_name: 'HXCAV库' },
    { type_id: '/10mav', type_name: '十分钟AV' },
    { type_id: '/ku', type_name: '历史库' },
];

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
 *  出网(零外部依赖:gzip/br 自动解压 + 跟随跳转 + 可选代理)
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
        // 没装代理组件时静默降级为直连
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
        const req = lib.request(
            {
                protocol: u.protocol,
                hostname: u.hostname,
                port: u.port || (isHttps ? 443 : 80),
                path: `${u.pathname}${u.search}`,
                method: opt.method || 'GET',
                headers,
                agent,
                timeout: opt.timeout || cfg.timeout,
            },
            (res) => {
                const status = res.statusCode || 0;
                const loc = res.headers.location;
                if (status >= 300 && status < 400 && loc && (opt.redirect || 0) < 5) {
                    res.resume();
                    const next = new URL(loc, u).href;
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
                stream.on('end', () =>
                    resolve({ status, headers: res.headers, body: Buffer.concat(chunks), url: u.href }),
                );
                stream.on('error', reject);
                res.on('aborted', () => reject(new Error('连接被中断')));
            },
        );
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('请求超时')));
        if (opt.body) req.write(opt.body);
        req.end();
    });
}

async function httpRequest(url, opt = {}) {
    const agent = await getAgent();
    return requestOnce(url, opt, agent);
}

function baseHeaders(referer) {
    const h = { Referer: referer || `${cfg.base}/` };
    if (cfg.cookie) h.Cookie = cfg.cookie;
    return h;
}

async function getText(url, referer) {
    const res = await httpRequest(url, {
        headers: {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            ...baseHeaders(referer),
        },
        timeout: cfg.timeout,
    });
    const text = res.body.toString('utf8');
    const head = text.slice(0, 3000);
    if (res.status === 403 || /Just a moment|cf-browser-verification|Attention Required|Enable JavaScript and cookies/i.test(head)) {
        throw new Error(`站点 ${res.status} · 被 Cloudflare 校验拦住,可在 ext.cookie 里填浏览器 Cookie 后重试`);
    }
    if (res.status >= 400) throw new Error(`请求失败 HTTP ${res.status}: ${url}`);
    return text;
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
        .replace(/&#0?39;/g, "'");
}

function decodeMaybe(s) {
    let v = String(s || '').trim();
    for (let i = 0; i < 2; i++) {
        if (!/%[0-9a-f]{2}/i.test(v)) break;
        try {
            const d = decodeURIComponent(v);
            if (d === v) break;
            v = d;
        } catch {
            break;
        }
    }
    return v;
}

function stripTags(s) {
    return String(s || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/* --------------------------------------------------------------------------
 *  列表解析
 * ------------------------------------------------------------------------ */
function pickPic($el) {
    const $img = $el.find('img').first();
    if (!$img.length) return '';
    for (const attr of ['data-src', 'data-lazy-src', 'data-original', 'src', 'data-srcset']) {
        const v = String($img.attr(attr) || '').trim();
        const first = attr === 'data-srcset' ? v.split(/\s+/)[0] : v;
        if (/^https?:\/\//i.test(first)) return first;
    }
    return '';
}

function parseCards(html) {
    const $ = load(html);
    const list = [];
    const seen = new Set();

    $('article').each((_, el) => {
        const $el = $(el);
        const $a = $el.find('.entry-title a').first();
        let href = String($a.attr('href') || '').trim();
        if (!href) href = String($el.find('.thumbnail-wrap a').first().attr('href') || '').trim();
        if (!href || !/\/video\//.test(href)) return;

        href = absUrl(href);
        if (seen.has(href)) return;
        seen.add(href);

        const titleAttr = String($a.attr('title') || '').trim();
        const textTitle = stripTags($a.html() || $a.text());
        const durMatch = `${titleAttr}`.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s*[…\.\s]*$/);
        const duration = durMatch ? durMatch[1] : '';
        let name = textTitle || htmlDecode(titleAttr);
        if (!textTitle && duration) name = name.replace(duration, '').trim();

        list.push({
            vod_id: href,
            vod_name: name || '未命名',
            vod_pic: pickPic($el),
            vod_remarks: duration,
            type_name: stripTags($el.find('.entry-category a').first().text()),
            vod_year: '',
            vod_area: '',
            vod_content: '',
        });
    });

    return list;
}

function parsePageCount($) {
    let max = 1;
    $('.nav-links .page-numbers, .pagination .page-numbers').each((_, el) => {
        const t = stripTags($(el).text());
        const n = parseInt(t.replace(/[^\d]/g, ''), 10);
        if (Number.isFinite(n) && n > max) max = n;
        const href = String($(el).attr('href') || '');
        const m = href.match(/\/page\/(\d+)/);
        if (m) {
            const v = parseInt(m[1], 10);
            if (v > max) max = v;
        }
    });
    return max;
}

function parseNav(html) {
    const $ = load(html);
    const out = [];
    const seen = new Set();
    $('nav a[href]').each((_, el) => {
        const href = String($(el).attr('href') || '').trim();
        const name = stripTags($(el).text());
        if (!href || !name) return;
        if (!href.startsWith(cfg.base)) return;
        if (/\/video\/|\/page\/|cdn-cgi|sitemap|\.php|#|\/wp-|home-page-v1/i.test(href)) return;
        const path = href.slice(cfg.base.length) || '/';
        if (path === '/' || path === '') return;
        if (seen.has(path)) return;
        seen.add(path);
        out.push({ type_id: path, type_name: name });
    });
    return out;
}

/* --------------------------------------------------------------------------
 *  详情页解析
 * ------------------------------------------------------------------------ */
function pickIframes($) {
    const list = [];
    $('.entry-content iframe[src], article iframe[src]').each((_, el) => {
        const src = String($(el).attr('src') || '').trim();
        if (!src) return;
        if (/tsyndicate|doubleclick|googlesyndication|adservice|adsystem|popads/i.test(src)) return;
        const full = absUrl(src);
        if (!list.includes(full)) list.push(full);
    });
    return list;
}

function posterOf(iframeUrl) {
    const m = String(iframeUrl || '').match(/[?&]poster=([^&]+)/i);
    return m ? decodeMaybe(htmlDecode(m[1])) : '';
}

function parseDetail(html, pageUrl) {
    const $ = load(html);
    const iframes = pickIframes($);
    const iframe = iframes[0] || '';

    const title =
        stripTags($('h1.entry-title').first().text()) ||
        stripTags($('meta[property="og:title"]').attr('content') || '') ||
        stripTags($('title').first().text());

    const category = stripTags($('.cat-links a').first().text() || $('.entry-category a').first().text());
    const date = String($('time.entry-date').attr('datetime') || '').trim();
    const views = stripTags($('.views-count').first().text());
    const tags = [];
    $('.entry-tags a, .tag-links a').each((_, el) => {
        const t = stripTags($(el).text());
        if (t && !tags.includes(t)) tags.push(t);
    });

    const paras = [];
    $('.entry-content p').each((_, el) => {
        const t = stripTags($(el).text());
        if (!t || t.length < 2) return;
        if (/^(标签|分类|发布|来源|简介)[:：]?$/.test(t)) return;
        if (paras.includes(t)) return;
        paras.push(t);
    });

    let cover = posterOf(iframe);
    if (!cover) {
        $('.entry-content img').each((_, el) => {
            if (cover) return;
            const v = String($(el).attr('src') || $(el).attr('data-src') || '').trim();
            if (/^https?:\/\//i.test(v)) cover = v;
        });
    }
    if (!cover) cover = String($('meta[property="og:image"]').attr('content') || '').trim();

    const desc = paras.filter((t) => !/^来源[:：]/.test(t) && t !== title).slice(0, 4);

    return { title, category, date, views, tags, desc, cover, iframe, iframes, pageUrl };
}

/* --------------------------------------------------------------------------
 *  片源解析:把 iframe 一层层剥到真实地址
 * ------------------------------------------------------------------------ */
function innerUrlOf(u) {
    const s = String(u || '').trim();
    if (!s) return '';

    // mplay.8dy.one/url-<inner>
    let m = s.match(/^https?:\/\/[^/]+\/url-(.+)$/i);
    if (m) return decodeMaybe(htmlDecode(m[1]));

    // 各类 *.php?url=<inner> 与 ?url=<inner>
    m = s.match(/[?&]url=([^&#]+)/i);
    if (m) return decodeMaybe(htmlDecode(m[1]));

    return '';
}

function mediaCandidates(iframeUrl) {
    const chain = [];
    let cur = htmlDecode(String(iframeUrl || '').trim());
    for (let i = 0; i < 6 && cur; i++) {
        if (chain.includes(cur)) break;
        chain.push(cur);
        const next = innerUrlOf(cur);
        if (!next || next === cur) break;
        cur = next;
    }

    const deepFirst = chain.slice().reverse();
    const media = deepFirst.filter((u) => /\.(m3u8|mp4)(\?|$)/i.test(u));
    const others = deepFirst.filter(
        (u) =>
            !media.includes(u) &&
            /^https?:\/\//i.test(u) &&
            !/^https?:\/\/(www\.)?vidlili\.com\//i.test(u) &&
            !/\.php(\?|$)/i.test(u),
    );
    const out = [];
    for (const u of [...media, ...others]) if (u && !out.includes(u)) out.push(u);
    return out;
}

async function probe(url, headers) {
    try {
        const res = await httpRequest(url, {
            headers: { ...headers, Range: 'bytes=0-1023' },
            timeout: Math.min(cfg.timeout, 8000),
        });
        if (res.status === 200 || res.status === 206) return true;
        return false;
    } catch {
        return false;
    }
}

function isWrapperUrl(u) {
    // 站点自带的转发壳:mplay / daili / 各类 .php 之外,路径里带 url- 前缀的也算
    return /\/url-|daili\.vidlili\.com|\/m3u8\.php|\/kb\.php|\/videojs\.php/i.test(String(u || ''));
}

async function resolvePlay(iframeUrl) {
    const cands = mediaCandidates(iframeUrl);
    if (!cands.length) return '';
    const headers = { 'User-Agent': UA, ...baseHeaders(`${cfg.base}/`) };

    const direct = cands.filter((u) => !isWrapperUrl(u));
    const wrappers = cands.filter((u) => isWrapperUrl(u));

    // 1) 真实 CDN 地址优先(少一跳,不占站点转发带宽)
    for (const u of direct) {
        if (await probe(u, headers)) return u;
    }
    // 2) 真实地址不通(常见于某些 CDN 只对特定线路开放)→ 用站点自己的转发壳,
    //    这和站内播放器走的是同一条路,兼容性最好
    for (const u of wrappers) {
        if (await probe(u, headers)) return u;
    }
    // 3) 全都探不通(片源已失效 / 本地网络到不了)→ 有壳给壳,没壳给真实地址
    return wrappers[0] || direct[0] || cands[0] || '';
}

/* --------------------------------------------------------------------------
 *  中转(仅在 ext.streamProxy=true 或播放器不认直链时用到)
 * ------------------------------------------------------------------------ */
function selfBase(request) {
    const proto = String(request.headers['x-forwarded-proto'] || 'https');
    const host = String(request.headers['x-forwarded-host'] || request.headers.host || '');
    const raw = String((request.raw && request.raw.url) || request.url || '/proxy/stream');
    const prefix = raw.split('/proxy/stream')[0];
    return `${proto}://${host}${prefix}`;
}

function proxyUrl(base, target, referer) {
    return `${base}/proxy/stream?u=${encodeURIComponent(target)}&ref=${encodeURIComponent(referer || `${cfg.base}/`)}`;
}

function rewriteM3u8(raw, playlistUrl, base, referer) {
    const toAbs = (s) => {
        try {
            return new URL(s, playlistUrl).href;
        } catch {
            return s;
        }
    };
    return String(raw)
        .split(/\r?\n/)
        .map((line) => {
            const t = line.trim();
            if (!t) return line;
            if (t.startsWith('#')) {
                // EXT-X-KEY / EXT-X-MAP / EXT-X-MEDIA 里的 URI
                return t.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${proxyUrl(base, toAbs(uri), referer)}"`);
            }
            if (/^https?:\/\//i.test(t) || /\.(ts|m3u8|mp4|aac|key)(\?|$)/i.test(t)) {
                return proxyUrl(base, toAbs(t), referer);
            }
            return line;
        })
        .join('\n');
}

async function streamProxy(request, reply) {
    const q = request.query || {};
    const target = decodeMaybe(q.u || '');
    if (!target || !/^https?:\/\//i.test(target)) {
        reply.code(400).send('missing u');
        return;
    }
    const referer = decodeMaybe(q.ref || '') || `${cfg.base}/`;
    const headers = { 'User-Agent': UA, Referer: referer, Accept: '*/*' };
    if (cfg.cookie) headers.Cookie = cfg.cookie;
    const range = request.headers && request.headers.range;
    if (range) headers.Range = range;

    const lib = target.startsWith('https://') ? https : http;
    await new Promise((resolve) => {
        const req = lib.request(target, { method: 'GET', headers, timeout: 30000 }, (res) => {
            const ct = String(res.headers['content-type'] || '');
            const isM3u8 = /mpegurl/i.test(ct) || /\.m3u8(\?|$)/i.test(target);
            if (isM3u8) {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    const text = Buffer.concat(chunks).toString('utf8');
                    reply.header('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
                    reply.header('Access-Control-Allow-Origin', '*');
                    reply.header('Cache-Control', 'no-cache');
                    reply.send(rewriteM3u8(text, target, selfBase(request), referer));
                    resolve();
                });
                res.on('error', () => {
                    reply.code(502).send('upstream error');
                    resolve();
                });
                return;
            }
            reply.code(res.statusCode || 200);
            for (const h of ['content-type', 'content-length', 'accept-ranges', 'content-range', 'last-modified', 'etag']) {
                if (res.headers[h]) reply.header(h, res.headers[h]);
            }
            reply.header('Access-Control-Allow-Origin', '*');
            reply.send(res);
            resolve();
        });
        req.on('timeout', () => req.destroy(new Error('upstream timeout')));
        req.on('error', (e) => {
            reply.code(502).send(String((e && e.message) || e));
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
    let classList = [];
    let notice = '';
    try {
        classList = parseNav(await getText(`${cfg.base}/`));
    } catch (e) {
        notice = String((e && e.message) || e);
    }
    if (!classList.length) classList = FALLBACK_CLASS.filter((c) => c.type_id !== '/').map((c) => ({ ...c }));

    return { class: classList, filters: {}, notice };
}

function buildListUrl(tid, page) {
    let p = String(tid || '/').trim();
    if (/^https?:\/\//i.test(p)) {
        try {
            const u = new URL(p);
            p = u.pathname + (u.search || '');
        } catch {
            p = '/';
        }
    }
    if (!p.startsWith('/')) p = `/${p}`;
    const [pathPart, queryPart] = p.split('?');
    const cleanPath = pathPart.replace(/\/page\/\d+\/?$/i, '').replace(/\/+$/, '');
    const n = parseInt(page, 10) || 1;
    let url = `${cfg.base}${cleanPath}`;
    if (!url || url === cfg.base) url = `${cfg.base}/`;
    if (n > 1) url = `${cfg.base}${cleanPath}/page/${n}`;
    if (queryPart) url += `${url.includes('?') ? '&' : '?'}${queryPart}`;
    return url;
}

async function category(inReq) {
    const body = (inReq && inReq.body) || {};
    applyExt(body.ext || {});
    const page = parseInt(body.page ?? body.pg ?? 1, 10) || 1;
    const tid = body.id ?? body.tid ?? body.type_id ?? '/kc';
    // 站点首页是「各分区聚合展示」且不翻页(第 2 页和第 1 页一模一样),
    // 所以根路径统一映射到 /kc(限时快餐 = 最新更新),避免整个列表重复
    const realTid = tid === '/' || tid === '' || tid === null ? '/kc' : tid;
    const url = buildListUrl(realTid, page);

    const html = await getText(url);
    const $ = load(html);
    const list = parseCards(html);
    const pagecount = parsePageCount($);
    return {
        page,
        pagecount,
        limit: list.length,
        total: pagecount > 1 ? pagecount * (list.length || 1) : list.length,
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
        if (/^\d+$/.test(url)) url = `${cfg.base}/?p=${url}`;
        else url = absUrl(url);
    }

    const html = await getText(url);
    const d = parseDetail(html, url);

    const lines = [];
    if (d.desc.length) lines.push(d.desc.join('\n'));
    if (d.category) lines.push(`分类:${d.category}`);
    if (d.tags.length) lines.push(`标签:${d.tags.join('、')}`);
    if (d.date) lines.push(`发布:${d.date.replace('T', ' ').slice(0, 16)}`);
    if (d.views && d.views !== '0') lines.push(`观看:${d.views}`);
    lines.push(`来源:${url}`);

    const playUrl = d.iframe ? `线路1$vl://${Buffer.from(d.iframe, 'utf8').toString('base64url')}` : '';

    return {
        list: [
            {
                vod_id: url,
                vod_name: d.title || '未命名',
                vod_pic: d.cover,
                vod_content: lines.join('\n'),
                vod_remarks: playUrl ? '可播放' : '暂无片源',
                vod_year: (d.date || '').slice(0, 4),
                vod_area: '',
                vod_actor: '',
                vod_director: '',
                type_name: d.category,
                vod_play_from: playUrl ? META.key : '',
                vod_play_url: playUrl,
            },
        ],
    };
}

async function play(inReq) {
    const body = (inReq && inReq.body) || {};
    applyExt(body.ext || {});
    let id = String(body.id || body.url || body.play || '').trim();
    if (id.includes('$')) id = id.split('$').pop().trim();
    if (!id) return { parse: 0, url: '' };

    const headers = { 'User-Agent': UA, ...baseHeaders(`${cfg.base}/`) };
    let iframe = '';

    if (id.startsWith('vl://')) {
        try {
            iframe = Buffer.from(id.slice(5), 'base64url').toString('utf8');
        } catch {
            iframe = '';
        }
    } else if (/\/video\//.test(id) || /^\d+$/.test(id)) {
        // 客户端直接把详情页地址丢过来:现抓一次
        const pageUrl = /^https?:\/\//i.test(id)
            ? id
            : /^\d+$/.test(id)
              ? `${cfg.base}/?p=${id}`
              : absUrl(id);
        try {
            const html = await getText(pageUrl);
            const d = parseDetail(html, pageUrl);
            iframe = d.iframe;
        } catch {
            iframe = '';
        }
    }

    if (iframe) {
        const target = await resolvePlay(iframe);
        if (target) {
            if (cfg.streamProxy) {
                return {
                    parse: 0,
                    url: proxyUrl(selfBaseFromReq(inReq), target, `${cfg.base}/`),
                    header: { 'User-Agent': UA },
                };
            }
            return { parse: 0, url: target, header: headers };
        }
        return { parse: 0, url: iframe, header: headers };
    }

    const direct = absUrl(id);
    return { parse: 0, url: direct, header: headers };
}

/* play() 走中转时,用当前请求的 host 拼出 /proxy/stream 的完整地址 */
function selfBaseFromReq(req) {
    if (cfg.proxyBase) return cfg.proxyBase.replace(/\/+$/, '');
    try {
        const headers = (req && req.headers) || {};
        const proto = String(headers['x-forwarded-proto'] || 'https');
        const host = String(headers['x-forwarded-host'] || headers.host || '');
        if (!host) return cfg.base;
        return `${proto}://${host}`;
    } catch {
        return cfg.base;
    }
}

async function search(inReq) {
    const body = (inReq && inReq.body) || {};
    applyExt(body.ext || {});
    const wd = String(body.wd || body.key || body.keyword || '').trim();
    if (!wd) return { list: [] };
    const page = parseInt(body.page ?? body.pg ?? 1, 10) || 1;
    const q = encodeURIComponent(wd);
    const url = page > 1 ? `${cfg.base}/page/${page}?s=${q}` : `${cfg.base}/?s=${q}`;
    const html = await getText(url, `${cfg.base}/`);
    return { list: parseCards(html) };
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
