import axios from 'axios';
import { load } from 'cheerio';

/**
 * XX01.COM 视频解析 - https://xx01.com
 * 支持全分类；详情页含 Dean Edwards packer 与代理播放地址解析。
 */

const DEFAULT_HOST = 'https://xx01.com';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

const CLASSES = [
    { type_id: 'chinese-subtitle', type_name: '中文字幕' },
    { type_id: 'madou', type_name: '国产AV' },
    { type_id: 'genres/外国女优', type_name: '欧美大片' },
    { type_id: 'PLANTSVSCUNTS', type_name: '猎奇' },
    { type_id: 'masem', type_name: '马赛姆' },
    { type_id: 'kinostream', type_name: 'kinostream' },
    { type_id: 'TIMESTUDIO', type_name: '时间工作室' },
    { type_id: 'anime', type_name: '成人动漫' },
    { type_id: 'new', type_name: '最近更新' },
    { type_id: 'release', type_name: '新作上市' },
    { type_id: 'uncensored-leak', type_name: '无码流出' },
    { type_id: 'genres', type_name: '类型' },
    { type_id: 'VR', type_name: 'VR' },
    { type_id: 'avtalk', type_name: 'AV解说' },
    { type_id: 'siro', type_name: 'SIRO' },
    { type_id: 'luxu', type_name: 'LUXU' },
    { type_id: 'gana', type_name: 'GANA' },
    { type_id: 'maan', type_name: 'PRESTIGE PREMIUM' },
    { type_id: 'scute', type_name: 'S-CUTE' },
    { type_id: 'ara', type_name: 'ARA' },
    { type_id: 'fc2', type_name: 'FC2' },
    { type_id: 'heyzo', type_name: 'HEYZO' },
    { type_id: 'tokyohot', type_name: '東京熱' },
    { type_id: '1pondo', type_name: '一本道' },
    { type_id: 'caribbeancom', type_name: 'Caribbeancom' },
    { type_id: 'caribbeancompr', type_name: 'Caribbeancompr' },
    { type_id: '10musume', type_name: '10musume' },
    { type_id: 'pacopacomama', type_name: 'pacopacomama' },
    { type_id: 'gachinco', type_name: 'Gachinco' },
    { type_id: 'xxxav', type_name: 'XXX-AV' },
    { type_id: 'marriedslash', type_name: '人妻斬' },
    { type_id: 'naughty4610', type_name: '頑皮4610' },
    { type_id: 'naughty0930', type_name: '頑皮0930' },
    { type_id: 'twav', type_name: 'TWAV' },
    { type_id: 'furuke', type_name: 'Furuke' },
    { type_id: 'klive', type_name: '韓國直播' },
    { type_id: 'clive', type_name: '中國直播' },
    { type_id: 'tiktok', type_name: '抖阴视频' },
    { type_id: 'starface', type_name: '明星换脸' },
    { type_id: 'cnlive', type_name: '主播直播,国产主播' },
    { type_id: 'cmedia', type_name: '国产传媒' },
    { type_id: 'playgirl', type_name: '玩偶姐姐,网红头条' },
    { type_id: 'netdoor', type_name: '网-曝-门,网曝黑料' },
];

const LIST_SELECTORS = [
    '.grid .thumbnail.group',
    '#list1 .thumbnail.group',
    '.thumbnail.group',
    '.item-wrapper .thumbnail.group',
    '.grid.grid-cols-2 .thumbnail.group',
];

let host = DEFAULT_HOST;
let headers = {
    referer: `${DEFAULT_HOST}/`,
    'user-agent': UA,
};

const http = axios.create({
    timeout: 25_000,
    validateStatus: () => true,
});

function getHeaders(referer) {
    return {
        ...headers,
        referer: referer || `${host}/`,
        Referer: referer || `${host}/`,
        'User-Agent': headers['user-agent'] || UA,
    };
}

function fullUrl(value) {
    const v = String(value || '').trim();
    if (!v) return '';
    try {
        return new URL(v, host.endsWith('/') ? host : `${host}/`).href;
    } catch {
        return `${host.replace(/\/$/, '')}/${v.replace(/^\//, '')}`;
    }
}

function mediaHeaders() {
    return {
        'User-Agent': headers['user-agent'] || UA,
        Referer: `${host}/`,
    };
}

function playResult(url, parse = 0) {
    return {
        parse,
        jx: 0,
        playUrl: '',
        url,
        header: mediaHeaders(),
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

function proxyTarget(url) {
    try {
        const value = new URL(url).searchParams.get('url')?.trim() || '';
        if (value.startsWith('http') && !value.includes('${')) return value;
    } catch {
        /* ignore */
    }
    return '';
}

function isMediaTarget(value, depth = 0) {
    let v = unescapeHtml(value).trim();
    try {
        v = decodeURIComponent(v);
    } catch {
        /* keep */
    }
    if (!v || v.includes('${') || depth > 3) return false;
    const lower = v.toLowerCase();
    if (/https?:\/\/(?:pl\d+\.vvvvvvvv|ig\d+\.pppppppp)\.top\//i.test(lower)) {
        return isMediaTarget(proxyTarget(v), depth + 1);
    }
    return /\.(?:m3u8|mp4|flv|ts)(?:\?|$)/i.test(lower);
}

function normalizeMediaUrl(value) {
    let v = unescapeHtml(value).replace(/\\\//g, '/').trim();
    if (!v || v.includes('${') || v.startsWith('blob:')) return '';
    v = fullUrl(v);
    const lower = v.toLowerCase();
    const target = proxyTarget(v);

    if (/https?:\/\/pl\d+\.vvvvvvvv\.top\//i.test(lower)) {
        if (!target || !isMediaTarget(target)) return '';
        if (lower.includes('/api/play') && !target.toLowerCase().includes('surrit.com')) return '';
        return v;
    }

    if (/https?:\/\/ig\d+\.pppppppp\.top\/api\/proxy\//i.test(lower)) {
        return target && isMediaTarget(target) ? v : '';
    }

    if (lower.includes('stream.defeated.xxx/')) {
        return `https://pl2.vvvvvvvv.top/?url=${encodeURIComponent(v)}`;
    }

    if (lower.includes('fourhoi.com/') && /\.(?:m3u8|mp4)(?:\?|$)/i.test(lower)) {
        return `https://ig2.pppppppp.top/api/proxy/?url=${encodeURIComponent(v)}`;
    }

    if (/\.(?:m3u8|mp4|flv|ts)(?:\?|$)/i.test(lower)) return v;
    return '';
}

function isVideoFormat(url) {
    return /(?:\.(?:m3u8|mp4|flv|ts)(?:\?|$)|(?:pl\d+\.vvvvvvvv\.top|ig\d+\.pppppppp\.top)\/)/i.test(
        String(url || ''),
    );
}

function baseKey(number, radix) {
    if (number === 0) return '0';
    let value = '';
    let n = number;
    while (n) {
        value = ALPHABET[n % radix] + value;
        n = Math.floor(n / radix);
    }
    return value;
}

function decodePackedMedia(text) {
    const results = [];
    const priorities = { source: 850, source1280: 820, source842: 780 };
    const packers = [
        /\}\('((?:\\.|[^'])*)',(\d+),(\d+),'((?:\\.|[^'])*)'\.split\('\|'\)/g,
        /\}\("((?:\\.|[^"])*)",(\d+),(\d+),'((?:\\.|[^'])*)\'\.split\(\'\|\'\)/g,
    ];

    for (const packer of packers) {
        for (const match of text.matchAll(packer)) {
            let payload = match[1]
                .replace(/\\'/g, "'")
                .replace(/\\"/g, '"')
                .replace(/\\\\/g, '\\');
            const radix = parseInt(match[2], 10);
            const count = parseInt(match[3], 10);
            const words = match[4].split('|');
            if (radix < 2 || radix > ALPHABET.length || count > 5000) continue;

            const limit = Math.min(count, words.length);
            for (let index = limit - 1; index >= 0; index--) {
                if (words[index]) {
                    const key = baseKey(index, radix).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    payload = payload.replace(new RegExp(`\\b${key}\\b`, 'g'), words[index]);
                }
            }

            for (const m of payload.matchAll(
                /\b(source1280|source842|source)\s*=\s*['"](https?:\/\/[^'"]+)['"]/g,
            )) {
                results.push([m[2], priorities[m[1]] || 800]);
            }
        }
    }

    return results;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function fetchPage(url, referer) {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const resp = await http.get(url, {
                headers: getHeaders(referer),
                responseType: 'text',
            });
            if (resp.status === 200) {
                const text = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
                const signature = text.slice(0, 5000).toLowerCase();
                if (
                    !signature.includes('just a moment') &&
                    !signature.includes('_cf_chl_opt') &&
                    !signature.includes('cf-turnstile') &&
                    !signature.includes('cf-chl-widget')
                ) {
                    return text;
                }
                lastError = new Error('Cloudflare验证页');
            } else {
                lastError = new Error(`HTTP ${resp.status}`);
            }
        } catch (e) {
            lastError = e;
        }
        if (attempt < 2) await sleep((attempt + 1) * 1000);
    }
    throw lastError || new Error('请求失败');
}

function categoryPath(tid) {
    const t = String(tid || '').trim();
    if (t.startsWith('http')) {
        try {
            const u = new URL(t);
            return u.pathname.replace(/^\//, '') + u.search;
        } catch {
            return t.replace(/^\/+/, '');
        }
    }
    return t.replace(/^\/+/, '');
}

function parseList(html) {
    const ret = [];
    const seen = new Set();
    const $ = load(html);

    let items = null;
    for (const sel of LIST_SELECTORS) {
        items = $(sel);
        if (items.length > 0) break;
    }
    if (!items || items.length === 0) return ret;

    items.each((_, el) => {
        try {
            const item = $(el);
            const a = item.find('a').eq(0);
            const href = a.attr('href');
            if (!href) return;

            const absoluteHref = fullUrl(href);
            let vid = '';
            try {
                vid = new URL(absoluteHref).pathname.replace(/^\//, '').replace(/\/$/, '');
            } catch {
                vid = absoluteHref.replace(/^\/+/, '');
            }

            if (
                !vid ||
                seen.has(vid) ||
                vid.startsWith('http') ||
                vid.startsWith('#') ||
                vid.startsWith('javascript')
            ) {
                return;
            }
            seen.add(vid);

            let name = item.find('.truncate a, .text-secondary').eq(0).text().trim();
            if (!name) name = a.attr('alt') || vid;

            let pic = '';
            let img = a.find('img');
            if (img.length) {
                pic = img.attr('data-src') || img.attr('src') || '';
            } else {
                img = item.find('img').eq(0);
                if (img.length) pic = img.attr('data-src') || img.attr('src') || '';
            }

            if (pic?.startsWith('data:image')) pic = '';
            else if (pic) pic = fullUrl(pic);

            let remark = item.find('.absolute.bottom-1.right-1').eq(0).text().trim();
            if (!remark) remark = item.find('.absolute.bottom-1.left-1').eq(0).text().trim();

            ret.push({
                vod_id: vid,
                vod_name: name,
                vod_pic: pic,
                vod_year: '',
                vod_remarks: remark,
                style: { type: 'rect', ratio: 1.33 },
            });
        } catch {
            /* skip item */
        }
    });

    return ret;
}

function errorHome(msg) {
    return {
        class: [{ type_id: 'PLANTSVSCUNTS', type_name: '猎奇' }],
        filters: {},
        list: [
            {
                vod_id: 'error',
                vod_name: '【点我查看错误信息】',
                vod_pic: '',
                vod_remarks: String(msg).slice(0, 40),
                vod_content: `错误详情：${msg}`,
                style: { type: 'rect', ratio: 1.33 },
            },
        ],
    };
}

async function init(inReq, _outResp) {
    let cfg = inReq.body?.extend ?? {};
    if (typeof cfg === 'string') {
        try {
            cfg = JSON.parse(cfg || '{}');
        } catch {
            cfg = {};
        }
    }

    host = String(cfg.site || DEFAULT_HOST).replace(/\/$/, '') || DEFAULT_HOST;
    headers.referer = `${host}/`;
    return {};
}

async function home(_inReq, _outResp) {
    try {
        const html = await fetchPage(`${host}/`);
        return {
            class: CLASSES,
            filters: {},
            list: parseList(html),
        };
    } catch (e) {
        return errorHome(String(e.message || e));
    }
}

async function category(inReq, _outResp) {
    const tid = categoryPath(inReq.body.id);
    const pg = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);

    try {
        let url = `${host}/${tid}`;
        if (pg > 1) url += `?page=${pg}`;

        const html = await fetchPage(url);
        const $ = load(html);
        const pages = [pg];

        $('a[href*="?page="]').each((_, el) => {
            const href = $(el).attr('href') || '';
            const m = href.match(/[?&]page=(\d+)/);
            if (m) pages.push(parseInt(m[1], 10));
        });

        return {
            list: parseList(html),
            page: pg,
            pagecount: Math.max(...pages),
            limit: 90,
            total: 0,
        };
    } catch {
        return { list: [], page: 1, pagecount: 1, limit: 90, total: 0 };
    }
}

async function detail(inReq, _outResp) {
    try {
        let vid = String(
            Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id || '',
        ).trim();
        if (vid.startsWith('atvp_detail:')) vid = vid.slice('atvp_detail:'.length);
        vid = vid.replace(/^\/+|\/+$/g, '');

        const url = `${host}/${vid}`;
        const text = await fetchPage(url);
        const $ = load(text);

        let title = $('h1').first().text().trim();
        if (!title) title = $('meta[property="og:title"]').attr('content') || '';
        if (!title) title = ($('title').text().split('-')[0] || '').trim();
        if (!title) title = $('title').text().trim();
        if (!title) title = vid;
        title = title.replace(/\s*[-|]\s*XX01\.?COM.*$/i, '').trim();

        let content = $('meta[name="description"]').attr('content') || '';
        if (!content) content = $('meta[property="og:description"]').attr('content') || '';

        let pic = $('meta[property="og:image"]').attr('content') || '';
        if (!pic) {
            pic =
                $('.aspect-w-16 img').attr('data-src') ||
                $('.aspect-w-16 img').attr('src') ||
                '';
        }

        const candidates = [];

        function addCandidate(value, priority) {
            const media = normalizeMediaUrl(value);
            const lower = media.toLowerCase();
            if (!media || lower.includes('/previews/') || lower.includes('preview.')) return;
            candidates.push([media, priority]);
        }

        $('video.player[src], video.player[data-src]').each((_, el) => {
            addCandidate($(el).attr('src') || $(el).attr('data-src'), 1000);
        });

        $('a[href*="vvvvvvvv.top"][href*="url="], a[href*="pppppppp.top"][href*="url="]').each(
            (_, el) => {
                addCandidate($(el).attr('href'), 950);
            },
        );

        $('a[href*=".mp4"], a[href*=".m3u8"]').each((_, el) => {
            addCandidate($(el).attr('href'), 900);
        });

        for (const [mediaRaw, priority] of decodePackedMedia(text)) {
            let media = mediaRaw;
            if (media.toLowerCase().includes('surrit.com/')) {
                media = `https://pl3.vvvvvvvv.top/api/play?url=${encodeURIComponent(media)}`;
            }
            addCandidate(media, priority);
        }

        const decodedText = unescapeHtml(text).replace(/\\\//g, '/');
        const patterns = [
            /(https?:\/\/pl\d+\.vvvvvvvv\.top\/[^\s"'<>]+)/gi,
            /(https?:\/\/ig\d+\.pppppppp\.top\/api\/proxy\/\?url=[^\s"'<>]+)/gi,
            /(https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4|flv)(?:\?[^\s"'<>]*)?)/gi,
        ];
        for (const pattern of patterns) {
            for (const m of decodedText.matchAll(pattern)) {
                addCandidate(m[1], 200);
            }
        }

        const deduped = {};
        for (const [media, priority] of candidates) {
            deduped[media] = Math.max(priority, deduped[media] || 0);
        }

        let play = '';
        if (Object.keys(deduped).length) {
            play = Object.entries(deduped).sort((a, b) => b[1] - a[1])[0][0];
        }
        if (!play) play = `嗅探$${url}`;

        const playName = title.replace(/[$#]+/g, ' ').trim() || vid;

        return {
            list: [
                {
                    vod_id: vid,
                    vod_name: title,
                    vod_pic: pic,
                    vod_actor: '',
                    vod_director: '',
                    vod_content: content,
                    vod_play_from: 'XX01',
                    vod_play_url: `${playName}$${play}`,
                },
            ],
        };
    } catch {
        return { list: [] };
    }
}

async function search(inReq, _outResp) {
    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    const pg = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);

    if (!key) return { list: [], page: 1 };

    try {
        let url = `${host}/search/${encodeURIComponent(key)}`;
        if (pg > 1) url += `?page=${pg}`;

        const html = await fetchPage(url);
        return { list: parseList(html), page: pg };
    } catch {
        return { list: [], page: 1 };
    }
}

async function play(inReq, _outResp) {
    try {
        let value = String(inReq.body.id || '').trim();
        if (value.startsWith('嗅探$')) return playResult(value.slice(3), 1);

        const media = normalizeMediaUrl(value);
        if (media) return playResult(media, 0);

        if (value.startsWith('http') || isVideoFormat(value)) {
            return playResult(value, isVideoFormat(value) ? 0 : 1);
        }

        return playResult(value, 1);
    } catch {
        return playResult(String(inReq.body.id || ''), 1);
    }
}

export default {
    meta: {
        key: 'xx01',
        name: '💋XX01',
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
