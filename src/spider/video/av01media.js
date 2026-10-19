import zlib from 'zlib';
import req from '../../util/req.js';

const HOSTS = ['www.av01.media'];
const API = '/api/v1';
const LANG = 'cn';
const COVER_HOST = 'https://static.av01.tv';
const GEO_URL = 'https://files.iw01.xyz/edge/geo.js?json';
const PAGE_SIZE = 24;
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

let apiHost = HOSTS[0];
const responseCache = new Map();
const cdnCache = new Map();
const dvdToId = new Map();
let geo = null;
let geoTs = 0;

function base() {
    return `https://${apiHost}`;
}

function clean(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
}

function cn(v, translations, fallback = '') {
    if (translations && typeof translations === 'object') {
        const t = translations.cn || translations.zh || translations[LANG];
        if (t) return clean(t);
    }
    return clean(v || fallback);
}

function mmss(seconds) {
    let s = parseInt(seconds, 10) || 0;
    if (s <= 0) return '';
    const h = Math.floor(s / 3600);
    s %= 3600;
    const m = Math.floor(s / 60);
    s %= 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function hdr(referer, json = false) {
    const h = {
        'User-Agent': UA,
        Accept: json ? 'application/json,text/plain,*/*' : 'application/json,text/html,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Connection: 'close',
        Origin: base(),
    };
    if (referer) h.Referer = referer;
    if (json) h['Content-Type'] = 'application/json';
    return h;
}

function decodeBody(data) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data || []);
    if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
        try {
            return zlibGunzip(buf);
        } catch {
            /* keep */
        }
    }
    return buf;
}

function zlibGunzip(buf) {
    try {
        return zlib.gunzipSync(buf);
    } catch {
        return buf;
    }
}

async function fetchBody(url, { referer = `${base()}/cn`, method = 'GET', body = null, raw = false, timeout = 25000 } = {}) {
    for (let i = 0; i < 3; i++) {
        try {
            const cfg = {
                headers: hdr(referer, body != null),
                timeout,
                responseType: 'arraybuffer',
                validateStatus: () => true,
            };
            const resp = method === 'POST' && body != null
                ? await req.post(url, typeof body === 'string' ? body : JSON.stringify(body), cfg)
                : await req.get(url, cfg);
            if (resp.status >= 400) continue;
            const buf = decodeBody(resp.data);
            if (raw) return buf;
            return buf.toString('utf8');
        } catch {
            /* retry */
        }
    }
    return raw ? Buffer.alloc(0) : '';
}

async function getGeo() {
    const now = Date.now() / 1000;
    const ttl = parseFloat(geo?.ttl) || 300;
    if (geo && now - geoTs < ttl) return geo;
    const text = await fetchBody(GEO_URL, { referer: `${base()}/cn` });
    if (!text) return geo || {};
    try {
        geo = JSON.parse(text);
        geoTs = now;
    } catch {
        /* keep old */
    }
    return geo || {};
}

async function cdnToken(vid) {
    const id = String(vid);
    const now = Date.now() / 1000;
    const cached = cdnCache.get(id);
    if (cached && cached.expiresAt - now > 120) return cached.token;

    const g = await getGeo();
    const tv2 = g.token_v2 || '';
    const exp = g.expires || '';
    const ip = g.ip || '';
    if (!tv2 || !exp || !ip) return cached?.token || '';

    const url = `${base()}${API}/videos/${id}/cdn-access?token_v2=${encodeURIComponent(tv2)}&expires=${encodeURIComponent(exp)}&ip=${encodeURIComponent(ip)}&comp=true`;
    const text = await fetchBody(url, { referer: `${base()}/cn` });
    let tok = '';
    let eat = 0;
    try {
        const d = JSON.parse(text);
        tok = d.access_token || '';
        eat = parseFloat(d.expires_at) || 0;
    } catch {
        /* ignore */
    }
    if (!tok) return cached?.token || '';
    cdnCache.set(id, { token: tok, expiresAt: eat || now + 3600 });
    return tok;
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

function vidFromUrl(url) {
    const m = String(url || '').match(/\/videos\/(\d+)\/manifest/);
    return m ? m[1] : '';
}

function vidFromSegment(url) {
    const m = String(url || '').match(/\/fmp4\/[^/]+\/([^/]+)\//);
    return m ? dvdToId.get(m[1]) || '' : '';
}

function bestVariant(body, baseUrl) {
    let bestBw = -1;
    let bestUri = '';
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
        if (bw > bestBw) {
            bestBw = bw;
            bestUri = uri;
        }
    }
    if (!bestUri) return '';
    if (/^https?:\/\//i.test(bestUri)) return bestUri;
    try {
        return new URL(bestUri, baseUrl).href;
    } catch {
        return bestUri;
    }
}

async function buildTokenizedPlaylist(body, vid) {
    const tok = vid ? await cdnToken(vid) : '';
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
            if (mm && vid) dvdToId.set(mm[1], vid);
            out.push(addToken(s, tok));
            continue;
        }
        out.push(line);
    }
    return out.join('\n');
}

async function jsonGet(path, referer = `${base()}/cn`) {
    const full = path.startsWith('http') ? path : `${base()}${path.startsWith('/') ? path : `/${path}`}`;
    if (responseCache.has(full)) return responseCache.get(full);
    let text = await fetchBody(full, { referer });
    if (!text && !path.startsWith('http')) {
        for (const host of HOSTS) {
            if (host === apiHost) continue;
            const alt = `https://${host}${path.startsWith('/') ? path : `/${path}`}`;
            text = await fetchBody(alt, { referer });
            if (text) {
                apiHost = host;
                responseCache.set(alt, JSON.parse(text));
                return responseCache.get(alt);
            }
        }
    }
    if (!text) return {};
    try {
        const data = JSON.parse(text);
        responseCache.set(full, data);
        return data;
    } catch {
        return {};
    }
}

async function jsonPost(path, payload, referer = `${base()}/cn`) {
    const url = path.startsWith('http') ? path : `${base()}${path.startsWith('/') ? path : `/${path}`}`;
    const text = await fetchBody(url, {
        referer,
        method: 'POST',
        body: payload,
    });
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        return {};
    }
}

async function coverUrl(vid) {
    if (!vid) return '';
    const g = await getGeo();
    const tok = g.access_token || '';
    if (!tok) return '';
    return `${COVER_HOST}/media/videos/tmb/${vid}/1.jpg/format=jpeg/wlv=800?access_token=${encodeURIComponent(tok)}`;
}

function toCard(v) {
    const vid = String(v.id || '');
    return {
        vod_id: vid,
        vod_name: cn(v.title, v.title_translations, v.dvd_id || '') || v.dvd_id || '未知',
        vod_pic: '', // filled async in list mapper
        vod_remarks: mmss(v.duration) || '',
        _vid: vid,
    };
}

async function mapCards(data) {
    const out = [];
    const seen = new Set();
    for (const v of data?.videos || []) {
        if (!v || typeof v !== 'object') continue;
        const vid = String(v.id || '');
        if (!vid || seen.has(vid)) continue;
        seen.add(vid);
        const card = toCard(v);
        card.vod_pic = await coverUrl(vid);
        delete card._vid;
        out.push(card);
    }
    return out;
}

function requestOrigin(inReq) {
    const host = String(inReq?.headers?.host || '').split(',')[0].trim();
    if (!host) return `http://127.0.0.1:${process.env.DEV_HTTP_PORT || 9988}`;
    const proto = String(inReq?.headers?.['x-forwarded-proto'] || 'http').split(',')[0].trim();
    return `${proto}://${host}`;
}

function localBase(inReq) {
    return `${requestOrigin(inReq)}${inReq?.server?.prefix || '/spider/av01media/3'}`;
}

async function resolveLocalM3u8(targetUrl, referer) {
    let vid = vidFromUrl(targetUrl);
    let body = await fetchBody(targetUrl, { referer });
    if (!body) return '';
    if (body.includes('#EXT-X-STREAM-INF')) {
        const sub = bestVariant(body, targetUrl);
        if (sub) body = await fetchBody(sub, { referer });
    }
    if (!body) return '';
    if (!vid) vid = vidFromUrl(targetUrl);
    return buildTokenizedPlaylist(body, vid);
}

async function localM3u8Handler(inReq, reply) {
    const url = String(inReq.query.url || '');
    const referer = String(inReq.query.referer || `${base()}/cn`);
    if (!url) return reply.code(404).send('');
    const out = await resolveLocalM3u8(url, referer);
    if (!out || !out.includes('#EXTM3U')) return reply.code(404).send('');
    return reply.type('application/vnd.apple.mpegurl').header('Access-Control-Allow-Origin', '*').send(out);
}

async function localBinHandler(inReq, reply) {
    const url = String(inReq.query.url || '');
    const referer = String(inReq.query.referer || `${base()}/cn`);
    if (!url) return reply.code(404).send('');
    let vid = vidFromUrl(url) || vidFromSegment(url);
    const tok = vid ? await cdnToken(vid) : '';
    const buf = await fetchBody(addToken(url, tok), { referer, raw: true });
    if (!buf.length || buf.length < 50) return reply.code(404).send('');
    const ctype = /\.mp4|\.m4s/i.test(url) ? 'video/mp4' : 'application/octet-stream';
    return reply.type(ctype).header('Access-Control-Allow-Origin', '*').send(buf);
}

async function init(inReq) {
    apiHost = HOSTS[0];
    try {
        const ext = inReq?.body?.extend;
        if (ext && typeof ext === 'object' && ext.host) {
            apiHost = String(ext.host).replace(/^https?:\/\//, '').replace(/\/+$/, '');
        } else if (typeof ext === 'string' && ext.trim().startsWith('{')) {
            const cfg = JSON.parse(ext);
            if (cfg.host) apiHost = String(cfg.host).replace(/^https?:\/\//, '').replace(/\/+$/, '');
        }
    } catch {
        /* default */
    }
    return {};
}

async function home() {
    const classes = [
        { type_id: 'latest', type_name: '最新上架' },
        { type_id: 'hottest', type_name: '热门排行' },
    ];
    const tags = await jsonGet(`${API}/tags/by-video-count?page=1&limit=24`);
    for (const t of tags.tags || []) {
        const tid = String(t.id || '');
        if (!tid) continue;
        classes.push({
            type_id: `tag:${tid}`,
            type_name: cn(t.name, t.name_translations),
        });
    }
    const data = await jsonGet(`${API}/videos/types/latest?page=1&limit=${PAGE_SIZE}`);
    const list = await mapCards(data);
    return {
        class: classes,
        filters: {},
        list,
        page: 1,
        pagecount: 999,
        limit: list.length,
        total: 99999,
    };
}

async function category(inReq) {
    let pg = parseInt(inReq.body.page || inReq.body.pg, 10) || 1;
    if (pg < 1) pg = 1;
    let tid = String(inReq.body.id || inReq.body.tid || 'latest');
    let path;
    if (tid.startsWith('tag:')) {
        path = `${API}/videos/tag/${tid.slice(4)}?page=${pg}&limit=${PAGE_SIZE}`;
    } else if (tid.startsWith('maker:')) {
        path = `${API}/videos/maker/${tid.slice(6)}?page=${pg}&limit=${PAGE_SIZE}`;
    } else if (tid === 'hottest') {
        path = `${API}/videos/types/hottest?page=${pg}&limit=${PAGE_SIZE}`;
    } else {
        path = `${API}/videos/types/latest?page=${pg}&limit=${PAGE_SIZE}`;
    }
    const list = await mapCards(await jsonGet(path));
    return {
        list,
        page: pg,
        pagecount: 999,
        limit: list.length,
        total: 99999,
    };
}

async function detail(inReq) {
    let raw = inReq.body.id;
    if (Array.isArray(raw)) raw = raw[0];
    let vid = String(raw || '').trim();
    if (!vid) return { list: [] };
    if (vid.startsWith('http')) vid = vid.replace(/\/+$/, '').split('/').pop();
    const v = await jsonGet(`${API}/videos/${vid}`);
    if (!v?.id) return { list: [] };
    const title = cn(v.title, v.title_translations, v.dvd_id || '未知');
    const m3u8 = `${base()}${API}/videos/${v.id}/manifest/master.m3u8`;
    return {
        list: [{
            vod_id: String(v.id),
            vod_name: title,
            vod_pic: await coverUrl(String(v.id)),
            vod_play_from: 'AV01',
            vod_play_url: `第1集$${m3u8}`,
            vod_remarks: mmss(v.duration) || '',
        }],
        page: 1,
        pagecount: 1,
        limit: 1,
        total: 1,
    };
}

async function play(inReq) {
    const referer = `${base()}/cn`;
    let purl = String(inReq.body.id || '').trim();
    if (purl.includes('$')) purl = purl.split('$').pop().trim();
    if (!/^https?:\/\//i.test(purl)) {
        purl = `${base()}${API}/videos/${String(purl).replace(/\D/g, '') || purl}/manifest/master.m3u8`;
    }
    const proxied = `${localBase(inReq)}/local.m3u8?url=${encodeURIComponent(purl)}&referer=${encodeURIComponent(referer)}`;
    return {
        parse: 0,
        url: proxied,
        header: {
            Referer: referer,
            Origin: base(),
            'User-Agent': UA,
        },
    };
}

async function search(inReq) {
    let pg = parseInt(inReq.body.pg || inReq.body.page, 10) || 1;
    if (pg < 1) pg = 1;
    const key = String(inReq.body.wd || inReq.body.key || '');
    let data = await jsonPost(`${API}/videos/search?lang=${LANG}`, {
        query: key,
        pagination: { page: pg, limit: PAGE_SIZE },
    });
    let list = await mapCards(data);
    if (!list.length) {
        list = await mapCards(await jsonGet(`${API}/videos/types/latest?page=${pg}&limit=${PAGE_SIZE}`));
    }
    return {
        list,
        page: pg,
        pagecount: 999,
        limit: list.length,
        total: 99999,
    };
}

export default {
    meta: {
        key: 'av01media',
        name: '🌸AV01·PY',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/local.m3u8', localM3u8Handler);
        fastify.get('/local.bin', localBinHandler);
    },
};
