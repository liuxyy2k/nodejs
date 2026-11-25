import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://155-2026115.mitao01.xyz';

async function request(reqUrl, headers = {}) {
    try {
        const resp = await axios.get(reqUrl, {
            timeout: 20000,
            headers: {
                'User-Agent': UA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Referer': site + '/',
                ...headers,
            },
        });
        return resp.data;
    } catch (e) {
        return '';
    }
}

function absUrl(u) {
    if (!u) return '';
    u = String(u).trim();
    if (!u) return '';
    if (u.startsWith('//')) return 'https:' + u;
    if (/^https?:\/\//i.test(u)) return u;
    return site + (u.startsWith('/') ? u : '/' + u);
}

function pickId(url) {
    const clean = String(url || '').split('?')[0].split('#')[0].replace(/\/+$/, '');
    const seg = clean.split('/').filter(Boolean).pop() || clean;
    return seg.replace(/\.html?$/i, '');
}

function parseVods($) {
    const videos = [];
    let nodes = $('div.list_box ul a');
    if (!nodes.length) nodes = $('div.list_box ul li a');
    if (!nodes.length) nodes = $('a[href*="/v/"], a[href*="/embed/"]');

    nodes.each((_, element) => {
        const a = $(element);
        const img = a.find('li.image img, .image img, img').first();
        const pic = absUrl(img.attr('img') || img.attr('data-original') || img.attr('src') || '');
        const url = a.attr('href') || '';
        const name = (a.find('li.title, .title').first().text() || img.attr('alt') || a.attr('title') || '').trim();
        if (pic.endsWith('.gif') || !name) return;
        const id = pickId(url);
        if (!id) return;
        videos.push({
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
        });
    });

    const seen = new Set();
    return videos.filter((v) => !seen.has(v.vod_id) && seen.add(v.vod_id));
}

function parsePlayUrl(html) {
    const patterns = [
        /const\s+url\s*=\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i,
        /(?:var|let|player_?url|video_?url|source)\s*[:=]\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i,
        /['"]([^'"]+\.m3u8[^'"]*)['"]/i,
    ];
    for (const re of patterns) {
        const match = html.match(re);
        if (match) return absUrl(match[1].replace(/\\\//g, '/').replace(/&amp;/g, '&'));
    }
    return '';
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: 'new', type_name: '最新' },
        { type_id: 'hot', type_name: '热门' },
        { type_id: 'like', type_name: '推荐' },
    ];

    const html = await request(site + '/');
    const $ = load(html);
    const list = parseVods($);

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    let url = `${site}/${tid}.html`;
    if (page > 1) {
        url = `${site}/${tid}-${page}.html`;
    }

    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { page, pagecount: list.length ? page + 1 : page, list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const url = `${site}/embed/${id}`;
    const html = await request(url);
    const $ = load(html);

    let name = ($('meta[property="og:title"]').attr('content') || '').trim();
    if (!name) name = ($('h1').first().text() || $('title').text() || '').trim();
    const pic = absUrl($('meta[property="og:image"]').attr('content') || $('meta[name="og:image"]').attr('content') || '');
    const year = ($('meta[property="video:release_date"]').attr('content') || '').trim();

    const playUrl = parsePlayUrl(html);

    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_year: year,
            vod_play_from: 'Mitao',
            vod_play_url: `第1集$${playUrl || url}`,
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: { 'User-Agent': UA, 'Referer': site + '/' },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd || '');
    let html = await request(`${site}/search?keywords=${text}`);
    let $ = load(html);
    let list = parseVods($);

    if (!list.length) {
        html = await request(`${site}/search/${text}.html`);
        $ = load(html);
        list = parseVods($);
    }

    return { list };
}

export default {
    meta: {
        key: 'nvyou',
        name: '🌸Mitao',
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
