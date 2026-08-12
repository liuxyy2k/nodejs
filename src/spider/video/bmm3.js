import axios from 'axios';
import https from 'https';

/**
 * 3bmm.com / dtijfoc.info — 迷妹网
 * 站点 301 跳转 · vHLSurl m3u8 直链
 */

const CANDIDATE_BASE_URLS = ['https://3bmm.com', 'https://dtijfoc.info'];

const CATEGORY_MAP = {
    guochan: '国产',
    zhibo: '直播',
    rihan: '日韩',
    oumei: '欧美',
    sanji: '三级',
    dongman: '动漫',
};

const CDN_HLS = 'https://kngyyvu.info/new/hls';
const CDN_PIC = 'https://aghivwz.info/pic';
const SEARCH_URL = '/e/search/index.php';

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';


let baseUrl = '';
const hashCache = new Map();

const http = axios.create({
    timeout: 20_000,
    maxRedirects: 5,
    validateStatus: () => true,
});

function getHeaders(referer) {
    return {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Referer: referer || `${baseUrl}/`,
    };
}

function unescapeEntities(text) {
    if (!text) return '';
    return String(text)
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

async function resolveBaseUrl() {
    for (const url of CANDIDATE_BASE_URLS) {
        try {
            const resp = await http.get(url, { headers: getHeaders(), responseType: 'text' });
            if (resp.status === 200) {
                const final = new URL(resp.request?.res?.responseUrl || url);
                return `${final.protocol}//${final.host}`;
            }
        } catch {
            /* try next */
        }
    }
    return CANDIDATE_BASE_URLS[1];
}

async function fetchHtml(path, method = 'GET', data = null) {
    const url = path.startsWith('http') ? path : new URL(path, `${baseUrl}/`).href;
    try {
        const config = {
            headers: getHeaders(),
            responseType: 'text',
        };
        const resp =
            method === 'POST'
                ? await http.post(url, data, config)
                : await http.get(url, config);
        if (resp.status !== 200) return '';
        return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch {
        return '';
    }
}

function extractListFromHtml(htmlText) {
    const items = [];
    if (!htmlText) return items;

    const reCard =
        /<li>\s*<a\s+href="([^"]+)"[^>]*title="([^"]*)"[^>]*>\s*<img\s+src="([^"]+)"[^>]*alt="([^"]*)">\s*(?:<p>[^<]*<\/p>\s*)?(?:<span>([^<]*)<\/span>\s*)?/gi;

    let match;
    while ((match = reCard.exec(htmlText)) !== null) {
        const href = match[1];
        const title = unescapeEntities(match[2]);
        const img = match[3];
        const date = match[5] || '';

        const parts = href.replace(/^\/+|\/+$/g, '').split('/');
        if (!parts.length) continue;

        const last = parts[parts.length - 1];
        if (!last.endsWith('.html')) continue;

        const vid = last.replace('.html', '');
        if (!/^\d+$/.test(vid)) continue;

        items.push({
            vod_id: vid,
            vod_name: title,
            vod_pic: img,
            vod_remarks: date.trim(),
        });
    }

    return items;
}

function extractM3u8Hash(htmlText) {
    const m = htmlText.match(/var\s+vHLSurl\s*=\s*"\/([a-f0-9]+)\/index\.m3u8"/i);
    return m ? m[1] : '';
}

function extractTitle(htmlText) {
    const m = htmlText.match(/<title>([^<]*)<\/title>/i);
    if (!m) return '';

    let raw = unescapeEntities(m[1]);
    for (const suffix of [' - 迷妹网', '| 迷妹网', '- 迷妹网']) {
        if (raw.includes(suffix)) {
            raw = raw.slice(0, raw.indexOf(suffix)).trim();
        }
    }
    return raw;
}

async function findDetailHtml(vid) {
    for (const cat of Object.keys(CATEGORY_MAP)) {
        const path = `/suoyoushipin/${cat}/${vid}.html`;
        const html = await fetchHtml(path);
        if (html && extractM3u8Hash(html)) {
            return html;
        }
    }
    return '';
}

function playbackHeaders() {
    return {
        'User-Agent': UA,
        Referer: `${baseUrl}/`,
    };
}

async function init(_inReq, _outResp) {
    baseUrl = await resolveBaseUrl();
    hashCache.clear();
    return {};
}

async function home(_inReq, _outResp) {
    if (!baseUrl) baseUrl = await resolveBaseUrl();

    const classes = Object.entries(CATEGORY_MAP).map(([type_id, type_name]) => ({
        type_id,
        type_name,
    }));

    const html = await fetchHtml('/suoyoushipin/guochan/');
    const items = extractListFromHtml(html).slice(0, 30);

    return { class: classes, filters: {}, list: items };
}

async function category(inReq, _outResp) {
    if (!baseUrl) baseUrl = await resolveBaseUrl();

    const cat = String(inReq.body.id || 'guochan');
    const page = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);

    const path =
        page <= 1
            ? `/suoyoushipin/${cat}/`
            : `/suoyoushipin/${cat}/index_${page}.html`;

    const html = await fetchHtml(path);
    if (!html) {
        return { page, pagecount: 1, limit: 0, total: 0, list: [] };
    }

    const items = extractListFromHtml(html);
    const lastMatch = html.match(
        new RegExp(`/suoyoushipin/${cat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/index_(\\d+)\\.html[^>]*>尾页`, 'i'),
    );
    const totalPg = lastMatch ? parseInt(lastMatch[1], 10) : page;

    return {
        page,
        pagecount: totalPg,
        limit: items.length,
        total: totalPg * 30,
        list: items,
    };
}

async function detail(inReq, _outResp) {
    if (!baseUrl) baseUrl = await resolveBaseUrl();

    const vid = String(
        Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id || '',
    );

    const detailHtml = await findDetailHtml(vid);
    if (!detailHtml) return { list: [] };

    const title = extractTitle(detailHtml) || `视频_${vid}`;
    const hashVal = extractM3u8Hash(detailHtml);
    if (hashVal) hashCache.set(vid, hashVal);

    const vodPic = hashVal ? `${CDN_PIC}/${hashVal}.jpg` : '';
    const playUrl = hashVal ? `${CDN_HLS}/${hashVal}/index.m3u8` : '';

    return {
        list: [
            {
                vod_id: vid,
                vod_name: title,
                vod_pic: vodPic,
                type_name: '',
                vod_year: '',
                vod_area: '',
                vod_remarks: '',
                vod_actor: '',
                vod_director: '',
                vod_content: '',
                vod_play_from: '迷妹网',
                vod_play_url: playUrl ? `${title}$${playUrl}` : '',
            },
        ],
    };
}

async function play(inReq, _outResp) {
    if (!baseUrl) baseUrl = await resolveBaseUrl();

    const vidOrUrl = String(inReq.body.id || '');

    if (vidOrUrl.startsWith('http')) {
        return {
            url: vidOrUrl,
            parse: 0,
            header: playbackHeaders(),
        };
    }

    let hashVal = hashCache.get(vidOrUrl);
    if (!hashVal) {
        const detailHtml = await findDetailHtml(vidOrUrl);
        if (detailHtml) {
            hashVal = extractM3u8Hash(detailHtml);
            if (hashVal) hashCache.set(vidOrUrl, hashVal);
        }
    }

    if (hashVal) {
        return {
            url: `${CDN_HLS}/${hashVal}/index.m3u8`,
            parse: 0,
            header: playbackHeaders(),
        };
    }

    return { url: '', parse: 0, header: {} };
}

async function search(inReq, _outResp) {
    if (!baseUrl) baseUrl = await resolveBaseUrl();

    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    if (!key) return { list: [] };

    let html = await fetchHtml(SEARCH_URL, 'POST', {
        keyboard: key,
        show: 'title',
        tempid: '1',
    });

    let items = extractListFromHtml(html);
    if (!items.length) {
        html = await fetchHtml(`/search/?q=${encodeURIComponent(key)}`);
        items = extractListFromHtml(html);
    }

    return { list: items };
}

export default {
    meta: {
        key: '3bmm',
        name: '🔥迷妹网',
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
