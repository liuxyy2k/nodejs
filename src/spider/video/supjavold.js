import { load } from 'cheerio';
import req from '../../util/req.js';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const SITE_ROOT = 'https://supjav.com';
const site = `${SITE_ROOT}/zh`;
const LK_BASE = 'https://lk1.supremejav.com/supjav.php';
const META_KEY = 'supjav';
const LINE_ORDER = { VOE: 0, FST: 10, ST: 20, TV: 90 };
const PLAY_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FETCH_WORKER = 'https://supjav-fetch.li768435813.workers.dev';

function spiderBase(inReq) {
    const server = inReq?.server;
    const dynamic = server?.address?.()?.dynamic || 'js2p://_WEB_';
    const prefix = server?.prefix || `/spider/${META_KEY}/3`;
    return `${dynamic}${prefix}`;
}

function proxyM3u8PlayUrl(m3u8Url, referer, inReq) {
    return `${spiderBase(inReq)}/proxy?type=m3u8&url=${encodeURIComponent(m3u8Url)}&referer=${encodeURIComponent(referer || site)}`;
}

function needsM3u8Proxy(url) {
    const low = String(url || '').toLowerCase();
    if (!low.includes('.m3u8')) return false;
    // ST 线路 turbovidhls 直链在客户端可播，其余 m3u8 走本地代理
    return !/turbovidhls\.com/i.test(low);
}

function cleanM3u8(text, m3u8Url, referer, inReq) {
    const lines = String(text || '')
        .replace(/\r/g, '')
        .split('\n');
    const out = [];
    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        if (line.startsWith('#')) {
            out.push(
                line.replace(/URI="([^"]+)"/, (_, u) => {
                    try {
                        return `URI="${new URL(u, m3u8Url).href}"`;
                    } catch {
                        return `URI="${u}"`;
                    }
                }),
            );
            continue;
        }
        try {
            const abs = new URL(line, m3u8Url).href;
            out.push(/\.m3u8/i.test(abs) ? proxyM3u8PlayUrl(abs, referer, inReq) : abs);
        } catch {
            out.push(line);
        }
    }
    return `${out.join('\n')}\n`;
}

async function proxyHandler(inReq, reply) {
    if ((inReq.query?.type || '') !== 'm3u8') {
        reply.code(404).type('text/plain').send('unsupported');
        return;
    }
    const url = inReq.query.url || '';
    const referer = inReq.query.referer || site;
    if (!url) {
        reply.code(400).type('text/plain').send('no url');
        return;
    }
    try {
        const resp = await req.get(url, {
            headers: {
                'User-Agent': UA,
                Referer: referer,
                Accept: '*/*',
            },
            timeout: 20000,
            validateStatus: () => true,
            responseType: 'text',
        });
        const text = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
        if (resp.status !== 200 || !text.includes('#EXTM3U')) {
            reply.redirect(url);
            return;
        }
        reply.type('application/vnd.apple.mpegurl').header('Cache-Control', 'no-cache').send(cleanM3u8(text, url, referer, inReq));
    } catch {
        reply.code(502).type('text/plain').send('proxy error');
    }
}

function buildListUrl(tid, page) {
    const path = String(tid || '').replace(/^\/|\/$/g, '');
    if (!path) {
        return page <= 1 ? `${site}/` : `${site}/page/${page}/`;
    }
    if (path === 'popular') {
        return page <= 1 ? `${site}/popular/` : `${site}/popular/page/${page}/`;
    }
    const base = `${site}/${path}`;
    return page <= 1 ? `${base}/` : `${base.replace(/\/$/, '')}/page/${page}/`;
}

function normalizeDetailUrl(id) {
    const raw = String(id || '').trim();
    if (!raw) return `${site}/`;
    if (/^https?:\/\//i.test(raw)) return raw;
    const slug = raw.replace(/^\//, '').replace(/\.html$/, '');
    if (/^\d+$/.test(slug)) return `${site}/${slug}.html`;
    return slug.endsWith('.html') ? absUrl(slug, SITE_ROOT) : `${site}/${slug}.html`;
}

async function request(targetUrl, referer = '') {
    const resp = await req.get(targetUrl, {
        headers: {
            'User-Agent': UA,
            Referer: referer || `${site}/`,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
        },
        timeout: 30000,
        validateStatus: () => true,
    });
    return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
}

async function fetchText(url, referer = `${site}/`) {
    return request(url, referer);
}

function absUrl(url, base) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    try {
        return new URL(url, base).href;
    } catch {
        return url;
    }
}

// ================= 播放解析（py_supjav 2026-10-22） =================

function reverseStr(s) {
    return String(s || '').split('').reverse().join('');
}

async function httpRaw(url, { headers = {}, timeout = 20000, maxRedirects = 5, responseType = 'text' } = {}) {
    try {
        const r = await req.get(url, {
            headers: { 'User-Agent': PLAY_UA, ...headers },
            timeout,
            maxRedirects,
            responseType,
            validateStatus: () => true,
        });
        let data = r.data;
        if (responseType === 'text' && data != null && typeof data !== 'string') {
            data = typeof data === 'object' ? JSON.stringify(data) : String(data);
        }
        return { status: r.status || 0, headers: r.headers || {}, data };
    } catch {
        return { status: 0, headers: {}, data: responseType === 'arraybuffer' ? null : '' };
    }
}

function locOf(resp) {
    const loc = resp.headers?.location || resp.headers?.Location || '';
    return typeof loc === 'string' ? loc.trim() : '';
}

async function lkResolveEmbed(hex, detailUrl) {
    const gateUrl = `${LK_BASE}?l=${hex}`;
    const navHeaders = {
        Referer: gateUrl,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Sec-Fetch-Dest': 'iframe',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
    };
    const tryC = async (h) => {
        const cUrl = `${LK_BASE}?c=${reverseStr(h)}`;
        const r = await httpRaw(cUrl, { headers: navHeaders, timeout: 15000, maxRedirects: 0 });
        const loc = locOf(r);
        if (loc) {
            try {
                const u = new URL(loc, cUrl);
                u.hash = '';
                return { embedUrl: u.toString() };
            } catch { /* ignore */ }
        }
        const body = String(r.data || '');
        if (body.length > 800 && !/OLID|start_player/.test(body)) return { embedBody: body, embedUrl: cUrl };
        return null;
    };
    for (let i = 0; i < 2; i++) {
        const got = await tryC(hex);
        if (got) return got;
    }
    const gate = await httpRaw(gateUrl, { headers: { Referer: detailUrl, ...navHeaders }, timeout: 15000, maxRedirects: 0 });
    const gateBody = String(gate.data || '');
    const olidM = gateBody.match(/OLID\s*=\s*['"]([0-9a-fA-F]{32,})['"]/) || gateBody.match(/["']([0-9a-fA-F]{32,})["']/);
    if (olidM && olidM[1] && olidM[1] !== hex) {
        const got = await tryC(olidM[1]);
        if (got) return got;
    }
    try {
        const w = await httpRaw(`${FETCH_WORKER}/?u=${encodeURIComponent(`${LK_BASE}?c=${reverseStr(hex)}`)}`, { timeout: 30000, maxRedirects: 0 });
        const finalUrl = w.headers?.['x-final-url'] || '';
        const wbody = String(w.data || '');
        if (finalUrl && !/supjav\.php/.test(finalUrl) && wbody.length > 300) {
            return { embedBody: wbody, embedUrl: finalUrl };
        }
        if (wbody.length > 800 && !/host not allowed|bad url|upstream blocked/.test(wbody) && !/OLID|start_player/.test(wbody)) {
            return { embedBody: wbody, embedUrl: `${LK_BASE}?c=${reverseStr(hex)}` };
        }
    } catch { /* ignore */ }
    return null;
}

function extractStreamUrl(text) {
    const s = String(text || '');
    const m = s.match(/(https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*)/i);
    if (m && !/test-videos/i.test(m[1])) return m[1];
    const trimmed = s.trim();
    if (trimmed.startsWith('{')) {
        try {
            const j = JSON.parse(trimmed);
            const u = j.url || j.file || j.source || j.m3u8 || '';
            if (/^https?:\/\//i.test(u)) return u;
        } catch { /* ignore */ }
    }
    const mm = s.match(/(https?:\/\/[^\s"'<>\\]+\.mp4[^\s"'<>\\]*)/i);
    if (mm) return mm[1];
    return '';
}

async function pickTopVariant(url, headers) {
    if (!/\.m3u8(\?|$)/i.test(url)) return url;
    try {
        const r = await httpRaw(url, { headers, timeout: 20000 });
        const text = String(r.data || '');
        if (!text.includes('#EXT-X-STREAM-INF')) return url;
        const lines = text.split(/\r?\n/);
        let best = null;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line.startsWith('#EXT-X-STREAM-INF')) continue;
            let uri = '';
            for (let j = i + 1; j < lines.length; j++) {
                if (lines[j].trim()) { uri = lines[j].trim(); break; }
            }
            if (!uri) continue;
            const rm = line.match(/RESOLUTION=(\d+)x(\d+)/i);
            const bm = line.match(/BANDWIDTH=(\d+)/i);
            const cand = { uri, h: rm ? parseInt(rm[2], 10) : 0, bw: bm ? parseInt(bm[1], 10) : 0 };
            if (!best || cand.h > best.h || (cand.h === best.h && cand.bw > best.bw)) best = cand;
        }
        if (!best) return url;
        if (/^https?:\/\//i.test(best.uri)) return best.uri;
        return url.slice(0, url.lastIndexOf('/') + 1) + best.uri.replace(/^\.\//, '');
    } catch {
        return url;
    }
}

function playHeadersFor(videoUrl, embedUrl, detailUrl) {
    let ref = detailUrl || `${site}/`;
    if (/cloudwindow-route|ugc-cdn/i.test(videoUrl)) ref = 'https://jeremyparticipantanything.com/';
    else if (embedUrl) ref = embedUrl;
    return { 'User-Agent': PLAY_UA, Referer: ref };
}

function rot13(s) {
    return String(s).replace(/[a-zA-Z]/g, (c) => {
        const b = c <= 'Z' ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0) - b + 13) % 26) + b);
    });
}

function b64d(x) {
    try {
        return Buffer.from(String(x).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    } catch {
        return '';
    }
}

function voeDecode(html) {
    try {
        const m = String(html || '').match(/<script[^>]*type=["']application\/json["'][^>]*>(.*?)<\/script>/s);
        if (!m) return {};
        let raw = m[1].trim();
        try {
            const j = JSON.parse(raw);
            raw = (Array.isArray(j) && j.length) ? String(j[0]) : raw;
        } catch { /* keep */ }
        let s = String(raw);
        for (const k of ['@$', '^^', '~@', '%?', '*~', '!!', '#&']) s = s.split(k).join('_');
        s = s.split('_').join('');
        let tt = b64d(rot13(s));
        let shifted = '';
        for (let i = 0; i < tt.length; i++) shifted += String.fromCharCode(tt.charCodeAt(i) - 3);
        tt = b64d(shifted.split('').reverse().join(''));
        const cfg = JSON.parse(tt);
        return cfg && typeof cfg === 'object' ? cfg : {};
    } catch {
        return {};
    }
}

function unpackPacker(html) {
    const m = String(html || '').match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)\)\)/);
    if (!m) return '';
    let p = m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    const radix = parseInt(m[2], 10);
    const count = parseInt(m[3], 10);
    const keys = m[4].split('|');
    for (let c = count - 1; c >= 0; c--) {
        if (keys[c]) {
            const tok = c.toString(radix).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            p = p.replace(new RegExp(`\\b${tok}\\b`, 'g'), () => keys[c]);
        }
    }
    return p;
}

function hlsFromUnpacked(text) {
    const s = String(text || '');
    const found = [];
    const lm = s.match(/links\s*=\s*(\{[\s\S]*?\});/);
    const scope = lm ? lm[1] : s;
    const re = /["']?(hls\d+)["']?\s*:\s*["'](https?:\/\/[^"']+)["']/g;
    let mm;
    while ((mm = re.exec(scope)) !== null) {
        found.push({ key: mm[1], url: mm[2].replace(/\\\//g, '/') });
    }
    if (!found.length) {
        for (const u of [...s.matchAll(/https?:\/\/[^\s"'<>\\]+\.(?:m3u8|txt)[^\s"'<>\\]*/g)].map((x) => x[0])) {
            found.push({ key: 'hls', url: u });
        }
    }
    const rank = (f) => {
        const isTxt = /\.txt(\?|$)/i.test(f.url);
        const n = parseInt((f.key.match(/\d+/) || ['0'])[0], 10);
        return (isTxt ? 100 : 0) - n;
    };
    found.sort((a, b) => rank(a) - rank(b));
    return found.map((f) => f.url);
}

async function verifyPlaylist(url, headers) {
    const r = await httpRaw(url, { headers, timeout: 20000 });
    const text = String(r.data || '');
    return r.status === 200 && text.includes('#EXTM3U') ? text : '';
}

function evalConcatExpr(expr) {
    const s = String(expr || '');
    let pos = 0;
    const skipWs = () => { while (pos < s.length && /\s/.test(s.charAt(pos))) pos++; };
    const parseStr = () => {
        const q = s.charAt(pos);
        if (q !== '"' && q !== "'") return null;
        pos++;
        let out = '';
        while (pos < s.length) {
            const c = s.charAt(pos);
            if (c === '\\' && pos + 1 < s.length) {
                const n = s.charAt(pos + 1);
                out += (n === 'n' ? '\n' : n === 't' ? '\t' : n);
                pos += 2;
                continue;
            }
            if (c === q) { pos++; return out; }
            out += c;
            pos++;
        }
        return null;
    };
    const parseNum = () => {
        const m = s.slice(pos).match(/^-?\d+/);
        if (!m) return null;
        pos += m[0].length;
        return parseInt(m[0], 10);
    };
    const parsePrimary = () => {
        skipWs();
        const c = s.charAt(pos);
        if (c === '(') {
            pos++;
            const v = parseExpr();
            skipWs();
            if (s.charAt(pos) === ')') pos++;
            return v;
        }
        if (c === '"' || c === "'") return parseStr();
        return null;
    };
    const parseTerm = () => {
        let v = parsePrimary();
        if (v === null) return null;
        for (;;) {
            skipWs();
            const mm = s.slice(pos).match(/^\.(substring|slice)\s*\(/);
            if (!mm) break;
            pos += mm[0].length;
            skipWs();
            const a = parseNum();
            skipWs();
            let b = null;
            if (s.charAt(pos) === ',') { pos++; skipWs(); b = parseNum(); skipWs(); }
            if (s.charAt(pos) === ')') pos++;
            if (a === null) return null;
            v = (mm[1] === 'substring') ? (b === null ? v.substring(a) : v.substring(a, b)) : (b === null ? v.slice(a) : v.slice(a, b));
        }
        return v;
    };
    const parseExpr = () => {
        let v = parseTerm();
        if (v === null) return null;
        for (;;) {
            skipWs();
            if (s.charAt(pos) !== '+') break;
            pos++;
            const rhs = parseTerm();
            if (rhs === null) return null;
            v = v + rhs;
        }
        return v;
    };
    try {
        const out = parseExpr();
        skipWs();
        if (pos < s.length && s.charAt(pos) !== ';') return null;
        return out;
    } catch {
        return null;
    }
}

function stCandidates(html) {
    const s = String(html || '');
    const evaled = [];
    const re = /innerHTML\s*=\s*([^;]+);/g;
    let m;
    while ((m = re.exec(s)) !== null) {
        const v = evalConcatExpr(m[1]);
        if (v && v.includes('get_video')) evaled.push(v);
    }
    const seen = new Set();
    const out = [];
    const add = (u) => {
        if (!u) return;
        u = String(u).trim();
        if (u.startsWith('//')) u = `https:${u}`;
        else if (!/^https?:\/\//i.test(u)) {
            if (/^[\w.-]+\.[a-z]{2,}\//i.test(u)) u = `https://${u}`;
            else return;
        }
        u = u.replace(/&amp;/g, '&');
        if (!u.includes('get_video') || seen.has(u)) return;
        try {
            const h = new URL(u).hostname;
            if (!/(^|\.)streamtape\.com$|(^|\.)amtape\.com$/.test(h)) return;
        } catch { return; }
        seen.add(u);
        out.push(u);
    };
    for (let i = evaled.length - 1; i >= 0; i--) add(evaled[i]);
    for (const u of s.match(/https?:\/\/[^\s"'<>]+get_video\?[^\s"'<>]+/g) || []) add(u);
    for (const u of s.match(/\/\/[\w.-]+get_video\?[^\s"'<>]+/g) || []) add(u);
    return out;
}

async function probeStFile(url, referer) {
    const r = await httpRaw(url, {
        headers: { Referer: referer, Range: 'bytes=0-1023' },
        timeout: 20000,
    });
    if (!r.status) return false;
    const head = String(r.data || '').slice(0, 120);
    if (head.startsWith('{') && /"status"\s*:/.test(head)) return false;
    return r.status === 200 || r.status === 206;
}

async function resolveVasApi(embedUrl, embedHtml) {
    try {
        const u = new URL(embedUrl);
        const codeM = u.pathname.match(/\/e\/([A-Za-z0-9]+)/);
        if (!codeM) return null;
        const code = codeM[1];
        let cookie = '';
        if (!embedHtml) {
            const g = await httpRaw(embedUrl, { headers: { Referer: `${site}/` }, timeout: 15000 });
            const sc = g.headers?.['set-cookie'];
            if (Array.isArray(sc)) cookie = sc.map((x) => String(x).split(';')[0]).join('; ');
        }
        const r = await req.post(`${u.origin}/api/stream`, {
            filecode: code,
            device: 'web',
            codecs: [],
        }, {
            headers: {
                'User-Agent': PLAY_UA,
                'Content-Type': 'application/json',
                Origin: u.origin,
                Referer: embedUrl,
                ...(cookie ? { Cookie: cookie } : {}),
            },
            timeout: 30000,
            validateStatus: () => true,
        });
        const j = typeof r.data === 'object' && r.data ? r.data : JSON.parse(String(r.data || '{}'));
        const su = j.streaming_url || j.fallback_url || '';
        if (/^https?:\/\//i.test(su)) return su;
    } catch { /* ignore */ }
    return null;
}

async function resolveEmbed(embedUrl, embedBody, detailUrl) {
    let html = embedBody || '';
    let finalUrl = embedUrl;
    if (!html) {
        const r = await httpRaw(embedUrl, { headers: { Referer: detailUrl }, timeout: 25000 });
        html = String(r.data || '');
    }
    if (!html) return null;
    const jsJump = html.match(/window\.location\.href\s*=\s*'(https?:\/\/[^']+)'/) ||
        html.match(/window\.location\.href\s*=\s*"(https?:\/\/[^"]+)"/);
    if (jsJump && html.length < 3000 && !/jwplayer|application\/json|get_video/.test(html)) {
        const r2 = await httpRaw(jsJump[1], { headers: { Referer: embedUrl }, timeout: 25000 });
        if (r2.data) { html = String(r2.data); finalUrl = jsJump[1]; }
    }

    const direct0 = extractStreamUrl(html);
    if (html.includes('get_video')) {
        const cands = stCandidates(html);
        for (const c of cands) {
            if (await probeStFile(c, finalUrl)) {
                return { url: c, header: playHeadersFor(c, finalUrl, detailUrl) };
            }
        }
        if (cands.length) return { sniff: finalUrl };
    }
    if (/\/api\/stream/.test(html) && /filecode/i.test(html)) {
        const su = await resolveVasApi(finalUrl, html);
        if (su) {
            const top = /\.m3u8/i.test(su) ? await pickTopVariant(su, playHeadersFor(su, finalUrl, detailUrl)) : su;
            return { url: top, header: playHeadersFor(top, finalUrl, detailUrl) };
        }
        return { sniff: finalUrl };
    }
    const cfg = voeDecode(html);
    const src = String(cfg.source || '');
    if (/\.m3u8/i.test(src)) {
        const hdr = playHeadersFor(src, finalUrl, detailUrl);
        return { url: await pickTopVariant(src, hdr), header: hdr };
    }
    const dau = String(cfg.direct_access_url || '');
    if (/^https?:\/\//i.test(dau)) return { url: dau, header: playHeadersFor(dau, finalUrl, detailUrl) };
    if (/^https?:\/\//i.test(src)) return { url: src, header: playHeadersFor(src, finalUrl, detailUrl) };
    if (/eval\(function\(p,a,c,k/.test(html)) {
        const unpacked = unpackPacker(html);
        const urls = hlsFromUnpacked(unpacked);
        for (const u of urls.slice(0, 3)) {
            const hdr = playHeadersFor(u, finalUrl, detailUrl);
            const pl = await verifyPlaylist(u, hdr);
            if (pl) {
                const top = await pickTopVariant(u, hdr);
                return { url: top, header: hdr };
            }
        }
    }
    if (direct0) {
        const hdr = playHeadersFor(direct0, finalUrl, detailUrl);
        const top = /\.m3u8/i.test(direct0) ? await pickTopVariant(direct0, hdr) : direct0;
        return { url: top, header: hdr };
    }
    const jw = html.match(/jwplayer\([^)]*\)\.setup\(\{\s*file:\s*"([^"]+)"/i);
    if (jw) {
        const f = jw[1].replace(/\\\//g, '/');
        if (/^https?:\/\//i.test(f)) {
            const hdr = playHeadersFor(f, finalUrl, detailUrl);
            const top = /\.m3u8/i.test(f) ? await pickTopVariant(f, hdr) : f;
            return { url: top, header: hdr };
        }
    }
    return null;
}

async function probeWrap(gateUrl) {
    try {
        const r = await httpRaw(`${FETCH_WORKER}/wrap?u=${encodeURIComponent(gateUrl)}`, { timeout: 10000 });
        return String(r.data || '').includes('<iframe');
    } catch {
        return false;
    }
}

function parseVods($) {
    const cards = [];
    const seen = new Set();
    $('.clearfix .post, .posts .post').each((_, e) => {
        const href = $(e).find('a[href*=".html"]').first().attr('href') || '';
        if (!/\/\d+\.html/.test(href) || seen.has(href)) return;
        seen.add(href);
        cards.push({
            vod_id: href,
            vod_name: $(e).find('a').attr('title') || '',
            vod_pic: ($(e).find('.thumb').attr('data-original') || '').replace('!320x216.jpg', ''),
            vod_remarks: $(e).find('.con .meta .date').text().trim(),
        });
    });
    return cards;
}

function lineRank(name) {
    return LINE_ORDER[String(name || '').trim().toUpperCase()] ?? 50;
}

async function init() {
    return {};
}

async function home() {
    return {
        class: [
            { type_id: 'popular', type_name: '热门' },
            { type_id: 'category/censored-jav', type_name: '有码' },
            { type_id: 'category/uncensored-jav', type_name: '无码' },
            { type_id: 'category/amateur', type_name: '素人' },
            { type_id: 'category/chinese-subtitles', type_name: '中文字幕' },
            { type_id: 'tag/4k', type_name: '4K' },
            { type_id: 'tag/bareback', type_name: '无套' },
            { type_id: 'tag/acmeorgasm', type_name: '高潮' },
            { type_id: 'tag/creampie', type_name: '中出' },
            { type_id: 'tag/huge-cock', type_name: '巨根' },
            { type_id: 'category/reducing-mosaic', type_name: '无码破解' },
        ],
        filters: {},
    };
}

async function category(inReq) {
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const $ = load(await request(buildListUrl(inReq.body.id, page)));
    return { page, pagecount: page + 1, list: parseVods($) };
}

async function detail(inReq) {
    const detailUrl = normalizeDetailUrl(inReq.body.id);
    const html = await request(detailUrl);
    const $ = load(html);
    const name = $('meta[name="description"]').attr('content') || $('h1').text().trim() || '';

    const pairs = [];
    $('a.btn-server').each((_, e) => {
        const trackName = $(e).text().trim();
        const dataLink = $(e).attr('data-link') || '';
        if (!dataLink) return;
        pairs.push([trackName, `正片$${detailUrl}|${dataLink}`]);
    });
    if (!pairs.length) {
        const links = [...String(html).matchAll(/data-link="([0-9a-f]{40,})"/gi)].map((m) => m[1]);
        const names = [...String(html).matchAll(/data-link="[0-9a-f]{40,}"[^>]*>([^<]{1,12})</gi)].map((m) => m[1].trim());
        links.forEach((dataLink, i) => {
            pairs.push([names[i] || `线路${i + 1}`, `正片$${detailUrl}|${dataLink}`]);
        });
    }
    pairs.sort((a, b) => lineRank(a[0]) - lineRank(b[0]));

    return {
        list: [{
            vod_id: detailUrl,
            vod_name: name,
            vod_pic: '',
            vod_content: name,
            vod_play_from: pairs.length ? pairs.map((p) => p[0]).join('$$$') : 'SupJav',
            vod_play_url: pairs.length ? pairs.map((p) => p[1]).join('$$$') : '',
        }],
    };
}

async function play(inReq) {
    let id = String(inReq.body.id || inReq.body.url || '').trim();
    if (id.includes('$')) id = id.split('$').pop().trim();

    if (/^https?:\/\/.+\.m3u8/i.test(id)) {
        const referer = `${site}/`;
        let url = id;
        if (needsM3u8Proxy(id)) url = proxyM3u8PlayUrl(id, referer, inReq);
        return { parse: 0, url, header: { 'User-Agent': PLAY_UA, Referer: referer } };
    }

    const parts = id.split('|');
    const hex = parts[1] || '';
    if (!hex) {
        return { parse: 0, url: '', message: '无播放线路' };
    }
    let detailUrl = String(parts[0] || '').trim();
    if (!/^https?:\/\//i.test(detailUrl)) {
        detailUrl = normalizeDetailUrl(detailUrl.replace(/\D/g, '') || detailUrl);
    }
    const gateUrl = `${LK_BASE}?l=${hex}`;
    const headers = { 'User-Agent': PLAY_UA, Referer: detailUrl };
    try {
        const lk = await lkResolveEmbed(hex, detailUrl);
        if (lk && (lk.embedUrl || lk.embedBody)) {
            const got = await resolveEmbed(lk.embedUrl || '', lk.embedBody || '', detailUrl);
            if (got?.url) {
                let url = got.url;
                const hdr = got.header || headers;
                if (/\.m3u8/i.test(url) && needsM3u8Proxy(url)) {
                    url = proxyM3u8PlayUrl(url, hdr.Referer || detailUrl, inReq);
                }
                return { parse: 0, url, header: hdr };
            }
            if (got?.sniff) {
                return { parse: 1, jx: 0, url: got.sniff, header: headers };
            }
            if (lk.embedUrl && !/supjav\.php/.test(lk.embedUrl)) {
                return { parse: 1, jx: 0, url: lk.embedUrl, header: headers };
            }
        }
    } catch { /* fallthrough */ }
    if (await probeWrap(gateUrl)) {
        return {
            parse: 1,
            jx: 0,
            url: `${FETCH_WORKER}/wrap?u=${encodeURIComponent(gateUrl)}`,
            header: headers,
        };
    }
    return { parse: 1, url: gateUrl, header: headers };
}

async function search(inReq) {
    const text = encodeURIComponent(inReq.body.wd || '');
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const url = page <= 1 ? `${site}/?s=${text}` : `${site}/page/${page}/?s=${text}`;
    const $ = load(await request(url));
    return { list: parseVods($) };
}

export default {
    meta: { key: 'supjav', name: '🌸SupjAv', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/proxy', proxyHandler);
    },
};
