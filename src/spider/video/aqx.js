import axios from 'axios';
import crypto from 'crypto';
import https from 'https';

const WEB_HOST = 'https://aqx1.8uyp35j.com:51888';
const DEFAULT_CHANNEL = 'zavdh';
const DEFAULT_CDN = '1';
const PAGE_SIZE = 24;
const PORT = process.env.DEV_HTTP_PORT || 9988;
const IMAGE_KEY = Buffer.from('H0Z%7n#k$H8*M7xSE^N@8xXZPG*RZ&wY');
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;

const FALLBACK_APIS = [
    'https://h05j.883rm9.com:51111',
    'https://64gb.ng4fwv.com:52000',
    'https://50hd.gkrle7.com:51777',
    'https://g70j.bbkjtp.com:51888',
    'https://yg81.bpy0rd.com:51888',
];


let webHost = WEB_HOST;
let channel = DEFAULT_CHANNEL;
let preferredCdn = DEFAULT_CDN;
let headers = {
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
};
let apiCandidates = [];
let apiUpdated = 0;
let httpClient = axios.create({
    timeout: 15000,
    validateStatus: () => true,
    headers,
});

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/aqx/3';
    return `http://127.0.0.1:${PORT}${prefix}/proxy`;
}

function log(msg) {
    console.log(`[AQX] ${msg}`);
}

function text(value) {
    return String(value ?? '').trim();
}

function toInt(value, def = 0) {
    const n = parseInt(value, 10);
    return Number.isNaN(n) ? def : n;
}

function parseConfig(extend) {
    if (extend && typeof extend === 'object' && !Array.isArray(extend)) return extend;
    const raw = String(extend || '').trim();
    if (raw.startsWith('{')) {
        try {
            const data = JSON.parse(raw);
            return data && typeof data === 'object' ? data : {};
        } catch {
            return {};
        }
    }
    return raw.startsWith('http') ? { host: raw } : {};
}

function uniqueHosts(values) {
    const result = [];
    for (const value of values || []) {
        const host = String(value || '').trim().replace(/\/$/, '');
        if (host.startsWith('http') && !result.includes(host)) result.push(host);
    }
    return result;
}

function applyConfig(config) {
    const host = String(config.host || '').trim().replace(/\/$/, '');
    if (host.startsWith('http')) webHost = host;
    const ch = String(config.channel || '').trim();
    if (ch) channel = ch;
    const cdn = String(config.preferredCdn || config.cdnId || '').trim();
    if (cdn) preferredCdn = cdn;
    const ua = String(config.ua || config.userAgent || '').trim();
    if (ua) headers = { ...headers, 'User-Agent': ua };
    if (config.cookie) {
        httpClient = axios.create({
            timeout: 15000,
            httpsAgent,
            validateStatus: () => true,
            headers: { ...headers, Cookie: String(config.cookie) },
        });
    }
    const proxy = String(config.proxy || '').trim();
    if (proxy) {
        const proxyUrl = proxy.includes('://') ? proxy : `http://${proxy}`;
        httpClient = axios.create({
            timeout: 15000,
            httpsAgent,
            validateStatus: () => true,
            headers: httpClient.defaults.headers,
            proxy: false,
            // axios proxy via env not used; use httpsAgent only for direct
        });
        process.env.HTTP_PROXY = proxyUrl;
        process.env.HTTPS_PROXY = proxyUrl;
    }
    let apis = config.api || config.apis;
    if (typeof apis === 'string') apis = apis.split(',').map((x) => x.trim()).filter(Boolean);
    if (Array.isArray(apis)) apiCandidates = uniqueHosts(apis);
}

function categoryId(itemId, itemType) {
    return `${itemType || 'cate'}|${itemId}`;
}

function parseCategoryId(tid) {
    const value = String(tid || '');
    if (value.includes('|')) {
        const [itemType, itemId] = value.split('|', 2);
        return [itemId, itemType];
    }
    return [value, 'cate'];
}

function fnv1a(value) {
    let number = 2166136261;
    for (const char of String(value)) {
        number = ((number ^ char.charCodeAt(0)) * 16777619) >>> 0;
    }
    return number.toString(16).padStart(8, '0');
}

function fixBase64(value) {
    let data = String(value || '').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    data += '='.repeat((4 - (data.length % 4)) % 4);
    return data;
}

function b64decode(value) {
    return Buffer.from(fixBase64(value), 'base64');
}

async function deriveKey(password, salt) {
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(password, salt, 1000, 32, 'sha256', (err, key) => {
            if (err) reject(err);
            else resolve(key);
        });
    });
}

async function decryptEnvelope(encrypted, password) {
    try {
        const shifted = [...String(encrypted)].map((c) => String.fromCharCode(c.charCodeAt(0) - 3)).join('');
        const raw = b64decode(shifted);
        if (raw.length < 44) throw new Error('short AES payload');
        const salt = raw.subarray(0, 16);
        const iv = raw.subarray(16, 28);
        const ciphertext = raw.subarray(28);
        const key = await deriveKey(password, salt);
        const authTag = ciphertext.subarray(ciphertext.length - 16);
        const enc = ciphertext.subarray(0, ciphertext.length - 16);
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        const plain = Buffer.concat([decipher.update(enc), decipher.final()]);
        const textValue = plain.toString('utf-8');
        try {
            return JSON.parse(textValue);
        } catch {
            return textValue;
        }
    } catch {
        const raw = b64decode(encrypted);
        const key = Buffer.from(String(password), 'utf-8');
        const plain = Buffer.from(raw.map((b, i) => b ^ key[i % key.length]));
        const textValue = plain.toString('utf-8');
        try {
            return JSON.parse(textValue);
        } catch {
            return textValue;
        }
    }
}

async function unwrapOnceInner(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (typeof value.key === 'string' && typeof value.data === 'string') {
            const decrypted = await decryptEnvelope(value.data, value.key);
            return [decrypted, true];
        }
        const output = {};
        let changed = false;
        for (const [k, child] of Object.entries(value)) {
            const [unwrapped, childChanged] = await unwrapOnceInner(child);
            output[k] = unwrapped;
            changed = changed || childChanged;
        }
        return [output, changed];
    }
    if (Array.isArray(value)) {
        let changed = false;
        const output = [];
        for (const child of value) {
            const [unwrapped, childChanged] = await unwrapOnceInner(child);
            output.push(unwrapped);
            changed = changed || childChanged;
        }
        return [output, changed];
    }
    return [value, false];
}

async function unwrap(payload) {
    let value = payload;
    for (let i = 0; i < 5; i++) {
        const [next, changed] = await unwrapOnceInner(value);
        value = next;
        if (!changed) break;
    }
    return value;
}

function decodeScripts(text) {
    const result = [];
    for (const m of String(text || '').matchAll(/const _0="([^"]+)",_1="([^"]+)",_2="([^"]*)"/g)) {
        try {
            const raw = b64decode(m[1]);
            const keyBytes = Buffer.from(m[2], 'utf-8');
            result.push(Buffer.from(raw.map((b, i) => b ^ keyBytes[i % keyBytes.length])).toString('utf-8'));
        } catch {
            /* ignore */
        }
    }
    return result;
}

function proof(task) {
    const seed = String(task?.seed || '');
    const difficulty = Math.max(1, toInt(task?.difficulty, 1));
    const maximum = Math.max(1, toInt(task?.maxIterations, 150000));
    const prefix = '0'.repeat(difficulty);
    for (let value = 0; value < maximum; value++) {
        if (fnv1a(`${seed}|${value}`).startsWith(prefix)) return value;
    }
    throw new Error('AQX proof not found');
}

async function verifiedHome() {
    const response = await httpClient.get(`${webHost}/home`, {
        headers: { ...headers, Accept: 'text/html,*/*' },
        timeout: 18000,
    });
    if (response.status < 200 || response.status >= 400) {
        throw new Error(`HTTP ${response.status}`);
    }
    let html = String(response.data || '');
    if (!html.includes('/__js_challenge/html')) return html;

    const scripts = decodeScripts(html);
    const script = scripts.find((s) => s.includes('postUrl') && s.includes('difficulty')) || '';
    const match = script.match(/p=(\{.*?\}),d=document/s);
    if (!match) throw new Error('AQX challenge parameters not found');
    const task = JSON.parse(match[1]);
    const meta = {
        ua: headers['User-Agent'],
        lang: 'zh-CN',
        tz: 'Asia/Shanghai',
        screen: '1920x1080',
        webdriver: false,
        framed: false,
    };
    const proofValue = proof(task);
    const keyText = [
        String(task.nonce),
        String(task.issuedAt),
        meta.ua,
        meta.lang,
        meta.tz,
        meta.screen,
        String(proofValue),
    ].join('|');
    const body = {
        nonce: task.nonce,
        issuedAt: task.issuedAt,
        key: fnv1a(keyText),
        meta,
        proof: proofValue,
        path: '/home',
    };
    const postUrl = new URL(String(task.postUrl).replace(/^\//, ''), `${webHost}/`).href;
    const verified = await httpClient.post(postUrl, body, {
        headers: { ...headers, 'Content-Type': 'application/json' },
        timeout: 18000,
    });
    if (verified.status < 200 || verified.status >= 400) {
        throw new Error(`challenge POST ${verified.status}`);
    }
    html = String(verified.data || '');
    if (html.includes('/__js_challenge/html')) throw new Error('AQX challenge failed');
    return html;
}

async function getApis() {
    if (apiCandidates.length && Date.now() / 1000 - apiUpdated < 1800) {
        return [...apiCandidates];
    }
    const discovered = [];
    try {
        const html = await verifiedHome();
        for (const decoded of decodeScripts(html)) {
            try {
                const value = JSON.parse(decoded);
                if (Array.isArray(value)) discovered.push(...value);
            } catch {
                /* ignore */
            }
        }
        const m = html.match(/window\.__rv\s*=\s*['"]([^'"]+)/);
        if (m?.[1]?.trim()) channel = m[1].trim();
    } catch (e) {
        log(`API discovery: ${e.message}`);
    }
    apiCandidates = uniqueHosts([...discovered, ...apiCandidates, ...FALLBACK_APIS]);
    apiUpdated = Date.now() / 1000;
    return [...apiCandidates];
}

async function api(path, params = {}) {
    const query = { ...(params || {}), channel };
    let last = null;
    for (const host of await getApis()) {
        try {
            const r = await httpClient.get(`${host}${path}`, { params: query, headers, timeout: 15000 });
            if (r.status < 200 || r.status >= 400) throw new Error(`HTTP ${r.status}`);
            const payload = await unwrap(r.data);
            if (payload && typeof payload === 'object' && payload.code != null) {
                const code = toInt(payload.code, 200);
                if (code !== 0 && code !== 200) {
                    throw new Error(text(payload.message) || `API error ${code}`);
                }
            }
            const value =
                payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
            if (apiCandidates[0] !== host) {
                apiCandidates = [host, ...apiCandidates.filter((x) => x !== host)];
            }
            return value;
        } catch (e) {
            last = e;
        }
    }
    throw new Error(last?.message || 'No AQX API available');
}

function list(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
        for (const key of ['list', 'items', 'data']) {
            if (Array.isArray(value[key])) return value[key];
        }
    }
    return [];
}

function absoluteUrl(value) {
    const url = text(value);
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return new URL(url.replace(/^\//, ''), `${webHost}/`).href;
}

function imageSignature(url) {
    return crypto.createHmac('sha256', IMAGE_KEY).update(String(url), 'utf8').digest('hex');
}

function manifestSignature(url) {
    return crypto.createHmac('sha256', IMAGE_KEY).update(`aqx_m3u8\n${url}`, 'utf8').digest('hex');
}

function imageUrl(value, inReq) {
    const url = absoluteUrl(value);
    if (!url) return '';
    try {
        if (new URL(url).pathname.toLowerCase().endsWith('.enc')) {
            const sig = imageSignature(url);
            return `${getProxyBase(inReq)}?type=aqx_img&url=${encodeURIComponent(url)}&sig=${sig}`;
        }
    } catch {
        /* ignore */
    }
    return url;
}

function isHlsUrl(value) {
    const url = text(value);
    if (!url.startsWith('http')) return false;
    try {
        const path = new URL(url).pathname.toLowerCase();
        return (
            path.endsWith('.m3u8') ||
            path.includes('/hls/m3u8/') ||
            (path.endsWith('_play') && path.includes('/hls/')) ||
            url.toLowerCase().includes('type=aqx_m3u8')
        );
    } catch {
        return false;
    }
}

function manifestProxyUrl(remoteUrl, inReq) {
    remoteUrl = text(remoteUrl);
    if (!isHlsUrl(remoteUrl)) return '';
    const base = getProxyBase(inReq);
    return `${base}?type=aqx_m3u8&url=${encodeURIComponent(remoteUrl)}&sig=${manifestSignature(remoteUrl)}`;
}

function withCdnId(url, cdnId) {
    if (cdnId == null || String(cdnId).trim() === '') return url;
    try {
        const u = new URL(url);
        const params = new URLSearchParams(u.search);
        let replaced = false;
        for (const key of [...params.keys()]) {
            if (key.toLowerCase() === 'cdnid') {
                params.set(key, String(cdnId));
                replaced = true;
            }
        }
        if (!replaced) params.set('cdnId', String(cdnId));
        u.search = params.toString();
        return u.href;
    } catch {
        return url;
    }
}

function playSources(item) {
    const sources = [];
    let direct = text(item?.play_hls_url || item?.href);
    if (direct.startsWith('/')) direct = absoluteUrl(direct);

    let cdnItems = list(item?.cdn_list);
    cdnItems = [...cdnItems].sort((a, b) => {
        if (typeof a !== 'object' || typeof b !== 'object') return 0;
        const aId = String(a.id ?? a.cdnId ?? a.cdn_id ?? '');
        const bId = String(b.id ?? b.cdnId ?? b.cdn_id ?? '');
        const aPref = aId === preferredCdn ? 0 : 1;
        const bPref = bId === preferredCdn ? 0 : 1;
        if (aPref !== bPref) return aPref - bPref;
        return (a.isDefault ? 0 : 1) - (b.isDefault ? 0 : 1);
    });

    if (cdnItems.length && direct.startsWith('http')) {
        cdnItems.forEach((cdn, index) => {
            if (typeof cdn !== 'object') return;
            const cdnId = cdn.id ?? cdn.cdnId ?? cdn.cdn_id;
            let url = '';
            for (const key of ['play_hls_url', 'hls_url', 'm3u8', 'm3u8_url', 'href', 'url']) {
                let candidate = text(cdn[key]);
                if (candidate.startsWith('/')) candidate = absoluteUrl(candidate);
                if (candidate.startsWith('http')) {
                    url = candidate;
                    break;
                }
            }
            if (!url) url = withCdnId(direct, cdnId);
            if (url) {
                let name = text(cdn.title || cdn.name);
                if (!name) name = cdn.isDefault ? '默认线路' : `线路${index + 1}`;
                sources.push({ name, url });
            }
        });
    } else if (direct.startsWith('http')) {
        sources.push({ name: '默认线路', url: direct });
    }

    for (let i = 1; i <= 5; i++) {
        let url = text(item?.[`href_${i}`]);
        if (url.startsWith('/')) url = absoluteUrl(url);
        if (url.startsWith('http')) sources.push({ name: `Line${i}`, url });
    }

    const result = [];
    const seen = new Set();
    for (const source of sources) {
        if (!seen.has(source.url)) {
            seen.add(source.url);
            result.push(source);
        }
    }
    return result;
}

function cleanHtml(value) {
    return String(value || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .trim();
}

function safeName(value) {
    return String(value || '').replace(/[#$]+/g, ' ').trim();
}

function videoItem(item, inReq, remark = '') {
    const row = item && typeof item === 'object' ? item : {};
    return {
        vod_id: String(row.id || row.video_id || ''),
        vod_name: text(row.title || row.name),
        vod_pic: imageUrl(row.upload_thumb || row.thumb || row.backstage_thumb, inReq),
        vod_remarks: text(row.label || row.duration || remark),
        style: { type: 'rect', ratio: 1.78 },
    };
}

function playHeaders(url) {
    let referer = `${webHost}/`;
    try {
        const u = new URL(url);
        referer = `${u.protocol}//${u.host}/`;
    } catch {
        /* keep */
    }
    return {
        'User-Agent': headers['User-Agent'],
        Referer: referer,
        'Accept-Encoding': 'identity',
    };
}

function imageMime(data) {
    if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
    if (data[0] === 0x89 && data[1] === 0x50) return 'image/png';
    if (data.slice(0, 3).toString() === 'GIF') return 'image/gif';
    if (data.length > 11 && data.slice(0, 4).toString() === 'RIFF' && data.slice(8, 12).toString() === 'WEBP') {
        return 'image/webp';
    }
    return 'application/octet-stream';
}

function decryptImage(encrypted) {
    if (encrypted.length <= 16) throw new Error('AQX encrypted cover is too short');
    const iv = encrypted.subarray(0, 16);
    const payload = encrypted.subarray(16);
    const decipher = crypto.createDecipheriv('aes-256-cbc', IMAGE_KEY, iv);
    const plain = Buffer.concat([decipher.update(payload), decipher.final()]);
    if (imageMime(plain) === 'application/octet-stream') {
        throw new Error('AQX decrypted cover has unknown format');
    }
    return plain;
}

function absoluteManifest(manifest, baseUrl) {
    const output = [];
    for (const rawLine of String(manifest || '').replace(/\r/g, '').split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        if (line.startsWith('#')) {
            output.push(
                line.replace(/URI=(["'])(.*?)(\1)/gi, (_, q, uri) => {
                    try {
                        return `URI=${q}${new URL(uri, baseUrl).href}${q}`;
                    } catch {
                        return `URI=${q}${uri}${q}`;
                    }
                }),
            );
        } else {
            try {
                output.push(new URL(line, baseUrl).href);
            } catch {
                output.push(line);
            }
        }
    }
    return `${output.join('\n')}\n`;
}

async function init(inReq, _outResp) {
    applyConfig(parseConfig(inReq.body?.extend ?? inReq.body?.ext ?? ''));
    return {};
}

async function home(_inReq, _outResp) {
    try {
        const nav = await api('/api/old_v3/video/nav');
        const classes = [];
        for (const item of list(nav)) {
            const itemType = text(item.type).toLowerCase();
            const itemId = item.id ?? item.tid;
            const name = text(item.title || item.name);
            if (name && itemId != null && itemType !== 'home') {
                classes.push({ type_name: name, type_id: categoryId(itemId, itemType) });
            }
        }
        return { class: classes, filters: {} };
    } catch (e) {
        log(`homeContent: ${e.message}`);
        return { class: [], filters: {} };
    }
}

async function category(inReq, _outResp) {
    const page = Math.max(1, toInt(inReq.body.page, 1));
    const [itemId, itemType] = parseCategoryId(inReq.body.id);
    try {
        const data = await api('/api/old_v3/video/getList', {
            id: itemId,
            type: itemType,
            page,
            size: PAGE_SIZE,
        });
        const items = list(data?.list ?? data);
        const total = toInt(data?.total, items.length);
        return {
            list: items.map((x) => videoItem(x, inReq)),
            page,
            pagecount: total ? Math.max(page, Math.ceil(total / PAGE_SIZE)) : page,
            limit: PAGE_SIZE,
            total,
        };
    } catch (e) {
        log(`categoryContent: ${e.message}`);
        return { list: [], page, pagecount: page, limit: PAGE_SIZE, total: 0 };
    }
}

async function detail(inReq, _outResp) {
    const videoId = text(Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id);
    if (!videoId) return { list: [] };
    try {
        const item = await api('/api/v3/home/public/video/long/detail', { id: videoId });
        if (!item || typeof item !== 'object') return { list: [] };
        const sources = playSources(item);
        if (!sources.length) return { list: [] };

        const names = [];
        const urls = [];
        const used = new Set();
        sources.forEach((source, index) => {
            let name = safeName(source.name) || `Line${index + 1}`;
            const original = name;
            let suffix = 2;
            while (used.has(name)) {
                name = `${original}${suffix}`;
                suffix += 1;
            }
            used.add(name);
            names.push(name);
            urls.push(`正片$${source.url}`);
        });

        return {
            list: [
                {
                    vod_id: videoId,
                    vod_name: text(item.title || item.name),
                    vod_pic: imageUrl(item.upload_thumb || item.thumb || item.backstage_thumb, inReq),
                    vod_remarks: text(item.label || item.duration),
                    vod_year: text(item.year),
                    vod_area: text(item.region),
                    vod_actor: text(item.author),
                    vod_content: cleanHtml(item.desc || item.description),
                    vod_play_from: names.join('$$$'),
                    vod_play_url: urls.join('$$$'),
                },
            ],
        };
    } catch (e) {
        log(`detailContent: ${e.message}`);
        return { list: [] };
    }
}

async function search(inReq, _outResp) {
    const page = Math.max(1, toInt(inReq.body.pg || inReq.body.page, 1));
    const keyword = text(inReq.body.wd);
    try {
        const data = await api('/api/old_v3/video/search', {
            keyword,
            page,
            size: PAGE_SIZE,
        });
        const items = list(data?.list ?? data);
        const total = toInt(data?.total, items.length);
        const perPage = toInt(data?.per_page, PAGE_SIZE);
        const lastPage = toInt(data?.last_page, 0);
        return {
            list: items.map((x) => videoItem(x, inReq)),
            page,
            pagecount: total ? Math.max(page, lastPage || Math.ceil(total / Math.max(1, perPage))) : page,
            limit: perPage,
            total,
        };
    } catch (e) {
        log(`searchContent: ${e.message}`);
        return { list: [], page, pagecount: page, limit: PAGE_SIZE, total: 0 };
    }
}

async function play(inReq, _outResp) {
    const url = text(inReq.body.id);
    if (url.startsWith('http')) {
        const result = {
            parse: 0,
            playUrl: '',
            url,
            header: playHeaders(url),
        };
        if (isHlsUrl(url)) {
            Object.assign(result, {
                url: manifestProxyUrl(url, inReq) || url,
                type: 'm3u8',
                format: 'application/x-mpegURL',
                contentType: 'application/x-mpegURL',
            });
        }
        return result;
    }
    return { parse: 1, playUrl: '', url, header: {} };
}

async function proxyHandler(inReq, reply) {
    const type = String(inReq.query.type || '');
    const remoteUrl = String(inReq.query.url || '').trim();
    const signature = String(inReq.query.sig || '').trim();

    if (type === 'aqx_m3u8') {
        let url = remoteUrl;
        if (!url.startsWith('http')) url = decodeURIComponent(url);
        if (!isHlsUrl(url)) {
            return reply.code(400).type('text/plain; charset=utf-8').send('invalid manifest url');
        }
        if (signature !== manifestSignature(url)) {
            return reply.code(403).type('text/plain; charset=utf-8').send('forbidden');
        }
        try {
            const hs = playHeaders(url);
            hs.Accept = 'application/vnd.apple.mpegurl,application/x-mpegURL,text/plain;q=0.9,*/*;q=0.8';
            const r = await httpClient.get(url, {
                headers: hs,
                responseType: 'text',
                timeout: 20000,
                maxRedirects: 0,
            });
            if (r.status < 200 || r.status >= 400) throw new Error(`HTTP ${r.status}`);
            let textValue = String(r.data || '').replace(/^\uFEFF/, '').trimStart();
            if (!textValue.startsWith('#EXTM3U')) throw new Error('not EXTM3U');
            if (textValue.length > MAX_MANIFEST_BYTES) throw new Error('manifest too large');
            const finalUrl = r.request?.res?.responseUrl || url;
            const body = absoluteManifest(textValue, finalUrl);
            return reply
                .code(200)
                .header('Content-Type', 'application/vnd.apple.mpegurl')
                .header('Cache-Control', 'no-cache')
                .header('Access-Control-Allow-Origin', '*')
                .send(body);
        } catch (e) {
            log(`manifest proxy: ${e.message}`);
            return reply.code(502).type('text/plain; charset=utf-8').send('manifest proxy failed');
        }
    }

    if (type !== 'aqx_img' || !remoteUrl) {
        return reply.code(404).type('text/plain; charset=utf-8').send('not found');
    }

    let imageUrl = remoteUrl;
    if (!imageUrl.startsWith('http')) imageUrl = decodeURIComponent(imageUrl);
    try {
        if (!imageUrl.startsWith('http') || !new URL(imageUrl).pathname.toLowerCase().endsWith('.enc')) {
            return reply.code(400).type('text/plain; charset=utf-8').send('invalid image url');
        }
    } catch {
        return reply.code(400).type('text/plain; charset=utf-8').send('invalid image url');
    }
    if (signature !== imageSignature(imageUrl)) {
        return reply.code(403).type('text/plain; charset=utf-8').send('forbidden');
    }

    try {
        const r = await httpClient.get(imageUrl, {
            headers: {
                'User-Agent': headers['User-Agent'],
                Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                Referer: `${webHost}/home`,
            },
            responseType: 'arraybuffer',
            timeout: 25000,
            maxRedirects: 0,
        });
        if (r.status < 200 || r.status >= 400) throw new Error(`HTTP ${r.status}`);
        const buf = Buffer.from(r.data);
        if (buf.length > MAX_IMAGE_BYTES) throw new Error('image too large');
        const image = decryptImage(buf);
        return reply.code(200).type(imageMime(image)).send(image);
    } catch (e) {
        log(`image proxy: ${e.message}`);
        return reply.code(502).type('text/plain; charset=utf-8').send('image proxy failed');
    }
}

export default {
    meta: {
        key: 'aqx',
        name: '🔥UU视视',
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
