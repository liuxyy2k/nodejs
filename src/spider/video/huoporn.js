/**
 * HuoPorn 插件（苹果CMS / Vue SSR 皮）
 * 零依赖：只用 Node 内置 http/https/zlib，不依赖 cheerio / req.js / axios
 *
 * 站点特征（实测）：
 *  - 没有 /vod/detail/id/ 详情页（返回 500），详情与播放合并在 /vod/play/id/{id}/sid/{sid}/nid/{nid}.html
 *  - 片源在页面内联 <script>var player_aaaa={...}</script>，zym3u8 直链
 *  - 片源 AES-128，KEY 是同目录相对路径 key.key，分片 seg_xxxxxx.ts，CT 直连可拉（不需要 Referer/Cookie）
 *  - 列表每页 20 条；分页 /index.php/vod/type/id/{id}/page/{n}.html
 *  - 搜索 /index.php/vod/search/wd/{词}/page/{n}.html
 *  - 多集：nid 从 1 递增，页面里 link_next/link_pre 指示存在性，但只有真实集有 url
 */

import http from 'http';
import https from 'https';
import zlib from 'zlib';
import crypto from 'crypto';
import { URL } from 'url';

const DEFAULT_SITE = 'https://www.huoporn.cyou';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/* ---------------- 分类树（实测，可用 ext.cats 覆盖） ---------------- */
const DEFAULT_CATS = [
    { type_id: '1', type_name: '国产' },
    { type_id: '2', type_name: '传媒' },
    { type_id: '3', type_name: '网红' },
    { type_id: '4', type_name: '大秀' },
    { type_id: '5', type_name: '探花' },
    { type_id: '6', type_name: '反差' },
    { type_id: '7', type_name: '颜值' },
    { type_id: '8', type_name: '中文' },
    { type_id: '9', type_name: '无码' },
    { type_id: '10', type_name: '日韩' },
    { type_id: '11', type_name: '欧美' },
    { type_id: '12', type_name: '动漫' },
    { type_id: '13', type_name: '人妻' },
    { type_id: '14', type_name: '制服' },
    { type_id: '15', type_name: '乱伦' },
    { type_id: '16', type_name: '明星' },
    { type_id: '17', type_name: '自拍' },
    { type_id: '18', type_name: '三级' },
    { type_id: '20', type_name: '师生' },
    { type_id: '24', type_name: 'Ai短剧' },
    { type_id: '25', type_name: '黑料' },
    { type_id: '26', type_name: '短剧' },
];

/* ---------------- ext 配置 ---------------- */
function cfg(inReq) {
    let ext = inReq && (inReq.ext || inReq.body && inReq.body.ext);
    if (typeof ext === 'string') { try { ext = JSON.parse(ext); } catch { ext = {}; } }
    ext = ext || {};
    const site = String(ext.site || DEFAULT_SITE).replace(/\/+$/, '');
    return {
        site,
        proxy: String(ext.proxy || 'auto').toLowerCase(),          // auto | local | direct
        proxyHost: String(ext.proxyHost || '').replace(/\/+$/, ''),
        decrypt: String(ext.decrypt || '') === '1',
        maxEpisodes: Math.max(1, parseInt(ext.maxEpisodes, 10) || 200),
        cats: Array.isArray(ext.cats) && ext.cats.length ? ext.cats : DEFAULT_CATS,
    };
}

/* ---------------- HTTP 客户端（带重试 / 退避 / 解压） ---------------- */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function httpGet(url, opt = {}) {
    const { headers = {}, timeout = 15000, redirect = 4 } = opt;
    return new Promise((resolve, reject) => {
        let u;
        try { u = new URL(url); } catch (e) { return reject(e); }
        const mod = u.protocol === 'https:' ? https : http;
        const req = mod.request({
            protocol: u.protocol,
            hostname: u.hostname,
            port: u.port || undefined,
            path: u.pathname + u.search,
            method: 'GET',
            headers: Object.assign({
                'User-Agent': UA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                let buf = Buffer.concat(chunks);
                const enc = String(res.headers['content-encoding'] || '').toLowerCase();
                try {
                    if (enc === 'gzip') buf = zlib.gunzipSync(buf);
                    else if (enc === 'deflate') buf = zlib.inflateSync(buf);
                    else if (enc === 'br') buf = zlib.brotliDecompressSync(buf);
                } catch { /* 解压失败就用原始内容 */ }
                resolve({ status: res.statusCode || 0, headers: res.headers, body: buf });
            });
        });
        req.setTimeout(timeout, () => { req.destroy(new Error('ETIMEDOUT')); });
        req.on('error', reject);
        req.end();
    });
}

async function getText(url, opt = {}, tries = 3) {
    let last;
    for (let i = 0; i < tries; i++) {
        try {
            const r = await httpGet(url, opt);
            if (r.status === 429) { await sleep(900 * (i + 1) + Math.random() * 400); last = new Error('HTTP 429'); continue; }
            if (r.status === 403 || r.status >= 500) { await sleep(500 * (i + 1)); last = new Error('HTTP ' + r.status); continue; }
            return { status: r.status, headers: r.headers, text: r.body.toString('utf8') };
        } catch (e) {
            last = e;
            await sleep(500 * (i + 1) + Math.random() * 300);
        }
    }
    throw last || new Error('fetch failed');
}

/* ---------------- HTML 解析 ---------------- */
function decodeEnt(s) {
    return String(s || '')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function absUrl(u, base) {
    u = decodeEnt(String(u || '').trim());
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return 'https:' + u;
    const b = String(base || '').replace(/\/+$/, '');
    if (u.startsWith('/')) return b + u;
    return b + '/' + u;
}

function cleanTitle(t) {
    return decodeEnt(t).replace(/\s+/g, ' ').trim();
}

/** 按 <article class="video-item"> 切块解析列表 */
function parseList(html, inReq) {
    const c = cfg(inReq);
    const list = [];
    const seen = new Set();
    const re = /<article[^>]*class="[^"]*video-item[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
    let m;
    while ((m = re.exec(html))) {
        const block = m[0];
        const inner = m[1];
        // 有些模板把整块注释掉了，跳过
        const before = html.slice(Math.max(0, m.index - 12), m.index);
        if (before.includes('<!--')) {
            const closeIdx = html.lastIndexOf('-->', m.index);
            if (closeIdx >= 0 && closeIdx > html.lastIndexOf('<!--', m.index)) continue;
        }
        const link = inner.match(/href="([^"]*\/vod\/play\/id\/(\d+)\/sid\/(\d+)\/nid\/(\d+)\.html)"/);
        if (!link) continue;
        const vodId = link[2];
        if (seen.has(vodId)) continue;
        seen.add(vodId);

        const pic = (inner.match(/<img[^>]*\ssrc="([^"]+)"/) || [])[1] || '';
        let title = '';
        const h3 = inner.match(/<h3[^>]*class="[^"]*video-item__title[^"]*"[^>]*title="([^"]*)"/);
        if (h3) title = h3[1];
        if (!title) {
            const aria = block.match(/aria-label="([^"]*)"/);
            if (aria) title = aria[1];
        }
        if (!title) {
            const h3b = inner.match(/<h3[^>]*class="[^"]*video-item__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/);
            if (h3b) title = h3b[1].replace(/<[^>]+>/g, '');
        }
        title = cleanTitle(title);
        if (!title) continue;

        const dur = (inner.match(/class="video-item__duration"[^>]*>([\s\S]*?)<\/span>/) || [])[1] || '';
        list.push({
            vod_id: vodId,
            vod_name: title,
            vod_pic: absUrl(pic, c.site),
            vod_remarks: cleanTitle(dur.replace(/<[^>]+>/g, '')),
        });
    }
    return list;
}

/** 从播放页取 player_aaaa */
function parsePlayer(html) {
    const m = html.match(/var\s+player_aaaa\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
    if (!m) return null;
    let raw = m[1].trim();
    try { return JSON.parse(raw); } catch { /* 落到下面的修复分支 */ }
    try {
        // 去掉 JS 里可能出现的裸控制字符
        raw = raw.replace(/[\u0000-\u001f]/g, ' ');
        return JSON.parse(raw);
    } catch { return null; }
}

function stripSuffix(t) {
    let s = cleanTitle(t);
    // 站点标题偶尔叠两层后缀，循环剥
    for (let i = 0; i < 3; i++) {
        const n = s.replace(/\s*[-|_–—]\s*(HuoPorn福利视频|HuoPorn|福利视频)\s*$/i, '');
        if (n === s) break;
        s = n;
    }
    return s.trim();
}

function playPageUrl(site, id, sid = 1, nid = 1) {
    return `${site}/index.php/vod/play/id/${id}/sid/${sid}/nid/${nid}.html`;
}

function parseVodId(raw) {
    let s = String(raw == null ? '' : raw).trim();
    if (!s) return null;
    // 支持 97894 / 97894|1|3 / play/id/97894/sid/1/nid/3.html
    const p = s.match(/(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)/);
    if (p) return { id: p[1], sid: p[2], nid: p[3] };
    const u = s.match(/\/id\/(\d+)\/sid\/(\d+)\/nid\/(\d+)/);
    if (u) return { id: u[1], sid: u[2], nid: u[3] };
    const d = s.match(/^(\d+)$/);
    if (d) return { id: d[1], sid: '1', nid: '1' };
    const any = s.match(/(\d+)/);
    return any ? { id: any[1], sid: '1', nid: '1' } : null;
}

/* ---------------- 多集探测 ---------------- */
async function fetchEpisode(site, id, sid, nid) {
    try {
        const r = await getText(playPageUrl(site, id, sid, nid), {}, 2);
        if (r.status !== 200) return null;
        const d = parsePlayer(r.text);
        if (!d || !d.url) return null;
        return { nid: Number(nid), url: String(d.url).replace(/\\\//g, '/'), from: d.from || '' };
    } catch { return null; }
}

/**
 * 拿全集：先探 nid=2 判断是不是多集，再分批并行探到底
 * 单集视频只花 2 个请求
 */
async function collectEpisodes(site, id, sid, maxEpisodes) {
    const first = await fetchEpisode(site, id, sid, 1);
    if (!first) return { episodes: [], first: null };
    const second = await fetchEpisode(site, id, sid, 2);
    if (!second) return { episodes: [first], first };

    const eps = [first, second];
    const batch = 8;
    let n = 3;
    let guard = 0;
    while (n <= maxEpisodes && guard++ < 60) {
        const ns = [];
        for (let i = 0; i < batch && n <= maxEpisodes; i++, n++) ns.push(n);
        const res = await Promise.all(ns.map(x => fetchEpisode(site, id, sid, x)));
        const valid = res.filter(Boolean);
        if (!valid.length) break;
        eps.push(...valid);
        if (n <= maxEpisodes) await sleep(120);
    }
    eps.sort((a, b) => a.nid - b.nid);
    return { episodes: eps, first };
}

/* ---------------- m3u8 处理 ---------------- */
function m3u8Base(u) {
    const i = u.lastIndexOf('/');
    return i > 0 ? u.slice(0, i + 1) : u;
}

function isM3u8(url, text) {
    if (/\.m3u8($|\?)/i.test(url)) return true;
    return /^\s*#EXTM3U/i.test(text || '');
}

/** 把 m3u8 里的相对地址全部改成上游绝对地址（直连模式用，保持原样也行，但避免播放器解析差异） */
function rewriteToAbsolute(text, baseUrl) {
    return text.split('\n').map(line => {
        const t = line.trim();
        if (!t) return line;
        if (t.startsWith('#')) {
            return line.replace(/URI="([^"]+)"/g, (all, uri) => {
                if (/^https?:\/\//i.test(uri) || uri.startsWith('data:')) return all;
                return `URI="${absUrl(uri, baseUrl.replace(/\/[^/]*$/, ''))}"`;
            });
        }
        if (/^https?:\/\//i.test(t)) return line;
        return absUrl(t, baseUrl.replace(/\/[^/]*$/, ''));
    }).join('\n');
}

/* ---------------- 代理模式 ---------------- */
function makeProxyUrl(inReq, target, opt = {}) {
    const c = cfg(inReq);
    const host = c.proxyHost || (inReq && (inReq.host || inReq.hostname)) || '';
    const q = new URLSearchParams();
    q.set('url', target);
    if (opt.decrypt) {
        q.set('decrypt', '1');
        if (opt.key) q.set('key', opt.key);
        if (opt.iv) q.set('iv', opt.iv);
    }
    if (!host) return '';
    const base = /^https?:\/\//i.test(host) ? host : ('http://' + host);
    return `${base}/spider/huoporn/3/proxy/stream?${q.toString()}`;
}

async function proxyStream(inReq, reply) {
    const c = cfg(inReq);
    try {
        const target = decodeURIComponent(String(inReq.query.url || ''));
        if (!/^https?:\/\//i.test(target)) return reply.code(400).send('bad url');
        const wantDecrypt = String(inReq.query.decrypt || '') === '1' || c.decrypt;

        const r = await httpGet(target, { headers: { 'User-Agent': UA, Referer: c.site + '/' }, timeout: 20000 });
        if (r.status !== 200 || !r.body || !r.body.length) return reply.code(r.status || 502).send('');

        const head = r.body.slice(0, 64).toString('utf8');
        const isPlaylist = /\.m3u8($|\?)/i.test(target) || head.trim().startsWith('#EXTM3U');

        if (isPlaylist) {
            let text = r.body.toString('utf8');
            // 所有相对地址转绝对，再决定是否走本地代理
            text = rewriteToAbsolute(text, target);

            let keyBuf = null;
            let ivHex = '';
            if (wantDecrypt) {
                const km = text.match(/#EXT-X-KEY:METHOD=AES-128([^\n]*)/i);
                if (km) {
                    const uriM = km[1].match(/URI="([^"]+)"/);
                    const ivM = km[1].match(/IV=0x([0-9a-fA-F]{32})/);
                    if (ivM) ivHex = ivM[1].toLowerCase();
                    if (uriM) {
                        try {
                            const kr = await httpGet(uriM[1], { headers: { 'User-Agent': UA, Referer: c.site + '/' } });
                            if (kr.status === 200 && kr.body.length === 16) keyBuf = kr.body;
                        } catch { /* 拿不到 key 就当没加密，回原片 */ }
                    }
                }
                if (keyBuf) {
                    // 本地已解密，去掉 KEY 行，避免播放器再解一次
                    text = text.split('\n').filter(l => !/^#EXT-X-KEY/i.test(l.trim())).join('\n');
                    if (!ivHex) {
                        // 没有显式 IV 时按 media sequence 推，取 0 兜底
                        ivHex = '0'.repeat(32);
                    }
                }
            }

            const useLocal = c.proxy === 'local' || c.proxy === 'auto' || wantDecrypt;
            if (useLocal) {
                const keyHex = keyBuf ? keyBuf.toString('hex') : '';
                const decrypting = !!(wantDecrypt && keyBuf);
                text = text.split('\n').map(line => {
                    const t = line.trim();
                    if (!t) return line;
                    if (t.startsWith('#')) {
                        // 没解密时，KEY 也走本地代理，避免播放器跨域取 key 被拦
                        if (!decrypting && /^#EXT-X-KEY/i.test(t)) {
                            return line.replace(/URI="([^"]+)"/, (all, u) => `URI="${makeProxyUrl(inReq, u)}"`);
                        }
                        return line;
                    }
                    return makeProxyUrl(inReq, t, {
                        decrypt: decrypting,
                        key: keyHex,
                        iv: ivHex,
                    });
                }).join('\n');
            }
            reply.header('Content-Type', 'application/vnd.apple.mpegurl');
            reply.header('Access-Control-Allow-Origin', '*');
            reply.header('Cache-Control', 'no-cache');
            return reply.send(Buffer.from(text, 'utf8'));
        }

        // 分片 / key
        let body = r.body;
        if (wantDecrypt && /\.ts($|\?)/i.test(target)) {
            const keyHex = String(inReq.query.key || '');
            const ivHex = String(inReq.query.iv || '');
            if (keyHex && ivHex) {
                try {
                    body = decryptTs(body, Buffer.from(keyHex, 'hex'), Buffer.from(ivHex, 'hex'));
                } catch { /* 解不了就回原片 */ }
            }
        }
        const ct = /\.key($|\?)/i.test(target) ? 'application/octet-stream'
            : (/\.ts($|\?)/i.test(target) ? 'video/mp2t' : (r.headers['content-type'] || 'application/octet-stream'));
        reply.header('Content-Type', ct);
        reply.header('Accept-Ranges', 'bytes');
        reply.header('Access-Control-Allow-Origin', '*');
        return reply.send(body);
    } catch (e) {
        return reply.code(502).send('');
    }
}

/** AES-128-CBC 解密分片（Node 内置 crypto） */
function decryptTs(buf, key, iv) {
    const d = crypto.createDecipheriv('aes-128-cbc', key, iv);
    return Buffer.concat([d.update(buf), d.final()]);
}

/* ---------------- 路由实现 ---------------- */
async function init(inReq) {
    const c = cfg(inReq);
    return {
        class: [
            { type_id: 'hot', type_name: '🏠 首页' },
            ...c.cats.map(x => ({ type_id: String(x.type_id), type_name: x.type_name })),
        ],
        filters: {},
    };
}

async function home(inReq) {
    const c = cfg(inReq);
    try {
        const r = await getText(c.site + '/', {}, 3);
        const html = r.text;
        const sections = [];
        const secRe = /<section[^>]*class="[^"]*video-section[^"]*"[\s\S]*?(?=<section[^>]*class="[^"]*video-section|<\/main>|$)/g;
        let m;
        const blocks = [];
        while ((m = secRe.exec(html))) blocks.push(m[0]);
        if (!blocks.length) blocks.push(html);

        for (const b of blocks) {
            const titleM = b.match(/video-section__title"[^>]*>\s*([^<]+?)\s*</);
            const title = titleM ? cleanTitle(titleM[1]) : '';
            const list = parseList(b, inReq);
            if (!title || !list.length) continue;
            if (sections.some(s => s.name === title)) continue;
            sections.push({ name: title, list });
        }
        if (!sections.length) {
            const list = parseList(html, inReq);
            if (list.length) sections.push({ name: '推荐', list });
        }
        return { class: sections };
    } catch (e) {
        return { class: [] };
    }
}

async function category(inReq) {
    const c = cfg(inReq);
    const page = Math.max(1, parseInt(inReq.body && (inReq.body.page || inReq.body.pg), 10) || 1);
    const typeId = String((inReq.body && inReq.body.id) || '').trim();
    if (!typeId || typeId === 'hot' || !/^\d+$/.test(typeId)) {
        return { page, pagecount: 1, list: [] };
    }
    const buildUrl = (p) => p <= 1
        ? `${c.site}/index.php/vod/type/id/${typeId}.html`
        : `${c.site}/index.php/vod/type/id/${typeId}/page/${p}.html`;

    try {
        const r = await getText(buildUrl(page), {}, 3);
        if (r.status !== 200) return { page, pagecount: page, list: [] };
        // 站上对不存在的栏目会回落成默认内容，标题会变成 "- - HuoPorn福利视频"，这种直接当空
        const tl = r.text.match(/<title>([\s\S]*?)<\/title>/);
        const head = tl ? cleanTitle(tl[1]).replace(/\s*[-–—]\s*(HuoPorn福利视频|HuoPorn)\s*$/i, '').trim() : '';
        if (head && /^[-–—]/.test(head)) return { page, pagecount: page, list: [] };

        const list = parseList(r.text, inReq);
        let pagecount = page;
        if (list.length) {
            // 站上无分页器（无限滚动），探一下下一页还有没有内容
            try {
                const nx = await getText(buildUrl(page + 1), {}, 1);
                if (nx.status === 200 && /\/vod\/play\/id\/\d+/.test(nx.text)) pagecount = page + 1;
            } catch { /* 探测失败就按当前页算 */ }
        }
        return { page, pagecount, list };
    } catch (e) {
        return { page, pagecount: page, list: [] };
    }
}

async function detail(inReq) {
    const c = cfg(inReq);
    const p = parseVodId(inReq.body && inReq.body.id);
    if (!p) return { list: [] };

    const url = playPageUrl(c.site, p.id, p.sid, p.nid);
    let html = '';
    try {
        const r = await getText(url, {}, 3);
        if (r.status === 200) html = r.text;
    } catch { /* 下面走兜底 */ }
    if (!html) return { list: [] };

    // 标题
    let name = '';
    const h1 = html.match(/<h1[^>]*class="[^"]*video-detail__title[^"]*"[^>]*>([\s\S]*?)<\/h1>/);
    if (h1) name = h1[1].replace(/<[^>]+>/g, '');
    if (!name) {
        const og = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/);
        if (og) name = og[1];
    }
    if (!name) {
        const t = html.match(/<title>([\s\S]*?)<\/title>/);
        if (t) name = t[1];
    }
    name = stripSuffix(name);

    // 封面：播放页没有自带海报，从同名片卡里取（推荐区通常含本片）
    let pic = (html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]*)"/) || [])[1] || '';
    if (!pic && name) {
        const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const own = new RegExp('aria-label="' + esc + '"[\\s\\S]{0,800}?<img[^>]*\\ssrc="([^"]+)"');
        const own2 = new RegExp('title="' + esc + '"[\\s\\S]{0,800}?<img[^>]*\\ssrc="([^"]+)"');
        const mm = html.match(own) || html.match(own2);
        if (mm) pic = mm[1];
    }
    // 再兜一层：站点 ajax 最新列表里按 id 碰（新片命中率高）
    let aj = null;
    try {
        const ar = await getText(`${c.site}/index.php/ajax/data?mid=1&limit=10`, {}, 2);
        if (ar.status === 200 && ar.text.trim().startsWith('{')) {
            const j = JSON.parse(ar.text);
            if (Array.isArray(j.list)) aj = j.list.find(x => String(x.vod_id) === String(p.id)) || null;
        }
    } catch { /* 这个只是加分项，拿不到不影响主流程 */ }
    if (aj && aj.vod_pic) pic = aj.vod_pic;
    // 老片兜底：站内搜标题，取同名那条的封面
    if (!pic && name) {
        try {
            const kw = name.replace(/^[\[\]【】\s]+|[\[\]【】\s]+$/g, '').slice(0, 20);
            if (kw) {
                const sr = await getText(`${c.site}/index.php/vod/search/wd/${encodeURIComponent(kw)}.html`, {}, 2);
                if (sr.status === 200) {
                    const hits = parseList(sr.text, inReq);
                    const hit = hits.find(x => String(x.vod_id) === String(p.id))
                        || hits.find(x => x.vod_name === name);
                    if (hit && hit.vod_pic) pic = hit.vod_pic;
                }
            }
        } catch { /* 兜底失败不影响主流程 */ }
    }

    // 标签
    const tags = [];
    const tagRe = /class="[^"]*video-detail__tag[^"]*"[\s\S]{0,200}?<a[^>]*>([^<]+)<\/a>/g;
    let tm;
    while ((tm = tagRe.exec(html))) {
        const t = cleanTitle(tm[1]).replace(/^#/, '');
        if (t && !tags.includes(t)) tags.push(t);
    }
    if (aj && aj.vod_tag) {
        String(aj.vod_tag).split(',').map(s => s.trim()).filter(Boolean).forEach(t => {
            if (!tags.includes(t)) tags.push(t);
        });
    }

    // 简介
    let content = '';
    if (aj) content = String(aj.vod_content || aj.vod_blurb || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!content) content = (html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]*)"/) || [])[1] || '';
    content = decodeEnt(content).trim();
    if (tags.length) content = (content ? content + '\n' : '') + '标签：' + tags.map(t => '#' + t).join(' ');

    // 全集
    const { episodes } = await collectEpisodes(c.site, p.id, p.sid, c.maxEpisodes);

    let playFrom = 'HuoPorn';
    let playUrl = '';
    if (episodes.length) {
        playFrom = episodes[0].from || 'HuoPorn';
        playUrl = episodes.map(e => `${episodes.length > 1 ? '第' + e.nid + '集' : '正片'}$${p.id}|${p.sid}|${e.nid}`).join('#');
    } else if (p.nid && p.nid !== '1') {
        playUrl = `正片$${p.id}|${p.sid}|${p.nid}`;
    }

    const remarks = episodes.length > 1 ? `共${episodes.length}集` : ((aj && aj.vod_remarks) ? cleanTitle(aj.vod_remarks) : '');

    return {
        list: [{
            vod_id: p.id,
            vod_name: name,
            vod_pic: absUrl(pic, c.site),
            vod_content: content,
            vod_remarks: remarks,
            vod_play_from: playFrom,
            vod_play_url: playUrl,
        }],
    };
}

async function play(inReq) {
    const c = cfg(inReq);
    const p = parseVodId(inReq.body && inReq.body.id);
    if (!p) return { parse: 0, url: '', header: {} };

    let d = null;
    try {
        const r = await getText(playPageUrl(c.site, p.id, p.sid, p.nid), {}, 3);
        if (r.status === 200) d = parsePlayer(r.text);
    } catch { /* 下面兜底 */ }

    let target = d && d.url ? String(d.url).replace(/\\\//g, '/') : '';
    if (!target) return { parse: 0, url: '', header: {} };

    const header = { 'User-Agent': UA, Referer: c.site + '/' };

    if (c.proxy === 'local') {
        const pu = makeProxyUrl(inReq, target, { decrypt: c.decrypt });
        // 拿不到本机可访问地址时退回直连，别给播放器一个打不开的链接
        if (pu) return { parse: 1, url: pu, header };
    }
    return { parse: 0, url: target, header };
}

async function search(inReq) {
    const c = cfg(inReq);
    const wd = String((inReq.body && (inReq.body.wd || inReq.body.key)) || '').trim();
    const page = Math.max(1, parseInt(inReq.body && (inReq.body.page || inReq.body.pg), 10) || 1);
    if (!wd) return { page, pagecount: 1, list: [] };

    const buildUrl = (p) => {
        const base = `${c.site}/index.php/vod/search/wd/${encodeURIComponent(wd)}`;
        return p <= 1 ? `${base}.html` : `${base}/page/${p}.html`;
    };
    try {
        const r = await getText(buildUrl(page), {}, 3);
        if (r.status !== 200) return { page, pagecount: page, list: [] };
        const list = parseList(r.text, inReq);
        let pagecount = page;
        if (list.length) {
            try {
                const nx = await getText(buildUrl(page + 1), {}, 1);
                if (nx.status === 200 && /\/vod\/play\/id\/\d+/.test(nx.text)) pagecount = page + 1;
            } catch { /* ignore */ }
        }
        return { page, pagecount, list };
    } catch (e) {
        return { page, pagecount: page, list: [] };
    }
}

/* ---------------- 自检 ---------------- */
async function debug(inReq) {
    const c = cfg(inReq);
    const raw = (inReq.body && inReq.body.id) || (inReq.query && inReq.query.id) || '';
    const p = parseVodId(raw);
    const out = { site: c.site, proxy: c.proxy, decrypt: c.decrypt, parsed: p, steps: [] };
    if (!p) { out.steps.push('id 解析失败'); return out; }

    try {
        const u = playPageUrl(c.site, p.id, p.sid, p.nid);
        const r = await getText(u, {}, 2);
        out.steps.push({ step: 'play页', url: u, status: r.status, bytes: r.text.length });
        const d = parsePlayer(r.text);
        out.steps.push({ step: 'player_aaaa', found: !!d, url: d ? d.url : '', from: d ? d.from : '' });
        if (!d || !d.url) return out;

        const m3u = String(d.url).replace(/\\\//g, '/');
        const mr = await httpGet(m3u, { headers: { 'User-Agent': UA, Referer: c.site + '/' } });
        const text = mr.body.toString('utf8');
        out.steps.push({ step: 'm3u8', status: mr.status, bytes: mr.body.length, isPlaylist: isM3u8(m3u, text) });
        const enc = /#EXT-X-KEY:METHOD=AES-128/i.test(text);
        out.steps.push({ step: '加密', aes128: enc });
        const segs = text.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
        out.steps.push({ step: '分片数', count: segs.length, first: segs[0] || '' });
        if (segs.length) {
            const first = absUrl(segs[0], m3u8Base(m3u));
            const sr = await httpGet(first, { headers: { 'User-Agent': UA, Referer: c.site + '/' } });
            out.steps.push({ step: '首个分片', status: sr.status, bytes: sr.body.length, syncByte: sr.body.length && !enc ? sr.body[0].toString(16) : 'encrypted' });
        }
        const eps = await collectEpisodes(c.site, p.id, p.sid, Math.min(30, c.maxEpisodes));
        out.steps.push({ step: '集数探测', count: eps.episodes.length, nids: eps.episodes.map(e => e.nid).slice(0, 30) });
    } catch (e) {
        out.steps.push({ step: 'error', message: e.message });
    }
    return out;
}

export default {
    meta: { key: 'huoporn', name: '🍒 HuoPorn', type: 3 },
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
