import axios from 'axios';
import crypto from 'crypto';
import https from 'https';

/**
 * R3E2O - 域名自适应 + AES-256-CBC 标题解密 + 图片/HLS 代理
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const IMG_HOST = 'https://4sbase64.dt188.site';
const AES_KEY = 'IdTJq0HklpuI6mu8iB%OO@!vd^4K&uXW';
const AES_IV = '$0v@krH7V2883346';

const DOMAIN_CANDIDATES = ['https://www.r3e2o.top', 'https://r3e2o.top'];
const ENTER_PATH = '/enter.html';

/** [加密名称, zone, path] */
const SUB_RAW = [
    ['最新剧情', 'juqing', '/cYcL2p1cWluZy9saXN0cy5odG1s.html'],
    ['  麻豆传媒', 'juqing', '/cYcL2p1cWluZy9saXN0Lem6u%2BixhuS8oOWqki5odG1s.html'],
    ['  天美传媒', 'juqing', '/cYcL2p1cWluZy9saXN0LeWkqee%2BjuS8oOWqki5odG1s.html'],
    ['  星空果冻', 'juqing', '/cYcL2p1cWluZy9saXN0LeaYn%2BepuuaenOWGuy5odG1s.html'],
    ['  蜜桃精东', 'juqing', '/cYcL2p1cWluZy9saXN0LeicnOahg%2BeyvuS4nC5odG1s.html'],
    ['  韩国伦理', 'juqing', '/cYcL2p1cWluZy9saXN0LemfqeWbveS8pueQhi5odG1s.html'],
    ['  COSPLAY', 'juqing', '/cYcL2p1cWluZy9saXN0LUNPU1BMQVkuaHRtbA%3D%3D.html'],
    ['  经典三级', 'juqing', '/cYcL2p1cWluZy9saXN0Lee7j%2BWFuOS4iee6py5odG1s.html'],
    ['  中文字幕', 'juqing', '/cYcL2p1cWluZy9saXN0LeS4reaWh%2BWtl%2BW5lS5odG1s.html'],
    ['最新电影', 'shipin', '/cYcL3NoaXBpbi9saXN0cy5odG1s.html'],
    ['  日本av', 'shipin', '/cYcL3NoaXBpbi9saXN0LeaXpeacrGF2Lmh0bWw%3D.html'],
    ['  韩国热舞', 'shipin', '/cYcL3NoaXBpbi9saXN0LemfqeWbveeDreiIni5odG1s.html'],
    ['  欧美精品', 'shipin', '/cYcL3NoaXBpbi9saXN0Leasp%2Be%2BjueyvuWTgS5odG1s.html'],
    ['  动漫电影', 'shipin', '/cYcL3NoaXBpbi9saXN0LeWKqOa8q%2BeUteW9sS5odG1s.html'],
    ['  国产自拍', 'shipin', '/cYcL3NoaXBpbi9saXN0LeWbveS6p%2BiHquaLjS5odG1s.html'],
    ['  岛国无码', 'shipin', '/cYcL3NoaXBpbi9saXN0LeWym%2BWbveaXoOeggS5odG1s.html'],
    ['  JVID', 'shipin', '/cYcL3NoaXBpbi9saXN0LUpWSUQuaHRtbA%3D%3D.html'],
    ['  SM调教', 'shipin', '/cYcL3NoaXBpbi9saXN0LVNN6LCD5pWZLmh0bWw%3D.html'],
    ['最新精选', 'jingpin', '/cYcL2ppbmdwaW4vbGlzdHMuaHRtbA%3D%3D.html'],
    ['  软萌福利姬', 'jingpin', '/cYcL2ppbmdwaW4vbGlzdC3ova%2FokIznpo%2FliKnlp6wuaHRtbA%3D%3D.html'],
    ['  黑料头条', 'jingpin', '/cYcL2ppbmdwaW4vbGlzdC3pu5HmlpnlpLTmnaEuaHRtbA%3D%3D.html'],
    ['  明星AI', 'jingpin', '/cYcL2ppbmdwaW4vbGlzdC3mmI7mmJ9BSS5odG1s.html'],
    ['  人妖伪娘', 'jingpin', '/cYcL2ppbmdwaW4vbGlzdC3kurrlppbkvKrlqJguaHRtbA%3D%3D.html'],
    ['  onlyfans', 'jingpin', '/cYcL2ppbmdwaW4vbGlzdC1vbmx5ZmFucy5odG1s.html'],
    ['  探花系列', 'jingpin', '/cYcL2ppbmdwaW4vbGlzdC3mjqLoirHns7vliJcuaHRtbA%3D%3D.html'],
    ['  主播大秀', 'jingpin', '/cYcL2ppbmdwaW4vbGlzdC3kuLvmkq3lpKfnp4AuaHRtbA%3D%3D.html'],
    ['  韩国主播', 'jingpin', '/cYcL2ppbmdwaW4vbGlzdC3pn6nlm73kuLvmkq0uaHRtbA%3D%3D.html'],
];

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const http = axios.create({
    timeout: 20_000,
    httpsAgent,
    validateStatus: () => true,
    headers: { 'User-Agent': UA },
    maxRedirects: 5,
});

let siteHost = DOMAIN_CANDIDATES[0];
let classes = [];
const vodCache = new Map();

function log(msg) {
    console.log(`[R3] ${msg}`);
}

function getHeaders() {
    return { 'User-Agent': UA, Referer: `${siteHost}/` };
}

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/r3e2o/3';
    const hostHeader = inReq?.headers?.['x-forwarded-host'] || inReq?.headers?.host;
    if (hostHeader) {
        const proto = inReq?.headers?.['x-forwarded-proto'] || 'http';
        return `${proto}://${hostHeader}${prefix}/proxy`;
    }
    const port = process.env.DEV_HTTP_PORT || 9988;
    return `http://127.0.0.1:${port}${prefix}/proxy`;
}

function proxyUrl(kind, url, inReq) {
    return `${getProxyBase(inReq)}?kind=${encodeURIComponent(kind)}&url=${encodeURIComponent(url)}`;
}

function aesDecrypt(ciphertext) {
    if (!ciphertext || typeof ciphertext !== 'string') return ciphertext;
    if (ciphertext.startsWith('http://') || ciphertext.startsWith('https://')) return ciphertext;

    try {
        const decipher = crypto.createDecipheriv(
            'aes-256-cbc',
            Buffer.from(AES_KEY, 'utf8'),
            Buffer.from(AES_IV, 'utf8'),
        );
        const pt = Buffer.concat([
            decipher.update(Buffer.from(ciphertext, 'base64')),
            decipher.final(),
        ]);
        return pt
            .toString('utf8')
            .trim()
            .replace(/^["']|["']$/g, '');
    } catch {
        try {
            return Buffer.from(ciphertext, 'base64')
                .toString('utf8')
                .trim()
                .replace(/^["']|["']$/g, '');
        } catch {
            return ciphertext;
        }
    }
}

function batchDecrypt(list) {
    const out = {};
    for (const enc of list) out[enc] = aesDecrypt(enc);
    return out;
}

function urlJoin(base, rel) {
    try {
        return new URL(rel, base).href;
    } catch {
        return rel;
    }
}

async function discoverDomain(candidates = DOMAIN_CANDIDATES) {
    for (const domain of candidates) {
        try {
            const resp = await http.get(domain + ENTER_PATH, {
                headers: { 'User-Agent': UA, Referer: '' },
                timeout: 10_000,
            });
            if (![200, 301, 302].includes(resp.status)) continue;
            const text = typeof resp.data === 'string' ? resp.data : String(resp.data || '');

            let m = text.match(/href="(https?:\/\/[^"]+)\/index\/home\.html"/);
            if (m) return m[1];

            m = text.match(/document\.domain\s*[=:]\s*["']?([^"';\s]+)/);
            if (m) {
                const host = m[1];
                return host.startsWith('http') ? host : `https://${host}`;
            }

            const finalUrl = resp.request?.res?.responseUrl || resp.config?.url || domain;
            const parsed = new URL(finalUrl);
            return `${parsed.protocol}//${parsed.host}`;
        } catch (e) {
            log(`domain check failed ${domain}: ${e.message}`);
        }
    }
    return candidates[0] || 'https://www.r3e2o.top';
}

async function ensureInit(inReq) {
    const ext = inReq?.body?.extend ?? inReq?.body?.ext ?? '';
    if (ext && String(ext).startsWith('http')) {
        siteHost = String(ext).replace(/\/$/, '');
        log(`使用外部传入域名: ${siteHost}`);
    } else if (!classes.length) {
        siteHost = await discoverDomain();
        log(`自动发现域名: ${siteHost}`);
    }

    if (!classes.length) {
        const allNames = [...new Set(SUB_RAW.map(([n]) => n))];
        const dec = batchDecrypt(allNames);
        classes = SUB_RAW.map(([n, , u], i) => ({
            type_id: String(i),
            type_name: dec[n] || n,
            path: u,
        }));
    }
}

async function fetchHtml(pathOrUrl) {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : siteHost + pathOrUrl;
    try {
        const resp = await http.get(url, { headers: getHeaders(), responseType: 'text' });
        if (resp.status !== 200) return '';
        return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch {
        return '';
    }
}

function imageProxy(path, inReq) {
    if (!path) return '';
    return proxyUrl('img', IMG_HOST + path, inReq);
}

function hlsProxy(url, inReq) {
    return proxyUrl('hls', url, inReq);
}

function cacheVod(href, name, pic) {
    const entry = { name, pic };
    vodCache.set(href, entry);
    if (!href.startsWith('http')) {
        vodCache.set(siteHost + href, entry);
    } else if (href.startsWith(siteHost)) {
        vodCache.set(href.slice(siteHost.length), entry);
    }
}

function getCached(playUrl) {
    let cached = vodCache.get(playUrl);
    if (cached) return cached;
    if (!playUrl.startsWith('http')) cached = vodCache.get(siteHost + playUrl);
    if (cached) return cached;
    if (playUrl.startsWith(siteHost)) cached = vodCache.get(playUrl.slice(siteHost.length));
    return cached || {};
}

function parseCards(html, inReq) {
    const videos = [];
    const enc = {};

    for (const m of html.matchAll(/<a[^>]*class="video-item"[^>]*href="([^"]+)"[^>]*>/gs)) {
        const href = m[1];
        const end = html.indexOf('</a>', m.index + m[0].length);
        const inner = end > 0 ? html.slice(m.index + m[0].length, end) : '';

        const tm = inner.match(/class="video-item-title[^"]*"[^>]*title="([^"]*)"/);
        const rawTitle = tm ? tm[1].trim() : '';

        const im = inner.match(/data-base64="([^"]+)"/);
        const img = im ? imageProxy(im[1], inReq) : '';

        const dm = inner.match(/class="video-item-date"[^>]*>([^<]+)/);
        const date = dm ? dm[1].trim() : '';

        enc[href] = rawTitle;
        videos.push({
            vod_id: href,
            vod_name: rawTitle,
            vod_pic: img,
            vod_remarks: date,
        });
    }

    if (Object.keys(enc).length) {
        const dec = batchDecrypt(Object.values(enc));
        for (const item of videos) {
            const k = enc[item.vod_id];
            item.vod_name = dec[k] || k;
            cacheVod(item.vod_id, item.vod_name, item.vod_pic);
        }
    }

    return videos;
}

function extractTitle(html) {
    for (const pattern of [
        /<h1[^>]*>([\s\S]*?)<\/h1>/,
        /<title>([^<]+)<\/title>/,
        /class="[^"]*dec-ti[^"]*"[^>]*title="([^"]+)"/,
        /class="video-item-title[^"]*"[^>]*title="([^"]+)"/,
    ]) {
        const m = html.match(pattern);
        if (!m) continue;
        const raw = m[1].replace(/<[^>]+>/g, '').trim();
        const dec = aesDecrypt(raw);
        if (dec && dec !== raw) return dec;
        if (raw) return raw;
    }
    return '';
}

function extractCover(html, inReq) {
    for (const pattern of [
        /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/,
        /<img[^>]*data-base64="([^"]+)"/,
        /data-original="([^"]+)"/,
    ]) {
        const m = html.match(pattern);
        if (!m) continue;
        const imgRaw = aesDecrypt(m[1]);
        if (imgRaw.startsWith('http')) return imgRaw;
        if (imgRaw) return imageProxy(imgRaw, inReq);
    }
    return '';
}

function extractPlayUrl(html, inReq) {
    const vm = html.match(/var video\s*=\s*decodeString\('([^']+)'\)/);
    const hm = html.match(/var m3u8_host\s*=\s*decodeString\('([^']+)'\)/);
    if (!vm || !hm) return '';

    let vpath = '';
    let hurl = '';
    try {
        vpath = Buffer.from(vm[1], 'base64').toString('utf8');
    } catch {
        /* ignore */
    }
    try {
        hurl = Buffer.from(hm[1], 'base64').toString('utf8');
    } catch {
        /* ignore */
    }

    if (hurl && vpath) {
        const src = `${hurl.replace(/\/$/, '')}/${vpath.replace(/^\//, '')}`;
        return hlsProxy(src, inReq);
    }
    return '';
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(inReq, _outResp) {
    classes = [];
    await ensureInit(inReq);
    return {};
}

async function home(inReq, _outResp) {
    await ensureInit(inReq);
    const html = await fetchHtml(SUB_RAW[0][2]);
    const list = html ? parseCards(html, inReq) : [];
    return { class: classes.map(({ type_id, type_name }) => ({ type_id, type_name })), filters: {}, list };
}

async function category(inReq, _outResp) {
    await ensureInit(inReq);
    const pg = parseInt(String(inReq.body.page || inReq.body.pg || 1), 10) || 1;

    try {
        const idx = parseInt(String(inReq.body.id || '0'), 10);
        const [, , path] = SUB_RAW[idx] || SUB_RAW[0];
        let url = siteHost + path;
        if (pg > 1) url += url.includes('?') ? `&page=${pg}` : `?page=${pg}`;

        const html = await fetchHtml(url);
        if (!html) {
            return { list: [], page: pg, pagecount: pg > 1 ? pg - 1 : 1 };
        }

        const cards = parseCards(html, inReq);
        return {
            list: cards,
            page: pg,
            pagecount: cards.length > 0 ? 999 : pg,
            limit: cards.length,
            total: cards.length,
        };
    } catch (e) {
        log(`cat: ${e.message}`);
        return { list: [], page: pg, pagecount: 1 };
    }
}

async function detail(inReq, _outResp) {
    await ensureInit(inReq);
    let playUrl = String(inReq.body.id || '');
    if (!playUrl.startsWith('http')) playUrl = siteHost + playUrl;

    const cached = getCached(playUrl);
    let title = cached.name || '';
    let img = cached.pic || '';

    const html = await fetchHtml(playUrl);
    if (!html) return { list: [] };

    if (!title) title = extractTitle(html) || playUrl;
    if (!img) img = extractCover(html, inReq);

    const src = extractPlayUrl(html, inReq);
    const pf = ['线路1'];
    const pu = src ? [`线路1$${src}`] : [`线路1$${playUrl}`];

    return {
        list: [
            {
                vod_id: playUrl,
                vod_name: title,
                vod_pic: img,
                type_name: '',
                vod_year: '',
                vod_area: '',
                vod_remarks: '',
                vod_actor: '',
                vod_director: '',
                vod_content: '',
                vod_play_from: pf.join('$$$'),
                vod_play_url: pu.join('$$$'),
            },
        ],
    };
}

async function play(inReq, _outResp) {
    await ensureInit(inReq);
    let id = String(inReq.body.id || '');

    if (id && (id.includes('.m3u8') || id.includes('.mp4'))) {
        return { parse: 0, url: id, header: getHeaders() };
    }

    const d = await detail(inReq, null);
    if (d?.list?.length) {
        const us = String(d.list[0].vod_play_url || '').split('$$$');
        if (us.length) {
            const f = us[0];
            const url = f.includes('$') ? f.split('$').slice(1).join('$') : f;
            if (url) return { parse: 0, url, header: getHeaders() };
        }
    }

    return { parse: 0, url: '', header: getHeaders() };
}

async function search(_inReq, _outResp) {
    return { list: [] };
}

async function proxyHandler(inReq, outResp) {
    await ensureInit(inReq);

    try {
        const url = decodeURIComponent(inReq.query.url || '');
        const kind = inReq.query.kind || '';
        if (!url.startsWith('https://')) {
            return outResp.code(404).type('text/plain').send('');
        }

        const resp = await http.get(url, {
            headers: getHeaders(),
            responseType: 'arraybuffer',
            timeout: 30_000,
        });

        if (resp.status !== 200) {
            return outResp.code(resp.status).type('text/plain').send('');
        }

        const buf = Buffer.from(resp.data);

        if (kind === 'img') {
            const text = buf.toString('utf8').trim();
            if (text.startsWith('data:image/') && text.includes(',')) {
                const comma = text.indexOf(',');
                const meta = text.slice(0, comma);
                const payload = text.slice(comma + 1);
                const mime = meta.slice(5, meta.indexOf(';'));
                return outResp.type(mime).send(Buffer.from(payload, 'base64'));
            }
            const ct = resp.headers['content-type'] || 'image/jpeg';
            return outResp.type(ct).send(buf);
        }

        if (kind === 'hls') {
            const text = buf.toString('utf8');
            const base = getProxyBase(inReq);
            const out = text.split('\n').map((line) => {
                if (line.startsWith('#EXT-X-KEY:')) {
                    return line.replace(/URI="([^"]+)"/g, (_, uri) => {
                        const abs = urlJoin(url, uri);
                        const proxied = `${base}?kind=bin&url=${encodeURIComponent(abs)}`;
                        return `URI="${proxied}"`;
                    });
                }
                return line;
            });
            return outResp.type('application/vnd.apple.mpegurl').send(`${out.join('\n')}\n`);
        }

        const ct = resp.headers['content-type'] || 'application/octet-stream';
        return outResp.type(ct).send(buf);
    } catch (e) {
        log(`proxy: ${e.message}`);
        return outResp.code(500).type('text/plain').send('');
    }
}

export default {
    meta: {
        key: 'r3e2o',
        name: '🔥四色',
        type: 3,
    },
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
