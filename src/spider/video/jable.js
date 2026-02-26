import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const site = 'https://jable.tv';

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...headers },
    });
    return resp.data;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classurl = `${site}/categories/?mode=async&function=get_block&block_id=list_categories_video_categories_list&sort_by=avg_videos_popularity`;
    const html = await request(classurl);
    const $ = load(html);

    let classes = [];
    const ignore = ['首页'];
    $('.container .col-6.col-sm-4.col-lg-3').each((_, e) => {
        const name = $(e).find('h4').text();
        const href = $(e).find('a').attr('href');
        if (!name || ignore.some(i => name.includes(i))) return;
        classes.push({ type_id: href, type_name: name });
    });

    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const typeurl = inReq.body.id;
    const page = inReq.body.page || 1;

    const url = `${typeurl}?mode=async&function=get_block&block_id=list_videos_common_videos_list&sort_by=post_date&from=${page}&_=${Date.now()}`;
    const html = await request(url, {
        'referer': typeurl,
        'Origin': site,
        'X-requested-with': 'XMLHttpRequest',
    });
    const $ = load(html);

    let videos = [];
    $('#list_videos_common_videos_list .container .row > div').each((_, element) => {
        const href = $(element).find('.title a').attr('href');
        const title = $(element).find('.title a').text();
        const cover = $(element).find('.img-box img').attr('data-src');
        const duration = $(element).find('.label').text();
        if (href) {
            videos.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: duration,
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
        const script = $('#site-content .container .col').eq(0).find('section').eq(0).find('script:last').text();
        playUrl = script.match(/var hlsUrl = '(.*)';/)[1];
    } catch (e) {}

    const title = $('h1').first().text().trim();
    const pic = $('.detail-header img').attr('src') || '';

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
        header: { 'User-Agent': UA, 'Referer': site },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const page = inReq.body.pg || 1;
    const url = `${site}/search/${text}/?mode=async&function=get_block&block_id=list_videos_videos_list_search_result&q=${text}&sort_by=&from=${page}&_=${Date.now()}`;

    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('#list_videos_videos_list_search_result .container .row > div').each((_, element) => {
        const href = $(element).find('.title a').attr('href');
        const title = $(element).find('.title a').text();
        const cover = $(element).find('.img-box img').attr('data-src');
        const duration = $(element).find('.label').text();
        if (href) {
            videos.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: duration,
            });
        }
    });

    return { list: videos };
}

export default {
    meta: {
        key: 'jable',
        name: 'Jable',
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