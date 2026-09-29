import axios from 'axios';
import https from 'https';
import { load } from 'cheerio';

/**
 * Hentai ASMR - https://hentaiasmr.moe
 * 列表多选择器解析 · 播放走 WebView 嗅探
 */

const host = 'https://hentaiasmr.moe';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CLASS_MAP = {
    latest: '最新',
    popular: '人気のある',
    'most-viewed': '最も見られました',
    longest: '最長',
    random: 'ランダム',
};

const CLASSES = Object.entries(CLASS_MAP).map(([type_id, type_name]) => ({ type_id, type_name }));

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const http = axios.create({
    timeout: 15_000,
    httpsAgent,
    validateStatus: () => true,
});

function log(msg) {
    console.log(`[HentaiASMR] ${msg}`);
}

function getHeaders() {
    return {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Referer: host,
    };
}

function fixUrl(url) {
    if (!url) return '';
    const u = url.trim();
    if (u.startsWith('//')) return `https:${u}`;
    if (u.startsWith('/')) return host + u;
    if (u.startsWith('http')) return u;
    return `${host}/${u}`;
}

async function fetchText(url) {
    try {
        log(`Fetch: ${url}`);
        const resp = await http.get(url, { headers: getHeaders(), responseType: 'text' });
        if (resp.status !== 200) return '';
        return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch (e) {
        log(`Fetch error: ${e.message}`);
        return '';
    }
}

function selectListItems($) {
    let items = $('article.thumb-block').toArray();
    if (!items.length) items = $('article.loop-video').toArray();
    if (!items.length) items = $('article[data-video-uid]').toArray();
    if (!items.length) items = $('.thumb-block').toArray();
    if (!items.length) items = $('.loop-video').toArray();
    if (!items.length) {
        items = $('.post-thumbnail')
            .toArray()
            .map((el) => el.parent)
            .filter((el) => el && el.tagName === 'article');
    }
    return items;
}

function parseList(html) {
    if (!html) return [];
    const $ = load(html);
    const videos = [];
    const seen = new Set();
    const items = selectListItems($);

    log(`找到 ${items.length} 个卡片`);

    for (const el of items) {
        try {
            const item = $(el);
            const a = item.find('a[href]').first();
            if (!a.length) continue;

            const href = a.attr('href') || '';
            if (!href || href.startsWith('#') || seen.has(href)) continue;
            seen.add(href);

            let title = item.find('.entry-header span').first().text().trim();
            if (!title) title = item.find('.entry-header').first().text().trim();
            if (!title) title = (a.attr('title') || '').trim() || '未知音频';

            const img = item.find('img').first();
            let pic = '';
            if (img.length) {
                pic = img.attr('data-src') || img.attr('src') || '';
                if (pic.startsWith('//')) pic = `https:${pic}`;
            }

            const duration = item.find('.duration').first().text().trim();

            let rjCode = item.find('.rjcodes').first().text().trim();
            if (!rjCode) {
                const rjMatch = href.match(/(RJ\d+)/i);
                rjCode = rjMatch ? rjMatch[1] : '';
            }

            let remark = rjCode || '';
            if (duration) remark = remark ? `${remark} | ${duration}` : duration;

            videos.push({
                vod_id: href,
                vod_name: title,
                vod_pic: pic,
                vod_remarks: remark.slice(0, 100),
            });
        } catch (e) {
            log(`解析单个卡片失败: ${e.message}`);
        }
    }

    log(`解析到 ${videos.length} 个音频`);
    return videos;
}

function parsePageCount(html, pg, videoCount) {
    let pagecount = pg;
    const $ = load(html);
    const pagination = $('.pagination li a');
    if (pagination.length) {
        let maxPage = pg;
        pagination.each((_, el) => {
            const href = $(el).attr('href') || '';
            const m = href.match(/\/page\/(\d+)\//);
            if (m) {
                const num = parseInt(m[1], 10);
                if (num > maxPage) maxPage = num;
            }
        });
        if (maxPage > pg) pagecount = maxPage;
    } else if (videoCount >= 20) {
        pagecount = pg + 1;
    }
    return Math.max(pagecount, pg);
}

function buildCategoryUrl(tid, pg) {
    const tidStr = String(tid || 'latest');
    if (pg <= 1) return `${host}/?ref=porndude&filter=${tidStr}`;
    return `${host}/page/${pg}/?ref=porndude&filter=${tidStr}`;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const cat = await category({ body: { id: 'latest', page: 1, pg: 1 } }, null);
    return { class: CLASSES, filters: {}, list: cat.list || [] };
}

async function category(inReq, _outResp) {
    try {
        const tid = String(inReq.body.id || 'latest');
        const pg = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;

        let url = buildCategoryUrl(tid, pg);
        log(`分类URL: ${url}`);

        let html = await fetchText(url);
        if (!html) {
            log('获取HTML失败，尝试无参数首页');
            html = await fetchText(host);
            if (!html) {
                return { list: [], page: pg, pagecount: 1, limit: 0, total: 0 };
            }
        }

        const videos = parseList(html);
        const pagecount = parsePageCount(html, pg, videos.length);

        return {
            list: videos,
            page: pg,
            pagecount,
            limit: videos.length,
            total: pagecount * 20,
        };
    } catch (e) {
        log(`category异常: ${e.message}`);
        return { list: [], page: 1, pagecount: 1, limit: 0, total: 0 };
    }
}

async function detail(inReq, _outResp) {
    try {
        let vid = String(inReq.body.id || '');
        if (!vid) return { list: [] };

        const url = vid.startsWith('http') ? vid : fixUrl(vid);
        const html = await fetchText(url);
        if (!html) return { list: [] };

        const $ = load(html);

        let title = $('h1').first().text().trim();
        if (!title) title = $('meta[property="og:title"]').attr('content') || '';

        let pic = '';
        const img = $('img.post-thumbnail').first().length
            ? $('img.post-thumbnail').first()
            : $('img').first();
        if (img.length) {
            pic = img.attr('data-src') || img.attr('src') || '';
            if (pic.startsWith('//')) pic = `https:${pic}`;
        }

        const desc = $('meta[name="description"]').attr('content') || '';
        const rjMatch = vid.match(/(RJ\d+)/i);
        const rjCode = rjMatch ? rjMatch[1] : '';
        const vodName = rjCode ? `[${rjCode}] ${title}` : title;

        return {
            list: [
                {
                    vod_id: vid,
                    vod_name: vodName,
                    vod_pic: pic,
                    vod_content: desc,
                    vod_play_from: 'Hentai ASMR',
                    vod_play_url: `播放$${url}`,
                },
            ],
        };
    } catch (e) {
        log(`detail异常: ${e.message}`);
        return { list: [] };
    }
}

async function play(inReq, _outResp) {
    try {
        let id = String(inReq.body.id || '');
        if (!id) return { parse: 1, url: '', header: getHeaders() };

        if (id.includes('$')) {
            const parts = id.split('$');
            id = parts[parts.length - 1] || id;
        }
        if (!id.startsWith('http')) id = fixUrl(id);

        return {
            parse: 1,
            url: id,
            header: getHeaders(),
        };
    } catch (e) {
        log(`play异常: ${e.message}`);
        return { parse: 1, url: id || '', header: getHeaders() };
    }
}

async function search(inReq, _outResp) {
    try {
        const key = inReq.body.wd || '';
        const pg = parseInt(inReq.body.pg || inReq.body.page || 1, 10) || 1;
        const url = `${host}/?s=${encodeURIComponent(key)}&page=${pg}`;

        const html = await fetchText(url);
        if (!html) {
            return { list: [], page: pg, pagecount: 1, limit: 0, total: 0 };
        }

        const videos = parseList(html);
        const pagecount = videos.length >= 20 ? pg + 1 : pg;

        return {
            list: videos,
            page: pg,
            pagecount,
            limit: videos.length,
            total: pagecount * 20,
        };
    } catch (e) {
        log(`search异常: ${e.message}`);
        return { list: [], page: 1, pagecount: 1, limit: 0, total: 0 };
    }
}

export default {
    meta: {
        key: 'hentaiasmr',
        name: '🎌Hentai ASMR',
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
