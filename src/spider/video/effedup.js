import req from '../../util/req.js';

const HOST = 'https://www.effedupmovies.com';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const CHANNELS = [
    { type_id: 'home', type_name: '最新' },
    { type_id: 'american-movies', type_name: '美国' },
    { type_id: 'asian-movies', type_name: '亚洲' },
    { type_id: 'japanese-cinema', type_name: '日本' },
    { type_id: 'korean-cinema', type_name: '韩国' },
    { type_id: 'hong-kong-movies', type_name: '香港' },
    { type_id: 'uk-english-cinema', type_name: '英国' },
    { type_id: 'french-cinema', type_name: '法国' },
    { type_id: 'german-cinema', type_name: '德国' },
    { type_id: 'italian-movies', type_name: '意大利' },
    { type_id: 'spanish-films', type_name: '西班牙' },
    { type_id: 'south-american-cinema', type_name: '拉美' },
    { type_id: 'horror', type_name: '恐怖' },
    { type_id: 'psychological-thrillers', type_name: '惊悚' },
    { type_id: 'real-sex', type_name: '情色' },
    { type_id: 'cult', type_name: 'cult' },
    { type_id: 'movies-based-on-a-true-story', type_name: '真实故事' },
    { type_id: 'documentary', type_name: '纪录片' },
    { type_id: 'torture', type_name: '酷刑' },
    { type_id: 'gore-gruesome-splatter', type_name: '血腥' },
    { type_id: 'serial-killers', type_name: '连环杀手' },
    { type_id: 'zombies', type_name: '丧尸' },
    { type_id: 'vampires-witches', type_name: '吸血鬼' },
];

const SKIP = new Set(['page', 'category', 'tag', 'author', 'wp-admin']);

const HDR = {
    'User-Agent': UA,
    Referer: `${HOST}/`,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
};

function abs(u) {
    if (!u) return '';
    u = String(u).trim().replace(/\\\//g, '/');
    if (u.startsWith('//')) return `https:${u}`;
    if (u.startsWith('/')) return HOST + u;
    return u;
}

function clean(t) {
    return String(t || '')
        .replace(/<[^>]+>/g, '')
        .replace(/&#8217;/g, "'")
        .replace(/&#038;/g, '&')
        .replace(/&amp;/g, '&')
        .replace(/&#8211;/g, '-')
        .replace(/&nbsp;/g, ' ')
        .trim();
}

async function fetchText(url) {
    try {
        const r = await req.get(url, {
            headers: HDR,
            timeout: 20000,
            validateStatus: (s) => s === 200,
        });
        return typeof r.data === 'string' ? r.data : String(r.data || '');
    } catch (e) {
        console.log('[effedup] fetch', url, e.message);
        return '';
    }
}

function parseList(html) {
    const videos = [];
    if (!html) return videos;
    const seen = new Set();
    const titleRe = /<h[23][^>]*>\s*<a[^>]+href="(https?:\/\/www\.effedupmovies\.com\/([^"/]+)\/?)"[^>]*>([^<]+)<\/a>/gi;
    let m;
    while ((m = titleRe.exec(html))) {
        const slug = m[2];
        if (seen.has(slug) || SKIP.has(slug) || /^\d{4}$/.test(slug)) continue;
        seen.add(slug);
        const start = Math.max(0, m.index - 2000);
        const near = html.slice(start, m.index + m[0].length + 300);
        const pm = near.match(/(?:src|data-src|data-lazy-src)="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
        videos.push({
            vod_id: slug,
            vod_name: (clean(m[3]) || slug).slice(0, 120),
            vod_pic: abs(pm ? pm[1] : ''),
            vod_remarks: '',
        });
    }
    if (videos.length < 4) {
        const bm = /href="(https?:\/\/www\.effedupmovies\.com\/([^"/]+)\/?)"[^>]*rel="bookmark"[^>]*>([^<]+)/gi;
        while ((m = bm.exec(html))) {
            const slug = m[2];
            if (seen.has(slug)) continue;
            seen.add(slug);
            videos.push({
                vod_id: slug,
                vod_name: clean(m[3]).slice(0, 120),
                vod_pic: '',
                vod_remarks: '',
            });
        }
    }
    return videos;
}

function listUrl(tid, pg) {
    pg = parseInt(pg, 10) || 1;
    tid = String(tid || 'home');
    if (tid === 'home' || tid === '') {
        return pg <= 1 ? `${HOST}/` : `${HOST}/page/${pg}/`;
    }
    return pg <= 1 ? `${HOST}/category/${tid}/` : `${HOST}/category/${tid}/page/${pg}/`;
}

function extractPlay(html) {
    const parts = [];
    const seen = new Set();
    const text = html || '';
    const m3u8 = text.matchAll(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/gi);
    for (const m of m3u8) {
        const u = m[0].replace(/\\\//g, '/').replace(/[\\'";]+$/, '');
        if (seen.has(u)) continue;
        seen.add(u);
        let label = 'HD';
        if (u.includes('/v2/')) label = 'HD·线路2';
        else if (u.includes('/v1/')) label = 'HD·线路1';
        parts.push(`${label}$${u}`);
    }
    const mp4 = text.matchAll(/https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*/gi);
    for (const m of mp4) {
        const u = m[0].replace(/\\\//g, '/');
        if (seen.has(u) || u.includes('fluidplayer')) continue;
        seen.add(u);
        parts.push(`MP4$${u}`);
    }
    return parts;
}

function playHeader() {
    return { 'User-Agent': UA, Referer: `${HOST}/`, Origin: HOST };
}

async function init() {
    return {};
}

async function home() {
    const html = await fetchText(`${HOST}/`);
    return { class: CHANNELS, filters: {}, list: parseList(html).slice(0, 24) };
}

async function category(inReq) {
    const pg = parseInt(inReq.body.page || inReq.body.pg, 10) || 1;
    const tid = String(inReq.body.id || inReq.body.tid || 'home');
    const videos = parseList(await fetchText(listUrl(tid, pg)));
    return {
        list: videos,
        page: pg,
        pagecount: videos.length >= 10 ? pg + 1 : Math.max(pg, 1),
        limit: 24,
        total: videos.length ? 9999 : 0,
    };
}

async function search(inReq) {
    const key = String(inReq.body.wd || '').trim();
    const pg = parseInt(inReq.body.page || inReq.body.pg, 10) || 1;
    if (!key) return { list: [], page: 1, pagecount: 1 };
    const q = encodeURIComponent(key);
    const url = pg <= 1 ? `${HOST}/?s=${q}` : `${HOST}/page/${pg}/?s=${q}`;
    const videos = parseList(await fetchText(url));
    return {
        list: videos,
        page: pg,
        pagecount: videos.length >= 8 ? pg + 1 : Math.max(pg, 1),
        limit: 24,
        total: videos.length ? 9999 : 0,
    };
}

async function detail(inReq) {
    let slug = inReq.body.id;
    if (Array.isArray(slug)) slug = slug[0];
    slug = String(slug || '').trim().replace(/^\/+|\/+$/g, '');
    if (!slug) return { list: [] };
    let url;
    if (slug.startsWith('http')) {
        url = slug;
        slug = slug.replace(/\/+$/, '').split('/').pop();
    } else {
        url = `${HOST}/${slug}/`;
    }
    const html = await fetchText(url);
    let name = slug;
    let pic = '';
    let desc = '';
    const title = html.match(/<title>([^<]+)<\/title>/i);
    if (title) name = clean(title[1].replace(/\s*[-|].*$/, ''));
    const ogTitle = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)/i);
    if (ogTitle) name = clean(ogTitle[1]);
    const ogImg = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)/i);
    if (ogImg) pic = abs(ogImg[1]);
    const ogDesc = html.match(/property=["']og:description["'][^>]*content=["']([^"']+)/i);
    if (ogDesc) desc = clean(ogDesc[1]).slice(0, 500);
    if (!desc) {
        const meta = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i);
        if (meta) desc = clean(meta[1]).slice(0, 500);
    }
    let playParts = extractPlay(html);
    if (!playParts.length) playParts = [`网页$${url}`];
    return {
        list: [{
            vod_id: slug,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: '',
            vod_content: desc || 'EffedUpMovies 在线观看',
            vod_play_from: 'EffedUp',
            vod_play_url: playParts.slice(0, 8).join('#'),
        }],
    };
}

async function play(inReq) {
    const playUrl = String(inReq.body.id || '').trim();
    const header = playHeader();
    if (/^https?:\/\//i.test(playUrl) && /\.(m3u8|mp4)(\?|$)/i.test(playUrl)) {
        return {
            parse: 0,
            url: playUrl,
            header,
        };
    }
    if (/^https?:\/\//i.test(playUrl)) {
        const parts = extractPlay(await fetchText(playUrl));
        if (parts.length) {
            return { parse: 0, url: parts[0].split('$').pop(), header };
        }
        return { parse: 1, url: playUrl, header };
    }
    const page = `${HOST}/${playUrl.replace(/[^\w-]/g, '')}/`;
    const parts = extractPlay(await fetchText(page));
    if (parts.length) {
        return { parse: 0, url: parts[0].split('$').pop(), header };
    }
    return { parse: 1, url: page, header };
}

export default {
    meta: {
        key: 'effedup',
        name: '🎥EffedUpMovies',
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
