import axios from 'axios';
import { load } from 'cheerio';

import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://www.52papa.tv';
const playerHost = 'https://video1.yocoolnet.in';
const perPage = 20;

const classes = [
    { type_id: 'new', type_name: '最新' },
    { type_id: '5', type_name: '中文字幕' },
    { type_id: '7', type_name: '自拍' },
];

async function request(reqUrl, headers = {}) {
    try {
        const resp = await axios.get(reqUrl, {
            timeout: 20000,
            maxRedirects: 5,
            validateStatus: (s) => s >= 200 && s < 400,
            headers: {
                'User-Agent': UA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,zh-TW;q=0.8,en;q=0.7',
                'Referer': site + '/',
                ...headers,
            }
        });
        return resp.data;
    } catch (e) {
        return '';
    }
}

async function requestJson(reqUrl, headers = {}) {
    const data = await request(reqUrl, { Accept: 'application/json', ...headers });
    if (!data) return null;
    try {
        return typeof data === 'string' ? JSON.parse(data) : data;
    } catch (e) {
        return null;
    }
}

function absUrl(u) {
    if (!u) return '';
    let s = String(u).trim().replace(/\\\//g, '/').replace(/&amp;/g, '&');
    if (!s) return '';
    if (s.startsWith('//')) return 'https:' + s;
    if (/^https?:\/\//i.test(s)) return s;
    return site + (s.startsWith('/') ? s : '/' + s);
}

function articleId(url) {
    const s = String(url || '');
    const p = s.match(/[?&]p=(\d+)/);
    if (p) return p[1];
    const bare = s.split('?')[0].split('#')[0].replace(/\/+$/, '');
    const seg = bare.split('/').filter(Boolean).pop() || '';
    return seg.replace(/\.html?$/i, '') || bare;
}

function metaNum(html, re) {
    const m = String(html || '').match(re);
    return m ? parseInt(m[1], 10) : 0;
}

function maxPage($) {
    let max = 0;
    $('a[href*="paged="]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/paged=(\d+)/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    if (!max) {
        const m = $.html().match(/paged=(\d+)/g);
        if (m) m.forEach((x) => { max = Math.max(max, parseInt(x.split('=')[1], 10)); });
    }
    return max;
}

function parseVods($) {
    const videos = [];
    let nodes = $('article.masonry-item, article.post');
    if (!nodes.length) nodes = $('.masonry-item, .post');

    nodes.each((_, element) => {
        const item = $(element);
        const link = item.find('a.entry-thumbnail').first();
        const titleA = item.find('.entry-title a').first();
        const img = link.find('img').first().length ? link.find('img').first() : item.find('img').first();

        const url = link.attr('href') || titleA.attr('href') || '';
        const name = (titleA.text() || item.find('.entry-title').text() || img.attr('alt') || '').trim();
        const pic = absUrl(img.attr('src') || img.attr('data-src') || img.attr('data-original') || '');
        const date = (item.find('.entry-date').text() || '').replace(/[^\d-]/g, '').trim();
        const cat = (item.find('.entry-category a').first().text() || '').trim();

        const id = articleId(url);
        if (!id || !name) return;

        videos.push({
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_year: date ? date.slice(0, 4) : '',
            vod_remarks: cat || date,
        });
    });

    const seen = new Set();
    return videos.filter((v) => !seen.has(v.vod_id) && seen.add(v.vod_id));
}

function pickPlayUrl($, html) {
    const iframe = $('iframe#allmyplayer').attr('src') || $('iframe[src*="player_coolinet"]').attr('src') || '';
    if (iframe) {
        const pid = (iframe.match(/[?&]id=([^&"']+)/) || [])[1] || '';
        const pn = (iframe.match(/[?&]player=(\d+)/) || [])[1] || '2';
        if (pid) {
            const playPage = `${playerHost}/api/player_coolinet.php?player=${pn}&id=${pid}&height=520&req_uri=${encodeURIComponent(site + '/')}`;
            return { pid, playPage };
        }
    }
    const m = String(html || '').match(/(?:https?:)?\\?\/\\?\/[^"'\s<>]+?\.m3u8[^"'\s<>]*/i);
    if (m) return { pid: '', playPage: absUrl(m[0]) };
    return { pid: '', playPage: '' };
}

function findM3u8(html) {
    const text = String(html || '');
    const patterns = [
        /https?:\\?\/\\?\/[^"'\s<>]+?\.m3u8[^"'\s<>]*/i,
        /["']([^"']+?\.m3u8[^"']*)["']/i,
        /(?:url|source|src)\s*[:=]\s*["']([^"']+)["']/i,
    ];
    for (const re of patterns) {
        const m = text.match(re);
        if (m) {
            const raw = (m[1] || m[0]).replace(/\\\//g, '/').replace(/&amp;/g, '&');
            if (/\.m3u8/i.test(raw)) return absUrl(raw);
        }
    }
    return '';
}

const pageCountCache = new Map();

async function totalPages(query) {
    const key = query || 'all';
    const hit = pageCountCache.get(key);
    if (hit && Date.now() - hit.t < 10 * 60 * 1000) return hit.n;
    try {
        const resp = await axios.get(`${site}/index.php?rest_route=/wp/v2/posts&per_page=1&_fields=id${query}`, {
            timeout: 15000,
            headers: { 'User-Agent': UA, 'Referer': site + '/' },
        });
        const total = parseInt(resp.headers['x-wp-total'] || '0', 10);
        const n = total > 0 ? Math.ceil(total / perPage) : 0;
        if (n) pageCountCache.set(key, { n, t: Date.now() });
        return n;
    } catch (e) {
        return 0;
    }
}

async function wpList(kind, tid, page, keyword) {
    const base = `${site}/index.php?rest_route=/wp/v2/posts&per_page=${perPage}&page=${page}&_embed=1`;
    let api = base;
    if (kind === 'cat' && /^\d+$/.test(String(tid))) api += `&categories=${tid}`;
    if (kind === 'search') api += `&search=${encodeURIComponent(keyword || '')}`;

    const data = await requestJson(api);
    if (!Array.isArray(data) || !data.length) return [];

    const out = data.map((post) => {
        const media = (post._embedded && post._embedded['wp:featuredmedia'] && post._embedded['wp:featuredmedia'][0]) || {};
        const terms = (post._embedded && post._embedded['wp:term'] && post._embedded['wp:term'][0]) || [];
        const date = (post.date || '').slice(0, 10);
        const cat = (terms[0] && terms[0].name) || '';
        return {
            vod_id: String(post.id || ''),
            vod_name: ((post.title && post.title.rendered) || '').replace(/<[^>]+>/g, '').trim(),
            vod_pic: absUrl((media.source_url) || (media.media_details && media.media_details.source_url) || ''),
            vod_year: date ? date.slice(0, 4) : '',
            vod_remarks: cat || date,
        };
    });
    return out.filter((v) => v.vod_id && v.vod_name);
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const html = await request(site + '/');
    let list = [];
    if (html) {
        list = parseVods(load(html));
    }
    if (!list.length) list = await wpList('new', '', 1, '');
    return { class: classes, filters: {}, list };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || 'new');
    const page = Math.max(parseInt(inReq.body.page, 10) || 1, 1);

    let url;
    if (tid === 'new' || tid === 'latest' || tid === '') {
        url = page > 1 ? `${site}/?paged=${page}` : site + '/';
    } else {
        url = page > 1 ? `${site}/?cat=${tid}&paged=${page}` : `${site}/?cat=${tid}`;
    }

    const html = await request(url);
    let list = [];
    let pmax = 0;
    if (html) {
        const $ = load(html);
        list = parseVods($);
        pmax = maxPage($);
    }
    if (!list.length) {
        list = await wpList(tid === 'new' ? 'new' : 'cat', tid, page, '');
    }

    const restQuery = (tid === 'new' || tid === 'latest' || tid === '')
        ? ''
        : (/^\d+$/.test(tid) ? `&categories=${tid}` : '');

    let pagecount = await totalPages(restQuery);
    if (!pagecount) pagecount = Math.max(pmax, list.length >= perPage ? page + 1 : page);
    if (pagecount < page && list.length >= perPage) pagecount = page + 1;

    return { page, pagecount, limit: perPage, total: pagecount, list };
}

async function detail(inReq, _outResp) {
    const rawId = String(inReq.body.id || '');
    const id = articleId(rawId) || rawId;
    const url = /^\d+$/.test(id) ? `${site}/?p=${id}` : absUrl(id);
    const html = await request(url);
    if (!html) return { list: [] };

    const $ = load(html);

    let name = ($('h1.entry-title').first().text() || '').trim();
    if (!name) name = ($('meta[property="og:title"]').attr('content') || $('title').text() || '').trim();
    name = name.replace(/\s*[–\-|]\s*52papa.*$/i, '').trim();

    let pic = $('meta[property="og:image"]').attr('content') || '';
    if (!pic) {
        const fig = $('.entry-content img').first();
        pic = fig.attr('src') || fig.attr('data-src') || '';
    }
    if (!pic) pic = $('a.entry-thumbnail img').first().attr('src') || '';
    pic = absUrl(pic);

    const date = ($('.entry-date').first().text() || '').replace(/[^\d-]/g, '').trim();
    const cat = ($('.entry-category a').first().text() || '').trim();
    const tags = [];
    $('.entry-tags a, .tag-links a').each((_, el) => {
        const t = $(el).text().trim();
        if (t) tags.push(t);
    });

    const { playPage } = pickPlayUrl($, html);
    const playUrl = playPage ? `正片$${playPage}` : `正片$${url}`;

    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_year: date ? date.slice(0, 4) : '',
            vod_remarks: cat || date,
            vod_content: (cat ? `分类：${cat}\n` : '') + (date ? `更新：${date}\n` : '') + (tags.length ? `标签：${tags.join(' ')}` : ''),
            vod_play_from: '52papa',
            vod_play_url: playUrl,
        }],
    };
}

async function play(inReq, _outResp) {
    const input = String(inReq.body.id || '').trim();
    const header = { 'User-Agent': UA, 'Referer': playerHost + '/', 'Origin': playerHost };

    if (/\.m3u8/i.test(input)) {
        return { parse: 0, url: absUrl(input), header };
    }

    let playPage = input;
    if (!/player_coolinet\.php/i.test(playPage)) {
        const { list } = await detail({ body: { id: input } }, {});
        const item = (list && list[0]) || {};
        const first = String(item.vod_play_url || '').split('#')[0].split('$')[1] || '';
        playPage = first || '';
    }

    if (!playPage) {
        return { parse: 1, url: absUrl(input), header };
    }

    const html = await request(playPage);
    const m3u8 = findM3u8(html);
    if (m3u8) {
        return { parse: 0, url: m3u8, header };
    }
    return { parse: 1, url: playPage, header };
}

async function search(inReq, _outResp) {
    const wd = String(inReq.body.wd || '').trim();
    const page = Math.max(parseInt(inReq.body.page, 10) || 1, 1);
    if (!wd) return { list: [] };

    const url = page > 1
        ? `${site}/?s=${encodeURIComponent(wd)}&paged=${page}`
        : `${site}/?s=${encodeURIComponent(wd)}`;

    const html = await request(url);
    let list = [];
    if (html) {
        const $ = load(html);
        list = parseVods($);
        if (!list.length) {
            list = await wpList('search', '', 1, wd);
        }
    } else {
        list = await wpList('search', '', 1, wd);
    }

    return { page, pagecount: list.length >= perPage ? page + 1 : page, list };
}

export default {
    meta: {
        key: '52papa',
        name: '🌸52Papa',
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
