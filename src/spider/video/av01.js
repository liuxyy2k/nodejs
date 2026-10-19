import req from '../../util/req.js';
import { config } from './config.js';

const HOSTS = ['https://www.av01.media', 'https://www.av01.xyz'];
const PROXY_KEY = 'mira123';
const UPSTREAM_PROXIES = [
    config.SERVER_API,
    config.CF_API?.replace(/\/cf$/, '/proxy'),
    'http://43.143.23.150:3001/proxy',
].filter((v, i, a) => v && a.indexOf(v) === i);
const API_HOSTS = [...HOSTS];
const lang = 'cn';

let site = HOSTS[0];
let apiHost = API_HOSTS[0];
const tokenCache = new Map();
const dvdToId = new Map();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const GEO_FALLBACK = 'https://files.iw01.xyz/edge/geo.js?json';
const MAX_HEIGHT = 720;

function geoUrl(host = site) {
    return `${host}/edge/geo.js?json`;
}

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

function requestOrigin(inReq) {
    const host = String(inReq?.headers?.host || '').split(',')[0].trim();
    if (!host) return `http://127.0.0.1:${process.env.DEV_HTTP_PORT || 9988}`;
    const proto = String(inReq?.headers?.['x-forwarded-proto'] || 'http').split(',')[0].trim();
    return `${proto}://${host}`;
}

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/av01/3';
    return `${requestOrigin(inReq)}${prefix}`;
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

function needsUpstreamProxy(url) {
    return /\.iw01\.xyz/i.test(String(url || ''));
}

async function upstreamProxyFetch(url, referer, { binary = false } = {}) {
    if (!UPSTREAM_PROXIES.length || !needsUpstreamProxy(url)) return null;
    for (const api of UPSTREAM_PROXIES) {
        try {
            const resp = await req.post(api, { url, referer, key: PROXY_KEY, binary }, {
                timeout: binary ? 120000 : 90000,
                responseType: binary ? 'arraybuffer' : 'text',
                validateStatus: () => true,
            });
            if (resp.status !== 200 || resp.data == null) continue;
            return resp.data;
        } catch {
            /* try next proxy */
        }
    }
    return null;
}

async function fetchText(url, referer = site, { timeout = 12000, proxy = true } = {}) {
    try {
        const resp = await req.get(url, {
            headers: fetchHeaders(url, referer),
            timeout,
            responseType: 'text',
            validateStatus: () => true,
        });
        const text = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
        if (resp.status === 200 && text.includes('#EXTM3U')) return text;
    } catch {
        /* ignore */
    }
    if (!proxy) return '';
    const data = await upstreamProxyFetch(url, referer);
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
    const data = await upstreamProxyFetch(url, referer, { binary: true });
    if (data?.byteLength) return Buffer.from(data);
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
    return null;
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

function geoCacheTtl(geo) {
    const ttl = parseInt(geo?.ttl, 10) || 0;
    return ttl ? Math.max(30, ttl - 5) * 1000 : 60000;
}

function geoAccessQuery(geo) {
    return `token_v2=${encodeURIComponent(geo.token_v2 || geo.token || '')}&expires=${encodeURIComponent(geo.expires || '')}&ip=${encodeURIComponent(geo.ip || '')}&comp=true`;
}

async function fetchGeo(url, referer = `${site}/${lang}`) {
    try {
        const resp = await req.get(url, {
            headers: {
                'User-Agent': UA,
                Accept: 'application/json, text/plain, */*',
                Referer: referer,
                Origin: site,
            },
            timeout: 30000,
            validateStatus: () => true,
        });
        if (resp.status === 200) return parseJson(resp.data);
    } catch {
        /* ignore */
    }
    if (/\.iw01\.xyz/i.test(url)) {
        return parseJson(await upstreamProxyFetch(url, referer));
    }
    return null;
}

async function getGeo(force = false) {
    if (!force && geoCache && Date.now() - geoTime < geoCacheTtl(geoCache)) return geoCache;
    let data = null;
    for (const host of HOSTS) {
        data = await fetchGeo(geoUrl(host));
        if (data?.token_v2) break;
    }
    if (!data?.token_v2) data = await fetchGeo(GEO_FALLBACK);
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

function toManifestRel(rawUrl) {
    try {
        const u = new URL(rawUrl);
        return `${u.pathname.replace(/^\//, '')}${u.search}`;
    } catch {
        return String(rawUrl || '').replace(/^https?:\/\/[^/]+\//, '');
    }
}

function buildManifestUrl(vid, rawLine, accessToken, host = apiHost) {
    const line = String(rawLine || '').trim();
    const rel = /^https?:\/\//i.test(line) ? toManifestRel(line) : line;
    const sep = rel.includes('?') ? '&' : '?';
    return `${host}/api/v1/videos/${vid}/manifest/${rel}${sep}access_token=${encodeURIComponent(accessToken)}`;
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
            if (line.includes('URI="')) {
                out.push(line.replace(/URI="([^"]+)"/g, (_, uri) => {
                    let abs = uri;
                    try { abs = new URL(uri, baseUrl).href; } catch { /* keep */ }
                    const via = /\.m3u8(\?|$)/i.test(abs) ? proxyPlayUrl : proxySegUrl;
                    return `URI="${via(abs, referer, inReq)}"`;
                }));
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

async function getPlayToken(vid) {
    const id = parseInt(String(vid).replace(/\D/g, ''), 10);
    if (!id) return { accessToken: '', apiHost };

    const cached = tokenCache.get(id);
    if (cached && Date.now() - cached.at < 3000000) {
        return { accessToken: cached.token, apiHost: cached.apiHost || apiHost };
    }

    const geo = await getGeo(true);
    if (!geo?.token_v2 && !geo?.token) return { accessToken: '', apiHost };

    const qs = geoAccessQuery(geo);
    for (const h of API_HOSTS) {
        const data = await httpGet(`${h}/api/v1/videos/${id}/cdn-access?${qs}`, `${site}/${lang}`);
        const token = data?.access_token || '';
        if (token) {
            apiHost = h;
            tokenCache.set(id, { token, apiHost: h, at: Date.now() });
            return { accessToken: token, apiHost: h };
        }
    }
    if (geo.access_token) {
        tokenCache.set(id, { token: geo.access_token, apiHost: site, at: Date.now() });
        return { accessToken: geo.access_token, apiHost: site };
    }
    return { accessToken: '', apiHost };
}

function addToken(url, tok) {
    if (!tok || !url) return url;
    try {
        const u = new URL(url);
        u.searchParams.set('access_token', tok);
        return u.href;
    } catch {
        const sep = url.includes('?') ? '&' : '?';
        return `${url}${sep}access_token=${encodeURIComponent(tok)}`;
    }
}

function vidFromManifestUrl(url) {
    const m = String(url || '').match(/\/videos\/(\d+)\/manifest/);
    return m ? m[1] : '';
}

function vidFromSegmentUrl(url) {
    const m = String(url || '').match(/\/fmp4\/[^/]+\/([^/]+)\//);
    return m ? dvdToId.get(m[1]) || '' : '';
}

function listBandwidthVariants(body, baseUrl) {
    const pairs = [];
    const lines = String(body || '').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.startsWith('#EXT-X-STREAM-INF')) continue;
        const bm = line.match(/BANDWIDTH=(\d+)/);
        const bw = bm ? parseInt(bm[1], 10) : 0;
        let uri = '';
        for (let j = i + 1; j < lines.length; j++) {
            const u = lines[j].trim();
            if (u && !u.startsWith('#')) {
                uri = u;
                break;
            }
        }
        if (!uri) continue;
        if (!/^https?:\/\//i.test(uri)) {
            try {
                uri = new URL(uri, baseUrl).href;
            } catch {
                /* keep */
            }
        }
        pairs.push([bw, uri]);
    }
    pairs.sort((a, b) => b[0] - a[0]);
    return pairs.map((p) => p[1]);
}

function clearPlayToken(vid) {
    const id = parseInt(String(vid).replace(/\D/g, ''), 10);
    if (id) tokenCache.delete(id);
}

async function buildTokenizedPlaylist(body, vid) {
    const { accessToken: tok } = vid ? await getPlayToken(vid) : { accessToken: '' };
    const out = [];
    for (const line of String(body || '').split(/\r?\n/)) {
        const s = line.trim();
        if (s.startsWith('#EXT-X-MAP')) {
            const m = s.match(/URI="([^"]+)"/);
            if (m) out.push(s.replace(m[1], addToken(m[1], tok)));
            else out.push(line);
            continue;
        }
        if (s.includes('customers.iw01.xyz') && s.includes('/map/') && !s.startsWith('#')) {
            const mm = s.match(/\/fmp4\/[^/]+\/([^/]+)\//);
            if (mm && vid) dvdToId.set(mm[1], String(vid));
            out.push(addToken(s, tok));
            continue;
        }
        out.push(line);
    }
    return `${out.join('\n')}\n`;
}

async function resolveLocalM3u8(targetUrl, referer) {
    let vid = vidFromManifestUrl(targetUrl);
    let body = await fetchText(targetUrl, referer, { timeout: 25000, proxy: true });
    if (!body?.includes('#EXTM3U')) return '';
    if (body.includes('#EXT-X-STREAM-INF')) {
        let picked = false;
        for (const sub of listBandwidthVariants(body, targetUrl)) {
            const subBody = await fetchText(sub, referer, { timeout: 25000, proxy: true });
            if (subBody?.includes('#EXTM3U')) {
                body = subBody;
                picked = true;
                break;
            }
        }
        if (!picked) return '';
    }
    if (!vid) vid = vidFromManifestUrl(targetUrl);
    return buildTokenizedPlaylist(body, vid);
}

async function localM3u8Handler(inReq, reply) {
    const url = String(inReq.query.url || '');
    const referer = String(inReq.query.referer || `${site}/${lang}`);
    if (!url) return reply.code(404).send('no url');
    const out = await resolveLocalM3u8(url, referer);
    if (!out.includes('#EXTM3U')) return reply.code(502).send('bad m3u8');
    return reply
        .type('application/vnd.apple.mpegurl')
        .header('Access-Control-Allow-Origin', '*')
        .send(out);
}

async function fetchSegmentWithToken(url, referer, vid) {
    let { accessToken: tok } = vid ? await getPlayToken(vid) : { accessToken: '' };
    let buf = await fetchBytes(addToken(url, tok), referer);
    if ((!buf.length || buf.length < 50) && vid) {
        clearPlayToken(vid);
        ({ accessToken: tok } = await getPlayToken(vid));
        buf = await fetchBytes(addToken(url, tok), referer);
    }
    return buf;
}

async function localBinHandler(inReq, reply) {
    const url = String(inReq.query.url || '');
    const referer = String(inReq.query.referer || `${site}/${lang}`);
    if (!url) return reply.code(404).send('');
    const vid = vidFromManifestUrl(url) || vidFromSegmentUrl(url);
    const buf = await fetchSegmentWithToken(url, referer, vid);
    if (!buf.length || buf.length < 50) return reply.code(502).send('');
    reply.header('Access-Control-Allow-Origin', '*');
    reply.type(/\.mp4|\.m4s/i.test(url) ? 'video/mp4' : 'application/octet-stream');
    return reply.code(200).send(buf);
}

function masterM3u8Url(vid) {
    return `${site}/api/v1/videos/${vid}/manifest/master.m3u8`;
}

function localM3u8PlayUrl(targetUrl, referer, inReq) {
    return `${getProxyBase(inReq)}/local.m3u8?url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(referer)}`;
}

function jwtPayload(token) {
    try {
        return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
    } catch {
        return null;
    }
}

const CDN_HOST = 'https://customers.iw01.xyz';

function playlistCandidates(vid, res, accessToken, host = apiHost) {
    const quality = res || 'v3';
    const id = parseInt(String(vid).replace(/\D/g, ''), 10);
    const urls = [];
    const sub = String(jwtPayload(accessToken)?.sub || '');
    if (sub.includes('/map')) {
        const base = sub.endsWith('/') ? sub : `${sub}/`;
        for (const file of ['index.m3u8', 'master.m3u8', `${quality}.m3u8`]) {
            urls.push(`${CDN_HOST}${base}${file}?access_token=${encodeURIComponent(accessToken)}`);
        }
    }
    urls.push(`${host}/api/v1/videos/${id}/manifest/index90-${quality}-a1.m3u8?access_token=${encodeURIComponent(accessToken)}`);
    return urls;
}

async function pickPlaylist(vid, res, accessToken, host, referer) {
    const urls = playlistCandidates(vid, res, accessToken, host);
    const hits = await Promise.all(urls.map(async (url) => {
        const text = await fetchText(url, referer, { timeout: 8000, proxy: false });
        return text.includes('#EXTM3U') ? url : '';
    }));
    return hits.find(Boolean) || '';
}

function parsePlayId(raw) {
    let s = raw;
    if (Array.isArray(s)) s = s[0];
    s = String(s || '').trim();
    if (s.includes('$')) s = s.split('$').pop().trim();
    if (s.includes('|')) {
        const [vid, res] = s.split('|', 2);
        return { vid: String(vid).replace(/\D/g, '') || vid, res: res || 'v3' };
    }
    return { vid: String(s).replace(/\D/g, '') || s, res: 'v3' };
}

function playHeaders() {
    return {
        'User-Agent': UA,
        Accept: '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Referer: `${site}/`,
        Origin: site,
        Connection: 'keep-alive',
    };
}

async function buildDirectPlayUrl(vid, res = 'v3', referer = site) {
    const { accessToken, apiHost: host } = await getPlayToken(vid);
    if (!accessToken) return '';
    return pickPlaylist(vid, res, accessToken, host, referer);
}

async function buildMasterPlaylist(vid, referer) {
    const geo = await getGeo(true);
    if (!geo?.token_v2) return '';
    const { accessToken } = await getPlayToken(vid);
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
    reply.header('Access-Control-Allow-Origin', '*');
    reply.type('application/octet-stream');
    return reply.code(200).send(buf);
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
    site = HOSTS[0];
    for (const host of HOSTS) {
        try {
            const resp = await req.get(
                `${host}/api/v1/videos/types/latest?page=1&limit=1&comp=true`,
                {
                    headers: {
                        'User-Agent': UA,
                        Accept: 'application/json, text/plain, */*',
                        'Accept-Language': 'zh-CN,zh;q=0.9',
                        Referer: `${host}/${lang}`,
                    },
                    timeout: 8000,
                    validateStatus: () => true,
                },
            );
            if (resp.status < 500) {
                site = host;
                break;
            }
        } catch {
            /* try next host */
        }
    }
    apiHost = site;
    return {};
}

async function home() {
    const classes = [
        { type_id: 'hottest', type_name: '热门视频' },
        { type_id: 'latest', type_name: '最新视频' },
    ];
    try {
        const tags = await apiGet('tags/by-score?page=1&limit=50');
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

function buildVodContent(v) {
    const desc = tName(v, 'description') || v.description || '';
    const extra = [];
    const maker = tName(v, 'maker') || v.maker_translations?.cn || v.maker || '';
    if (maker) extra.push(`制作商: ${maker}`);
    const actNames = (v.actresses || [])
        .map((a) => a?.name_translations?.cn || a?.name || '')
        .filter(Boolean);
    if (actNames.length) extra.push(`演员: ${actNames.join('、').slice(0, 200)}`);
    const tagNames = (v.tags || [])
        .map((t) => t?.name_translations?.cn || t?.name || '')
        .filter(Boolean);
    if (tagNames.length) extra.push(`标签: ${tagNames.join('、').slice(0, 200)}`);
    const dur = fmtDuration(v.duration);
    if (dur) extra.push(`时长: ${dur}`);
    if (desc && extra.length) return `${desc}\n\n${extra.join('\n')}`;
    return desc || extra.join('\n');
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
        const dur = fmtDuration(v.duration);
        return {
            list: [{
                vod_id: vid,
                vod_name: tName(v) || v.dvd_id || vid,
                vod_pic: buildCover(v, geo),
                vod_remarks: dur || v.dvd_id || '',
                vod_year: (v.published_time || '').slice(0, 4),
                vod_area: v.maker_translations?.cn || v.maker || '',
                vod_actor: actress,
                vod_tag: tags,
                vod_content: buildVodContent(v),
                vod_play_from: 'AV01',
                vod_play_url: [
                    `1080P$${masterM3u8Url(vid)}`,
                    `720P$${masterM3u8Url(vid)}`,
                    `480P$${masterM3u8Url(vid)}`,
                ].join('#'),
            }],
        };
    } catch {
        return { list: [] };
    }
}

async function play(inReq) {
    const { vid } = parsePlayId(inReq.body.id || inReq.body.flag || '');
    const referer = `${site}/${lang}/video/${vid}`;
    const header = { ...playHeaders(), Referer: referer };
    const result = { parse: 0, jx: 0, format: 'application/x-mpegURL' };
    if (!vid) {
        return { ...result, parse: 1, url: `${site}/${lang}`, header };
    }
    let purl = String(inReq.body.id || '').trim();
    if (purl.includes('$')) purl = purl.split('$').pop().trim();
    if (purl.includes('|')) purl = purl.split('|')[0].trim();
    if (!/^https?:\/\//i.test(purl)) {
        purl = masterM3u8Url(vid);
    }
    return {
        ...result,
        url: localM3u8PlayUrl(purl, referer, inReq),
        header,
    };
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
    meta: { key: 'av01', name: '🌸AV01', type: 3 },
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
        fastify.get('/local.m3u8', localM3u8Handler);
        fastify.get('/local.bin', localBinHandler);
    },
};
