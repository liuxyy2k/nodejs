import { load } from 'cheerio';
import req from '../../util/req.js';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const SITE_ROOT = 'https://supjav.com';
const site = `${SITE_ROOT}/zh`;
const LK_BASE = 'https://lk1.supremejav.com/supjav.php';
const META_KEY = 'supjav';
const LINE_ORDER = { VOE: 0, FST: 10, ST: 20, TV: 90 };

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

function pickBestM3u8(text, base) {
    const lines = String(text || '').split('\n');
    let best = '';
    let bestH = 0;
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i].includes('#EXT-X-STREAM-INF')) continue;
        const m = lines[i].match(/RESOLUTION=\d+x(\d+)/);
        const h = m ? parseInt(m[1], 10) : 0;
        const url = absUrl(lines[i + 1]?.trim(), base);
        if (url && h >= bestH) {
            bestH = h;
            best = url;
        }
    }
    if (best) return best;
    const direct = lines.find((l) => l.trim() && !l.startsWith('#'));
    return absUrl(direct?.trim(), base);
}

function int2base(num, radix) {
    const digits = '0123456789abcdefghijklmnopqrstuvwxyz';
    if (num < 0) return `-${int2base(-num, radix)}`;
    const res = [];
    let x = num;
    while (x > 0) {
        res.push(digits[x % radix]);
        x = Math.floor(x / radix);
    }
    return res.length ? res.reverse().join('') : '0';
}

function unpackPacker(text) {
    const m = String(text || '').match(/}\('(.*?)',(\d+),(\d+),'(.*?)'\.split\('\|'\)/s);
    if (!m) return '';
    let payload = m[1];
    const base = parseInt(m[2], 10);
    const count = parseInt(m[3], 10);
    const keys = m[4].split('|');
    try {
        payload = JSON.parse(`"${payload.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
    } catch {
        /* keep raw */
    }
    const table = {};
    for (let i = 0; i < count; i++) {
        if (i < keys.length && keys[i]) table[int2base(i, base)] = keys[i];
    }
    return payload.replace(/\b\w+\b/g, (w) => (table[w] !== undefined ? table[w] : w));
}

function rot13(s) {
    return String(s).replace(/[a-zA-Z]/g, (c) => {
        const base = c <= 'Z' ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
    });
}

function b64DecodeText(x) {
    const cleaned = String(x).replace(/[^A-Za-z0-9+/=]/g, '');
    const pad = (4 - (cleaned.length % 4)) % 4;
    return Buffer.from(cleaned + '='.repeat(pad), 'base64').toString('utf8');
}

function voeDecode(html) {
    const m = String(html || '').match(/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!m) return {};
    const blk = m[1].trim();
    let raw = blk;
    try {
        const j = JSON.parse(blk);
        raw = Array.isArray(j) && j.length ? j[0] : blk;
    } catch {
        raw = blk;
    }
    let s = String(raw);
    for (const k of ['@$', '^^', '~@', '%?', '*~', '!!', '#&']) {
        s = s.replaceAll(k, '_');
    }
    s = s.replace(/_/g, '');
    try {
        let t = b64DecodeText(rot13(s));
        t = [...t].map((c) => String.fromCharCode(c.charCodeAt(0) - 3)).join('');
        t = b64DecodeText(t.split('').reverse().join(''));
        const cfg = JSON.parse(t);
        return typeof cfg === 'object' && cfg !== null ? cfg : {};
    } catch {
        return {};
    }
}

function firstM3u8(text) {
    const hits = [...String(text || '').matchAll(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/g)].map((x) => x[0]);
    return hits.length ? hits[0].replace(/\\\//g, '/').replace(/&amp;/g, '&') : '';
}

function extractStreamtape(html) {
    for (const pat of [
        /getElementById\('botlink'\)\.innerHTML\s*=\s*'([^']*)'\s*\+\s*\('([^']+)'\)\.substring\((\d+)\)/,
        /innerHTML\s*=\s*'([^']+)'\s*\+\s*\('([^']+)'\)\.substring\((\d+)\)/,
        /innerHTML\s*=\s*"([^"]+)"\s*\+\s*\("([^"]+)"\)\.substring\((\d+)\)/,
    ]) {
        const m = String(html || '').match(pat);
        if (!m) continue;
        let link = m[1] + m[2].slice(parseInt(m[3], 10));
        if (link.startsWith('//')) link = `https:${link}`;
        if (!/^https?:/i.test(link)) continue;
        if (!link.includes('stream=1') && !link.includes('dl=')) {
            link += link.includes('?') ? '&stream=1' : '?stream=1';
        }
        return link;
    }
    return '';
}

async function resolveFinalUrl(url, referer) {
    const resp = await req.get(url, {
        headers: { 'User-Agent': UA, Referer: referer, Range: 'bytes=0-1' },
        timeout: 30000,
        maxRedirects: 5,
        validateStatus: () => true,
        responseType: 'stream',
    });
    const finalUrl = resp.request?.res?.responseUrl || url;
    resp.data?.destroy?.();
    return finalUrl || url;
}

async function fromTurboHash(hash) {
    const referer = /turbovidhls|turbosplayer|turboviplay/i.test(hash)
        ? `${new URL(hash).origin}/`
        : 'https://turbovidhls.com/';
    const master = await fetchText(hash, referer);
    return pickBestM3u8(master, hash);
}

function collectTargets(html) {
    const targets = new Set();
    const text = String(html || '');
    for (const m of text.matchAll(/window\.location(?:\.replace)?\s*\(\s*['"]([^'"]+)['"]/g)) {
        if (m[1]) targets.add(m[1]);
    }
    for (const m of text.matchAll(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/g)) {
        if (m[1]) targets.add(m[1]);
    }
    for (const m of text.matchAll(/https?:\/\/[a-z0-9.-]+\/e\/[a-z0-9]{8,}/gi)) {
        targets.add(m[0]);
    }
    for (const m of text.matchAll(
        /https?:\/\/(?:[a-z0-9-]+\.)*(?:voe\.sx|voe-network\.com|luluvdo\.com|sandpirate|streamtape\.com|emturbovid|wishfast|filemoon|crazyembed|hglink\.to|iplayerhls\.com|javplayer)[^\s"'<>\\]*/gi,
    )) {
        targets.add(m[0].replace(/\\+$/, ''));
    }
    const iframe = load(text)('iframe[src]').attr('src');
    if (iframe && !/supremejav|supjav\.com/i.test(iframe)) {
        targets.add(iframe.startsWith('//') ? `https:${iframe}` : iframe);
    }
    return [...targets];
}

function refererForUrl(playUrl, fallback = site) {
    const u = String(playUrl || '');
    if (/streamtape\.com|tapecontent\.net/i.test(u)) return 'https://streamtape.com/';
    if (/turbovidhls|turbosplayer|turboviplay/i.test(u)) {
        try {
            return `${new URL(u).origin}/`;
        } catch {
            return 'https://turbovidhls.com/';
        }
    }
    if (/voe\.|luluvdo|sandpirate|voe-network/i.test(u)) {
        try {
            return `${new URL(u).origin}/`;
        } catch {
            return 'https://voe.sx/';
        }
    }
    if (/^https?:\/\//i.test(fallback)) return fallback;
    return site;
}

async function extractStream(html, ref) {
    const tape = extractStreamtape(html);
    if (tape) return resolveFinalUrl(tape, 'https://streamtape.com/');

    let hit = firstM3u8(html);
    if (hit) return hit;

    if (String(html).includes('eval(function(p,a,c,k,e')) {
        hit = firstM3u8(unpackPacker(html));
        if (hit) return hit;
    }

    const hash = load(html)('#video_player').attr('data-hash');
    if (hash) {
        hit = await fromTurboHash(hash);
        if (hit) return hit;
    }

    const em = String(html).match(/https?:\/\/streamtape\.com\/e\/([A-Za-z0-9]+)/);
    if (em) {
        const page = await fetchText(`https://streamtape.com/e/${em[1]}/`, `${SITE_ROOT}/`);
        const tape2 = extractStreamtape(page);
        if (tape2) return resolveFinalUrl(tape2, 'https://streamtape.com/');
    }

    for (const tgt of collectTargets(html)) {
        let page = await fetchText(tgt, ref);
        hit = firstM3u8(page);
        if (hit) return hit;

        if (String(page).includes('eval(function(p,a,c,k,e')) {
            hit = firstM3u8(unpackPacker(page));
            if (hit) return hit;
        }

        const tape3 = extractStreamtape(page);
        if (tape3) return resolveFinalUrl(tape3, 'https://streamtape.com/');

        const cfg = voeDecode(page);
        const src = String(cfg.source || '').replace(/\\\//g, '/');
        if (src.includes('.m3u8')) return src;
        const direct = String(cfg.direct_access_url || '').replace(/\\\//g, '/');
        if (direct.startsWith('http')) return direct;
        if (src.startsWith('http')) return src;

        const hash2 = load(page)('#video_player').attr('data-hash');
        if (hash2) {
            hit = await fromTurboHash(hash2);
            if (hit) return hit;
        }

        const nested = collectTargets(page).filter((u) => u !== tgt);
        for (const nxt of nested.slice(0, 3)) {
            page = await fetchText(nxt, tgt);
            hit = firstM3u8(page);
            if (hit) return hit;
            const cfg2 = voeDecode(page);
            const src2 = String(cfg2.source || '').replace(/\\\//g, '/');
            if (src2.includes('.m3u8')) return src2;
            if (String(cfg2.direct_access_url || '').startsWith('http')) return cfg2.direct_access_url;
        }
    }

    const redirect = String(html).match(/window\.location\.href\s*=\s*'([^']+)'/);
    if (redirect?.[1]) {
        const page = await fetchText(redirect[1], ref);
        hit = firstM3u8(page);
        if (hit) return hit;
        const hash3 = load(page)('#video_player').attr('data-hash');
        if (hash3) {
            hit = await fromTurboHash(hash3);
            if (hit) return hit;
        }
    }

    return '';
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
    const fail = { parse: 0, url: '', header: { 'User-Agent': UA } };
    let raw = String(inReq.body.id || inReq.body.url || '').trim();
    if (raw.includes('$')) raw = raw.split('$').pop().trim();

    if (/^https?:\/\/.+\.m3u8/i.test(raw)) {
        const referer = refererForUrl(raw);
        let url = raw;
        if (needsM3u8Proxy(raw)) url = proxyM3u8PlayUrl(raw, referer, inReq);
        return { parse: 0, url, header: { 'User-Agent': UA, Referer: referer } };
    }

    const pipe = raw.indexOf('|');
    let detailUrl = pipe >= 0 ? raw.slice(0, pipe).trim() : '';
    const lk = pipe >= 0 ? raw.slice(pipe + 1).trim() : raw;
    if (!lk) return fail;

    if (!/^https?:\/\//i.test(detailUrl)) {
        detailUrl = normalizeDetailUrl(detailUrl.replace(/\D/g, '') || detailUrl);
    }

    const s1Url = `${LK_BASE}?l=${lk}`;
    const s1 = await fetchText(s1Url, detailUrl);
    const om = s1.match(/var\s+OLID\s*=\s*'([0-9a-f]{40,})'/i);
    const olid = om ? om[1].split('').reverse().join('') : lk.split('').reverse().join('');

    const s2Url = `${LK_BASE}?c=${olid}`;
    const s2 = await fetchText(s2Url, s1Url);
    let playUrl = await extractStream(s2, detailUrl);
    if (!playUrl) {
        const embed = collectTargets(s2).find((u) => !/supremejav|supjav\.com|lk1\./i.test(u));
        if (embed) {
            return {
                parse: 1,
                url: embed,
                header: { 'User-Agent': UA, Referer: detailUrl },
            };
        }
        return fail;
    }

    playUrl = playUrl.replace(/\\\//g, '/').replace(/&amp;/g, '&');
    const referer = refererForUrl(playUrl, detailUrl);
    let url = playUrl;
    if (/\.m3u8/i.test(playUrl) && needsM3u8Proxy(playUrl)) {
        url = proxyM3u8PlayUrl(playUrl, referer, inReq);
    }

    return { parse: 0, url, header: { 'User-Agent': UA, Referer: referer } };
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
