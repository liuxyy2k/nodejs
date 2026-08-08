import axios from 'axios';
import https from 'https';

/**
 * 权色视频 - MacCMS v10 · https://www.xiaoqiche.shop
 */

const DEFAULT_HOST = 'https://www.xiaoqiche.shop';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CLASSES = [
    { type_name: '国产视频', type_id: '1' },
    { type_name: '中文字幕', type_id: '2' },
    { type_name: '国产传媒', type_id: '3' },
    { type_name: '强奸乱伦', type_id: '4' },
    { type_name: '日本无码', type_id: '6' },
    { type_name: '欧美无码', type_id: '7' },
    { type_name: '制服诱惑', type_id: '8' },
    { type_name: '国产主播', type_id: '9' },
    { type_name: '换脸明星', type_id: '10' },
    { type_name: '女优明星', type_id: '11' },
    { type_name: '抖阴视频', type_id: '12' },
    { type_name: '伦理三级', type_id: '13' },
    { type_name: '黑料流出', type_id: '14' },
    { type_name: '萝莉少女', type_id: '15' },
    { type_name: '韩国主播', type_id: '16' },
];

const EMPTY_GIF = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64',
);

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

let host = DEFAULT_HOST;

const http = axios.create({
    timeout: 15_000,
    httpsAgent,
    validateStatus: () => true,
});

function getHeaders(referer) {
    return {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Referer: referer || `${host}/`,
    };
}

function fixUrl(url, base = host) {
    if (!url) return '';
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) {
        try {
            return new URL(url, base.endsWith('/') ? base : `${base}/`).href;
        } catch {
            return base.replace(/\/$/, '') + url;
        }
    }
    if (url.startsWith('http')) return url;
    try {
        return new URL(url, base.endsWith('/') ? base : `${base}/`).href;
    } catch {
        return `${base}/${url}`;
    }
}

function cleanText(text) {
    if (!text) return '';
    return String(text)
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
}

function isVideoFormat(url) {
    if (!url) return false;
    return ['.m3u8', '.mp4', '.flv', '.ts', '.mkv', '.avi', '.wmv', '.mov'].some((x) =>
        url.includes(x),
    );
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url, referer, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            if (attempt > 0) await sleep(500 + Math.random() * 1000);
            const resp = await http.get(url, {
                headers: getHeaders(referer),
                responseType: 'text',
            });
            const text = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
            if (resp.status === 200) {
                if (text.includes('Just a moment') || text.includes('cf-browser-verification')) {
                    continue;
                }
                return text;
            }
            if ([403, 429, 503].includes(resp.status)) continue;
        } catch {
            /* retry */
        }
    }
    return '';
}

function extractId(href) {
    const m = href.match(/\/id\/(\d+)/);
    return m ? m[1] : '';
}

function parseList(htmlText) {
    if (!htmlText) return [];
    const videos = [];
    const seen = new Set();

    const cards = [...htmlText.matchAll(/<li[^>]*class="[^"]*(?:col-md-2|col-sm-3|col-xs-4)[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)];

    for (const cardMatch of cards) {
        try {
            const card = cardMatch[1];
            const hrefMatch = card.match(/<a[^>]*class="[^"]*video-pic[^"]*"[^>]*href="([^"]*)"/i);
            if (!hrefMatch) continue;

            const href = hrefMatch[1];
            const vid = extractId(href);
            if (!vid || seen.has(vid)) continue;
            seen.add(vid);

            let title = '';
            let tMatch = card.match(/<a[^>]*class="[^"]*video-pic[^"]*"[^>]*title="([^"]*)"/i);
            if (tMatch) title = tMatch[1];
            if (!title) {
                tMatch = card.match(/<div[^>]*class="[^"]*title[^"]*"[^>]*>[\s\S]*?<a[^>]*title="([^"]*)"/i);
                if (tMatch) title = tMatch[1];
            }
            if (!title) {
                tMatch = card.match(/<div[^>]*class="[^"]*title[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
                if (tMatch) title = cleanText(tMatch[1]);
            }

            let pic = '';
            const pMatch = card.match(/background:\s*url\(([^)]+)\)/i);
            if (pMatch) {
                pic = pMatch[1].trim().replace(/^["']|["']$/g, '');
                pic = fixUrl(pic);
            }

            let remark = '';
            const tds = [...card.matchAll(/<td[^>]*>[\s\S]*?<div[^>]*align="(?:left|right)"[^>]*>([\s\S]*?)<\/div>[\s\S]*?<\/td>/gi)];
            if (tds.length) {
                remark = tds
                    .map((m) => cleanText(m[1]))
                    .filter(Boolean)
                    .join(' ');
            }

            videos.push({
                vod_id: vid,
                vod_name: cleanText(title),
                vod_pic: pic,
                vod_remarks: remark,
            });
        } catch {
            /* ignore card */
        }
    }

    return videos;
}

function b64decode(s) {
    try {
        let str = String(s || '');
        const pad = (4 - (str.length % 4)) % 4;
        if (pad) str += '='.repeat(pad);
        return Buffer.from(str, 'base64').toString('utf8');
    } catch {
        return '';
    }
}

function findUrlInObject(obj) {
    if (typeof obj === 'string') {
        if (obj.startsWith('http') && isVideoFormat(obj)) return obj;
        try {
            const decoded = decodeURIComponent(obj);
            if (decoded.startsWith('http') && isVideoFormat(decoded)) return decoded;
        } catch {
            /* ignore */
        }
        return null;
    }
    if (Array.isArray(obj)) {
        for (const item of obj) {
            const res = findUrlInObject(item);
            if (res) return res;
        }
        return null;
    }
    if (obj && typeof obj === 'object') {
        for (const k of ['url', 'src', 'file', 'video', 'm3u8', 'mp4', 'link', 'play_url']) {
            if (k in obj) {
                const res = findUrlInObject(obj[k]);
                if (res) return res;
            }
        }
        for (const k of Object.keys(obj)) {
            const res = findUrlInObject(obj[k]);
            if (res) return res;
        }
    }
    return null;
}

async function extractVideoUrls(htmlText, pageUrl, depth = 0) {
    const playUrls = [];
    const seenUrls = new Set();

    const addUrl = (label, url) => {
        if (!url || seenUrls.has(url)) return;
        seenUrls.add(url);
        playUrls.push([label, url]);
    };

    const scripts = [...htmlText.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
    for (const sm of scripts) {
        const script = sm[1];
        for (const varName of ['player_data', 'player_aaaa', 'playerConfig', 'player', 'videoInfo', 'vodData']) {
            const pattern = new RegExp(`var\\s+${varName}\\s*=\\s*(\\{[\\s\\S]*?\\});`);
            const m = script.match(pattern);
            if (!m) continue;
            try {
                const pdata = JSON.parse(m[1]);
                const found = findUrlInObject(pdata);
                if (found) addUrl('主线路', found);
            } catch {
                /* ignore bad json */
            }
        }
    }

    for (const v of ['now', 'playurl', 'play_url', 'video_url', 'vod_url', 'url', 'src', 'file']) {
        const m = htmlText.match(new RegExp(`var\\s+${v}\\s*=\\s*["']([^"']+)["']`));
        if (m) {
            const u = m[1].trim();
            if (u.startsWith('http')) addUrl('直连', decodeURIComponent(u));
        }
    }

    for (const pattern of [/videoSources\s*:\s*(\[[\s\S]*?\])/, /sources\s*:\s*(\[[\s\S]*?\])/, /playlist\s*:\s*(\[[\s\S]*?\])/]) {
        const m = htmlText.match(pattern);
        if (!m) continue;
        try {
            const vs = JSON.parse(m[1]);
            for (const item of vs) {
                if (item && typeof item === 'object') {
                    const u = item.file || item.src || item.url || '';
                    if (u.startsWith('http')) addUrl('多码率', decodeURIComponent(u));
                } else if (typeof item === 'string' && item.startsWith('http')) {
                    addUrl('多码率', decodeURIComponent(item));
                }
            }
        } catch {
            /* ignore */
        }
    }

    for (const playerPat of [
        /wvPlayer\.play\s*\(\s*["']([^"']+)["']/,
        /new\s+DPlayer\s*\([\s\S]*?\s+url\s*:\s*["']([^"']+)["']/,
        /video\s*\{[\s\S]*?src\s*:\s*["']([^"']+)["']/,
    ]) {
        const m = htmlText.match(playerPat);
        if (m && m[1].startsWith('http')) addUrl('播放器', decodeURIComponent(m[1]));
    }

    const locMatch = htmlText.match(/location\.href\s*=\s*["']([^"']+)["']/);
    if (locMatch) {
        const u = locMatch[1];
        if (u.startsWith('http') && isVideoFormat(u)) addUrl('跳转', decodeURIComponent(u));
    }

    for (const m of htmlText.matchAll(/<video[^>]+src=["']([^"']+)["']/gi)) {
        if (m[1].startsWith('http')) addUrl('VIDEO标签', decodeURIComponent(m[1]));
    }

    for (const m of htmlText.matchAll(/<source[^>]+src=["']([^"']+)["'][^>]*type=["']([^"']+)["']/gi)) {
        const u = m[1];
        const t = m[2];
        if (u.startsWith('http')) {
            let label = '媒体';
            if (t.includes('mp4')) label = 'MP4';
            else if (t.includes('mpegURL') || t.includes('m3u8')) label = 'M3U8';
            addUrl(`${label}源`, decodeURIComponent(u));
        }
    }

    const directLinks = htmlText.match(
        /https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4|flv|ts|mkv|avi)(?:\?[^\s"'<>]*)?/gi,
    );
    if (directLinks) {
        for (const link of new Set(directLinks)) {
            addUrl('页面提取', decodeURIComponent(link));
        }
    }

    if (!playUrls.length && depth < 2) {
        const iframeSrcs = [
            ...htmlText.matchAll(/<iframe[^>]+(?:src|data-src)=["']([^"']+)["']/gi),
        ].map((m) => m[1]);
        for (const src of new Set(iframeSrcs)) {
            if (!['play', 'm3u8', 'embed', 'player', 'video', 'vod'].some((k) => src.includes(k))) {
                continue;
            }
            const full = src.startsWith('http') ? src : fixUrl(src);
            const iframeHtml = await fetchText(full, pageUrl);
            if (iframeHtml) {
                const innerUrls = await extractVideoUrls(iframeHtml, full, depth + 1);
                for (const [label, url] of innerUrls) {
                    addUrl(`嵌套-${label}`, url);
                }
            }
            if (!playUrls.some(([, u]) => u === full)) {
                addUrl('嵌套页', full);
            }
        }
    }

    if (!playUrls.length) {
        for (const m of htmlText.matchAll(/["']([A-Za-z0-9+/]{40,}={0,2})["']/g)) {
            try {
                const decoded = b64decode(m[1]);
                if (decoded.startsWith('http') && isVideoFormat(decoded)) {
                    addUrl('Base64', decoded);
                }
            } catch {
                /* ignore */
            }
        }
    }

    if (!playUrls.length) {
        const evalMatch = htmlText.match(/eval\(([\s\S]*?)\)/);
        if (evalMatch) {
            addUrl('eval加密', `eval://${pageUrl}`);
        }
    }

    return playUrls;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(inReq, _outResp) {
    const extend = inReq.body?.extend ?? inReq.body?.ext ?? '';
    if (extend && String(extend).startsWith('http')) {
        host = String(extend).replace(/\/$/, '');
    } else {
        host = DEFAULT_HOST;
    }
    return {};
}

async function home(_inReq, _outResp) {
    const cat = await category({ body: { id: '1', page: 1, pg: 1 } }, null);
    return { class: CLASSES, filters: {}, list: cat.list || [] };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '1');
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;

    const url =
        page > 1
            ? `${host}/index.php/vod/type/id/${tid}/page/${page}.html`
            : `${host}/index.php/vod/type/id/${tid}.html`;

    const htmlText = await fetchText(url);
    if (!htmlText) {
        return { list: [], page, pagecount: 1, limit: 24, total: 0 };
    }

    const videos = parseList(htmlText);
    let totalPages = page + 1;
    const pageNums = [...htmlText.matchAll(/\/page\/(\d+)\.html/g)].map((m) => parseInt(m[1], 10));
    if (pageNums.length) totalPages = Math.max(...pageNums);

    return {
        list: videos,
        page,
        pagecount: totalPages,
        limit: videos.length,
        total: 999999,
    };
}

async function detail(inReq, _outResp) {
    const vid = String(inReq.body.id || '');
    if (!vid) return { list: [] };

    let url = `${host}/index.php/vod/detail/id/${vid}.html`;
    let htmlText = await fetchText(url);

    if (!htmlText || !htmlText.toLowerCase().includes('player')) {
        const playUrl = `${host}/index.php/vod/play/id/${vid}/sid/1/nid/1.html`;
        const playHtml = await fetchText(playUrl, url);
        if (playHtml) {
            htmlText = playHtml;
            url = playUrl;
        }
    }

    if (!htmlText) return { list: [] };

    let title = '';
    let m = htmlText.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (m) title = cleanText(m[1]);
    if (!title) {
        m = htmlText.match(/<title>([\s\S]*?)<\/title>/i);
        if (m) title = cleanText(m[1]).split('-')[0].split('_')[0];
    }

    let cover = '';
    for (const pat of [
        /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i,
        /<img[^>]+data-original="([^"]+)"/i,
        /<img[^>]+src="([^"]+)"[^>]*class="[^"]*(?:pic|cover|poster|thumb)[^"]*"/i,
        /background:\s*url\(([^)]+)\)/i,
    ]) {
        m = htmlText.match(pat);
        if (m) {
            cover = fixUrl(m[1].replace(/^["']|["']$/g, ''));
            break;
        }
    }

    let content = '';
    m = htmlText.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i);
    if (m) content = m[1];

    const playUrls = await extractVideoUrls(htmlText, url);

    let vodPlayFrom;
    let vodPlayUrl;

    if (playUrls.length) {
        const sources = [];
        const urls = [];
        for (const [label, purl] of playUrls) {
            sources.push(label);
            urls.push(`${label}$${purl}`);
        }
        vodPlayFrom = sources.join('$$$');
        vodPlayUrl = urls.join('$$$');
    } else {
        vodPlayFrom = '默认线路';
        const playPage = `${host}/index.php/vod/play/id/${vid}/sid/1/nid/1.html`;
        vodPlayUrl = `正片$${playPage}`;
    }

    return {
        list: [
            {
                vod_id: vid,
                vod_name: title || vid,
                vod_pic: cover,
                vod_content: content,
                vod_play_from: vodPlayFrom,
                vod_play_url: vodPlayUrl,
            },
        ],
    };
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    if (!id) return { parse: 0, url: '', header: getHeaders() };

    if (isVideoFormat(id)) {
        return { parse: 0, url: id, header: getHeaders() };
    }

    if (id.startsWith('magnet:')) {
        return { parse: 1, url: id, header: getHeaders() };
    }

    if (id.startsWith('eval://')) {
        const realUrl = id.slice(7);
        return { parse: 1, url: realUrl, header: getHeaders(realUrl) };
    }

    if (id.includes('play') || id.includes('player') || id.includes('embed')) {
        const htmlText = await fetchText(id, `${host}/`);
        if (htmlText) {
            const inner = await extractVideoUrls(htmlText, id);
            for (const [, url] of inner) {
                if (isVideoFormat(url)) {
                    return { parse: 0, url, header: getHeaders(id) };
                }
            }
        }
        return { parse: 1, url: id, header: getHeaders(id) };
    }

    return { parse: 0, url: id, header: getHeaders() };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const page = parseInt(inReq.body.pg || inReq.body.page || 1, 10) || 1;

    let url = `${host}/index.php/vod/search/wd/${encodeURIComponent(key)}/page/${page}.html`;
    let htmlText = await fetchText(url);
    if (!htmlText) {
        url = `${host}/index.php/vod/search.html?wd=${encodeURIComponent(key)}&page=${page}`;
        htmlText = await fetchText(url);
    }

    const videos = htmlText ? parseList(htmlText) : [];

    return {
        list: videos,
        page,
        pagecount: page + 1,
        limit: videos.length,
        total: 999999,
    };
}

async function proxyHandler(inReq, outResp) {
    const raw = inReq.query.url || inReq.query.param || '';
    const url = decodeURIComponent(raw || '');
    if (!url || !url.startsWith('http')) {
        return outResp.type('image/gif').send(EMPTY_GIF);
    }

    try {
        const resp = await http.get(url, {
            headers: { 'User-Agent': UA },
            responseType: 'arraybuffer',
        });
        if (resp.status === 200 && resp.data?.byteLength) {
            const ct = resp.headers['content-type'] || 'application/octet-stream';
            return outResp.type(ct).send(Buffer.from(resp.data));
        }
    } catch {
        /* ignore */
    }
    return outResp.type('image/gif').send(EMPTY_GIF);
}

export default {
    meta: {
        key: 'quanse',
        name: '🔥权色视频',
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
