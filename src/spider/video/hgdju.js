import axios from 'axios';
import crypto from 'crypto';

const PORT = process.env.DEV_HTTP_PORT || 9988;
const PREFIX = '/spider/hgdju/3';
const SITE = 'https://hgdju.com';
const API = 'https://api-hgdju.zvdumduz.cc';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const API_KEY = Buffer.from('2acf7e91e9864673');
const API_IV = Buffer.from('1c29882d3ddfcfd6');
const SIGN_KEY = '5589d41f92a597d016b037ac37db243d';
const IMG_KEY = Buffer.from('f5d965df75336270');
const IMG_IV = Buffer.from('97b60394abc2fbe1');

const CLASSES = [
    { type_id: 'home', type_name: '推荐' },
    { type_id: 'yuanchuang', type_name: '原创' },
    { type_id: 'mogai', type_name: '魔改' },
    { type_id: 'manju', type_name: 'AI漫剧' },
    { type_id: 'zhenren', type_name: '真人短剧' },
    { type_id: 'aiduanju', type_name: 'AI短剧' },
    { type_id: 'browse', type_name: '分类' },
];

const FILTERS = [
    {
        key: 'sort',
        name: '排序',
        value: [
            { n: '最热', v: 'hot' },
            { n: '最新', v: 'new' },
            { n: '追剧最多', v: 'fav' },
        ],
    },
    {
        key: 'status',
        name: '状态',
        value: [
            { n: '全部', v: '' },
            { n: '连载中', v: 'ongoing' },
            { n: '已完结', v: 'completed' },
        ],
    },
    {
        key: 'line',
        name: '频道',
        value: [
            { n: '全部', v: '' },
            { n: '原创', v: 'yuanchuang' },
            { n: '魔改', v: 'mogai' },
            { n: 'AI漫剧', v: 'manju' },
            { n: '真人短剧', v: 'zhenren' },
            { n: 'AI短剧', v: 'aiduanju' },
        ],
    },
    {
        key: 'tag',
        name: '题材',
        value: [
            { n: '全部', v: '' },
            { n: '都市邻里', v: 'dushi' },
            { n: '甜宠恋爱', v: 'tag' },
            { n: '古装玄幻', v: 'xuanhuan' },
            { n: '逆袭', v: 'nixi' },
            { n: '复仇逆袭', v: 'fuchou' },
            { n: '虐恋情深', v: 'tag-06118f' },
            { n: '穿越重生', v: 'chuanyue' },
            { n: '惊悚悬疑', v: 'xuanyi' },
            { n: '霸总激情', v: 'tianchong' },
            { n: '战神归来', v: 'tag-88650e' },
            { n: '校园恋爱', v: 'tag-834fd7' },
            { n: '末世生存', v: 'zhanshen' },
            { n: '秘密情人', v: 'tag-90323d' },
            { n: '主仆调教', v: 'tag-209de5' },
            { n: '欲望沉沦', v: 'tag-84743c' },
            { n: '绿帽淫妻', v: 'tag-2f3cfe' },
            { n: '人妻出轨', v: 'tag-adcb6b' },
            { n: '婚外偷情', v: 'tag-8477ea' },
            { n: '禁忌乱伦', v: 'tag-7cdc58' },
            { n: '反差小花', v: 'tag-634f08' },
            { n: '身体交易', v: 'tag-d40bc6' },
            { n: '系统爽剧', v: 'tag-4af083' },
            { n: '权力游戏', v: 'tag-8774fe' },
            { n: '复仇爽剧', v: 'tag-c42c7f' },
            { n: '酒店一夜情', v: 'tag-440c42' },
            { n: '潜规则秘恋', v: 'tag-b6b9cb' },
            { n: '密室调教', v: 'tag-236b2c' },
            { n: '换妻游戏', v: 'tag-1d701c' },
            { n: '动漫魔改', v: 'tag-d4f982' },
            { n: '娱乐潜规', v: 'tag-2f8891' },
            { n: '交换伴侣', v: 'tag-195078' },
            { n: '村妇养成', v: 'tag-d73c28' },
            { n: '仙侠情缘', v: 'tag-e87ee8' },
            { n: '灵异情欲', v: 'tag-7e4c73' },
            { n: '禁忌师生', v: 'tag-0d50c2' },
            { n: '仙侠调教', v: 'tag-9468e1' },
            { n: '修真双修', v: 'tag-c3e4f4' },
        ],
    },
];

function siteHeaders() {
    return {
        'User-Agent': UA,
        Accept: 'application/json,text/plain,*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Origin: SITE,
        Referer: `${SITE}/`,
    };
}

function encrypt(plain) {
    const cipher = crypto.createCipheriv('aes-128-cbc', API_KEY, API_IV);
    cipher.setAutoPadding(true);
    return Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]).toString('base64');
}

function decrypt(b64) {
    const decipher = crypto.createDecipheriv('aes-128-cbc', API_KEY, API_IV);
    decipher.setAutoPadding(true);
    return Buffer.concat([
        decipher.update(Buffer.from(String(b64).replace(/ /g, '+'), 'base64')),
        decipher.final(),
    ]).toString('utf8');
}

function makeSign(obj) {
    const keys = Object.keys(obj)
        .filter((k) => !['sign', '_ver'].includes(k) && obj[k] != null)
        .sort();
    const raw =
        keys.map((k) => `${k}=${k === 'data' ? String(obj[k]).replace(/ /g, '+') : obj[k]}`).join('&') + SIGN_KEY;
    const sha = crypto.createHash('sha256').update(raw).digest('hex');
    return crypto.createHash('md5').update(sha).digest('hex');
}

function parseExtend(raw) {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    try {
        const o = JSON.parse(String(raw));
        return o && typeof o === 'object' ? o : {};
    } catch {
        return {};
    }
}

function qs(params) {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
        if (v === undefined || v === null || v === '') continue;
        u.set(k, String(v));
    }
    const s = u.toString();
    return s ? `?${s}` : '';
}

async function apiPost(path, payload = {}) {
    const data = encrypt(JSON.stringify(payload));
    const body = {
        _ver: 'v0',
        data,
        timestamp: Math.floor(Date.now() / 1000),
        client: 'ios',
    };
    body.sign = makeSign(body);
    const form = new URLSearchParams();
    for (const k of ['_ver', 'client', 'data', 'sign', 'timestamp']) form.append(k, String(body[k]));
    const resp = await axios.post(API + path, form.toString(), {
        headers: {
            ...siteHeaders(),
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 20000,
        validateStatus: () => true,
        family: 4,
    });
    const json = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
    if (!json?.data) return null;
    const dec = JSON.parse(decrypt(json.data));
    return dec?.data ?? dec;
}

function coverUrl(it) {
    if (!it) return '';
    if (typeof it.cover === 'string') return it.cover;
    return it.cover?.url || it.cover_url || '';
}

function slugOf(it) {
    if (!it) return '';
    if (it.slug) return String(it.slug);
    const route = String(it.detail_route || it.route || it.play_route || '');
    return (route.match(/dj-[a-f0-9]+/i) || [])[0] || '';
}

function remarksOf(it) {
    const n = it.published_episode_count || it.latest_episode_number || it.total_episode_count || it.total_episodes;
    const st = it.serial_status === 'completed' || it.status === 'completed' ? '完结' : n ? '更新' : '';
    const heat = it.heat_7d || it.heat;
    const parts = [];
    if (n) parts.push(`${st ? `${st}至` : ''}${n}集`);
    else if (st) parts.push(st);
    if (heat) parts.push(`${heat}热度`);
    return parts.join(' · ');
}

function proxyPic(url, inReq) {
    if (!url) return '';
    const prefix = inReq?.server?.prefix || PREFIX;
    const enc = Buffer.from(String(url), 'utf8').toString('base64url');
    return `http://127.0.0.1:${PORT}${prefix}/img?url=${encodeURIComponent(enc)}`;
}

function toVod(it, inReq) {
    const id = slugOf(it);
    if (!id) return null;
    return {
        vod_id: id,
        vod_name: String(it.title || id),
        vod_pic: proxyPic(coverUrl(it), inReq),
        vod_remarks: remarksOf(it),
    };
}

function itemsOf(data) {
    if (!data) return [];
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.dramas)) return data.dramas;
    if (Array.isArray(data.hot)) return data.hot;
    const merged = [];
    for (const key of ['hot', 'featured', 'freshest']) {
        const arr = data[key]?.items;
        if (Array.isArray(arr)) merged.push(...arr);
    }
    if (Array.isArray(data.channel_sections)) {
        for (const sec of data.channel_sections) {
            if (Array.isArray(sec.items)) merged.push(...sec.items);
        }
    }
    return merged;
}

function pageMeta(data, page) {
    const p = data?.pagination || {};
    return {
        page: Number(p.page || page) || 1,
        pagecount: Number(p.total_pages || 1) || 1,
        limit: Number(p.page_size || 30) || 30,
        total: Number(p.total || itemsOf(data).length) || 0,
    };
}

function looksLikeImage(buf) {
    if (!buf || buf.length < 8) return false;
    if (buf[0] === 0xff && buf[1] === 0xd8) return true;
    if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;
    if (buf.slice(0, 4).toString('ascii') === 'RIFF') return true;
    const gif = buf.slice(0, 6).toString('ascii');
    return gif === 'GIF87a' || gif === 'GIF89a';
}

function decryptImg(raw) {
    if (!raw || looksLikeImage(raw)) return raw;
    if (raw.length % 16 !== 0) return raw;
    try {
        const d = crypto.createDecipheriv('aes-128-cbc', IMG_KEY, IMG_IV);
        d.setAutoPadding(true);
        const pt = Buffer.concat([d.update(raw), d.final()]);
        return looksLikeImage(pt) ? pt : raw;
    } catch {
        return raw;
    }
}

function imageMime(buf) {
    if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
    if (buf.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return 'image/png';
    if (buf.slice(0, 3).toString('ascii') === 'GIF') return 'image/gif';
    if (buf.slice(0, 4).toString('ascii') === 'RIFF') return 'image/webp';
    return 'image/jpeg';
}

async function init() {
    return {};
}

async function home(inReq) {
    const data = await apiPost('/api/v1/home', {});
    const filters = {};
    for (const c of CLASSES) filters[c.type_id] = FILTERS;
    const seen = new Set();
    const list = [];
    for (const it of itemsOf(data)) {
        const vod = toVod(it, inReq);
        if (!vod || seen.has(vod.vod_id)) continue;
        seen.add(vod.vod_id);
        list.push(vod);
    }
    return { class: CLASSES, filters, list };
}

async function category(inReq) {
    const page = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);
    const tid = String(inReq.body.id || 'home');
    const ext = parseExtend(inReq.body.extend || inReq.body.filters || inReq.body.filter);
    const line = ext.line || (tid !== 'home' && tid !== 'browse' ? tid : '');
    const tag = ext.tag || '';
    const status = ext.status || '';
    const sort = ext.sort || (tid === 'home' ? 'hot' : '');
    const useBrowse = tid === 'browse' || tid === 'home' || tag || status || ext.line || (tid !== 'home' && sort);
    let data;
    if (!useBrowse && line) {
        data = await apiPost(`/api/v1/channels/${encodeURIComponent(line)}${qs({ page })}`, {});
    } else {
        data = await apiPost(
            `/api/v1/dramas${qs({ page, line, tag, status, sort: sort || 'hot' })}`,
            {},
        );
    }
    return { list: itemsOf(data).map((it) => toVod(it, inReq)).filter(Boolean), ...pageMeta(data, page) };
}

async function detail(inReq) {
    let id = inReq.body.id;
    if (Array.isArray(id)) id = id[0];
    id = String(id || '').trim();
    if (!id) return { list: [] };
    const data = await apiPost(`/api/v1/dramas/${encodeURIComponent(id)}`, {});
    if (!data?.slug && !data?.title) return { list: [] };
    const eps = Array.isArray(data.episodes) ? data.episodes : [];
    const urls = eps
        .map((ep) => {
            const n = ep.number || ep.id;
            if (!n) return '';
            return `第${n}集$${data.slug || id}|${n}`;
        })
        .filter(Boolean);
    const tags = (data.tags || []).map((t) => t.name).filter(Boolean).join(',');
    return {
        list: [
            {
                vod_id: data.slug || id,
                vod_name: data.title || id,
                vod_pic: proxyPic(coverUrl(data), inReq),
                vod_remarks: remarksOf(data),
                vod_content: data.intro || '',
                vod_year: String(data.published_at || '').slice(0, 10),
                vod_area: data.channel?.name || '',
                vod_class: tags,
                vod_play_from: '黄瓜短剧',
                vod_play_url: urls.join('#'),
            },
        ],
    };
}

function playHeaders() {
    return { 'User-Agent': UA, Referer: `${SITE}/`, Origin: SITE };
}

async function play(inReq) {
    let raw = String(inReq.body.id || '');
    if (raw.includes('$')) raw = raw.split('$').pop();
    if (/^https?:\/\//i.test(raw)) {
        return { parse: 0, url: raw, header: playHeaders() };
    }
    const [slug, ep] = raw.split('|');
    if (!slug) return { parse: 0, url: '' };
    const data = await apiPost(`/api/v1/dramas/${encodeURIComponent(slug)}/episodes/${encodeURIComponent(ep || '1')}`, {});
    const url = data?.media?.source_url || data?.media?.h265_url || '';
    return { parse: 0, url, header: playHeaders() };
}

async function search(inReq) {
    const kw = String(inReq.body.wd || '').trim();
    if (!kw) return { list: [] };
    const page = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);
    const data = await apiPost(`/api/v1/search${qs({ q: kw, page })}`, {});
    return {
        list: itemsOf(data).map((it) => toVod(it, inReq)).filter(Boolean),
        ...pageMeta(data, page),
    };
}

async function imgProxy(inReq, reply) {
    try {
        let u = decodeURIComponent(String(inReq.query.url || ''));
        try {
            const decoded = Buffer.from(u, 'base64url').toString('utf8');
            if (/^https?:\/\//i.test(decoded)) u = decoded;
        } catch {
            /* keep */
        }
        if (!/^https?:\/\//i.test(u)) return reply.code(400).send('');
        const resp = await axios.get(u, {
            headers: { 'User-Agent': UA, Referer: `${SITE}/`, Origin: SITE },
            timeout: 15000,
            responseType: 'arraybuffer',
            validateStatus: () => true,
            family: 4,
        });
        if (resp.status >= 400) return reply.code(resp.status).send('');
        const img = decryptImg(Buffer.from(resp.data));
        reply.header('Content-Type', imageMime(img)).send(img);
    } catch {
        reply.code(500).send('');
    }
}

export default {
    meta: { key: 'hgdju', name: '🥒黄瓜短剧', type: 3 },
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
