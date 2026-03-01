import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const site = 'https://www.kbjfan.com';

async function request(url) {
    const resp = await axios.get(url, {
        headers: { 'User-Agent': UA },
    });
    return resp.data;
}

function parseCards($) {
    const list = [];
    $('.posts-item').each((_, element) => {
        const href    = $(element).find('.item-heading a').attr('href') || '';
        const title   = $(element).find('.item-heading a').text().trim();
        const cover   = $(element).find('.item-thumbnail img').attr('data-src') || '';
        const pubdate = $(element).find('.meta-author span').text().trim();
        if (!href || !title) return;
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
        { type_id: 'koreanbjdance', type_name: 'Korean BJ Dance' },
        { type_id: 'koreanbjnude',  type_name: 'Korean BJ Nude'  },
    ];

    const html = await request(`${site}/koreanbjdance`);
    const $    = load(html);
    const list = parseCards($);

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    const url  = page > 1 ? `${site}/${tid}/page/${page}` : `${site}/${tid}`;
    const html = await request(url);
    const $    = load(html);
    const list = parseCards($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const href = inReq.body.id;
    const html = await request(href);
    const $    = load(html);

    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic  = $('meta[property="og:image"]').attr('content') || '';

    const playParts = [];
    const playlist  = $('.dplayer-featured a');

    if (playlist.length) {
        playlist.each((_, element) => {
            const name = $(element).text().trim();
            const url  = $(element).attr('video-url') || '';
            if (url) playParts.push(`${name}$${url}`);
        });
    } else {
        const url = $('#posts-pay .new-dplayer').attr('video-url') || '';
        if (url) playParts.push(`播放$${url}`);
    }

    return {
        list: [{
            vod_id:        href,
            vod_name:      name,
            vod_pic:       pic,
            vod_play_from: 'kbjfan',
            vod_play_url:  playParts.join('#'),
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
    const text = encodeURIComponent(inReq.body.wd || '');
    const page = parseInt(inReq.body.pg) || 1;

    const url  = page > 1
        ? `${site}/page/${page}/?s=${text}`
        : `${site}/?s=${text}`;

    const html = await request(url);
    const $    = load(html);
    const list = parseCards($);

    return { list };
}

export default {
    meta: {
        key: 'kbjfan',
        name: 'KBJFan',
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