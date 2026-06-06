import axios from 'axios';
import * as cheerio from 'cheerio';

const site = 'https://2dt0.xxaaddss.top';

const http = axios.create({
    timeout: 10_000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer:      site + '/',
    },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseList($) {
    const list = [];
    $('div.block-post > div').each((_, el) => {
        const item    = $(el);
        const a       = item.find('a').first();
        const img     = item.find('img').first();
        const remarks = item.find('span.atten').first();
        if (!a.length) return;

        const rawName   = a.text().trim();
        const cleanName = rawName
            .replace(/\d{4}-\d{2}-\d{2}.*$/, '')
            .replace(/\d+$/, '')
            .trim();

        list.push({
            vod_id:      a.attr('href') || '',
            vod_name:    cleanName || rawName,
            vod_pic:     img.attr('data-src') || '',
            vod_remarks: remarks.text().trim(),
        });
    });
    return list;
}

function resolveUrl(id) {
    if (!id) return site;
    if (id.startsWith('http')) return id;
    if (id.startsWith('/'))    return site + id;
    return `${site}/index.php/vod/detail/id/${id}.html`;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    let list = [];
    try {
        const { data } = await http.get(`${site}/`);
        list = parseList(cheerio.load(data));
    } catch { /* ignore */ }

    return {
        class: [
            { type_id: '1',  type_name: '国产'     },
            { type_id: '2',  type_name: '中文传媒' },
            { type_id: '3',  type_name: '日本AV'   },
            { type_id: '37', type_name: '无码流出' },
            { type_id: '42', type_name: '中文字幕' },
            { type_id: '4',  type_name: '欧美AV'   },
            { type_id: '5',  type_name: '明星网黄' },
            { type_id: '6',  type_name: '吃瓜黑料' },
            { type_id: '7',  type_name: '变态暗网' },
            { type_id: '8',  type_name: '小众口味' },
            { type_id: '9',  type_name: '其它'     },
        ],
        list,
        filters: {},
    };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg  = parseInt(inReq.body.page) || 1;

    try {
        const { data } = await http.get(
            `${site}/index.php/vod/type/id/${tid}/page/${pg}.html`
        );
        return { page: pg, pagecount: 99, limit: 24, total: 999, list: parseList(cheerio.load(data)) };
    } catch {
        return { page: pg, pagecount: 1, list: [] };
    }
}

async function detail(inReq, _outResp) {
    const vod_id = inReq.body.id;
    const url    = resolveUrl(vod_id);

    try {
        const { data } = await http.get(url);
        const $        = cheerio.load(data);

        let vod_name = ($('h1').first() || $('.vod-detail-name') || $('.title'))
            .text().trim();
        if (!vod_name) {
            vod_name = $('title').text().split(/[-_]/)[0].trim();
        }
        vod_name = vod_name
            .replace(/(在线播放|高清视频|免费观看|BD|HD|MP4| - .+)$/, '')
            .trim();

        const imgEl  = $('.vod-pic img').first() || $('img').first();
        const vod_pic = imgEl.attr('src') || '';

        return {
            list: [{
                vod_id,
                vod_name,
                vod_pic,
                vod_play_from: 'MasterPlayer',
                vod_play_url:  `立即播放$${vod_id}`,
            }],
        };
    } catch {
        return { list: [] };
    }
}

async function play(inReq, _outResp) {
    const id  = inReq.body.id;
    const url = id.startsWith('/') ? site + id : id;

    try {
        const { data: html } = await http.get(url);
        const m = html.match(/var player_aaaa\s*=\s*(\{.*?\})/);
        if (m) {
            const config = JSON.parse(m[1]);
            if (config.url) return { parse: 0, url: config.url };
        }
    } catch { /* ignore */ }

    return { parse: 0, url: '' };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg  = parseInt(inReq.body.pg) || 1;

    try {
        const { data } = await http.get(
            `${site}/index.php/vod/search/page/${pg}/wd/${encodeURIComponent(key)}.html`
        );
        return { list: parseList(cheerio.load(data)) };
    } catch {
        return { list: [] };
    }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'xads',
        name: '🔥性爱大师',
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