import { load } from 'cheerio';
import crypto from 'crypto';
import req from '../../util/req.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
let site = 'https://brain.byjzvdiw.cc';

const PORT   = process.env.DEV_HTTP_PORT || 9988;

const SORT_CLASSES = [
    { type_id: 'videos/latest', type_name: '最近更新' },
    { type_id: 'videos/most-favorited', type_name: '最多喜欢' },
    { type_id: 'videos/most-viewed', type_name: '最多观看' },
    { type_id: 'videos/most-liked', type_name: '最多点赞' },
    { type_id: 'videos/most-commented', type_name: '最多评论' },
    { type_id: 'videos/longest', type_name: '最长时间' },
];

const CATE_CLASSES = [
    { type_id: 'category/170', type_name: '国产精选' },
    { type_id: 'category/160', type_name: '会所探花' },
    { type_id: 'category/165', type_name: '中文字幕' },
    { type_id: 'category/166', type_name: '乱伦换妻' },
    { type_id: 'category/168', type_name: '无码AV' },
    { type_id: 'category/142', type_name: '麻豆传媒' },
    { type_id: 'category/140', type_name: '果冻传媒' },
    { type_id: 'category/139', type_name: '91制片厂' },
    { type_id: 'category/158', type_name: '日韩三级' },
    { type_id: 'category/159', type_name: '欧美三级' },
    { type_id: 'category/157', type_name: '港台三级' },
    { type_id: 'category/161', type_name: '黑料吃瓜' },
    { type_id: 'category/162', type_name: '福利姬' },
    { type_id: 'category/163', type_name: '东南亚片' },
    { type_id: 'category/164', type_name: '欧美巨根' },
    { type_id: 'category/167', type_name: '成人综艺' },
    { type_id: 'category/169', type_name: '禁漫天堂' },
    { type_id: 'category/141', type_name: '其他传媒' },
];

const TAG_CLASSES = [
    { type_id: 'tag/人妻', type_name: '人妻熟女' },
    { type_id: 'tag/乱伦', type_name: '家庭伦理' },
    { type_id: 'tag/国产', type_name: '国产自拍' },
    { type_id: 'tag/日韩', type_name: '日韩视频' },
    { type_id: 'tag/欧美', type_name: '欧美视频' },
    { type_id: 'tag/情侣', type_name: '情侣自拍' },
];

function buildFilters(classes) {
    const sortFilter = {
        key: 'sort',
        name: '排序',
        init: 'default',
        value: [
            { n: '默认', v: 'default' },
            { n: '最近更新', v: 'latest' },
            { n: '最多喜欢', v: 'most-favorited' },
            { n: '最多观看', v: 'most-viewed' },
            { n: '最多点赞', v: 'most-liked' },
            { n: '最多评论', v: 'most-commented' },
            { n: '最长时间', v: 'longest' },
        ],
    };
    const filters = {};
    for (const item of classes) {
        const id = String(item.type_id || '');
        if (id.startsWith('category/') || id.startsWith('tag/')) {
            filters[id] = [sortFilter];
        }
    }
    return filters;
}

function absUrl(path) {
    const raw = String(path || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    return `${site}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

function e64(s) {
    try { return Buffer.from(s || '').toString('base64'); } catch { return ''; }
}

function d64(s) {
    try { return Buffer.from(s || '', 'base64').toString('utf-8'); } catch { return ''; }
}

function aesDecrypt(buf) {
    const key = Buffer.from('f5d965df75336270');
    const iv = Buffer.from('97b60394abc2fbe1');
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    return Buffer.concat([decipher.update(buf), decipher.final()]);
}

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/seqinghub/3';
    const host = String(inReq?.headers?.['x-forwarded-host'] || inReq?.headers?.host || '').split(',')[0].trim();
    if (host) {
        const proto = String(inReq?.headers?.['x-forwarded-proto'] || 'http').split(',')[0].trim();
        return `${proto}://${host}${prefix}`;
    }
    return `http://127.0.0.1:${PORT}${prefix}`;
}

function proxyPic(url, inReq) {
    const fixed = absUrl(url);
    if (!fixed || !/^https?:\/\//i.test(fixed)) return '';
    if (/poster_loading\.jpg/i.test(fixed)) return '';
    return `${getProxyBase(inReq)}/img?url=${encodeURIComponent(e64(fixed))}`;
}

function buildListUrl(tid, page, filters = {}) {
    let path = String(tid || 'videos/latest').trim().replace(/^\//, '');
    const sort = String(filters.sort || '').trim();
    if (sort && sort !== 'default' && path.startsWith('category/')) {
        path = `videos/${sort}`;
    }
    const url = new URL(absUrl(path.endsWith('/') ? path : `${path}/`));
    if (page > 1) url.searchParams.set('page', String(page));
    return url.href;
}

async function request(url, referer = `${site}/`) {
    const resp = await req.get(url, {
        headers: {
            'User-Agent': UA,
            Referer: referer,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
        },
        timeout: 30000,
        responseType: 'text',
        validateStatus: () => true,
    });
    return resp.data;
}

function parsePageCount(html, page, listLen) {
    const nums = [...String(html || '').matchAll(/[?&]page=(\d+)/g)].map((m) => parseInt(m[1], 10));
    if (nums.length) return Math.max(...nums, page);
    const slashPages = [...String(html || '').matchAll(/\/page\/(\d+)\//g)].map((m) => parseInt(m[1], 10));
    if (slashPages.length) return Math.max(...slashPages, page);
    return listLen > 0 ? page + 1 : page;
}

function parseVods(html, inReq) {
    const $ = load(html);
    const list = [];
    $('.video-card-v2').each((_, el) => {
        const node = $(el);
        const href = node.find('a.poster, a[href*="/video/"]').first().attr('href') || '';
        const pic = node.find('img').attr('data-src')
            || node.find('img').attr('data-original')
            || node.find('img').attr('src')
            || '';
        const name = node.find('.video-card-v2__title, h2, h3').first().text().trim()
            || node.find('img').attr('alt')
            || '';
        const duration = node.find('.video-card-v2__duration').text().trim();
        const vodPic = proxyPic(pic, inReq);
        if (!href || !name || !vodPic) return;
        list.push({
            vod_id: absUrl(href),
            vod_name: name,
            vod_pic: vodPic,
            vod_remarks: duration || '',
        });
    });
    return list;
}

function extractPlayUrl(html) {
    const text = String(html || '');
    const m3u8 = text.match(/https?:[^"'\\\s]+\.m3u8[^"'\\\s]*/i);
    if (m3u8) return m3u8[0];
    try {
        const block = text.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
        if (!block) return '';
        const data = JSON.parse(block[1].trim());
        const graph = data['@graph'] || [data];
        for (const item of graph) {
            if (item?.contentUrl) return item.contentUrl;
            if (item?.embedUrl) return absUrl(item.embedUrl);
        }
    } catch {
        /* ignore */
    }
    return '';
}

async function init(inReq) {
    const ext = String(inReq?.body?.ext || inReq?.body?.extend || '').trim();
    if (/^https?:\/\//i.test(ext)) site = ext.replace(/\/+$/, '');
    return {};
}

async function home() {
    const classes = [...SORT_CLASSES, ...CATE_CLASSES, ...TAG_CLASSES];
    return {
        class: classes,
        filters: buildFilters(classes),
    };
}

async function category(inReq) {
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    let filters = inReq.body.filters || {};
    if (typeof filters === 'string') {
        try { filters = JSON.parse(filters); } catch { filters = {}; }
    }
    const html = await request(buildListUrl(inReq.body.id, page, filters));
    const list = parseVods(html, inReq);
    return {
        page,
        pagecount: parsePageCount(html, page, list.length),
        list,
    };
}

async function detail(inReq) {
    const id = inReq.body.id || '';
    const url = absUrl(id);
    const html = await request(url, url);
    const $ = load(html);
    const playUrl = extractPlayUrl(html);
    return {
        list: [{
            vod_id: id,
            vod_name: $('meta[property="og:title"]').attr('content')?.replace(/\s*-\s*好色tv\s*$/i, '').trim() || '',
            vod_pic: proxyPic($('meta[property="og:image"]').attr('content') || '', inReq),
            vod_content: $('meta[property="og:description"]').attr('content') || '',
            vod_play_from: '好色TV',
            vod_play_url: playUrl ? `正片$${playUrl}` : '',
        }],
    };
}

async function play(inReq) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: { 'User-Agent': UA, Referer: `${site}/` },
    };
}

async function search(inReq) {
    const wd = String(inReq.body.wd || '').trim();
    if (!wd) return { list: [] };
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const url = new URL(absUrl(`search/${encodeURIComponent(wd)}/`));
    if (page > 1) url.searchParams.set('page', String(page));
    const html = await request(url.href);
    return { list: parseVods(html, inReq) };
}

async function imgProxy(inReq, reply) {
    try {
        let raw = d64(inReq.query.url);
        const match = raw.match(/loadBannerDirect\('([^']*)'/);
        if (match) raw = match[1];
        if (!raw) return reply.code(404).send('');

        const resp = await req.get(raw, {
            headers: {
                'User-Agent': UA,
                Referer: `${site}/`,
                Origin: site,
            },
            timeout: 10000,
            responseType: 'arraybuffer',
            validateStatus: () => true,
        });
        if (resp.status !== 200 || !resp.data?.byteLength) return reply.code(resp.status || 502).send('');

        const decrypted = aesDecrypt(Buffer.from(resp.data));
        let ct = 'image/jpeg';
        if (decrypted[0] === 0x89 && decrypted[1] === 0x50) ct = 'image/png';
        else if (decrypted.slice(0, 4).toString() === 'GIF8') ct = 'image/gif';

        reply.header('Access-Control-Allow-Origin', '*');
        return reply.header('Content-Type', ct).send(decrypted);
    } catch (e) {
        console.error('seqinghub imgProxy error:', e.message);
        return reply.code(500).send('');
    }
}

export default {
    meta: { key: 'seqinghub', name: '💋好色TV', type: 3 },
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
