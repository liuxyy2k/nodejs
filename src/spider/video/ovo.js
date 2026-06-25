import axios from 'axios';
import { load } from 'cheerio';
import vm from 'node:vm';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const site = 'https://404cn.net';

// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

async function request(url, headers = {}) {
    const resp = await axios.get(url, {
        headers: { 'User-Agent': UA, ...headers },
        // httpsAgent: agent
    });
    return resp.data;
}

function parseCards($) {
    const list = [];
    $('.thumb--videos').each((_, element) => {
        const href     = $(element).find('a').attr('href') || '';
        const title    = $(element).find('.thumb-spot__title').text().trim();
        const cover    = $(element).find('img').attr('src') || '';
        const subTitle = $(element).find('.thumb-spot__data li').eq(0).text().trim();
        if (!href || !title) return;
        list.push({
            vod_id:      href,
            vod_name:    title,
            vod_pic:     cover,
            vod_remarks: subTitle,
        });
    });
    return list;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: site + '/videos/',   type_name: '视频' },
    ];
    let url = site + '/categories/'
    const html = await request(url);
    const $ = load(html);
    $('.thumb--categories').each((_, element) => {
        const typeId = $(element).find('a').attr('href');
        const typeName = $(element).find('.thumb-spot__title').text().trim() || ''
        if(typeName && typeId) {
            classes.push (
                {
                    type_id: typeId,
                    type_name: typeName
                }
            )
        }
    }); 
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    let url  = `${tid}${page}/` 
    const html = await request(url);
    const $    = load(html);
    const list = parseCards($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const href = inReq.body.id;
    const html = await request(href);
    const $    = load(html);
    const match = html.match(/var\s+flashvars\s*=\s*(\{[\s\S]*?\})\s*;/);

    let videoId = ''
    let playUrl = ''
    let name = ''
    let playFrom = ''
    let playUrls = []
    let pic = ''
    if (match) {
        const objStr = match[1];
        const obj = vm.runInNewContext(`(${objStr})`);

        pic = obj.preview_url
        playUrl = obj.video_url
        name = obj.video_title
        videoId = obj.video_id
    }

    return {
        list: [{
            vod_id:        videoId,
            vod_name:      name,
            vod_pic:       pic,
            vod_play_from: 'ovo',
            vod_play_url:  `播放$${playUrl}`,
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

    const html = await request(`${site}/search/${text}/`);
    const $    = load(html);
    const list = parseCards($);

    return { list };
}

export default {
    meta: {
        key: 'ovo',
        name: '🔥OvoJav',
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