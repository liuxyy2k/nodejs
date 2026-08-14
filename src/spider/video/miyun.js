import axios from 'axios';
import https from 'https';
import { load } from 'cheerio';

/**
 * 蜜云视频 - zilitv64.cfd
 * 列表 video-card · 播放器页多层提取 m3u8/mp4
 */

const DEFAULT_HOST = 'https://xn--0810-3cc-i30mr40izsbt77d4ir52ihu1g.zilitv64.cfd';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const DEFAULT_CLASSES = [
    { type_id: 'sh', type_name: '雄狮' },
    { type_id: 'jp', type_name: '精品' },
    { type_id: 'Hsck', type_name: 'Hsck' },
    { type_id: 'xnxx', type_name: 'Xnxx' },
    { type_id: 'xvs', type_name: 'Xvideos' },
    { type_id: 'p91', type_name: '91国产' },
    { type_id: 'p91404', type_name: '9109' },
    { type_id: 'javbus', type_name: 'JavB(种)' },
    { type_id: 'javdb', type_name: 'JavD(种)' },
    { type_id: 'javxx', type_name: 'Javtt' },
    { type_id: 'supjav', type_name: 'Javpp' },
    { type_id: 'zblive', type_name: 'ZB直播' },
    { type_id: '18av', type_name: '18AV' },
];

const SUB_CATEGORIES = {
    p91: [
        ['', '全部'],
        ['latest', '最近更新'],
        ['hd', '高清视频'],
        ['recent-favorite', '最近加精'],
        ['hot-list', '当前最热'],
        ['recent-rating', '最近得分'],
        ['nonpaid', '非付费'],
        ['ori', '91原创'],
        ['long-list', '10分钟以上'],
        ['longer-list', '20分钟以上'],
        ['top-list', '本月最热'],
    ],
    xvs: [
        ['index', '最近更新'],
        ['channels_list', '热门频道'],
        ['pornstars_list', '明星合集'],
        ['month_list', '月份榜单'],
    ],
};

let siteUrl = DEFAULT_HOST;

const http = axios.create({
    timeout: 12_000,
    validateStatus: () => true,
    maxRedirects: 5,
});

function getHeaders(referer) {
    return {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Referer: referer || `${siteUrl}/`,
        Connection: 'keep-alive',
    };
}

function mediaHeaders() {
    return {
        'User-Agent': UA,
        Referer: `${siteUrl}/`,
    };
}

function unescapeHtml(value) {
    return String(value || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function cleanText(value) {
    return unescapeHtml(String(value || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function absoluteUrl(url) {
    const u = unescapeHtml(String(url || '').trim());
    if (!u) return '';
    if (u.startsWith('//')) return `https:${u}`;
    if (u.startsWith('http')) return u;
    return new URL(u, `${siteUrl}/`).href;
}

function isMediaUrl(url) {
    const value = decodeURIComponent(String(url || '')).replace(/\\\//g, '/');
    return /\.(m3u8|mp4)(?:\?|$|[&#])/i.test(value);
}

function firstMatch(text, patterns) {
    for (const pattern of patterns) {
        const m = text.match(pattern);
        if (m) return m[1];
    }
    return '';
}

function parseExtend(body) {
    let ext = body?.extend ?? body?.filter ?? {};
    if (typeof ext === 'string') {
        try {
            ext = JSON.parse(ext || '{}');
        } catch {
            ext = {};
        }
    }
    return ext && typeof ext === 'object' ? ext : {};
}

async function fetchText(url, referer) {
    try {
        const resp = await http.get(url, {
            headers: getHeaders(referer),
            responseType: 'text',
        });
        if (resp.status >= 400) return '';
        return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch {
        return '';
    }
}

function parseClasses(htmlText) {
    const $ = load(htmlText);
    const classes = [];
    const seen = new Set();

    $('nav.header-nav a[href*="m=list"][href*="u="]').each((_, el) => {
        const href = unescapeHtml($(el).attr('href') || '');
        let tid = '';
        try {
            tid = new URL(href, `${siteUrl}/`).searchParams.get('u') || '';
        } catch {
            const m = href.match(/[?&]u=([^&]+)/);
            tid = m ? decodeURIComponent(m[1]) : '';
        }
        const name = cleanText($(el).text());
        if (tid && !seen.has(tid) && name) {
            seen.add(tid);
            classes.push({ type_id: tid, type_name: name });
        }
    });
    return classes;
}

function buildFilters(classes) {
    const filters = {};
    const known = new Set(classes.map((c) => c.type_id));
    for (const [tid, items] of Object.entries(SUB_CATEGORIES)) {
        if (known.has(tid) || known.size === 0) {
            filters[tid] = [
                {
                    key: 'k',
                    name: '分类',
                    value: items.map(([v, n]) => ({ n, v })),
                },
            ];
        }
    }
    return filters;
}

function normalizeDetailId(raw) {
    let rawStr = unescapeHtml(String(raw || '').trim());
    let url;
    let u = '';
    let k = '';

    if (rawStr.startsWith('http')) {
        url = rawStr;
    } else if (rawStr.startsWith('/')) {
        url = absoluteUrl(rawStr);
    } else if (rawStr.includes('|')) {
        [u, k] = rawStr.split('|', 2);
        url = `${siteUrl}/?m=play&u=${encodeURIComponent(u)}&k=${encodeURIComponent(k)}`;
        return { url, u, k };
    } else {
        url = `${siteUrl}/?${rawStr.replace(/^\?/, '')}`;
    }

    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        return { url, u, k };
    }

    u = parsed.searchParams.get('u') || '';
    k = parsed.searchParams.get('k') || '';

    const pm = parsed.pathname.match(/\/player\/index\.php\/([^/?#]+)\/([^/?#]+)/);
    if (pm) {
        u = decodeURIComponent(pm[1]);
        k = decodeURIComponent(pm[2]);
        url = `${siteUrl}/?m=play&u=${encodeURIComponent(u)}&k=${encodeURIComponent(k)}`;
    }

    return { url, u, k };
}

function makeDetailId(u, k, fallbackUrl = '') {
    if (u && k) return `${u}|${k}`;
    return fallbackUrl || '';
}

function parseCards(htmlText) {
    if (!htmlText) return [];
    const $ = load(htmlText);
    const videos = [];
    const seen = new Set();

    $('a.video-card[href*="m=play"][href*="u="][href*="k="]').each((_, el) => {
        const href = unescapeHtml($(el).attr('href') || '');
        const { url: detailUrl, u, k } = normalizeDetailId(href);
        if (!u || !k) return;

        const vodId = makeDetailId(u, k, detailUrl);
        if (seen.has(vodId)) return;
        seen.add(vodId);

        const img = $(el).find('img').first();
        let title = img.attr('alt') || '';
        let pic = img.attr('data-src') || img.attr('data-original') || img.attr('src') || '';

        const titleNode = $(el).find('.video-title').first();
        if (titleNode.length) title = title || cleanText(titleNode.text());

        const timeNode = $(el).find('.video-time').first();
        const remark = timeNode.length ? cleanText(timeNode.text()) : '';

        videos.push({
            vod_id: vodId,
            vod_name: cleanText(title) || k,
            vod_pic: absoluteUrl(pic),
            vod_remarks: remark,
            style: { type: 'rect', ratio: 1.33 },
        });
    });
    return videos;
}

function parsePagecount(htmlText) {
    const text = unescapeHtml(htmlText || '');
    const patterns = [
        /第\s*\d+\s*\/\s*(\d+)\s*页/,
        /data-total=["'](\d+)["']/,
        /[?&]p=(\d+)[^"'>]*["'][^>]*>\s*末页/,
    ];
    const nums = [];
    for (const pattern of patterns) {
        for (const m of text.matchAll(new RegExp(pattern.source, 'g'))) {
            const n = parseInt(m[1], 10);
            if (!Number.isNaN(n)) nums.push(n);
        }
    }
    return nums.length ? Math.max(...nums) : 1;
}

function extractPlayerPathMedia(url) {
    const raw = unescapeHtml(String(url || '').trim());
    if (!raw) return '';

    let parsed;
    try {
        parsed = new URL(raw.startsWith('/') ? absoluteUrl(raw) : raw);
    } catch {
        return '';
    }

    const m = parsed.pathname.match(/\/player\/index\.php\/([^/?#]+)\/([^?#]+)/);
    if (!m) return '';

    let decoded = decodeURIComponent(m[2]).replace(/\\\//g, '/');
    if (parsed.search && !decoded.includes('?')) {
        decoded += parsed.search;
    }
    return isMediaUrl(decoded) ? decoded : '';
}

function extractMedia(text) {
    const patterns = [
        /(https?:\/\/[^"'<>\s]+?\.m3u8[^"'<>\s]*)/i,
        /(https?:\/\/[^"'<>\s]+?\.mp4[^"'<>\s]*)/i,
        /["']url["']\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i,
        /["']src["']\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i,
        /player_aaaa\s*=\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i,
        /var\s+url\s*=\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i,
        /atob\(["']([A-Za-z0-9+/=]+)["']\)/i,
    ];

    for (const pattern of patterns) {
        const m = text.match(pattern);
        if (!m) continue;
        let value = m[1].trim();
        if (pattern.source.startsWith('atob')) {
            try {
                value = Buffer.from(value, 'base64').toString('utf8');
            } catch {
                continue;
            }
        }
        if (isMediaUrl(value)) return value;
    }
    return '';
}

async function resolvePlayerUrl(url, visited = new Set(), depth = 0) {
    if (!url || depth > 5) return '';

    url = absoluteUrl(url);
    const embedded = extractPlayerPathMedia(url);
    if (embedded) return embedded;
    if (isMediaUrl(url)) return url;
    if (visited.has(url)) return '';
    visited.add(url);

    const htmlText = await fetchText(url, `${siteUrl}/`);
    if (!htmlText) return '';

    const decoded = unescapeHtml(htmlText).replace(/\\\//g, '/');
    const media = extractMedia(decoded);
    if (media) return absoluteUrl(media);

    const iframe = firstMatch(decoded, [
        /<iframe[^>]+src=["']([^"']+)["']/i,
        /<source[^>]+src=["']([^"']+)["']/i,
        /<video[^>]+src=["']([^"']+)["']/i,
    ]);
    if (iframe) return resolvePlayerUrl(iframe, visited, depth + 1);
    return '';
}

function playerResult(url) {
    return {
        parse: isMediaUrl(url) ? 0 : 1,
        jx: 0,
        playUrl: '',
        url,
        header: mediaHeaders(),
    };
}

async function init(inReq, _outResp) {
    let extend = inReq.body?.extend ?? '';
    if (typeof extend === 'object' && extend !== null) {
        const url = extend.siteUrl || extend.url;
        if (url) siteUrl = String(url).replace(/\/$/, '');
    } else if (typeof extend === 'string' && extend.startsWith('http')) {
        siteUrl = extend.replace(/\/$/, '');
    } else {
        siteUrl = DEFAULT_HOST;
    }
    return {};
}

async function home(_inReq, _outResp) {
    const htmlText = await fetchText(`${siteUrl}/`);
    let classes = htmlText ? parseClasses(htmlText) : [];
    if (!classes.length) classes = DEFAULT_CLASSES;

    const list = htmlText ? parseCards(htmlText).slice(0, 24) : [];
    return {
        class: classes,
        filters: buildFilters(classes),
        list,
    };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || 'p91').trim();
    const pg = String(Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1));
    const extend = parseExtend(inReq.body);
    const key = extend.k || extend.cate || extend.type || '';

    const params = new URLSearchParams({ m: 'list', u: tid });
    if (key) params.set('k', key);
    if (pg !== '1') params.set('p', pg);

    const url = `${siteUrl}/?${params.toString()}`;
    const htmlText = await fetchText(url);
    const videos = htmlText ? parseCards(htmlText) : [];
    const pagecount = htmlText ? parsePagecount(htmlText) : parseInt(pg, 10);

    return {
        list: videos,
        page: parseInt(pg, 10) || 1,
        pagecount,
        limit: videos.length || 24,
        total: pagecount * (videos.length || 24),
    };
}

async function detail(inReq, _outResp) {
    const rawId = Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id;
    const { url: detailUrl, u, k } = normalizeDetailId(rawId);
    const htmlText = await fetchText(detailUrl);

    let title = '';
    let pic = '';
    let iframe = '';
    let related = [];

    if (htmlText) {
        title = firstMatch(htmlText, [
            /<h1[^>]*class=["'][^"']*dr001-title[^"']*["'][^>]*>(.*?)<\/h1>/is,
            /<title>(.*?)<\/title>/is,
        ]);
        title = cleanText(title).replace(' - 蜜云视频', '');

        pic = firstMatch(htmlText, [
            /toggleFavorite\([^)]*?['"](https?:\/\/[^'"]+)['"]/i,
            /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
            /<img[^>]+class=["'][^"']*thumb-img[^"']*["'][^>]+src=["']([^"']+)["']/i,
        ]);

        iframe = firstMatch(htmlText, [
            /<iframe[^>]+id=["']player["'][^>]+src=["']([^"']+)["']/i,
            /<iframe[^>]+src=["']([^"']*?\/player\/[^"']+)["']/i,
        ]);

        related = parseCards(htmlText).slice(0, 12);
    }

    if (!title) title = String(k || rawId || '视频');

    let playId;
    if (iframe) playId = absoluteUrl(iframe);
    else if (u && k) playId = `${u}|${k}`;
    else playId = String(rawId || '');

    const vod = {
        vod_id: makeDetailId(u, k, detailUrl),
        vod_name: title,
        vod_pic: absoluteUrl(pic),
        type_name: u || '',
        vod_year: '',
        vod_area: '',
        vod_remarks: '',
        vod_actor: '',
        vod_director: '',
        vod_content: title,
        vod_play_from: '蜜云',
        vod_play_url: `在线播放$${playId}`,
    };
    if (related.length) vod.vod_rels = related;

    return { list: [vod] };
}

async function play(inReq, _outResp) {
    let raw = unescapeHtml(String(inReq.body.id || '').trim());

    const embedded = extractPlayerPathMedia(raw);
    if (embedded) return playerResult(embedded);

    if (raw.includes('|')) {
        const [, k] = raw.split('|', 2);
        if (isMediaUrl(k)) return playerResult(k);
    }
    if (isMediaUrl(raw)) return playerResult(raw);

    const candidateUrls = [];
    if (raw.startsWith('/')) {
        candidateUrls.push(absoluteUrl(raw));
    } else if (raw.startsWith('http')) {
        candidateUrls.push(raw);
    } else if (raw.includes('|')) {
        const [u, k] = raw.split('|', 2);
        candidateUrls.push(
            `${siteUrl}/player/index.php/${encodeURIComponent(u)}/${encodeURIComponent(k)}`,
        );
    } else {
        const { url: detailUrl, u, k } = normalizeDetailId(raw);
        if (u && k) {
            candidateUrls.push(
                `${siteUrl}/player/index.php/${encodeURIComponent(u)}/${encodeURIComponent(k)}`,
            );
        }
        candidateUrls.push(detailUrl);
    }

    let mediaUrl = '';
    for (const url of candidateUrls) {
        mediaUrl = await resolvePlayerUrl(url);
        if (mediaUrl) break;
    }
    if (!mediaUrl) mediaUrl = raw;

    return playerResult(mediaUrl);
}

async function search(inReq, _outResp) {
    const kw = String(inReq.body.wd || inReq.body.key || '').trim();
    const pg = String(Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1));
    if (!kw) {
        return { list: [], page: 1, pagecount: 1, limit: 0, total: 0 };
    }

    const params = new URLSearchParams({ m: 'searchall', k: kw });
    if (pg !== '1') params.set('p', pg);

    const url = `${siteUrl}/?${params.toString()}`;
    const htmlText = await fetchText(url);
    const videos = htmlText ? parseCards(htmlText) : [];
    const pagecount = htmlText ? parsePagecount(htmlText) : parseInt(pg, 10);

    return {
        list: videos,
        page: parseInt(pg, 10) || 1,
        pagecount,
        limit: videos.length || 24,
        total: pagecount * (videos.length || 24),
    };
}

export default {
    meta: {
        key: 'miyun',
        name: '🔥蜜云视频',
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
