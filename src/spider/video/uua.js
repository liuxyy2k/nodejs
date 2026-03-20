import axios from 'axios';
import { load } from 'cheerio';

const UA   = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const site = 'https://www.uaa.com';

async function request(url) {
    const resp = await axios.get(url, {
        headers: { 'User-Agent': UA },
    });
    return resp.data;
}

function parseVods($) {
    const list = [];
    $('li.video_li').each((_, e) => {
        const href    = $(e).find('.title a').attr('href') || '';
        const title   = $(e).find('.title a').text();
        const cover   = $(e).find('.cover').attr('src') || $(e).find('.cover').attr('data-cfsrc') || '';
        const pubdate = $(e).find('span').first().text();
        list.push({
            vod_id:      href,
            vod_name:    title,
            vod_pic:     cover,
            vod_remarks: pubdate,
        });
    });
    return list;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: JSON.stringify({ tip: 'chinese-av-porn', origin: 1 }), type_name: '国产视频' },
        { type_id: JSON.stringify({ tip: 'jav',             origin: 1 }), type_name: '日本AV'   },
        { type_id: JSON.stringify({ category: '无码流出',   origin: 2 }), type_name: '无码流出' },
        { type_id: JSON.stringify({ origin: 3 }),                         type_name: 'H动漫'     },
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const page = Math.max(parseInt(inReq.body.page) || 1, 1);
    const ext  = JSON.parse(inReq.body.id);
    const { tip, category: cat, origin } = ext;

    let url = site;

    if (tip) {
        url += `/${tip}`;
        if (page > 1) url += `?origin=${origin}&sort=1&page=${page}`;
    } else {
        url += `/video/list?`;
        if (cat && origin) url += `category=${encodeURIComponent(cat)}&origin=${origin}`;
        else if (origin)   url += `origin=${origin}`;
        if (page > 1)      url += `&sort=1&page=${page}`;
    }

    const html = await request(url);
    const $    = load(html);
    const list = parseVods($);

    return { page, pagecount: list.length > 0 ? page + 1 : page, list };
}

async function detail(inReq, _outResp) {
    const id   = inReq.body.id;
    const url  = id.startsWith('http') ? id : `${site}${id}`;
    const html = await request(url);
    const $    = load(html);

    const videoUrl = $('#mui-player').attr('src') || '';

    return {
        list: [{
            vod_id:        id,
            vod_name:      '',
            vod_pic:       '',
            vod_play_from: '有爱爱',
            vod_play_url:  `播放$${videoUrl}`,
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse:  0,
        url:    inReq.body.id,
        header: {
            'User-Agent': UA,
            'Referer':    `${site}/`,
            'Origin':     site,
        },
    };
}

async function search(inReq, _outResp) {
    const page = Math.max(parseInt(inReq.body.page) || 1, 1);
    const text = encodeURIComponent(inReq.body.wd);

    const url = page > 1
        ? `${site}/video/list?keyword=${text}&category=&origin=&tag=&sort=0&page=${page}`
        : `${site}/video/list?searchType=1&keyword=${text}`;

    const html = await request(url);
    const $    = load(html);
    const list = parseVods($);

    return { page, pagecount: list.length > 0 ? page + 1 : page, list };
}

export default {
    meta: { key: 'uaa', name: '有爱爱', type: 3 },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
    },
};