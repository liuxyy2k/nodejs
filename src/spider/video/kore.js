import axios from 'axios';
import { load } from 'cheerio';
// import { HttpsProxyAgent } from 'https-proxy-agent';
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const site = 'https://koreanpornmovie.com';

async function request(reqUrl) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA },
        // httpsAgent: agent,
    });
    return resp.data;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '',          type_name: '首页' },
        { type_id: '18-movies', type_name: '三级' },
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tip = inReq.body.id;
    const page = inReq.body.page || 1;
    const url = tip
        ? `${site}/tag/${tip}/page/${page}/`
        : `${site}/page/${page}/`;

    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('#main .videos-list article').each((_, element) => {
        const href = $(element).find('a').attr('href');
        const title = $(element).find('a').attr('title');
        const cover = $(element).find('img').attr('data-src') || $(element).find('img').attr('src');
        const duration = $(element).find('.duration').text();
        if (href) {
            videos.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: duration,
            });
        }
    });

    return { page: parseInt(page), list: videos };
}

async function detail(inReq, _outResp) {
    const url = inReq.body.id;
    const html = await request(url);
    const $ = load(html);

    const title = $('h1').first().text().trim();
    const pic = $('meta[property="og:image"]').attr('content') || '';

    const videourl = $('meta[itemprop="contentURL"]').attr('content') || '';

    return {
        list: [{
            vod_id: url,
            vod_name: title,
            vod_pic: pic,
            vod_play_from: '默认',
            vod_play_url: `播放$${videourl}`,
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: {
            'User-Agent': UA,
            'Referer': `${site}/`,
        },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const page = inReq.body.pg || 1;
    const url = `${site}/page/${page}/?s=${text}`;

    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('section #main article').each((_, element) => {
        const href = $(element).find('a').attr('href');
        const title = $(element).find('a').attr('title');
        const cover = $(element).find('img').attr('data-src') || $(element).find('img').attr('src');
        const duration = $(element).find('.duration').text();
        if (href) {
            videos.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: duration,
            });
        }
    });

    return { list: videos };
}

export default {
    meta: {
        key: 'koreanpornmovie',
        name: '🔥KoreaPorn',
        type: 3
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