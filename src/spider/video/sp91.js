import axios from 'axios';
import { load } from 'cheerio';
import { config } from './config.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://91porny.com';


// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...headers },
        // httpsAgent: agent
    });
    return resp.data;
}


function parseVods($) {
    const videos = [];
    $('.video-elem').each((_, element) => {
        let pic = $(element).find('.img').attr('style') || '';
        const match = pic.match(/background-image\s*:\s*url\(['"]?([^'")]+)['"]?\)/);
        let imageUrl = ''
        if (match) {
            if (match[1].startsWith('//')) {
              imageUrl = 'https:' + match[1];
            }
          }
        const url = $(element).find('a').attr('href') || '';
        const name = $(element).find('.title').text().trim();
        const time = $(element).find('.vip-layer').text().trim();
        if(!name) return;
        const parts = url.split('/');
        const id = parts[3] || url;
        videos.push({
            vod_id: id,
            vod_name: name,
            vod_pic: imageUrl,
            vod_remarks: time,
        });
    });
    return videos;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const typeIdList = ['latest', 'hd', 'recent-favorite', 'hot-list', 'recent-rating', 'nonpaid', 'ori', 'long-list', 'longer-list', 'month-discuss', 'top-favorite', 'most-favorite', 'top-list', 'top-last'];
    const typeNameList = ['最近更新', '高清视频', '最近加精', '当前最热', '最近得分', '非付费', '91原创', '10分钟以上', '20分钟以上', '本月讨论', '本月收藏', '收藏最多', '本月最热', '上月最热'];

    const classes = typeIdList.map((id, i) => ({
        type_id: id,
        type_name: typeNameList[i],
    }));

    // const html = await request(site);
    // const $ = load(html);
    // const list = parseVods($);

    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = inReq.body.page || 1;

    const url = `${site}/video/category/${tid}/${page}`;
    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { page: parseInt(page), pagecount: parseInt(page) + 1, list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const url = `${site}/video/view/${id}`;
    const html = await request(url);
    const $ = load(html);

    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic = $('meta[property="og:image"]').attr('content') || '';
    const des = $('meta[property="og:description"]').attr('content') || '';
    const year = $('meta[property="video:release_date"]').attr('content') || '';
    const video = $('#video-play').attr('data-src') || '';

    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_year: year,
            vod_content: des,
            vod_play_from: '91porny',
            vod_play_url: '播放$' + video,
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
        key: 'sp91',
        name: '🔥91porny',
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