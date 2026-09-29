import axios from 'axios';

/**
 * JavBunny - https://javbunny.com/
 */

const DEFAULT_HOST = 'https://javbunny.com/';
const UA =
    'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const CLASSES = [
    { type_id: 'latest', type_name: '最新' },
    { type_id: 'popular', type_name: '人気' },
    { type_id: 'censored', type_name: '有码' },
    { type_id: 'uncensored', type_name: '无码' },
    { type_id: 'reducing-mosaic', type_name: '无码破解' },
    { type_id: 'tags', type_name: '标签' },
    { type_id: 'categories', type_name: '分类' },
    { type_id: 'models', type_name: '女優' },
    { type_id: 'channels', type_name: '频道' },
    { type_id: 'year', type_name: '日历' },
];

const FILTERS = {
    popular: [
        {
            key: 'dur',
            name: '时间',
            value: [
                { v: '', n: '今天' },
                { v: '7d', n: '本周' },
                { v: '31d', n: '本月' },
                { v: 'all', n: '全部' },
            ],
        },
    ],
    censored: [
        {
            key: 'sort',
            name: '排序',
            value: [
                { v: '', n: '最新' },
                { v: 'views', n: '最热' },
            ],
        },
    ],
    uncensored: [
        {
            key: 'sort',
            name: '排序',
            value: [
                { v: '', n: '最新' },
                { v: 'views', n: '最热' },
            ],
        },
    ],
    'reducing-mosaic': [
        {
            key: 'sort',
            name: '排序',
            value: [
                { v: '', n: '最新' },
                { v: 'views', n: '最热' },
            ],
        },
    ],
    tags: [
        {
            key: 'sort',
            name: '排序',
            value: [
                { v: '', n: '观看数' },
                { v: 'videos', n: '视频数' },
            ],
        },
    ],
    categories: [
        {
            key: 'sort',
            name: '排序',
            value: [
                { v: '', n: '观看数' },
                { v: 'videos', n: '视频数数' },
            ],
        },
    ],
    models: [
        {
            key: 'sort',
            name: '排序',
            value: [
                { v: '', n: '视频数' },
                { v: 'views', n: '观看数' },
                { v: 'az', n: 'A-Z' },
            ],
        },
    ],
    channels: [
        {
            key: 'sort',
            name: '排序',
            value: [
                { v: '', n: '视频数' },
                { v: 'views', n: '观看数' },
            ],
        },
    ],
    year: [
        {
            key: 'year',
            name: '年份',
            value: [
                { v: '2026', n: '2026' },
                { v: '2025', n: '2025' },
                { v: '2024', n: '2024' },
                { v: '2023', n: '2023' },
                { v: '2022', n: '2022' },
                { v: '2021', n: '2021' },
                { v: '2020', n: '2020' },
                { v: '2019', n: '2019' },
                { v: '2018', n: '2018' },
            ],
        },
        {
            key: 'month',
            name: '月份',
            value: [
                { v: '12', n: '12月' },
                { v: '11', n: '11月' },
                { v: '10', n: '10月' },
                { v: '9', n: '9月' },
                { v: '8', n: '8月' },
                { v: '7', n: '7月' },
                { v: '6', n: '6月' },
                { v: '5', n: '5月' },
                { v: '4', n: '4月' },
                { v: '3', n: '3月' },
                { v: '2', n: '2月' },
                { v: '1', n: '1月' },
            ],
        },
    ],
};

let host = DEFAULT_HOST;

const http = axios.create({
    timeout: 15_000,
    validateStatus: () => true,
});

function getHeaders() {
    return {
        'User-Agent': UA,
        Referer: host,
    };
}

function baseUrl() {
    return host.replace(/\/$/, '');
}

function parseExtend(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
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

function clean(text) {
    return String(text || '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function fixImg(img) {
    if (!img) return '';
    if (img.startsWith('/')) return `${baseUrl()}${img}`;
    return img;
}

function parseCards(html) {
    const videos = [];
    const pattern =
        /<a class="card"[^>]*href="(\/video\.php\?slug=[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;

    let match;
    while ((match = pattern.exec(html)) !== null) {
        const href = match[1].replace(/&amp;/g, '&');
        const inner = match[2];

        const vidMatch = href.match(/slug=(\d+)-/);
        const vid = vidMatch ? vidMatch[1] : '';

        let title = '';
        const tm = inner.match(/<h3>([\s\S]*?)<\/h3>/);
        if (tm) title = clean(tm[1]);

        let img = '';
        const im = inner.match(/<img[^>]*src="([^"]+)"/);
        if (im) img = fixImg(im[1]);

        let duration = '';
        const dm = inner.match(/class="duration"[^>]*>([^<]+)</);
        if (dm) duration = dm[1].trim();

        let date = '';
        const dts = [...inner.matchAll(/class="meta"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/g)];
        for (const d of dts.reverse()) {
            if (/\d{4}-\d{2}-\d{2}/.test(d[1])) {
                date = d[1].trim();
                break;
            }
        }

        const remark = [duration, date].filter(Boolean).join(' · ');

        videos.push({
            vod_id: `javbunny@${href}`,
            vod_name: title,
            vod_pic: img,
            vod_remarks: remark,
            vod_duration: duration,
        });
    }

    return videos;
}

function parsePagination(html, pg = 1) {
    let page = Math.max(1, parseInt(pg, 10) || 1);
    let block = '';
    const bm = html.match(/class="pagination"[\s\S]*?<\/div>/);
    if (bm) block = bm[0].replace(/&amp;/g, '&');

    const nums = [];
    const cm = block.match(/class="current"[^>]*>(\d+)</);
    if (cm) nums.push(parseInt(cm[1], 10));
    for (const m of block.matchAll(/[?&]page=(\d+)/g)) {
        nums.push(parseInt(m[1], 10));
    }

    if (!nums.length) return [page, page];
    return [page, Math.max(...nums)];
}

function parseFlord(html, tid, pg = 1) {
    const kindMap = {
        tags: 'tag',
        categories: 'category',
        models: 'model',
        channels: 'channel',
    };
    const kind = kindMap[tid];
    const items = [];

    const pattern =
        /<a class="(?:list-card|model-card|channel-card)"[^>]*href="([^"]*(?:tag|category|model|channel)\.php\?slug=([^&"]+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;

    let match;
    while ((match = pattern.exec(html)) !== null) {
        const slug = match[2];
        const inner = match[3];

        let name = slug;
        const nm = inner.match(/<strong>([\s\S]*?)<\/strong>/);
        if (nm) name = clean(nm[1]) || slug;

        let cnt = '';
        const sm = inner.match(/<span>([\s\S]*?)<\/span>/);
        if (sm) {
            const stxt = clean(sm[1]);
            const cm = stxt.match(/([\d,]+)\s*(videos|影片|视频)/);
            if (cm) cnt = `${cm[1]} ${cm[2]}`;
        }

        let img = '';
        const im = inner.match(/<img[^>]*src="([^"]+)"/);
        if (im) img = fixImg(im[1]);

        items.push({
            vod_id: `javbunny@sub@${kind}@${slug}`,
            vod_name: name,
            vod_pic: img,
            vod_remarks: cnt,
            vod_tag: 'folder',
        });
    }

    const [page, pagecount] = parsePagination(html, pg);
    return {
        list: items,
        page,
        pagecount,
        limit: items.length,
        total: pagecount * Math.max(items.length, 1),
    };
}

function listResult(videos, html, pg) {
    const [page, pagecount] = parsePagination(html, pg);
    return {
        list: videos,
        page,
        pagecount,
        limit: videos.length,
        total: pagecount * Math.max(videos.length, 1),
    };
}

async function init(inReq, _outResp) {
    const extend = inReq.body?.extend ?? inReq.body?.ext ?? '';
    if (extend && String(extend).startsWith('http')) {
        host = String(extend).endsWith('/') ? extend : `${extend}/`;
    } else {
        const cfg = parseExtend(extend);
        if (cfg.host) host = String(cfg.host).endsWith('/') ? cfg.host : `${cfg.host}/`;
        else host = DEFAULT_HOST;
    }
    return {};
}

async function home(_inReq, _outResp) {
    const url = `${baseUrl()}/index.php?view=latest&lang=zh&page=1`;
    const html = await fetchHtml(url);
    return {
        class: CLASSES,
        filters: FILTERS,
        list: parseCards(html),
    };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '');
    const pg = inReq.body.page || inReq.body.pg || 1;
    const extend = parseExtend(inReq.body.extend);

    if (tid.startsWith('javbunny@sub@')) {
        const parts = tid.split('@');
        const kind = parts[2];
        const slug = parts[3];
        const sort = extend.sort || 'views';
        const kindUrl = {
            tag: 'tag.php',
            category: 'category.php',
            model: 'model.php',
            channel: 'channel.php',
        }[kind] || 'tag.php';

        const url = `${baseUrl()}/${kindUrl}?slug=${slug}&lang=zh&sort=${sort}&page=${pg}`;
        const html = await fetchHtml(url);
        return listResult(parseCards(html), html, pg);
    }

    let sort = extend.sort || '';
    if (!sort) sort = 'latest';

    const base = baseUrl();
    let url;

    if (tid === 'latest') {
        url = `${base}/index.php?view=latest&lang=zh&page=${pg}`;
    } else if (tid === 'popular') {
        const dur = extend.dur || '1d';
        url = `${base}/popular.php?t=${dur}&page=${pg}&lang=zh`;
    } else if (['censored', 'uncensored', 'reducing-mosaic'].includes(tid)) {
        url = `${base}/section.php?type=${tid}&sort=${sort}&page=${pg}&lang=zh`;
    } else if (['tags', 'categories', 'models', 'channels'].includes(tid)) {
        const pageMap = {
            tags: `${base}/tags.php?lang=zh&page=${pg}`,
            categories: `${base}/categories.php?lang=zh&page=${pg}`,
            models: `${base}/models.php?lang=zh&page=${pg}`,
            channels: `${base}/channels.php?lang=zh&page=${pg}`,
        };
        const html = await fetchHtml(pageMap[tid]);
        return parseFlord(html, tid, pg);
    } else if (tid === 'year') {
        const year = extend.year || '2018';
        const month = extend.month || '9';
        url = `${base}/month.php?year=${year}&month=${month}&sort=${sort}&page=${pg}&lang=zh`;
    } else {
        return { list: [], page: parseInt(pg, 10) || 1, pagecount: 0, limit: 0, total: 0 };
    }

    const html = await fetchHtml(url);
    return listResult(parseCards(html), html, pg);
}

async function detail(inReq, _outResp) {
    let raw = String(
        Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id || '',
    ).trim();

    if (raw.includes('@')) raw = raw.split('@').slice(1).join('@');
    raw = raw.replace(/&amp;/g, '&');

    let url;
    if (raw.startsWith('http')) url = raw;
    else if (raw.startsWith('/')) url = `${baseUrl()}${raw}`;
    else url = `${baseUrl()}/${raw}`;

    const html = await fetchHtml(url);

    let title = '';
    const tm = html.match(/<title>([\s\S]*?)- JavBunny/);
    if (tm) title = tm[1].trim();

    let pic = '';
    const im = html.match(/property="og:image" content="([^"]+)"/);
    if (im) pic = im[1];

    const videos = [];
    for (const sm of html.matchAll(/<source[^>]*src="([^"]+\.mp4[^"]*)"/g)) {
        let src = sm[1];
        if (src.startsWith('//')) src = `https:${src}`;
        videos.push(src);
    }

    const vodId = url.includes('javbunny.com/')
        ? `javbunny@${url.split('javbunny.com/')[1]}`
        : raw;

    return {
        list: [
            {
                vod_id: vodId,
                vod_name: title,
                vod_pic: pic,
                vod_content: '',
                vod_play_from: 'JavBunny',
                vod_play_url: videos.join('#'),
            },
        ],
    };
}

async function play(inReq, _outResp) {
    let url = String(inReq.body.id || '').trim();
    if (url.startsWith('//')) url = `https:${url}`;

    return {
        parse: 0,
        playUrl: '',
        url,
        header: getHeaders(),
    };
}

async function search(inReq, _outResp) {
    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    const pg = inReq.body.page || inReq.body.pg || 1;

    if (!key) {
        return { list: [], page: 1, pagecount: 0, limit: 0, total: 0 };
    }

    const url = `${baseUrl()}/search.php?q=${encodeURIComponent(key)}&page=${pg}&lang=zh`;
    const html = await fetchHtml(url);
    return listResult(parseCards(html), html, pg);
}

export default {
    meta: {
        key: 'javbunny',
        name: '🌸JavBunny',
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
