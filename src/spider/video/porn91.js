import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const site = 'https://91porn.com/index.php';

async function request(reqUrl) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA },
    });
    return resp.data;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: 'ori',   type_name: '91原创' },
        { type_id: 'hot',   type_name: '当前最热' },
        { type_id: 'top',   type_name: '本月最热' },
        { type_id: 'long',  type_name: '10分钟以上' },
        { type_id: 'longer',type_name: '20分钟以上' },
        { type_id: 'tf',    type_name: '本月收藏' },
        { type_id: 'rf',    type_name: '最近加精' },
        { type_id: 'hd',    type_name: '高清' },
        { type_id: 'top&m=-1',    type_name: '每月最热' },
        { type_id: 'md',    type_name: '本月讨论' },
        { type_id: 'mf',    type_name: '收藏最多' },
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const id = inReq.body.id;
    const page = inReq.body.page || 1;
    let url = `${site}?category=${id}&viewtype=basic`;
    if (page > 1) url += `&page=${page}`;

    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.col-xs-12.col-sm-4.col-md-3.col-lg-3').each((_, element) => {
        const href = $(element).find('a').attr('href');
        const title = $(element).find('.video-title').text().trim();
        const cover = $(element).find('img').attr('src');
        const duration = $(element).find('.duration').text().trim();
        if (href) {
            videos.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: `${duration}`,
            });
        }
    });

    return { page: parseInt(page), list: videos };
}

async function detail(inReq, _outResp) {
    const url = inReq.body.id;
    const html = await request(url);

    const encodeMatch = html.match(/strencode2\(['"]([^'"]+)['"]\)/);
    let playUrl = '';
    if (encodeMatch) {
        const decoded = decodeURIComponent(encodeMatch[1]);
        const mp4Match = decoded.match(/src=['"](https?:\/\/[^'"]+\.mp4[^'"]*)['"]/);
        playUrl = mp4Match ? mp4Match[1] : '';
    }
    const $ = load(html);
    const title = $('h4').first().text().trim() || $('title').text().trim();
    const pic = $('meta[property="og:image"]').attr('content') || '';

    return {
        list: [{
            vod_id: url,
            vod_name: title,
            vod_pic: pic,
            vod_play_from: '91porn',
            vod_play_url: `播放$${playUrl}`,
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
    const page = inReq.body.pg || 1;
    const url = `${site}?search=${text}&searchtype=video&page=${page}`;

    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.col-xs-12.col-sm-4.col-md-3.col-lg-3').each((_, element) => {
        const href = $(element).find('a').attr('href');
        const title = $(element).find('.video-title').text().trim();
        const cover = $(element).find('img').attr('src');
        const duration = $(element).find('.duration').text().trim();
        if (href) {
            videos.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: `${duration}`,
            });
        }
    });

    return { list: videos };
}

export default {
    meta: {
        key: '91porn',
        name: '91Porn',
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