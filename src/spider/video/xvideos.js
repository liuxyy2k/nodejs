import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://www.xvideos.com';

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...headers },
    });
    return resp.data;
}

function parseVods($) {
    const videos = [];
    $('div.thumb-block').each((_, element) => {
        try {
            const pic = $(element).find('div.thumb img').attr('data-src') || '';
            const id = $(element).find('a').attr('href') || '';
            const name = $(element).find('p.title a').attr('title') || '';
            if (!id || !name) return;
            videos.push({
                vod_id: id,
                vod_name: name,
                vod_pic: pic,
            });
        } catch (e) {}
    });
    return videos;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [];
    const html = await request(site);
    const $ = load(html);

    $('div#nav > nav > ul > li:nth-child(2) ul li').each((_, element) => {
        try {
            const typeId = $(element).find('a').attr('href') || '';
            const typeName = $(element).find('a').text().trim();
            if (typeId && typeName) {
                classes.push({ type_id: typeId, type_name: typeName });
            }
        } catch (e) {}
    });

    const cateHtml = await request(`${site}/best/`);
    const $2 = load(cateHtml);
    const list = parseVods($2);

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    const url = `${site}${tid}/${page}`;
    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const url = `${site}${id}/`;
    const html = await request(url);
    const $ = load(html);

    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic = $('meta[property="og:image"]').attr('content') || '';

    let playUrl = '';
    const match = html.match(/"contentUrl": "(.*?)",/);
    if (match) {
        playUrl = match[1];
    }

    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_play_from: 'XVideos',
            vod_play_url: '播放$' + playUrl,
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
    const url = `${site}/?k=${text}&p=1`;
    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { list };
}

export default {
    meta: {
        key: 'xvideos',
        name: 'XVideos',
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