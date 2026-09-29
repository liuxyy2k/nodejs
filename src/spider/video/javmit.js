import { load } from 'cheerio';
import req from '../../util/req.js';

/**
 * JAVMIT · javmit.com
 * 列表 /zh-CN/category/{slug}/  播放 master.m3u8，分片需要 Referer
 */

const SITE = 'https://javmit.com';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function headers(referer) {
    return {
        'User-Agent': UA,
        Referer: referer || `${SITE}/`,
        Accept: 'text/html,application/xhtml+xml,application/json,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    };
}

async function fetchText(url) {
    const resp = await req.get(url, {
        headers: headers(),
        timeout: 20000,
        responseType: 'text',
        validateStatus: () => true,
    });
    if (resp.status >= 400) return '';
    return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
}

function absUrl(href) {
    if (!href) return '';
    try {
        return new URL(href, SITE).href;
    } catch {
        return '';
    }
}

function cleanName(text) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .replace(/\s*[\[【(（].{0,12}(下载|在线|观看|收听|串流).{0,8}[\]】)）]\s*$/g, '')
        .trim();
}

function buildListUrl(tid, page) {
    const id = String(tid || 'latest').trim();
    if (id === 'latest' || id === 'home') {
        return page > 1 ? `${SITE}/zh-CN/page/${page}/` : `${SITE}/zh-CN/`;
    }
    if (id === 'uncensored') {
        return page > 1 ? `${SITE}/zh-CN/uncensored/page/${page}/` : `${SITE}/zh-CN/uncensored/`;
    }
    const slug = id.replace(/^\/+|\/+$/g, '').replace(/^zh-CN\//, '');
    const base = `${SITE}/zh-CN/${slug}/`;
    return page > 1 ? `${base}page/${page}/` : base;
}

function parseList(html) {
    const $ = load(html || '');
    const list = [];
    const seen = new Set();
    $('article.v-card, article.list-video').each((_, el) => {
        const card = $(el);
        const a = card.find('a.vc-thumb-wrap, a.lv-thumb').first();
        const href = absUrl(a.attr('href'));
        if (!href || seen.has(href)) return;
        seen.add(href);
        const img = card.find('img').first();
        const views = card.find('[data-rawx-views]').first().text().trim();
        const dur = card.find('.lv-dur, .vc-dur').first().text().trim();
        list.push({
            vod_id: href,
            vod_name: cleanName(img.attr('alt') || card.find('.vc-title, .lv-title').text()),
            vod_pic: img.attr('src') || img.attr('data-src') || '',
            vod_remarks: dur || views,
        });
    });
    return list;
}

function parsePageCount(html, page) {
    const $ = load(html || '');
    let max = page;
    $('a.page-numbers').each((_, el) => {
        const m = ($(el).attr('href') || '').match(/\/page\/(\d+)/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return max;
}

function parseCategories(html) {
    const $ = load(html || '');
    const list = [];
    const seen = new Set();
    $('a.cc-header').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/\/category\/([^/]+)\/?$/);
        if (!m || seen.has(m[1])) return;
        seen.add(m[1]);
        const name = $(el).find('.cc-name').text().trim();
        if (!name) return;
        list.push({ type_id: `category/${m[1]}`, type_name: name });
    });
    return list;
}

function extractPlayUrl(html) {
    const direct = String(html || '').match(/data-default-src="([^"]+)"/);
    if (direct) return direct[1].replace(/&amp;/g, '&');
    const json = String(html || '').match(/contentUrl"\s*:\s*"(https?:\\?\/\\?\/[^"]+?\.m3u8)"/);
    if (json) return json[1].replace(/\\\//g, '/');
    return '';
}

function allowedMedia(url) {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return host === 'javmit.com' || host.endsWith('.javmit.com');
    } catch {
        return false;
    }
}

function requestOrigin(inReq) {
    const proto = String(inReq.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
    const reqHost = inReq.headers['x-forwarded-host'] || inReq.headers.host;
    return `${proto}://${reqHost}`;
}

function rewritePlaylist(text, playlistUrl, origin) {
    return String(text)
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return line;
            if (trimmed.startsWith('#')) {
                return line.replace(/URI="([^"]+)"/g, (full, uri) => {
                    let abs = '';
                    try {
                        abs = new URL(uri, playlistUrl).href;
                    } catch {
                        return full;
                    }
                    if (!allowedMedia(abs)) return full;
                    const route = /\.m3u8(\?|$)/i.test(abs) ? 'm3u8' : 'seg';
                    return `URI="${origin}/spider/javmit/3/${route}?u=${encodeURIComponent(abs)}"`;
                });
            }
            let abs = '';
            try {
                abs = new URL(trimmed, playlistUrl).href;
            } catch {
                return line;
            }
            if (!allowedMedia(abs)) return line;
            const route = /\.m3u8(\?|$)/i.test(abs) ? 'm3u8' : 'seg';
            return `${origin}/spider/javmit/3/${route}?u=${encodeURIComponent(abs)}`;
        })
        .join('\n');
}

async function init() {
    return {};
}

async function home() {
    const [catHtml, listHtml] = await Promise.all([
        fetchText(`${SITE}/zh-CN/categories/`),
        fetchText(`${SITE}/zh-CN/`),
    ]);
    return {
        class: [
            { type_id: 'latest', type_name: '最新' },
            { type_id: 'uncensored', type_name: '无码' },
            ...parseCategories(catHtml),
        ],
        list: parseList(listHtml).slice(0, 24),
        filters: {},
    };
}

async function category(inReq) {
    const page = Math.max(parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1, 1);
    const tid = inReq.body.tid ?? inReq.body.id ?? 'latest';
    const html = await fetchText(buildListUrl(tid, page));
    const list = parseList(html);
    return {
        list,
        page,
        pagecount: parsePageCount(html, page),
        limit: 24,
        total: list.length ? 9999 : 0,
    };
}

async function detail(inReq) {
    let raw = String(Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id || '').trim();
    const page = raw.startsWith('http') ? raw : absUrl(raw.startsWith('/') ? raw : `/zh-CN/${raw}/`);
    const html = await fetchText(page);
    const $ = load(html);
    const name = cleanName($('h1').first().text() || $('meta[property="og:title"]').attr('content'));
    const pic = $('meta[property="og:image"]').attr('content') || $('video').attr('poster') || '';
    const play = extractPlayUrl(html);
    return {
        list: [
            {
                vod_id: page,
                vod_name: name || 'JAVMIT',
                vod_pic: pic,
                vod_play_from: 'HLS',
                vod_play_url: play ? `正片$${play}` : `正片$${page}`,
            },
        ],
    };
}

async function play(inReq) {
    const header = { 'User-Agent': UA };
    let url = String(inReq.body.id || '').trim();
    if (url.includes('$') && !url.startsWith('http')) url = url.split('$').pop().trim();

    let media = '';
    if (/\.m3u8(\?|$)/i.test(url)) media = url;
    else if (url.includes('javmit.com') || url.startsWith('/')) {
        const page = url.startsWith('http') ? url : absUrl(url);
        media = extractPlayUrl(await fetchText(page));
    }
    if (!media || !allowedMedia(media)) return { parse: 0, jx: 0, url: '', header };
    return {
        parse: 0,
        jx: 0,
        url: `${requestOrigin(inReq)}/spider/javmit/3/m3u8?u=${encodeURIComponent(media)}`,
        header,
    };
}

async function m3u8(inReq, reply) {
    const target = String(inReq.query.u || '').trim();
    if (!allowedMedia(target)) {
        reply.code(403);
        return 'forbidden';
    }
    let resp;
    try {
        resp = await req.get(target, {
            headers: headers(`${SITE}/`),
            timeout: 20000,
            responseType: 'text',
            validateStatus: () => true,
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
    reply.header('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Cache-Control', 'no-store');
    return reply.send(rewritePlaylist(text, target, requestOrigin(inReq)));
}

async function seg(inReq, reply) {
    const target = String(inReq.query.u || '').trim();
    if (!allowedMedia(target)) {
        reply.code(403);
        return 'forbidden';
    }
    const reqHeaders = headers(`${SITE}/`);
    if (inReq.headers.range) reqHeaders.Range = String(inReq.headers.range);
    let resp;
    try {
        resp = await req.get(target, {
            headers: reqHeaders,
            responseType: 'arraybuffer',
            timeout: 20000,
            validateStatus: () => true,
        });
    } catch {
        reply.code(502);
        return 'segment failed';
    }
    const buf = Buffer.isBuffer(resp.data) ? resp.data : Buffer.from(resp.data || []);
    if (resp.status >= 400 || buf.length < 188 || buf[0] !== 0x47) {
        reply.code(502);
        return 'segment failed';
    }
    reply.code(resp.status === 206 ? 206 : 200);
    reply.header('Content-Type', 'video/mp2t');
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Cache-Control', 'no-store');
    if (resp.headers['content-range']) reply.header('Content-Range', resp.headers['content-range']);
    return reply.send(buf);
}

async function search(inReq) {
    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    const page = Math.max(parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1, 1);
    if (!key) return { list: [], page: 1, pagecount: 1, limit: 24, total: 0 };
    const q = encodeURIComponent(key);
    const url = page > 1 ? `${SITE}/zh-CN/page/${page}/?s=${q}` : `${SITE}/zh-CN/?s=${q}`;
    const html = await fetchText(url);
    const list = parseList(html);
    return {
        list,
        page,
        pagecount: parsePageCount(html, page),
        limit: 24,
        total: list.length ? 9999 : 0,
    };
}

export default {
    meta: {
        key: 'javmit',
        name: '🌸JAVMIT',
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
    },
};
