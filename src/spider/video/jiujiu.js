import axios from 'axios';
import * as cheerio from 'cheerio';

const site = 'https://ww.jiujiu.one';

const http = axios.create({
    timeout: 15_000,
    headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer:           site,
        Accept:            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function absUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (url.startsWith('//'))   return 'https:' + url;
    if (url.startsWith('/'))    return site + url;
    return url;
}

// 解析视频卡片（home / category / search 共用）
function parseCards($) {
    const list = [];
    $('div').filter((_, el) => {
        const cls = $(el).attr('class') || '';
        return cls.split(/\s+/).includes('item');
    }).each((_, el) => {
        try {
            const item  = $(el);
            const links = item.find('a[href]');
            if (links.length < 1) return;

            const titleLink = links.length > 1 ? links.eq(1) : links.eq(0);
            const href      = titleLink.attr('href') || '';
            if (!href) return;

            const vod_id   = absUrl(href);
            const vod_name = titleLink.text().trim();

            const img = item.find('img').first();
            let vod_pic = img.attr('src') || img.attr('data-src') || '';
            vod_pic = absUrl(vod_pic);

            const vod_remarks = item.find('span.badge').first().text().trim();

            if (!vod_name || !vod_id) return;
            list.push({ vod_id, vod_name, vod_pic, vod_remarks });
        } catch { /* ignore */ }
    });
    return list;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '68',  type_name: '亞洲無碼'   },
        { type_id: '67',  type_name: '日本女優'   },
        { type_id: '23',  type_name: '日本無碼'   },
        { type_id: '9',   type_name: '中文字幕'   },
        { type_id: '24',  type_name: '日本有碼'   },
        { type_id: '82',  type_name: '日韓無碼'   },
        { type_id: '113', type_name: '無碼專區'   },
        { type_id: '78',  type_name: 'AV明星'     },
        { type_id: '269', type_name: '倫理影片'   },
        { type_id: '90',  type_name: '日本片商'   },
        { type_id: '80',  type_name: '國產自拍'   },
        { type_id: '231', type_name: '傳媒原創'   },
        { type_id: '63',  type_name: '國產精品'   },
        { type_id: '77',  type_name: '國產情色'   },
        { type_id: '105', type_name: '美女主播'   },
        { type_id: '33',  type_name: '強姦亂倫'   },
        { type_id: '36',  type_name: '國產主播'   },
        { type_id: '66',  type_name: '亞洲有碼'   },
        { type_id: '3',   type_name: '偷拍自拍'   },
        { type_id: '91',  type_name: '抖陰視頻'   },
        { type_id: '31',  type_name: '制服誘惑'   },
        { type_id: '10',  type_name: '黑料不打烊' },
        { type_id: '25',  type_name: '歐美精品'   },
    ];

    let list = [];
    try {
        const { data } = await http.get(site);
        list = parseCards(cheerio.load(data));
    } catch { /* ignore */ }

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg  = parseInt(inReq.body.page) || 1;
    const url = pg === 1 ? `${site}/c/${tid}` : `${site}/c/${tid}?page=${pg}`;

    const { data } = await http.get(url);
    const $    = cheerio.load(data);
    const list = parseCards($);

    // 解析总页数
    let totalPages = 1;
    $('ul.pagination a').each((_, el) => {
        const t = $(el).text().trim();
        if (/^\d+$/.test(t)) totalPages = Math.max(totalPages, parseInt(t));
    });

    return {
        page:      pg,
        pagecount: totalPages,
        limit:     list.length,
        total:     totalPages * list.length,
        list,
    };
}

async function detail(inReq, _outResp) {
    const id  = inReq.body.id;
    const url = id.startsWith('http') ? id : site + id;

    const { data } = await http.get(url);
    const $ = cheerio.load(data);

    const vod_name = $('h1').first().text().trim();
    const vod_pic  = $('meta[property="og:image"]').attr('content')
                  || absUrl($('img.card-img-top').attr('src') || '');

    let playUrl = '';
    const source = $('video source').first();
    if (source.attr('src')) {
        playUrl = source.attr('src');
    } else {
        const iframe = $('iframe').first();
        if (iframe.attr('src')) playUrl = iframe.attr('src');
    }

    return {
        list: [{
            vod_id:        url,
            vod_name,
            vod_pic,
            vod_play_from: '久久网',
            vod_play_url:  playUrl ? `正片$${playUrl}` : '',
        }],
    };
}

async function play(inReq, _outResp) {
    return { parse: 0, url: inReq.body.id };
}

async function search(inReq, _outResp) {
    const key = encodeURIComponent(inReq.body.wd || '');

    try {
        const { data } = await http.get(`${site}/node/search?q=${key}`);
        return { list: parseCards(cheerio.load(data)) };
    } catch {
        return { list: [] };
    }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'jiujiu',
        name: '💋久久网',
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