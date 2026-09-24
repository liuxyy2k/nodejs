import { load } from 'cheerio';
import req from '../../util/req.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const site = 'https://theporn.cc';

async function fetchPage(url, referer = '') {
    const headers = {
        'User-Agent': UA,
        Referer: referer || `${site}/`,
        Origin: site,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    };
    const resp = await req.get(url, { headers, timeout: 15000, responseType: 'text' });
    return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseVideoItem($, el) {
    try {
        const item   = $(el);
        const aTag   = item.find('a.av-link');
        const href   = aTag.attr('href') || '';
        if (!href) return null;

        const imgTag = item.find('img.cover-img');
        let cover    = imgTag.attr('data-src') || imgTag.attr('src') || '';
        if (cover && !cover.startsWith('http')) cover = site + cover;

        return {
            vod_id:      href.split('/').pop(),
            vod_name:    item.find('.av_data_title').text().trim(),
            vod_pic:     cover,
            vod_remarks: item.find('.duration').text().trim(),
        };
    } catch {
        return null;
    }
}

const MANUAL_CLASSES = [
    { type_id: 'categories/all',    type_name: '影片'     },
    { type_id: 'jav',               type_name: '日本AV'   },
    { type_id: 'eu',                type_name: '欧美'     },
    { type_id: 'vr',                type_name: 'VR'       },
    { type_id: 'video/best',        type_name: '最佳影片' },
    { type_id: 'jav/uncensored',    type_name: '日本无码' },
];

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    let classes = [...MANUAL_CLASSES];

    try {
        const data = await fetchPage(`${site}/categories`);
        const $    = load(data);
        const seen = new Set(classes.map((c) => c.type_id));

        $('.categories_list .categorie_item').each((_, el) => {
            const aTag = $(el).find('a');
            const name = aTag.text().trim();
            const href = aTag.attr('href') || '';
            if (!name || !href) return;
            const typeId = `categories/${href.split('/').pop()}`;
            if (seen.has(typeId)) return;
            seen.add(typeId);
            classes.push({ type_id: typeId, type_name: name });
        });
    } catch {
        // 抓取失败，使用手动分类
    }
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const pg   = parseInt(inReq.body.page) || 1;
    const url  = pg === 1 ? `${site}/${tid}` : `${site}/${tid}/${pg}`;

    const data = await fetchPage(url);
    const $    = load(data);

    let list = [];
    for (const selector of ['.video-list .avdata-outer', '.avdata-outer', '.video-list .card']) {
        const els = $(selector).toArray();
        if (els.length > 0) {
            list = els.map((el) => parseVideoItem($, el)).filter(Boolean);
            break;
        }
    }

    // 解析总页数
    let pagecount = 9999;
    try {
        let lastPage = 1;
        $('.pagination a').each((_, el) => {
            const href  = $(el).attr('href') || '';
            const match = href.match(/\/(\d+)$/);
            if (match) lastPage = Math.max(lastPage, parseInt(match[1]));
        });
        pagecount = lastPage;
    } catch { /* ignore */ }

    return { page: pg, pagecount, limit: 90, total: 999999, list };
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

async function play(inReq, _outResp) {
    const id = inReq.body.id;
    const data = await fetchPage(`${site}/video/${id}`);
    const $    = load(data);

    let src = '';

    // 优先从 script 中提取 hash_id
    $('script').each((_, el) => {
        if (src) return;
        const text  = $(el).html() || '';
        const match = text.match(/"hash_id":\s*"([a-f0-9]+)"/);
        if (match) {
            src = `https://b2.bttss.cc/videos/${match[1]}/g.m3u8?h=3121efe8979c635`;
        }
    });

    // 降级：直接取 video src
    if (!src) {
        src = $('video#video-player_html5_api').attr('src') || '';
    }

    return {
        parse:  0,
        url:    src,
        header: { 'User-Agent': UA, Referer: `${site}/`, Origin: site },
    };
}

async function search(inReq, _outResp) {
    const key = encodeURIComponent(inReq.body.wd || '');
    const pg  = parseInt(inReq.body.pg) || 1;
    const url = pg === 1 ? `${site}/search/${key}` : `${site}/search/${key}/${pg}`;

    const data = await fetchPage(url);
    const $    = load(data);

    for (const selector of ['.search-results .video-item', '.video-list .avdata-outer', '.avdata-outer']) {
        const els = $(selector).toArray();
        if (els.length > 0) {
            return { list: els.map((el) => parseVideoItem($, el)).filter(Boolean) };
        }
    }

    return { list: [] };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'theporn',
        name: '🔥ThePorn',
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