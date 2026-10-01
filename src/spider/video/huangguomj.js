import axios from 'axios';
import crypto from 'crypto';

const PORT = process.env.DEV_HTTP_PORT || 9988;
const PREFIX = '/spider/huangguomj/3';
const SITE = 'https://rizzoandassociates.com';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const HEADERS = {
    'User-Agent': UA,
    Accept: 'application/json,text/plain,*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Referer: `${SITE}/`,
};

const PAGE_SIZE = 24;
const FALLBACK_KEY_HEX = '35323532303266393134396530363164';
const CRYPT_HOSTS = new Set(['cdn.djisajisj.top']);

let imgKey = Buffer.from(FALLBACK_KEY_HEX, 'hex');
let imgKeyAt = 0;
let cachedTabs = null;

function fix(u) {
    if (!u) return '';
    if (u.startsWith('//')) return `https:${u}`;
    if (u.startsWith('/')) return SITE + u;
    return u;
}

function proxyPic(url, inReq) {
    url = fix(url);
    if (!url) return '';
    const prefix = inReq?.server?.prefix || PREFIX;
    const enc = Buffer.from(url, 'utf8').toString('base64url');
    return `http://127.0.0.1:${PORT}${prefix}/img?url=${encodeURIComponent(enc)}`;
}

function looksLikeImage(buf) {
    if (!buf || buf.length < 8) return false;
    if (buf[0] === 0xff && buf[1] === 0xd8) return true;
    if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;
    if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return true;
    const gif = buf.slice(0, 6).toString('ascii');
    return gif === 'GIF87a' || gif === 'GIF89a';
}

function imageMime(buf) {
    if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
    if (buf.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return 'image/png';
    if (buf.slice(0, 3).toString('ascii') === 'GIF') return 'image/gif';
    if (buf.slice(0, 4).toString('ascii') === 'RIFF') return 'image/webp';
    return 'image/jpeg';
}

function decryptEcb(raw, key) {
    if (!raw || raw.length % 16 !== 0 || !key) return raw;
    try {
        const d = crypto.createDecipheriv('aes-128-ecb', key, null);
        d.setAutoPadding(true);
        const pt = Buffer.concat([d.update(raw), d.final()]);
        return looksLikeImage(pt) ? pt : raw;
    } catch {
        return raw;
    }
}

function cryptFetchUrl(url) {
    try {
        const u = new URL(url);
        if (u.protocol !== 'https:') return url;
        const host = u.hostname.toLowerCase();
        const ext = (u.pathname.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
        if (ext === 'bnc') return url;
        if (!CRYPT_HOSTS.has(host) && host !== 'd2mgpelrngabpi.cloudfront.net') return url;
        if (!['png', 'gif', 'jpg', 'jpeg', 'bmp', 'webp'].includes(ext)) return url;
        u.pathname = u.pathname.replace(/\.[a-z0-9]+$/i, '.bnc');
        return u.toString();
    } catch {
        return url;
    }
}

function playUrl(src) {
    if (!src) return '';
    src = String(src).trim();
    if (!src || src === '/sample.mp4') return '';
    const m = src.match(/^\/api\/hls\?p=([0-9a-fA-F]+\.m3u8)$/);
    if (m) return `${SITE}/api/hls/${m[1]}`;
    const m2 = src.match(/^\/api\/hls\/([0-9a-fA-F]+\.m3u8)$/);
    if (m2) return `${SITE}/api/hls/${m2[1]}`;
    return fix(src);
}

function vodFrom(item, inReq) {
    if (!item?.id || !item?.t) return null;
    const remarks = [item.serial, item.eps ? `${item.eps}集` : '', item.badge].filter(Boolean).join(' · ');
    return {
        vod_id: String(item.id),
        vod_name: String(item.t),
        vod_pic: proxyPic(item.cover, inReq),
        vod_remarks: remarks,
    };
}

async function apiGet(path) {
    const url = path.startsWith('http') ? path : `${SITE}/api${path.startsWith('/') ? path : `/${path}`}`;
    try {
        const resp = await axios.get(url, {
            headers: HEADERS,
            timeout: 15000,
            validateStatus: () => true,
        });
        if (resp.status >= 400) return null;
        const body = resp.data;
        if (body?.status !== 'y') return null;
        return body.data ?? null;
    } catch {
        return null;
    }
}

async function refreshImgKey(force) {
    if (!force && Date.now() - imgKeyAt < 30 * 60 * 1000 && imgKeyAt) return;
    const ops = await apiGet('/ops');
    const hex = ops?.imgCrypt?.key;
    if (typeof hex === 'string' && /^[0-9a-f]{32}$/i.test(hex)) {
        imgKey = Buffer.from(hex, 'hex');
        const hosts = ops.imgCrypt.hosts;
        if (hosts && typeof hosts === 'object') {
            for (const h of Object.keys(hosts)) CRYPT_HOSTS.add(h.toLowerCase());
        }
    }
    imgKeyAt = Date.now();
}

async function loadTabs() {
    const data = await apiGet('/tabs');
    const tabs = data?.tabs;
    if (Array.isArray(tabs) && tabs.length) {
        cachedTabs = tabs.filter((t) => t?.visible !== false && t?.l2Id);
        return cachedTabs;
    }
    return cachedTabs || [];
}

function classesFrom(tabs) {
    const list = [{ type_name: '热门', type_id: 'hot' }];
    for (const t of tabs) {
        list.push({ type_name: String(t.name || t.l2Id), type_id: String(t.l2Id) });
    }
    return list;
}

async function listDramas({ tab, kw, page, sort } = {}) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const q = new URLSearchParams({
        page: String(p),
        pageSize: String(PAGE_SIZE),
    });
    if (tab && tab !== 'hot' && tab !== 'home') q.set('tab', tab);
    if (kw) q.set('kw', kw);
    if (sort) q.set('sort', sort);
    const data = await apiGet(`/dramas?${q.toString()}`);
    const list = data?.list || [];
    const total = Number(data?.total) || 0;
    const hasMore = !!data?.hasMore || (list.length >= PAGE_SIZE && (!total || p * PAGE_SIZE < total));
    return { list, page: p, total, pagecount: hasMore ? p + 1 : p };
}

async function init() {
    await refreshImgKey(true);
    await loadTabs();
    return {};
}

async function home(inReq) {
    const tabs = await loadTabs();
    const data = await apiGet('/dramas/hot');
    const list = (data?.list || []).map((x) => vodFrom(x, inReq)).filter(Boolean);
    return {
        class: classesFrom(tabs),
        filters: {},
        list,
    };
}

async function category(inReq) {
    const id = String(inReq.body.id || 'hot').replace(/^\//, '');
    const page = Math.max(1, parseInt(inReq.body.page, 10) || 1);
    if (id === 'hot' || id === 'home') {
        if (page > 1) {
            const r = await listDramas({ sort: 'hot', page });
            return {
                list: r.list.map((x) => vodFrom(x, inReq)).filter(Boolean),
                page: r.page,
                pagecount: r.pagecount,
                limit: PAGE_SIZE,
                total: r.total || r.list.length,
            };
        }
        const data = await apiGet('/dramas/hot');
        const list = (data?.list || []).map((x) => vodFrom(x, inReq)).filter(Boolean);
        return { list, page: 1, pagecount: 99999, limit: PAGE_SIZE, total: list.length };
    }
    const r = await listDramas({ tab: id, page, sort: 'latest' });
    return {
        list: r.list.map((x) => vodFrom(x, inReq)).filter(Boolean),
        page: r.page,
        pagecount: Math.max(r.pagecount, 2),
        limit: PAGE_SIZE,
        total: r.total || r.list.length,
    };
}

async function detail(inReq) {
    let id = inReq.body.id;
    if (Array.isArray(id)) id = id[0];
    id = String(id || '').trim();
    if (!id) return { list: [] };
    const d = await apiGet(`/drama/${encodeURIComponent(id)}`);
    if (!d?.id) return { list: [] };
    const eps = Array.isArray(d.episodes) && d.episodes.length
        ? d.episodes
        : Array.from({ length: Number(d.eps) || 1 }, (_, i) => ({
              ep: i + 1,
              video: i === 0 ? d.video : '',
              locked: false,
          }));
    const tracks = [];
    for (const ep of eps) {
        const n = ep.ep ?? tracks.length + 1;
        const url = playUrl(ep.video || (n === 1 ? d.video : ''));
        if (!url) continue;
        tracks.push(`第${n}集$${url}`);
    }
    if (!tracks.length) {
        const url = playUrl(d.video);
        if (url) tracks.push(`第1集$${url}`);
    }
    return {
        list: [
            {
                vod_id: String(d.id),
                vod_name: String(d.t || id),
                vod_pic: proxyPic(d.cover, inReq),
                vod_content: String(d.summary || ''),
                vod_remarks: [d.serial, d.eps ? `${d.eps}集` : '', d.badge].filter(Boolean).join(' · '),
                vod_play_from: '黄果漫剧',
                vod_play_url: tracks.join('#'),
            },
        ],
    };
}

async function play(inReq) {
    let raw = String(inReq.body.id || '');
    const url = playUrl(raw) || raw;
    return {
        parse: 0,
        url,
        header: { 'User-Agent': UA, Referer: `${SITE}/` },
    };
}

async function search(inReq) {
    const kw = String(inReq.body.wd || '').trim();
    if (!kw) return { list: [] };
    const r = await listDramas({ kw, page: 1 });
    return { list: r.list.map((x) => vodFrom(x, inReq)).filter(Boolean), page: 1 };
}

async function imgProxy(inReq, reply) {
    try {
        let u = decodeURIComponent(String(inReq.query.url || ''));
        try {
            const decoded = Buffer.from(u, 'base64url').toString('utf8');
            if (/^https?:\/\//i.test(decoded) || decoded.startsWith('/')) u = decoded;
        } catch {
            /* keep */
        }
        u = fix(u);
        if (!/^https?:\/\//i.test(u)) return reply.code(400).send('');
        await refreshImgKey(false);
        const fetchUrl = cryptFetchUrl(u);
        const resp = await axios.get(fetchUrl, {
            headers: { ...HEADERS, Accept: '*/*' },
            timeout: 15000,
            responseType: 'arraybuffer',
            validateStatus: () => true,
        });
        if (resp.status >= 400) return reply.code(resp.status).send('');
        let raw = Buffer.from(resp.data);
        if (!looksLikeImage(raw)) {
            let img = decryptEcb(raw, imgKey);
            if (!looksLikeImage(img)) {
                await refreshImgKey(true);
                img = decryptEcb(raw, imgKey);
            }
            raw = img;
        }
        reply.header('Content-Type', imageMime(raw)).send(raw);
    } catch {
        reply.code(500).send('');
    }
}

export default {
    meta: {
        key: 'huangguomj',
        name: '📖黄果漫剧',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/img', imgProxy);
    },
};
