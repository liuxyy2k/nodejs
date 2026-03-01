import axios from 'axios';
import { load } from 'cheerio';
import CryptoJS from 'crypto-js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const site = 'https://kanav.ad';
async function request(reqUrl) {
    const resp = await axios.get(reqUrl, {
       headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Referer': site + '/'
        },
    });
    return resp.data;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '1',  type_name: '中文字幕' },
        { type_id: '2',  type_name: '日韩有码' },
        { type_id: '3',  type_name: '日韩无码' },
        { type_id: '4',  type_name: '国产AV' },
        { type_id: '30', type_name: '自拍泄密' },
        { type_id: '31', type_name: '探花约炮' },
        { type_id: '32', type_name: '主播录制' },
        { type_id: '20', type_name: '动漫番剧' },
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const id = inReq.body.id;
    const page = inReq.body.page || 1;
    const url = `${site}/index.php/vod/type/id/${id}/page/${page}.html`;
    console.log(url)
    const html = await request(url);
    console.log(html)
    const $ = load(html);

    let videos = [];
    $('.post-list .col-md-3').each((_, element) => {
        const videoItem = $(element).find('.video-item');
        const entryTitle = $(element).find('.entry-title');
        const vodUrl = entryTitle.find('a').attr('href');
        const vodPic = videoItem.find('.featured-content-image a img').attr('data-original');
        const vodName = entryTitle.find('a').text().trim();
        const remark = videoItem.find('span.model-view-left').text().trim();
        const duration = videoItem.find('span.model-view').text().trim();

        if (vodUrl) {
            videos.push({
                vod_id: `${site}${vodUrl}`,
                vod_name: vodName,
                vod_pic: vodPic,
                vod_remarks: remark,
            });
        }
    });

    return { page: parseInt(page), list: videos };
}

async function detail(inReq, _outResp) {
    const url = inReq.body.id;
    const html = await request(url);
    const $ = load(html);

    let playUrl = '';
    try {
        const player = $('script:contains(player_aaaa)').text().replace('var player_aaaa=', '');
        const encodedUrl = JSON.parse(player).url;
        const base64Decoded = CryptoJS.enc.Base64.parse(encodedUrl).toString(CryptoJS.enc.Utf8);
        playUrl = decodeURIComponent(base64Decoded);
    } catch (e) {}

    const title = $('h1').first().text().trim();
    const pic = $('.featured-content-image img').attr('src') || '';

    return {
        list: [{
            vod_id: url,
            vod_name: title,
            vod_pic: pic,
            vod_play_from: '默认',
            vod_play_url: `播放$${playUrl}`,
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: {
            'User-Agent': UA,
            'Referer': 'https://kanav.ad/',
        },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const page = inReq.body.pg || 1;
    const url = `${site}/index.php/vod/search/by/time_add/page/${page}/wd/${text}.html`;

    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.post-list .col-md-3').each((_, element) => {
        const videoItem = $(element).find('.video-item');
        const entryTitle = $(element).find('.entry-title');
        const vodUrl = entryTitle.find('a').attr('href');
        const vodPic = videoItem.find('.featured-content-image a img').attr('data-original');
        const vodName = entryTitle.find('a').text().trim();
        const remark = videoItem.find('span.model-view-left').text().trim();

        if (vodUrl) {
            videos.push({
                vod_id: `${site}${vodUrl}`,
                vod_name: vodName,
                vod_pic: vodPic,
                vod_remarks: remark,
            });
        }
    });

    return { list: videos };
}

export default {
    meta: {
        key: 'kanav',
        name: 'KanAV',
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