import { load } from 'cheerio';
import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const site = 'https://omgjav.com';

import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

async function request(reqUrl, referer = `${site}/`) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, Referer: referer },
        // httpsAgent: agent,
        timeout: 25000,
        validateStatus: () => true,
    });
    if (resp.status !== 200) return '';
    return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
}

function absUrl(href) {
    const raw = String(href || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    return `${site}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

function proxyBase(inReq) {
    const prefix = inReq?.server?.prefix || '/spider/omgjav/3';
    const hostHeader = inReq?.headers?.['x-forwarded-host'] || inReq?.headers?.host;
    if (hostHeader) {
        const proto = String(inReq?.headers?.['x-forwarded-proto'] || 'http').split(',')[0].trim();
        return `${proto}://${hostHeader}${prefix}/img`;
    }
    const port = process.env.DEV_HTTP_PORT || 9988;
    return `http://127.0.0.1:${port}${prefix}/img`;
}

function proxyPic(url, inReq) {
    const raw = absUrl(url);
    if (!raw || !/cdn\.omgjav\.com/i.test(raw)) return raw;
    return `${proxyBase(inReq)}?url=${encodeURIComponent(raw)}`;
}

function parseVods($, inReq) {
    const list = [];
    const seen = new Set();
    $('pwx-video-card').each((_, el) => {
        const href = $(el).find('a[href^="/v/"]').first().attr('href') || '';
        if (!href || seen.has(href)) return;
        seen.add(href);
        const pic = $(el).find('img').attr('src')
            || $(el).find('img').attr('data-src')
            || '';
        list.push({
            vod_id: absUrl(href),
            vod_name: $(el).find('a[title]').attr('title')
                || $(el).find('img').attr('alt')
                || $(el).find('a').eq(1).text().trim()
                || '',
            vod_pic: proxyPic(pic, inReq),
            vod_remarks: $(el).find('.pointer-events-none').text().trim() || '',
        });
    });
    return list;
}

function listUrl(typeId, page) {
    const path = String(typeId || '/').trim() || '/';
    const url = new URL(path.startsWith('http') ? path : `${site}${path.startsWith('/') ? path : `/${path}`}`);
    if (page > 1) url.searchParams.set('page', String(page));
    else url.searchParams.delete('page');
    return url.href;
}

function mediaSrc(html) {
    const $ = load(html || '');
    const raw = $('pwx-video-player').attr('data-media') || '';
    if (raw) {
        try {
            const data = JSON.parse(raw);
            if (data?.src) return String(data.src);
        } catch {}
    }
    const m = String(html).match(/https?:\\?\/\\?\/[^"'\\\s]+?\.m3u8/);
    if (!m) return '';
    return m[0].replace(/\\\//g, '/');
}

function parseVariants(text, masterUrl) {
    const lines = String(text || '').split(/\r?\n/);
    const list = [];
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i].includes('#EXT-X-STREAM-INF')) continue;
        const res = lines[i].match(/RESOLUTION=\d+x(\d+)/i);
        const next = lines[i + 1]?.trim();
        if (!next || next.startsWith('#')) continue;
        let url = next;
        try { url = new URL(next, masterUrl).href; } catch {}
        const height = res ? parseInt(res[1], 10) : 0;
        list.push({ name: height ? `${height}p` : `线路${list.length + 1}`, url, height });
    }
    list.sort((a, b) => b.height - a.height);
    return list;
}

async function init() {
    return {};
}

async function home() {
    return {
        class: [
            { type_id: '/', type_name: '最近更新' },
            { type_id: '/search/newest', type_name: '最新' },
            { type_id: '/search/hottest', type_name: '热门' },
            { type_id: '/categories/slim', type_name: '苗条' },
            { type_id: '/categories/solo', type_name: '单人作品' },
            { type_id: '/categories/orgasm', type_name: '性高潮' },
            { type_id: '/categories/first-time', type_name: '首部作品' },
            { type_id: '/categories/big-tits', type_name: '巨乳' },
            { type_id: '/categories/creampie', type_name: '中出' },
            { type_id: '/categories/married', type_name: '人妻' },
            { type_id: '/categories/mature', type_name: '熟女' },
            { type_id: '/categories/school', type_name: '学生' },
            { type_id: '/categories/amateur', type_name: '素人' },
            { type_id: '/categories/uncensored', type_name: '无码' },
        ],
        filters: {},
    };
}

async function category(inReq) {
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const $ = load(await request(listUrl(inReq.body.id, page)));
    return { page, pagecount: 99999, list: parseVods($, inReq) };
}

async function detail(inReq) {
    const pageUrl = absUrl(inReq.body.id);
    const html = await request(pageUrl, pageUrl);
    const $ = load(html);
    const pic = $('pwx-video-player').attr('poster')
        || $('meta[property="og:image"]').attr('content')
        || '';
    const master = mediaSrc(html);
    let variants = [];
    if (master) {
        variants = parseVariants(await request(master, `${site}/`), master);
        if (!variants.length) variants = [{ name: '自动', url: master, height: 0 }];
    }
    return {
        list: [{
            vod_id: pageUrl,
            vod_name: $('h1').first().text().trim() || $('title').text().trim(),
            vod_pic: proxyPic(pic, inReq),
            vod_content: $('meta[name="description"]').attr('content') || '',
            vod_play_from: 'OMGJAV',
            vod_play_url: variants.map((item) => `${item.name}$${item.url}`).join('#'),
        }],
    };
}

async function play(inReq) {
    let raw = String(inReq.body.id || inReq.body.url || '').trim();
    if (raw.includes('$')) raw = raw.split('$').pop().trim();
    if (/^https?:\/\/.+\.m3u8/i.test(raw)) {
        return { parse: 0, url: raw, header: { 'User-Agent': UA, Referer: `${site}/` } };
    }
    const pageUrl = absUrl(raw);
    const html = await request(pageUrl, `${site}/`);
    const master = mediaSrc(html);
    const variants = master ? parseVariants(await request(master, `${site}/`), master) : [];
    const url = variants[0]?.url || master;
    return {
        parse: 0,
        url,
        header: { 'User-Agent': UA, Referer: `${site}/` },
    };
}

async function img(inReq, reply) {
    const raw = String(inReq.query.url || '').trim();
    let target = '';
    try { target = new URL(raw).href; } catch { target = ''; }
    if (!target || !/^https:\/\/cdn\.omgjav\.com\//i.test(target)) {
        reply.code(404);
        return '';
    }
    try {
        const resp = await axios.get(target, {
            headers: {
                'User-Agent': UA,
                Referer: `${site}/`,
                Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            },
            // httpsAgent: agent,
            timeout: 20000,
            responseType: 'arraybuffer',
            validateStatus: () => true,
        });
        if (resp.status !== 200 || !resp.data?.byteLength) {
            reply.code(404);
            return '';
        }
        reply.header('Content-Type', resp.headers['content-type'] || 'image/webp');
        reply.header('Cache-Control', 'public, max-age=86400');
        return reply.send(Buffer.from(resp.data));
    } catch {
        reply.code(404);
        return '';
    }
}

async function search(inReq) {
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const url = new URL(`${site}/search/hottest`);
    url.searchParams.set('query', inReq.body.wd || '');
    if (page > 1) url.searchParams.set('page', String(page));
    const $ = load(await request(url.href, `${site}/`));
    return { list: parseVods($, inReq) };
}

export default {
    meta: { key: 'omgjav', name: '🌸OmgJav', type: 3 },
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
