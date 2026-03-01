import axios from 'axios';
import { load } from 'cheerio';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://www.qsetv.com';

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...headers }
    });
    return resp.data;
}

function parseVods($) {
    const videos = [];
    $('.video-card').each((_, element) => {
        const pic = $(element).find('img').attr('src') || '';
        const url = $(element).find('a').attr('href') || '';
        const name = $(element).find('h3').text().trim();
        if (pic.endsWith('.gif') || !name) return;
        videos.push({
            vod_id: url,
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
        { type_id: '/type/4-国产原创', type_name: '国产原创' },
        { type_id: '/type/5-日韩精选', type_name: '日韩精选' },
        { type_id: '/type/10-欧美风情', type_name: '欧美风情' },
        { type_id: '/type/11-动漫次元', type_name: '动漫次元' },
        { type_id: '/type/37-三级伦理', type_name: '三级伦理' },
    ];

    return { class: classes,filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    let url = `${site}${tid}?page=${page}`;
    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const url = `${site}${id}`;
    const html = await request(url);
    const $ = load(html);

    const name = $('meta[property="keywords"]').attr('content') || '';
    const pic = '';
    const year = '';
    const play = $('iframe').attr('src')
    const urls = new URL(play);
    const m3u8 = urls.searchParams.get('src');
    console.log(m3u8)
    let playUrl = '';
    playUrl = decodeURIComponent(m3u8)
    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_year: year,
            vod_play_from: '去色Tv',
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
    const url = `${site}/search?keywords=${text}`;
    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { list };
}

export default {
    meta: {
        key: '去色Tv',
        name: '去色Tv',
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