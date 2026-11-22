import crypto from 'crypto';
import { load } from 'cheerio';
import req from '../../util/req.js';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

/**
 * 91视频 · 91spx.com
 * 分类 /videos/category/{slug}/  排序 /videos/sort/{key}/
 * 播放页动态脚本里的 m3u8，分片 AES-128
 */

const PORT   = process.env.DEV_HTTP_PORT || 9988;

const SITE = 'https://91spx.com';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const SORTS = [
    { n: '最近更新', v: 'renew' },
    { n: '当前最热', v: 'hot' },
    { n: '本月最热', v: 'month_hot' },
    { n: '10分钟以上', v: 'ten_minutes' },
    { n: '本月讨论', v: 'month_comment' },
    { n: '收藏最多', v: 'favorite' },
];

const SORT_CLASSES = [
    { type_id: 'sort/renew', type_name: '最近更新' },
    { type_id: 'sort/hot', type_name: '当前最热' },
    { type_id: 'sort/month_hot', type_name: '本月最热' },
    { type_id: 'sort/ten_minutes', type_name: '10分钟以上' },
    { type_id: 'sort/month_comment', type_name: '本月讨论' },
    { type_id: 'sort/favorite', type_name: '收藏最多' },
];

function headers(referer) {
    return {
        'User-Agent': UA,
        Referer: referer || `${SITE}/`,
        Accept: 'text/html,application/xhtml+xml,application/json,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    };
}

function pageHeaders(referer, extra = {}) {
    return {
        'User-Agent': UA,
        Referer: referer || `${SITE}/`,
        Origin: SITE,
        Accept: '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        ...extra,
    };
}

async function fetchText(url) {
    const resp = await req.get(url, {
        headers: headers(),
        timeout: 20000,
        responseType: 'text',
        validateStatus: () => true,
    });
    if (resp.status >= 400) return '';
    return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
}

function absUrl(href) {
    if (!href) return '';
    try {
        return new URL(href, SITE).href;
    } catch {
        return '';
    }
}

function parseExt(extend) {
    if (!extend) return {};
    if (typeof extend === 'string') {
        try {
            return JSON.parse(extend);
        } catch {
            return {};
        }
    }
    return typeof extend === 'object' ? extend : {};
}

function buildListUrl(tid, page, sort) {
    const id = String(tid || 'sort/renew').replace(/^\/+|\/+$/g, '');
    let path = 'sort/renew';
    if (sort && sort !== 'renew') path = `sort/${sort}`;
    else if (id.startsWith('category/') || id.startsWith('sort/') || id.startsWith('tag/')) path = id;
    const base = `${SITE}/videos/${path}/`;
    return page > 1 ? `${base}${page}/` : base;
}

function e64(s) {
    try { return Buffer.from(s || '').toString('base64'); } catch { return ''; }
}

function d64(s) {
    try { return Buffer.from(s || '', 'base64').toString('utf-8'); } catch { return ''; }
}

function proxyImgUrl(raw) {
    return `http://127.0.0.1:${PORT}/spider/spx91/3/img?url=${encodeURIComponent(e64(raw))}`;
}

function aesDecrypt(buf) {
    const key      = Buffer.from('f5d965df75336270');
    const iv       = Buffer.from('97b60394abc2fbe1');
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    return Buffer.concat([decipher.update(buf), decipher.final()]);
}

async function csrfToken(url) {
    await req.loadCookies();
    const cookie = await req.getCookieJar().getCookieString(url);
    const m = String(cookie || '').match(/csrftoken=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
}



function parseList(html, inReq) {
    const $ = load(html || '');
    const list = [];
    $('.video-item').each((_, el) => {
        const href = $(el).find('a').first().attr('href');
        const name = $(el).find('h2').text().replace(/\s+/g, ' ').trim();
        const img = $(el).find('img').first().attr('data-src');
        const dur = $(el).find('.poster .rounded-large').first().text().replace(/\s+/g, ' ').trim();
        list.push({
            vod_id: href,
            vod_name: name,
            vod_pic: proxyImgUrl(img),
            vod_remarks: dur,
        });
    });
    return list;
}

function parsePageCount(html, page) {
    const $ = load(html || '');
    const total = parseInt($('.dx-pager').attr('data-rec-total') || '0', 10) || 0;
    const per = parseInt($('.dx-pager').attr('data-rec-per-page') || '24', 10) || 24;
    if (total > 0) return Math.max(1, Math.ceil(total / per));
    const next = $('link[rel="next"]').attr('href');
    return next ? page + 1 : page;
}

function parseCategories(html) {
    const $ = load(html || '');
    const list = [];
    const seen = new Set();
    $('a[data-navigation_name]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/\/videos\/category\/([^/]+)\/?/);
        if (!m || seen.has(m[1])) return;
        seen.add(m[1]);
        const name = String($(el).attr('data-navigation_name') || '').trim();
        if (!name) return;
        list.push({ type_id: `category/${m[1]}`, type_name: name });
    });
    return list;
}

function filterMap(classes) {
    const block = [{ key: 'sort', name: '排序', value: SORTS }];
    const filters = {};
    for (const item of classes) filters[item.type_id] = block;
    return filters;
}

async function init() {
    return {};
}

async function home(inReq) {
    const html = await fetchText(`${SITE}/`);
    const classes = [...SORT_CLASSES, ...parseCategories(html)];
    return {
        class: classes,
        filters: filterMap(classes),
        list: parseList(html, inReq).slice(0, 24),
    };
}

async function category(inReq) {
    const page = Math.max(parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1, 1);
    const tid = inReq.body.tid ?? inReq.body.id ?? 'sort/renew';
    const ext = parseExt(inReq.body.filters || inReq.body.filter || inReq.body.extend || {});
    const html = await fetchText(buildListUrl(tid, page, String(ext.sort || '')));
    const list = parseList(html, inReq);
    return {
        list,
        page,
        pagecount: parsePageCount(html, page),
        limit: list.length || 24,
        total: list.length ? 9999 : 0,
    };
}

async function detail(inReq) {
    let raw = String(Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id || '').trim();
    const page = raw.startsWith('http') ? raw : absUrl(raw.startsWith('/') ? raw : `/videos/${raw}/`);
    const html = await fetchText(page);
    const $ = load(html);
    const name = $('meta[property="og:title"]').attr('content') || '';
    const rawPic = $('meta[property="og:image"]').attr('content') || $('video#player').attr('poster') || '';
    const url = inReq.body.id;
    const id = url.match(/\/videos\/(\d+)/)?.[1];
    const playUrl = `https://91spx.com/videos/${id}/playback`;
    const resp = await req.post(playUrl, {}, {
        headers: pageHeaders(url, {
            'X-Requested-With': 'XMLHttpRequest',
        }),
        timeout: 20000,
    });
    const data = resp.data || {};
    return {
        list: [
            {
                vod_id: page,
                vod_name: name.replace(/\s*\|\s*91视频\s*$/, '') || '91视频',
                vod_pic: rawPic,
                vod_play_from: '91视频',
                vod_play_url: `播放$${data.data.streams.hevc}`,
            },
        ],
    };
}

async function play(inReq) {
    const id = inReq.body.id;
    return { parse: 0, jx: 0, url: id, header: { 'User-Agent': UA, 'Referer': site + '/' } };
}

async function imgProxy(inReq, reply) {
    try {
        let raw = d64(inReq.query.url);
        const match = raw.match(/loadBannerDirect\('([^']*)'/);
        if (match) raw = match[1];
        if (!raw) return reply.code(404).send('');

        const resp = await axios.get(raw, {
            headers: {
                'User-Agent': UA,
                'Referer':    `${SITE}/`,
                'Origin':     SITE,
            },
            responseType: 'arraybuffer',
            timeout:      10000,
        });

        const decrypted = aesDecrypt(Buffer.from(resp.data));
        let   ct        = 'image/jpeg';
        if (decrypted[0] === 0x89 && decrypted[1] === 0x50) ct = 'image/png';
        else if (decrypted.slice(0, 4).toString() === 'GIF8')  ct = 'image/gif';

        reply.header('Content-Type', ct).send(decrypted);
    } catch (e) {
        console.error('imgProxy error:', e.message);
        reply.code(500).send('');
    }
}

async function search(inReq) {
    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    const page = Math.max(parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1, 1);
    if (!key) return { list: [], page: 1, pagecount: 1, limit: 24, total: 0 };
    const base = `${SITE}/videos/search/${encodeURIComponent(key)}/`;
    const html = await fetchText(page > 1 ? `${base}${page}/` : base);
    const list = parseList(html, inReq);
    return {
        list,
        page,
        pagecount: parsePageCount(html, page),
        limit: list.length || 24,
        total: list.length ? 9999 : 0,
    };
}

export default {
    meta: {
        key: 'spx91',
        name: '🎞️91视频',
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
