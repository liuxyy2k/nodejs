import { load } from 'cheerio';
import req from '../../util/req.js';
import crypto from 'crypto';
import http from 'http';

/**
 * 好色TV 解析插件  (meta.type = 3)
 *
 * 站点：ceiling.monkfbnn.cc（同 CMS 系站点可在 ext 里改域名，自动兼容）
 *
 * 站点结构（实测）：
 *   成人视频   /video/            最新；/video/?sort=hot 最热；分页 /video/page/N/
 *   精选分类   /tag/              分类目录；/tag/{名称}/ 列表；分页 /tag/{名称}/page/N/
 *   好色短剧   /drama/            列表；/drama/{id}/ 详情(多集)；/drama/{id}/episode/{n}/ 单集播放页
 *   好色黑料   /gossip/           图文；/gossip/{id}/
 *   搜索       /search/{关键词}/  分页 /search/{关键词}/page/N/
 *
 * 列表页有两种皮肤（同站混用，必须都认）：
 *   皮肤A  li.all-video-card         /video/ 用
 *   皮肤B  article.video-card-v2     /tag/、/search/ 用
 *
 * 片源：
 *   详情页 <video data-url="https://xxx.m3u8?auth_key=...">
 *   HLS + AES-128，key 与分片都在另一台 CDN 上；**不带 Referer 也能拉**，无需 Cookie。
 *   ⚠ auth_key 是详情页每次渲染时现签的，所以 play() 必须实时回源取地址，
 *     绝不能用详情里缓存下来的老地址（放几小时就 403）。
 *
 * 播放默认 direct：直接给播放器上游 m3u8 地址（省资源、无转发瓶颈）。
 * 播放器不支持带 header / 不支持 AES / 网络到不了 CDN 时，ext 里设 proxy=local 走插件内置 HTTP 代理。
 *
 * ext 可选配置：
 *   site        覆盖站点域名，如 https://别的镜像.cc
 *   proxy       auto(默认) | direct | local
 *   proxyHost   播放器访问不到壳子给的 Host 时手填局域网 IP
 *   proxyPort   固定本地代理端口
 *   decrypt     1 = 本地代理把 AES-128 分片解成明文 TS（仅 proxy=local 生效）
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const DEFAULT_SITE = 'https://ceiling.monkfbnn.cc';
const PORT = process.env.DEV_HTTP_PORT || 9988;

let site = DEFAULT_SITE;
const cfg = { proxy: 'auto', proxyHost: '', proxyPort: 0, decrypt: 0 };

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
    return String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

/** 站内地址一律记成「路径」，避免域名换镜像后 id 全部失效 */
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

/* ────────────────────────────── 请求层 ────────────────────────────── */

async function request(url, opts = {}) {
    const { referer = site + '/', retries = 3, binary = false } = opts;
    let lastErr = null;
    for (let i = 0; i <= retries; i++) {
        try {
            const resp = await req.get(url, {
                headers: {
                    'User-Agent': UA,
                    Referer: referer,
                    Accept: binary ? '*/*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
                },
                timeout: 30000,
                responseType: binary ? 'arraybuffer' : 'text',
                validateStatus: () => true,
            });
            const status = (resp && (resp.status || resp.statusCode)) || 200;
            // 站点有软限流：429/502/503 常见，退避重试；有 Retry-After 就按它等
            if ((status === 429 || status === 502 || status === 503) && i < retries) {
                const ra = parseInt(((resp && resp.headers) || {})['retry-after'], 10);
                await sleep((ra > 0 ? ra * 1000 : 1500 * (i + 1)));
                continue;
            }
            return { status, data: resp ? resp.data : '', headers: (resp && resp.headers) || {} };
        } catch (e) {
            lastErr = e;
            if (i < retries) { await sleep(800 * (i + 1)); continue; }
        }
    }
    throw lastErr || new Error('request failed: ' + url);
}

async function requestHtml(url, referer) {
    const r = await request(url, { referer });
    if (r.status >= 400) throw new Error('HTTP ' + r.status + ' ' + url);
    return typeof r.data === 'string' ? r.data : Buffer.from(r.data || '').toString('utf-8');
}

/* ────────────────────────────── 图片 ────────────────────────────── */

function getProxyBase(inReq) {
    const prefix = (inReq && inReq.server && inReq.server.prefix) || '/spider/haosetv/3';
    const host = String(
        (inReq && inReq.headers && (inReq.headers['x-forwarded-host'] || inReq.headers.host)) || ''
    ).split(',')[0].trim();
    if (host) {
        const proto = String((inReq && inReq.headers && inReq.headers['x-forwarded-proto']) || 'http').split(',')[0].trim();
        return `${proto}://${host}${prefix}`;
    }
    return `http://127.0.0.1:${PORT}${prefix}`;
}

function pickPic(url) {
    let u = String(url || '').trim();
    const m = u.match(/loadBannerDirect\('([^']*)'/);
    if (m) u = m[1];
    return absUrl(u);
}

/** 封面走本地代理：部分手机端/盒子对 CDN 域名有拦截，且能顺带吃掉 404 空图 */
function proxyPic(url, inReq) {
    const fixed = pickPic(url);
    if (!fixed || !/^https?:\/\//i.test(fixed)) return '';
    return `${getProxyBase(inReq)}/img?url=${encodeURIComponent(e64(fixed))}`;
}

function aesDecrypt(buf) {
    const key = Buffer.from('f5d965df75336270');
    const iv = Buffer.from('97b60394abc2fbe1');
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    return Buffer.concat([decipher.update(buf), decipher.final()]);
}

async function imgProxy(inReq, reply) {
    try {
        let raw = d64(inReq.query.url);
        const match = raw.match(/loadBannerDirect\('([^']*)'/);
        if (match) raw = match[1];
        if (!raw) return reply.code(404).send('');

        const resp = await req.get(raw, {
            headers: {
                'User-Agent': UA,
                Referer: `${site}/`,
                Origin: site,
            },
            timeout: 10000,
            responseType: 'arraybuffer',
            validateStatus: () => true,
        });
        if (resp.status !== 200 || !resp.data?.byteLength) return reply.code(resp.status || 502).send('');

        const decrypted = aesDecrypt(Buffer.from(resp.data));
        let ct = 'image/jpeg';
        if (decrypted[0] === 0x89 && decrypted[1] === 0x50) ct = 'image/png';
        else if (decrypted.slice(0, 4).toString() === 'GIF8') ct = 'image/gif';

        reply.header('Access-Control-Allow-Origin', '*');
        return reply.header('Content-Type', ct).send(decrypted);
    } catch (e) {
        console.error('seqinghub imgProxy error:', e.message);
        return reply.code(500).send('');
    }
}

/* ────────────────────────────── 列表解析 ────────────────────────────── */

/** 皮肤A：/video/ 用的 li.all-video-card */
function parseSkinA($, push) {
    $('li.all-video-card').each((_, el) => {
        const node = $(el);
        const a = node.find('a.all-video-card__link, a.poster, a[href*="/video/"]').first();
        const href = a.attr('href') || '';
        if (!href) return;
        const img = node.find('img').first();
        const pic = img.attr('data-src') || img.attr('data-original') || img.attr('data-fallback-src') || img.attr('src') || '';
        const name = (node.find('h2.all-video-card__title').first().text() || a.attr('title') || img.attr('alt') || '').trim();
        const remarks = node.find('.all-video-card__badge--time').first().text().trim();
        push({ href, pic, name, remarks });
    });
}

/** 皮肤B：/tag/、/search/ 用的 article.video-card-v2 */
function parseSkinB($, push) {
    $('article.video-card-v2').each((_, el) => {
        const node = $(el);
        const a = node.find('a.poster, a[href*="/video/"]').first();
        const href = a.attr('href') || '';
        if (!href) return;
        const img = node.find('img').first();
        const pic = img.attr('data-src') || img.attr('data-original') || img.attr('data-fallback-src') || img.attr('src') || '';
        const name = (
            node.find('.video-card-v2__title').first().text() ||
            a.attr('title') ||
            img.attr('alt') ||
            ''
        ).trim();
        const remarks = node.find('.video-card-v2__duration').first().text().trim();
        push({ href, pic, name, remarks });
    });
}

/** 短剧列表 a.drama-card */
function parseDrama($, push) {
    $('a.drama-card').each((_, el) => {
        const node = $(el);
        const href = node.attr('href') || '';
        if (!href || !/^\/drama\/\d+\/?$/.test(href)) return;   // 广告卡的 class 是 home-drama-ad__card，已排除
        const img = node.find('img').first();
        const pic = img.attr('data-src') || img.attr('data-original') || img.attr('data-fallback-src') || img.attr('src') || '';
        const name = (
            node.find('.drama-card__title, .home-drama-card__title').first().text() ||
            node.attr('title') ||
            img.attr('alt') ||
            ''
        ).trim();
        const remarks = node.find('.drama-card__eps, .drama-card__state').first().text().trim();
        push({ href, pic, name, remarks });
    });
}

/** 黑料列表 article.gossip-card */
function parseGossip($, push) {
    $('article.gossip-card').each((_, el) => {
        const node = $(el);
        const a = node.find('a.gossip-card__cover').first();
        const href = a.attr('href') || node.find('h2 a').first().attr('href') || '';
        if (!href) return;
        const img = node.find('img').first();
        const pic = img.attr('data-src') || img.attr('data-original') || img.attr('data-fallback-src') || img.attr('src') || '';
        const name = (node.find('h2 a').first().text() || a.attr('title') || img.attr('alt') || '').trim();
        const remarks = node.find('.gossip-card__meta span').first().text().trim();
        push({ href, pic, name, remarks });
    });
}

function parseVods(html, inReq) {
    const $ = load(html);
    const seen = new Set();
    const list = [];

    const push = (item) => {
        const href = String(item.href || '').trim();
        if (!href || href.startsWith('http')) return;                 // 广告卡外链直接丢
        if (seen.has(href)) return;
        const name = stripTags(item.name);
        if (!name) return;
        seen.add(href);
        list.push({
            vod_id: toPath(href),
            vod_name: name,
            vod_pic: proxyPic(item.pic, inReq),
            vod_remarks: stripTags(item.remarks) || '',
        });
    };

    parseSkinA($, push);
    parseSkinB($, push);
    parseDrama($, push);
    parseGossip($, push);
    return list;
}

/** 总页数：优先 pager 的 "1/7611"，其次列表条的 "第 1/7611 页"，最后看 input max */
function parsePageCount(html, page, listLen) {
    const text = String(html || '');
    const patterns = [
        /site-pager__count"[^>]*>\s*(\d+)\s*\/\s*(\d+)/,
        /第\s*(\d+)\s*\/\s*(\d+)\s*页/,
        /max="(\d+)"[^>]*value="\d+"/,
        /\/\s*(\d+)\s*<\/span>\s*<\/div>\s*<div class="site-pager__steps"/,
    ];
    for (const re of patterns) {
        const m = text.match(re);
        if (m) {
            const total = parseInt(m[2] || m[1], 10);
            if (total > 0) return Math.max(total, page);
        }
    }
    return listLen > 0 ? page + 1 : page;
}

/* ────────────────────────────── 地址构造 ────────────────────────────── */

/** 从页面 pager 上读出这一栏的分页模板（站点有两种：path 和 number） */
function pagerUrl(html, page) {
    const t = String(html || '');
    if (page <= 1) return '';
    const baseAttr = t.match(/data-page-base-url="([^"]+)"/);
    if (baseAttr) return absUrl(baseAttr[1].replace(/\/?$/, '/') + page + '/');
    const firstAttr = t.match(/data-first-url="([^"]+)"/);
    if (firstAttr) return absUrl(firstAttr[1].replace(/\/?$/, '/') + 'page/' + page + '/');
    const next = t.match(/<a[^>]+href="([^"]+)"[^>]*rel="next"/i) || t.match(/<a[^>]+rel="next"[^>]*href="([^"]+)"/i);
    if (next) {
        const tmpl = next[1].replace(/(\d+)(\/?)$/, '__P__$2');
        return absUrl(tmpl.replace('__P__', String(page)));
    }
    return '';
}

/** 每个栏目实测可用的分页格式（同 CMS 的镜像站也照这套）：按顺序试，抓不到再换下一种 */
function listUrlCandidates(tid, page, filters) {
    const id = String(tid || 'video').trim().replace(/^\/+/, '').replace(/\/+$/, '');
    const sort = String((filters && filters.sort) || '').trim();
    const hot = id === 'video/hot' || sort === 'hot';

    if (id.startsWith('tag/')) {
        const name = id.slice(4);
        const base = '/tag/' + name + '/';
        if (page <= 1) return [absUrl(base)];
        return [
            absUrl(base + 'video/' + page + '/'),   // 实测格式
            absUrl(base + 'page/' + page + '/'),    // 旧格式兜底
        ];
    }
    if (id === 'drama') return page <= 1 ? [absUrl('/drama/')] : [absUrl('/drama/page/' + page + '/')];
    if (id === 'gossip') return page <= 1 ? [absUrl('/gossip/')] : [absUrl('/gossip/page/' + page + '/')];
    if (id === 'video' || id === 'video/hot') {
        if (page <= 1) return [absUrl('/video/' + (hot ? '?sort=hot' : ''))];
        return [absUrl('/video/page/' + page + '/' + (hot ? '?sort=hot' : ''))];
    }
    return page <= 1 ? [absUrl('/' + id + '/')] : [absUrl('/' + id + '/page/' + page + '/')];
}

async function fetchList(tid, page, filters, inReq) {
    const cands = listUrlCandidates(tid, page, filters);
    let lastHtml = '';
    for (const url of cands) {
        let html = '';
        try {
            html = await requestHtml(url);
        } catch {
            continue;                       // 404/超时就换下一种地址格式，不往上抛
        }
        const list = parseVods(html, inReq);
        lastHtml = html;
        if (list.length) return { html, list, url };
    }
    // 全落空：拿第一页的 pager 模板再试一次
    if (page > 1) {
        try {
            const firstUrl = listUrlCandidates(tid, 1, filters)[0];
            const firstHtml = await requestHtml(firstUrl);
            const tmplUrl = pagerUrl(firstHtml, page);
            if (tmplUrl && !cands.includes(tmplUrl)) {
                const html = await requestHtml(tmplUrl);
                const list = parseVods(html, inReq);
                if (list.length) return { html, list, url: tmplUrl };
            }
        } catch { /* ignore */ }
    }
    return { html: lastHtml, list: [], url: cands[0] };
}

/* ────────────────────────────── 详情 / 片源 ────────────────────────────── */

function extractPlayUrl(html) {
    const text = String(html || '');
    // 1) 详情页 <video data-url="..."> —— 主源（H264）
    let m = text.match(/<video[^>]*\sdata-url="([^"]+)"/i);
    if (m && /\.m3u8/i.test(m[1])) return m[1].replace(/&amp;/g, '&');
    // 2) HEVC 源（部分作品才有，转码完才非空）
    m = text.match(/data-url-hevc="([^"]*\.m3u8[^"]*)"/i);
    if (m) return m[1].replace(/&amp;/g, '&');
    // 3) 兜底：正文里任何 m3u8
    m = text.match(/https?:\/\/[^"'\s\\<>]+\.m3u8[^"'\s\\<>]*/i);
    if (m) return m[0].replace(/&amp;/g, '&');
    // 4) ld+json
    const block = text.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
    if (block) {
        try {
            const data = JSON.parse(block[1].trim());
            const graph = data['@graph'] || [data];
            for (const item of graph) {
                if (item && item.contentUrl) return absUrl(item.contentUrl);
                if (item && item.embedUrl) return absUrl(item.embedUrl);
            }
        } catch { /* ignore */ }
    }
    return '';
}

function extractTitle($) {
    const raw = ($('meta[property="og:title"]').attr('content') || $('h1').first().text() || '').trim();
    // 后缀可能叠两层："... - 好色黑料 - 好色TV"，循环剥干净
    let t = raw;
    for (let i = 0; i < 4; i++) {
        const next = t.replace(/\s*[-\u2013\u2014|_]\s*好色[^\s]{0,6}\s*$/i, '').trim();
        if (next === t || !next) break;
        t = next;
    }
    return t || raw;
}

function extractDramaEpisodes($) {
    const eps = [];
    const seen = new Set();
    $('a[href*="/episode/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/^(\/drama\/\d+\/episode\/(\d+))\/?$/);
        if (!m || seen.has(m[1])) return;
        seen.add(m[1]);
        const label = ($(el).attr('title') || $(el).find('strong').first().text() || m[2]).trim();
        eps.push({ url: m[1] + '/', label: '第' + label + '集' });
    });
    eps.sort((a, b) => {
        const na = parseInt(String(a.url).match(/episode\/(\d+)/)[1], 10);
        const nb = parseInt(String(b.url).match(/episode\/(\d+)/)[1], 10);
        return na - nb;
    });
    return eps;
}

function buildPlayUrlText(eps, fallbackUrl) {
    if (eps.length) {
        return eps.map((e) => `${e.label}$${e.url}`).join('#');
    }
    if (fallbackUrl) return `正片$${toPath(fallbackUrl)}`;
    return '';
}

/* ────────────────────────────── 播放：本地代理（可选） ────────────────────────────── */

const sessions = new Map();
let proxyServer = null;
let proxyPort = 0;

function newSessionId() {
    return crypto.randomBytes(6).toString('hex');
}

function ensureProxy() {
    if (proxyServer) return proxyServer;
    proxyServer = http.createServer(async (rq, rs) => {
        const cors = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
        };
        if (rq.method === 'OPTIONS') { rs.writeHead(204, cors); return rs.end(); }
        try {
            const u = new URL(rq.url, 'http://127.0.0.1');
            const m = u.pathname.match(/^\/hs\/([0-9a-f]+)\/(playlist\.m3u8|key|seg\/\d+)$/);
            const sess = m ? sessions.get(m[1]) : null;
            if (!sess) { rs.writeHead(404, cors); return rs.end('no session'); }

            if (m[2] === 'playlist.m3u8') {
                const r = await request(sess.src, { binary: false, retries: 2 });
                if (r.status !== 200) { rs.writeHead(502, cors); return rs.end('upstream ' + r.status); }
                const txt = typeof r.data === 'string' ? r.data : Buffer.from(r.data).toString('utf-8');
                const out = rewritePlaylist(txt, sess, m[1], rq.headers.host || ('127.0.0.1:' + proxyPort));
                if (cfg.decrypt === 1 && sess.keyUrl && !sess.keyBuf) {
                    try {
                        const kr = await request(sess.keyUrl, { binary: true, retries: 2 });
                        if (kr.status === 200 && kr.data) sess.keyBuf = Buffer.from(kr.data);
                    } catch { /* 拿不到 key 就原样透传，播放器自己解 */ }
                }
                rs.writeHead(200, { ...cors, 'Content-Type': 'application/vnd.apple.mpegurl' });
                return rs.end(out);
            }

            if (m[2] === 'key') {
                if (!sess.keyUrl) { rs.writeHead(404, cors); return rs.end('no key'); }
                const r = await request(sess.keyUrl, { binary: true, retries: 2 });
                if (r.status !== 200) { rs.writeHead(502, cors); return rs.end('upstream ' + r.status); }
                rs.writeHead(200, { ...cors, 'Content-Type': 'application/octet-stream' });
                return rs.end(Buffer.from(r.data));
            }

            const idx = parseInt(m[2].split('/')[1], 10);
            const seg = sess.segs[idx];
            if (!seg) { rs.writeHead(404, cors); return rs.end('no seg'); }
            const r = await request(seg, { binary: true, retries: 2 });
            if (r.status !== 200) { rs.writeHead(502, cors); return rs.end('upstream ' + r.status); }
            let buf = Buffer.from(r.data);
            if (cfg.decrypt === 1 && sess.keyBuf) buf = aesDecryptSeg(buf, sess.keyBuf, sess.iv);
            rs.writeHead(200, { ...cors, 'Content-Type': 'video/mp2t', 'Content-Length': buf.length });
            return rs.end(buf);
        } catch (e) {
            rs.writeHead(500, cors);
            return rs.end(String((e && e.message) || 'err'));
        }
    });
    proxyServer.on('error', (e) => { console.error('haosetv proxy error:', e.message); proxyServer = null; });
    proxyPort = cfg.proxyPort || 0;
    proxyServer.listen(proxyPort, '0.0.0.0');
    proxyServer.on('listening', () => { proxyPort = proxyServer.address().port; });
    return proxyServer;
}

function aesDecryptSeg(buf, key, iv) {
    try {
        const ivBuf = (iv && iv.length === 16) ? iv : Buffer.alloc(16, 0);
        const d = crypto.createDecipheriv('aes-128-cbc', key, ivBuf);
        return Buffer.concat([d.update(buf), d.final()]);
    } catch {
        return buf;
    }
}

function rewritePlaylist(text, sess, sid, host) {
    const lines = String(text || '').split(/\r?\n/);
    const out = [];
    for (const line of lines) {
        const t = line.trim();
        if (!t) { out.push(line); continue; }
        if (t.startsWith('#EXT-X-KEY')) {
            if (/METHOD=AES-128/i.test(t)) {
                const m = t.match(/URI="([^"]+)"/i);
                if (m) sess.keyUrl = m[1].replace(/&amp;/g, '&');
                const ivm = t.match(/IV=0x([0-9a-fA-F]+)/i);
                if (ivm) sess.iv = Buffer.from(ivm[1].padEnd(32, '0').slice(0, 32), 'hex');
                // 解密模式：分片已经还原成明文 TS，再挂 KEY 会被播放器二次解密，必须去掉
                if (cfg.decrypt === 1) continue;
                out.push(t.replace(/URI="[^"]*"/i, `URI="http://${host}/hs/${sid}/key"`));
                continue;
            }
            out.push(t);
            continue;
        }
        if (t.startsWith('#')) { out.push(t); continue; }
        const idx = sess.segs.length;
        sess.segs.push(absUrl(t));
        out.push(`http://${host}/hs/${sid}/seg/${idx}`);
    }
    return out.join('\n');
}

/** 播放器访问插件时用的主机名（壳子可能跑在盒子/NAS/容器里，不能写死） */
function clientHost(inReq, port) {
    const h = String(
        (inReq && inReq.headers && (inReq.headers['x-forwarded-host'] || inReq.headers.host)) || ''
    ).split(',')[0].trim();
    const name = (cfg.proxyHost || h.split(':')[0] || '127.0.0.1').trim();
    return name + ':' + port;
}

/* ────────────────────────────── 壳子接口 ────────────────────────────── */

async function init(inReq) {
    const body = (inReq && inReq.body) || {};
    const ext = String(body.ext || body.extend || '').trim();
    if (/^https?:\/\//i.test(ext)) site = ext.replace(/\/+$/, '');

    // ext 里也可能塞 JSON：{"site":"...","proxy":"local"}
    if (ext.startsWith('{')) {
        try {
            const j = JSON.parse(ext);
            if (j.site && /^https?:\/\//i.test(j.site)) site = String(j.site).replace(/\/+$/, '');
            if (j.proxy) cfg.proxy = String(j.proxy);
            if (j.proxyHost) cfg.proxyHost = String(j.proxyHost);
            if (j.proxyPort) cfg.proxyPort = parseInt(j.proxyPort, 10) || 0;
            if (j.decrypt) cfg.decrypt = parseInt(j.decrypt, 10) || 0;
        } catch { /* ignore */ }
    }
    return {};
}

const STATIC_CLASSES = [
    { type_id: 'video', type_name: '最新视频' },
    { type_id: 'video/hot', type_name: '最热视频' },
    { type_id: 'drama', type_name: '好色短剧' },
    { type_id: 'gossip', type_name: '好色黑料' },
];

const FALLBACK_TAGS = [
    { type_id: 'tag/中文传媒', type_name: '中文传媒' },
    { type_id: 'tag/日本', type_name: '日本' },
    { type_id: 'tag/无码', type_name: '无码' },
    { type_id: 'tag/巨乳', type_name: '巨乳' },
    { type_id: 'tag/人妻', type_name: '人妻' },
    { type_id: 'tag/自拍', type_name: '自拍' },
    { type_id: 'tag/中文字幕', type_name: '中文字幕' },
    { type_id: 'tag/AV', type_name: 'AV' },
];

let tagCache = { at: 0, list: [] };

async function loadTags() {
    if (tagCache.list.length && Date.now() - tagCache.at < 30 * 60 * 1000) return tagCache.list;
    try {
        const list = [];
        const seen = new Set();
        // 分类目录是路径式分页，先把总页数探出来，一页页抓全
        const first = await requestHtml(absUrl('/tag/'));
        const totalPage = Math.min(parsePageCount(first, 1, 1), 10);
        const pages = [first];
        for (let p = 2; p <= totalPage; p++) {
            try {
                await sleep(700);          // 站点有软限流，连抓太快会 429
                pages.push(await requestHtml(absUrl('/tag/page/' + p + '/')));
            } catch { /* 某页失败不影响整体 */ }
        }
        for (const html of pages) {
            const $ = load(html);
            $('a.tag-catalog__card, a[href*="/tag/"]').each((_, el) => {
                const href = $(el).attr('href') || '';
                const m = href.match(/^\/tag\/([^\/]+)\/?$/);
                if (!m) return;
                // 名称只在 h2 里，不能拿整块 text（会把「N 部」和简介一起抓进来）
                const name = stripTags($(el).find('h2').first().text() || $(el).attr('title') || '');
                const key = decodeURIComponent(m[1]);
                if (!name || seen.has(key)) return;
                seen.add(key);
                list.push({ type_id: 'tag/' + key, type_name: name.slice(0, 14) });
            });
        }
        if (list.length > 4) tagCache = { at: Date.now(), list };
        return list.length > 4 ? list : FALLBACK_TAGS;
    } catch {
        return FALLBACK_TAGS.length ? FALLBACK_TAGS : [];
    }
}

async function home() {
    const tags = await loadTags();
    const classes = [...STATIC_CLASSES, ...tags];
    return {
        class: classes,
        filters: {
            video: [{ key: 'sort', name: '排序', init: 'latest', value: [{ n: '最新', v: 'latest' }, { n: '最热', v: 'hot' }] }],
            'video/hot': [{ key: 'sort', name: '排序', init: 'hot', value: [{ n: '最新', v: 'latest' }, { n: '最热', v: 'hot' }] }],
        },
    };
}

async function category(inReq) {
    const body = (inReq && inReq.body) || {};
    const page = Math.max(1, parseInt(body.page || body.pg || 1, 10) || 1);
    let filters = body.filters || {};
    if (typeof filters === 'string') {
        try { filters = JSON.parse(filters); } catch { filters = {}; }
    }
    const { html, list } = await fetchList(body.id || body.tid || 'video', page, filters, inReq);
    if (!list.length && page > 1) {
        // 深页抓空通常是被限流，退回第一页比给空列表好
        try {
            const first = await fetchList(body.id || body.tid || 'video', 1, filters, inReq);
            if (first.list.length) return { page: 1, pagecount: parsePageCount(first.html, 1, first.list.length), list: first.list };
        } catch { /* ignore */ }
    }
    return { page, pagecount: parsePageCount(html, page, list.length), list };
}

async function detail(inReq) {
    const body = (inReq && inReq.body) || {};
    const rawId = String(body.id || body.vod_id || '').trim();
    if (!rawId) return { list: [] };
    const url = absUrl(toPath(rawId));

    const html = await requestHtml(url, url);
    const $ = load(html);
    const name = extractTitle($) || '未知标题';

    // 短剧：一个详情页挂多集
    if (/\/drama\/\d+\/?$/.test(toPath(rawId))) {
        const eps = extractDramaEpisodes($);
        const pic = proxyPic($('meta[property="og:image"]').attr('content') || $('.drama-d-poster img, img').first().attr('data-src'), inReq);
        const content = $('meta[property="og:description"]').attr('content') || $('.drama-d-desc, .drama-d-intro').text().trim() || '';
        return {
            list: [{
                vod_id: toPath(rawId),
                vod_name: name,
                vod_pic: pic,
                vod_content: stripTags(content),
                vod_remarks: eps.length ? `共${eps.length}集` : '',
                vod_play_from: '好色短剧',
                vod_play_url: buildPlayUrlText(eps, ''),
            }],
        };
    }

    // 黑料：图文，没有播放源，但保留详情内容
    if (/\/gossip\/\d+\/?$/.test(toPath(rawId))) {
        const pic = proxyPic($('meta[property="og:image"]').attr('content') || '', inReq);
        const content = $('.gossip-d-body, .gossip-detail__body, article').first().text().trim()
            || $('meta[property="og:description"]').attr('content') || '';
        return {
            list: [{
                vod_id: toPath(rawId),
                vod_name: name,
                vod_pic: pic,
                vod_content: stripTags(content).slice(0, 500),
                vod_remarks: '图文',
                vod_play_from: '好色TV',
                vod_play_url: '',
            }],
        };
    }

    // 普通视频
    const pic = proxyPic(
        $('meta[property="og:image"]').attr('content') ||
        $('video').attr('poster') ||
        $('.detail-page-v2__player img, img').first().attr('data-src') ||
        '',
        inReq
    );
    const content = $('meta[property="og:description"]').attr('content') || '';
    const playUrl = extractPlayUrl(html);
    const dur = $('.video-detail__meta, .detail-page-v2__meta').first().text().trim();

    return {
        list: [{
            vod_id: toPath(rawId),
            vod_name: name,
            vod_pic: pic,
            vod_content: stripTags(content),
            vod_remarks: stripTags(dur).slice(0, 30),
            vod_play_from: '好色TV',
            vod_play_url: playUrl ? `正片$${toPath(rawId)}` : '',
        }],
    };
}

/**
 * 播放：**每次实时回源详情页**取带新 auth_key 的 m3u8。
 * 站点签名是渲染时现签的，缓存下来的地址放几小时就会 403 —— 这是这个站最容易黑屏的地方。
 */
async function play(inReq) {
    const body = (inReq && inReq.body) || {};
    const rawId = String(body.id || body.url || '').trim();
    if (!rawId) return { parse: 0, url: '', header: {} };

    // 已经是 m3u8 直链
    if (/\.m3u8/i.test(rawId) && /^https?:\/\//i.test(rawId)) {
        return { parse: 0, url: rawId, header: { 'User-Agent': UA, Referer: site + '/' } };
    }

    const path = toPath(rawId);
    const target = absUrl(path);

    let html = '';
    try {
        html = await requestHtml(target, target);
    } catch (e) {
        console.error('haosetv play fetch error:', e && e.message);
        return { parse: 0, url: '', header: {} };
    }

    const m3u8 = extractPlayUrl(html);
    if (!m3u8) return { parse: 0, url: '', header: {} };

    const mode = String(cfg.proxy || 'auto').toLowerCase();
    if (mode === 'local' || mode === 'proxy') {
        try {
            ensureProxy();
            // 等端口就绪
            for (let i = 0; i < 30 && !proxyPort; i++) await sleep(50);
            if (!proxyPort) throw new Error('proxy not ready');

            const sid = newSessionId();
            sessions.set(sid, { src: m3u8, segs: [], keyUrl: '', keyBuf: null, iv: null, at: Date.now() });
            // 清掉 1 小时前的会话
            for (const [k, v] of sessions) if (Date.now() - v.at > 3600 * 1000) sessions.delete(k);

            const base = `http://${clientHost(inReq, proxyPort)}/hs/${sid}/playlist.m3u8`;
            return { parse: 0, url: base, header: {} };
        } catch (e) {
            console.error('haosetv proxy fallback:', e && e.message);
            // 代理起不来就退直连
        }
    }

    return { parse: 0, url: m3u8, header: { 'User-Agent': UA, Referer: site + '/' } };
}

async function search(inReq) {
    const body = (inReq && inReq.body) || {};
    const wd = String(body.wd || body.keyword || '').trim();
    if (!wd) return { list: [] };
    const page = Math.max(1, parseInt(body.page || body.pg || 1, 10) || 1);

    const enc = encodeURIComponent(wd);
    const cands = page > 1
        ? [absUrl('/search/' + enc + '/page/' + page + '/'), absUrl('/search/' + enc + '/' + page + '/')]
        : [absUrl('/search/' + enc + '/')];

    let html = '';
    let list = [];
    for (const url of cands) {
        html = await requestHtml(url);
        list = parseVods(html, inReq);
        if (list.length) break;
    }
    return { page, pagecount: parsePageCount(html, page, list.length), list };
}

/** 自检：一条命令看清断在哪 */
async function debug(inReq) {
    const body = (inReq && inReq.body) || {};
    const id = String(body.id || body.vod_id || '').trim();
    const out = {
        site,
        proxyMode: cfg.proxy,
        localProxy: { running: !!proxyServer, port: proxyPort },
        lastPlay: null,
        probe: null,
    };
    if (!id) return out;

    const path = toPath(id);
    const target = absUrl(path);
    out.target = target;
    try {
        const t0 = Date.now();
        const r = await request(target, { referer: target });
        const html = typeof r.data === 'string' ? r.data : '';
        out.probe = {
            status: r.status,
            bytes: Buffer.byteLength(html),
            ms: Date.now() - t0,
            isBlockPage: /人机|验证|Just a moment|cf-browser/i.test(html.slice(0, 3000)),
        };
        const m3u8 = extractPlayUrl(html);
        out.lastPlay = { picked: m3u8 ? 'direct' : 'none', m3u8: m3u8 || '' };
        if (m3u8) {
            const t1 = Date.now();
            const pr = await request(m3u8, { referer: site + '/', binary: false, retries: 1 });
            const txt = typeof pr.data === 'string' ? pr.data : '';
            const segs = (txt.match(/\.ts\?/g) || []).length;
            const keyM = txt.match(/URI="([^"]+)"/);
            out.probe.playlist = {
                status: pr.status,
                bytes: Buffer.byteLength(txt),
                ms: Date.now() - t1,
                isMaster: /#EXT-X-STREAM-INF/i.test(txt),
                segs,
                encrypted: /METHOD=AES-128/i.test(txt),
                keyUrl: keyM ? keyM[1] : '',
            };
            if (segs && keyM) {
                const kr = await request(keyM[1], { binary: true, retries: 1 });
                out.probe.key = { status: kr.status, bytes: kr.data ? Buffer.from(kr.data).length : 0 };
            }
            const firstSeg = txt.split(/\r?\n/).find((l) => /^https?:\/\/.*\.ts/.test(l.trim()));
            if (firstSeg) {
                const sr = await request(firstSeg.trim(), { binary: true, retries: 1 });
                out.probe.segment = { status: sr.status, bytes: sr.data ? Buffer.from(sr.data).length : 0 };
            }
        }
    } catch (e) {
        out.probe = { error: String((e && e.message) || e) };
    }
    return out;
}

export default {
    meta: { key: 'haosetv', name: '💋好色TV', type: 3 },
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
