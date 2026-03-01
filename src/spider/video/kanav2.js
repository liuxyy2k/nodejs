import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const site = 'https://kanav.ad';

async function request(reqUrl) {
    const resp = await axios.get(reqUrl, {
        headers: {
            'User-Agent': UA,
            'Referer': 'https://kanav.ad/',
        },
    });
    return resp.data;
}

function parseVods($) {
    const list = [];
    $('div.video-item').each((_, element) => {
        const pic  = $(element).find('img').attr('src') || '';
        const url  = $(element).find('a').attr('href') || '';
        const name = $(element).find('img').attr('alt') || '';
        if (pic.endsWith('.gif') || !name) return;
        list.push({ vod_id: url, vod_name: name, vod_pic: pic });
    });
    return list;
}

function extractVideoUrl(html) {
    // 提取 player_aaaa 变量
    const blockMatch = html.match(/var\s+player_aaaa\s*=\s*(\{[\s\S]*?\});/);
    if (!blockMatch) return null;

    const urlMatch = blockMatch[1].match(/"url"\s*:\s*"([^"]+)"/);
    if (!urlMatch) return null;

    try {
        // Base64 解码 → URL 解码
        const base64Decoded = Buffer.from(urlMatch[1], 'base64').toString('utf-8');
        return decodeURIComponent(base64Decoded);
    } catch (e) {
        return null;
    }
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const html = await request(site);
    const $    = load(html);

    const classes = [];
    $('div.header-links ul li.dropdown a').each((_, element) => {
        const typeName = $(element).find('span').text().trim();
        const typeId   = $(element).attr('href') || '';
        if (!typeName) return;
        classes.push({ type_id: typeId, type_name: typeName });
    });

    const list = parseVods($);
    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    // 第1页：/xxx.html，后续：/xxx/page/N.html
    const url = page > 1
        ? `${site}${tid.replace('.html', '')}/page/${page}.html`
        : `${site}${tid}`;

    const html = await request(url);
    const $    = load(html);
    const list = parseVods($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const id   = inReq.body.id;
    const html = await request(`${site}${id}`);
    const $    = load(html);

    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic  = $('meta[property="og:image"]').attr('content') || '';
    const year = $('meta[property="video:release_date"]').attr('content') || '';

    const videoUrl = extractVideoUrl(html) || '';

    return {
        list: [{
            vod_id:        id,
            vod_name:      name,
            vod_pic:       pic,
            vod_year:      year,
            vod_play_from: 'Kanav',
            vod_play_url:  `播放$${videoUrl}`,
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: {
            'User-Agent': UA,
            'Referer':    'https://kanav.ad/',
            'Origin':     'https://kanav.ad',
        },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const html = await request(`${site}/videos/list/keyword/${text}`);
    const $    = load(html);
    const list = parseVods($);
    return { list };
}

export default {
    meta: {
        key: 'kanav',
        name: 'Kanav',
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