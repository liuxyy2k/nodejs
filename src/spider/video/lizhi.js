import axios from 'axios';
import crypto from 'crypto';

const DEFAULT_SITE = 'https://lzzsfswfs.cc';
const PORT = process.env.DEV_HTTP_PORT || 9988;
const PREFIX = '/spider/lizhi/3';
const MEDIA_HOSTS = ['media.lizdj010.com', 'media.sjziii.info'];
const UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const PAGE_SIZE = 20;

let site = DEFAULT_SITE;
const deviceId = crypto.randomUUID();
let imgKeyHex = '';
let imgIvHex = '';

const CLASSES = [
    { type_id: 'home', type_name: '推荐' },
    { type_id: 'original', type_name: '荔枝原创' },
    { type_id: 'picked', type_name: '荔枝精选' },
    { type_id: 'rank_week', type_name: '周榜' },
    { type_id: 'browse', type_name: '分类' },
];

const FILTERS = [
    {
        key: 'sort',
        name: '排序',
        value: [
            { n: '最新', v: 'latest' },
            { n: '最热', v: 'hot' },
            { n: '收藏', v: 'fav' },
            { n: '点赞', v: 'like' },
        ],
    },
    {
        key: 'channelId',
        name: '频道',
        value: [
            { n: '全部', v: '' },
            { n: '荔枝原创', v: '31' },
            { n: '荔枝精选', v: '32' },
        ],
    },
];

function parseExtend(raw) {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    const txt = String(raw).trim();
    if (!txt) return {};
    if (txt.startsWith('{')) {
        try {
            const o = JSON.parse(txt);
            return o && typeof o === 'object' ? o : {};
        } catch {
            return {};
        }
    }
    if (txt.startsWith('http')) return { site: txt };
    return {};
}

function applyExtend(ext) {
    const h = ext.site || ext.host || ext.url;
    if (h) {
        let u = String(h).trim();
        if (!u.startsWith('http')) u = `https://${u}`;
        site = u.replace(/\/$/, '');
    }
}

function headers(extra = {}) {
    return {
        'User-Agent': UA,
        Accept: 'application/json, text/plain, */*',
        Referer: `${site}/`,
        Origin: site,
        deviceId,
        'X-Device-Id': deviceId,
        ...extra,
    };
}

async function apiGet(path) {
    const resp = await axios.get(`${site}${path}`, {
        headers: headers(),
        timeout: 20000,
        validateStatus: () => true,
        family: 4,
    });
    if (resp.status >= 400) return null;
    const json = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
    if (!json?.success || json.code !== '000000') return null;
    return json.data;
}

async function apiPost(path, body) {
    const resp = await axios.post(`${site}${path}`, body, {
        headers: { ...headers(), 'Content-Type': 'application/json' },
        timeout: 20000,
        validateStatus: () => true,
        family: 4,
    });
    if (resp.status >= 400) return null;
    const json = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
    if (!json?.success || json.code !== '000000') return null;
    return json.data;
}

function absUrl(u) {
    if (!u) return '';
    u = String(u).trim();
    if (u.startsWith('http')) return u;
    if (u.startsWith('/')) return site + u;
    return u;
}

function isEncryptedMediaUrl(u) {
    try {
        const host = new URL(String(u)).hostname.toLowerCase();
        return MEDIA_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
    } catch {
        return false;
    }
}

function proxyPic(pic, inReq) {
    const p = absUrl(pic);
    if (!p) return '';
    if (!isEncryptedMediaUrl(p)) return p;
    const prefix = inReq?.server?.prefix || PREFIX;
    return `http://127.0.0.1:${PORT}${prefix}/img?url=${encodeURIComponent(p)}`;
}

function looksLikeImage(buf) {
    if (!buf || buf.length < 8) return false;
    if (buf[0] === 0xff && buf[1] === 0xd8) return true;
    if (buf.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return true;
    if (buf.slice(0, 4).toString('ascii') === 'RIFF') return true;
    const gif = buf.slice(0, 6).toString('ascii');
    return gif === 'GIF87a' || gif === 'GIF89a';
}

function pkcs7Unpad(buf) {
    if (!buf?.length || buf.length % 16 !== 0) return null;
    const t = buf[buf.length - 1];
    if (t < 1 || t > 16) return null;
    for (let r = 0; r < t; r += 1) {
        if (buf[buf.length - 1 - r] !== t) return null;
    }
    return buf.subarray(0, buf.length - t);
}

function imageMime(buf) {
    if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
    if (buf.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return 'image/png';
    if (buf.slice(0, 3).toString('ascii') === 'GIF') return 'image/gif';
    if (buf.slice(0, 4).toString('ascii') === 'RIFF') return 'image/webp';
    return 'image/jpeg';
}

function decryptCover(raw) {
    if (!raw?.length || looksLikeImage(raw)) return raw;
    if (!imgKeyHex || !imgIvHex || raw.length % 16 !== 0) return raw;
    try {
        const d = crypto.createDecipheriv(
            'aes-128-cbc',
            Buffer.from(imgKeyHex, 'hex'),
            Buffer.from(imgIvHex, 'hex'),
        );
        d.setAutoPadding(false);
        let pt = Buffer.concat([d.update(raw), d.final()]);
        pt = pkcs7Unpad(pt) || pt;
        return looksLikeImage(pt) ? pt : raw;
    } catch {
        return raw;
    }
}

async function loadImageKeys() {
    try {
        const resp = await axios.get(`${site}/`, {
            headers: headers(),
            timeout: 15000,
            validateStatus: () => true,
            family: 4,
        });
        if (resp.status >= 400) return;
        const html = String(resp.data || '');
        const mKey = html.match(/imageAesKeyHex:"([0-9a-f]{32})"/i);
        const mIv = html.match(/imageAesIvHex:"([0-9a-f]{32})"/i);
        if (mKey) imgKeyHex = mKey[1];
        if (mIv) imgIvHex = mIv[1];
    } catch {
        /* keep previous keys */
    }
}

function remarksOf(it) {
    const pub = it.publishedEpisodeCount;
    const total = it.totalEpisodes;
    const parts = [];
    if (pub && total && pub < total) parts.push(`更新至${pub}集`);
    else if (total) parts.push(`全${total}集`);
    if (it.score) parts.push(`${it.score}分`);
    if (it.displayViewText) parts.push(`${it.displayViewText}播放`);
    if (it.coverBadge) parts.push(it.coverBadge);
    return parts.join(' · ');
}

function toVod(it, inReq) {
    if (!it?.id || !it?.title) return null;
    return {
        vod_id: String(it.id),
        vod_name: String(it.title),
        vod_pic: proxyPic(it.coverUrl, inReq),
        vod_remarks: remarksOf(it),
    };
}

function itemsFromList(data) {
    return data?.page?.items || data?.items || [];
}

function pageMeta(data, page) {
    const p = data?.page || data || {};
    const total = Number(p.total || 0);
    const hasMore = !!p.hasMore;
    return {
        page: Number(page) || 1,
        pagecount: hasMore ? (Number(page) || 1) + 1 : Number(page) || 1,
        limit: Number(p.size) || PAGE_SIZE,
        total: total || itemsFromList(data).length,
    };
}

async function fetchList(params, page) {
    const q = new URLSearchParams({ page: String(page) });
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
    }
    return apiGet(`/api/v1/drama/list?${q}`);
}

async function listForType(tid, page, ext) {
    if (tid === 'rank_week') {
        return apiGet(`/api/v1/rank?type=week&page=${page}`);
    }
    const params = {};
    if (ext.sort) params.sort = ext.sort;
    if (ext.categoryId) params.categoryId = ext.categoryId;
    if (ext.tagIds) params.tagIds = ext.tagIds;
    if (ext.channelId) params.channelId = ext.channelId;
    if (tid === 'original') params.channelId = params.channelId || '31';
    if (tid === 'picked') params.channelId = params.channelId || '32';
    if (tid === 'browse') {
        if (!params.sort) params.sort = 'latest';
    }
    return fetchList(params, page);
}

async function init(inReq) {
    applyExtend(parseExtend(inReq.body?.extend || inReq.body?.ext || ''));
    await loadImageKeys();
    await apiGet('/api/v1/system/key-exchange');
    return {};
}

async function home(inReq) {
    const filters = {};
    for (const c of CLASSES) filters[c.type_id] = FILTERS;
    const data = await apiGet('/api/v1/homepage');
    const hp = data?.homepage || {};
    const seen = new Set();
    const list = [];
    for (const src of [
        ...(hp.banners || []).map((b) => ({ id: b.dramaId, title: b.title, coverUrl: b.imageUrl, totalEpisodes: b.totalEpisodes, publishedEpisodeCount: b.publishedEpisodeCount })),
        ...(hp.topics || []).flatMap((t) => t.dramas || []),
    ]) {
        const vod = toVod(src, inReq);
        if (!vod || seen.has(vod.vod_id)) continue;
        seen.add(vod.vod_id);
        list.push(vod);
    }
    if (!list.length) {
        const fallback = await fetchList({ sort: 'hot' }, 1);
        list.push(...itemsFromList(fallback).map((it) => toVod(it, inReq)).filter(Boolean));
    }
    return { class: CLASSES, filters, list };
}

async function category(inReq) {
    const page = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);
    const tid = String(inReq.body.id || 'home');
    const ext = parseExtend(inReq.body.extend || inReq.body.filters || inReq.body.filter);
    if (tid === 'home') {
        const data = await fetchList({ sort: ext.sort || 'hot', channelId: ext.channelId, categoryId: ext.categoryId }, page);
        return {
            list: itemsFromList(data).map((it) => toVod(it, inReq)).filter(Boolean),
            ...pageMeta(data, page),
        };
    }
    const data = await listForType(tid, page, ext);
    if (tid === 'rank_week') {
        const list = (data?.items || [])
            .map((it) =>
                toVod(it.drama ? { ...it.drama, displayViewCount: it.viewCount } : it, inReq),
            )
            .filter(Boolean);
        return { list, ...pageMeta(data, page) };
    }
    return {
        list: itemsFromList(data).map((it) => toVod(it, inReq)).filter(Boolean),
        ...pageMeta(data, page),
    };
}

async function detail(inReq) {
    let id = inReq.body.id;
    if (Array.isArray(id)) id = id[0];
    id = String(id || '').trim();
    if (!id) return { list: [] };
    const drama = await apiGet(`/api/v1/drama/${encodeURIComponent(id)}`);
    const eps = await apiGet(`/api/v1/drama/${encodeURIComponent(id)}/episodes`);
    const epList = Array.isArray(eps) ? eps.filter((e) => e.available && e.episodeId) : [];
    const urls = epList.map((ep) => {
        const n = ep.epNo || ep.title;
        return `${ep.title || `第${n}集`}$${id}|${ep.epNo}`;
    });
    const tags = (drama?.tags || []).map((t) => t.name).filter(Boolean).join(',');
    return {
        list: [
            {
                vod_id: id,
                vod_name: drama?.title || id,
                vod_pic: proxyPic(drama?.coverUrl, inReq),
                vod_content: drama?.description || '',
                vod_class: tags,
                vod_remarks: remarksOf(drama || {}),
                vod_play_from: '荔枝短剧',
                vod_play_url: urls.join('#'),
            },
        ],
    };
}

async function play(inReq) {
    let raw = String(inReq.body.id || '');
    if (raw.includes('$')) raw = raw.split('$').pop();
    if (/^https?:\/\//i.test(raw)) {
        return { parse: 0, url: raw, header: headers() };
    }
    const [dramaId, epNo] = raw.split('|');
    if (!dramaId || !epNo) return { parse: 0, url: '' };
    const data = await apiGet(`/api/v1/drama/${encodeURIComponent(dramaId)}/ep/${encodeURIComponent(epNo)}`);
    if (data?.episodeId) {
        apiPost('/api/v1/drama/play', {
            dramaId: Number(dramaId) || dramaId,
            episodeId: data.episodeId,
            progressSeconds: 0,
            deviceId,
        }).catch(() => {});
    }
    const url = absUrl(data?.playbackUrl || '');
    return { parse: 0, url, header: headers() };
}

async function search(inReq) {
    const kw = String(inReq.body.wd || '').trim();
    if (!kw) return { list: [] };
    const page = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);
    const data = await apiGet(`/api/v1/search?q=${encodeURIComponent(kw)}&page=${page}`);
    const result = data?.result?.page || data?.page;
    return {
        list: itemsFromList({ page: result }).map((it) => toVod(it, inReq)).filter(Boolean),
        ...pageMeta({ page: result }, page),
    };
}

async function imgProxy(inReq, reply) {
    try {
        if (!imgKeyHex || !imgIvHex) await loadImageKeys();
        const u = decodeURIComponent(String(inReq.query.url || ''));
        if (!/^https?:\/\//i.test(u)) return reply.code(400).send('');
        const resp = await axios.get(u, {
            headers: { 'User-Agent': UA, Referer: `${site}/`, Origin: site },
            timeout: 15000,
            responseType: 'arraybuffer',
            validateStatus: () => true,
            family: 4,
        });
        if (resp.status >= 400) return reply.code(resp.status).send('');
        const img = decryptCover(Buffer.from(resp.data));
        return reply.header('Content-Type', imageMime(img)).send(img);
    } catch {
        return reply.code(500).send('');
    }
}

export default {
    meta: { key: 'lizhi', name: '🍒荔枝短剧', type: 3 },
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
