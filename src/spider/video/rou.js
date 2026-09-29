import req from '../../util/req.js';
import zlib from 'zlib';

/**
 * 肉视频 rou.video
 * 播放：index.jpg/png 改 m3u8 直通；PNG roUd 块经本地 proxy 解包
 */

const SITE_URL = 'https://rou.video';
const PORT = process.env.DEV_HTTP_PORT || 9988;
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const CLASSES = [
    { type_id: '/v?order=createdAt', type_name: '🔥最新发布' },
    { type_id: '/v?order=viewCount', type_name: '👑最多播放' },
    { type_id: '/v?order=likeCount', type_name: '❤️最受喜爱' },
    { type_id: '/t/AI短劇', type_name: '🤖AI成人短剧' },
    { type_id: '/t/自拍流出', type_name: '📱自拍流出' },
    { type_id: '/t/探花', type_name: '🕵️探花精选' },
    { type_id: '/t/國產AV', type_name: '🇨🇳国产AV' },
    { type_id: '/t/日本', type_name: '🇯🇵日本精选' },
    { type_id: '/t/中文字幕', type_name: '🀄中文字幕' },
    { type_id: '/t/麻豆傳媒', type_name: '麻豆传媒' },
    { type_id: '/t/糖心Vlog', type_name: '糖心Vlog' },
    { type_id: '/t/蜜桃影像傳媒', type_name: '蜜桃传媒' },
    { type_id: '/t/香蕉視頻傳媒', type_name: '香蕉视频' },
    { type_id: '/t/星空無限傳媒', type_name: '星空无限' },
    { type_id: '/t/天美傳媒', type_name: '天美传媒' },
    { type_id: '/t/OnlyFans', type_name: 'OnlyFans' },
    { type_id: '/t/巨乳', type_name: '巨乳' },
    { type_id: '/t/人妻', type_name: '人妻' },
    { type_id: '/t/絲襪', type_name: '丝袜' },
    { type_id: '/t/熟女', type_name: '熟女' },
    { type_id: '/t/美少女', type_name: '美少女' },
    { type_id: '/t/中出', type_name: '中出' },
    { type_id: '/t/口交', type_name: '口交' },
    { type_id: '/t/痴女', type_name: '痴女' },
    { type_id: '/t/多人運動', type_name: '多人运动' },
    { type_id: '/t/NTR', type_name: 'NTR' },
];

let options = {};
let siteUrl = SITE_URL;

function applyConfig(extend) {
    options = {};
    if (!extend) return;
    if (typeof extend === 'object' && extend !== null) {
        options = { ...extend };
        return;
    }
    const raw = String(extend).trim();
    if (!raw) return;
    if (raw.startsWith('{')) {
        try { options = JSON.parse(raw); } catch { /* ignore */ }
    }
}

function htmlUnescape(s) {
    return String(s || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function fetchHeaders(referer = '') {
    return {
        'User-Agent': UA,
        Referer: referer || `${siteUrl}/v`,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Origin: siteUrl,
        Connection: 'keep-alive',
    };
}

function binHeaders(referer = '') {
    return {
        'User-Agent': UA,
        Referer: referer || `${siteUrl}/`,
        Accept: '*/*',
        Origin: siteUrl,
        Connection: 'keep-alive',
    };
}

function absUrl(url) {
    if (!url) return '';
    url = String(url).trim();
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) return `${siteUrl}${url}`;
    return `${siteUrl}/${url}`;
}

function ensureHost() {
    const configured = options.siteUrl || SITE_URL;
    siteUrl = String(configured).replace(/\/$/, '');
    return siteUrl;
}

async function fetchHtml(targetUrl, { referer = '' } = {}) {
    if (!targetUrl) return { code: 0, text: '' };
    let url = targetUrl;
    if (url.startsWith('//')) url = `https:${url}`;
    else if (url.startsWith('/')) url = absUrl(url);

    try {
        const resp = await req.get(url, {
            headers: fetchHeaders(referer),
            timeout: 20000,
            validateStatus: () => true,
        });
        const code = resp.status;
        const text = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
        if (code >= 400) return { code, text: '' };
        return { code, text };
    } catch (e) {
        console.warn('[rou] fetch err', e.message);
        return { code: -1, text: '' };
    }
}

async function fetchBin(targetUrl, referer = '') {
    let url = absUrl(targetUrl);
    const resp = await req.get(url, {
        headers: binHeaders(referer),
        responseType: 'arraybuffer',
        timeout: 20000,
        maxRedirects: 10,
        validateStatus: () => true,
    });
    const body = Buffer.from(resp.data || []);
    const finalUrl = resp.request?.res?.responseUrl || url;
    return { finalUrl, body, status: resp.status };
}

function pngRoud(body) {
    if (!body || body.length < 8 || body[0] !== 0x89 || body[1] !== 0x50) return null;
    let pos = 8;
    while (pos + 8 <= body.length) {
        const length = body.readUInt32BE(pos);
        const ctype = body.subarray(pos + 4, pos + 8).toString('ascii');
        const data = body.subarray(pos + 8, pos + 8 + length);
        if (ctype === 'roUd') return data;
        pos += 12 + length;
        if (ctype === 'IEND') break;
    }
    return null;
}

function unwrapBody(body) {
    if (!body || !body.length) return { kind: 'raw', data: body };
    if (body.subarray(0, 4).toString('utf8') === '#EXT' || body[0] === 0x23) {
        return { kind: 'm3u8', data: body };
    }
    if (body[0] === 0x47) return { kind: 'ts', data: body };
    const roud = pngRoud(body);
    if (!roud || roud.length < 2) return { kind: 'raw', data: body };
    const flag = roud[0];
    const payload = roud.subarray(1);
    if (flag === 1) {
        try {
            return { kind: 'm3u8', data: zlib.inflateSync(payload) };
        } catch {
            try {
                return { kind: 'm3u8', data: zlib.inflateRawSync(payload) };
            } catch {
                return { kind: 'raw', data: body };
            }
        }
    }
    if (flag === 0) return { kind: 'ts', data: payload };
    try {
        return { kind: 'm3u8', data: zlib.inflateSync(payload) };
    } catch {
        if (payload[0] === 0x47) return { kind: 'ts', data: payload };
        return { kind: 'raw', data: body };
    }
}

function toM3u8Name(url) {
    if (!url) return url;
    let u = String(url);
    for (const [a, b] of [
        ['index.jpg', 'index.m3u8'],
        ['index.png', 'index.m3u8'],
        ['index.jpeg', 'index.m3u8'],
    ]) {
        u = u.split(a).join(b);
    }
    return u;
}

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/rouvideo/3';
    const hostHeader = inReq?.headers?.['x-forwarded-host'] || inReq?.headers?.host;
    if (hostHeader) {
        const proto = inReq?.headers?.['x-forwarded-proto'] || 'http';
        return `${proto}://${hostHeader}${prefix}`;
    }
    return `http://127.0.0.1:${PORT}${prefix}`;
}

function proxyLink(inReq, typeName, targetUrl) {
    return `${getProxyBase(inReq)}/proxy?type=${encodeURIComponent(typeName)}&url=${encodeURIComponent(targetUrl)}`;
}

function playHeaders(referer = '') {
    return {
        'User-Agent': UA,
        Referer: referer || `${siteUrl}/`,
        Origin: siteUrl,
        Accept: '*/*',
        Connection: 'keep-alive',
    };
}

function formatDuration(sec) {
    const n = parseInt(sec, 10) || 0;
    if (!n) return 'HD';
    const m = Math.floor(n / 60);
    const s = n % 60;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return h ? `${h}:${String(mm).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(mm).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function encodePkg(vid, title) {
    const payload = JSON.stringify({ vid: String(vid).trim(), title: htmlUnescape(title || '') });
    const b64 = Buffer.from(payload, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `pkg_${b64}`;
}

function normalizeVid(raw) {
    let vid = String(raw || '').trim();
    if (vid.includes('/v/')) vid = vid.split('/v/').pop();
    vid = vid.replace(/^\/+|\/+$/g, '').split(/[?#]/)[0];
    return vid;
}

function decodePkg(rawId) {
    const raw = String(rawId || '').trim();
    if (!raw.startsWith('pkg_')) {
        return { vid: normalizeVid(raw), title: '' };
    }
    try {
        let b64 = raw.slice(4);
        const pad = (4 - (b64.length % 4)) % 4;
        if (pad) b64 += '='.repeat(pad);
        b64 = b64.replace(/-/g, '+').replace(/_/g, '/');
        const pkg = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
        return { vid: pkg.vid || '', title: pkg.title || '' };
    } catch {
        return { vid: raw.slice(4), title: '' };
    }
}

function parseVodListFromNext(htmlText) {
    const m = String(htmlText || '').match(/<script\s+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!m) return [];
    try {
        const dataObj = JSON.parse(m[1].trim());
        const videoList = dataObj?.props?.pageProps?.videos || [];
        const cards = [];
        for (const v of videoList) {
            const vid = normalizeVid(v.id || v.vid || '');
            if (!vid) continue;
            const name = htmlUnescape(v.nameZh || v.name || '肉视频');
            cards.push({
                vod_id: encodePkg(vid, name),
                vod_name: name,
                vod_pic: v.coverImageUrl || '',
                vod_remarks: formatDuration(v.duration),
                style: { type: 'rect', ratio: 1.78 },
            });
        }
        return cards;
    } catch {
        return [];
    }
}

function parseVodListFromHtml(htmlText) {
    const cards = [];
    const seen = new Set();
    const re = /<a[^>]+href=["'](\/v\/[^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    for (const m of String(htmlText || '').matchAll(re)) {
        const vid = normalizeVid(m[1]);
        if (!vid || seen.has(vid)) continue;
        seen.add(vid);
        const inner = m[2] || '';
        const altM = inner.match(/alt=["']([^"']+)["']/i);
        const srcM = inner.match(/(?:data-src|data-original|src)=["']([^"']+)["']/i);
        let pic = srcM?.[1]?.trim() || '';
        if (pic.startsWith('//')) pic = `https:${pic}`;
        if (pic.endsWith('.svg') || pic.includes('logo')) pic = '';
        const name = htmlUnescape(altM?.[1]?.trim() || vid);
        cards.push({
            vod_id: encodePkg(vid, name),
            vod_name: name,
            vod_pic: pic,
            vod_remarks: 'HD',
            style: { type: 'rect', ratio: 1.78 },
        });
    }
    return cards;
}

function parseVodList(htmlText) {
    const fromNext = parseVodListFromNext(htmlText);
    if (fromNext.length) return fromNext;
    return parseVodListFromHtml(htmlText);
}

async function resolveHlsFinal(vid) {
    const api = `${siteUrl}/api/hls/${vid}`;
    try {
        const resp = await req.get(api, {
            headers: binHeaders(`${siteUrl}/v/${vid}`),
            timeout: 12000,
            maxRedirects: 10,
            validateStatus: () => true,
            responseType: 'arraybuffer',
        });
        const finalUrl = resp.request?.res?.responseUrl || api;
        const body = Buffer.from(resp.data || []);
        if (body.subarray(0, 4).toString('utf8') === '#EXT') {
            return { final: toM3u8Name(finalUrl), plainM3u8: true };
        }
        return { final: finalUrl, plainM3u8: false, body };
    } catch {
        return { final: api, plainM3u8: false };
    }
}

async function init(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    ensureHost();
    return {};
}

async function home(inReq, _outResp) {
    ensureHost();
    const res = await fetchHtml('/v?order=createdAt');
    const list = parseVodList(res.text).slice(0, 20);
    return { class: CLASSES, filters: {}, list };
}

async function category(inReq, _outResp) {
    ensureHost();
    const pg = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);
    let path = String(inReq.body.id || '/v?order=createdAt').trim();
    if (!path.startsWith('/')) path = `/${path}`;
    const sep = path.includes('?') ? '&' : '?';
    const res = await fetchHtml(`${path}${sep}page=${pg}`);
    const list = parseVodList(res.text);
    return {
        page: pg,
        pagecount: list.length >= 12 ? pg + 1 : pg,
        limit: list.length,
        total: 9999,
        list,
    };
}

async function detail(inReq, _outResp) {
    ensureHost();
    const rawId = Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id;
    const { vid, title: cachedTitle } = decodePkg(rawId);
    if (!vid) return { list: [] };

    const res = await fetchHtml(`/v/${vid}`, { referer: `${siteUrl}/v/${vid}` });
    let vodName = cachedTitle || '肉视频';
    let vodPic = '';
    let tagStr = '';
    let desc = '';

    const html = res.text || '';
    const m = html.match(/<script\s+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (m) {
        try {
            const dataObj = JSON.parse(m[1].trim());
            const videoObj = dataObj?.props?.pageProps?.video || {};
            if (videoObj) {
                if (!cachedTitle) vodName = htmlUnescape(videoObj.nameZh || videoObj.name || vodName);
                vodPic = videoObj.coverImageUrl || '';
                const tags = videoObj.tagsZh || videoObj.tags || [];
                tagStr = Array.isArray(tags) ? tags.map(String).join(', ') : String(tags || '');
                desc = videoObj.description || '';
            }
        } catch { /* ignore */ }
    }
    if (!vodPic) {
        const ogPic = html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i);
        if (ogPic) vodPic = ogPic[1].trim();
    }
    if (!cachedTitle || vodName === '肉视频') {
        const ogTitle = html.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i);
        const h1Title = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        const rawTitle = ogTitle?.[1] || h1Title?.[1] || '';
        if (rawTitle) {
            vodName = htmlUnescape(rawTitle.split(' - ')[0].split(' | ')[0].trim());
        }
    }
    if (!desc) {
        const ogDesc = html.match(/property=["']og:description["']\s+content=["']([^"']+)["']/i);
        if (ogDesc) desc = ogDesc[1].trim();
    }

    const contentParts = [];
    if (tagStr) contentParts.push(`标签: ${tagStr}`);
    if (desc) contentParts.push(desc);
    contentParts.push(`节点: ${siteUrl}`);

    const api = `${siteUrl}/api/hls/${vid}`;
    const hls = await resolveHlsFinal(vid);
    const final = hls.final || api;
    const playProxy = proxyLink(inReq, 'rouhls', final);
    const playApiProxy = proxyLink(inReq, 'rouhls', api);

    return {
        list: [{
            vod_id: String(rawId),
            vod_name: htmlUnescape(vodName),
            vod_pic: vodPic,
            vod_remarks: 'HD正片',
            vod_content: contentParts.join('\n'),
            vod_play_from: '肉视频专线$$$API线路',
            vod_play_url: `正片$${playProxy}$$$正片$${playApiProxy}`,
        }],
    };
}

async function play(inReq, _outResp) {
    ensureHost();
    let playUrl = String(inReq.body.id || '').trim();
    const header = playHeaders();

    if (playUrl.includes('type=rouhls') || playUrl.includes('type=routs') || playUrl.includes('/proxy?')) {
        return { parse: 0, jx: 0, url: playUrl, header, format: 'application/x-mpegURL' };
    }

    if (playUrl.startsWith('http') || playUrl.startsWith('/')) {
        if (playUrl.startsWith('/')) playUrl = absUrl(playUrl);
        if (playUrl.includes('/api/hls/')) {
            try {
                const { finalUrl, body } = await fetchBin(playUrl, `${siteUrl}/v`);
                if (body.subarray(0, 4).toString('utf8') === '#EXT') {
                    return {
                        parse: 0,
                        jx: 0,
                        url: toM3u8Name(finalUrl),
                        header,
                        format: 'application/x-mpegURL',
                    };
                }
                playUrl = finalUrl;
            } catch { /* fallback proxy */ }
        }
        playUrl = proxyLink(inReq, 'rouhls', playUrl);
    }

    return {
        parse: 0,
        jx: 0,
        url: playUrl,
        header,
        format: 'application/x-mpegURL',
    };
}

async function search(inReq, _outResp) {
    ensureHost();
    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    const pg = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);
    if (!key) {
        return { page: pg, pagecount: pg, limit: 0, total: 0, list: [] };
    }
    const searchPath = `/search?q=${encodeURIComponent(key)}&page=${pg}`;
    const res = await fetchHtml(searchPath);
    const list = parseVodList(res.text);
    return {
        page: pg,
        pagecount: list.length >= 12 ? pg + 1 : pg,
        limit: list.length,
        total: 9999,
        list,
    };
}

async function streamProxy(inReq, reply) {
    try {
        ensureHost();
        let url = inReq.query.url || inReq.query.path || '';
        const typ = String(inReq.query.type || inReq.query.do || inReq.query.cate || 'rouhls');
        if (!url) return reply.code(404).send('missing url');
        try { url = decodeURIComponent(url); } catch { /* ignore */ }

        const { body } = await fetchBin(url, `${siteUrl}/`);
        let { kind, data } = unwrapBody(body);

        if (typ === 'routs' || kind === 'ts') {
            if (kind !== 'ts') ({ kind, data } = unwrapBody(body));
            if (kind === 'ts' && data?.length) {
                return reply.code(200).header('Content-Type', 'video/mp2t').send(data);
            }
            if (body?.length && body[0] === 0x47) {
                return reply.code(200).header('Content-Type', 'video/mp2t').send(body);
            }
            return reply.code(200).header('Content-Type', 'application/octet-stream').send(body);
        }

        if (kind !== 'm3u8' || !data?.length) {
            return reply.code(502).send('unwrap m3u8 failed');
        }

        const text = data.toString('utf8');
        const lines = text.split(/\r?\n/).map((line) => {
            const s = line.trim();
            if (s && !s.startsWith('#') && /^https?:\/\//i.test(s)) {
                return proxyLink(inReq, 'routs', s);
            }
            return line;
        });
        const out = `${lines.join('\n')}\n`;
        return reply.code(200).header('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8').send(out);
    } catch (e) {
        console.warn('[rou] proxy err', e.message);
        return reply.code(500).send(String(e.message || 'proxy error'));
    }
}

export default {
    meta: {
        key: 'rouvideo',
        name: '🌸肉视频',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/proxy', streamProxy);
    },
};
