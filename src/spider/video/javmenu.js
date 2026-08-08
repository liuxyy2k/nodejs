import axios from 'axios';
import { load } from 'cheerio';

const baseUrl = 'https://javmenu.com';

const HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Referer: `${baseUrl}/`,
};

const httpClient = axios.create({
    timeout: 15_000,
    headers: HEADERS,
});

const CLASSES = [
    { type_id: 'censored/online', type_name: '📺 有碼 在線看' },
    { type_id: 'uncensored/online', type_name: '📺 無碼 在線看' },
    { type_id: 'western/online', type_name: '📺 歐美 在線看' },
    { type_id: 'fc2/online', type_name: '📺 FC2 在線看' },
    { type_id: 'hanime/online', type_name: '📺 成人動畫 在線看' },
    { type_id: 'chinese/online', type_name: '📺 國產 在線看' },
    { type_id: 'censored', type_name: '🧲 有碼 最新種子' },
    { type_id: 'uncensored', type_name: '🧲 無碼 最新種子' },
    { type_id: 'western', type_name: '🧲 歐美 最新種子' },
    { type_id: 'fc2', type_name: '🧲 FC2 最新種子' },
    { type_id: 'hanime', type_name: '🧲 成人動畫 最新種子' },
    { type_id: 'chinese', type_name: '🧲 國產 最新種子' },
];

async function fetchHtml(url) {
    try {
        const fullUrl = url.startsWith('http') ? url : `${baseUrl}/${url.replace(/^\//, '')}`;
        const { data, status } = await httpClient.get(fullUrl, { responseType: 'text' });
        if (status >= 200 && status < 400) return String(data || '');
    } catch (e) {
        console.log(`[JAV] 请求失败: ${url} -> ${e.message}`);
    }
    return '';
}

function fixUrl(url) {
    if (!url) return '';
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) return new URL(url, baseUrl).href;
    if (url.startsWith('http')) return url;
    return new URL(`/${url.replace(/^\//, '')}`, baseUrl).href;
}

function parseVideoList(html) {
    if (!html) return [];
    const $ = load(html);
    const videos = [];

    let items = $('.video-list-item .card').toArray();
    if (!items.length) {
        items = $('.col-xl-2 .card, .col-sm-6 .card').toArray();
    }

    for (const element of items) {
        try {
            const item = $(element);
            const aTag = item.find('a').first();
            if (!aTag.length) continue;

            const href = aTag.attr('href') || '';
            if (!href || href === '#') continue;

            let vid = href.startsWith('/') ? href.split('/').filter(Boolean).pop() : href;
            if (!vid) vid = href;

            let title = item.find('.card-title').first().text().trim();
            if (!title) {
                title = (aTag.attr('title') || aTag.text() || '').trim();
            }

            const tags = [];
            item.find('.video-list-item-tag-wrapper .badge').each((_, el) => {
                const tagText = $(el).text().trim();
                if (tagText) tags.push(tagText);
            });
            let remark = tags.join(' ');

            const date = item.find('.text-muted').first().text().trim();
            if (date) remark = `${date} ${remark}`.trim();

            const img = item.find('img.card-img-top').first();
            const pic = fixUrl(img.attr('data-src') || img.attr('src') || '');

            videos.push({
                vod_id: vid,
                vod_name: title,
                vod_pic: pic,
                vod_remarks: remark,
            });
        } catch (e) {
            console.log(`[JAV] 解析卡片失败: ${e.message}`);
        }
    }

    return videos;
}

function extractPageCount(html, pg, itemCount) {
    let pagecount = pg;
    const $ = load(html || '');
    $('.pagination a, .page-link').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/page=(\d+)/);
        if (m) {
            const num = parseInt(m[1], 10);
            if (num > pagecount) pagecount = num;
        }
    });
    if (pagecount === pg && itemCount >= 20) pagecount = pg + 1;
    return pagecount;
}

function parseDetail(html) {
    const $ = load(html || '');

    let title = $('h1').first().text().trim();
    if (!title) title = $('meta[property="og:title"]').attr('content') || '';

    let pic = $('meta[property="og:image"]').attr('content') || '';
    if (!pic) {
        const img = $('.embed-responsive-item').first();
        pic = img.attr('data-src') || img.attr('src') || '';
    }
    pic = fixUrl(pic);

    let desc = $('meta[name="description"]').attr('content') || '';
    if (!desc) desc = $('meta[property="og:description"]').attr('content') || '';
    if (!desc) desc = $('.card-text').first().text().trim();

    let playUrl = '';
    const video = $('video').first();
    if (video.length) {
        const src = video.attr('src') || '';
        if (src) playUrl = fixUrl(src);
    }
    if (!playUrl) {
        const iframe = $('iframe').first();
        if (iframe.length) {
            const src = iframe.attr('src') || '';
            if (src) playUrl = fixUrl(src);
        }
    }
    if (!playUrl) {
        const m3u8 = html.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/);
        if (m3u8) playUrl = m3u8[1];
    }
    if (!playUrl) {
        const mp4 = html.match(/(https?:\/\/[^\s"']+\.mp4[^\s"']*)/);
        if (mp4) playUrl = mp4[1];
    }
    if (!playUrl) {
        const jsMatch = html.match(/video_url\s*[:=]\s*["']([^"']+)["']/);
        if (jsMatch) playUrl = fixUrl(jsMatch[1]);
    }

    return {
        title: title || '未知',
        pic,
        desc: desc || '暂无简介',
        play_url: playUrl,
    };
}

function buildCategoryUrl(tid, pg) {
    const urlPath = String(tid || '').replace(/\/$/, '');
    let url = `${baseUrl}/${urlPath}`;
    if (pg > 1) {
        url += url.includes('?') ? `&page=${pg}` : `?page=${pg}`;
    }
    return url;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const html = await fetchHtml(baseUrl);
    const items = parseVideoList(html);
    const seen = new Set();
    const list = [];
    for (const v of items) {
        if (!seen.has(v.vod_id)) {
            seen.add(v.vod_id);
            list.push(v);
            if (list.length >= 20) break;
        }
    }
    return { class: CLASSES, list };
}

async function category(inReq, _outResp) {
    const pg = parseInt(inReq.body.page) || 1;
    const tid = inReq.body.id;

    try {
        const html = await fetchHtml(buildCategoryUrl(tid, pg));
        if (!html) {
            return { list: [], page: pg, pagecount: 1, limit: 0, total: 0 };
        }

        const items = parseVideoList(html);
        const pagecount = extractPageCount(html, pg, items.length);

        return {
            list: items,
            page: pg,
            pagecount,
            limit: items.length,
            total: pagecount * 20,
        };
    } catch (e) {
        console.log(`[JAV] categoryContent error: ${e.message}`);
        return { list: [], page: pg, pagecount: 1, limit: 0, total: 0 };
    }
}

async function detail(inReq, _outResp) {
    try {
        const raw = inReq.body.id;
        const vid = String(Array.isArray(raw) ? raw[0] : raw || '').trim();
        if (!vid) return { list: [] };

        const detailUrl = vid.startsWith('http') ? vid : `${baseUrl}/${vid.replace(/^\//, '')}`;
        const html = await fetchHtml(detailUrl);
        if (!html) return { list: [] };

        const data = parseDetail(html);
        if (!data.play_url) data.play_url = detailUrl;

        return {
            list: [{
                vod_id: vid,
                vod_name: data.title,
                vod_pic: data.pic,
                vod_poster: data.pic,
                vod_img: data.pic,
                vod_content: data.desc,
                vod_play_from: 'JAV目录',
                vod_play_url: data.play_url || '',
            }],
        };
    } catch (e) {
        console.log(`[JAV] detailContent error: ${e.message}`);
        return { list: [] };
    }
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    if (id && (id.includes('.m3u8') || id.includes('.mp4'))) {
        return { parse: 0, url: id, header: { Referer: `${baseUrl}/` } };
    }
    return { parse: 1, url: id, header: { Referer: `${baseUrl}/` } };
}

async function search(inReq, _outResp) {
    const pg = parseInt(inReq.body.pg || inReq.body.page) || 1;
    const key = String(inReq.body.wd || '').trim();

    try {
        let url = `${baseUrl}/search?wd=${encodeURIComponent(key)}`;
        if (pg > 1) url += `&page=${pg}`;

        const html = await fetchHtml(url);
        if (!html) {
            return { list: [], page: pg, pagecount: 1, limit: 0, total: 0 };
        }

        const items = parseVideoList(html);
        const pagecount = extractPageCount(html, pg, items.length);

        return {
            list: items,
            page: pg,
            pagecount,
            limit: items.length,
            total: pagecount * 20,
        };
    } catch (e) {
        console.log(`[JAV] searchContent error: ${e.message}`);
        return { list: [], page: pg, pagecount: 1, limit: 0, total: 0 };
    }
}

export default {
    meta: {
        key: 'javmenu',
        name: '🔥JAV目录',
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
