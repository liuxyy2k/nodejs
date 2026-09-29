import axios from 'axios';
import https from 'https';

/**
 * ParadiseHill - https://en.paradisehill.cc
 * 影片列表 / 演员·工作室·分类 folder / 搜索 / 图片代理
 */

const DEFAULT_HOST = 'https://en.paradisehill.cc';
const PORT = process.env.DEV_HTTP_PORT || 9988;
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const SKIP_HREFS = new Set([
    '/',
    '/porn/',
    '/all/',
    '/categories/',
    '/actors/',
    '/studios/',
    '/news/',
    '/orders/',
    '/popular/',
]);

const CLASSES = [
    { type_name: 'All films', type_id: 'all' },
    { type_name: 'Popular', type_id: 'popular' },
    { type_name: 'Actors', type_id: 'actor' },
    { type_name: 'Studios', type_id: 'studio' },
    { type_name: 'Categories', type_id: 'category' },
];

const FILTERS = {
    all: [
        {
            key: 'sort',
            name: '排序',
            value: [
                { n: '全部', v: '' },
                { n: '最新', v: 'release' },
                { n: '最热', v: 'title_en' },
            ],
        },
    ],
    popular: [
        {
            key: 'filter',
            name: '时间',
            value: [
                { n: '全部', v: '' },
                { n: '今年', v: 'year' },
                { n: '本月', v: 'month' },
                { n: '本周', v: 'week' },
                { n: '今日', v: 'day' },
            ],
        },
        {
            key: 'sort',
            name: '热度',
            value: [
                { n: '按喜欢', v: '' },
                { n: '按浏览', v: 'by_views' },
                { n: '按评论', v: 'by_comment' },
            ],
        },
    ],
    actor: [
        {
            key: 'sort',
            name: '排序',
            value: [
                { n: '最热', v: '' },
                { n: '名称', v: 'name' },
            ],
        },
    ],
    studio: [
        {
            key: 'sort',
            name: '排序',
            value: [
                { n: '最热', v: '' },
                { n: '名称', v: 'title' },
                { n: '作品数', v: 'by_films' },
            ],
        },
    ],
    category: [
        {
            key: 'sort',
            name: '排序',
            value: [
                { n: '名称', v: '' },
                { n: '最热', v: 'by_likes' },
            ],
        },
    ],
};

let host = DEFAULT_HOST;

const http = axios.create({
    timeout: 15_000,
    validateStatus: () => true,
});

function getHeaders(referer) {
    return {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: referer || `${host}/`,
    };
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

function absUrl(url) {
    const u = String(url || '').trim();
    if (!u) return '';
    if (u.startsWith('http')) return u;
    if (u.startsWith('//')) return `https:${u}`;
    return `${host.replace(/\/$/, '')}/${u.replace(/^\//, '')}`;
}

function proxyImg(url) {
    if (!url) return '';
    return `http://127.0.0.1:${PORT}/spider/paradisehill/3/img?url=${encodeURIComponent(url)}`;
}

function listResult(list, pg) {
    return {
        list,
        page: pg,
        pagecount: 9999,
        limit: 18,
        total: 99999,
    };
}

async function fetchHtml(url) {
    try {
        const resp = await http.get(url, {
            headers: getHeaders(),
            responseType: 'text',
        });
        if (resp.status !== 200) return '';
        return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch (e) {
        console.log('[ph] 请求失败:', url, e.message);
        return '';
    }
}

function parseFilms(html) {
    const items = [];
    const blocks = html.match(/<div class="item list-film-item".*?<\/div>\s*<\/div>/gis) || [];

    for (const block of blocks) {
        const a = block.match(/<a href="([^"]+)"/i);
        if (!a) continue;

        const href = a[1];
        if (!/^\/[A-Za-z0-9_-]+\/$/.test(href)) continue;
        if (SKIP_HREFS.has(href)) continue;

        const name = block.match(/<span itemprop="name">([^<]+)<\/span>/i);
        if (!name) continue;

        let pic = '';
        const img = block.match(/<img[^>]*src="([^"]+)"/i);
        if (img) {
            pic = img[1].startsWith('/') ? host + img[1] : img[1];
            pic = proxyImg(pic);
        }

        items.push({
            vod_id: href,
            vod_name: name[1].trim(),
            vod_pic: pic,
            vod_remarks: '',
            style: { type: 'rect', ratio: 1.33 },
        });
    }
    return items;
}

function parseChannelCards(html, kind) {
    const items = [];
    const re = /<div class="item"[^>]*>\s*<a [^>]*href="([^"]+)"(.*?)<\/a>\s*<\/div>/gis;

    for (const m of html.matchAll(re)) {
        const href = m[1];
        const inner = m[2];
        if (!/\/(actor|studio|category)\//.test(href)) continue;

        let title = '';
        const t1 = inner.match(/itemprop="name"[^>]*>\s*<span>([^<]+)<\/span>/is);
        const t2 = inner.match(/<div><span>([^<]+)<\/span><\/div>/is);
        if (t1) title = t1[1].trim();
        else if (t2) title = t2[1].trim();
        else title = href.replace(/^\/+|\/+$/g, '').split('/').pop();

        let pic = '';
        const img = inner.match(/<img[^>]*src="([^"]+)"/i);
        if (img) {
            pic = img[1].startsWith('/') ? host + img[1] : img[1];
            pic = proxyImg(pic);
        }

        const path = href.split('?')[0].replace(/^\/+|\/+$/g, '');
        const sub = path.split('/').pop();

        items.push({
            vod_id: `${kind}|${sub}@`,
            vod_name: title,
            vod_pic: pic,
            vod_tag: 'folder',
            style: { type: 'rect', ratio: 1.33 },
        });
    }
    return items;
}

async function homeVideoContent() {
    const html = await fetchHtml(`${host}/porn/`);
    return listResult(parseFilms(html), 1);
}

async function folderContent(tid, pg) {
    const raw = String(tid).replace(/@+$/, '');
    const sep = raw.indexOf('|');
    const kind = sep >= 0 ? raw.slice(0, sep) : raw;
    const sub = sep >= 0 ? raw.slice(sep + 1) : '';
    const url =
        `${host}/${kind}/${sub}/?sort=created_at` + (pg > 1 ? `&page=${pg}` : '');
    const html = await fetchHtml(url);
    return listResult(parseFilms(html), pg);
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    try {
        const d = await homeVideoContent();
        return {
            class: CLASSES,
            filters: FILTERS,
            type: '视频',
            list: d.list,
        };
    } catch {
        return { class: CLASSES, filters: FILTERS, type: '视频', list: [] };
    }
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '').trim();
    const pg = Math.max(1, parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1);
    const extend = parseExtend(inReq.body);

    if (tid === 'home') return homeVideoContent();

    if (tid === 'all' || tid === 'orders') {
        const sort = extend.sort !== undefined ? extend.sort : 'created_at';
        let url = `${host}/${tid}/?sort=${encodeURIComponent(sort)}`;
        if (pg > 1) url += `&page=${pg}`;
        const html = await fetchHtml(url);
        return listResult(parseFilms(html), pg);
    }

    if (tid === 'popular') {
        const pf = extend.filter !== undefined ? extend.filter : 'all';
        const ps = extend.sort !== undefined ? extend.sort : 'by_likes';
        let url = `${host}/popular/?filter=${encodeURIComponent(pf)}&sort=${encodeURIComponent(ps)}`;
        if (pg > 1) url += `&page=${pg}`;
        const html = await fetchHtml(url);
        return listResult(parseFilms(html), pg);
    }

    if (tid.includes('@')) return folderContent(tid, pg);

    if (tid === 'actor' || tid === 'studio' || tid === 'category') {
        const defaultSort = 'by_likes';
        const sort = extend.sort !== undefined ? extend.sort : defaultSort;
        const entryUrl = { actor: '/actors/', studio: '/studios/', category: '/categories/' }[tid];
        let url = `${host}${entryUrl}?sort=${encodeURIComponent(sort)}`;
        if (pg > 1) url += `&page=${pg}`;
        const html = await fetchHtml(url);
        return listResult(parseChannelCards(html, tid), pg);
    }

    return { list: [], page: pg, pagecount: 0, limit: 18, total: 0 };
}

async function detail(inReq, _outResp) {
    try {
        let vid = Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id;
        vid = String(vid || '').trim();
        if (!vid) return { list: [] };

        const url = vid.startsWith('http') ? vid : absUrl(vid);
        const html = await fetchHtml(url);

        const name = html.match(/<h1 class="title-inside" itemprop="name">([^<]+)<\/h1>/i);
        let img = html.match(/<meta itemprop="image"[^>]*content="([^"]+)"/i);
        if (!img) img = html.match(/<img[^>]*itemprop="image"[^>]*src="([^"]+)"/i);

        let vodPlayUrl = '';
        const vm = html.match(/var videoList\s*=\s*(\[.*?\])\s*;/is);
        if (vm) {
            const arrTxt = vm[1];
            let srcs = [...arrTxt.matchAll(/"src"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
            if (!srcs.length) {
                srcs = arrTxt.match(/https?:\/\/[^\s"\\]+\.mp4/g) || [];
            }
            const urls = srcs.map((s, i) => {
                const src = s.replace(/\\\//g, '/');
                return `Part ${i + 1}$${src}`;
            });
            vodPlayUrl = urls.join('#');
        }

        const title = name ? name[1].trim() : '未知';
        let pic = '';
        if (img) {
            pic = img[1].replace(/\\\//g, '/');
            if (pic.startsWith('/')) pic = host + pic;
            pic = proxyImg(pic);
        }

        return {
            list: [
                {
                    vod_id: vid,
                    vod_name: title,
                    vod_pic: pic,
                    vod_content: '',
                    vod_play_from: 'ParadiseHill',
                    vod_play_url: vodPlayUrl,
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
    if (!key) return { list: [], page: pg, pagecount: 0, limit: 18, total: 0 };

    const url =
        `${host}/search/?pattern=${encodeURIComponent(key)}&what=1&page=${pg}`;
    const html = await fetchHtml(url);
    return listResult(parseFilms(html), pg);
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '').trim();
    let referer = `${host}/`;
    try {
        const u = new URL(id);
        referer = `${u.protocol}//${u.host}/`;
    } catch {
        /* keep default */
    }
    return {
        parse: 0,
        jx: 0,
        playUrl: '',
        url: id,
        header: {
            'User-Agent': UA,
            Referer: referer,
        },
    };
}

async function imgProxy(inReq, reply) {
    try {
        let imgUrl = inReq.query.url || '';
        if (!imgUrl) return reply.code(400).send('missing url');
        try {
            imgUrl = decodeURIComponent(imgUrl);
        } catch {
            /* keep */
        }

        const parsed = new URL(imgUrl);
        const resp = await http.get(imgUrl, {
            headers: {
                'User-Agent': UA,
                Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
                Referer: `${parsed.protocol}//${parsed.host}/`,
            },
            responseType: 'arraybuffer',
        });

        if (resp.status !== 200) return reply.code(404).send('image not found');

        const data = Buffer.from(resp.data);
        if (data[0] === 0xff && data[1] === 0xd8) {
            return reply.header('Content-Type', 'image/jpeg').header('Content-Length', data.length).send(data);
        }
        if (data[0] === 0x89 && data[1] === 0x50) {
            return reply.header('Content-Type', 'image/png').header('Content-Length', data.length).send(data);
        }
        if (data.slice(0, 4).toString() === 'RIFF' && data.slice(8, 12).toString() === 'WEBP') {
            return reply.header('Content-Type', 'image/webp').header('Content-Length', data.length).send(data);
        }

        const mime = resp.headers['content-type'] || '';
        if (mime.startsWith('image/')) {
            return reply.header('Content-Type', mime).header('Content-Length', data.length).send(data);
        }
        return reply.code(404).send('invalid image format');
    } catch {
        return reply.code(500).send('proxy error');
    }
}

export default {
    meta: {
        key: 'paradisehill',
        name: '🌸ParadiseHill',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/img', imgProxy);
    },
};
