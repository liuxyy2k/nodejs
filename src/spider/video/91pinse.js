import axios from 'axios';
import { load } from 'cheerio';
import { config } from './config.js';
import CryptoJS from 'crypto-js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://91pinse.com';

// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');


async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA },
        // httpsAgent: agent
    });
    return resp.data;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    let classes = [
        { type_id: '',   type_name: '首页' },
        { type_id: '/v/',        type_name: '最新视频' },
        { type_id: '/v/hot/',         type_name: '热门视频' },
        { type_id: '/rank/recently-featured', type_name: '精选视频' },
        { type_id: '/rank/current-hot',       type_name: '当前热门' },
        { type_id: '/rank/month-hot',     type_name: '月度趋势' },
        { type_id: '/rank/month-favorite',        type_name: '月度收藏' },
    ];
    
    let filterObj = {
    }
    return { class: classes, filters: filterObj };
}

async function category(inReq, _outResp) {
    const typeurl = inReq.body.id;
    const page = inReq.body.page || 1;
    let url = `${site}${typeurl}?page=${page}`;
    if(typeurl === '') {
        url = `${site}`;
    }
    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.group').each((_, element) => {
        const href = $(element).find('a').attr('href');
        const title = $(element).find('.link-hover').text().trim() || '';
        const cover = $(element).find('img').attr('src');
        const time = $(element).find('.left-1').text();
        const type = $(element).find('.right-1').text();
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
    let html = await request(site + url);
    const $ = load(html);

    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic  = $('meta[property="og:image"]').attr('content') || '';
    const description = $('meta[property="og:description"]').attr('content') || '';
    html = html.replace(/\\u003D/g, '=');

    let results = [];
    let regex = /['"]([A-Za-z0-9+/=]{100,})['"]/g; // 长一点，避免误匹配
    let m;

    while ((m = regex.exec(html)) !== null) {
        try {
            let decoded = Buffer.from(m[1], 'base64').toString();

            if (decoded.includes('.m3u8')) {
                results.push(decoded);
            }
        } catch(e){}
    }
    return {
        list: [{
            vod_id: url,
            vod_name: name,
            vod_pic: pic,
            vod_play_from: '91pinse',
            vod_play_url: url ? `播放$${results[0]}` : ''
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
    $('.group').each((_, element) => {
        const href = $(element).find('a').attr('href');
        const title = $(element).find('.link-hover').text().trim() || '';
        const cover = $(element).find('img').attr('src');
        const time = $(element).find('.left-1').text();
        const type = $(element).find('.right-1').text();
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
        key: '91pinse',
        name: '91Pinse',
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