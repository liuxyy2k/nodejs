import req from '../../util/req.js';

/**
 * NO视频 https://www.novipnoad.net
 * 分类路径型；播放 player.novipnoad.net + RC4(默认 key 52b7ac39)
 */

const DEFAULT_HOST = 'https://www.novipnoad.net';
const DEFAULT_PLAYER = 'https://player.novipnoad.net';
const DEFAULT_DECRYPT_KEY = '52b7ac39';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1';

const CLASSES = [
    { type_id: 'movie', type_name: '电影' },
    { type_id: 'anime', type_name: '动画' },
    { type_id: 'shows', type_name: '综艺' },
    { type_id: 'tv-western', type_name: '欧美剧' },
    { type_id: 'tv-japan', type_name: '日剧' },
    { type_id: 'tv-korea', type_name: '韩剧' },
    { type_id: 'tv-taiwan', type_name: '台剧' },
    { type_id: 'tv-thailand', type_name: '泰剧' },
    { type_id: 'tv-hongkong', type_name: '港剧' },
    { type_id: 'tv-turkey', type_name: '土耳其剧' },
];

const TID_PATH = {
    movie: 'movie/',
    anime: 'anime/',
    shows: 'shows/',
    'tv-western': 'tv/western/',
    'tv-japan': 'tv/japan/',
    'tv-korea': 'tv/korea/',
    'tv-taiwan': 'tv/taiwan/',
    'tv-thailand': 'tv/thailand/',
    'tv-hongkong': 'tv/hongkong/',
    'tv-turkey': 'tv/turkey/',
};

let host = DEFAULT_HOST;
let player = DEFAULT_PLAYER;
let decryptKey = DEFAULT_DECRYPT_KEY;

function baseHeaders(extra = {}) {
    return {
        'User-Agent': UA,
        Referer: `${host}/`,
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        ...extra,
    };
}

function applyConfig(extend) {
    if (!extend) return;
    if (typeof extend === 'object' && extend !== null) {
        if (extend.host) host = String(extend.host).replace(/\/$/, '');
        if (extend.player) player = String(extend.player).replace(/\/$/, '');
        if (extend.decryptKey) decryptKey = String(extend.decryptKey);
        return;
    }
    const raw = String(extend).trim();
    if (!raw) return;
    if (raw.startsWith('{')) {
        try {
            applyConfig(JSON.parse(raw));
        } catch { /* ignore */ }
        return;
    }
    if (raw.startsWith('http')) host = raw.replace(/\/$/, '');
}

function absUrl(u) {
    if (!u) return '';
    u = String(u).trim();
    if (u.startsWith('http')) return u;
    if (u.startsWith('//')) return `https:${u}`;
    if (u.startsWith('/')) return `${host}${u}`;
    return `${host}/${u}`;
}

async function fetchHtml(url, extraHeaders = {}) {
    try {
        const resp = await req.get(url, { headers: baseHeaders(extraHeaders) });
        return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch {
        return '';
    }
}

function stripTags(s) {
    return String(s || '').replace(/<[^>]+>/g, '').trim();
}

function parseList(html) {
    const items = [];
    const seen = new Set();
    if (!html) return items;

    const parts = html.split(/class="[^"]*video-item[^"]*"/i);
    for (let i = 1; i < parts.length; i++) {
        const block = parts[i].slice(0, 1200);
        const m = block.match(/href="(https?:\/\/[^"]+\.html)"/i)
            || block.match(/href="(\/[^"]+\.html)"/i);
        if (!m) continue;

        const link = absUrl(m[1]);
        const idm = link.match(/\/(\d+)\.html/);
        if (!idm || seen.has(link)) continue;
        seen.add(link);

        let name = '';
        const nm = block.match(/title="([^"]+)"/);
        if (nm) name = nm[1].replace(/^【.*?】/, '').trim();
        if (!name) {
            const nm2 = block.match(/<h3[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
            if (nm2) name = stripTags(nm2[1]).replace(/^【.*?】/, '').trim();
        }
        if (!name) name = `影片${idm[1]}`;

        let pic = '';
        const pm = block.match(/data-original="([^"]+)"/)
            || block.match(/src="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
        if (pm) pic = absUrl(pm[1]);

        let remarks = '';
        const rm = block.match(/class="remarks"[^>]*>([\s\S]*?)</i);
        if (rm) remarks = stripTags(rm[1]);

        items.push({
            vod_id: link,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: remarks,
        });
    }
    return items;
}

function extractPlayInfo(html) {
    let vid = '';
    let pkey = '';
    const m = html.match(/window\.playInfo\s*=\s*(\{[^<]*?\})\s*;/)
        || html.match(/playInfo\s*=\s*(\{[^<]*?\})\s*;/);
    if (m) {
        try {
            const fixed = m[1].replace(/([{,])\s*(\w+)\s*:/g, '$1"$2":');
            const info = JSON.parse(fixed);
            vid = info.vid || '';
            pkey = info.pkey || '';
        } catch { /* ignore */ }
    }
    if (!pkey) {
        const pm = html.match(/pkey\s*:\s*["']([^"']+)["']/);
        if (pm) pkey = pm[1];
    }
    if (!vid) {
        const vm = html.match(/vid\s*:\s*["']([^"']+)["']/);
        if (vm) vid = vm[1];
    }
    return { vid, pkey };
}

function rc4(data, key) {
    const s = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    for (let i = 0; i < 256; i++) {
        j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
        [s[i], s[j]] = [s[j], s[i]];
    }
    let i = 0;
    j = 0;
    const out = [];
    for (let k = 0; k < data.length; k++) {
        i = (i + 1) % 256;
        j = (j + s[i]) % 256;
        [s[i], s[j]] = [s[j], s[i]];
        out.push(String.fromCharCode(data.charCodeAt(k) ^ s[(s[i] + s[j]) % 256]));
    }
    return out.join('');
}

function tryDecrypt(cipherB64, keys) {
    let data;
    try {
        const raw = Buffer.from(String(cipherB64).replace(/[^A-Za-z0-9+/=]/g, ''), 'base64');
        data = raw.toString('latin1');
    } catch {
        return '';
    }
    for (const key of keys) {
        if (!key) continue;
        try {
            const plain = rc4(data, key);
            if (plain && plain[0] === '{') {
                const obj = JSON.parse(plain);
                const qs = obj.quality || [];
                if (qs.length) {
                    let idx = obj.defaultQuality || 0;
                    if (typeof idx !== 'number' || idx >= qs.length) idx = 0;
                    const u = (qs[idx] || {}).url || '';
                    if (u) return u;
                }
            }
        } catch { /* ignore */ }
    }
    return '';
}

async function resolvePlayer(vid, pkey, ref) {
    if (!vid) return '';
    let playerUrl = `${player}/v1/?url=${encodeURIComponent(vid)}`;
    if (pkey) playerUrl += `&pkey=${encodeURIComponent(pkey)}`;
    if (ref) playerUrl += `&ref=${encodeURIComponent(ref)}`;

    let page = await fetchHtml(playerUrl, { Referer: `${host}/` });
    let m = page.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i);
    if (m) return m[1];

    const dm = page.match(/params\['device'\]\s*=\s*'(\w+)'/)
        || page.match(/device['"]\s*[:=]\s*['"](\w+)['"]/);
    if (!dm) return '';

    const device = dm[1];
    const phpUrl = `${player}/v1/player.php?id=${encodeURIComponent(vid)}&device=${device}`;
    const php = await fetchHtml(phpUrl, { Referer: playerUrl });
    if (!php) return '';

    const jm = php.match(/const\s+jsapi\s*=\s*'(.*?)'/) || php.match(/jsapi\s*=\s*'(.*?)'/);
    if (jm) {
        const js = await fetchHtml(jm[1], { Referer: `${player}/` });
        if (js) {
            const cm = js.match(/var\s+videoUrl\s*=\s*JSON\.decrypt\(\s*['"](.*?)['"]\s*\)\s*;/);
            if (cm) {
                const u = tryDecrypt(cm[1], [decryptKey, DEFAULT_DECRYPT_KEY]);
                if (u) return u;
            }
            m = js.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i);
            if (m) return m[1];
        }
    }

    m = php.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i);
    return m ? m[1] : '';
}

function playerHeaders() {
    return {
        'User-Agent': UA,
        Referer: `${player}/`,
        Origin: player,
    };
}

async function init(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    return {};
}

async function home(_inReq, _outResp) {
    let list = [];
    try {
        list = parseList(await fetchHtml(`${host}/`)).slice(0, 24);
    } catch { /* ignore */ }
    return { class: CLASSES, filters: {}, list };
}

async function category(inReq, _outResp) {
    const page = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);
    let key = String(inReq.body.id || 'movie').trim().replace(/\/$/, '');
    let path = TID_PATH[key] || TID_PATH[key.replace('/', '-')] || `${key.replace(/-/g, '/')}/`;
    let url = `${host}/${path}`;
    if (page > 1) url += `page/${page}/`;

    let html = await fetchHtml(url);
    if (!html || html.includes('Just a moment')) {
        html = await fetchHtml(url, { 'User-Agent': MOBILE_UA }) || html;
    }

    const items = parseList(html);
    return {
        list: items,
        page,
        pagecount: items.length >= 20 ? page + 1 : page,
        limit: 40,
        total: 9999,
    };
}

async function search(inReq, _outResp) {
    const page = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);
    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    const url = `${host}/page/${page}/?s=${encodeURIComponent(key)}`;
    const html = await fetchHtml(url, { 'User-Agent': MOBILE_UA });
    const items = parseList(html);
    return {
        list: items,
        page,
        pagecount: items.length ? page + 1 : page,
    };
}

async function detail(inReq, _outResp) {
    const raw = Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id;
    const pageUrl = String(raw || '').startsWith('http') ? String(raw) : absUrl(raw);
    let html = await fetchHtml(pageUrl);
    if (!html || html.includes('Just a moment')) return { list: [] };

    let name = '';
    const nm = html.match(/property="og:title"\s+content="([^"]+)"/i);
    if (nm) name = nm[1].replace(/^【.*?】/, '').trim();
    if (!name) {
        const nm2 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        if (nm2) name = stripTags(nm2[1]);
    }

    let pic = '';
    const pm = html.match(/property="og:image"\s+content="([^"]+)"/i);
    if (pm) pic = pm[1];

    let content = '';
    const cm = html.match(/class="[^"]*item-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (cm) content = stripTags(cm[1]).slice(0, 300);

    const { vid, pkey } = extractPlayInfo(html);
    const playUrls = [];

    for (const m of html.matchAll(
        /class="[^"]*multilink-btn[^"]*"[^>]*data-vid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:a|button|div|span)>/gi,
    )) {
        const n = stripTags(m[2]) || '线路';
        playUrls.push(`${n}$${m[1]}|${pkey}|${encodeURIComponent(pageUrl)}`);
    }
    if (!playUrls.length && vid) {
        playUrls.push(`正片$${vid}|${pkey}|${encodeURIComponent(pageUrl)}`);
    }
    if (!playUrls.length) {
        playUrls.push(`正片$${pageUrl}`);
    }

    return {
        list: [{
            vod_id: pageUrl,
            vod_name: name,
            vod_pic: pic,
            vod_content: content,
            vod_play_from: 'NO视频',
            vod_play_url: playUrls.join('#'),
        }],
    };
}

async function play(inReq, _outResp) {
    const raw = String(inReq.body.id || '');
    const hdr = playerHeaders();

    if (raw.startsWith('http') && (raw.includes('.m3u8') || raw.includes('.mp4'))) {
        return { parse: 0, jx: 0, url: raw, header: hdr };
    }

    if (raw.includes('|')) {
        const parts = raw.split('|');
        const vid = parts[0];
        const pkey = parts[1] || '';
        let ref = parts[2] || `${host}/`;
        try { ref = decodeURIComponent(ref); } catch { /* ignore */ }

        const u = await resolvePlayer(vid, pkey, ref);
        if (u) return { parse: 0, jx: 0, url: u, header: hdr };

        let playerUrl = `${player}/v1/?url=${encodeURIComponent(vid)}`;
        if (pkey) playerUrl += `&pkey=${encodeURIComponent(pkey)}`;
        playerUrl += `&ref=${encodeURIComponent(ref)}`;
        return { parse: 1, jx: 0, url: playerUrl, header: hdr };
    }

    if (raw.startsWith('http')) {
        try {
            const html = await fetchHtml(raw);
            const { vid, pkey } = extractPlayInfo(html);
            if (vid) {
                const u = await resolvePlayer(vid, pkey, raw);
                if (u) return { parse: 0, jx: 0, url: u, header: hdr };
            }
        } catch { /* ignore */ }
        return { parse: 1, jx: 0, url: raw, header: baseHeaders() };
    }

    return { parse: 1, jx: 0, url: raw, header: baseHeaders() };
}

export default {
    meta: {
        key: 'novipnoad',
        name: '🔥NO视频',
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
