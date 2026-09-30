import crypto from 'crypto';
import req from '../../util/req.js';

const PORT = process.env.DEV_HTTP_PORT || 9988;
const PREFIX = '/spider/yeguodj/3';
const SITE = 'https://www.yeguodj.com';
const UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const API_KEY = Buffer.from('2acf7e91e9864673');
const API_IV = Buffer.from('1c29882d3ddfcfd6');
const MEDIA_KEY = Buffer.from('f5d965df75336270');
const MEDIA_IV = Buffer.from('97b60394abc2fbe1');

let apiBase = `${SITE}/api.php`;

const CLASSES = [
    { type_id: 'explore', type_name: '发现' },
    { type_id: 'rank', type_name: '排行榜' },
    { type_id: 'dushi', type_name: '都市' },
    { type_id: 'xiandai', type_name: '现代' },
    { type_id: 'xiaoyuan', type_name: '校园' },
    { type_id: 'gudai', type_name: '古代' },
    { type_id: 'xiangcun', type_name: '乡村' },
    { type_id: 'zhichang', type_name: '职场' },
    { type_id: 'chongsheng', type_name: '重生' },
    { type_id: 'chuanyue', type_name: '穿越' },
    { type_id: 'xitong', type_name: '系统' },
    { type_id: 'nixi', type_name: '逆袭' },
    { type_id: 'mogai', type_name: '魔改' },
];

const BG_MAP = {
    dushi: 40,
    xiandai: 39,
    xiaoyuan: 47,
    gudai: 41,
    xiangcun: 42,
    zhichang: 44,
};

const SETTING_MAP = {
    chongsheng: 26,
    chuanyue: 27,
    xitong: 28,
    nixi: 53,
    mogai: 56,
};

const HDR = {
    'User-Agent': UA,
    Referer: `${SITE}/`,
    Origin: SITE,
    Accept: 'application/json, text/plain, */*',
};

function aesCbcDecrypt(buf, key, iv) {
    if (!buf?.length || buf.length % 16 !== 0) return Buffer.alloc(0);
    try {
        const d = crypto.createDecipheriv('aes-128-cbc', key, iv);
        return Buffer.concat([d.update(buf), d.final()]);
    } catch {
        return Buffer.alloc(0);
    }
}

function looksLikeImage(buf) {
    if (!buf || buf.length < 3) return false;
    if (buf[0] === 0xff && buf[1] === 0xd8) return true;
    if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;
    if (buf.slice(0, 3).toString('ascii') === 'GIF') return true;
    if (buf.slice(0, 4).toString('ascii') === 'RIFF') return true;
    return false;
}

function imageMime(buf) {
    if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
    if (buf.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return 'image/png';
    if (buf.slice(0, 3).toString('ascii') === 'GIF') return 'image/gif';
    if (buf.slice(0, 4).toString('ascii') === 'RIFF') return 'image/webp';
    return 'image/jpeg';
}

function unwrap(d) {
    if (!d) return {};
    let x = d.data != null ? d.data : d;
    if (x && typeof x === 'object' && !Array.isArray(x) && x.data && typeof x.data === 'object' && !Array.isArray(x.data)) {
        return x.data;
    }
    return x;
}

function parseExt(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(String(raw)); } catch { return {}; }
}

function proxyPic(pic, inReq) {
    const p = String(pic || '').trim();
    if (!p) return '';
    const prefix = inReq?.server?.prefix || PREFIX;
    return `http://127.0.0.1:${PORT}${prefix}/img?url=${encodeURIComponent(p)}`;
}

function formatRemarks(meta) {
    const clean = String(meta || '').replace(/[\r\n\t]+/g, ' ').trim();
    return clean ? `野果短剧 | ${clean}` : '野果短剧';
}

function toVod(it, inReq) {
    if (!it) return null;
    const vid = String(it.video_id ?? it.id ?? '').trim();
    if (!vid) return null;
    const title = String(it.title || it.video_title || it.name || vid).trim();
    const rawPic = String(it.cover || it.cover_img || it.pic || '').trim();
    const ep = it.episode_count || it.episodes || it.total_serial || '';
    let remark = String(it.update_status || it.serialize_status_text || '').trim();
    if (!remark && ep) remark = `更新至${ep}集`;
    return {
        vod_id: vid,
        vod_name: title,
        vod_pic: proxyPic(rawPic, inReq),
        vod_remarks: formatRemarks(remark),
    };
}

function listFromPayload(d, inReq) {
    const inner = unwrap(d);
    let arr = [];
    if (Array.isArray(inner)) arr = inner;
    else if (inner && typeof inner === 'object') arr = inner.list || inner.top_list || [];
    const out = [];
    for (const it of arr) {
        const v = toVod(it, inReq);
        if (v) out.push(v);
    }
    return out;
}

async function apiPost(path, body) {
    const url = `${apiBase}${path}`;
    let resp;
    try {
        resp = await req.post(url, body || {}, {
            headers: { ...HDR, 'Content-Type': 'application/json;charset=UTF-8' },
            timeout: 10000,
            validateStatus: (s) => s === 200,
        });
    } catch {
        return {};
    }
    const d = resp.data;
    if (!d || typeof d !== 'object') return {};
    const dataVal = d.data;
    if (typeof dataVal === 'string' && dataVal.length > 20) {
        try {
            const raw = Buffer.from(dataVal, 'base64');
            const dec = aesCbcDecrypt(raw, API_KEY, API_IV);
            if (dec.length) d.data = JSON.parse(dec.toString('utf8'));
        } catch { /* keep original */ }
    }
    return d;
}

async function init(inReq) {
    const ext = parseExt(inReq?.body?.ext || inReq?.body?.extend);
    if (ext.apiBase) apiBase = String(ext.apiBase).replace(/\/+$/, '');
    return {};
}

async function home(inReq) {
    const d = await apiPost('/api/home/homePage', {});
    const inner = unwrap(d);
    const combined = [];
    if (inner && typeof inner === 'object') {
        combined.push(...(inner.top_list || []));
        const mods = inner.modules?.list || [];
        for (const m of mods) {
            if (!m || typeof m !== 'object') continue;
            if (Array.isArray(m.list)) combined.push(...m.list);
            else if (m.video_id) combined.push(m);
        }
    }
    const seen = new Set();
    const list = [];
    for (const it of combined) {
        const v = toVod(it, inReq);
        if (v && !seen.has(v.vod_id)) {
            seen.add(v.vod_id);
            list.push(v);
        }
    }
    return { class: CLASSES, filters: {}, list: list.slice(0, 30) };
}

async function category(inReq) {
    const page = parseInt(inReq.body.page || inReq.body.pg, 10) || 1;
    const slug = String(inReq.body.id || inReq.body.tid || 'explore').trim();
    let d = {};
    if (slug === 'rank') {
        d = await apiPost('/api/theater/videoRank', { page, limit: 24 });
    } else if (slug in BG_MAP) {
        d = await apiPost('/api/theater/exploreList', { page, limit: 24, background: BG_MAP[slug] });
    } else if (slug in SETTING_MAP) {
        d = await apiPost('/api/theater/exploreList', { page, limit: 24, setting: SETTING_MAP[slug] });
    } else {
        d = await apiPost('/api/theater/exploreList', { page, limit: 24 });
    }
    const list = listFromPayload(d, inReq);
    return {
        page,
        pagecount: list.length >= 24 ? page + 1 : page,
        limit: 24,
        total: 9999,
        list,
    };
}

async function detail(inReq) {
    let vid = inReq.body.id;
    if (Array.isArray(vid)) vid = vid[0];
    vid = String(vid || '').trim();
    if (!vid) return { list: [] };
    const vNum = /^\d+$/.test(vid) ? Number(vid) : vid;
    let info = unwrap(await apiPost('/api/playlet/detail', { video_id: vNum }));
    if (info && typeof info === 'object' && info.video_id == null && info.data && typeof info.data === 'object') {
        info = info.data;
    }
    const title = String(info.title || vid).trim();
    const rawPic = String(info.cover || info.cover_img || '').trim();
    const rawDesc = String(info.description || info.intro || '').trim();
    const eps = Array.isArray(info.episodes) ? info.episodes : [];
    const playUrls = [];
    if (eps.length) {
        eps.forEach((ep, idx) => {
            const n = String(ep.sort || ep.episode || idx + 1).trim();
            let tName = String(ep.title || `第${n}集`).trim().replace(/\$|#/g, '');
            playUrls.push(`${tName}$${vid}:${n}`);
        });
    } else {
        const total = parseInt(info.episode_count || info.total_serial, 10) || 1;
        for (let i = 1; i <= total; i++) playUrls.push(`第${i}集$${vid}:${i}`);
    }
    return {
        list: [{
            vod_id: vid,
            vod_name: title,
            vod_pic: proxyPic(rawPic, inReq),
            vod_content: rawDesc,
            vod_remarks: formatRemarks(`全${playUrls.length}集`),
            vod_play_from: '野果专线',
            vod_play_url: playUrls.join('#'),
        }],
    };
}

async function play(inReq) {
    const raw = String(inReq.body.id || '').trim();
    const [vid, ep = '1'] = raw.split(':');
    const vNum = /^\d+$/.test(vid) ? Number(vid) : vid;
    const epNum = /^\d+$/.test(ep) ? Number(ep) : ep;
    let info = unwrap(await apiPost('/api/playlet/play', { video_id: vNum, ep: epNum }));
    if (info && typeof info === 'object' && info.video_url == null && info.data && typeof info.data === 'object') {
        info = info.data;
    }
    const targetEp = String(ep).trim();
    let videoUrl = '';
    const episodeAll = info.episodeAll;
    if (Array.isArray(episodeAll) && episodeAll.length) {
        for (let idx = 0; idx < episodeAll.length; idx++) {
            const episode = episodeAll[idx];
            if (!episode || typeof episode !== 'object') continue;
            const episodeNo = String(episode.sort || episode.episode || episode.index || idx + 1).trim();
            if (episodeNo === targetEp) {
                videoUrl = String(episode.video_url || '').trim();
                break;
            }
        }
        if (!videoUrl && String(info.episode_sort || '').trim() === targetEp) {
            videoUrl = String(info.video_url || '').trim();
        }
    } else {
        videoUrl = String(info.video_url || '').trim();
    }
    return {
        parse: 0,
        url: videoUrl,
        header: { 'User-Agent': UA, Referer: `${SITE}/`, Origin: SITE },
    };
}

async function search(inReq) {
    const kw = String(inReq.body.wd || '').trim();
    if (!kw) return { list: [] };
    const page = parseInt(inReq.body.page || inReq.body.pg, 10) || 1;
    const d = await apiPost('/api/search/result', { keyword: kw, page });
    const list = listFromPayload(d, inReq);
    return {
        page,
        pagecount: list.length >= 20 ? page + 1 : page,
        limit: list.length,
        total: 9999,
        list,
    };
}

async function imgProxy(inReq, reply) {
    let rawUrl = decodeURIComponent(String(inReq.query.url || inReq.query.u || '')).trim();
    if (!rawUrl) return reply.code(400).send('Missing url');
    if (rawUrl.startsWith('//')) rawUrl = `https:${rawUrl}`;
    else if (rawUrl.startsWith('/')) rawUrl = SITE + rawUrl;
    if (!/^https?:\/\//i.test(rawUrl)) return reply.code(400).send('Bad url');
    try {
        const resp = await req.get(rawUrl, {
            headers: {
                'User-Agent': UA,
                Referer: 'https://yeguodj.com/',
                Origin: 'https://yeguodj.com',
                Accept: 'image/*,*/*;q=0.8',
            },
            timeout: 10000,
            responseType: 'arraybuffer',
            validateStatus: () => true,
        });
        let raw = Buffer.from(resp.data || []);
        if (!raw.length) return reply.code(404).send('Empty image');
        if (looksLikeImage(raw)) {
            return reply.header('Content-Type', imageMime(raw)).send(raw);
        }
        let cipher = raw;
        try {
            let trimmed = raw.toString('latin1').trim();
            if (trimmed.startsWith('data:')) trimmed = trimmed.replace(/^data:[^;]+;base64,/, '');
            if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed.slice(0, 80))) {
                cipher = Buffer.from(trimmed, 'base64');
            }
        } catch { /* keep raw */ }
        const dec = aesCbcDecrypt(cipher, MEDIA_KEY, MEDIA_IV);
        if (dec.length) {
            const img = looksLikeImage(dec) ? dec : dec;
            return reply.header('Content-Type', imageMime(img)).send(img);
        }
        return reply.header('Content-Type', 'image/jpeg').send(raw);
    } catch (e) {
        return reply.code(500).send(String(e.message || e));
    }
}

export default {
    meta: {
        key: 'yeguodj',
        name: '📖野果短剧',
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
