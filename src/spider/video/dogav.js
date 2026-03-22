import axios from 'axios';
import { load } from 'cheerio';
// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const site = 'https://dogjav.com';

async function request(url, headers = {}) {
    const resp = await axios.get(url, {
        headers: { 'User-Agent': UA, ...headers },
        // httpsAgent: agent
    });
    return resp.data;
}

function parseCards($) {
    const list = [];
    $('.video').each((_, element) => {
        const title = $(element).find('.title a').text();
        const href     = $(element).find('.image').attr('href') || '';
        const subTitle = $(element).find('.duration').text().trim();
        const pic    = $(element).find('img').attr('src') || '';

        list.push({
            vod_id:      href,
            vod_name:    title,
            vod_pic:     site + pic,
            vod_remarks: subTitle,
        });
    });
    return list;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const html = await request(`${site}/categories/`);
    const $    = load(html);
    const classes = [
        {
            type_id: '/videos/',
            type_name: 'All'
        }
    ];
    $('.category').each((_, e) => {
        const name = $(e).find('.category-title').text().trim();
        const href = $(e).find('a.image').attr('href') || '';
        classes.push({
            type_id:   href,
            type_name: `${name}`,
        });
    });

    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    const url  = `${site}${tid}${page > 1 ? page : ''}/`;
    console.log(url)
    const html = await request(url);
    const $    = load(html);
    const list = parseCards($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const href = inReq.body.id;
    href.split('/')
    const playerUrl = `${site}/${href.split('/')[1]}/${encodeURIComponent(href.split('/')[2])}/`;
    const html   = await request(playerUrl, { Referer: playerUrl });
    const $    = load(html);
    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic = $('meta[property="og:image"]').attr('content') || '';
    const des = $('meta[property="og:description"]').attr('content') || '';
    const playUrl = $('#player-fluid').find('source').attr('src');
    return {
        list: [{
            vod_id:        href,
            vod_name:      name,
            vod_pic:       pic,
            vod_play_from: 'dogAV',
            vod_play_url:  `播放$${playUrl}`,
            vod_content: des
        }],
    };
}

async function play(inReq, _outResp) {
    const url = inReq.body.id;
    return {
        parse: 0,
        url,
        header: {
            'User-Agent': UA,
            'Referer': site + '/',
        },
    };
}

async function search(inReq, _outResp) {
    const text =  (inReq.body.wd || '');
    const page = parseInt(inReq.body.pg) || 1;

    const html = await request(`${site}/search/video/?s=${text}`);
    const $    = load(html);
    const list = parseCards($);

    return { list };
}

export default {
    meta: {
        key: 'dogav',
        name: 'DogAv',
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