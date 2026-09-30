import req from '../../util/req.js';

const DEFAULT_HOST = 'https://blue.xdrgcewe.cc';
const UA =
    'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const SPECIAL = new Set([
    'ShallowReactive', 'Reactive', 'Ref', 'ShallowRef', 'ToRaw',
    'Readonly', 'ShallowReadonly', 'Set', 'Map', 'Date', 'RegExp',
]);
const CLASSES = [
    { type_name: '首页推荐', type_id: 'home' },
    { type_name: '排行榜', type_id: 'rank' },
    { type_name: '剧场', type_id: 'theater' },
    { type_name: '最新', type_id: 'new' },
];

let host = DEFAULT_HOST;

function hdr() {
    return {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Referer: `${host}/`,
        'Cache-Control': 'no-cache',
    };
}

function playHdr() {
    return { 'User-Agent': UA, Referer: `${host}/`, Origin: host, Accept: '*/*' };
}

function unescapeHtml(s) {
    return String(s || '')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

function slash(u) {
    return String(u || '').replace(/\\u002F/g, '/').replace(/\\\//g, '/');
}

function fullUrl(u) {
    if (!u) return '';
    u = slash(u).trim();
    if (u.startsWith('//')) return `https:${u}`;
    if (/^https?:\/\//i.test(u)) return u;
    return host.replace(/\/+$/, '') + (u.startsWith('/') ? u : `/${u}`);
}

function decodeImgPath(src) {
    if (!src) return '';
    src = String(src).trim();
    const m = src.match(/\/_img\/([A-Za-z0-9_\-+/=]+)/);
    if (m) {
        let b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
        b64 += '='.repeat((4 - (b64.length % 4)) % 4);
        try {
            const real = Buffer.from(b64, 'base64').toString('utf8');
            if (real.startsWith('http')) return real;
        } catch { /* keep */ }
    }
    return src;
}

function imageUrl(src) {
    if (!src) return '';
    src = String(src).trim();
    if (src.startsWith('data:')) return '';
    const real = fullUrl(decodeImgPath(src));
    if (!/^https?:\/\//i.test(real)) return '';
    const token = Buffer.from(real, 'utf8').toString('base64');
    return `${host.replace(/\/+$/, '')}/_img/${token}`;
}

function isVideoFmt(url) {
    return /\.(?:m3u8|mp4|flv)(?:$|[?#])/i.test(String(url || ''));
}

async function get(pathOrUrl) {
    const url = /^https?:\/\//i.test(pathOrUrl)
        ? pathOrUrl
        : host.replace(/\/+$/, '') + (pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`);
    try {
        const r = await req.get(url, { headers: hdr(), timeout: 25000, validateStatus: () => true });
        const t = typeof r.data === 'string' ? r.data : String(r.data || '');
        return t.length > 100 ? t : '';
    } catch {
        return '';
    }
}

function decodeDevalue(data) {
    if (!Array.isArray(data)) return data;
    const memo = new Map();
    const active = new Set();
    const read = (value) => {
        if (Array.isArray(value)) return value.map(read);
        if (value && typeof value === 'object') {
            const o = {};
            for (const [k, v] of Object.entries(value)) o[k] = read(v);
            return o;
        }
        if (Number.isInteger(value)) return resolve(value);
        return value;
    };
    const resolve = (index) => {
        if (typeof index !== 'number' || !Number.isInteger(index)) return index;
        if (index < 0) return index;
        if (memo.has(index)) return memo.get(index);
        if (index >= data.length) return index;
        if (active.has(index)) return null;
        active.add(index);
        const value = data[index];
        let result;
        if (Array.isArray(value)) {
            if (value.length === 2 && typeof value[0] === 'string' && SPECIAL.has(value[0]) && Number.isInteger(value[1])) {
                result = resolve(value[1]);
            } else if (value.length >= 3 && value[0] === 'Set') {
                result = value.slice(1).map(read);
            } else if (value.length >= 3 && value[0] === 'Map') {
                result = {};
                for (let i = 1; i < value.length - 1; i += 2) result[String(read(value[i]))] = read(value[i + 1]);
            } else {
                result = value.map(read);
            }
        } else if (value && typeof value === 'object') {
            result = {};
            for (const [k, v] of Object.entries(value)) result[k] = read(v);
        } else {
            result = value;
        }
        active.delete(index);
        memo.set(index, result);
        return result;
    };
    return resolve(0);
}

function nuxtData(html) {
    if (!html) return {};
    const m = html.match(/<script[^>]+id=["']__NUXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!m) return {};
    try {
        return decodeDevalue(JSON.parse(unescapeHtml(m[1])));
    } catch {
        return {};
    }
}

function* nuxtObjects(root) {
    const seen = new Set();
    function* walk(value) {
        if (value && typeof value === 'object') {
            const marker = value;
            if (seen.has(marker)) return;
            seen.add(marker);
        }
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            yield value;
            for (const child of Object.values(value)) yield* walk(child);
        } else if (Array.isArray(value)) {
            for (const child of value) yield* walk(child);
        }
    }
    yield* walk(root);
}

function isVideoObject(value) {
    if (!value || typeof value !== 'object') return false;
    const title = value.title || value.video_title || value.drama_name;
    const cover = value.cover || value.cover_img;
    return Boolean(value.video_id && title && cover);
}

function pageMeta(html) {
    const root = nuxtData(html);
    for (const value of nuxtObjects(root)) {
        const items = value.list;
        if (!Array.isArray(items) || !items.some(isVideoObject)) continue;
        const result = {};
        for (const key of ['total', 'page', 'limit']) {
            const n = parseInt(value[key], 10);
            if (!Number.isNaN(n)) result[key] = n;
        }
        return result;
    }
    return {};
}

function parseNuxtVideos(html) {
    const items = [];
    const seen = new Set();
    for (const value of nuxtObjects(nuxtData(html))) {
        if (!isVideoObject(value)) continue;
        const vid = String(value.video_id ?? value.id ?? '');
        if (!vid || seen.has(vid)) continue;
        seen.add(vid);
        const title = String(value.title || value.video_title || value.drama_name || '').trim();
        const cover = slash(String(value.cover || value.cover_img || ''));
        let remark = String(value.play_count_text || value.remark || value.remark_text || '').trim();
        if (!remark && value.play_count != null && value.play_count !== '') {
            const n = parseInt(value.play_count, 10);
            if (!Number.isNaN(n)) remark = `${n}播放`;
        }
        items.push({ vod_id: vid, vod_name: title, vod_pic: imageUrl(cover), vod_remarks: remark });
    }
    return items;
}

function parseCards(html) {
    const items = [];
    if (!html) return items;
    const markers = [];
    const mr = /data-xpch="(?:drama-card|card)"|class="[^"]*van-swipe-item[^"]*"/gi;
    let mm;
    while ((mm = mr.exec(html))) markers.push(mm.index);
    const seen = new Set();
    const lr = /href=["']\/play\/(\d+)\/(\d+)\/["']/gi;
    let link;
    while ((link = lr.exec(html))) {
        const vid = link[1];
        if (seen.has(vid)) continue;
        const lefts = markers.filter((p) => p <= link.index);
        const rights = markers.filter((p) => p > link.index);
        const left = lefts.length ? lefts[lefts.length - 1] : Math.max(0, link.index - 1800);
        const right = rights.length ? rights[0] : Math.min(html.length, link.index + link[0].length + 1800);
        const block = html.slice(left, right);
        const titleMatch = block.match(/<img[^>]+alt=["']([^"']*)["']/i);
        const labelMatch = block.match(/<a[^>]+aria-label=["']([^"']*)["']/i);
        const title = unescapeHtml((titleMatch || labelMatch)?.[1] || '').trim();
        if (!title || title === '广告') continue;
        const picMatch = block.match(/(?:data-src|src|poster)=["']([^"']+)["']/i);
        const pic = picMatch ? imageUrl(unescapeHtml(picMatch[1])) : '';
        const remarkMatch = block.match(/(\d+(?:\.\d+)?[Ww万]?播放|全\d+集|共\d+集|\d+集)/);
        seen.add(vid);
        items.push({
            vod_id: vid,
            vod_name: title,
            vod_pic: pic,
            vod_remarks: remarkMatch ? remarkMatch[1] : '',
        });
    }
    return items;
}

function mergeList(html) {
    const b = parseNuxtVideos(html);
    return b.length ? b : parseCards(html);
}

function parseNuxtDetail(html, vid) {
    for (const value of nuxtObjects(nuxtData(html))) {
        if (!value || typeof value !== 'object') continue;
        if (String(value.playlet_id || '') !== String(vid) || !Array.isArray(value.episodeAll)) continue;
        const episodes = [];
        (value.episodeAll || []).forEach((ep, pos) => {
            if (!ep || typeof ep !== 'object') return;
            let index = ep.index;
            if (index == null || String(index).trim() === '' || String(index) === '0' || String(index) === 'None') index = ep.sort;
            if (index == null || String(index).trim() === '' || String(index) === '0' || String(index) === 'None') index = pos + 1;
            const title = String(ep.episode_title || ep.title || '').trim();
            episodes.push({
                index: String(index),
                name: title || `第${index}集`,
                url: slash(String(ep.video_url || '')),
            });
        });
        return {
            vod_name: String(value.drama_name || value.video_title || '').trim(),
            vod_content: String(value.description || '').trim(),
            vod_pic: imageUrl(slash(String(value.cover_img || ''))),
            remarks: String(value.update_status || '').trim(),
            episodes,
        };
    }
    return null;
}

function parseDetailMeta(html, vid) {
    const info = { vod_name: '', vod_content: '', vod_pic: '', episodes: 1 };
    if (!html) return info;
    const scripts = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    for (const m of scripts) {
        try {
            const data = JSON.parse(m[1]);
            if (data && data['@type'] === 'VideoObject') {
                let name = String(data.name || '').replace(/第\d+集\s*$/, '').trim();
                if (name) info.vod_name = name;
                if (data.description) info.vod_content = data.description;
                const thumb = data.thumbnailUrl || '';
                if (thumb && !String(thumb).includes('social-default')) info.vod_pic = imageUrl(thumb);
                const n = parseInt(data.numEpisodes, 10);
                if (!Number.isNaN(n)) info.episodes = n;
            }
        } catch { /* next */ }
    }
    if (!info.vod_name) {
        const tm = html.match(/<title>([^<]+)<\/title>/i);
        if (tm) info.vod_name = tm[1].split('-')[0].trim().replace(/第\d+集\s*$/, '').trim();
    }
    if (!info.vod_pic) {
        const pm = html.match(/(https:\/\/pic\.[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)/i);
        if (pm) info.vod_pic = imageUrl(pm[1]);
    }
    if (!info.vod_name) info.vod_name = `短剧${vid}`;
    if (info.episodes < 1) info.episodes = 1;
    return info;
}

function extractM3u8(html) {
    if (!html) return '';
    const ms = html.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/gi) || [];
    for (const u of ms) {
        if (u.includes('auth_key=') || u.includes('hls.')) {
            return slash(unescapeHtml(u));
        }
    }
    return ms.length ? slash(unescapeHtml(ms[0])) : '';
}

async function probeMedia(url) {
    if (!/^https?:\/\//i.test(url || '')) return false;
    try {
        const r = await req.get(url, {
            headers: playHdr(),
            timeout: 15000,
            responseType: 'arraybuffer',
            validateStatus: () => true,
            maxContentLength: 65536,
        });
        if (r.status !== 200) return false;
        const buf = Buffer.from(r.data || []);
        const body = buf.toString('utf8').replace(/^[\ufeff\r\n\t ]+/, '');
        return body.startsWith('#EXTM3U') || (isVideoFmt(url) && buf.length > 0);
    } catch {
        return false;
    }
}

function parseExt(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    const s = String(raw).trim();
    if (s.startsWith('http')) return { host: s };
    if (s.startsWith('{')) {
        try { return JSON.parse(s); } catch { return {}; }
    }
    return {};
}

async function init(inReq) {
    const ext = parseExt(inReq?.body?.ext || inReq?.body?.extend);
    if (ext.host) host = String(ext.host).replace(/\/+$/, '');
    else host = DEFAULT_HOST;
    return {};
}

async function home() {
    const html = await get('/');
    return { class: CLASSES, filters: {}, list: mergeList(html).slice(0, 30) };
}

async function category(inReq) {
    let page = parseInt(inReq.body.page || inReq.body.pg, 10) || 1;
    if (page < 1) page = 1;
    const tid = String(inReq.body.id || inReq.body.tid || 'home');
    let path;
    if (tid === 'home') {
        if (page !== 1) return { list: [], page, pagecount: 0, limit: 30, total: 0 };
        path = '/';
    } else if (tid === 'rank') {
        path = page === 1 ? '/rank/' : `/rank/page/${page}/`;
    } else if (tid === 'new') {
        path = page === 1 ? '/new-theater-category/0-0-0-0-0-1/' : `/new-theater-category/0-0-0-0-0-1/page/${page}/`;
    } else if (tid === 'theater') {
        path = page === 1 ? '/new-theater-category/' : `/new-theater-category/page/${page}/`;
    } else {
        const filterId = encodeURIComponent(tid);
        path = page > 1 ? `/new-theater-category/${filterId}/page/${page}/` : `/new-theater-category/${filterId}/`;
    }
    const html = await get(path);
    let videos = mergeList(html);
    if (tid === 'home') {
        videos = videos.slice(0, 30);
        return { list: videos, page: 1, pagecount: videos.length ? 1 : 0, limit: 30, total: videos.length };
    }
    const meta = pageMeta(html);
    const total = parseInt(meta.total, 10) || 0;
    const limit = parseInt(meta.limit, 10) || videos.length || 20;
    const pagecount = total ? Math.ceil(total / limit) : (videos.length ? page + 1 : page);
    return {
        list: videos,
        page,
        pagecount: Math.max(pagecount, page),
        limit,
        total: total || pagecount * limit,
    };
}

async function search(inReq) {
    let page = parseInt(inReq.body.page || inReq.body.pg, 10) || 1;
    if (page < 1) page = 1;
    const kw = encodeURIComponent(String(inReq.body.wd || '').trim());
    if (!kw) return { list: [] };
    const path = page === 1 ? `/search/${kw}/` : `/search/${kw}/page/${page}/`;
    const html = await get(path);
    const videos = mergeList(html);
    const meta = pageMeta(html);
    const total = parseInt(meta.total, 10) || videos.length;
    const limit = videos.length || 30;
    const pagecount = total ? Math.ceil(total / limit) : (videos.length ? 1 : 0);
    return { list: videos, page, pagecount: Math.max(pagecount, page), limit, total };
}

async function detail(inReq) {
    let raw = inReq.body.id;
    if (Array.isArray(raw)) raw = raw[0];
    raw = String(raw || '').trim();
    const m = raw.match(/(?:\/play\/)?(\d+)(?:\/(\d+))?/);
    const vid = m ? m[1] : raw;
    const html = await get(`/play/${vid}/1/`);
    if (!html) return { list: [] };
    const nuxt = parseNuxtDetail(html, vid);
    const meta = parseDetailMeta(html, vid);
    let episodes = [];
    if (nuxt) {
        if (nuxt.vod_name) meta.vod_name = nuxt.vod_name;
        if (nuxt.vod_content) meta.vod_content = nuxt.vod_content;
        if (nuxt.vod_pic) meta.vod_pic = nuxt.vod_pic;
        episodes = nuxt.episodes || [];
    } else {
        let epCount = meta.episodes;
        if (epCount <= 1) {
            const nums = [...html.matchAll(new RegExp(`/play/${vid}/(\\d+)/`, 'g'))].map((x) => parseInt(x[1], 10));
            if (nums.length) epCount = Math.max(Math.max(...nums), epCount);
        }
        if (epCount < 1) epCount = 1;
        episodes = Array.from({ length: epCount }, (_, i) => ({ index: String(i + 1), name: `第${i + 1}集` }));
    }
    const playItems = [];
    for (const ep of episodes) {
        const name = String(ep.name || ep.episode_title || '').trim();
        let episodeNo = ep.index || ep.episode_no;
        if (episodeNo == null || String(episodeNo).trim() === '' || String(episodeNo) === '0' || String(episodeNo) === 'None') {
            episodeNo = ep.sort;
        }
        if (episodeNo == null || String(episodeNo).trim() === '' || String(episodeNo) === '0' || String(episodeNo) === 'None') {
            episodeNo = ep.id || ep.episode_id;
        }
        if (!episodeNo) continue;
        episodeNo = String(episodeNo).trim();
        playItems.push(`${name || `第${episodeNo}集`}$${vid}/${episodeNo}`);
    }
    if (!playItems.length) return { list: [] };
    return {
        list: [{
            vod_id: vid,
            vod_name: meta.vod_name,
            vod_pic: meta.vod_pic,
            vod_content: meta.vod_content || meta.vod_name,
            vod_play_from: '51短剧',
            vod_play_url: playItems.join('#'),
            vod_remarks: nuxt?.remarks || `全${playItems.length}集`,
        }],
    };
}

async function play(inReq) {
    let val = String(inReq.body.id || '').trim();
    if (val.includes('$')) val = val.split('$').pop().trim();
    const header = playHdr();
    if (isVideoFmt(val) && /^https?:\/\//i.test(val)) {
        if (await probeMedia(val)) return { parse: 0, url: val, header };
        return { parse: 1, url: val, header };
    }
    let vid = '', ep = '1';
    const m = val.match(/(?:\/play\/)?(\d+)\/(\d+)/);
    if (m) {
        vid = m[1];
        ep = m[2];
    } else {
        const m2 = val.match(/(\d+)/);
        if (m2) vid = m2[1];
    }
    if (!vid) return { parse: 0, url: '', header };
    const page = `/play/${vid}/${ep}/`;
    const html = await get(page);
    const m3u8 = extractM3u8(html);
    if (m3u8 && await probeMedia(m3u8)) return { parse: 0, url: m3u8, header };
    return { parse: 1, url: fullUrl(page), header };
}

export default {
    meta: {
        key: 'blue51',
        name: '📖51短剧·蓝',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
