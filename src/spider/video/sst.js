import axios from 'axios';
import { load } from 'cheerio';

const SITE_URL = 'https://mya.sst9.casa';
const UA_POOL = [
    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
];

function ua() {
    return UA_POOL[Math.floor(Math.random() * UA_POOL.length)];
}

function fullUrl(path) {
    if (!path || path.startsWith('http')) return path || '';
    try {
        return new URL(path, SITE_URL).href;
    } catch {
        return path;
    }
}

async function fetch(url, retries = 2) {
    for (let i = 0; i < retries; i++) {
        try {
            const resp = await axios.get(url, {
                headers: { 'User-Agent': ua(), Referer: SITE_URL },
                timeout: 8000,
                responseType: 'text',
                validateStatus: () => true,
            });
            if (resp.status >= 400) continue;
            return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
        } catch {
            await new Promise((r) => setTimeout(r, 500));
        }
    }
    return '';
}

function parseHomeVideos(html) {
    const $ = load(html);
    const videos = [];
    const seen = new Set();

    $('a[href*="/vod/play/id/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/\/vod\/play\/id\/(\d+)/);
        if (!m || seen.has(m[1])) return;
        seen.add(m[1]);

        const img = $(el).find('img').first();
        const pic = img.attr('data-original') || '';

        let title = img.attr('align') || img.attr('title') || '';
        if (!title) {
            const h3 = $(el).find('h3').first().clone();
            h3.find('em').remove();
            title = h3.text().trim();
        }
        if (!title) title = $(el).attr('title') || $(el).text().trim();
        title = title.replace(/\s*title\s*/gi, ' ').trim();

        const remark = $(el).find('label').first().text().trim();

        videos.push({
            vod_id: m[1],
            vod_name: title.slice(0, 100),
            vod_pic: fullUrl(pic),
            vod_remarks: remark,
        });
    });

    return videos.slice(0, 50);
}

function parseCategoryVideos(html) {
    const $ = load(html);
    const upList = $('ul.up-list').first();
    const items = upList.length ? upList.find('li').toArray() : [];
    const videos = [];
    const seen = new Set();

    for (const item of items) {
        const el = $(item);
        const a = el.find('a').first();
        if (!a.length) continue;

        const href = a.attr('href') || '';
        const m = href.match(/\/vod\/play\/id\/(\d+)/);
        if (!m || seen.has(m[1])) continue;
        seen.add(m[1]);

        const img = el.find('img').first();
        const pic = img.attr('data-original') || '';
        const titleEl = el.find('p.name, h3').first();
        const title = titleEl.length ? titleEl.text().trim() : a.text().trim();

        videos.push({
            vod_id: m[1],
            vod_name: title.slice(0, 100),
            vod_pic: fullUrl(pic),
            vod_remarks: '',
        });
    }

    return videos;
}

function parsePageCount(html) {
    const $ = load(html);
    const pages = [];
    $('a[href*="page="]').each((_, el) => {
        const m = ($(el).attr('href') || '').match(/page=(\d+)/);
        if (m) pages.push(parseInt(m[1], 10));
    });
    return pages.length ? Math.max(...pages) : 1;
}

function parseSearchVideos(html) {
    const $ = load(html);
    const videos = [];
    const seen = new Set();

    $('a[href*="/vod/play/id/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/\/vod\/play\/id\/(\d+)/);
        if (!m || seen.has(m[1])) return;
        seen.add(m[1]);

        const img = $(el).find('img').first();
        const pic = img.attr('data-original') || '';

        let title = img.attr('align') || img.attr('title') || '';
        if (!title) {
            const h3 = $(el).find('h3').first().clone();
            h3.find('em').remove();
            title = h3.text().trim();
        }
        if (!title) title = $(el).attr('title') || $(el).text().trim();
        title = title.replace(/\s*title\s*/gi, ' ').trim();

        videos.push({
            vod_id: m[1],
            vod_name: title.slice(0, 100),
            vod_pic: fullUrl(pic),
            vod_remarks: '搜索',
        });
    });

    return videos;
}

function extractM3u8(html) {
    let m3u8 = '';
    const m = html.match(/var\s+player_data\s*=\s*({[^<]+?})\s*;?\s*<\/script>/);
    if (m) {
        try {
            const data = JSON.parse(m[1].replace(/\\"/g, '"').replace(/\\\//g, '/'));
            m3u8 = data.url || '';
        } catch {
            // ignore
        }
    }
    if (!m3u8) {
        const m2 = html.match(/"url"\s*:\s*"(https?:\\?\/\\?\/[^"]+?\.m3u8)"/);
        if (m2) m3u8 = m2[1].replace(/\\\//g, '/');
    }
    return m3u8;
}

async function init() {
    return {};
}

async function home() {
    const html = await fetch(`${SITE_URL}/sst/`);
    if (!html) return { class: [], list: [] };

    const $ = load(html);
    const classes = [];
    const seenTid = new Set();

    $('a[href*="/vod/type/id/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/\/vod\/type\/id\/(\d+)/);
        if (!m || seenTid.has(m[1])) return;
        seenTid.add(m[1]);
        classes.push({
            type_id: m[1],
            type_name: $(el).text().trim(),
        });
    });

    return {
        class: classes,
        list: parseHomeVideos(html),
    };
}

async function category(inReq) {
    const tid = inReq.body.id;
    let pg = parseInt(inReq.body.page, 10) || 1;
    if (pg === 0) pg = 1;

    const url = `${SITE_URL}/cn/home/web/index.php/vod/type/id/${tid}.html?page=${pg}`;
    const html = await fetch(url);
    if (!html) {
        return { list: [], page: pg, pagecount: 1 };
    }

    return {
        list: parseCategoryVideos(html),
        page: pg,
        pagecount: parsePageCount(html),
    };
}

async function detail(inReq) {
    const vodId = inReq.body.id;
    const url = `${SITE_URL}/cn/home/web/index.php/vod/play/id/${vodId}/sid/1/nid/1.html`;
    const html = await fetch(url);
    if (!html) return { list: [] };

    const m3u8 = extractM3u8(html);
    const $ = load(html);

    let title = '';
    const titleTag = $('title').first().text().trim();
    if (titleTag) {
        title = titleTag.split(/[-_–—]/)[0].trim().replace(/^《|》$/g, '').trim();
    }

    const pic = $('meta[property="og:image"]').attr('content') || '';

    return {
        list: [{
            vod_id: vodId,
            vod_name: title || `视频_${vodId}`,
            vod_pic: fullUrl(pic),
            vod_play_from: 'm3u8',
            vod_play_url: m3u8 ? `第1集$${m3u8}` : '',
        }],
    };
}

async function play(inReq) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: {},
    };
}

async function search(inReq) {
    const key = encodeURIComponent(inReq.body.wd || '');
    let pg = parseInt(inReq.body.page, 10) || 1;
    if (pg === 0) pg = 1;

    const url = `${SITE_URL}/cn/home/web/index.php/vod/search.html?wd=${key}&page=${pg}`;
    const html = await fetch(url);
    if (!html) return { list: [], page: pg };

    return {
        list: parseSearchVideos(html),
        page: pg,
    };
}

export default {
    meta: {
        key: 'sst',
        name: '💋爽上天',
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
