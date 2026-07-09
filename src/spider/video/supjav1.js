import axios from 'axios';
import * as cheerio from 'cheerio';

const site = 'https://supjav.com';

const http = axios.create({
    timeout: 15_000,
    headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Referer:           `${site}/`,
    },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SKIP_KEYWORDS = ['popular', 'category', 'maker', 'cast', 'tag'];

function parseCards(html) {
    const $    = cheerio.load(html);
    const list = [];
    const seen = new Set();

    $('a[href]').each((_, el) => {
        const href  = $(el).attr('href') || '';
        const title = ($(el).attr('title') || '').trim();

        if (!href.includes('.html') || !title || !href.includes('supjav.com')) return;
        if (SKIP_KEYWORDS.some((k) => href.includes(k))) return;

        const vodId = href.split('/').pop().replace('.html', '');
        if (seen.has(vodId)) return;
        seen.add(vodId);

        const img = $(el).find('img').first();
        const pic = (img.attr('src') || img.attr('data-original') || img.attr('data-src') || '').trim();

        list.push({ vod_id: vodId, vod_name: title, vod_pic: pic, vod_remarks: '高清' });
    });

    return list;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    let list = [];
    try {
        const { data } = await http.get(`${site}/`);
        list = parseCards(data);
    } catch { /* ignore */ }

    return {
        class: [
            { type_id: 'latest', type_name: '最新'   },
            { type_id: 'hot',    type_name: '热门'   },
        ],
        list,
        filters: {},
    };
}

async function category(inReq, _outResp) {
    const pg  = parseInt(inReq.body.page) || 1;
    const url = pg > 1 ? `${site}/page/${pg}` : `${site}/`;

    try {
        const { data } = await http.get(url);
        const list = parseCards(data);
        return { page: pg, pagecount: pg + 1, limit: list.length, total: list.length * 10, list };
    } catch {
        return { page: pg, pagecount: 1, list: [] };
    }
}

async function detail(inReq, _outResp) {
    const vodId    = inReq.body.id;
    const targetUrl = `${site}/${vodId}.html`;

    return {
        list: [{
            vod_id:        vodId,
            vod_name:      `视频 ID: ${vodId}`,
            vod_play_from: 'SupJav内嵌',
            vod_play_url:  `点击播放$${targetUrl}`,
        }],
    };
}

async function play(inReq, _outResp) {
    return { parse: 1, url: inReq.body.id };
}

async function search(inReq, _outResp) {
    const wd  = inReq.body.wd || '';
    const pg  = parseInt(inReq.body.pg) || 1;
    const url = pg > 1
        ? `${site}/?s=${encodeURIComponent(wd)}&paged=${pg}`
        : `${site}/?s=${encodeURIComponent(wd)}`;

    try {
        const { data } = await http.get(url);
        const list = parseCards(data);
        return { page: pg, pagecount: pg + 1, limit: list.length, total: list.length * 10, list };
    } catch {
        return { list: [] };
    }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'supjav1',
        name: '🔥SupJav1',
        type: 1,
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