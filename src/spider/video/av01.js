import req from '../../util/req.js';
import { config } from './config.js';
import { apiOriginFromReq } from '../../util/m3u8Gateway.js';

const site = 'https://www.av01.media';
const cdnHost = 'https://customers.iw01.xyz';
const lang = 'cn';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const GEO_URL = 'https://files.iw01.xyz/edge/geo.js?json';
const CF_API = config.CF_API;
const CF_KEY = 'mira123';
const MAX_HEIGHT = 720;

let geoCache = null;
let geoTime = 0;

function parseJson(data) {
    if (data && typeof data === 'object') return data;
    const text = String(data || '');
    const m = text.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    try {
        return JSON.parse(m ? m[1] : text);
    } catch {
        return null;
    }
}

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/av01/3';
    const origin = inReq ? apiOriginFromReq(inReq) : `http://127.0.0.1:${process.env.DEV_HTTP_PORT || 9988}`;
    return `${origin}${prefix}`;
}

function proxyPlayUrl(target, referer, inReq) {
    return `${getProxyBase(inReq)}/proxy.m3u8?url=${encodeURIComponent(target)}&referer=${encodeURIComponent(referer)}`;
}

function proxySegUrl(target, referer, inReq) {
    return `${getProxyBase(inReq)}/proxy.seg?url=${encodeURIComponent(target)}&referer=${encodeURIComponent(referer)}`;
}

function fetchHeaders(url, referer = site) {
    const headers = {
        'User-Agent': UA,
        Referer: referer,
        Origin: site,
        Accept: '*/*',
    };
    if (String(url).includes('customers.iw01.xyz') || String(url).includes('files.iw01.xyz')) {
        headers.Referer = referer;
        headers.Origin = site;
    }
    return headers;
}

async function cfFetch(url, referer = site) {
    try {
        const resp = await req.post(CF_API, { url, referer, key: CF_KEY }, {
            timeout: 90000,
            validateStatus: () => true,
        });
        if (resp.status !== 200 || resp.data == null) return null;
        const data = resp.data;
        if (typeof data === 'string') return data;
        return data.html || data.body || data.content || null;
    } catch {
        /* ignore */
    }
    return null;
}

async function fetchText(url, referer = site) {
    try {
        const resp = await req.get(url, {
            headers: fetchHeaders(url, referer),
            timeout: 45000,
            responseType: 'text',
            validateStatus: () => true,
        });
        const text = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
        if (resp.status === 200 && text.includes('#EXTM3U')) return text;
    } catch {
        /* ignore */
    }
    const data = await cfFetch(url, referer);
    const text = typeof data === 'string' ? data : '';
    return text.includes('#EXTM3U') ? text : '';
}

async function fetchBytes(url, referer = site) {
    try {
        const resp = await req.get(url, {
            headers: fetchHeaders(url, referer),
            timeout: 60000,
            responseType: 'arraybuffer',
            validateStatus: () => true,
        });
        if (resp.status === 200 && resp.data?.byteLength) return Buffer.from(resp.data);
    } catch {
        /* ignore */
    }
    return Buffer.alloc(0);
}

async function httpGet(url, referer = site) {
    try {
        const resp = await req.get(url, {
            headers: { ...fetchHeaders(url, referer), Accept: 'application/json,text/plain,*/*' },
            timeout: 45000,
            validateStatus: () => true,
        });
        if (resp.status === 200) return parseJson(resp.data);
    } catch {
        /* ignore */
    }
    return parseJson(await cfFetch(url, referer));
}

async function httpPost(url, body) {
    try {
        const resp = await req.post(url, body, {
            headers: {
                'User-Agent': UA,
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            timeout: 45000,
            validateStatus: () => true,
        });
        if (resp.status === 200) return parseJson(resp.data);
    } catch {
        /* ignore */
    }
    return null;
}

async function apiGet(path, referer = site) {
    return httpGet(`${site}/api/v1/${path.replace(/^\//, '')}`, referer);
}

async function apiPost(path, body) {
    return httpPost(`${site}/api/v1/${path.replace(/^\//, '')}`, body);
}

async function getGeo(force = false) {
    if (!force && geoCache && Date.now() - geoTime < 300000) return geoCache;
    let data = null;
    try {
        const resp = await req.get(GEO_URL, {
            headers: { 'User-Agent': UA, Accept: 'application/json' },
            timeout: 30000,
            validateStatus: () => true,
        });
        if (resp.status === 200) data = parseJson(resp.data);
    } catch {
        /* ignore */
    }
    if (!data?.token_v2) data = parseJson(await cfFetch(GEO_URL, site));
    if (data?.token_v2) {
        geoCache = data;
        geoTime = Date.now();
    }
    return data;
}

function geoQuery(geo) {
    return `expires=${geo.expires}&ip=${encodeURIComponent(geo.ip)}&token_v2=${encodeURIComponent(geo.token_v2)}`;
}

function tName(item, field = 'title') {
    const trans = item?.[`${field}_translations`];
    return trans?.cn || trans?.tw || trans?.en || item?.[field] || '';
}

function buildCover(v, geo) {
    if (!v?.id) return '';
    if (geo?.token_v2 && (v.r2_status === 'COMPLETE' || v.r2_status === 'COVER_ONLY' || geo.r2_cover)) {
        return `https://files.iw01.xyz/covers/${v.id}/640.jpg?${geoQuery(geo)}`;
    }
    if (v.storage_base) {
        return `https://static.av01.tv/v2${v.storage_base}/800.webp`;
    }
    return `https://static.av01.tv/v2/${v.id}/800.webp`;
}

function fmtDuration(sec) {
    const n = parseInt(sec, 10);
    if (!n) return '';
    const h = Math.floor(n / 3600);
    const m = Math.floor((n % 3600) / 60);
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}` : `${m}:${String(n % 60).padStart(2, '0')}`;
}

function toVod(v, geo) {
    return {
        vod_id: String(v.id),
        vod_name: tName(v) || v.dvd_id || String(v.id),
        vod_pic: buildCover(v, geo),
        vod_remarks: v.dvd_id || fmtDuration(v.duration) || '',
    };
}

function buildListPath(tid, page, limit = 24) {
    const id = String(tid || 'latest');
    const pg = parseInt(page, 10) || 1;
    if (id === 'hottest') return `videos/types/hottest?page=${pg}&limit=${limit}`;
    if (id === 'latest') return `videos/types/latest?page=${pg}&limit=${limit}`;
    const m = id.match(/^(tag|maker|actress):(\d+)$/);
    if (m) return `videos/${m[1]}/${m[2]}?page=${pg}&limit=${limit}`;
    return `videos/types/latest?page=${pg}&limit=${limit}`;
}

function decodePlaylist(data) {
    if (typeof data === 'string') return data.includes('#EXTM3U') ? data : '';
    const src = data?.src || '';
    if (!src.startsWith('data:')) return '';
    const b64 = src.split('base64,')[1];
    if (!b64) return '';
    try {
        return Buffer.from(b64, 'base64').toString('utf8');
    } catch {
        return '';
    }
}

function pickStreamUrl(m3u8) {
    const lines = String(m3u8 || '').split('\n');
    let best = '';
    let pick720 = '';
    let pick360 = '';
    let bestH = 0;
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/RESOLUTION=\d+x(\d+)/);
        if (!m) continue;
        const h = parseInt(m[1], 10);
        const url = (lines[i + 1] || '').trim();
        if (!url.startsWith('http')) continue;
        if (h >= bestH) {
            bestH = h;
            best = url;
        }
        if (!pick720 && h >= 480 && h <= 810) pick720 = url;
        if (!pick360 && h <= 400) pick360 = url;
    }
    return pick360 || pick720 || best || lines.find((l) => l.startsWith('http')) || '';
}

function buildManifestUrl(vid, rawLine, accessToken) {
    const line = String(rawLine || '').trim();
    const sep = line.includes('?') ? '&' : '?';
    return `${cdnHost}/api/v1/videos/${vid}/manifest/${line}${sep}access_token=${encodeURIComponent(accessToken)}`;
}

function rewriteMasterLikeSite(vid, masterText, accessToken) {
    const lines = String(masterText || '').replace(/\r/g, '').split('\n');
    const out = [];
    let skipNext = false;
    let lowest = Infinity;
    let fallbackInf = '';
    let fallbackUrl = '';
    let iframeInf = '';

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const line = raw.trim();
        if (!line) continue;
        if (skipNext) {
            skipNext = false;
            continue;
        }
        const hm = line.match(/RESOLUTION=\d+x(\d+)/);
        const height = hm ? parseInt(hm[1], 10) : 0;
        if (height > 0 && height < lowest && line.includes('#EXT-X-STREAM-INF')) {
            lowest = height;
            fallbackInf = line;
            fallbackUrl = (lines[i + 1] || '').trim();
        }
        if (height === lowest && line.includes('#EXT-X-I-FRAME-STREAM-INF')) {
            iframeInf = line;
        }
        if (height > MAX_HEIGHT) {
            if (line.includes('#EXT-X-STREAM-INF')) skipNext = true;
            continue;
        }
        if (line.includes('#EXT-X-I-FRAME-STREAM-INF')) {
            out.push(line.replace(/URI="([^"]+)"/, (_, uri) => {
                const url = buildManifestUrl(vid, uri, accessToken);
                return `URI="${url}"`;
            }));
            continue;
        }
        if (!line.startsWith('#')) {
            out.push(buildManifestUrl(vid, line, accessToken));
            continue;
        }
        out.push(raw.trimEnd());
    }

    if (!out.some((l) => l.includes('#EXT-X-STREAM-INF')) && fallbackInf && fallbackUrl) {
        out.push(fallbackInf);
        out.push(buildManifestUrl(vid, fallbackUrl, accessToken));
        if (iframeInf) {
            out.push(iframeInf.replace(/URI="([^"]+)"/, (_, uri) => {
                const url = buildManifestUrl(vid, uri, accessToken);
                return `URI="${url}"`;
            }));
        }
    }
    return `${out.join('\n')}\n`;
}

function wrapRemoteUrls(text, referer, inReq) {
    const out = [];
    for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
        const line = raw.trim();
        if (!line) {
            continue;
        }
        if (line.startsWith('#')) {
            if (line.includes('URI="http')) {
                out.push(line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${proxyPlayUrl(uri, referer, inReq)}"`));
            } else {
                out.push(raw.trimEnd());
            }
            continue;
        }
        if (/^https?:\/\//i.test(line)) {
            out.push(proxyPlayUrl(line, referer, inReq));
        } else {
            out.push(line);
        }
    }
    return `${out.join('\n')}\n`;
}

function rewriteM3u8(text, baseUrl, referer, inReq) {
    const out = [];
    let afterStreamInf = false;
    for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
        const line = raw.trim();
        if (!line) continue;
        if (line.startsWith('#')) {
            if (line.includes('URI="') && !line.includes('URI="http')) {
                out.push(line.replace(/URI="([^"]+)"/g, (_, uri) => {
                    let abs = uri;
                    try { abs = new URL(uri, baseUrl).href; } catch { /* keep */ }
                    return `URI="${proxyPlayUrl(abs, referer, inReq)}"`;
                }));
            } else if (line.includes('URI="http')) {
                out.push(line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${proxyPlayUrl(uri, referer, inReq)}"`));
            } else {
                out.push(raw.trimEnd());
            }
            afterStreamInf = line.startsWith('#EXT-X-STREAM-INF');
            continue;
        }
        let abs = line;
        try {
            abs = new URL(line, baseUrl).href;
        } catch {
            /* keep raw */
        }
        if (afterStreamInf || /\.m3u8/i.test(abs)) {
            out.push(proxyPlayUrl(abs, referer, inReq));
        } else {
            out.push(proxySegUrl(abs, referer, inReq));
        }
        afterStreamInf = false;
    }
    return `${out.join('\n')}\n`;
}

async function getAccessToken(vid, geo, referer) {
    const data = await httpGet(`videos/${vid}/cdn-access?${geoQuery(geo)}`, referer);
    return data?.access_token || geo.access_token || '';
}

async function buildMasterPlaylist(vid, referer) {
    const geo = await getGeo(true);
    if (!geo?.token_v2) return '';
    const accessToken = await getAccessToken(vid, geo, referer);
    if (!accessToken) return '';
    const playlist = await httpGet(`${site}/api/v1/videos/${vid}/playlist?${geoQuery(geo)}`, referer);
    const master = decodePlaylist(playlist);
    if (!master) return '';
    return rewriteMasterLikeSite(vid, master, accessToken);
}

async function masterHandler(inReq, reply) {
    const vid = String(inReq.query.vid || '').replace(/\D/g, '');
    const referer = `${site}/${lang}/video/${vid}`;
    if (!vid) return reply.code(404).send('no vid');
    const master = await buildMasterPlaylist(vid, referer);
    if (!master.includes('#EXTM3U')) return reply.code(502).send('bad master');
    return reply
        .type('application/vnd.apple.mpegurl')
        .header('Access-Control-Allow-Origin', '*')
        .send(wrapRemoteUrls(master, referer, inReq));
}

async function proxyM3u8Handler(inReq, reply) {
    const url = inReq.query.url || '';
    const referer = inReq.query.referer || site;
    if (!url) return reply.code(404).send('no url');
    const text = await fetchText(url, referer);
    if (!text.includes('#EXTM3U')) return reply.code(502).send('bad m3u8');
    return reply
        .type('application/vnd.apple.mpegurl')
        .header('Access-Control-Allow-Origin', '*')
        .send(rewriteM3u8(text, url, referer, inReq));
}

async function proxySegHandler(inReq, reply) {
    const url = inReq.query.url || '';
    const referer = inReq.query.referer || site;
    if (!url) return reply.code(404).send('');
    const buf = await fetchBytes(url, referer);
    if (!buf.length) return reply.code(502).send('');
    return reply
        .header('Access-Control-Allow-Origin', '*')
        .header('Content-Type', 'application/octet-stream')
        .send(buf);
}

async function fetchVideoList(tid, page) {
    const data = await apiGet(buildListPath(tid, page));
    const geo = await getGeo();
    const list = (data?.videos || []).map((v) => toVod(v, geo));
    const pg = data?.pagination?.page || page;
    const totalPages = data?.pagination?.totalPages || pg;
    return { list, page: pg, pagecount: totalPages };
}

async function init() {
    return {};
}

async function home() {
    const classes = [
        { type_id: 'hottest', type_name: '热门视频' },
        { type_id: 'latest', type_name: '最新视频' },
    ];
    try {
        const tags = await apiGet('tags/by-score?page=1&limit=20');
        for (const tag of tags?.tags || []) {
            classes.push({
                type_id: `tag:${tag.id}`,
                type_name: tag.name_translations?.cn || tag.name,
            });
        }
    } catch {
        /* ignore */
    }
    return { class: classes, filters: {} };
}

async function category(inReq) {
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    try {
        return await fetchVideoList(inReq.body.id, page);
    } catch {
        return { list: [], page, pagecount: page };
    }
}

async function detail(inReq) {
    const vid = String(inReq.body.id || '').replace(/\D/g, '');
    if (!vid) return { list: [] };
    try {
        const v = await apiGet(`videos/${vid}`);
        if (!v?.id) return { list: [] };
        const geo = await getGeo();
        const actress = (v.actresses || []).map((a) => a.name_translations?.cn || a.name).filter(Boolean).join(',');
        const tags = (v.tags || []).map((t) => t.name_translations?.cn || t.name).filter(Boolean).join(',');
        return {
            list: [{
                vod_id: vid,
                vod_name: tName(v) || v.dvd_id || vid,
                vod_pic: buildCover(v, geo),
                vod_remarks: v.dvd_id || '',
                vod_year: (v.published_time || '').slice(0, 4),
                vod_area: v.maker_translations?.cn || v.maker || '',
                vod_actor: actress,
                vod_tag: tags,
                vod_content: tName(v, 'description') || v.description || '',
                vod_play_from: 'av01',
                vod_play_url: `正片$${vid}`,
            }],
        };
    } catch {
        return { list: [] };
    }
}

async function resolvePlayUrl(vid) {
    const referer = `${site}/${lang}/video/${vid}`;
    const geo = await getGeo(true);
    if (!geo?.token_v2) return '';
    const playlist = await httpGet(`${site}/api/v1/videos/${vid}/playlist?${geoQuery(geo)}`, referer);
    const master = decodePlaylist(playlist);
    return pickStreamUrl(master);
}

async function play(inReq) {
    const vid = String(inReq.body.id || inReq.body.flag || '').split('$').pop().replace(/\D/g, '');
    const referer = `${site}/${lang}/video/${vid}`;
    const header = { 'User-Agent': UA, Referer: referer, Origin: site };
    if (!vid) return { parse: 1, url: referer, header };
    try {
        const playUrl = await resolvePlayUrl(vid);
        if (playUrl) {
            return {
                parse: 0,
                url: playUrl,
                header: {
                    ...header,
                    Referer: referer,
                    Origin: site,
                },
            };
        }
    } catch {
        /* fallthrough */
    }
    return { parse: 1, url: referer, header };
}

async function search(inReq) {
    const wd = String(inReq.body.wd || '').trim();
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    if (!wd) return { list: [] };
    try {
        const data = await apiPost(`videos/search?lang=${lang}`, {
            query: wd,
            pagination: { page, limit: 24 },
        });
        const geo = await getGeo();
        return { list: (data?.videos || []).map((v) => toVod(v, geo)) };
    } catch {
        return { list: [] };
    }
}

export default {
    meta: { key: 'av01', name: '🔥AV01', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/master.m3u8', masterHandler);
        fastify.get('/proxy.m3u8', proxyM3u8Handler);
        fastify.get('/proxy.seg', proxySegHandler);
    },
};
