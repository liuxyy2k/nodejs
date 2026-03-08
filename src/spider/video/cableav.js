import axios from 'axios';
import { load } from 'cheerio';

// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://cableav.video';

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...headers },
        // httpsAgent: agent
    });
    return resp.data;
}

function parseVods($) {
    const videos = [];
    $('.post-item-wrap').each((_, element) => {
        const pic = $(element).find('.blog-picture').attr('data-src') || '';
        const url = $(element).find('.blog-img').attr('href') || '';
        const name = $(element).find('.entry-title').text().trim();
        const remark = $(element).find('.category-item').text().trim();
        if (pic.endsWith('.gif') || !name) return;
        videos.push({
            vod_id: url,
            vod_name: name,
            vod_pic: site + pic,
            vod_remarks: remark
        });
    });
    return videos;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '/latest', type_name: '最新发布' },
        { type_id: '/guochanxinpian', type_name: '国产新片' },
        { type_id: '/search-探花', type_name: '探花偷拍' },
        { type_id: '/rihanwuma', type_name: '日韩无码' },
        { type_id: '/rihanyouma', type_name: '日韩有码' },
    ];

    return { class: classes,filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    let url = `${site}${tid}-${page}.html`;
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
    let playUrl = '';
    const name = $('.entry-header h1').text().trim() || '';
    const pic = '';
    const description = $('meta[name="description"]').attr('content') || '';
    const src = $('.embed-responsive-item').attr('src') || '';
    playUrl = src.split('video=')[1]
    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_play_from: 'cableav',
            vod_play_url: '第1集$' + playUrl,
            vod_content: description
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: { 'User-Agent': UA,'Referer': site + '/' },
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
        key: 'cableav',
        name: 'CableAv',
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