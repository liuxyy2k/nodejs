import axios from 'axios';
import { load } from 'cheerio';

// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://jmmbus.com';

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...headers },
        // httpsAgent: agent
    });
    return resp.data;
}

function parseVods($) {
    const videos = [];
    $('.thumbnail').each((_, element) => {
        const pic = $(element).find('.lozad').attr('src') || '';
        const url = $(element).find('a').eq(0).attr('href') || '';
        const name = $(element).find('.text-nord4').text().trim();
        const remark = $(element).find('.vod-duration').text().trim();
        if (pic.endsWith('.gif') || !name) return;
        videos.push({
            vod_id: url,
            vod_name: name,
            vod_pic: pic,
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
        { type_id: '/vodtype/27', type_name: '黑暗爆料' },
        { type_id: '/vodtype/28', type_name: '强奸乱伦' },
        { type_id: '/vodtype/29', type_name: '自拍偷拍' },
        { type_id: '/vodtype/30', type_name: '淫乱学生' },
        { type_id: '/vodtype/31', type_name: '社交网红' },
        { type_id: '/vodtype/33', type_name: '日韩有码' },
        { type_id: '/vodtype/32', type_name: '国产传媒' },
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
    const name = $('.space-y-4 h1').text().trim() || '';
    const pic = '';
    const description = $('meta[name="description"]').attr('content') || '';
    const match = html.match(/var\s+player_.*?=(\{.*?\})/);
    const obj = new Function("return " + match[1])();
    
    playUrl = site + obj.url
    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_play_from: '99porn',
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
        key: '99porn',
        name: '99porn',
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