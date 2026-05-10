import axios from 'axios';
import { load } from 'cheerio';
import { config } from './config.js';
import CryptoJS from 'crypto-js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://www.r1091.com';

import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');


async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA },
        httpsAgent: agent
    });
    return resp.data;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    let classes = [
        { type_id: 'https://www.r1091.com//latest-updates/',        type_name: '最近上传' },
        { type_id: 'https://www.r1091.com//most-favourited/',         type_name: '收藏最多' },
        { type_id: 'https://www.r1091.com//most-popular/', type_name: '热门视频' }
    ];
    let url = `${site}/categories/`
    const html = await request(url)
    const $ = load(html);
    $('.thumb').each((_, element) => {
        const href = $(element).find('a').attr('href') || ''
        const name = $(element).find('a').attr('title') || ''
        classes.push (
            {
                type_id: href,
                type_name: name
            }
        )
    }); 
    let filterObj = {}
    return { class: classes, filters: filterObj };
}

async function category(inReq, _outResp) {
    const typeurl = inReq.body.id;
    const page = inReq.body.page || 1;
    let url = `${typeurl}?mode=async&function=get_block&block_id=list_videos_latest_videos_list&sort_by=post_date&from=&${page}&_=${Date.now()}`;
    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.thumb').each((_, element) => {
        const href = $(element).find('a').attr('href');
        const title = $(element).find('.title').text().trim() || '';
        const cover = $(element).find('.lazy-load').attr('data-webp');
        const time = $(element).find('.time').text();
        const type = $(element).find('.qualtiy').text();
        if (href) {
            videos.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: time + ' ' + type,
            });
        }
    });

    return { page: parseInt(page), list: videos };
}



async function detail(inReq, _outResp) {
    const url = inReq.body.id;
    let html = await request(url);
    const $ = load(html);
    console.log(html)
    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic  = $('meta[property="og:image"]').attr('content') || '';
    const description = $('meta[property="og:description"]').attr('content') || '';
    // const json = $('script[type="application/ld+json"]').text() || '';
    // const data = JSON.parse(json)
    // const embedResp = await request(data.embedUrl);
    // const videoUrl = embedResp.match(/video_url:\s*'([^']+)'/)?.[1];
    let videoUrls = []
    $('.video-js source').each((_, element) => {
        const videoUrl = $(element).attr('src');
        videoUrls.push(videoUrl)
    });
        // 拼接播放地址（多线路用#隔开）
    const playUrl = videoUrls.map((item, index) => {
        return `播放${index + 1}$${item}`;
    }).join('#');
    return {
        list: [{
            vod_id: url,
            vod_name: name,
            vod_pic: pic,
            vod_play_from: '91热爆',
            vod_play_url: playUrl
        }]
    };
}

async function play(inReq, _outResp) {
    const id = inReq.body.id
    return {
        parse: 0,
        url: id,
        header: { 'User-Agent': UA, 'Referer': site + '/' },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const page = inReq.body.pg || 1;
    const url = `${site}/vod/search.html?wd=${text}`;

    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.thumb').each((_, element) => {
        const href = $(element).find('a').attr('href');
        const title = $(element).find('.title').text().trim() || '';
        const cover = $(element).find('.lazy-load').attr('data-webp');
        const time = $(element).find('.time').text();
        const type = $(element).find('.qualtiy').text();
        if (href) {
            videos.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: time + ' ' + type,
            });
        }
    });

    return { list: videos };
}

export default {
    meta: {
        key: '91rb',
        name: '🔥91热爆',
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