import axios from 'axios';
import { load } from 'cheerio';
import https from 'https';

const host = 'https://www.naughtymachinima.com';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CLASS_MAP = {
    popular: '热门',
    latest: '最新',
};

const headers = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: host,
};

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const http = axios.create({
    timeout: 15000,
    httpsAgent,
    validateStatus: () => true,
    headers,
});

function fixUrl(url) {
    if (!url) return '';
    url = url.trim();
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return host + url;
    if (!url.startsWith('http')) return `${host}/${url}`;
    return url;
}

async function fetchHtml(url) {
    try {
        const r = await http.get(url, { headers, timeout: 15000 });
        return typeof r.data === 'string' ? r.data : String(r.data || '');
    } catch {
        return '';
    }
}

function parseVideoList(html) {
    const $ = load(html);
    const videos = [];
    const seen = new Set();

    $('a[href^="/video/"]').each((_, el) => {
        try {
            const a = $(el);
            if (!a.find('div.thumb-overlay').length) return;

            const videoUrl = a.attr('href') || '';
            if (!videoUrl || seen.has(videoUrl)) return;
            seen.add(videoUrl);

            const vidMatch = videoUrl.match(/\/video\/(\d+)\//);
            if (!vidMatch) return;
            const vid = vidMatch[1];

            let title = a.attr('title') || '';
            const img = a.find('img').first();
            if (!title && img.length) {
                title = img.attr('title') || img.attr('alt') || '';
            }

            let pic = img.attr('src') || '';
            if (pic.startsWith('//')) pic = 'https:' + pic;

            const duration = a.find('div.duration').first().text().trim();
            const parentDiv = a.parent();
            const outerDiv = parentDiv.parent();
            const contentInfo = outerDiv.find('div.content-info').first();
            let viewsText = '';
            if (contentInfo.length) {
                viewsText = contentInfo.find('span.content-views').first().text().trim();
            }
            let remark = duration;
            if (viewsText) remark += ' | ' + viewsText;

            videos.push({
                vod_id: vid,
                vod_name: title,
                vod_pic: pic,
                vod_remarks: remark,
            });
        } catch {
            /* skip */
        }
    });

    return videos;
}

function extractVideo(html) {
    let m = html.match(/<video[^>]+src=["']([^"']+)["']/i);
    if (m) return fixUrl(m[1]);

    m = html.match(/<source[^>]+src=["']([^"']+)["']/i);
    if (m) return fixUrl(m[1]);

    m = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (m) return fixUrl(m[1]);

    const patterns = [
        /(?:video|file|source|url)\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4|webm))["']/i,
        /"video"\s*:\s*["']([^"']+)["']/i,
        /"url"\s*:\s*["']([^"']+)["']/i,
    ];
    for (const pat of patterns) {
        m = html.match(pat);
        if (m) return fixUrl(m[1]);
    }

    m = html.match(/(https?:\/\/[^\s"']+\.(?:m3u8|mp4)[^\s"']*)/i);
    if (m) return fixUrl(m[1]);

    return '';
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    return {
        class: Object.entries(CLASS_MAP).map(([type_id, type_name]) => ({
            type_id,
            type_name,
        })),
    };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || 'popular');
    const pg = parseInt(inReq.body.page, 10) || 1;

    let baseUrl;
    if (tid === 'popular') baseUrl = `${host}/videos?o=bw`;
    else if (tid === 'latest') baseUrl = `${host}/videos`;
    else return { list: [], page: pg, pagecount: 1, limit: 0, total: 0 };

    const url =
        pg > 1
            ? baseUrl + (baseUrl.includes('?') ? `&page=${pg}` : `?page=${pg}`)
            : baseUrl;

    const html = await fetchHtml(url);
    if (!html) {
        return { list: [], page: pg, pagecount: 1, limit: 0, total: 0 };
    }

    const videos = parseVideoList(html);
    const pagecount = videos.length >= 20 ? pg + 1 : pg;
    return {
        list: videos,
        page: pg,
        pagecount,
        limit: videos.length,
        total: pagecount * 20,
    };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg = parseInt(inReq.body.pg || inReq.body.page, 10) || 1;
    const url = `${host}/search/videos?search_query=${encodeURIComponent(key)}&page=${pg}`;
    const html = await fetchHtml(url);
    if (!html) {
        return { list: [], page: pg, pagecount: 1, limit: 0, total: 0 };
    }
    const videos = parseVideoList(html);
    const pagecount = videos.length >= 20 ? pg + 1 : pg;
    return {
        list: videos,
        page: pg,
        pagecount,
        limit: videos.length,
        total: pagecount * 20,
    };
}

async function detail(inReq, _outResp) {
    const vid = inReq.body.id || '';
    if (!vid) return { list: [] };

    const url = `${host}/video/${vid}`;
    const html = await fetchHtml(url);
    if (!html) return { list: [] };

    const $ = load(html);
    let title = $('h1').first().text().trim();
    if (!title) title = $('meta[property="og:title"]').attr('content') || '';

    let pic =
        $('img.img-responsive').attr('src') ||
        $('video').attr('poster') ||
        $('video').attr('src') ||
        '';
    if (!pic) pic = $('img').first().attr('src') || '';
    if (pic.startsWith('//')) pic = 'https:' + pic;

    const desc = $('meta[name="description"]').attr('content') || '';
    const playUrl = extractVideo(html);
    const vodPlayUrl = playUrl ? `播放$${playUrl}` : `详情页$${url}`;

    return {
        list: [
            {
                vod_id: vid,
                vod_name: title || '未知视频',
                vod_pic: pic,
                vod_content: desc,
                vod_play_from: 'NaughtyMachinima',
                vod_play_url: vodPlayUrl,
            },
        ],
    };
}

async function play(inReq, _outResp) {
    let id = inReq.body.id || '';
    if (!id) return { parse: 1, url: '', header: {} };

    if (id.includes('$')) {
        const parts = id.split('$');
        id = parts[parts.length - 1];
    }

    const playHeader = {
        'User-Agent': 'Mozilla/5.0',
        Referer: host,
    };

    if (/\.(m3u8|mp4|webm|flv)/i.test(id)) {
        return { parse: 0, url: id, header: playHeader };
    }

    if (!id.startsWith('http')) id = fixUrl(id);
    return { parse: 1, url: id, header: playHeader };
}

export default {
    meta: {
        key: 'naughtymachinima',
        name: '🔥NaughtyMachinima',
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
