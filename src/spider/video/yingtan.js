import axios from 'axios';
import CryptoJS from 'crypto-js';

const BASE = 'http://cms.lyyytv.cn';
const CMS_KEY = 'wP5bvxoc3yv7FoBQENFZuAF0EUYr4LTy';
const PARSE_API = 'http://61.184.23.217:6163/api/index?parsesId=4&appid=10001&videoUrl=';
const UA = 'okhttp/4.12.0';
const FILTER_KEYS = ['class', 'area', 'lang', 'year', 'letter', 'by', 'sort'];
const HTTPS_IMAGE_HOSTS = new Set([
    'm.ykimg.com', 'm.qpic.cn', 'puui.qpic.cn', 'vcover-vt-pic.puui.qpic.cn',
    'i0.hdslb.com', 'pic3.iqiyipic.com', 'pic4.iqiyipic.com', 'pic6.iqiyipic.com',
]);
const HTTP_IMAGE_HOSTS = new Set(['cms.lyyytv.cn', 'www.lyyytv.cn']);

async function getJson(path, headers = { 'User-Agent': UA }, timeout = 15000) {
    const url = new URL(path, BASE);
    const response = await axios.get(url.href, { headers, timeout });
    return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
}

function picture(value, request) {
    try {
        const url = new URL(String(value || ''), BASE);
        if (!['http:', 'https:'].includes(url.protocol)) return '';
        if (url.protocol === 'http:' && HTTPS_IMAGE_HOSTS.has(url.hostname)) url.protocol = 'https:';
        if (url.protocol === 'http:' && HTTP_IMAGE_HOSTS.has(url.hostname) && request) {
            const port = request.server.address().port;
            return `http://127.0.0.1:${port}/spider/yingtan/3/image?url=${encodeURIComponent(url.href)}`;
        }
        return url.href;
    } catch { return ''; }
}

function video(item, request) {
    return {
        vod_id: String(item?.vod_id || ''),
        vod_name: String(item?.vod_name || ''),
        vod_pic: picture(item?.vod_pic, request),
        vod_remarks: String(item?.vod_remarks || ''),
    };
}

function lvdou(value) {
    const text = String(value || '');
    if (!text.startsWith('lvdou+')) return text;
    try {
        const ciphertext = CryptoJS.enc.Base64.parse(text.slice(7));
        return CryptoJS.AES.decrypt(
            CryptoJS.lib.CipherParams.create({ ciphertext }),
            CryptoJS.enc.Utf8.parse(CMS_KEY.slice(0, 16)),
            { iv: CryptoJS.enc.Utf8.parse(CMS_KEY.slice(-16)),
                mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 },
        ).toString(CryptoJS.enc.Utf8) || text;
    } catch { return text; }
}

function strictBase64(text) {
    return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text);
}

function ldmaxDecrypt(value, depth = 0) {
    const input = String(value || '');
    if (depth > 5) return '';
    const cleaned = input.replace(/\s+/g, '');
    if (!strictBase64(cleaned)) return input;
    const decoded = Buffer.from(cleaned, 'base64').toString('utf8').replace(/\s+/g, '');
    if (!decoded.includes('ldmax.cooom')) return decoded;
    const path = decoded.replace(/^https?:\/\/ldmax\.cooom\//, '');
    if (path.length < 16 || path === decoded) return '';
    const key = path.slice(0, 16).split('').reverse().join('');
    const encrypted = path.slice(16).replace(/\s+/g, '');
    if (!strictBase64(encrypted)) return '';
    try {
        const ciphertext = CryptoJS.enc.Base64.parse(encrypted);
        const result = CryptoJS.AES.decrypt(
            CryptoJS.lib.CipherParams.create({ ciphertext }),
            CryptoJS.enc.Utf8.parse(key),
            { iv: CryptoJS.enc.Utf8.parse(key), mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7 },
        ).toString(CryptoJS.enc.Utf8).trim();
        return result.includes('ldmax.cooom')
            ? ldmaxDecrypt(Buffer.from(result).toString('base64'), depth + 1) : result;
    } catch { return ''; }
}

async function parseLink(value) {
    const decrypted = ldmaxDecrypt(value);
    if (!/^https?:\/\//i.test(decrypted)) return '';
    try {
        const result = await getJson(
            `${PARSE_API}${encodeURIComponent(decrypted)}`,
            { 'User-Agent': 'okhttp-okgo/jeasonlzy' }, 30000,
        );
        const finalUrl = Number(result?.code) === 200 ? ldmaxDecrypt(result.url) : '';
        return /^https?:\/\//i.test(finalUrl) ? finalUrl : '';
    } catch { return ''; }
}

async function init() { return {}; }

async function home(request) {
    const [navigation, featured] = await Promise.all([
        getJson('/api.php/app/nav?token='),
        getJson('/api.php/app/index_video?token='),
    ]);
    const classes = [];
    const filters = {};
    for (const item of navigation?.list || []) {
        const id = String(item.type_id);
        classes.push({ type_id: id, type_name: String(item.type_name || '') });
        const entries = [];
        for (const key of FILTER_KEYS) {
            const raw = item.type_extend?.[key];
            if (typeof raw !== 'string' || !raw.trim()) continue;
            const values = raw.split(',').map((part) => part.trim()).filter(Boolean);
            entries.push({ key, name: key, value: values.map((part) => ({ n: part, v: part })) });
        }
        if (entries.length) filters[id] = entries;
    }
    const list = (featured?.list || []).flatMap((group) => group?.vlist || [])
        .map((item) => video(item, request)).filter((item) => item.vod_id && item.vod_name);
    return { class: classes, filters, list };
}

async function category(request) {
    const id = String(request.body?.id || '');
    if (!/^\d+$/.test(id)) return { page: 1, pagecount: 1, list: [] };
    const page = Math.max(1, Number(request.body?.page) || 1);
    const extend = request.body?.extend || {};
    const query = new URLSearchParams({ tid: id, pg: String(page), limit: '18' });
    for (const key of FILTER_KEYS) {
        if (extend[key]) query.set(key, String(extend[key]));
    }
    const data = await getJson(`/api.php/app/video?${query}`);
    return {
        page: Number(data?.page) || page,
        pagecount: Number(data?.pagecount) || page,
        list: (data?.list || []).map((item) => video(item, request)).filter((item) => item.vod_id),
    };
}

async function search(request) {
    const word = String(request.body?.wd || '').trim();
    const page = Math.max(1, Number(request.body?.page) || 1);
    if (!word) return { page, pagecount: page, list: [] };
    const query = new URLSearchParams({ text: word, pg: String(page) });
    const data = await getJson(`/api.php/app/search?${query}`);
    return {
        page: Number(data?.page) || page,
        pagecount: Number(data?.pagecount) || page,
        list: (data?.list || []).map((item) => video(item, request)).filter((item) => item.vod_id),
    };
}

async function detail(request) {
    const raw = Array.isArray(request.body?.id) ? request.body.id[0] : request.body?.id;
    const id = String(raw || '');
    if (!/^\d+$/.test(id)) return { list: [] };
    const response = await getJson(`/api.php/app/video_detail?id=${id}`);
    const item = response?.data;
    if (!item) return { list: [] };
    const names = [];
    const lines = [];
    for (const source of item.vod_url_with_player || []) {
        const episodes = String(source?.url || '').split('#').map((entry) => {
            const separator = entry.indexOf('$');
            if (separator < 0) return '';
            const name = entry.slice(0, separator);
            const address = lvdou(entry.slice(separator + 1));
            return name && address ? `${name}$${address}` : '';
        }).filter(Boolean);
        if (episodes.length) {
            names.push(String(source.name || '播放'));
            lines.push(episodes.join('#'));
        }
    }
    return { list: [{
        ...video(item, request),
        vod_content: String(item.vod_content || ''),
        vod_actor: String(item.vod_actor || ''),
        vod_director: String(item.vod_director || ''),
        vod_year: String(item.vod_year || ''),
        vod_area: String(item.vod_area || ''),
        vod_play_from: names.join('$$$'),
        vod_play_url: lines.join('$$$'),
    }] };
}

async function play(request) {
    const id = String(request.body?.id || '');
    const headers = { 'User-Agent': UA };
    const isUrl = /^https?:\/\//i.test(id);
    let isSiteUrl = false;
    if (isUrl) {
        try { isSiteUrl = /(^|\.)lyyytv\.cn$/i.test(new URL(id).hostname); }
        catch { return { parse: 0, url: '' }; }
    }
    if (!isUrl || isSiteUrl) {
        const parsed = await parseLink(id);
        if (parsed) return { parse: 0, url: parsed, header: headers };
    }
    if (isUrl && /\.(?:mp4|m3u8|flv|avi|mkv|ts|mov|wmv|webm)(?:[?#]|$)/i.test(id)) {
        return { parse: 0, url: id, header: headers };
    }
    return { parse: 1, url: id, header: headers };
}

export default {
    meta: { key: 'yingtan', name: '影探', type: 3, searchable: 1, quickSearch: 1, filterable: 1 },
    api: async (fastify) => {
        fastify.get('/image', async (request, reply) => {
            let url;
            try { url = new URL(String(request.query?.url || '')); }
            catch { return reply.code(400).send(); }
            if (url.protocol !== 'http:' || !HTTP_IMAGE_HOSTS.has(url.hostname)) {
                return reply.code(403).send();
            }
            try {
                const response = await axios.get(url.href, {
                    responseType: 'arraybuffer', timeout: 12000, maxRedirects: 0,
                    maxContentLength: 5 * 1024 * 1024,
                    headers: { 'User-Agent': UA },
                });
                const type = String(response.headers['content-type'] || 'image/jpeg').split(';')[0];
                if (!type.startsWith('image/')) return reply.code(502).send();
                return reply.header('Cache-Control', 'private, max-age=3600')
                    .type(type).send(Buffer.from(response.data));
            } catch { return reply.code(502).send(); }
        });
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};