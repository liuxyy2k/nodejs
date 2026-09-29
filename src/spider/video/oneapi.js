import axios from 'axios';
import crypto from 'crypto';
import zlib from 'zlib';

const PORT = process.env.DEV_HTTP_PORT || 9988;
const UA = 'Dart/3.4 (dart:io)';

const FILM_FILTERS = {
    '6_1': '欧美',
    '6_2': '日本',
    '6_3': '国产',
    '6_4': '直播',
    '6_5': '新作',
    '3_3': '4K独播',
    manga: '漫画',
    album: '写真',
};
const FILM_ORDER = ['6_3', '6_2', '6_1', '6_5', '3_3', '6_4', 'manga', 'album'];
const ONE_API = 'https://api.em1oifd0.com/';
const ONE_MIRRORS = [
    'https://api.3459381.com/',
    'https://api.61c76a0.com/',
    'https://api.87735d5.com/',
    'https://api.c6dd5cc.com/',
    'https://api.j7y675.com/',
    'https://api.em1oifd0.com/',
];
const BOOTSTRAP_LINES = [
    'http://198.44.248.101:9672/',
    'http://198.44.248.102:9672/',
    'http://122.10.20.249:9672/',
];
const BOX_KEY = Buffer.from('dnf45as45fs1ace1');
const BOX_IV = Buffer.from('dn5as4fs1ac5f4e1');
const ONE_KEY = Buffer.from('l*bv%Ziq000Biaog');
const ONE_IV = Buffer.from('8597506002939249');
const ONE_SIGN_SUFFIX = 'm4n2hjPeYWkD6tFpqKF^3HO^h24P@idT';
const ONE_IMAGE_KEY = Buffer.from('saIZXc4yMvq0Iz56');
const ONE_IMAGE_IV = Buffer.from('kbJYtBJUECT0oyjo');
const UUID = '48b067ec-6cfd-3491-84f5-023eb1e7d562';
const USER_KEY = '563e8eeef42931cc858dc0d1080f4f6f';

const http = axios.create({
    timeout: 15000,
    headers: { 'User-Agent': UA },
    validateStatus: () => true,
});

let ready = false;
let token = '';
let hosts = {};
let proxyPrefix = '/spider/oneapi/3';

function diagnostic(message, detail) {
    let safe = String(message).replace(/\n/g, ' ').slice(0, 180);
    if (detail) safe += ': ' + String(detail).replace(/\n/g, ' ').slice(0, 180);
    return { error: safe };
}

function bindReq(inReq) {
    if (inReq?.server?.prefix) proxyPrefix = inReq.server.prefix;
}

function aes(data, key, iv, decrypt = false) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (decrypt) {
        const d = crypto.createDecipheriv('aes-128-cbc', key, iv);
        return Buffer.concat([d.update(buf), d.final()]);
    }
    const c = crypto.createCipheriv('aes-128-cbc', key, iv);
    return Buffer.concat([c.update(buf), c.final()]);
}

function decodeBox(body) {
    const raw = aes(body, BOX_KEY, BOX_IV, true);
    return JSON.parse(zlib.inflateSync(raw).toString('utf8'));
}

function md5(s) {
    return crypto.createHash('md5').update(s).digest('hex');
}

function isAudioPath(path) {
    if (typeof path !== 'string') return false;
    return /\.(mp3|m4a|aac|wav|flac)$/i.test(path.split('?')[0]);
}

function chooseMedia(item) {
    if (!item || typeof item !== 'object') return null;
    for (const field of ['video_hls', 'video_hls_h265', 'video_file', 'video']) {
        const value = item[field];
        const low = field.toLowerCase();
        if (typeof value === 'string' && value && !isAudioPath(value) && !['preview', 'trailer', 'sample'].some((w) => low.includes(w))) {
            return [field, value];
        }
    }
    return null;
}

function oneUrl(name, path) {
    const prefix = hosts[name] || '';
    if (!prefix || !path) return '';
    try {
        return new URL(String(path).replace(/^\//, ''), prefix.endsWith('/') ? prefix : prefix + '/').href;
    } catch {
        return '';
    }
}

function proxyUrl(url) {
    if (!url) return '';
    return `http://127.0.0.1:${PORT}${proxyPrefix}/proxy?url=${encodeURIComponent(url)}`;
}

function coverUrl(cover) {
    if (!cover) return '';
    if (!/^https?:\/\//i.test(cover)) cover = oneUrl('one_img', cover);
    return cover ? proxyUrl(cover) : '';
}

function oneHeaders() {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const platform = '3';
    const ip = '0.0.0.0';
    const first = md5([ip, platform, timestamp, USER_KEY, UUID].join('.'));
    const sign = md5(first + ONE_SIGN_SUFFIX);
    return {
        ip,
        uuid: UUID,
        timestamp,
        platform,
        token,
        sign,
        'user-key': USER_KEY,
        'app-version': '2.6.3.1',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': UA,
    };
}

async function bootstrap() {
    let last = null;
    for (const line of BOOTSTRAP_LINES) {
        try {
            const resp = await http.post(line + 'box/api/config', null, {
                params: { channel: 'Channel' },
                responseType: 'arraybuffer',
                timeout: 15000,
            });
            if (resp.status < 200 || resp.status >= 300) throw new Error('bootstrap status ' + resp.status);
            const config = decodeBox(Buffer.from(resp.data));
            if (!config?.data || typeof config.data !== 'object') throw new Error('invalid config shape');
            const tok = (config.data.token || []).find((item) => item?.name === 'token_one');
            if (!tok?.token) throw new Error('missing token_one');
            token = tok.token;
            hosts = {};
            for (const item of config.data.api || []) {
                if (item?.name) hosts[item.name] = item.host || '';
            }
            return;
        } catch (e) {
            last = e;
        }
    }
    throw new Error(last?.message || last?.name || 'bootstrap unavailable');
}

async function ensureReady() {
    if (ready) return null;
    try {
        await bootstrap();
        ready = true;
        return null;
    } catch (e) {
        return diagnostic('初始化失败', e.name || e.message);
    }
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function oneRequest(endpoint, params, retries = 1) {
    const query = Object.keys(params)
        .sort()
        .map((k) => `${k}=${params[k]}`)
        .join('&');
    const encoded = aes(Buffer.from(query), ONE_KEY, ONE_IV).toString('base64');
    const primary = hosts.one || ONE_API;
    const bases = [primary, ...ONE_MIRRORS.filter((m) => m !== primary).slice(0, 1)];
    let last = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        for (const base of bases) {
            try {
                const url = `${String(base).replace(/\/$/, '')}/${String(endpoint).replace(/^\//, '')}`;
                const resp = await http.post(url, encoded, {
                    headers: oneHeaders(),
                    timeout: 8000,
                    responseType: 'text',
                    transformRequest: [(d) => d],
                });
                if (resp.status < 200 || resp.status >= 300) throw new Error('status ' + resp.status);
                const decoded = aes(Buffer.from(String(resp.data || '').trim(), 'base64'), ONE_KEY, ONE_IV, true);
                return JSON.parse(decoded.toString('utf8'));
            } catch (e) {
                last = e;
            }
        }
        if (attempt < retries) await sleep(400 * (attempt + 1));
    }
    throw last || new Error('request failed');
}

function toItem(item) {
    const media = chooseMedia(item);
    const playable = media && !isAudioPath(media[1]);
    return {
        vod_id: String(item.id ?? ''),
        vod_name: item.title || '',
        vod_pic: coverUrl(item.thumb || item.thumbnail || ''),
        vod_remarks: item.video_length || '',
        vod_year: String(item.published_at || '').slice(0, 4),
        vod_content: item.description || '',
        vod_play_from: playable ? 'One' : '',
        vod_play_url: playable ? `正片$${item.id}` : '',
    };
}

function seriesItem(item, kind) {
    const vid = (kind === 'manga' ? 'm:' : 'a:') + String(item.id ?? '');
    return {
        vod_id: vid,
        vod_name: item.title || '',
        vod_pic: coverUrl(item.thumb || item.thumbnail || ''),
        vod_remarks: String(item.latest_at || '').slice(0, 10),
        vod_year: String(item.first_at || '').slice(0, 4),
        vod_content: `作者: ${item.author || ''}`,
        vod_play_from: kind === 'manga' ? '漫画' : '写真',
        vod_play_url: `全篇$${vid}`,
    };
}

function monthStr(back) {
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth() + 1 - back;
    while (month <= 0) {
        month += 12;
        year -= 1;
    }
    return `${year}-${String(month).padStart(2, '0')}`;
}

async function monthlyDiscovery(model, tag, page, months = 12) {
    let acc = 0;
    for (let back = 0; back < months; back++) {
        const month = monthStr(back);
        const result = await oneRequest('v2.5/article/discovery', {
            demand_tag_id: tag,
            model_id: model,
            page: 1,
            published_at: month,
            size: 20,
            sort: 'published_at',
        });
        let first = Array.isArray(result?.data) ? result.data : [];
        const pages = Math.floor((first.length + 19) / 20);
        if (!pages) continue;
        if (page <= acc + pages) {
            const inner = page - acc;
            if (inner > 1) {
                const again = await oneRequest('v2.5/article/discovery', {
                    demand_tag_id: tag,
                    model_id: model,
                    page: inner,
                    published_at: month,
                    size: 20,
                    sort: 'published_at',
                });
                first = Array.isArray(again?.data) ? again.data : [];
            }
            return [first, back, inner];
        }
        acc += pages;
    }
    return [[], -1, 1];
}

async function hasNext(model, tag, monthBack, innerPage) {
    try {
        if (innerPage > 1) {
            const result = await oneRequest('v2.5/article/discovery', {
                demand_tag_id: tag,
                model_id: model,
                page: innerPage + 1,
                published_at: monthStr(monthBack),
                size: 20,
                sort: 'published_at',
            });
            if (result?.data?.length) return true;
        }
        for (const nb of [monthBack + 1, monthBack + 2]) {
            const result = await oneRequest('v2.5/article/discovery', {
                demand_tag_id: tag,
                model_id: model,
                page: 1,
                published_at: monthStr(nb),
                size: 20,
                sort: 'published_at',
            });
            if (result?.data?.length) return true;
        }
        return false;
    } catch {
        return true;
    }
}

function imageKind(data) {
    if (!data || data.length < 12) return null;
    if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff && data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9) {
        return 'image/jpeg';
    }
    if (data.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && data.slice(-8).toString('binary') === 'IEND\xaeB`\x82') {
        return 'image/png';
    }
    const head = data.slice(0, 6).toString('ascii');
    if ((head === 'GIF87a' || head === 'GIF89a') && data[data.length - 1] === 0x3b) return 'image/gif';
    if (data.slice(0, 4).toString('ascii') === 'RIFF' && data.slice(8, 12).toString('ascii') === 'WEBP') {
        const size = data.readUInt32LE(4);
        if (size === data.length - 8) return 'image/webp';
    }
    return null;
}

async function init(inReq) {
    bindReq(inReq);
    ready = false;
    return {};
}

async function home(inReq) {
    bindReq(inReq);
    const error = await ensureReady();
    if (error) return error;
    return {
        class: FILM_ORDER.map((key) => ({ type_id: key, type_name: FILM_FILTERS[key] })),
        filters: {},
        list: [],
    };
}

async function category(inReq) {
    bindReq(inReq);
    const error = await ensureReady();
    if (error) return error;
    let tid = String(inReq.body.id || '');
    const page = Math.max(1, parseInt(inReq.body.page || 1, 10) || 1);
    if (!FILM_FILTERS[tid]) tid = FILM_ORDER[0];
    try {
        if (tid === 'manga' || tid === 'album') {
            const ep = tid === 'manga' ? 'v2.5/series/manga/list' : 'v2.5/series/album/list';
            const result = await oneRequest(ep, { page, size: 20 });
            const items = Array.isArray(result?.data) ? result.data : [];
            const rows = items.filter((x) => x?.id).map((x) => seriesItem(x, tid));
            return { page, pagecount: rows.length >= 20 ? page + 1 : page, limit: 20, total: rows.length, list: rows };
        }
        const [model, tag] = tid.split('_').map((x) => parseInt(x, 10));
        const [items, monthBack, innerPage] = await monthlyDiscovery(model, tag, page);
        const seen = new Set();
        const rows = [];
        for (const item of items) {
            if (item?.id == null || seen.has(item.id)) continue;
            seen.add(item.id);
            rows.push(toItem(item));
        }
        let pagecount = page;
        if (monthBack >= 0) pagecount = (await hasNext(model, tag, monthBack, innerPage)) ? page + 1 : page;
        return { page, pagecount, limit: 20, total: rows.length, list: rows };
    } catch {
        return { page, pagecount: page, limit: 20, total: 0, list: [] };
    }
}

async function detail(inReq) {
    bindReq(inReq);
    const error = await ensureReady();
    if (error) return error;
    try {
        let raw = inReq.body.id;
        if (Array.isArray(raw)) raw = raw[0];
        raw = String(raw || '');
        let kind = '';
        if (raw.startsWith('m:') || raw.startsWith('a:')) {
            kind = raw[0];
            raw = raw.slice(2);
        }
        const itemId = parseInt(raw, 10);
        if (kind) {
            const result = await oneRequest('v2.5/series/chapters', { series_id: itemId });
            const d = result?.data || {};
            const chapters = Array.isArray(d.chapters) ? d.chapters : [];
            const playUrl = chapters
                .filter((c) => c?.id)
                .map((c) => `${String(c.title || `第${c.chapter}话`).replace(/[#$]/g, ' ')}$${c.id}`)
                .join('#');
            return {
                list: [
                    {
                        vod_id: raw,
                        vod_name: d.title || '',
                        vod_pic: coverUrl(d.thumb || ''),
                        vod_year: String(d.first_at || '').slice(0, 4),
                        vod_area: '',
                        vod_class: '',
                        vod_director: '',
                        vod_actor: d.author || '',
                        vod_content: d.description || '',
                        vod_remarks: `共${chapters.length}话`,
                        vod_play_from: kind === 'm' ? '漫画' : '写真',
                        vod_play_url: playUrl,
                    },
                ],
            };
        }
        const result = await oneRequest('v2.5/article/detail', { id: itemId });
        const item = result?.data || {};
        const media = chooseMedia(item);
        let playEntries = media ? [['正片', itemId]] : [];
        if (item.series_id && media) {
            try {
                const chapters = (await oneRequest('v2.5/series/chapters', { series_id: parseInt(item.series_id, 10) }))?.data?.chapters || [];
                if (chapters.length) {
                    playEntries = chapters.filter((c) => c?.id).map((c) => [c.title || `第${c.chapter}集`, c.id]);
                }
            } catch {
                /* keep single */
            }
        }
        const playUrl = playEntries.map(([title, chapterId]) => `${String(title).replace(/[#$]/g, ' ')}$${chapterId}`).join('#');
        const row = toItem(item);
        row.vod_id = String(itemId);
        row.vod_play_from = playEntries.length ? 'One' : '';
        row.vod_play_url = playUrl;
        return { list: [row] };
    } catch (e) {
        return diagnostic('详情请求失败', e.name || e.message);
    }
}

async function search(inReq) {
    bindReq(inReq);
    const error = await ensureReady();
    if (error) return error;
    try {
        const page = Math.max(1, parseInt(inReq.body.page || 1, 10) || 1);
        const result = await oneRequest('v2.5/article/search', { keyword: String(inReq.body.wd || ''), page, size: 20 });
        const items = Array.isArray(result?.data) ? result.data : [];
        const seen = new Set();
        const rows = [];
        for (const item of items) {
            if (item?.id == null || seen.has(item.id)) continue;
            seen.add(item.id);
            rows.push(toItem(item));
        }
        return { list: rows, page, pagecount: rows.length < 20 ? page : page + 1, limit: 20, total: rows.length };
    } catch {
        return { list: [], page: 1, pagecount: 1, limit: 0, total: 0 };
    }
}

async function play(inReq) {
    bindReq(inReq);
    const error = await ensureReady();
    if (error) return error;
    try {
        const itemId = parseInt(String(inReq.body.id || '').split('$').pop(), 10);
        const result = await oneRequest('v2.5/article/detail', { id: itemId });
        const item = result?.data || {};
        const content = item.content || item.description || '';
        const images = [...String(content).matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
        if (images.length) {
            const urls = images.map((src) => (/^https?:\/\//i.test(src) ? src : oneUrl('one_img', src)));
            const pics = urls.map(proxyUrl).join('&&');
            return { parse: 0, playUrl: '', url: 'pics://' + pics, header: { 'User-Agent': UA } };
        }
        const media = chooseMedia(item);
        if (!media) {
            return { parse: 0, playUrl: '', url: '', header: {}, error: '无已证实正片源，未将试看或预览标为正片' };
        }
        const [field, path] = media;
        return {
            parse: 0,
            playUrl: '',
            url: oneUrl('one_video', path),
            header: { 'User-Agent': UA },
            media_field: field,
        };
    } catch (e) {
        return diagnostic('播放请求失败', e.name || e.message);
    }
}

async function proxyHandler(inReq, reply) {
    try {
        const url = String(inReq.query.url || '');
        if (!/^https?:\/\//i.test(url)) return reply.code(400).send('invalid proxy URL');
        const parsed = new URL(url);
        const configured = hosts.one_img ? new URL(hosts.one_img) : null;
        if (!configured?.hostname || parsed.hostname !== configured.hostname || parsed.host.toLowerCase() !== configured.host.toLowerCase()) {
            return reply.code(403).send('proxy host is not allowed');
        }
        if (parsed.search || parsed.hash || parsed.username || parsed.password) {
            return reply.code(400).send('proxy query is not allowed');
        }
        const resp = await http.get(url, { headers: { 'User-Agent': UA }, responseType: 'arraybuffer', timeout: 15000 });
        if (resp.status < 200 || resp.status >= 300) return reply.code(502).send('proxy error');
        const content = aes(Buffer.from(resp.data), ONE_IMAGE_KEY, ONE_IMAGE_IV, true);
        const ct = imageKind(content);
        if (!ct) return reply.code(502).send('proxy image integrity check failed');
        reply.header('Content-Type', ct).send(content);
    } catch (e) {
        reply.code(502).send('proxy error: ' + (e.name || e.message));
    }
}

export default {
    meta: {
        key: 'oneapi',
        name: '💋One视频',
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
