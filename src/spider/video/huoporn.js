import axios from 'axios';

/**
 * HuoPorn福利视频 - https://www.huoporn.lol
 * MacCMS v10 · Vue 渲染 HTML · player_aaaa 解密
 */

const DEFAULT_HOST = 'https://www.huoporn.lol';
const UA =
    'Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const CATEGORIES = {
    '1': '国产',
    '2': '传媒',
    '3': '网红',
    '4': '大秀',
    '5': '探花',
    '6': '反差',
    '7': '颜值',
    '8': '中文',
    '9': '无码',
    '10': '日韩',
    '11': '欧美',
    '12': '动漫',
    '13': '人妻',
    '14': '制服',
    '15': '乱伦',
    '16': '明星',
    '17': '自拍',
    '18': '三级',
    '20': '师生',
};

let host = DEFAULT_HOST;

const http = axios.create({
    timeout: 15_000,
    validateStatus: () => true,
});

function getHeaders(referer) {
    return {
        'User-Agent': UA,
        Referer: referer || `${host}/`,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    };
}

function fixUrl(url) {
    const v = String(url || '').trim();
    if (!v) return '';
    if (v.startsWith('//')) return `https:${v}`;
    if (v.startsWith('/')) return `${host.replace(/\/$/, '')}${v}`;
    if (!v.startsWith('http')) return `${host.replace(/\/$/, '')}/${v.replace(/^\//, '')}`;
    return v;
}

function clean(text) {
    return String(text || '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/\xa0/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
}

function isVideoFormat(url) {
    const v = String(url || '');
    return ['.m3u8', '.mp4', '.flv', '.ts'].some((ext) => v.includes(ext));
}

async function fetchHtml(url) {
    try {
        const resp = await http.get(url, { headers: getHeaders(), responseType: 'text' });
        if (resp.status !== 200) return '';
        return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch {
        return '';
    }
}

function decryptPlayUrl(data) {
    let u = data.url || '';
    const enc = String(data.encrypt ?? '0');

    if (enc === '2') {
        try {
            u = Buffer.from(u, 'base64').toString('utf8');
        } catch {
            /* keep */
        }
    } else if (enc === '1') {
        u = decodeURIComponent(u);
    }

    return u.replace(/\\\//g, '/');
}

function extractPlayUrlFromHtml(html) {
    const playerScript = html.match(/var\s+player_aaaa\s*=\s*(\{[\s\S]*?\})\s*;/);
    if (playerScript) {
        try {
            const data = JSON.parse(playerScript[1]);
            const url = decryptPlayUrl(data);
            if (url) return url.startsWith('/') ? fixUrl(url) : url;
        } catch {
            /* fallback */
        }
    }

    const playerData = html.match(/var\s+player_data\s*=\s*(\{[\s\S]*?\})\s*;/);
    if (playerData) {
        try {
            const data = JSON.parse(playerData[1]);
            const url = data.url || '';
            if (url && isVideoFormat(url)) return url.startsWith('/') ? fixUrl(url) : url;
        } catch {
            /* fallback */
        }
    }

    const nowMatch = html.match(/var\s+now\s*=\s*["']([^"']+)["']/);
    if (nowMatch) {
        const url = fixUrl(nowMatch[1]);
        if (isVideoFormat(url)) return url;
    }

    const m3u8 = html.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/);
    if (m3u8) return m3u8[1];

    const direct = html.match(/(https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*)/);
    if (direct) return direct[1];

    const video = html.match(/<video[^>]+src="([^"]+)"/);
    if (video) return fixUrl(video[1]);

    return '';
}

function parseVideoList(html) {
    const videos = [];
    const seen = new Set();

    const pattern =
        /<a[^>]+href="(\/index\.php\/vod\/play\/id\/(\d+)\/sid\/\d+\/nid\/\d+\.html)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<h3[^>]*class="[^"]*video-item__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/gi;

    let match;
    while ((match = pattern.exec(html)) !== null) {
        const vid = match[2];
        if (seen.has(vid)) continue;
        seen.add(vid);

        const block = match[0];
        const tagMatch = block.match(
            /<span[^>]*class="[^"]*video-item__duration[^"]*"[^>]*>([^<]*)<\/span>/,
        );

        videos.push({
            vod_id: vid,
            vod_name: clean(match[4]),
            vod_pic: fixUrl(match[3]),
            vod_remarks: tagMatch ? clean(tagMatch[1]) : '',
        });
    }

    if (!videos.length) {
        const fallback = /<a[^>]+href="(\/index\.php\/vod\/play\/id\/(\d+)[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        while ((match = fallback.exec(html)) !== null) {
            const vid = match[2];
            if (seen.has(vid)) continue;
            seen.add(vid);

            const block = match[0];
            const img = block.match(/<img[^>]+src="([^"]+)"/);
            const titleMatch = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);

            videos.push({
                vod_id: vid,
                vod_name: titleMatch ? clean(titleMatch[1]) : `视频${vid}`,
                vod_pic: img ? fixUrl(img[1]) : '',
                vod_remarks: '',
            });
        }
    }

    return videos;
}

function extractPageCount(html) {
    const last = html.match(/<a[^>]+href="[^"]*?\/page\/(\d+)\.html"[^>]*>尾页<\/a>/);
    if (last) return parseInt(last[1], 10);

    const nums = [...html.matchAll(/\/page\/(\d+)\.html/g)].map((m) => parseInt(m[1], 10));
    if (nums.length) return Math.max(...nums);
    return null;
}

async function init(inReq, _outResp) {
    const extend = inReq.body?.extend ?? inReq.body?.ext ?? '';
    if (extend && String(extend).startsWith('http')) {
        host = String(extend).replace(/\/$/, '');
    } else if (typeof extend === 'object' && extend?.host) {
        host = String(extend.host).replace(/\/$/, '');
    } else {
        host = DEFAULT_HOST;
    }
    return {};
}

async function home(_inReq, _outResp) {
    const classes = Object.entries(CATEGORIES).map(([type_id, type_name]) => ({
        type_id,
        type_name,
    }));

    const url = `${host}/index.php/vod/type/id/1.html`;
    const html = await fetchHtml(url);

    return {
        class: classes,
        filters: {},
        list: parseVideoList(html),
    };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '1');
    const pg = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);

    const url =
        pg === 1
            ? `${host}/index.php/vod/type/id/${tid}.html`
            : `${host}/index.php/vod/type/id/${tid}/page/${pg}.html`;

    const html = await fetchHtml(url);
    if (!html) {
        return { list: [], page: pg, pagecount: 1, limit: 0, total: 0 };
    }

    const videos = parseVideoList(html);
    const pagecount = extractPageCount(html) || (videos.length >= 20 ? pg + 1 : pg);
    const finalPagecount = Math.max(pagecount, pg);

    return {
        list: videos,
        page: pg,
        pagecount: finalPagecount,
        limit: videos.length,
        total: videos.length ? finalPagecount * videos.length : 0,
    };
}

async function detail(inReq, _outResp) {
    const vid = String(
        Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id || '',
    ).trim();
    const url = `${host}/index.php/vod/play/id/${vid}/sid/1/nid/1.html`;
    const html = await fetchHtml(url);

    if (!html) return { list: [] };

    let title = '';
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    if (h1) title = clean(h1[1]);
    if (!title) {
        const meta = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/);
        if (meta) title = clean(meta[1]);
    }
    if (!title) title = `视频${vid}`;

    let pic = '';
    const img = html.match(/<img[^>]+src="([^"]+)"[^>]*class="[^"]*video-item__image[^"]*"/);
    if (img) pic = fixUrl(img[1]);
    if (!pic) {
        const metaPic = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/);
        if (metaPic) pic = fixUrl(metaPic[1]);
    }

    let desc = '';
    const descMeta = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/);
    if (descMeta) desc = clean(descMeta[1]);

    const playUrl = extractPlayUrlFromHtml(html);

    return {
        list: [
            {
                vod_id: vid,
                vod_name: title,
                vod_pic: pic,
                vod_content: desc,
                vod_play_from: playUrl ? '播放' : '详情页',
                vod_play_url: playUrl ? `正片$${playUrl}` : `正片$${url}`,
            },
        ],
    };
}

async function resolvePlayUrl(id, depth = 0) {
    if (!id || depth > 2) return null;
    if (isVideoFormat(id)) return id;

    const url = id.startsWith('http') ? id : fixUrl(id);
    const html = await fetchHtml(url);
    if (!html) return null;

    const playUrl = extractPlayUrlFromHtml(html);
    if (playUrl && isVideoFormat(playUrl)) return playUrl;

    const iframe = html.match(/<iframe[^>]+src="([^"]+)"/);
    if (iframe) return resolvePlayUrl(fixUrl(iframe[1]), depth + 1);

    return null;
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '').trim();
    const header = { 'User-Agent': UA, Referer: `${host}/` };

    if (!id) return { parse: 1, url: '', header: {} };
    if (isVideoFormat(id)) return { parse: 0, url: id, header };

    const playUrl = await resolvePlayUrl(id);
    if (playUrl) return { parse: 0, url: playUrl, header };

    const url = id.startsWith('http') ? id : fixUrl(id);
    return { parse: 1, url, header: {} };
}

async function search(inReq, _outResp) {
    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    const pg = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);

    if (!key) return { list: [], page: 1 };

    let url = `${host}/index.php/vod/search.html?wd=${encodeURIComponent(key)}`;
    if (pg > 1) url += `&page=${pg}`;

    const html = await fetchHtml(url);
    if (!html) return { list: [], page: pg };

    return { list: parseVideoList(html), page: pg };
}

export default {
    meta: {
        key: 'huoporn',
        name: '🔥HuoPorn',
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
