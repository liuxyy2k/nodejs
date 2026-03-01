import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://www.dnaav.com';

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...headers },
    });
    return resp.data;
}

function parseVods($) {
    const videos = [];
    $('div.list_box ul a').each((_, element) => {
        const pic = $(element).find('li.image img').attr('img') || '';
        const url = $(element).attr('href') || '';
        const name = $(element).find('li.title').text().trim();
        if (pic.endsWith('.gif') || !name) return;
        const parts = url.split('/');
        const id = parts[2] || url;
        videos.push({
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
        });
    });
    return videos;
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

    const html = await request(site);
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

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const url = `${site}/embed/${id}`;
    const html = await request(url);
    const $ = load(html);

    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic = $('meta[property="og:image"]').attr('content') || '';
    const year = $('meta[property="video:release_date"]').attr('content') || '';

    let playUrl = '';
    const match = html.match(/const\s+url\s*=\s*['"]([^'"]+\.m3u8)['"]/);
    if (match) {
        playUrl = `第1集$${match[1]}`;
    }

    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_year: year,
            vod_play_from: 'Dnaav',
            vod_play_url: playUrl,
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: { 'User-Agent': UA },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const url = `${site}/search?keywords=${text}`;
    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { list };
}

export default {
    meta: {
        key: 'dnaav',
        name: 'Dnaav',
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