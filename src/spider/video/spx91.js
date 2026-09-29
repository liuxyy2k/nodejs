import crypto from 'crypto';
import { load } from 'cheerio';
import req from '../../util/req.js';
import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

/**
 * 91视频 · 91spx.com
 * 分类 /videos/category/{slug}/  排序 /videos/sort/{key}/
 * 播放页动态脚本里的 m3u8，分片 AES-128
 */

const SITE = 'https://91spx.com';
const AES_KEY = Buffer.from('f5d965df75336270');
const AES_IV = Buffer.from('97b60394abc2fbe1');
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

function unpackPacked(code) {
    const text = String(code || '');
    const start = text.indexOf('eval(function(p,a,c,k,e,d)');
    if (start < 0) return '';
    const end = text.indexOf(".split('|'),0,{}))", start);
    if (end < 0) return '';
    const expr = text.slice(start, end + ".split('|'),0,{}))".length);
    try {
        return String(eval(expr.replace(/^eval/, '')));
    } catch {
        return '';
    }
}

function buildListUrl(tid, page, sort) {
    const id = String(tid || 'sort/renew').replace(/^\/+|\/+$/g, '');
    let path = 'sort/renew';
    if (sort && sort !== 'renew') path = `sort/${sort}`;
    else if (id.startsWith('category/') || id.startsWith('sort/') || id.startsWith('tag/')) path = id;
    const base = `${SITE}/videos/${path}/`;
    return page > 1 ? `${base}${page}/` : base;
}

function requestOrigin(inReq) {
    const proto = String(inReq?.headers?.['x-forwarded-proto'] || 'http').split(',')[0].trim();
    const host = inReq?.headers?.['x-forwarded-host'] || inReq?.headers?.host || '127.0.0.1';
    return `${proto}://${host}`;
}

function coverOf(inReq, raw, id) {
    const src = absUrl(raw);
    if (src && !src.includes('poster_loading') && allowedPic(src)) {
        const prefix = inReq?.server?.prefix || '/spider/spx91/3';
        return `${requestOrigin(inReq)}${prefix}/img?u=${encodeURIComponent(src)}`;
    }
    return id ? `${SITE}/videos/webp/${id}.webp` : '';
}

function allowedPic(url) {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return host === '91spx.com' || host.endsWith('.91spx.com') || host.endsWith('wirqed.cn') || host.endsWith('eisees.com');
    } catch {
        return false;
    }
}

function decryptImage(buf) {
    if (!buf.length || buf.length % 16 !== 0) return buf;
    try {
        const decipher = crypto.createDecipheriv('aes-128-cbc', AES_KEY, AES_IV);
        decipher.setAutoPadding(false);
        let out = Buffer.concat([decipher.update(buf), decipher.final()]);
        let end = out.length;
        while (end > 0 && out[end - 1] === 0) end--;
        return out.subarray(0, end);
    } catch {
        return buf;
    }
}

function imageMime(buf) {
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
    if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
    if (buf.length >= 6 && buf.subarray(0, 4).toString() === 'GIF8') return 'image/gif';
    if (buf.length >= 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
    return '';
}

function parseList(html, inReq) {
    const $ = load(html || '');
    const list = [];
    const seen = new Set();
    $('.video-item').each((_, el) => {
        const card = $(el);
        const href = absUrl(card.find('a[href*="/videos/"]').first().attr('href'));
        const idm = href.match(/\/videos\/(\d+)\/?/);
        if (!idm || seen.has(idm[1])) return;
        seen.add(idm[1]);
        const img = card.find('img').first();
        const name = card.find('h2, h3').first().text().replace(/\s+/g, ' ').trim();
        if (!name) return;
        const dur = card.find('.poster .rounded-large').first().text().replace(/\s+/g, ' ').trim();
        list.push({
            vod_id: href,
            vod_name: name,
            vod_pic: coverOf(inReq, img.attr('data-src'), idm[1]),
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

async function extractPlayUrl(pageUrl) {
    const html = await fetchText(pageUrl);
    if (!html) return '';
    const boot = unpackPacked(html);
    const hash = boot.match(/\/videos\/player\/([a-f0-9]{16,})\//)?.[1];
    if (!hash) {
        const direct = html.match(/https?:\/\/[^'"\s]+\.m3u8[^'"\s]*/);
        return direct ? direct[0] : '';
    }
    const slot = Math.floor(Date.now() / 1000 / 2100);
    const cfg = unpackPacked(await fetchText(`${SITE}/videos/player/${hash}/${slot}.js`));
    const media = cfg.match(/https?:\/\/[^'"\s]+\.m3u8[^'"\s]*/);
    return media ? media[0] : '';
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
    const name = $('h1').first().text().replace(/\s+/g, ' ').trim() || $('meta[property="og:title"]').attr('content') || '';
    const idm = page.match(/\/videos\/(\d+)/);
    const rawPic = $('meta[property="og:image"]').attr('content') || $('video#player').attr('poster') || '';
    const pic = coverOf(inReq, rawPic, idm?.[1]);
    return {
        list: [
            {
                vod_id: page,
                vod_name: name.replace(/\s*\|\s*91视频\s*$/, '') || '91视频',
                vod_pic: pic,
                vod_play_from: '91视频',
                vod_play_url: `播放$${page}`,
            },
        ],
    };
}

async function play(inReq) {
    const header = { 'User-Agent': UA, Referer: `${SITE}/` };
    let url = String(inReq.body.id || '').trim();
    if (url.includes('$')) url = url.split('$').pop().trim();
    if (/\.m3u8(\?|$)/i.test(url)) return { parse: 0, jx: 0, url, header };
    if (!url) return { parse: 0, jx: 0, url: '', header };
    const page = url.startsWith('http') ? url : absUrl(url);
    const media = await extractPlayUrl(page);
    if (!media) return { parse: 0, jx: 0, url: '', header };
    return { parse: 0, jx: 0, url: media, header };
}

async function img(inReq, reply) {
    const target = String(inReq.query.u || '').trim();
    if (!allowedPic(target)) {
        reply.code(403);
        return 'forbidden';
    }
    let resp;
    try {
        resp = await req.get(target, {
            headers: headers(`${SITE}/`),
            httpsAgent: agent,
            responseType: 'arraybuffer',
            timeout: 20000,
            validateStatus: () => true,
        });
    } catch {
        reply.code(502);
        return 'image failed';
    }
    const raw = Buffer.isBuffer(resp.data) ? resp.data : Buffer.from(resp.data || []);
    if (resp.status >= 400 || raw.length < 16) {
        reply.code(502);
        return 'image failed';
    }
    const plain = imageMime(raw) ? raw : decryptImage(raw);
    const mime = imageMime(plain);
    if (!mime) {
        reply.code(502);
        return 'image failed';
    }
    reply.header('Content-Type', mime);
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(plain);
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
        name: '🌸91视频',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/img', img);
    },
};
