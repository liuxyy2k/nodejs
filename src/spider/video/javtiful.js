import { load } from 'cheerio';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

/**
 * Javtiful · javtiful.com
 * 列表 /zh/videos、分类 /zh/category/{slug}
 * 播放页 video source / playerSources 为 fast-stream.jav.si 直链 mp4
 */

const SITE = 'https://javtiful.com';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const FIXED = [
    { type_id: 'videos', type_name: '最新' },
    { type_id: 'foryou', type_name: '为你推荐' },
    { type_id: 'censored', type_name: '有码' },
    { type_id: 'uncensored', type_name: '无码' },
    { type_id: 'reducing-mosaic', type_name: '减码' },
    { type_id: 'videos?sort=popular_week', type_name: '本周热门' },
];

function headers(referer) {
    return {
        'User-Agent': UA,
        Referer: referer || `${SITE}/zh/main`,
        Accept: 'text/html,application/xhtml+xml,application/json,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    };
}

async function fetchText(url) {
    const resp = await axios.get(url, {
        headers: headers(url),
        // httpsAgent: agent,
        timeout: 25000,
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

function cleanName(text) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .replace(/\s*\|\s*Javtiful\s*$/i, '')
        .trim();
}

function buildListUrl(tid, page) {
    let id = String(tid || 'videos').trim();
    if (!id || id === 'latest' || id === 'home') id = 'videos';
    const url = new URL(id.startsWith('http') ? id : id.startsWith('/') ? id : `/zh/${id}`, SITE);
    if (page > 1) url.searchParams.set('page', String(page));
    return url.href;
}

function picOf(img) {
    const raw = img.attr('data-front-lazy-src') || img.attr('data-src') || img.attr('src') || '';
    if (!raw || raw.includes('placeholder')) return '';
    return absUrl(raw);
}

function parseList(html) {
    const $ = load(html || '');
    const list = [];
    const seen = new Set();
    $('article.video-card, article.front-video-card').each((_, el) => {
        const card = $(el);
        const a = card.find('a.video-card__thumbnail, a.front-video-thumb').first();
        const href = absUrl(a.attr('href') || card.find('a[href*="/video/"]').first().attr('href'));
        if (!href || !/\/video\//.test(href) || seen.has(href)) return;
        seen.add(href);
        const quality = card.find('.video-card__details strong, .front-quality-tag').first().text().trim();
        const details = card.find('.video-card__details').first().text().replace(quality, '').trim();
        const dur = card.find('.front-duration-tag').first().text().trim() || details;
        list.push({
            vod_id: href,
            vod_name: cleanName(card.find('a.video-card__title, a.front-video-title').first().text()),
            vod_pic: picOf(card.find('img').first()),
            vod_remarks: [quality, dur].filter(Boolean).join(' '),
        });
    });
    return list;
}

function parsePageCount(html, page) {
    const $ = load(html || '');
    let max = page;
    $('a.pagination__link, a.front-pagination-link').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/[?&]page=(\d+)/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
        const text = $(el).text();
        if (text.includes('下一页') && href && href !== '#') max = Math.max(max, page + 1);
    });
    return max;
}

function parseCategories(html) {
    const $ = load(html || '');
    const list = [];
    const seen = new Set();
    $('a.category-card, a.front-collection-card-link').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/\/zh\/category\/([^/?#]+)/i) || href.match(/\/category\/([^/?#]+)/i);
        if (!m) return;
        const slug = decodeURIComponent(m[1]);
        const key = slug.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        let name = $(el).find('.front-collection-title').text().trim();
        if (!name) {
            name = $(el).text().replace(/\s+/g, ' ').trim().replace(/^[\d,.]+\s*个视频\s*/i, '').trim();
        }
        if (!name) return;
        list.push({ type_id: `category/${slug}`, type_name: name });
    });
    return list;
}

function extractSources(html) {
    const text = String(html || '');
    const block = text.match(/"playerSources"\s*:\s*(\[[\s\S]*?\])/);
    if (block) {
        try {
            const arr = JSON.parse(block[1]);
            const list = arr
                .map((item) => ({
                    url: String(item?.src || '').trim(),
                    size: parseInt(item?.size, 10) || 0,
                }))
                .filter((item) => /^https?:\/\//i.test(item.url));
            if (list.length) return list.sort((a, b) => b.size - a.size);
        } catch {
            /* fall through */
        }
    }
    const $ = load(text);
    const list = [];
    $('video#front-player source, video source').each((_, el) => {
        const url = ($(el).attr('src') || '').trim();
        if (!/^https?:\/\//i.test(url)) return;
        list.push({ url, size: parseInt($(el).attr('size'), 10) || 0 });
    });
    return list.sort((a, b) => b.size - a.size);
}

async function init() {
    return {};
}

async function home() {
    const [catHtml, listHtml] = await Promise.all([
        fetchText(`${SITE}/zh/categories`),
        fetchText(`${SITE}/zh/videos`),
    ]);
    return {
        class: [...FIXED, ...parseCategories(catHtml)],
        list: parseList(listHtml).slice(0, 24),
        filters: {},
    };
}

async function category(inReq) {
    const page = Math.max(parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1, 1);
    const tid = inReq.body.tid ?? inReq.body.id ?? 'videos';
    const html = await fetchText(buildListUrl(tid, page));
    const list = parseList(html);
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
    const page = raw.startsWith('http') ? raw : absUrl(raw.startsWith('/') ? raw : `/zh/video/${raw}`);
    const html = await fetchText(page);
    const $ = load(html);
    const name = cleanName($('h1').first().text() || $('meta[property="og:title"]').attr('content'));
    const pic = absUrl($('meta[property="og:image"]').attr('content') || $('video#front-player').attr('poster'));
    const sources = extractSources(html);
    const from = [];
    const urls = [];
    sources.forEach((item) => {
        from.push(item.size ? `${item.size}P` : '播放');
        urls.push(`正片$${item.url}`);
    });
    if (!from.length) {
        from.push('播放');
        urls.push(`正片$${page}`);
    }
    return {
        list: [
            {
                vod_id: page,
                vod_name: name || 'Javtiful',
                vod_pic: pic,
                vod_play_from: from.join('$$$'),
                vod_play_url: urls.join('$$$'),
            },
        ],
    };
}

async function play(inReq) {
    const header = { 'User-Agent': UA, Referer: `${SITE}/` };
    let url = String(inReq.body.id || '').trim();
    if (url.includes('$')) url = url.split('$').pop().trim();
    if (/fast-stream\.jav\.si|\.mp4(\?|$)/i.test(url)) {
        return { parse: 0, jx: 0, url, header };
    }
    if (!url) return { parse: 0, jx: 0, url: '', header };
    const page = url.startsWith('http') ? url : absUrl(url);
    const sources = extractSources(await fetchText(page));
    if (!sources.length) return { parse: 0, jx: 0, url: '', header };
    return { parse: 0, jx: 0, url: sources[0].url, header };
}

async function search(inReq) {
    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    const page = Math.max(parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1, 1);
    if (!key) return { list: [], page: 1, pagecount: 1, limit: 24, total: 0 };
    const url = new URL(`${SITE}/zh/search`);
    url.searchParams.set('q', key);
    if (page > 1) url.searchParams.set('page', String(page));
    const html = await fetchText(url.href);
    const list = parseList(html);
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
        key: 'javtiful',
        name: '🌸Javtiful',
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
