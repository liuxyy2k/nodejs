import axios from 'axios';
import https from 'https';

/**
 * AV星球 - https://xqxq1.cc
 * MacCMS v10 · data-url / const source 直链 m3u8
 */

const DEFAULT_HOST = 'https://xqxq1.cc';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CLASSES = [
    { type_name: '学生萝莉', type_id: '66' },
    { type_name: '日本av', type_id: '44' },
    { type_name: '口交自慰', type_id: '62' },
    { type_name: '群交多P', type_id: '63' },
    { type_name: '强奸迷奸', type_id: '67' },
    { type_name: '丝袜制服', type_id: '68' },
    { type_name: '国产AV', type_id: '46' },
    { type_name: '乱伦系列', type_id: '45' },
    { type_name: '素人特摄', type_id: '65' },
    { type_name: '探花约炮', type_id: '47' },
    { type_name: '日韩精选', type_id: '61' },
    { type_name: 'VR专区', type_id: '64' },
    { type_name: '主播大秀', type_id: '48' },
    { type_name: '反差母狗', type_id: '70' },
    { type_name: '国产传媒', type_id: '50' },
    { type_name: '网曝吃瓜', type_id: '49' },
    { type_name: '异域风情', type_id: '71' },
    { type_name: '中文字幕', type_id: '53' },
    { type_name: '偷拍偷窥', type_id: '51' },
    { type_name: '色情动漫', type_id: '55' },
];

const POSTER_RE =
    /<a class="poster[^"]*" href="(\/index\.php\/vod\/play\/id\/(\d+)\.html)" data-url="([^"]+)">\s*<img[^>]+data-src="([^"]+)"[^>]*alt="([^"]*)"/gs;
const FALLBACK_RE =
    /href="(\/index\.php\/vod\/play\/id\/(\d+)\.html)"[^>]*data-url="([^"]+)".*?data-src="([^"]+)"[^>]*alt="([^"]*)"/gs;

let host = DEFAULT_HOST;

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

function getHeaders() {
    return {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Referer: `${host}/`,
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120"',
    };
}

const http = axios.create({
    timeout: 15_000,
    httpsAgent,
    validateStatus: () => true,
});

function fixUrl(url) {
    if (!url) return '';
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) return host + url;
    if (url.startsWith('http')) return url;
    return `${host}/${url}`;
}

function cleanText(text) {
    if (!text) return '';
    return String(text)
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
}

function isVideoFormat(url) {
    return ['.m3u8', '.mp4', '.flv', '.ts'].some((x) => url.includes(x));
}

async function fetchText(url) {
    try {
        const resp = await http.get(url, { headers: getHeaders(), responseType: 'text' });
        if (resp.status !== 200) return '';
        return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch {
        return '';
    }
}

function parseListItems(htmlText) {
    const result = [];
    const seen = new Set();

    let items = [...htmlText.matchAll(POSTER_RE)];
    if (!items.length) items = [...htmlText.matchAll(FALLBACK_RE)];

    for (const m of items) {
        const href = m[1];
        const vid = m[2];
        const pic = fixUrl(m[4]);
        const title = cleanText(m[5]);
        if (seen.has(vid)) continue;
        seen.add(vid);

        let duration = '';
        const blockRe = new RegExp(`${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>[\\s\\S]*?</a>`);
        const blockMatch = htmlText.match(blockRe);
        if (blockMatch) {
            const durMatch = blockMatch[0].match(/<span class="text-sm">([^<]+)<\/span>/);
            if (durMatch) duration = durMatch[1].trim();
        }

        result.push({
            vod_id: vid,
            vod_name: title,
            vod_pic: pic,
            vod_remarks: duration,
        });
    }
    return result;
}

function parsePageCount(htmlText, pg) {
    const pc = htmlText.match(/rel="next" href="[^"]*page=(\d+)"/);
    if (pc) return Math.max(pg + 1, parseInt(pc[1], 10));
    if (/href="[^"]*[?&]page=\d+"/.test(htmlText)) return pg + 1;
    return 1;
}

function extractPlayUrl(htmlText, vid) {
    let playUrl = '';
    const sourceMatch = htmlText.match(/const source = '([^']+)'/);
    if (sourceMatch) playUrl = sourceMatch[1];

    if (!playUrl) {
        const dataRe = new RegExp(
            `href="/index\\.php/vod/play/id/${vid}\\.html"[^>]*data-url="([^"]+)"`,
        );
        const dataMatch = htmlText.match(dataRe);
        if (dataMatch) {
            const du = dataMatch[1];
            playUrl = du.includes('$') ? du.split('$', 2)[1] : du;
        }
    }

    if (!playUrl) {
        const m3u8Match = htmlText.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/);
        if (m3u8Match) playUrl = m3u8Match[1];
    }

    return fixUrl(playUrl);
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(inReq, _outResp) {
    const extend = inReq.body?.extend || inReq.body?.ext || '';
    host = DEFAULT_HOST;
    if (typeof extend === 'string' && extend.startsWith('http')) {
        host = extend.replace(/\/$/, '');
    }
    return {};
}

async function home(_inReq, _outResp) {
    const url = `${host}/index.php/vod/type/id/66.html`;
    const htmlText = await fetchText(url);
    const list = htmlText ? parseListItems(htmlText) : [];
    return { class: CLASSES, filters: {}, list };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '66');
    const pg = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;

    const url =
        pg > 1
            ? `${host}/index.php/vod/type.html?id=${tid}&page=${pg}`
            : `${host}/index.php/vod/type/id/${tid}.html`;

    const htmlText = await fetchText(url);
    if (!htmlText) {
        return { list: [], page: pg, pagecount: 1, limit: 24, total: 0 };
    }

    return {
        list: parseListItems(htmlText),
        page: pg,
        pagecount: parsePageCount(htmlText, pg),
        limit: 24,
        total: 0,
    };
}

async function detail(inReq, _outResp) {
    const vid = String(inReq.body.id || '');
    const htmlText = await fetchText(`${host}/index.php/vod/play/id/${vid}.html`);
    if (!htmlText) return { list: [] };

    let title = '';
    const titleMatch = htmlText.match(/<h1[^>]*>([^<]+)<\/h1>/);
    if (titleMatch) title = cleanText(titleMatch[1]);

    let pic = '';
    const picMatch = htmlText.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/);
    if (picMatch) pic = picMatch[1];
    if (!pic) {
        const posterMatch = htmlText.match(/let poster = '([^']+)'/);
        if (posterMatch) pic = posterMatch[1];
    }
    pic = fixUrl(pic);

    const playUrl = extractPlayUrl(htmlText, vid);

    return {
        list: [
            {
                vod_id: vid,
                vod_name: title || vid,
                vod_pic: pic,
                vod_play_from: playUrl ? '正片' : '默认',
                vod_play_url: playUrl ? `正片$${playUrl}` : `播放$${vid}`,
            },
        ],
    };
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    const header = { Referer: `${host}/`, 'User-Agent': UA };

    if (isVideoFormat(id) || (id.startsWith('http') && id.includes('.m3u8'))) {
        return { parse: 0, url: id, header };
    }

    if (id.startsWith('http')) {
        const htmlText = await fetchText(id);
        if (htmlText) {
            const sourceMatch = htmlText.match(/const source = '([^']+)'/);
            if (sourceMatch) {
                return { parse: 0, url: sourceMatch[1], header };
            }
        }
    }

    return { parse: 0, url: id, header };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg = parseInt(inReq.body.pg || inReq.body.page || 1, 10) || 1;
    const url = `${host}/index.php/vod/search.html?wd=${encodeURIComponent(key)}&page=${pg}`;
    const htmlText = await fetchText(url);

    if (!htmlText) {
        return { list: [], page: pg, pagecount: 1, limit: 24, total: 0 };
    }

    return {
        list: parseListItems(htmlText),
        page: pg,
        pagecount: parsePageCount(htmlText, pg),
        limit: 24,
        total: 0,
    };
}

export default {
    meta: {
        key: 'xqxq',
        name: '🔥AV星球',
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
