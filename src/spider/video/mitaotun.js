import axios from 'axios';
import { load } from 'cheerio';

const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SITE = 'https://mitaotunbbx.xyz';

const HEADERS = {
    'User-Agent': UA,
    Referer:      SITE + '/',
};

const CATEGORIES = {
    guochan:  { id: 'ff80808172b90a110172b90dca6c0013', name: '國產情色' },
    ripen:    { id: 'ff80808172b90a110172b90dca830017', name: '日本無碼' },
    riyou:    { id: 'ff80808172b90a110172b90dca8d001b', name: '日本有碼' },
    zhongwen: { id: 'ff80808172b90a110172b90dca97001e', name: '中文精品' },
    wanghong: { id: 'ff80808172b90a110172b90dcaa00021', name: '網紅主播' },
    chengren: { id: 'ff80808172b90a110172b90dcaaa0024', name: '成人動漫' },
    oumei:    { id: 'ff80808172b90a110172b90dcab30027', name: '歐美情色' },
    guomosi:  { id: 'ff80808172b90a110172b90dcabb002a', name: '國模私拍' },
    changtui: { id: 'ff80808172b90a110172b90dcac7002d', name: '長腿絲襪' },
    linjia:   { id: 'ff80808172b90a110172b90dcace0030', name: '鄰家人妻' },
    jingpin:  { id: 'ff80808172b90a110172b90dcae80038', name: '精品推薦' },
    wuma:     { id: '20230202101612431',                name: '無碼熱門' },
    madou:    { id: '20230202101613064',                name: '麻豆專區' },
};

async function request(url) {
    const resp = await axios.get(url, { headers: HEADERS, timeout: 10000 });
    return resp.data;
}

function parseList(html) {
    const $    = load(html);
    const list = [];

    $('li.col-md-2').each((_, el) => {
        const $el    = $(el);
        const $a     = $el.find('a.video-pic');
        const href   = $a.attr('href') || '';
        const style  = $a.attr('style') || '';
        const title  = $el.find('.title h5 a').first().attr('title')
                    || $el.find('.title h5 a').first().text().trim();

        const picMatch  = style.match(/url\('([^']+)'\)/);
        const pic       = picMatch ? picMatch[1] : '';

        const idMatch   = href.match(/\/detail\/(\d+)\.html/);
        const detailId  = idMatch ? idMatch[1] : '';

        if (detailId && title) {
            list.push({
                vod_id:   detailId,
                vod_name: title.trim(),
                vod_pic:  pic,
            });
        }
    });

    return list;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = Object.entries(CATEGORIES).map(([key, cat]) => ({
        type_id:   key,
        type_name: cat.name,
    }));
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const id   = inReq.body.id;
    const page = Math.max(parseInt(inReq.body.page) || 1, 1);

    const cat = CATEGORIES[id];
    if (!cat) return { page, pagecount: 1, list: [] };

    const url  = page === 1
        ? `${SITE}/list/${cat.id}.html`
        : `${SITE}/list/${cat.id}/${page}.html`;

    const html = await request(url);
    const list = parseList(html);

    return { page, pagecount: list.length > 0 ? page + 1 : page, list };
}

async function detail(inReq, _outResp) {
    const id   = inReq.body.id;
    const url  = `${SITE}/detail/${id}.html`;
    const html = await request(url);
    const $    = load(html);

    const tracks = [];

    $('button.button a').each((i, el) => {
        const name    = $(el).text().trim() || `播放地址${i + 1}`;
        const href    = $(el).attr('href') || '';
        if (!href) return;
        const playUrl = href.startsWith('http') ? href : SITE + href;
        tracks.push(`${name}$${playUrl}`);
    });

    if (tracks.length === 0) {
        tracks.push(`播放$${SITE}/vodplay/${id}.html`);
    }

    const title = $('h1').first().text().trim() || '';
    const pic   = $('meta[property="og:image"]').attr('content') || '';

    return {
        list: [{
            vod_id:        id,
            vod_name:      title,
            vod_pic:       pic,
            vod_play_from: '播放線路',
            vod_play_url:  tracks.join('#'),
        }],
    };
}

async function play(inReq, _outResp) {
    const url = inReq.body.id;

    // 直接是 m3u8
    if (url.includes('.m3u8')) {
        return { parse: 0, url, header: HEADERS };
    }

    try {
        const html = await request(url);

        // var playUrl = '...'
        const m1 = html.match(/var\s+playUrl\s*=\s*'([^']+)'/);
        if (m1) return { parse: 0, url: m1[1], header: HEADERS };

        // 直接找 m3u8 链接
        const m2 = html.match(/https?:\/\/[^'"]+\.m3u8[^'"]*/);
        if (m2) return { parse: 0, url: m2[0], header: HEADERS };
    } catch (e) {
        console.error('play error:', e.message);
    }

    return { parse: 0, url: '', header: HEADERS };
}

async function search(inReq, _outResp) {
    const keyword = inReq.body.wd || '';
    const page    = Math.max(parseInt(inReq.body.page) || 1, 1);

    if (!keyword) return { list: [], page };

    try {
        const html = await request(`${SITE}/search/${encodeURIComponent(keyword)}.html`);
        const list = parseList(html);
        return { page, pagecount: list.length > 0 ? page + 1 : page, list };
    } catch (e) {
        console.error('search error:', e.message);
        return { list: [], page };
    }
}

export default {
    meta: { key: 'mitaotun', name: '🔥蜜桃臀', type: 3 },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
    },
};