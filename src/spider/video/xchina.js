import req from '../../util/req.js';

/**
 * xChina 视频 (en.xchina.co)
 * 直连优先；机房 IP 被 CF 拦时自动走 r.jina.ai 拉 HTML（可 env XCHINA_RELAY / init.extend.relay 覆盖）
 * 播放: HLS 经本地 /proxy/m3u8 改写（master→720p 子清单、AES KEY 相对路径改绝对路径）
 */

const KEY = 'xchina';
const NAME = '🌸xChina';
const HOST = 'https://en.xchina.co';
const DEFAULT_RELAY = 'https://r.jina.ai/';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const PAGE_SIZE = 24;
const BLOCK_TTL = 10 * 60 * 1000;

let _cfg = {};
let _classCache = null;
let _classAt = 0;
let _directBlockedAt = 0;

function absM3u8Uri(uri, base) {
    const u = String(uri || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    try {
        return new URL(u, base).href;
    } catch {
        return u.startsWith('/') ? HOST + u : u;
    }
}

function b64url(s) {
    return Buffer.from(String(s), 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function proxyM3u8PlayUrl(inReq, m3u8Url, referer) {
    const dynamic = inReq?.server?.address?.()?.dynamic || 'js2p://_WEB_';
    const prefix = inReq?.server?.prefix || `/spider/${KEY}/3`;
    return `${dynamic}${prefix}/proxy/m3u8?u=${b64url(m3u8Url)}&r=${b64url(referer || `${HOST}/`)}`;
}

async function fetchHlsPlaylist(url, referer) {
    const resp = await req.get(url, {
        headers: {
            'User-Agent': UA,
            Referer: referer,
            Origin: HOST,
            Accept: '*/*',
        },
        timeout: 20000,
        validateStatus: () => true,
        responseType: 'text',
    });
    return resp.status === 200 ? String(resp.data || '') : '';
}

function rewritePlaylist(text, baseUrl) {
    const out = [];
    for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
        const line = raw.trimEnd();
        if (!line) continue;
        if (line.startsWith('#')) {
            out.push(line.replace(/URI="([^"]+)"/gi, (_, u) => `URI="${absM3u8Uri(u, baseUrl)}"`));
            continue;
        }
        out.push(absM3u8Uri(line.trim(), baseUrl));
    }
    return `${out.join('\n')}\n`;
}

async function m3u8Proxy(inReq, reply) {
    let url = '';
    let referer = `${HOST}/`;
    try {
        url = Buffer.from(String(inReq.query?.u || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
        if (inReq.query?.r) {
            referer = Buffer.from(String(inReq.query.r).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
        }
    } catch {
        reply.code(400).type('text/plain').send('bad params');
        return;
    }
    if (!/^https?:\/\//i.test(url)) {
        reply.code(400).type('text/plain').send('bad url');
        return;
    }
    const text = await fetchHlsPlaylist(url, referer);
    if (!text.includes('#EXTM3U')) {
        reply.redirect(url);
        return;
    }
    reply
        .type('application/vnd.apple.mpegurl')
        .header('Cache-Control', 'no-cache')
        .send(rewritePlaylist(text, url));
}

function pickVariantFromMaster(masterText, masterUrl) {
    const lines = masterText.split('\n');
    let best = { h: 0, url: '' };
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i].includes('#EXT-X-STREAM-INF')) continue;
        const hm = lines[i].match(/RESOLUTION=\d+x(\d+)/);
        const h = hm ? parseInt(hm[1], 10) : 0;
        const rel = lines[i + 1]?.trim();
        if (!rel) continue;
        const abs = absM3u8Uri(rel, masterUrl);
        if (h >= best.h) best = { h, url: abs };
    }
    return best.url || masterUrl;
}

async function resolvePlayStream(vid) {
    const pageRef = `${HOST}/video/${vid}`;
    let entry = '';
    const html = await getHTML(`/video/${vid}`);
    if (html) {
        const hls =
            pick(/id="video-player"[^>]*data-src="([^"]+)"/, html) ||
            pick(/data-src="(\/hls\/[^"]+)"/, html);
        if (hls) entry = hls.startsWith('http') ? hls : HOST + hls;
    }
    if (!entry) entry = `${HOST}/hls/${vid}/master.m3u8`;

    let variant = entry;
    const masterText = await fetchHlsPlaylist(entry, pageRef);
    if (masterText.includes('#EXT-X-STREAM-INF')) {
        variant = pickVariantFromMaster(masterText, entry);
    }
    return { variant, referer: pageRef };
}

function decode(s) {
    if (!s) return '';
    return String(s)
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));
}

function stripTags(s) {
    return decode(String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim();
}

function relayBase() {
    let v = '';
    try {
        if (typeof process !== 'undefined' && process.env) v = process.env.XCHINA_RELAY || '';
    } catch {
        /* ignore */
    }
    if (!v && _cfg?.relay) v = _cfg.relay;
    return String(v || DEFAULT_RELAY).trim();
}

function isBlockPage(body) {
    if (!body) return false;
    return (
        body.includes('Attention Required! | Cloudflare') ||
        body.includes('Sorry, you have been blocked') ||
        body.includes('cf-error-details') ||
        body.includes('Just a moment...')
    );
}

async function rawFetch(url, timeout, extraHeaders) {
    const headers = {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...extraHeaders,
    };

    try {
        const resp = await req.get(url, {
            headers,
            timeout,
            validateStatus: () => true,
            responseType: 'text',
        });
        return { status: resp.status, body: String(resp.data || '') };
    } catch {
        /* fetch fallback */
    }

    if (typeof fetch === 'function') {
        const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ctl ? setTimeout(() => ctl.abort(), timeout) : null;
        try {
            const res = await fetch(url, { headers, signal: ctl?.signal, redirect: 'follow' });
            const body = await res.text();
            return { status: res.status, body };
        } finally {
            clearTimeout(timer);
        }
    }

    return { status: 0, body: '' };
}

async function getHTML(pathOrUrl) {
    const url = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : HOST + pathOrUrl;
    const now = Date.now();
    const forceRelay = !!(_cfg.forceRelay || process.env?.XCHINA_FORCE_RELAY);

    if (!forceRelay && now - _directBlockedAt > BLOCK_TTL) {
        try {
            const r = await rawFetch(url, 15000);
            if (r.status === 200 && r.body && !isBlockPage(r.body)) return r.body;
            if (isBlockPage(r.body)) _directBlockedAt = Date.now();
        } catch {
            /* relay */
        }
    }

    const base = relayBase();
    if (base && base.toLowerCase() !== 'none') {
        const relayUrl = base.includes('{url}') ? base.replace('{url}', url) : `${base.replace(/\/+$/, '')}/${url}`;
        try {
            const r = await rawFetch(relayUrl, 45000, { 'X-Return-Format': 'html', Accept: 'text/html,*/*' });
            if (r.status === 200 && r.body && !isBlockPage(r.body) && !r.body.includes('"code":422')) {
                return r.body;
            }
        } catch {
            /* direct retry */
        }
    }

    const r = await rawFetch(url, 20000);
    return r.body || '';
}

function pick(re, s, idx) {
    const m = re.exec(s);
    return m ? m[idx === undefined ? 1 : idx] : '';
}

function parseCards(html) {
    const list = [];
    if (!html) return list;
    const re = /<a href="\/video\/([0-9a-f]{13})"\s+class="group block">([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(html))) {
        const id = m[1];
        const s = m[2];
        const pic = pick(/<img[^>]*\ssrc="([^"]+)"/, s);
        const alt = decode(pick(/<img[^>]*\salt="([^"]*)"/, s));
        const title = stripTags(pick(/line-clamp-2[^"]*"[^>]*>([\s\S]*?)<\/span>/, s)) || alt;
        const code = decode(stripTags(pick(/cover-pill ml-auto max-w-\[50%\][^>]*>([\s\S]*?)<\/span>/, s)));
        const duration = decode(stripTags(pick(/bottom-1\.5[\s\S]{0,300}?tabular-nums">([\s\S]*?)<\/span>/, s)));
        const model = decode(stripTags(pick(/mt-1 flex h-4[\s\S]{0,200}?truncate">([\s\S]*?)<\/span>/, s)));
        const date = decode(stripTags(pick(/shrink-0 tabular-nums">(\d{4}-\d{2}-\d{2})</, s)));
        list.push({
            vod_id: id,
            vod_name: title,
            vod_pic: pic,
            vod_remarks: [code, duration].filter(Boolean).join(' · '),
            vod_year: (date || '').slice(0, 4),
            vod_actor: model,
        });
    }
    return list;
}

function parsePageCount(html, cardCount) {
    const m = /data-total="(\d+)"/.exec(html || '');
    if (m) return parseInt(m[1], 10) || 1;
    return cardCount >= 20 ? 9999 : 1;
}

function listResult(html, pg) {
    const list = parseCards(html);
    const pagecount = parsePageCount(html, list.length);
    return {
        page: pg || 1,
        pagecount,
        limit: PAGE_SIZE,
        total: pagecount * PAGE_SIZE,
        list,
    };
}

function parseTid(tid) {
    const raw = String(tid || 'videos').trim();
    const parts = raw.split('@');
    const key = parts[0] || 'videos';
    const sort = parts[1] || '';
    let base = '/videos';
    if (key === 'videos') base = '/videos';
    else if (key.startsWith('cat:')) base = `/video-category/${key.slice(4)}`;
    else if (key.startsWith('series:')) base = `/video-series/${key.slice(7)}`;
    else if (key.startsWith('tag:')) base = `/video-tag/${key.slice(4)}`;
    else if (key.startsWith('/')) base = key;
    return { base, sort };
}

function buildListUrl(base, pg, sort) {
    let u = base;
    if (pg && pg > 1) u += `/${pg}`;
    if (sort) u += `?sort=${sort}`;
    return u;
}

const BASE_CLASS = [
    { type_id: 'videos', type_name: '最近更新' },
    { type_id: 'videos@read', type_name: '最多观看' },
    { type_id: 'videos@comment', type_name: '最多评论' },
    { type_id: 'videos@length', type_name: '时长最长' },
    { type_id: 'cat:jav', type_name: 'JAV' },
    { type_id: 'cat:jav@read', type_name: 'JAV·最多观看' },
    { type_id: 'cat:jav@length', type_name: 'JAV·最长' },
    { type_id: 'cat:cn', type_name: '国产' },
    { type_id: 'cat:cn@read', type_name: '国产·最多观看' },
    { type_id: 'cat:cn@length', type_name: '国产·最长' },
    { type_id: 'cat:movie', type_name: '电影' },
    { type_id: 'cat:movie@read', type_name: '电影·最多观看' },
];

const BASE_TAGS = [
    { slug: 'sub', name: '中文字幕' },
    { slug: 'reduced', name: '薄码' },
];

async function buildClass(force) {
    const now = Date.now();
    if (!force && _classCache && now - _classAt < 30 * 60 * 1000) return _classCache;

    const list = BASE_CLASS.slice();
    BASE_TAGS.forEach((t) => {
        list.push({ type_id: `tag:${t.slug}`, type_name: `标签·${t.name}` });
    });

    const html = await getHTML('/categories').catch(() => '');
    const series = [];
    const re =
        /href="\/video-series\/(\d+)" class="card group flex[\s\S]{0,400}?text-sm group-hover:text-brand-600">([^<]+)<\/span><span class="block text-xs text-subtle">(\d+)<\/span>/g;
    let m;
    while ((m = re.exec(html || ''))) {
        const count = parseInt(m[3], 10) || 0;
        if (count <= 0) continue;
        series.push({ id: m[1], name: decode(m[2]), count });
    }

    if (series.length) {
        series
            .sort((a, b) => b.count - a.count)
            .slice(0, 40)
            .forEach((s) => {
                list.push({ type_id: `series:${s.id}`, type_name: `系列·${s.name}` });
            });
    } else {
        [
            { id: '4', name: '有码' },
            { id: '5', name: '无码' },
            { id: '21', name: '麻豆传媒' },
            { id: '8', name: '香蕉视频' },
            { id: '20', name: '糖心Vlog' },
            { id: '9', name: '中国X站' },
            { id: '30', name: 'JVID' },
        ].forEach((s) => {
            list.push({ type_id: `series:${s.id}`, type_name: `系列·${s.name}` });
        });
    }

    _classCache = list;
    _classAt = now;
    return list;
}

function extractDl(html) {
    const out = {};
    const re = /<dt class="text-subtle">([^<]+)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g;
    let m;
    while ((m = re.exec(html))) {
        const k = stripTags(m[1]);
        const v = stripTags(m[2]);
        if (k && v && !out[k]) out[k] = v;
    }
    return out;
}

function parseDetail(html, id) {
    const titleBlock = pick(/<h1 class="mt-4[^"]*">([\s\S]*?)<\/h1>/, html);
    const code = stripTags(pick(/<span class="text-base font-normal text-subtle">([\s\S]*?)<\/span>/, titleBlock));
    const name = stripTags(titleBlock.replace(/<span class="text-base font-normal text-subtle">[\s\S]*?<\/span>/, ''));

    const duration = stripTags(pick(/<span>Duration ([\d:]+)<\/span>/, html));
    const date = stripTags(
        pick(/<a href="\/search\?q=(\d{4}-\d{2}-\d{2})"/, html) ||
            pick(/"uploadDate":"(\d{4}-\d{2}-\d{2})/, html) ||
            pick(/published (\d{4}-\d{2}-\d{2})/, html),
    );
    const poster = pick(/data-poster="([^"]+)"/, html);
    const hls = pick(/id="video-player"[^>]*data-src="([^"]+)"/, html) || pick(/data-src="(\/hls\/[^"]+)"/, html);

    const actors = [];
    const actorRe = /<a href="\/actor\/([0-9a-f]+)"[\s\S]{0,700}?<\/span>\s*([^<]+)<\/a>/g;
    let am;
    while ((am = actorRe.exec(html))) {
        const n = stripTags(am[2]);
        if (n && !actors.includes(n)) actors.push(n);
    }

    const tags = [];
    const tagRe = /class="chip h-7 text-xs"[^>]*>([^<]+)</g;
    let tm;
    while ((tm = tagRe.exec(html))) {
        const t = decode(tm[1]).trim();
        if (t && !tags.includes(t)) tags.push(t);
    }

    const dl = extractDl(html);
    let category = '';
    let series = '';
    const crumb = pick(/aria-label="Breadcrumb"([\s\S]*?)<\/nav>/, html);
    const clRe = /<a href="(\/[a-z-]+\/[^"]*)"[^>]*>([^<]+)<\/a>/g;
    let cm;
    while ((cm = clRe.exec(crumb))) {
        if (cm[1].startsWith('/video-category/')) category = stripTags(cm[2]);
        if (cm[1].startsWith('/video-series/')) series = stripTags(cm[2]);
    }

    const lines = [];
    if (code) lines.push(`番号:${code}`);
    if (date) lines.push(`发行:${date}`);
    if (duration) lines.push(`时长:${duration}`);
    if (dl.Studio) lines.push(`片商:${dl.Studio}`);
    if (dl.Director) lines.push(`导演:${dl.Director}`);
    if (dl['AV series']) lines.push(`系列:${dl['AV series']}`);
    if (series) lines.push(`分类:${[category, series].filter(Boolean).join(' / ')}`);
    if (actors.length) lines.push(`演员:${actors.join('、')}`);
    if (tags.length) lines.push(`标签:${tags.join(' ')}`);

    return {
        vod_id: id,
        vod_name: name,
        vod_pic: poster || `https://r2.xchina.download/cover/${id}.webp`,
        vod_remarks: [code, duration].filter(Boolean).join(' · '),
        vod_year: (date || '').slice(0, 4),
        vod_area: dl.Studio || '',
        vod_actor: actors.join(','),
        vod_director: dl.Director || '',
        vod_content: lines.join('\n'),
        vod_play_from: 'xChina',
        vod_play_url: `正片$${id}`,
        _hls: hls ? (hls.startsWith('http') ? hls : HOST + hls) : '',
    };
}

function videoId(raw) {
    const s = String(raw || '').trim();
    if (s.includes('$')) return s.split('$').pop().trim();
    const m = s.match(/[0-9a-f]{13}/);
    return m ? m[0] : s;
}

async function init(inReq) {
    const ext = inReq?.body?.extend || inReq?.body || {};
    _cfg = typeof ext === 'object' ? ext : {};
    _directBlockedAt = 0;
    _classCache = null;
    return {};
}

async function home() {
    let html = '';
    try {
        html = await getHTML('/');
    } catch {
        html = '';
    }

    const list = [];
    const seen = {};
    const sections = (html || '').split(/<section\b/).slice(1);
    sections.forEach((s) => {
        const t = /<h[12][^>]*>([\s\S]{0,140}?)<\/h[12]>/.exec(s);
        const title = t ? stripTags(t[1]) : '';
        const cards = parseCards(s);
        if (!cards.length) return;
        if (/photo|xiuren|scan|drama|comment/i.test(title)) return;
        cards.forEach((c) => {
            if (seen[c.vod_id]) return;
            seen[c.vod_id] = 1;
            c.vod_remarks = c.vod_remarks || title;
            list.push(c);
        });
    });

    if (!list.length) {
        parseCards(html).forEach((c) => {
            if (seen[c.vod_id]) return;
            seen[c.vod_id] = 1;
            list.push(c);
        });
    }

    const cls = await buildClass();
    return { class: cls, list, filters: {} };
}

async function category(inReq) {
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const tid = inReq.body.id || inReq.body.tid || 'videos';
    const p = parseTid(tid);
    const url = buildListUrl(p.base, page, p.sort);
    const html = await getHTML(url);
    if (!html) {
        return { page, pagecount: 0, limit: PAGE_SIZE, total: 0, list: [] };
    }
    return listResult(html, page);
}

async function detail(inReq) {
    const vid = videoId(inReq.body.id);
    const html = await getHTML(`/video/${vid}`);
    if (!html) {
        return {
            list: [
                {
                    vod_id: vid,
                    vod_name: vid,
                    vod_pic: `https://r2.xchina.download/cover/${vid}.webp`,
                    vod_play_from: 'xChina',
                    vod_play_url: `正片$${vid}`,
                },
            ],
        };
    }
    const vod = parseDetail(html, vid);
    delete vod._hls;
    return { list: [vod] };
}

async function play(inReq) {
    let raw = String(inReq.body.id || inReq.body.url || '').trim();
    if (raw.includes('$')) raw = raw.split('$').pop().trim();
    if (raw.includes('|')) raw = raw.split('|').pop().trim();

    let variant = '';
    let referer = `${HOST}/`;

    if (/^https?:\/\//i.test(raw) || raw.startsWith('/hls/')) {
        const entry = raw.startsWith('/hls/') ? HOST + raw : raw;
        const vid = videoId(raw);
        referer = vid ? `${HOST}/video/${vid}` : `${HOST}/`;
        const masterText = await fetchHlsPlaylist(entry, referer);
        variant = masterText.includes('#EXT-X-STREAM-INF') ? pickVariantFromMaster(masterText, entry) : entry;
    } else {
        const vid = videoId(raw);
        if (!vid) return { parse: 0, url: '', header: { 'User-Agent': UA, Referer: `${HOST}/` } };
        const hit = await resolvePlayStream(vid);
        variant = hit.variant;
        referer = hit.referer;
    }

    if (!variant) return { parse: 0, url: '', header: { 'User-Agent': UA, Referer: referer } };

    return {
        parse: 0,
        url: proxyM3u8PlayUrl(inReq, variant, referer),
        header: {
            'User-Agent': UA,
            Referer: referer,
            Origin: HOST,
        },
    };
}

async function search(inReq) {
    const kw = String(inReq.body.wd || inReq.body.key || '').trim();
    if (!kw) return { list: [] };

    const quick = inReq.body.quick;
    const pages = quick ? 1 : 2;
    const out = [];
    const seen = {};

    for (let i = 1; i <= pages; i++) {
        const path = `/search?q=${encodeURIComponent(kw)}&type=video${i > 1 ? `&page=${i}` : ''}`;
        let html = '';
        try {
            html = await getHTML(path);
        } catch {
            html = '';
        }
        parseCards(html).forEach((c) => {
            if (seen[c.vod_id]) return;
            seen[c.vod_id] = 1;
            out.push(c);
        });
        const pc = parsePageCount(html, 0);
        if (i >= pc) break;
    }

    return { list: out };
}

export default {
    meta: { key: KEY, name: NAME, type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/proxy/m3u8', m3u8Proxy);
    },
};
