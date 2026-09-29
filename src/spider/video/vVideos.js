import axios from 'axios';
import crypto from 'crypto';
import https from 'https';

const WEB_HOST = 'https://351.dofd1fe.com:25118';
const ENTRY_PATH = '/video';
const DEFAULT_CHANNEL = 'vvmossdh';
const IMAGE_KEY = Buffer.from('H0Z%7n#k$H8*M7xSE^N@8xXZPG*RZ&wY');
const PAGE_SIZE = 24;
const PORT = process.env.DEV_HTTP_PORT || 9988;

const FALLBACK_APIS = [
    'https://94xhn.pt6nth.com:51111',
    'https://cssy1.nb184a.com:51777',
    'https://xhs0.l34zkw.com:51666',
    'https://hao20.110ztv.com:52000',
    'https://14sn.1psisk.com:51888',
    'https://wlq.pmjqlw8.com:51888',
    'https://jvx.i3ubxvj.com:25118',
    'https://cdz.rkfwzdc.com:52000',
    'https://esi.vobis8e.com:51111',
    'https://vqh.z4shq2v.com:51666',
];

const FALLBACK_CLASSES = [
    ['热门', 0, 'hot'],
    ['最新', 0, 'last'],
    ['传媒', 266, 'label'],
    ['黑料', 130, 'cate'],
    ['国产', 262, 'label'],
    ['日本AV', 263, 'label'],
    ['欧美', 264, 'label'],
    ['动漫', 267, 'label'],
    ['三级', 341, 'label'],
    ['AI换脸', 342, 'label'],
    ['AV无码', 343, 'label'],
    ['探花', 143, 'cate'],
    ['SM', 127, 'cate'],
    ['乱伦', 144, 'cate'],
    ['颜值', 178, 'cate'],
    ['人妻少妇', 153, 'cate'],
    ['自拍', 133, 'cate'],
    ['中文字幕', 146, 'cate'],
    ['多男一女', 246, 'cate'],
    ['多女一男', 247, 'cate'],
    ['主播大秀', 142, 'cate'],
    ['麻豆', 358, 'label'],
    ['擦边短剧', 356, 'label'],
];

const HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
};


const httpClient = axios.create({
    timeout: 18_000,
    headers: HEADERS,
    validateStatus: () => true,
});

let webHost = WEB_HOST;
let channel = DEFAULT_CHANNEL;
let channelLocked = false;
let apiCandidates = [];
let discoveredAt = 0;
let discoverPromise = null;

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/vvideos/3';
    return `http://127.0.0.1:${PORT}${prefix}/proxy`;
}

function log(msg) {
    console.log(`[VV] ${msg}`);
}

function text(value) {
    if (value == null) return '';
    return String(value).replace(/\s+/g, ' ').trim();
}

function toInt(value, defaultValue = 0) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : defaultValue;
}

function categoryId(itemId, itemType) {
    return `${itemId}@@${itemType}`;
}

function parseCategoryId(value) {
    const parts = String(value || '').split('@@');
    const itemId = toInt(parts[0], 0);
    const itemType = parts.length > 1 && parts[1].trim() ? parts[1].trim() : 'list';
    return [itemId, itemType];
}

function uniqueHosts(values) {
    const result = [];
    for (const value of values || []) {
        const host = String(value || '').trim().replace(/\/$/, '');
        if (host.startsWith('http') && !result.includes(host)) result.push(host);
    }
    return result;
}

function parseConfig(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    const raw = String(value || '').trim();
    if (raw.startsWith('{')) {
        try {
            const data = JSON.parse(raw);
            return data && typeof data === 'object' ? data : {};
        } catch {
            return {};
        }
    }
    if (raw.startsWith('http')) return { host: raw };
    return {};
}

function applyConfig(config) {
    const host = String(config.host || '').trim().replace(/\/$/, '');
    if (host.startsWith('http')) webHost = host;

    const ch = String(config.channel || '').trim();
    if (ch) {
        channel = ch;
        channelLocked = true;
    }

    let api = config.api || config.apis;
    if (typeof api === 'string') api = api.split(',').map((x) => x.trim()).filter(Boolean);
    if (Array.isArray(api)) apiCandidates = uniqueHosts(api);
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
        if (raw.length < 44) throw new Error('AES-GCM 数据长度不足');
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
        if (!key.length) throw new Error('解密 key 为空');
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

async function unwrapEnvelopes(payload) {
    let value = payload;
    for (let i = 0; i < 5; i++) {
        const [next, changed] = await unwrapOnceInner(value);
        value = next;
        if (!changed) break;
    }
    return value;
}

function decodedXorScripts(text) {
    const result = [];
    const pattern = /const _0="([^"]+)",_1="([^"]+)",_2="([^"]*)"/g;
    for (const m of String(text || '').matchAll(pattern)) {
        try {
            const raw = b64decode(m[1]);
            const keyBytes = Buffer.from(m[2], 'utf-8');
            const decoded = Buffer.from(raw.map((b, i) => b ^ keyBytes[i % keyBytes.length]));
            result.push(decoded.toString('utf-8'));
        } catch {
            /* ignore */
        }
    }
    return result;
}

function extractChannel(text) {
    const patterns = [
        /(?:window\.)?__APP_CHANNEL__\s*=\s*['"]([^'"]+)['"]/,
        /(?:window\.)?_CHANNEL_DATA\s*=\s*['"]([^'"]+)['"]/,
        /(?:window\.)?__rv\s*=\s*['"]([^'"]+)['"]/,
    ];
    for (const pattern of patterns) {
        const m = String(text || '').match(pattern);
        if (m?.[1]?.trim()) return m[1].trim();
    }
    return '';
}

function extractApiUrls(htmlText) {
    const urls = [];
    for (const decoded of decodedXorScripts(htmlText)) {
        try {
            const value = JSON.parse(decoded);
            if (Array.isArray(value)) urls.push(...value);
        } catch {
            /* ignore */
        }
    }
    return uniqueHosts(urls);
}

function challengeScript(text) {
    return decodedXorScripts(text).find((s) => s.includes('postUrl') && s.includes('difficulty') && s.includes('issuedAt')) || '';
}

function proof(task) {
    const seed = String(task?.seed || '');
    const difficulty = Math.max(1, toInt(task?.difficulty, 1));
    const maximum = Math.max(1, toInt(task?.maxIterations, 150000));
    const prefix = '0'.repeat(difficulty);
    for (let value = 0; value < maximum; value++) {
        if (fnv1a(`${seed}|${value}`).startsWith(prefix)) return value;
    }
    throw new Error('验证计算失败');
}

async function verifiedHome() {
    const entryUrl = new URL(ENTRY_PATH.replace(/^\//, ''), webHost.endsWith('/') ? webHost : `${webHost}/`).href;
    const response = await httpClient.get(entryUrl, {
        headers: { ...HEADERS, Accept: 'text/html,application/xhtml+xml' },
        maxRedirects: 5,
    });
    if (response.status < 200 || response.status >= 400) {
        throw new Error(`入口页状态 ${response.status}`);
    }

    let textValue = String(response.data || '');
    const challenge = challengeScript(textValue);
    if (!challenge) return textValue;

    const match = challenge.match(/p=(\{.*?\}),d=document/s);
    if (!match) throw new Error('未找到验证参数');
    const task = JSON.parse(match[1]);
    const meta = {
        ua: HEADERS['User-Agent'],
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

    const finalUrl = response.request?.res?.responseUrl || entryUrl;
    const parsedEntry = new URL(finalUrl);
    let requestPath = parsedEntry.pathname || ENTRY_PATH;
    if (parsedEntry.search) requestPath += parsedEntry.search;

    const body = {
        nonce: task.nonce,
        issuedAt: task.issuedAt,
        key: fnv1a(keyText),
        meta,
        proof: proofValue,
        path: requestPath,
    };
    const origin = `${parsedEntry.protocol}//${parsedEntry.host}`;
    const postUrl = new URL(String(task.postUrl).replace(/^\//, ''), webHost.endsWith('/') ? webHost : `${webHost}/`).href;

    const verified = await httpClient.post(postUrl, body, {
        headers: {
            ...HEADERS,
            'Content-Type': 'application/json',
            Origin: origin,
            Referer: finalUrl,
        },
    });
    if (verified.status < 200 || verified.status >= 400) {
        throw new Error(`验证 POST 状态 ${verified.status}`);
    }
    textValue = String(verified.data || '');
    if (challengeScript(textValue)) throw new Error('站点验证未通过');
    return textValue;
}

async function discoverApis(force = false) {
    if (apiCandidates.length && !force && Date.now() - discoveredAt < 1_800_000) {
        return [...apiCandidates];
    }
    if (discoverPromise) {
        await discoverPromise;
        return [...apiCandidates];
    }

    discoverPromise = (async () => {
        try {
            const htmlText = await verifiedHome();
            const discovered = extractApiUrls(htmlText);
            const discoveredChannel = extractChannel(htmlText);
            if (discoveredChannel && !channelLocked) channel = discoveredChannel;
            apiCandidates = uniqueHosts([...discovered, ...apiCandidates, ...FALLBACK_APIS]);
            discoveredAt = Date.now();
        } catch (e) {
            log(`动态 API 发现失败: ${e.message}`);
            apiCandidates = uniqueHosts([...apiCandidates, ...FALLBACK_APIS]);
            discoveredAt = Date.now();
        }
    })();

    try {
        await discoverPromise;
    } finally {
        discoverPromise = null;
    }
    return [...apiCandidates];
}

async function api(path, params = {}) {
    const query = { ...params, channel };
    let lastError = null;

    for (let attempt = 0; attempt < 2; attempt++) {
        const candidates = await discoverApis(attempt > 0);
        for (const apiHost of candidates) {
            try {
                const response = await httpClient.get(`${apiHost}${path}`, { params: query, timeout: 16_000 });
                if (response.status < 200 || response.status >= 400) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const payload = await unwrapEnvelopes(response.data);
                const code = payload && typeof payload === 'object' && payload.code != null ? toInt(payload.code, 200) : 200;
                if (code !== 0 && code !== 200) {
                    throw new Error(text(payload?.message) || `API code ${code}`);
                }
                if (apiCandidates[0] !== apiHost) {
                    apiCandidates = [apiHost, ...apiCandidates.filter((x) => x !== apiHost)];
                }
                return payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
            } catch (e) {
                lastError = e;
            }
        }
    }
    throw new Error(lastError?.message || '没有可用 API');
}

function absoluteUrl(value) {
    const url = String(value || '').trim();
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return new URL(url.replace(/^\//, ''), webHost.endsWith('/') ? webHost : `${webHost}/`).href;
}

function imageUrl(value, inReq) {
    const url = absoluteUrl(value);
    if (!url) return '';
    try {
        if (new URL(url).pathname.toLowerCase().endsWith('.enc')) {
            return `${getProxyBase(inReq)}?type=img&url=${encodeURIComponent(url)}`;
        }
    } catch {
        /* ignore */
    }
    return url;
}

function cleanHtml(value) {
    let raw = String(value || '').replace(/<br\s*\/?>/gi, '\n');
    raw = raw.replace(/<[^>]+>/g, '');
    raw = raw
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    return raw.replace(/\n{3,}/g, '\n\n').trim();
}

function safePlayName(value) {
    return String(value || '').replace(/[#$]+/g, ' ').trim();
}

function replaceQueryValue(url, key, value) {
    const pattern = new RegExp(`([?&])${key}=[^&#]*`, 'i');
    if (pattern.test(url)) {
        return url.replace(pattern, `$1${key}=${encodeURIComponent(value)}`);
    }
    return url + (url.includes('?') ? '&' : '?') + `${key}=${encodeURIComponent(value)}`;
}

function isVideoFormat(url) {
    const value = String(url || '').toLowerCase().split('?')[0];
    return ['.m3u8', '.mp4', '.ts', '.flv'].some((ext) => value.endsWith(ext));
}

function videoItem(item, inReq, fallbackRemark = '') {
    const row = item && typeof item === 'object' ? item : {};
    const videoId = row.id ?? row.video_id ?? '';
    const remark = text(row.label || row.duration || fallbackRemark);
    return {
        vod_id: String(videoId),
        vod_name: text(row.title || row.name),
        vod_pic: imageUrl(row.upload_thumb || row.thumb, inReq),
        vod_remarks: remark,
        style: { type: 'rect', ratio: 1.78 },
    };
}

function playSources(item) {
    const signedUrl = String(item?.play_hls_url || '').trim();
    const href = String(item?.href || '').trim();
    const cdnList = Array.isArray(item?.cdn_list) ? item.cdn_list : [];
    const sources = [];

    if (signedUrl) {
        if (cdnList.length) {
            cdnList.forEach((cdn, index) => {
                const cdnId = String(cdn?.id ?? index + 1);
                sources.push({
                    name: text(cdn?.title) || `线路${index + 1}`,
                    url: replaceQueryValue(signedUrl, 'cdnId', cdnId),
                });
            });
        } else {
            sources.push({ name: '默认线路', url: signedUrl });
        }
    } else if (href) {
        if (href.startsWith('http')) {
            sources.push({ name: '默认线路', url: href });
        } else if (cdnList.length) {
            cdnList.forEach((cdn, index) => {
                const base = String(cdn?.videoUrl || '').trim().replace(/\/$/, '');
                if (base) {
                    sources.push({
                        name: text(cdn?.title) || `线路${index + 1}`,
                        url: `${base}/${href.replace(/^\//, '')}`,
                    });
                }
            });
        }
    }

    return sources.filter((s) => String(s.url).startsWith('http'));
}

function imageMime(data, declared = '') {
    if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
    if (data[0] === 0x89 && data[1] === 0x50) return 'image/png';
    if (data.slice(0, 3).toString() === 'GIF') return 'image/gif';
    if (data.length > 11 && data.slice(0, 4).toString() === 'RIFF' && data.slice(8, 12).toString() === 'WEBP') {
        return 'image/webp';
    }
    const ct = String(declared || '').split(';')[0];
    if (ct.startsWith('image/')) return ct;
    return 'application/octet-stream';
}

function aesDecryptImage(buf) {
    const iv = buf.subarray(0, 16);
    const ciphertext = buf.subarray(16);
    const decipher = crypto.createDecipheriv('aes-256-cbc', IMAGE_KEY, iv);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

async function init(inReq, _outResp) {
    const extend = inReq.body?.extend ?? inReq.body?.ext ?? '';
    applyConfig(parseConfig(extend));
    return {};
}

async function home(inReq, _outResp) {
    let classes = [];
    try {
        const nav = await api('/api/old_v3/video/nav');
        for (const item of Array.isArray(nav) ? nav : []) {
            const itemType = String(item?.type || '').trim().toLowerCase();
            if (itemType === 'home') continue;
            const itemId = toInt(item?.id ?? item?.tid, 0);
            const name = text(item?.title || item?.name);
            if (name && itemType) {
                classes.push({ type_name: name, type_id: categoryId(itemId, itemType) });
            }
        }
    } catch (e) {
        log(`分类加载失败，使用内置分类: ${e.message}`);
    }

    if (!classes.length) {
        classes = FALLBACK_CLASSES.map(([name, itemId, itemType]) => ({
            type_name: name,
            type_id: categoryId(itemId, itemType),
        }));
    }

    let list = [];
    try {
        const sections = await api('/api/old_v3/video/home');
        const seen = new Set();
        for (const section of Array.isArray(sections) ? sections : []) {
            const sectionName = text(section?.title || section?.name);
            for (const item of section?.list || []) {
                const video = videoItem(item, inReq, sectionName);
                if (video.vod_id && !seen.has(video.vod_id)) {
                    seen.add(video.vod_id);
                    list.push(video);
                    if (list.length >= 48) break;
                }
            }
            if (list.length >= 48) break;
        }
    } catch (e) {
        log(`首页加载失败: ${e.message}`);
    }

    return { class: classes, filters: {}, list };
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
        const items = data && typeof data === 'object' ? data.list || [] : [];
        const total = data && typeof data === 'object' ? toInt(data.total, items.length) : 0;
        const videos = items.map((item) => videoItem(item, inReq));
        const pageCount = total ? Math.max(page, Math.ceil(total / PAGE_SIZE)) : page;
        return {
            list: videos,
            page,
            pagecount: pageCount,
            limit: PAGE_SIZE,
            total,
        };
    } catch (e) {
        log(`分类加载失败: ${e.message}`);
        return { list: [], page, pagecount: page, limit: PAGE_SIZE, total: 0 };
    }
}

async function detail(inReq, _outResp) {
    const videoId = String(Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id || '').trim();
    if (!videoId) return { list: [] };

    try {
        const item = await api('/api/v3/home/public/video/long/detail', { id: videoId });
        if (!item || typeof item !== 'object') return { list: [] };

        const sources = playSources(item);
        if (!sources.length) return { list: [] };

        const playFrom = [];
        const playUrls = [];
        const usedNames = new Set();
        sources.forEach((source, index) => {
            let name = safePlayName(source.name) || `线路${index + 1}`;
            const baseName = name;
            let suffix = 2;
            while (usedNames.has(name)) {
                name = `${baseName}${suffix}`;
                suffix += 1;
            }
            usedNames.add(name);
            playFrom.push(name);
            playUrls.push(`播放$${source.url}`);
        });

        return {
            list: [{
                vod_id: videoId,
                vod_name: text(item.title) || 'VV视频',
                vod_pic: imageUrl(item.upload_thumb || item.thumb, inReq),
                vod_remarks: text(item.label || item.duration),
                vod_year: text(item.years),
                vod_area: text(item.region),
                vod_actor: text(item.actor),
                vod_content: cleanHtml(item.desc) || text(item.classify),
                vod_play_from: playFrom.join('$$$'),
                vod_play_url: playUrls.join('$$$'),
            }],
        };
    } catch (e) {
        log(`详情加载失败: ${e.message}`);
        return { list: [] };
    }
}

async function search(inReq, _outResp) {
    const page = Math.max(1, toInt(inReq.body.pg || inReq.body.page, 1));
    const keyword = String(inReq.body.wd || '').trim();
    if (!keyword) {
        return { list: [], page, pagecount: page, limit: 10, total: 0 };
    }

    try {
        const data = await api('/api/old_v3/video/search', {
            keyword,
            page,
            limit: PAGE_SIZE,
        });
        const payload = data && typeof data === 'object' ? data : {};
        const items = Array.isArray(payload.data) ? payload.data : payload.list || [];
        const total = toInt(payload.total, items.length);
        const limit = Math.max(1, toInt(payload.per_page, items.length || 10));
        let pageCount = toInt(payload.last_page, 0);
        if (pageCount <= 0) pageCount = total ? Math.max(page, Math.ceil(total / limit)) : page;

        return {
            list: items.map((item) => videoItem(item, inReq)),
            page,
            pagecount: pageCount,
            limit,
            total,
        };
    } catch (e) {
        log(`搜索失败: ${e.message}`);
        return { list: [], page, pagecount: page, limit: 10, total: 0 };
    }
}

async function play(_inReq, _outResp) {
    const url = String(_inReq.body.id || '').trim();
    return {
        parse: url.startsWith('http') ? 0 : 1,
        playUrl: '',
        url,
        header: {
            'User-Agent': HEADERS['User-Agent'],
            Referer: webHost + ENTRY_PATH,
        },
    };
}

async function proxyHandler(inReq, reply) {
    if (inReq.query.type !== 'img' || !inReq.query.url) {
        return reply.code(404).type('text/plain; charset=utf-8').send('not found');
    }
    try {
        const url = String(inReq.query.url);
        const response = await httpClient.get(url, {
            headers: {
                'User-Agent': HEADERS['User-Agent'],
                Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                Referer: webHost + ENTRY_PATH,
            },
            responseType: 'arraybuffer',
            timeout: 20_000,
        });
        if (response.status < 200 || response.status >= 400) {
            throw new Error(`HTTP ${response.status}`);
        }
        let data = Buffer.from(response.data);
        if (new URL(url).pathname.toLowerCase().endsWith('.enc')) {
            if (data.length <= 16) throw new Error('加密封面长度不足');
            data = aesDecryptImage(data);
        }
        return reply
            .code(200)
            .type(imageMime(data, response.headers['content-type']))
            .send(data);
    } catch (e) {
        log(`封面代理失败: ${e.message}`);
        return reply.code(500).type('text/plain; charset=utf-8').send('image proxy failed');
    }
}

export default {
    meta: {
        key: 'vvideos',
        name: '💋VV视频',
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
