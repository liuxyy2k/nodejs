import req from '../../util/req.js';
import { load } from 'cheerio';
import CryptoJS from 'crypto-js';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2_1 like Mac OS X)AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';
const site = 'https://kanav.info';

async function request(reqUrl) {
    const resp = await req.get(reqUrl, {
        headers: {
            'User-Agent': UA,
        },
    });
    return resp.data;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    let classes = [
        { type_id: '1',  type_name: '中文字幕' },
        { type_id: '2',  type_name: '日韩有码' },
        { type_id: '3',  type_name: '日韩无码' },
        { type_id: '4',  type_name: '国产AV'   },
        { type_id: '30', type_name: '自拍泄密' },
        { type_id: '31', type_name: '探花约炮' },
        { type_id: '32', type_name: '主播录制' },
        { type_id: '20', type_name: '动漫番剧' },
    ];
    return {
        class: classes,
        filters: {},
    };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg = inReq.body.page;
    let page = pg || 1;
    if (page == 0) page = 1;

    const url = `${site}/index.php/vod/type/id/${tid}/page/${page}.html`;
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
        const duration = videoItem.find('span.model-view').text().trim();

        if (vodUrl) {
            videos.push({
                vod_id: `${site}${vodUrl}`,
                vod_name: vodName,
                vod_pic: vodPic,
                vod_remarks: remark + (duration ? ` ${duration}` : ''),
            });
        }
    });

    return {
        page: parseInt(page),
        list: videos,
    };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id; // 完整url
    const html = await request(id);
    const $ = load(html);

    // 解析加密播放地址
    let vod_play_url = '';
    try {
        const playerScript = $('script:contains(player_aaaa)').text().replace('var player_aaaa=', '');
        const encodedUrl = JSON.parse(playerScript).url;
        const base64Decoded = CryptoJS.enc.Base64.parse(encodedUrl).toString(CryptoJS.enc.Utf8);
        const decodedUrl = decodeURIComponent(base64Decoded);
        vod_play_url = `播放$${decodedUrl}`;
    } catch (e) {
        vod_play_url = '';
    }

    const title = $('h1').first().text().trim();
    const pic = $('.featured-content-image img').attr('src') || '';

    return {
        list: [
            {
                vod_id: id,
                vod_name: title,
                vod_pic: pic,
                vod_play_from: '默认',
                vod_play_url,
            },
        ],
    };
}

async function play(inReq, _outResp) {
    const url = inReq.body.id;
    return {
        parse: 0,
        url: url,
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
        const duration = videoItem.find('span.model-view').text().trim();

        if (vodUrl) {
            videos.push({
                vod_id: `${site}${vodUrl}`,
                vod_name: vodName,
                vod_pic: vodPic,
                vod_remarks: remark + (duration ? ` ${duration}` : ''),
            });
        }
    });

    return {
        list: videos,
    };
}

export default {
    meta: {
        key: 'kanav',
        name: 'KanAV',
        type: 3,
        indexs: 1,
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