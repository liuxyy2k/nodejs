import axios from 'axios';
import { load } from 'cheerio';
import https from 'https';

const BASE_URL = 'https://www.yasetube.com';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const CATS = {
    nvce: '女厕偷拍',
    'fc2-ppv': 'FC2 PPV',
    me: 'Mesubuta系列',
    milf: 'MILF人妻无码',
    dalu: '自拍偷拍',
    madou: '品牌传媒',
};

const http = axios.create({
    timeout: 12000,
    validateStatus: () => true,
    headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Referer: `${BASE_URL}/`,
    },
});

function txt(s) {
    return String(s || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function abs(u) {
    if (!u) return '';
    if (u.startsWith('//')) return `https:${u}`;
    try {
        return new URL(u, `${BASE_URL}/`).href;
    } catch {
        return u;
    }
}

function vodId(url) {
    const fixed = abs(String(url).split('?')[0].replace(/\/$/, ''));
    return fixed.replace(`${BASE_URL}/`, '');
}

async function fetchHtml(url) {
    const full = String(url).startsWith('http') ? url : abs(url);
    try {
        const r = await http.get(full);
        if (r.status < 200 || r.status >= 400) return '';
        return typeof r.data === 'string' ? r.data : String(r.data || '');
    } catch {
        return '';
    }
}

function meta(html, name) {
    const re = new RegExp(
        `<meta[^>]+(?:property|name)=["']${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]+content=["']([^"']+)`,
        'i',
    );
    const m = html.match(re);
    return m ? txt(m[1]) : '';
}

function isVideoFormat(url) {
    return /\.(m3u8|mp4|flv|mkv|avi|ts)/i.test(String(url || '').toLowerCase());
}

function findPlay(html) {
    if (!html) return '';
    const pats = [
        /<source[^>]+src=["']([^"']+)/i,
        /<video[^>]+src=["']([^"']+)/i,
        /(https?:\\?\/\\?\/[^"'<>]+?\.(?:m3u8|mp4)(?:\?[^"'<>]*)?)/i,
        /file["']?\s*[:=]\s*["']([^"']+)/i,
        /url["']?\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)/i,
    ];
    for (const p of pats) {
        const m = html.match(p);
        if (m) return abs(m[1].replace(/\\\//g, '/'));
    }
    return '';
}

function parseList(html) {
    const arr = [];
    if (html) {
        const $ = load(html);
        $('article.loop-video.thumb-block a[href]').each((_, el) => {
            const a = $(el);
            const href = abs(a.attr('href') || '');
            if (!href.includes('/video/')) return;
            const img = a.find('img').first();
            const span = a.find('header.entry-header span').first();
            const title = txt(
                a.attr('title') ||
                    img.attr('alt') ||
                    span.text(),
            );
            const pic = abs(img.attr('data-src') || img.attr('src') || img.attr('data-original') || '');
            const remark = txt(
                a
                    .find('span.hd-video,span.views,span.duration')
                    .map((__, n) => $(n).text())
                    .get()
                    .join(' '),
            );
            if (title && href) {
                arr.push({
                    vod_id: vodId(href),
                    vod_name: title,
                    vod_pic: pic,
                    vod_remarks: remark,
                });
            }
        });
    }

    if (!arr.length && html) {
        for (const it of html.match(/<article[^>]+loop-video[\s\S]*?<\/article>/gi) || []) {
            const h = it.match(/<a[^>]+href=["']([^"']+)["'][^>]*title=["']([^"']+)/i);
            const p = it.match(/<img[^>]+(?:data-src|src)=["']([^"']+)/i);
            if (h) {
                arr.push({
                    vod_id: vodId(h[1]),
                    vod_name: txt(h[2]),
                    vod_pic: p ? abs(p[1]) : '',
                    vod_remarks: /hd-video/i.test(it) ? 'HD' : '',
                });
            }
        }
    }

    const seen = new Set();
    return arr.filter((v) => {
        if (seen.has(v.vod_id)) return false;
        seen.add(v.vod_id);
        return true;
    });
}

async function loadCats() {
    const html = await fetchHtml('/categories');
    const classes = [];
    if (html) {
        const $ = load(html);
        $('a[href*="/video/category/"]').each((_, el) => {
            const href = $(el).attr('href') || '';
            const slug = href.replace(/\/$/, '').split('/').pop();
            const name = txt($(el).attr('title') || $(el).text());
            if (slug && name && !classes.some((x) => x.type_id === slug)) {
                classes.push({ type_id: slug, type_name: name });
            }
        });
    }
    if (!classes.length) {
        return Object.entries(CATS).map(([type_id, type_name]) => ({ type_id, type_name }));
    }
    return classes.slice(0, 30);
}

function playHeader() {
    return {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Referer: `${BASE_URL}/`,
    };
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = await loadCats();
    const html = await fetchHtml('/');
    return {
        class: classes,
        filters: {},
        list: parseList(html).slice(0, 20),
    };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '');
    const pg = String(parseInt(inReq.body.page, 10) || 1);
    let url;
    if (['latest', 'home', ''].includes(tid)) {
        url = pg === '1' ? '/' : `/page/${pg}/`;
    } else {
        url = pg === '1' ? `/video/category/${tid}/` : `/video/category/${tid}/page/${pg}/`;
    }
    return {
        page: parseInt(pg, 10),
        pagecount: 999,
        limit: 20,
        total: 999,
        list: parseList(await fetchHtml(url)),
    };
}

async function detail(inReq, _outResp) {
    let vid = inReq.body.id;
    if (Array.isArray(vid)) vid = vid[0];
    const url = String(vid).startsWith('http')
        ? String(vid)
        : `${BASE_URL}/${String(vid).replace(/^\/+/, '')}`;
    const html = await fetchHtml(url);

    let name = meta(html, 'og:title');
    let pic = meta(html, 'og:image');
    let desc = meta(html, 'og:description');

    if (html) {
        const $ = load(html);
        const h = $('h1.entry-title').first();
        if (h.length) name = txt(h.text()) || name;
        const im = $('meta[itemprop="thumbnailUrl"]').first();
        if (im.attr('content')) pic = im.attr('content') || pic;
        const ds = $('meta[itemprop="description"]').first();
        if (ds.attr('content')) desc = ds.attr('content') || desc;
    }

    const play = findPlay(html) || url;

    return {
        list: [
            {
                vod_id: vid,
                vod_name: name || String(vid),
                vod_pic: abs(pic),
                type_name: '',
                vod_year: '',
                vod_area: '',
                vod_actor: '',
                vod_director: '',
                vod_content: desc || name || '',
                vod_play_from: '嗅探',
                vod_play_url: `正片$${play}`,
            },
        ],
    };
}

async function search(inReq, _outResp) {
    const key = encodeURIComponent(inReq.body.wd || '');
    const pg = String(parseInt(inReq.body.pg || inReq.body.page, 10) || 1);
    const url = pg === '1' ? `/?s=${key}` : `/page/${pg}/?s=${key}`;
    return {
        page: parseInt(pg, 10),
        pagecount: 999,
        limit: 20,
        total: 999,
        list: parseList(await fetchHtml(url)),
    };
}

async function play(inReq, _outResp) {
    const u = abs(inReq.body.id || '');
    if (isVideoFormat(u)) {
        return { parse: 0, playUrl: '', url: u, header: playHeader() };
    }
    const html = await fetchHtml(u);
    const playUrl = findPlay(html);
    if (playUrl && isVideoFormat(playUrl)) {
        return { parse: 0, playUrl: '', url: playUrl, header: playHeader() };
    }
    return { parse: 1, playUrl: '', url: u, header: playHeader() };
}

export default {
    meta: {
        key: 'yasetube',
        name: '🌸亚色影库',
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
