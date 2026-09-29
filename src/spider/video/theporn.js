import { load } from 'cheerio';
import req from '../../util/req.js';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const site = 'https://theporn.cc';


async function fetchPage(targetUrl, referer = '') {
    const headers = {
        'User-Agent': UA,
        Referer: referer || `${site}/`,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
    };
    // 走 req.js：自动带上 cookie.json 里的 Cookie，并保存响应 Set-Cookie
    const resp = await req.get(targetUrl, { headers });
    return resp.data;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseVid(href, tid) {
    if (tid) return String(tid);
    const m = String(href || '').match(/\/video\/(\d+)/);
    return m ? m[1] : '';
}

function parseVideoItem($, el) {
    try {
        const item = $(el);
        const href = item.find('a.v3-card-thumb').attr('href') || item.find('a[href*="/video/"]').first().attr('href') || '';
        const vid = parseVid(href, item.attr('data-tid'));
        if (!vid) return null;

        const img = item.find('img.cover-img').first();
        const title = item.find('.v3-card-title').first().text().trim()
            || img.attr('alt')?.trim()
            || '';
        const pic = img.attr('src') || item.find('picture source[type="image/webp"]').attr('srcset')?.split(' ')[0] || '';

        const duration = item.find('.v3-badge-duration').first().text().trim();
        const resolution = item.find('.v3-badge-resolution').first().text().trim();
        const rate = item.find('.v3-badge-like, .v3-card-rate').first().text().trim();
        const remarks = [duration, resolution, rate].filter(Boolean).join(' · ');

        return {
            vod_id: vid,
            vod_name: title,
            vod_pic: pic,
            vod_remarks: remarks,
        };
    } catch {
        return null;
    }
}

function parseJsonLdList(html) {
    const m = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
    if (!m) return [];
    try {
        const data = JSON.parse(m[1]);
        const items = data?.itemListElement || [];
        return items.map((it) => {
            const url = it.url || '';
            const vid = parseVid(url);
            if (!vid) return null;
            return {
                vod_id: vid,
                vod_name: it.name || vid,
                vod_pic: it.image || '',
                vod_remarks: '',
            };
        }).filter(Boolean);
    } catch {
        return [];
    }
}

function extractList(html) {
    const $ = load(html);
    const cards = $('.v3-video-card').toArray();
    if (cards.length) {
        return cards.map((el) => parseVideoItem($, el)).filter(Boolean);
    }
    return parseJsonLdList(html);
}

function buildListUrl(tid, pg, sort = 'popular') {
    const id = String(tid || 'videos').replace(/^\/+|\/+$/g, '');
    const page = parseInt(pg, 10) || 1;
    const qs = sort ? `?sort=${encodeURIComponent(sort)}` : '';
    return `${site}/${id}/${page}${qs}`;
}
const MANUAL_CLASSES = [
    { type_id: 'videos',            type_name: '视频'     },
    { type_id: 'jav',               type_name: '日本AV'   },
    { type_id: 'west',              type_name: '欧美'     },
];

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    let classes = [...MANUAL_CLASSES];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id || 'videos';
    const pg = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const sort = String(inReq.body.sort || inReq.body.extend?.sort || 'popular');
    const url = buildListUrl(tid, pg, sort);

    const data = await fetchPage(url);
    const list = extractList(data);

    let pagecount = pg + 1;
    const maxPg = data.match(/href="[^"]*\/(?:videos|jav|west)\/(\d+)\?[^"]*"/i)?.[1]
        || data.match(/class="v3-pg-btn"[^>]*>(\d+)<\/a>/g)?.pop()?.match(/>(\d+)</)?.[1];
    if (maxPg) pagecount = parseInt(maxPg, 10) || pagecount;
    if (!list.length) pagecount = pg;

    return { page: pg, pagecount, limit: list.length || 30, total: 999999, list };
}
async function detail(inReq, _outResp) {
    const tid = inReq.body.id;
    const data = await fetchPage(`${site}/video/${tid}`);
    const $    = load(data);

    let title = $('title').text().replace(' - ThePorn', '').trim()
             || $('.av-big-title .inner-title').text().trim();

    let cover = $('.cover-img').attr('src') || '';
    if (!cover) {
        const style = $('.vjs-poster').attr('style') || '';
        const match = style.match(/background-image:\s*url\("([^"]+)"\)/);
        cover = match?.[1] ?? '';
    }

    return {
        list: [{
            vod_id:        tid,
            vod_name:      title,
            vod_pic:       cover,
            vod_content:   title,
            vod_actor:     '未知演员',
            vod_director:  '未知导演',
            vod_area:      '未知地区',
            vod_year:      '2024',
            vod_remarks:   $('.duration').first().text().trim() || '未知时长',
            vod_play_from: 'ThePorn',
            vod_play_url:  `第1集$${tid}`,
        }],
    };
}

function parseCdnHash(html) {
    const m = html.match(/"space_cdn_hash"\s*:\s*"([^"]+)"/);
    return m?.[1] || '3121efe8979c635';
}

async function play(inReq, _outResp) {
    const id = inReq.body.id;
    const data = await fetchPage(`${site}/video/${id}`);
    const $ = load(data);

    let hash = $('[data-hash-id]').first().attr('data-hash-id') || '';
    if (!hash) {
        const m = data.match(/"hash_id"\s*:\s*"([a-f0-9]+)"/i)
            || data.match(/data-hash-id="([a-f0-9]+)"/i);
        hash = m?.[1] || '';
    }

    const cdnHash = parseCdnHash(data);
    let src = hash ? `https://b2.bttss.cc/videos/${hash}/g.m3u8?h=${cdnHash}` : '';
    if (!src) {
        src = $('video#video-player_html5_api').attr('src')
            || data.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i)?.[1]
            || '';
    }

    return {
        parse: 0,
        url: src,
        header: { 'User-Agent': UA, Referer: `${site}/`, Origin: site },
    };
}
async function search(inReq, _outResp) {
    const key = encodeURIComponent(String(inReq.body.wd || '').trim());
    const pg = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    if (!key) return { list: [], page: pg };

    let url = `${site}/search?q=${key}`;
    if (pg > 1) url += `&page=${pg}`;
    const data = await fetchPage(url);
    const list = extractList(data);
    return { list, page: pg, pagecount: list.length ? pg + 1 : pg };
}
// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'theporn',
        name: '🌸ThePorn',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
    },
};