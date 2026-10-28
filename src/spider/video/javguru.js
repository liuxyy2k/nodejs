/* ==========================================================================
 *  JAV.GURU  ·  https://jav.guru
 *  视频站采集插件(蜘蛛模块 / type:3)
 *  ---------------------------------------------------------------------------
 *  【站点结构】WordPress
 *   首页      https://jav.guru/                  (第 N 页: /page/2/)
 *   归档页    https://jav.guru/category/jav/     (第 N 页: /category/jav/page/2/)
 *            一级: /category/jav/ /category/english-subbed/ /category/decensored/
 *                  /category/amateur/ /category/idol/ /category/4k/
 *            另有: /tag/<名>/ /actress/<名>/ /maker/<名>/ /studio/<名>/
 *                  /series/<名>/ /director/<名>/ 都是同一套卡片结构
 *   搜索      https://jav.guru/?s=关键词          (第 N 页: /page/2/?s=关键词)
 *   详情      https://jav.guru/<数字>/<slug>/
 *  ---------------------------------------------------------------------------
 *  【片源链路】三层,全部在插件里剥开:
 *
 *    详情页 .ssmenu 里每个 <a data-localize="xxx"> 就是一个线路按钮
 *        └─ var xxx = {..., "iframe_url": "<base64>"}
 *            └─ 解码得到 https://jav.guru/searcho/?<参数>      ← 网关页
 *                └─ window.cfg{cid,rtype,keys[]} + <div id=cid data-xxx="...">
 *                   token = 各 data-* 值按 keys 顺序拼接后整体反转
 *                   → https://jav.guru/searcho/?xr=<token>       ← 302
 *                       └─ 落地页(多家:javclan / lulustream / maxstream / voe / dood)
 *                          → Dean Edwards packer 打包的 jwplayer 配置
 *                          → 解包拿到 hls4 / hls3 / hls2 / file 直链
 *
 *    实测线路:SB(javclan) / LU(lulustream) / JK(maxstream) 可直出 m3u8,
 *    分片可直接拉取(不需要 Referer/Cookie)。VO(voe) / DD(doodstream) 两家
 *    播放器各自做了加密封装,插件会跳过并在播放时自动回落到可用线路。
 *
 *  【坑:分片伪装】SB/VO/DD 走 javclan → TikTok 广告 CDN,分片是
 *  "1x1 PNG 头 + 真正的 MPEG-TS",ffmpeg 内核的播放器会把它当图片,
 *  表现就是抓到流了但黑屏、或者只出一帧。插件会自动探测:
 *  发现分片带图片壳时,/play 直接返回本地 /proxy/stream 地址,
 *  中转里剥掉壳再发给播放器(Content-Type: video/mp2t,Range/206 完整支持)。
 *  真 TS 的线路(LU/JK)仍然给直链,不占中转带宽。
 *  ---------------------------------------------------------------------------
 *  【配置(全部可选,填在 ext 里)】
 *    base        string  镜像域名,默认 https://jav.guru
 *    cookie      string  被 Cloudflare 拦住时,把浏览器 Cookie 贴进来
 *    proxy       string  本插件自己出网用的代理,如 http://127.0.0.1:7897
 *    streamProxy boolean 设为 true 时,/play 强制走本地 /proxy/stream 中转
 *    proxyBase   string  中转对外地址(挂子路由时填,如 https://x.com/jg)
 *    lines       string  线路优先级,默认 'SB,LU,JK,VO,DD'
 *    timeout     number  出网超时毫秒,默认 15000
 *  ---------------------------------------------------------------------------
 *  接口:POST /init /home /category /detail /play /search + GET /proxy/stream
 * ========================================================================== */

import { load } from 'cheerio';
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';

const META = { key: 'javguru', name: '🌸JAV.GURU', type: 3 };

const DEFAULT_BASE = 'https://jav.guru';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/* 兜底分类(首页导航改版时也不至于空着) */
const FALLBACK_CLASS = [
    { type_id: '/category/jav/', type_name: 'JAV' },
    { type_id: '/category/english-subbed/', type_name: 'SUBS 英文字幕' },
    { type_id: '/category/decensored/', type_name: 'MR 无码流出' },
    { type_id: '/category/amateur/', type_name: 'AMATEUR 素人' },
    { type_id: '/category/idol/', type_name: 'IV 写真偶像' },
    { type_id: '/category/4k/', type_name: '4K' },
    { type_id: '/tag/creampie/', type_name: '中出' },
    { type_id: '/tag/big-tits/', type_name: '巨乳' },
    { type_id: '/tag/lesbian/', type_name: '百合' },
    { type_id: '/tag/cosplay/', type_name: 'Cosplay' },
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
    lines: 'SB,LU,JK,VO,DD',
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
    const ln = pick('lines', 'lineOrder');
    if (ln) cfg.lines = String(ln);
    const t = pick('timeout');
    if (t) {
        const n = parseInt(t, 10);
        if (Number.isFinite(n) && n >= 1000) cfg.timeout = n;
    }
}

function lineOrder(preferred) {
    const all = String(cfg.lines || '')
        .split(/[,|\s]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    const order = [];
    const pref = String(preferred || '').toUpperCase();
    if (pref) order.push(pref);
    for (const n of all) if (!order.includes(n)) order.push(n);
    return order;
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
                let got = 0;
                let finished = false;
                const finish = () => {
                    if (finished) return;
                    finished = true;
                    resolve({ status, headers: res.headers, body: Buffer.concat(chunks), url: u.href });
                };
                stream.on('data', (c) => {
                    chunks.push(c);
                    got += c.length;
                    if (opt.maxBytes && got >= opt.maxBytes) {
                        finish();
                        try {
                            res.destroy();
                        } catch {
                            /* ignore */
                        }
                    }
                });
                stream.on('end', finish);
                stream.on('error', (e) => {
                    if (finished) return;
                    finished = true;
                    reject(e);
                });
                res.on('aborted', () => {
                    if (finished) return;
                    finished = true;
                    reject(new Error('连接被中断'));
                });
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
        .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&nbsp;/g, ' ');
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

/* 中转参数解析
 * 分片地址里常带 %3D / %2F 这类签名,一旦被二次解码签名就废了(上游 403 或直接给错误图)。
 * 所以中转参数默认用 base64url 传递,彻底躲开多重编码;同时兼容老的明文写法。 */
function safeUrlParam(v) {
    const s = String(v == null ? '' : v);
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (/%2F%2F|%3A%2F%2F/i.test(s)) {
        try {
            const d = decodeURIComponent(s);
            if (/^https?:\/\//i.test(d)) return d;
        } catch {
            /* fallthrough */
        }
    }
    const b = b64decode(s);
    if (/^https?:\/\//i.test(b)) return b;
    return s;
}

function stripTags(s) {
    return htmlDecode(
        String(s || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' '),
    ).trim();
}

function b64decode(s) {
    try {
        return Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    } catch {
        return '';
    }
}

function b64encode(s) {
    return Buffer.from(String(s || ''), 'utf8').toString('base64url');
}

/* --------------------------------------------------------------------------
 *  列表解析
 * ------------------------------------------------------------------------ */
function pickPic($el) {
    const $img = $el.find('img').first();
    if (!$img.length) return '';
    for (const attr of ['src', 'data-src', 'data-lazy-src', 'data-original', 'data-srcset']) {
        const v = String($img.attr(attr) || '').trim();
        const first = attr === 'data-srcset' ? v.split(/\s+/)[0] : v;
        if (/^https?:\/\//i.test(first)) return first;
    }
    return '';
}

function cardTags($el, $) {
    const out = [];
    $el.find('.grid3 .tags a, p.tags a').each((_, el) => {
        const t = stripTags($(el).text());
        if (t && !out.includes(t)) out.push(t);
    });
    return out;
}

function parseCards(html) {
    const $ = load(html);
    const list = [];
    const seen = new Set();

    $('div.inside-article').each((_, el) => {
        const $el = $(el);
        const $a = $el.find('.grid1 h2 a').first().length
            ? $el.find('.grid1 h2 a').first()
            : $el.find('.imgg a').first();
        let href = String($a.attr('href') || '').trim();
        if (!href) href = String($el.find('.imgg a').first().attr('href') || '').trim();
        if (!href) return;
        if (!/jav\.guru|\/\d+\//i.test(href)) return;

        href = absUrl(href);
        if (seen.has(href)) return;
        seen.add(href);

        const title = stripTags(String($a.attr('title') || '') || $a.text());
        const date = stripTags($el.find('.jav434 .date, .date').first().text());
        const stats = stripTags($el.find('.javstats').first().text());
        const views = (stats.match(/^([\d,]+)/) || [])[1] || '';
        const tags = cardTags($el, $);

        list.push({
            vod_id: href,
            vod_name: title || '未命名',
            vod_pic: pickPic($el),
            vod_remarks: [date, views ? `${views} 观看` : ''].filter(Boolean).join(' · '),
            type_name: tags[0] || '',
            vod_year: '',
            vod_area: 'JP',
            vod_content: tags.length ? `标签:${tags.join('、')}` : '',
        });
    });

    return list;
}

function parsePageCount($, html) {
    let max = 1;
    $('a.page-numbers, .page-numbers').each((_, el) => {
        const t = stripTags($(el).text()).replace(/[^\d]/g, '');
        const n = parseInt(t, 10);
        if (Number.isFinite(n) && n > max) max = n;
        const href = String($(el).attr('href') || '');
        const m = href.match(/\/page\/(\d+)/);
        if (m) {
            const v = parseInt(m[1], 10);
            if (v > max) max = v;
        }
    });
    const nx = String(html).match(/<link rel="next" href="([^"]+)"/i);
    if (nx) {
        const m = nx[1].match(/\/page\/(\d+)/);
        if (m) {
            const v = parseInt(m[1], 10);
            if (v > max) max = v;
        }
    }
    return max;
}

/* 从首页主导航 + 热门标签里拼分类清单 */
function parseNav(html) {
    const $ = load(html);
    const out = [];
    const seen = new Set();
    const push = (path, name) => {
        const p = String(path || '').trim();
        const n = stripTags(name);
        if (!p || !n) return;
        if (seen.has(p)) return;
        seen.add(p);
        out.push({ type_id: p, type_name: n });
    };

    $('#primary-menu a[href], nav.main-navigation a[href]').each((_, el) => {
        const href = String($(el).attr('href') || '').trim();
        const name = stripTags($(el).text());
        if (!href.startsWith(cfg.base)) return;
        if (!/\/(category|tag|actress|maker|studio|series|director)\//i.test(href)) return;
        push(href.slice(cfg.base.length), name);
    });

    if (out.length < 4) {
        $('a[href*="/category/"]').each((_, el) => {
            const href = String($(el).attr('href') || '').trim();
            const name = stripTags($(el).text());
            if (!href.startsWith(cfg.base)) return;
            if (!/\/category\/[^/]+\/?$/i.test(href)) return;
            push(href.slice(cfg.base.length), name);
        });
    }

    /* 主菜单只有 6 个 category,再从页面上补几个热门标签,列表更丰富 */
    if (out.length < 18) {
        $('a[href*="/tag/"]').each((_, el) => {
            if (out.length >= 16) return false;
            const href = String($(el).attr('href') || '').trim();
            const name = stripTags($(el).text());
            if (!href.startsWith(cfg.base)) return;
            if (!/\/tag\/[^/]+\/?$/i.test(href)) return;
            push(href.slice(cfg.base.length), name);
        });
    }

    return out;
}

/* --------------------------------------------------------------------------
 *  详情页解析
 * ------------------------------------------------------------------------ */
function lineNameOf(text) {
    const t = stripTags(text).toUpperCase();
    const m = t.match(/STREAM\s*([A-Z0-9]{1,4})/);
    if (m) return m[1];
    if (/^[A-Z0-9]{1,4}$/.test(t)) return t;
    return t.replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'L';
}

/* 从详情页抠出所有线路按钮: { name, url } */
function parseLines(html) {
    const $ = load(html);
    const out = [];
    const seen = new Set();

    $('a[data-localize]').each((_, el) => {
        const key = String($(el).attr('data-localize') || '').trim();
        if (!key || !/^[A-Za-z0-9_]+$/.test(key)) return;
        const name = lineNameOf($(el).text());
        const at = String(html).search(new RegExp(`var\\s+${key}\\s*=`));
        if (at < 0) return;
        const slice = String(html).slice(at, at + 4000);
        const um = slice.match(/"iframe_url"\s*:\s*"([^"]*)"/);
        if (!um || !um[1]) return;
        const url = b64decode(um[1]);
        if (!/^https?:\/\//i.test(url)) return;
        if (seen.has(url)) return;
        seen.add(url);
        out.push({ name, url });
    });

    /* 没按钮时兜底:详情页里自带 iframe */
    if (!out.length) {
        $('iframe[src]').each((_, el) => {
            const src = String($(el).attr('src') || '').trim();
            if (!src) return;
            if (/tsyndicate|doubleclick|googlesyndication|adservice|adsystem|popads|smartpop|mayzaent|godkc/i.test(src)) return;
            const full = absUrl(src);
            if (seen.has(full)) return;
            seen.add(full);
            out.push({ name: `L${out.length + 1}`, url: full });
        });
    }

    return out;
}

function parseDetail(html, pageUrl) {
    const $ = load(html);

    const title =
        stripTags($('h1.titl').first().text()) ||
        stripTags($('h1.entry-title').first().text()) ||
        stripTags($('meta[property="og:title"]').attr('content') || '') ||
        stripTags($('title').first().text());

    let cover = String($('.large-screenimg img').first().attr('src') || '').trim();
    if (!cover) cover = String($('meta[property="og:image"]').attr('content') || '').trim();

    const meta = {};
    $('.infometa .infoleft li').each((_, el) => {
        const raw = stripTags($(el).text());
        const m = raw.match(/^([A-Za-z ]{2,20})\s*[:：]\s*(.*)$/);
        if (!m) return;
        const k = m[1].trim().toLowerCase();
        const v = m[2].trim();
        if (!v) return;
        meta[k] = v;
    });

    const tags = [];
    $('.infometa .infoleft a[rel="tag"]').each((_, el) => {
        const t = stripTags($(el).text());
        if (t && !tags.includes(t)) tags.push(t);
    });

    const actress = [];
    $('.infometa .infoleft li').each((_, el) => {
        const $li = $(el);
        if (!/actress/i.test(stripTags($li.text()).slice(0, 20))) return;
        $li.find('a').each((_i, a) => {
            const t = stripTags($(a).text());
            if (t && !actress.includes(t)) actress.push(t);
        });
    });

    const views = stripTags($('.inforight .javstats').first().text());
    const posted = stripTags($('.inforight .thedate').first().text());
    const lines = parseLines(html);

    return { title, cover, meta, tags, actress, views, posted, lines, pageUrl };
}

/* --------------------------------------------------------------------------
 *  片源解析
 *  searcho 网关 → 302 落地 → packer 解包 → m3u8/mp4 直链
 * ------------------------------------------------------------------------ */

/* JS 字符串字面量反转义 */
function jsUnescape(s) {
    return String(s || '').replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (m, g) => {
        if (g.length > 1) return String.fromCharCode(parseInt(g.slice(1), 16));
        const map = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' };
        return map[g] !== undefined ? map[g] : g;
    });
}

function numToTok(n, base) {
    const dig = '0123456789abcdefghijklmnopqrstuvwxyz';
    if (n <= 0) return '0';
    let s = '';
    let v = n;
    while (v > 0) {
        s = dig[v % base] + s;
        v = Math.floor(v / base);
    }
    return s;
}

/* Dean Edwards packer 解包:只做字符串替换,不执行页面里的任何代码 */
function unpackPacker(html) {
    const out = [];
    const re =
        /eval\(function\(p,a,c,k,e,[a-z]\)\{[\s\S]*?\}\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/g;
    let m;
    while ((m = re.exec(html))) {
        let p = jsUnescape(m[1]);
        const a = parseInt(m[2], 10);
        const c = parseInt(m[3], 10);
        const k = jsUnescape(m[4]).split('|');
        for (let i = c - 1; i >= 0; i--) {
            const w = k[i];
            if (!w) continue;
            const tok = numToTok(i, a);
            if (!tok) continue;
            const rx = new RegExp(`\\b${tok}\\b`, 'g');
            p = p.replace(rx, () => w);
        }
        out.push(p);
    }
    return out;
}

/* 从落地页里收集候选直链,按可用性打分排序 */
const BAIT_PATTERN =
    /test-videos\.co\.uk|bigbuckbunny|w3schools|sample-videos|doubleclick|googlesyndication|adservice|adsystem|popads|pemsrv|twinrdengine|exoclick|juicyads|trafficjunky|diagramjawlineunhappy/i;

function collectMedia(html, origin) {
    const texts = unpackPacker(html);
    if (!texts.length) texts.push(String(html));

    const score = new Map();
    const add = (raw, s) => {
        let u = jsUnescape(raw).trim();
        if (!u) return;
        if (u.startsWith('//')) u = `https:${u}`;
        else if (u.startsWith('/')) u = `${origin}${u}`;
        if (!/^https?:\/\//i.test(u)) return;
        if (!/\.m3u8(\?|$)|\.mp4(\?|$)|master\.txt(\?|$)/i.test(u)) return;
        if (/\.(jpg|png|webp|gif|svg|css|js)(\?|$)/i.test(u)) return;
        if (BAIT_PATTERN.test(u)) return;
        const old = score.get(u) || 0;
        if (s > old) score.set(u, s);
    };

    for (const t of texts) {
        let m;
        const named = /"(hls\d*|file|src|url|link|video_url)"\s*:\s*"([^"]+)"/g;
        while ((m = named.exec(t))) {
            const key = m[1];
            const bonus = key === 'hls4' ? 40 : key === 'file' ? 35 : key === 'hls3' ? 30 : key === 'hls2' ? 25 : key === 'src' ? 20 : 10;
            add(m[2], 50 + bonus);
        }
        const bare = /https?:\/\/[^\s"'<>\\]+/g;
        while ((m = bare.exec(t))) add(m[0], 30);
    }

    return [...score.entries()]
        .sort((a, b) => b[1] - a[1])
        .map((x) => x[0]);
}

async function probeMedia(url) {
    try {
        const res = await httpRequest(url, {
            headers: { Range: 'bytes=0-1023', Accept: '*/*' },
            timeout: Math.min(cfg.timeout, 9000),
        });
        if (res.status !== 200 && res.status !== 206) return false;
        const head = res.body.slice(0, 512).toString('utf8');
        const ct = String(res.headers['content-type'] || '');
        if (/^\s*#EXTM3U/.test(head) || /mpegurl/i.test(ct)) return true;
        if (/\.mp4(\?|$)/i.test(url) && /video\/|octet-stream/i.test(ct)) return true;
        return false;
    } catch {
        return false;
    }
}

/* --------------------------------------------------------------------------
 *  分片伪装检测
 *  部分线路(如 javclan)会把 MPEG-TS 分片套一个 1x1 PNG/JPEG 头再发,
 *  ffmpeg 内核的播放器会把它当图片,表现就是整条线路黑屏。
 *  这里识别出来交给 /proxy/stream 剥壳,直连才交回播放器。
 * ------------------------------------------------------------------------ */
function tsOffset(buf) {
    if (!buf || buf.length < 8) return 0;
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
    const isGif = buf.slice(0, 3).toString('latin1') === 'GIF';
    const isRiff = buf.slice(0, 4).toString('latin1') === 'RIFF';
    if (buf[0] === 0x47 && buf[188] === 0x47) return 0;
    if (!isPng && !isJpg && !isGif && !isRiff) return 0;
    const limit = Math.min(Math.max(buf.length - 188 * 3, 0), 262144);
    for (let o = 0; o <= limit; o++) {
        if (buf[o] === 0x47 && buf[o + 188] === 0x47 && buf[o + 376] === 0x47) return o;
    }
    return buf.length; // 是图片且里面没有 TS
}

function playlistUris(txt, baseUrl) {
    const out = [];
    for (const line of String(txt).split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        try {
            out.push(new URL(t, baseUrl).href);
        } catch {
            out.push(t);
        }
    }
    return out;
}

async function firstSegmentOf(playlistUrl, depth = 0) {
    if (depth > 2) return '';
    const res = await httpRequest(playlistUrl, {
        headers: { 'User-Agent': UA, Accept: '*/*' },
        timeout: Math.min(cfg.timeout, 9000),
    });
    if (res.status !== 200) return '';
    const txt = res.body.toString('utf8');
    if (!/^#EXTM3U/.test(txt.trim())) return '';
    const uris = playlistUris(txt, playlistUrl);
    if (!uris.length) return '';
    const first = uris[0];
    if (/\.m3u8(\?|$)/i.test(first)) return firstSegmentOf(first, depth + 1);
    return first;
}

const _containerCache = new Map(); // host -> { kind, at }
const CONTAINER_TTL = 6 * 3600 * 1000;

async function detectContainer(playlistUrl) {
    let host = '';
    try {
        host = new URL(playlistUrl).hostname;
    } catch {
        return 'direct';
    }
    const hit = _containerCache.get(host);
    if (hit && Date.now() - hit.at < CONTAINER_TTL) return hit.kind;

    let kind = 'direct';
    try {
        const seg = await firstSegmentOf(playlistUrl);
        if (seg) {
            const r = await httpRequest(seg, {
                headers: { 'User-Agent': UA, Accept: '*/*' },
                timeout: Math.min(cfg.timeout, 6000),
                maxBytes: 8192,
            });
            const off = tsOffset(r.body);
            if (off > 0) kind = 'wrapped';
        }
    } catch {
        /* 探测失败按直连处理,别拖慢播放 */
    }
    _containerCache.set(host, { kind, at: Date.now() });
    return kind;
}

/* 网关页里的 window.cfg → 真实落地地址 */
function gatewayTarget(html) {
    const cf = String(html).match(/window\.cfg\s*=\s*\{([\s\S]*?)\}\s*;/);
    if (!cf) return '';
    const body = cf[1];
    const grab = (k) => {
        const m = body.match(new RegExp(`${k}\\s*:\\s*'([^']*)'`));
        return m ? m[1] : '';
    };
    const base = grab('base');
    const rtype = grab('rtype');
    const cid = grab('cid');
    const keysRaw = (body.match(/keys\s*:\s*\[([\s\S]*?)\]/) || [])[1] || '';
    const keys = [...keysRaw.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    if (!base || !rtype || !cid || !keys.length) return '';

    const box = String(html).match(new RegExp(`<div id="${cid}"[^>]*>`));
    if (!box) return '';
    const parts = [];
    for (const k of keys) {
        const m = box[0].match(new RegExp(`${k}="([^"]*)"`));
        if (!m) return '';
        parts.push(m[1]);
    }
    const token = parts.join('').split('').reverse().join('');
    return `${base}?${rtype}r=${encodeURIComponent(token)}`;
}

/* 单条线路 → 可播放直链 */
async function resolveLine(lineUrl) {
    const gateway = String(lineUrl || '').trim();
    if (!/^https?:\/\//i.test(gateway)) return null;

    let html = '';
    try {
        html = await getText(gateway, `${cfg.base}/`);
    } catch {
        return null;
    }

    let landUrl = '';
    if (html.indexOf('window.cfg') >= 0) {
        landUrl = gatewayTarget(html);
        if (!landUrl) return null;
    } else {
        /* 不是网关页:有些线路直接就是 embed 页(如 maxstream /embed-xxx.html) */
        landUrl = gateway;
    }

    let landHtml = '';
    let landedAt = landUrl;
    try {
        const res = await httpRequest(landUrl, { headers: baseHeaders(gateway) });
        landHtml = res.body.toString('utf8');
        landedAt = res.url || landUrl;
    } catch {
        return null;
    }

    const head = landHtml.slice(0, 4000);
    if (/no longer available|has been deleted|file (is )?expired|File Not Found/i.test(head)) return null;

    const origin = (String(landedAt).match(/^(https?:\/\/[^/]+)/) || [])[1] || '';
    const cands = collectMedia(landHtml, origin);
    for (const u of cands) {
        if (await probeMedia(u)) return { url: u, referer: gateway, landedAt };
    }
    return null;
}

/* 依次尝试各条线路,返回第一个能播的 */
async function resolveAny(lines, preferred) {
    const order = lineOrder(preferred);
    const rank = (n) => {
        const i = order.indexOf(String(n || '').toUpperCase());
        return i < 0 ? 99 : i;
    };
    const sorted = [...lines].sort((a, b) => rank(a.name) - rank(b.name));
    for (const l of sorted) {
        const r = await resolveLine(l.url);
        if (r) return { ...r, name: l.name, line: l };
    }
    return null;
}

/* --------------------------------------------------------------------------
 *  中转(仅在 ext.streamProxy=true 或播放器不认直链时用到)
 * ------------------------------------------------------------------------ */
/* 对外协议:优先反向代理头,其次真实连接协议,最后按 https 兜底 */
function protocolOf(request) {
    const h = (request && request.headers) || {};
    const xf = String(h['x-forwarded-proto'] || '').split(',')[0].trim();
    if (xf) return xf;
    const own = request && typeof request.protocol === 'string' ? request.protocol : '';
    if (own) return own;
    return 'https';
}

function selfBase(request) {
    const proto = protocolOf(request);
    const h = (request && request.headers) || {};
    const host = String(h['x-forwarded-host'] || h.host || '');
    const raw = String((request && request.raw && request.raw.url) || (request && request.url) || '/proxy/stream');
    const prefix = raw.split('/proxy/stream')[0];
    return `${proto}://${host}${prefix}`;
}

function proxyUrl(base, target, referer) {
    return `${base}/proxy/stream?u=${b64encode(target)}&ref=${b64encode(referer || `${cfg.base}/`)}`;
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
                return t.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${proxyUrl(base, toAbs(uri), referer)}"`);
            }
            if (/^https?:\/\//i.test(t) || /\.(ts|m3u8|mp4|aac|key|jpg|png|webp)(\?|$)/i.test(t)) {
                return proxyUrl(base, toAbs(t), referer);
            }
            return line;
        })
        .join('\n');
}

/* 按客户端 Range 切片发送 */
function sendSliced(reply, buf, clientRange, ct) {
    const total = buf.length;
    const m = String(clientRange || '').match(/bytes=(\d+)-(\d*)/);
    reply.header('Content-Type', ct || 'video/mp2t');
    reply.header('Accept-Ranges', 'bytes');
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Cache-Control', 'no-cache');
    if (m) {
        const start = parseInt(m[1], 10) || 0;
        const endRaw = m[2] ? parseInt(m[2], 10) : total - 1;
        if (start >= total) {
            reply.code(416).header('Content-Range', `bytes */${total}`).send('');
            return;
        }
        const end = Math.min(endRaw, total - 1);
        reply.code(206);
        reply.header('Content-Range', `bytes ${start}-${end}/${total}`);
        reply.header('Content-Length', String(end - start + 1));
        reply.send(buf.slice(start, end + 1));
        return;
    }
    reply.code(200);
    reply.header('Content-Length', String(total));
    reply.send(buf);
}

/* 分片短缓存:播放器 seek / 重试时命中缓存,少打上游(这些 CDN 限流很敏感) */
const _segCache = new Map();
const SEG_CACHE_TTL = 60 * 1000;
const SEG_CACHE_MAX = 12;

function segCacheGet(u) {
    const hit = _segCache.get(u);
    if (!hit) return null;
    if (Date.now() - hit.at > SEG_CACHE_TTL) {
        _segCache.delete(u);
        return null;
    }
    return hit.body;
}

function segCacheSet(u, body) {
    if (!body || body.length > 12 * 1024 * 1024) return;
    _segCache.set(u, { body, at: Date.now() });
    while (_segCache.size > SEG_CACHE_MAX) {
        const k = _segCache.keys().next().value;
        _segCache.delete(k);
    }
}

/* 大文件(mp4/超出缓冲上限)走流式直通 */
function pipeThrough(target, headers, request, reply) {
    return new Promise((resolve) => {
        const lib = target.startsWith('https://') ? https : http;
        const req = lib.request(target, { method: 'GET', headers, timeout: 30000 }, (res) => {
            reply.code(res.statusCode || 200);
            for (const h of [
                'content-type',
                'content-length',
                'accept-ranges',
                'content-range',
                'last-modified',
                'etag',
            ]) {
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

async function streamProxy(request, reply) {
    const q = request.query || {};
    const target = safeUrlParam(q.u || '');
    if (!target || !/^https?:\/\//i.test(target)) {
        reply.code(400).send('missing u');
        return;
    }
    const referer = safeUrlParam(q.ref || '') || `${cfg.base}/`;
    const headers = { 'User-Agent': UA, Referer: referer, Accept: '*/*' };
    if (cfg.cookie) headers.Cookie = cfg.cookie;
    const clientRange = request.headers && request.headers.range;

    /* ---- 1) 播放列表:整份拉下来改写,分片地址全部指向本中转 ---- */
    if (/\.m3u8(\?|$)/i.test(target)) {
        const chunks = [];
        await new Promise((resolve) => {
            const lib = target.startsWith('https://') ? https : http;
            const req = lib.request(target, { method: 'GET', headers, timeout: 30000 }, (res) => {
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
            });
            req.on('timeout', () => req.destroy(new Error('upstream timeout')));
            req.on('error', (e) => {
                reply.code(502).send(String((e && e.message) || e));
                resolve();
            });
            req.end();
        });
        return;
    }

    /* ---- 2) 分片 / 媒体文件 ---- */
    const cached = segCacheGet(target);
    let res;
    if (cached) {
        sendSliced(reply, cached, clientRange);
        return;
    } else {
        try {
            res = await httpRequest(target, { headers, timeout: 30000 });
        } catch (e) {
            reply.code(502).send(String((e && e.message) || e));
            return;
        }
    }

    const ct = String(res.headers['content-type'] || '');
    const len = parseInt(String(res.headers['content-length'] || '0'), 10) || 0;
    const big = /video\/mp4/i.test(ct) || len > 80 * 1024 * 1024;
    if (big) {
        /* 大文件别塞内存,带 Range 重新走流式 */
        const h2 = { ...headers };
        if (clientRange) h2.Range = clientRange;
        await pipeThrough(target, h2, request, reply);
        return;
    }

    const off = tsOffset(res.body);
    if (off > 0 && off < res.body.length) {
        /* PNG/JPEG 伪装的 TS 分片:剥掉外壳再发,播放器才认 */
        const clean = res.body.slice(off);
        segCacheSet(target, clean);
        sendSliced(reply, clean, clientRange);
        return;
    }

    /* 正常分片:原样转发 */
    reply.code(res.status || 200);
    for (const h of ['content-type', 'content-length', 'accept-ranges', 'content-range', 'last-modified', 'etag']) {
        if (res.headers[h]) reply.header(h, res.headers[h]);
    }
    reply.header('Access-Control-Allow-Origin', '*');
    reply.send(res.body);
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
        lines: cfg.lines,
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
    if (classList.length < 4) classList = FALLBACK_CLASS.map((c) => ({ ...c }));
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

    /* 带查询串的分页: /page/N/?s=xxx */
    if (p.includes('?')) {
        const [pathPart, query] = p.split('?');
        const clean = pathPart.replace(/\/page\/\d+\/?$/i, '').replace(/\/+$/, '');
        const n = parseInt(page, 10) || 1;
        return n > 1 ? `${cfg.base}/page/${n}/?${query}` : `${cfg.base}${clean || '/'}?${query}`;
    }

    const cleanPath = p.replace(/\/page\/\d+\/?$/i, '').replace(/\/+$/, '');
    const n = parseInt(page, 10) || 1;
    if (!cleanPath) return n > 1 ? `${cfg.base}/page/${n}/` : `${cfg.base}/`;
    return n > 1 ? `${cfg.base}${cleanPath}/page/${n}/` : `${cfg.base}${cleanPath}/`;
}

async function category(inReq) {
    const body = (inReq && inReq.body) || {};
    applyExt(body.ext || {});
    const page = parseInt(body.page ?? body.pg ?? 1, 10) || 1;
    const tid = body.id ?? body.tid ?? body.type_id ?? '/category/jav/';

    const url = buildListUrl(tid, page);
    const html = await getText(url, `${cfg.base}/`);
    const $ = load(html);
    const list = parseCards(html);
    const pagecount = parsePageCount($, html);
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
        if (/^\d+$/.test(url)) url = `${cfg.base}/${url}/`;
        else url = absUrl(url);
    }

    const html = await getText(url, `${cfg.base}/`);
    const d = parseDetail(html, url);

    const lines = [];
    if (d.meta.code) lines.push(`番号:${d.meta.code}`);
    if (d.meta['release date']) lines.push(`发行:${d.meta['release date']}`);
    if (d.actress.length) lines.push(`女优:${d.actress.join('、')}`);
    if (d.meta.actor) lines.push(`男优:${d.meta.actor}`);
    if (d.meta.director) lines.push(`导演:${d.meta.director}`);
    if (d.meta.studio) lines.push(`片商:${d.meta.studio}`);
    if (d.meta.label) lines.push(`系列:${d.meta.label}`);
    if (d.meta.maker) lines.push(`厂牌:${d.meta.maker}`);
    if (d.tags.length) lines.push(`标签:${d.tags.join('、')}`);
    if (d.views) lines.push(`观看:${d.views}`);
    if (d.posted) lines.push(d.posted);
    lines.push(`来源:${url}`);

    const pagePath = (() => {
        try {
            const u = new URL(url);
            return u.pathname + (u.search || '');
        } catch {
            return '';
        }
    })();
    const eps = d.lines
        .map((l) => `${l.name}$${META.key}://${b64encode(JSON.stringify({ l: l.url, p: pagePath }))}`)
        .join('#');

    return {
        list: [
            {
                vod_id: url,
                vod_name: d.title || '未命名',
                vod_pic: d.cover,
                vod_content: lines.join('\n'),
                vod_remarks: d.lines.length ? `${d.lines.length} 线路` : '暂无片源',
                vod_year: (d.meta['release date'] || '').slice(0, 4),
                vod_area: 'JP',
                vod_actor: d.actress.join('、'),
                vod_director: d.meta.director || '',
                type_name: (d.tags[0] || '').trim(),
                vod_play_from: d.lines.length ? META.key : '',
                vod_play_url: eps,
            },
        ],
    };
}

function selfBaseFromReq(req) {
    if (cfg.proxyBase) return cfg.proxyBase.replace(/\/+$/, '');
    try {
        const headers = (req && req.headers) || {};
        const proto = protocolOf(req);
        const host = String(headers['x-forwarded-host'] || headers.host || '');
        if (!host) return cfg.base;
        return `${proto}://${host}`;
    } catch {
        return cfg.base;
    }
}

/* 线路解析结果 → 交给播放器的响应。伪装分片必须走中转剥壳,否则播放器黑屏 */
async function buildPlayResult(inReq, r) {
    const ref = r.referer || `${cfg.base}/`;
    if (cfg.streamProxy) {
        return { parse: 0, url: proxyUrl(selfBaseFromReq(inReq), r.url, ref), header: { 'User-Agent': UA } };
    }
    let kind = 'direct';
    try {
        kind = await detectContainer(r.url);
    } catch {
        kind = 'direct';
    }
    if (kind === 'wrapped') {
        return { parse: 0, url: proxyUrl(selfBaseFromReq(inReq), r.url, ref), header: { 'User-Agent': UA } };
    }
    return { parse: 0, url: r.url, header: { 'User-Agent': UA } };
}

async function play(inReq) {
    const body = (inReq && inReq.body) || {};
    applyExt(body.ext || {});
    let id = String(body.id || body.url || body.play || '').trim();
    let preferred = '';
    const pref = id.match(/^([A-Za-z0-9]{1,6})\$(.+)$/);
    if (pref) {
        preferred = pref[1];
        id = pref[2].trim();
    }
    if (!id) return { parse: 0, url: '' };

    let lineUrl = '';
    let pagePath = '';
    let allLines = [];

    if (id.startsWith(`${META.key}://`)) {
        const payload = b64decode(id.slice(META.key.length + 3));
        if (payload.trim().startsWith('{')) {
            try {
                const o = JSON.parse(payload);
                lineUrl = String(o.l || '');
                pagePath = String(o.p || '');
            } catch {
                lineUrl = payload;
            }
        } else {
            lineUrl = payload;
        }
    } else if (/\/searcho\//i.test(id) || /\/e\/[A-Za-z0-9]+/i.test(id) || /\/embed-/i.test(id)) {
        lineUrl = id;
    } else {
        /* 客户端直接把详情页地址丢过来:现抓一次 */
        const pageUrl = /^https?:\/\//i.test(id) ? id : /^\d+$/.test(id) ? `${cfg.base}/${id}/` : absUrl(id);
        pagePath = pageUrl;
        try {
            allLines = parseLines(await getText(pageUrl, `${cfg.base}/`));
        } catch {
            allLines = [];
        }
    }

    /* 1) 先用指定的那条线路 */
    if (lineUrl) {
        const r = await resolveLine(lineUrl);
        if (r) return await buildPlayResult(inReq, r);
    }

    /* 2) 这条不通(线路失效/播放器加密封装)→ 回详情页把其它线路依次试一遍 */
    if (!allLines.length && pagePath) {
        try {
            const pageUrl = /^https?:\/\//i.test(pagePath) ? pagePath : `${cfg.base}${pagePath}`;
            allLines = parseLines(await getText(pageUrl, `${cfg.base}/`));
        } catch {
            allLines = [];
        }
    }
    if (allLines.length) {
        const reached = lineUrl ? allLines.filter((l) => l.url !== lineUrl) : allLines;
        const r = await resolveAny(reached.length ? reached : allLines, preferred);
        if (r) return await buildPlayResult(inReq, r);
    }

    /* 3) 全都不通:javguru:// 编码的线路交给上层重试,手贴的 embed 地址原样返回 */
    if (lineUrl && !pagePath) return { parse: 0, url: lineUrl, header: { 'User-Agent': UA } };
    return { parse: 0, url: '' };
}

async function search(inReq) {
    const body = (inReq && inReq.body) || {};
    applyExt(body.ext || {});
    const wd = String(body.wd || body.key || body.keyword || '').trim();
    if (!wd) return { list: [] };
    const page = parseInt(body.page ?? body.pg ?? 1, 10) || 1;
    const q = encodeURIComponent(wd);
    const url = page > 1 ? `${cfg.base}/page/${page}/?s=${q}` : `${cfg.base}/?s=${q}`;
    const html = await getText(url, `${cfg.base}/`);
    return { list: parseCards(html), page };
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
