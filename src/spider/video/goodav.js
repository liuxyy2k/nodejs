import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

const DEFAULT_SITE = 'https://goodav17.com';
const EMBED_HOST = 'https://ggjav.com';
const DEFAULT_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const PORT = process.env.DEV_HTTP_PORT || 9988;
const ENABLE_HLS_PROXY = false;

const FALLBACK_TYPES = [
    ['home', '首頁'], ['local', '本土自拍'], ['vr', 'VR'], ['人妻', '人妻'], ['素人', '素人'],
    ['巨乳', '巨乳'], ['無碼', '無碼'], ['中出', '中出'], ['OL', 'OL'], ['學生', '學生'],
    ['護士', '護士'], ['潮吹', '潮吹'], ['絲襪', '絲襪'], ['美腿', '美腿'], ['美尻', '美尻'],
    ['癡女', '癡女'], ['輕熟女', '輕熟女'], ['肛交', '肛交'], ['自慰', '自慰'],
    ['口爆', '口爆'], ['顏射', '顏射'], ['乳交', '乳交'], ['足交', '足交'],
];

let host = DEFAULT_SITE;
let timeout = 15000;
let requestHeaders = {};
let proxyAgent = null;

function resetHeaders() {
    requestHeaders = {
        'User-Agent': DEFAULT_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Referer: `${host}/`,
    };
}
resetHeaders();

function cleanText(text) {
    return String(text || '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

function pageNumber(value) {
    const page = parseInt(value, 10);
    return Number.isFinite(page) && page > 0 ? page : 1;
}

function fixUrl(url, base = host) {
    if (!url) return '';
    try {
        return new URL(String(url).replace(/&amp;/g, '&'), `${base.replace(/\/$/, '')}/`).href;
    } catch {
        return String(url);
    }
}

function decodeBase64(value) {
    if (!value) return '';
    try {
        const normalized = String(value).trim().replace(/ /g, '+');
        return Buffer.from(normalized, 'base64').toString('utf8');
    } catch {
        return '';
    }
}

function cleanDetailTitle(title) {
    return cleanText(
        String(title || '')
            .replace(/\s*[-|]\s*正妹AV.*$/i, '')
            .replace(/\s*\|\s*[^|]+$/, ''),
    );
}

function extractNumber(alt, name) {
    const match = `${alt || ''} ${name || ''}`.match(/\b(fc2[-_ ]?ppv\s*\d+|[a-z]{2,6}-\d{2,6})\b/i);
    if (!match) return '';
    let value = match[1].toUpperCase();
    if (value.startsWith('FC2')) value = `FC2-PPV ${value.split('PPV')[1].trim()}`;
    return value;
}

function parseMovies(rawHtml) {
    const html = String(rawHtml || '').replace(/<!--[\s\S]*?-->/g, '');
    const out = [];
    const seen = new Set();
    for (const part of html.split("<div class='movie'>").slice(1)) {
        const ids = [...part.matchAll(/\/(?:html|local_html)\/(\d+)\//g)];
        if (!ids.length || seen.has(ids[0][1])) continue;
        const vid = ids[0][1];
        seen.add(vid);
        const local = part.includes('local_html');
        const large = part.match(/large_image=['"]([^'"]+)/i);
        const image = part.match(/<img[^>]*src=['"]([^'"]+)/i);
        const pic = large?.[1] || image?.[1] || '';
        let name = '';
        for (const match of part.matchAll(/\/(?:html|local_html)\/\d+\/">([^<]*)<\/a>/gi)) {
            const candidate = cleanText(match[1]);
            if (candidate) name = candidate;
        }
        const alt = part.match(/alt=['"]([^'"]*)/i)?.[1] || '';
        out.push({
            vod_id: local ? `local_${vid}` : vid,
            vod_name: name,
            vod_pic: fixUrl(pic),
            vod_remarks: local ? '本土自拍' : extractNumber(alt, name),
        });
    }
    return out;
}

function maxPage(html) {
    return parseInt(String(html || '').match(/max_page\s*=\s*(\d+)/)?.[1] || '0', 10);
}

function isCfChallenge(text) {
    const low = String(text || '').toLowerCase();
    return (
        low.includes('cf-challenge') ||
        low.includes('__cf_chl') ||
        low.includes('just a moment') ||
        (low.includes('cloudflare') && low.includes('captcha'))
    );
}

function axiosOptions(extraHeaders = {}) {
    const options = {
        headers: { ...requestHeaders, ...extraHeaders },
        timeout,
        responseType: 'text',
        validateStatus: () => true,
    };
    if (proxyAgent) {
        options.httpAgent = proxyAgent;
        options.httpsAgent = proxyAgent;
        options.proxy = false;
    }
    return options;
}

async function fetchText(url, extraHeaders = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const response = await axios.get(url, axiosOptions(extraHeaders));
            const text = typeof response.data === 'string' ? response.data : String(response.data || '');
            if (response.status === 200 && !isCfChallenge(text)) return text;
        } catch {
            // Retry once.
        }
    }
    return '';
}

function parseExtend(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    const text = String(raw).trim();
    if (!text) return {};
    try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return /^https?:\/\//i.test(text) ? { host: text } : {};
    }
}

function applyConfig(raw) {
    const config = parseExtend(raw);
    const configuredHost = String(config.host || config.HOST || '').trim().replace(/\/$/, '');
    host = /^https?:\/\//i.test(configuredHost) ? configuredHost : DEFAULT_SITE;
    resetHeaders();
    const ua = String(config.userAgent || config['User-Agent'] || config.ua || '').trim();
    if (ua) requestHeaders['User-Agent'] = ua;
    const cookie = String(config.cookie || config.Cookie || '').trim();
    if (cookie) requestHeaders.Cookie = cookie;
    const referer = String(config.referer || config.Referer || '').trim();
    if (/^https?:\/\//i.test(referer)) requestHeaders.Referer = referer;
    timeout = Math.max(3000, (parseInt(config.timeout, 10) || 15) * 1000);
    const proxy = String(config.proxy || '').trim();
    proxyAgent = /^https?:\/\//i.test(proxy) ? new HttpsProxyAgent(proxy) : null;
}

function proxyBase(inReq, route) {
    const prefix = inReq?.server?.prefix || '/spider/goodav/3';
    return `http://127.0.0.1:${PORT}${prefix}/${route}`;
}

function cleanM3u8(raw, base, proxyUrl) {
    return String(raw || '')
        .split(/\r?\n/)
        .map((original) => {
            const line = original.trim();
            if (!line || line.startsWith('#')) return original;
            const url = fixUrl(line, base).replace(/ /g, '%20');
            return /\.m3u8(?:$|\?)/i.test(url)
                ? `${proxyUrl}?url=${encodeURIComponent(url)}`
                : url;
        })
        .join('\n');
}

async function init(inReq) {
    applyConfig(inReq?.body?.extend);
    return {};
}

async function home() {
    const html = await fetchText(`${host}/1/`);
    const types = [];
    for (const match of html.matchAll(/href="[^"]*\/type\/([^"/]+)\/1\/"\s*>([^<]+)</g)) {
        const id = match[1];
        const name = cleanText(match[2]);
        if (id && name && !types.some(([existing]) => existing === id)) types.push([id, name]);
    }
    const classes = (types.length ? types : FALLBACK_TYPES).map(([type_id, type_name]) => ({
        type_id,
        type_name,
    }));
    return { class: classes, filters: {}, list: parseMovies(html) };
}

async function category(inReq) {
    const tid = String(inReq.body.id || '');
    const page = pageNumber(inReq.body.page);
    let url;
    if (/^https?:\/\//i.test(tid)) url = tid;
    else if (tid === 'home' || tid === '首頁') url = `${host}/${page}/`;
    else if (['local', '本土', '本土自拍'].includes(tid)) url = `${host}/local/${page}/`;
    else if (tid.startsWith('local_')) url = `${host}/local_type/${encodeURIComponent(tid.slice(6))}/${page}/`;
    else if (tid === 'vr') url = `${host}/vr/${page}/`;
    else url = `${host}/type/${encodeURIComponent(tid)}/${page}/`;
    const html = await fetchText(url);
    const list = parseMovies(html);
    const maximum = maxPage(html);
    return {
        list,
        page,
        pagecount: maximum > 0 ? maximum : page + 1,
        limit: 24,
        total: list.length,
    };
}

async function detail(inReq) {
    let vid = inReq.body.id;
    if (Array.isArray(vid)) vid = vid[0];
    vid = String(vid || '').trim();
    if (!vid) return { list: [] };
    const local = vid.startsWith('local_');
    const nid = local ? vid.slice(6) : vid;
    const url = /^https?:\/\//i.test(vid)
        ? vid
        : local
          ? `${host}/local_html/${nid}/`
          : `${host}/html/${nid}/`;
    const html = await fetchText(url);
    if (!html) return { list: [] };

    const name = cleanDetailTitle(html.match(/<title>([^<]*)<\/title>/is)?.[1] || '');
    const pic =
        html.match(/<div id='m_image'>[\s\S]*?<img[^>]*src=['"]([^'"]+)/i)?.[1] ||
        html.match(/property=["']og:image["'][^>]*content=["']([^"']+)/i)?.[1] ||
        '';
    const remarks = cleanText(
        html.match(/<div id='m_designation'[^>]*>[\s\S]*?<font[^>]*>\s*([^<]+)/i)?.[1] || '',
    );
    const urls = [];
    for (const match of html.matchAll(/<iframe[^>]*video_frame[^>]*src=['"]([^'"]+)/gi)) {
        const embed = fixUrl(match[1].replace(/&amp;/g, '&'));
        let playUrl = '';
        const encoded = embed.match(/[?&]u=([^&\s]+)/)?.[1];
        if (encoded) {
            const decoded = decodeBase64(decodeURIComponent(encoded));
            if (decoded) playUrl = decoded.toLowerCase().endsWith('.m3u8') ? decoded : `${decoded}/index.m3u8`;
        } else {
            const embedHtml = await fetchText(embed, { Referer: `${host}/` });
            playUrl = embedHtml.match(/<video[^>]*\ssrc=['"]([^'"]+)/i)?.[1] || '';
            playUrl = fixUrl(playUrl, embed);
        }
        if (playUrl) {
            playUrl = playUrl.replace(/ /g, '%20');
            if (ENABLE_HLS_PROXY && playUrl.includes('%20')) {
                playUrl = `${proxyBase(inReq, 'hls')}?url=${encodeURIComponent(playUrl)}`;
            }
            if (!urls.includes(playUrl)) urls.push(playUrl);
        }
    }
    const playUrl = urls
        .map((item, index) => `${urls.length > 1 ? `播放${index + 1}` : '播放'}$${item}`)
        .join('#');
    return {
        list: [
            {
                vod_id: vid,
                vod_name: name,
                vod_pic: fixUrl(pic),
                vod_remarks: remarks,
                vod_play_from: '正妹AV',
                vod_play_url: playUrl,
            },
        ],
    };
}

async function search(inReq) {
    const page = pageNumber(inReq.body.page);
    const key = String(inReq.body.wd || '').trim();
    if (!key) return { list: [], page: 1, pagecount: 1, limit: 24, total: 0 };
    const html = await fetchText(`${host}/search/${encodeURIComponent(key)}/${page}/`);
    const list = parseMovies(html);
    const maximum = maxPage(html);
    return {
        list,
        page,
        pagecount: maximum > 0 ? maximum : page + 1,
        limit: 24,
        total: list.length,
    };
}

async function play(inReq) {
    const url = String(inReq.body.id || '').trim();
    if (!/^https?:\/\//i.test(url)) return { parse: 1, url: '', header: {} };
    const referer = url.includes('porn87.com') ? 'https://porn87.com/' : `${EMBED_HOST}/`;
    return {
        parse: 0,
        url,
        header: {
            Referer: referer,
            'User-Agent': requestHeaders['User-Agent'] || DEFAULT_UA,
        },
    };
}

async function hlsProxy(inReq, reply) {
    try {
        const url = String(inReq.query.url || '').replace(/ /g, '%20');
        if (!/^https?:\/\//i.test(url)) return reply.code(400).send('');
        const response = await axios.get(url, {
            ...axiosOptions({ Referer: `${EMBED_HOST}/` }),
            responseType: 'text',
        });
        if (response.status !== 200) return reply.code(404).send('');
        const cleaned = cleanM3u8(response.data, url, proxyBase(inReq, 'hls'));
        reply.header('Content-Type', 'application/vnd.apple.mpegurl').send(cleaned);
    } catch {
        reply.code(404).send('');
    }
}

async function imageProxy(inReq, reply) {
    try {
        const url = String(inReq.query.url || '');
        if (!/^https?:\/\//i.test(url)) return reply.code(400).send('');
        const options = axiosOptions({ Referer: `${host}/` });
        options.responseType = 'arraybuffer';
        const response = await axios.get(url, options);
        if (response.status !== 200) return reply.code(404).send('');
        reply
            .header('Content-Type', response.headers['content-type'] || 'image/jpeg')
            .send(Buffer.from(response.data));
    } catch {
        const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
        reply.header('Content-Type', 'image/gif').send(gif);
    }
}

export default {
    meta: {
        key: 'goodav',
        name: '🔥正妹AV',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/hls', hlsProxy);
        fastify.get('/img', imageProxy);
    },
};
