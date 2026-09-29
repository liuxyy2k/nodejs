import axios from 'axios';
import https from 'https';

/**
 * KissJAV - https://kissjav.li
 * SD/HD base64 直链 + 封面 proxy
 */

const host = 'https://kissjav.li';
const picHost = 'https://assets6.cdnhop.com';
const UA =
    'Mozilla/5.0 (Linux; Android 11; SAMSUNG SM-G973U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.141 Mobile Safari/537.36';

const CLASSES = [
    { type_id: 'latest-updates', type_name: 'Latest' },
    { type_id: 'most-popular/?sort_by=video_viewed', type_name: 'Most Viewed' },
    { type_id: 'categories/korean-porn', type_name: 'Korean Porn' },
    { type_id: 'categories/korean-bj', type_name: 'Korean BJ' },
    { type_id: 'categories/vip', type_name: 'KVIP' },
    { type_id: 'categories/jvip', type_name: 'JVIP' },
    { type_id: 'categories/fc2ppv', type_name: 'FC2PPV' },
    { type_id: 'categories/uncensored', type_name: 'Uncensored' },
    { type_id: 'categories/hentai', type_name: 'Hentai' },
];

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const http = axios.create({
    timeout: 15_000,
    httpsAgent,
    validateStatus: () => true,
});

function getHeaders(extra = {}) {
    return {
        'User-Agent': UA,
        Referer: `${host}/`,
        Origin: host,
        ...extra,
    };
}

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/kissjav/3';
    const hostHeader = inReq?.headers?.['x-forwarded-host'] || inReq?.headers?.host;
    if (hostHeader) {
        const proto = inReq?.headers?.['x-forwarded-proto'] || 'http';
        return `${proto}://${hostHeader}${prefix}/proxy`;
    }
    const port = process.env.DEV_HTTP_PORT || 9988;
    return `http://127.0.0.1:${port}${prefix}/proxy`;
}

function proxyImg(url, inReq) {
    const fixed = fixUrl(url);
    if (!fixed) return '';
    if (!fixed.startsWith('http')) return fixed;
    return `${getProxyBase(inReq)}?url=${encodeURIComponent(fixed)}`;
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

function match(text, rule) {
    const m = new RegExp(rule, 's').exec(text || '');
    return m ? m[1] : '';
}

function clean(text) {
    return String(text || '')
        .replace(/<.*?>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function fixUrl(url) {
    if (!url) return '';
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) return host + url;
    return url;
}

function realPic(vid) {
    if (!vid) return '';
    const iv = parseInt(vid, 10);
    if (Number.isNaN(iv)) return '';
    const base = String(Math.floor(iv / 1000) * 1000);
    return `${picHost}/contents/videos_screenshots/${base}/${vid}/320x180/1.jpg`;
}

function decodeVideoUrl(url) {
    if (!url || url === 'MQ==') return '';
    if (url.startsWith('http')) return url;
    try {
        return Buffer.from(url, 'base64').toString('utf8');
    } catch {
        return url;
    }
}

function isVideoFormat(url) {
    return /\.(m3u8|mp4|flv|avi|mkv|mov|ts)(\?|$)|\/get_file\//i.test(url || '');
}

function buildCategoryUrl(tid, pg) {
    const path = String(tid || 'latest-updates').replace(/^\/|\/$/g, '');
    const page = String(pg || 1);
    if (path.includes('?')) {
        return page === '1' ? `${host}/${path}` : `${host}/${path}&page=${page}`;
    }
    return page === '1' ? `${host}/${path}/` : `${host}/${path}/${page}/`;
}

function parseList(html, inReq) {
    const res = [];
    const seen = new Set();

    const primaryRe =
        /<a\s+href=["'](https?:\/\/kissjav\.li\/video\/([^/]+)\/[^"']*)["']\s+title=["']([^"']+)["']/gs;

    for (const m of html.matchAll(primaryRe)) {
        const url = m[1];
        const vid = m[2];
        if (seen.has(url)) continue;
        seen.add(url);

        const start = m.index;
        const nextIdx = html.indexOf('<a href="https://kissjav.li/video/', m.index + m[0].length);
        const end = nextIdx > start ? nextIdx : Math.min(html.length, m.index + m[0].length + 1600);
        const item = html.slice(start, end);

        let name = clean(m[3]);
        let pic =
            match(item, '(?:data-original|data-webp|data-src)=["\']([^"\']+)["\']') ||
            match(item, 'src=["\']([^"\']+)["\']') ||
            realPic(vid);

        if (pic.includes('data:image') || pic.includes('load.gif') || pic.includes('logo')) {
            pic = realPic(vid);
        }

        const remarks = clean(match(item, '<div[^>]+class=["\'][^"\']*time[^"\']*["\'][^>]*>(.*?)</div>') || vid);

        if (name) {
            res.push({
                vod_id: url,
                vod_name: name,
                vod_pic: proxyImg(pic, inReq),
                vod_remarks: remarks,
            });
        }
    }

    if (res.length) return res;

    const fallbackRe =
        /href=["'](https?:\/\/kissjav\.li\/video\/([^/]+)\/[^"']*)["'][^>]*title=["']([^"']+)["']/gs;

    for (const m of html.matchAll(fallbackRe)) {
        const url = m[1];
        const vid = m[2];
        if (seen.has(url)) continue;
        seen.add(url);
        res.push({
            vod_id: url,
            vod_name: clean(m[3]),
            vod_pic: proxyImg(realPic(vid), inReq),
            vod_remarks: vid,
        });
    }

    return res;
}

function extractEpisodes(html) {
    const eps = [];
    const re = /(video_url(?:_hd)?):\s*['"]([^'"]+)/g;
    for (const m of html.matchAll(re)) {
        const key = m[1].includes('_hd') ? 'HD' : 'SD';
        const url = decodeVideoUrl(m[2]);
        if (url) eps.push(`${key}$${url}`);
    }
    return eps;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(inReq, _outResp) {
    const html = await fetchText(`${host}/`);
    const list = html ? parseList(html, inReq) : [];
    return { class: CLASSES, filters: {}, list };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id || 'latest-updates';
    const pg = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const url = buildCategoryUrl(tid, pg);
    const html = await fetchText(url);

    return {
        page: pg,
        pagecount: 999,
        limit: 30,
        total: 999999,
        list: html ? parseList(html, inReq) : [],
    };
}

async function detail(inReq, _outResp) {
    const vid = String(inReq.body.id || '');
    const html = await fetchText(vid);
    if (!html) return { list: [] };

    const sid = match(vid, '/video/(\\d+)/');
    const name = clean(
        match(html, '<meta property="og:title" content="(.*?)"') ||
            match(html, "video_title:\\s*['\"]([^'\"]+)"),
    );
    let pic =
        match(html, '<meta property="og:image" content="(.*?)"') ||
        match(html, "preview_url:\\s*['\"]([^'\"]+)") ||
        realPic(sid);
    pic = proxyImg(pic, inReq);

    const desc = clean(match(html, '<meta property="og:description" content="(.*?)"'));
    const cate = clean(match(html, "video_categories:\\s*['\"]([^'\"]*)"));
    const remarks = clean(match(html, '<meta property="video:duration" content="(.*?)"'));

    let eps = extractEpisodes(html);
    if (!eps.length) {
        const em =
            match(html, 'embedUrl"\\s*:\\s*"(.*?)"') ||
            match(html, 'src="(https://kissjav\\.li/embed/[^"]+)');
        if (em) eps.push(`播放$${em}`);
    }

    if (!eps.length) return { list: [] };

    return {
        list: [
            {
                vod_id: vid,
                vod_name: name,
                vod_pic: pic,
                vod_remarks: remarks,
                type_name: cate,
                vod_year: '',
                vod_area: '',
                vod_lang: '',
                vod_actor: '',
                vod_director: '',
                vod_content: desc,
                vod_play_from: 'KissJAV',
                vod_play_url: eps.join('#'),
            },
        ],
    };
}

async function play(inReq, _outResp) {
    let url = String(inReq.body.id || '');

    if (url.includes('/embed/')) {
        const html = await fetchText(url);
        let u = match(html, "(?:video_url(?:_hd)?|file)\\s*[:=]\\s*['\"]([^'\"]+)");
        if (u) {
            u = u.startsWith('http') ? u : decodeVideoUrl(u);
            url = u;
        }
    }

    return {
        parse: isVideoFormat(url) ? 0 : 1,
        url,
        header: getHeaders(),
    };
}

async function search(inReq, _outResp) {
    const key = encodeURIComponent(inReq.body.wd || '');
    const pg = parseInt(inReq.body.pg || inReq.body.page || 1, 10) || 1;
    const url =
        pg === 1 ? `${host}/search/${key}/` : `${host}/search/${key}/${pg}/`;
    const html = await fetchText(url);

    return {
        list: html ? parseList(html, inReq) : [],
        page: pg,
    };
}

async function proxyHandler(inReq, outResp) {
    let url = inReq.query.url || inReq.query.img || inReq.query.pic || '';
    if (Array.isArray(url)) url = url[0] || '';
    url = decodeURIComponent(url || '');
    if (!url) return outResp.code(404).type('text/plain').send('');

    try {
        const resp = await http.get(url, {
            headers: getHeaders({
                Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            }),
            responseType: 'arraybuffer',
        });
        if (resp.status === 200 && resp.data?.byteLength) {
            const ct = resp.headers['content-type'] || 'image/jpeg';
            return outResp.type(ct).send(Buffer.from(resp.data));
        }
    } catch {
        /* ignore */
    }
    return outResp.code(404).type('text/plain').send('');
}

export default {
    meta: {
        key: 'kissjav',
        name: '🌸KissJAV',
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
