import req from '../../util/req.js';
import { HttpsProxyAgent } from 'https-proxy-agent';

/**
 * Manko · https://manko.fun/home
 * SWX API（页面 window.ip / window.ip2）
 */

const SITE = 'https://manko.fun';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const SWX_ALPHABET =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~"';

const DEFAULT_API_HOSTS = ['healertanker.com', 'robustx.shop'];

const CLASSES = [
    { type_id: 'most_popular', type_name: '热门' },
    { type_id: 'top_rated', type_name: '高分' },
    { type_id: 'new', type_name: '最新' },
    { type_id: 'random', type_name: '随机' },
    { type_id: 'Censored', type_name: '有码' },
    { type_id: 'Uncensored', type_name: '无码' },
    { type_id: 'FC2', type_name: 'FC2' },
    { type_id: 'Leaked', type_name: 'Leaked' },
    { type_id: 'Western', type_name: '欧美' },
];

let apiHosts = [...DEFAULT_API_HOSTS];
let pageProxy = '';

function parseExtend(extend) {
    if (!extend) return {};
    if (typeof extend === 'string') {
        try {
            return JSON.parse(extend);
        } catch {
            return {};
        }
    }
    return typeof extend === 'object' ? extend : {};
}

function decodeSwx(raw) {
    const t = `${raw || ''}`;
    const n = t.length;
    const bytes = [];
    let acc = 0;
    let bits = 0;
    let prev = -1;
    for (let i = 0; i < n; i++) {
        const v = SWX_ALPHABET.indexOf(t[i]);
        if (v === -1) continue;
        if (prev < 0) prev = v;
        else {
            acc |= (prev += 91 * v) << bits;
            bits += (8191 & prev) > 88 ? 13 : 14;
            do {
                bytes.push(255 & acc);
                acc >>= 8;
                bits -= 8;
            } while (bits > 7);
            prev = -1;
        }
    }
    if (prev > -1) bytes.push(255 & (acc | (prev << bits)));
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
}

function playHeaders(referer = `${SITE}/`) {
    let origin = SITE;
    try {
        origin = new URL(referer).origin;
    } catch {
        /* keep */
    }
    return {
        'User-Agent': UA,
        Referer: referer,
        Origin: origin,
    };
}

function requestOrigin(inReq) {
    const proto = String(inReq?.headers?.['x-forwarded-proto'] || 'http').split(',')[0].trim();
    const host = inReq?.headers?.['x-forwarded-host'] || inReq?.headers?.host || '127.0.0.1';
    return `${proto}://${host}`;
}

function embedReferer(item) {
    const embed = item?.wasabi_embed_url || '';
    try {
        if (embed) return `${new URL(embed).origin}/`;
    } catch {
        /* keep */
    }
    return 'https://sadie-shop.site/';
}

function allowedMedia(url) {
    try {
        const u = new URL(url);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
        const host = u.hostname.toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return false;
        return true;
    } catch {
        return false;
    }
}

function unwrapProxy(part) {
    try {
        const u = new URL(part);
        if (!u.pathname.includes('/manko/')) return null;
        const upstream = u.searchParams.get('u');
        if (!upstream) return null;
        return {
            url: upstream,
            referer: u.searchParams.get('ref') || 'https://sadie-shop.site/',
        };
    } catch {
        return null;
    }
}

async function mediaPlaylist(masterUrl, referer) {
    const resp = await req.get(masterUrl, {
        headers: { ...playHeaders(referer), 'Accept-Encoding': 'identity' },
        timeout: 20000,
        responseType: 'text',
        validateStatus: () => true,
        proxy: false,
    });
    const text = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    if (resp.status >= 400 || !text.includes('#EXTM3U')) return '';
    if (text.includes('#EXTINF')) return masterUrl;
    const variants = text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
    if (!variants.length) return masterUrl;
    try {
        return new URL(variants[variants.length - 1], masterUrl).href;
    } catch {
        return masterUrl;
    }
}

function isPlaylist(url) {
    return /\.(m3u8|txt)(\?|$)/i.test(url || '');
}

function proxyMediaUrl(inReq, url, referer) {
    const origin = requestOrigin(inReq);
    const prefix = inReq?.server?.prefix || '/spider/manko/3';
    const kind = isPlaylist(url) ? 'm3u8' : 'seg';
    return `${origin}${prefix}/${kind}?u=${encodeURIComponent(url)}&ref=${encodeURIComponent(referer)}`;
}

function rewritePlaylist(text, playlistUrl, inReq, referer) {
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
                    return `URI="${proxyMediaUrl(inReq, abs, referer)}"`;
                });
            }
            let abs = '';
            try {
                abs = new URL(trimmed, playlistUrl).href;
            } catch {
                return line;
            }
            if (!allowedMedia(abs)) return line;
            return proxyMediaUrl(inReq, abs, referer);
        })
        .join('\n');
}

function pickStream(item) {
    if (!item || typeof item !== 'object') return { url: '', referer: embedReferer(item), parse: 0 };
    const referer = embedReferer(item);
    const direct = item.wasabi_url_1 || item.wasabi_url_2 || '';
    if (direct && /\.m3u8/i.test(direct)) {
        return { url: direct, referer, parse: 0 };
    }
    const embed = item.wasabi_embed_url || '';
    if (embed) return { url: embed, referer: `${SITE}/`, parse: 1 };
    const up18 = item.upload18_player?.[0] || '';
    if (up18) return { url: up18, referer: `${SITE}/`, parse: 1 };
    return { url: '', referer, parse: 0 };
}

async function resolvePlay(_inReq, raw) {
    let part = String(raw || '').trim();
    if (part.includes('$')) part = part.split('$').pop().trim();
    if (!part) return { url: '', header: playHeaders(), parse: 0 };

    const wrapped = unwrapProxy(part);
    if (wrapped) {
        const media = (await mediaPlaylist(wrapped.url, wrapped.referer)) || wrapped.url;
        return { parse: 0, url: media, header: playHeaders(wrapped.referer) };
    }

    if (/^https?:\/\//i.test(part) && /\.m3u8/i.test(part)) {
        const referer = 'https://sadie-shop.site/';
        const media = (await mediaPlaylist(part, referer)) || part;
        return { parse: 0, url: media, header: playHeaders(referer) };
    }

    if (/^https?:\/\//i.test(part)) {
        return { parse: 1, url: part, header: playHeaders(`${SITE}/`) };
    }

    const data = await swxGet(`swx/movie/detail/${encodeURIComponent(part)}`);
    const item = data?.movie || data?.data || data;
    const stream = pickStream(item);
    if (!stream.url) {
        return { parse: 0, url: '', header: playHeaders(stream.referer) };
    }
    if (stream.parse) {
        return { parse: 1, url: stream.url, header: playHeaders(stream.referer) };
    }
    const media = (await mediaPlaylist(stream.url, stream.referer)) || stream.url;
    return { parse: 0, url: media, header: playHeaders(stream.referer) };
}

async function fetchText(url, usePageProxy = false) {
    try {
        const opts = {
            headers: { 'User-Agent': UA, Referer: `${SITE}/` },
            timeout: 20000,
            responseType: 'text',
            validateStatus: () => true,
            proxy: false,
        };
        if (usePageProxy && pageProxy) {
            const agent = new HttpsProxyAgent(pageProxy);
            opts.httpsAgent = agent;
            opts.httpAgent = agent;
        }
        const r = await req.get(url, opts);
        if (r.status >= 400) return '';
        return typeof r.data === 'string' ? r.data : String(r.data || '');
    } catch {
        return '';
    }
}

function parseApiHosts(html) {
    const hosts = [];
    const m1 = html.match(/window\.ip\s*=\s*['"]([^'"]+)['"]/);
    const m2 = html.match(/window\.ip2\s*=\s*['"]([^'"]+)['"]/);
    if (m1?.[1]) hosts.push(m1[1].trim());
    if (m2?.[1] && !hosts.includes(m2[1].trim())) hosts.push(m2[1].trim());
    return hosts.filter(Boolean);
}

async function refreshApiHosts() {
    let html = await fetchText(`${SITE}/home`, false);
    if (!html) html = await fetchText(`${SITE}/home`, true);
    const parsed = parseApiHosts(html);
    if (parsed.length) apiHosts = parsed;
    else if (!apiHosts.length) apiHosts = [...DEFAULT_API_HOSTS];
}

function listPath(tid, page) {
    const pg = Math.max(1, parseInt(page, 10) || 1);
    const size = 24;
    const id = String(tid || 'most_popular');
    if (id === 'random') {
        return `swx/movie/random-list?page=${pg}&size=${size}`;
    }
    const q = [`page=${pg}`, `size=${size}`];
    if (id === 'most_popular') {
        q.push('most_popular=true', 'can18=true');
    } else if (id === 'top_rated') {
        q.push('top_rated=true');
    } else if (id === 'new') {
        /* 默认按更新时间 */
    } else {
        return `swx/movie/search?category=${encodeURIComponent(id)}&page=${pg}&size=${size}`;
    }
    return `swx/movie/search?${q.join('&')}`;
}

async function swxGet(path) {
    let lastErr = null;
    for (const host of apiHosts) {
        try {
            const r = await req.get(`https://${host}/${path.replace(/^\//, '')}`, {
                headers: playHeaders(),
                timeout: 25000,
                validateStatus: () => true,
                proxy: false,
            });
            if (r.status !== 200 || !r.data?.data) continue;
            return decodeSwx(r.data.data);
        } catch (e) {
            lastErr = e;
        }
    }
    if (lastErr) throw lastErr;
    return null;
}

function displayTitle(item) {
    if (!item) return '';
    const arr = item.title_display_name;
    if (Array.isArray(arr) && arr.length) {
        const zh = arr.find((x) => x.language === 'zh' || x.language === 'tw');
        if (zh?.title) return zh.title;
        if (arr[0]?.title) return arr[0].title;
    }
    return item.title || '';
}

function mapItem(item) {
    const id = item._id || item.id || '';
    return {
        vod_id: id,
        vod_name: displayTitle(item) || item.title || id,
        vod_pic: item.wide_thumbnail || item.thumbnail_image || '',
        vod_remarks: item.share_date || item.startyear || '',
    };
}

function normalizeList(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.movies)) return data.movies;
    if (Array.isArray(data?.list)) return data.list;
    if (Array.isArray(data?.data)) return data.data;
    return [];
}

async function init(inReq, _outResp) {
    pageProxy = '';
    const cfg = parseExtend(inReq.body.extend);
    const p = cfg.proxy || cfg.https || cfg.http;
    if (p) pageProxy = String(p);
    await refreshApiHosts();
    return {};
}

async function home(_inReq, _outResp) {
    const data = await swxGet(listPath('most_popular', 1));
    return {
        class: CLASSES,
        filters: {},
        list: normalizeList(data).map(mapItem),
        parse: 0,
        jx: 0,
    };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id || 'most_popular';
    const pg = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const data = await swxGet(listPath(tid, pg));
    const list = normalizeList(data).map(mapItem);
    return {
        list,
        page: pg,
        pagecount: list.length >= 24 ? pg + 1 : pg,
        limit: 24,
        total: 99999,
    };
}

async function detail(inReq, _outResp) {
    const id = String(inReq.body.id || '').trim();
    const data = await swxGet(`swx/movie/detail/${encodeURIComponent(id)}`);
    const item = data?.movie || data?.data || data;
    const playFlag = `正片$${id}`;
    return {
        list: [
            {
                vod_id: id,
                vod_name: displayTitle(item) || item?.title || id,
                vod_pic: item?.wide_thumbnail || item?.thumbnail_image || item?.cover_image || '',
                vod_content: item?.discription?.[0]?.overview || item?.description || '',
                vod_year: item?.startyear || '',
                vod_play_from: 'Manko',
                vod_play_url: playFlag,
            },
        ],
        parse: 0,
        jx: 0,
    };
}

async function play(inReq, _outResp) {
    const raw = inReq.body.id || inReq.body.flag || '';
    const out = await resolvePlay(inReq, raw);
    return {
        parse: out.parse,
        playUrl: '',
        url: out.url || '',
        jx: 0,
        header: out.header,
    };
}

async function proxyM3u8(inReq, reply) {
    const target = String(inReq.query?.u || '').trim();
    const referer = String(inReq.query?.ref || 'https://sadie-shop.site/');
    if (!target || !allowedMedia(target)) {
        reply.code(403);
        return 'forbidden';
    }
    let resp;
    try {
        resp = await req.get(target, {
            headers: { ...playHeaders(referer), 'Accept-Encoding': 'identity' },
            timeout: 20000,
            responseType: 'text',
            validateStatus: () => true,
            proxy: false,
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
    return reply.send(rewritePlaylist(text, target, inReq, referer));
}

async function proxySeg(inReq, reply) {
    const target = String(inReq.query?.u || '').trim();
    const referer = String(inReq.query?.ref || 'https://sadie-shop.site/');
    if (!target || !allowedMedia(target)) {
        reply.code(403);
        return 'forbidden';
    }
    const headers = { ...playHeaders(referer), 'Accept-Encoding': 'identity' };
    if (inReq.headers.range) headers.Range = String(inReq.headers.range);
    let resp;
    try {
        resp = await req.get(target, {
            headers,
            timeout: 20000,
            responseType: 'arraybuffer',
            validateStatus: () => true,
            proxy: false,
        });
    } catch {
        reply.code(502);
        return 'segment failed';
    }
    const buf = Buffer.isBuffer(resp.data) ? resp.data : Buffer.from(resp.data || []);
    const html = buf.length > 0 && (buf[0] === 0x3c || buf[0] === 0x7b);
    if (resp.status >= 400 || buf.length < 188 || html) {
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

async function search(inReq, _outResp) {
    const key = encodeURIComponent(inReq.body.wd || '');
    const pg = parseInt(inReq.body.pg || inReq.body.page || 1, 10) || 1;
    const data = await swxGet(`swx/movie/search?keyword=${key}&page=${pg}&size=24`);
    return { list: normalizeList(data).map(mapItem), page: pg };
}

export default {
    meta: {
        key: 'manko',
        name: '🌸Manko',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/m3u8', proxyM3u8);
        fastify.get('/seg', proxySeg);
    },
};
