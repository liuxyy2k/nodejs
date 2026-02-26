import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const site = 'https://hanime1.me';

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
        { type_id: `${site}/search?genre=%E8%A3%8F%E7%95%AA`,       type_name: '里番' },
        { type_id: `${site}/search?genre=%E6%B3%A1%E9%BA%B5%E7%95%AA`, type_name: '泡面番' },
        { type_id: `${site}/search?genre=Motion%20Anime`,            type_name: 'Motion Anime' },
        { type_id: `${site}/search?genre=3DCG`,                      type_name: '3D動畫' },
        { type_id: `${site}/search?genre=%E5%90%8C%E4%BA%BA%E4%BD%9C%E5%93%81`, type_name: '同人' },
        { type_id: `${site}/search?genre=MMD`,                       type_name: 'MMD' },
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    let typeurl = inReq.body.id;
    const page = inReq.body.page || 1;
    const url = page > 1 ? `${typeurl}&page=${page}` : typeurl;

    const html = await request(url);
    const $ = load(html);

    let videolist = $('.home-rows-videos-wrapper > a');
    if (videolist.length === 0) videolist = $('.content-padding-new > .row > .search-doujin-videos.col-xs-6');

    let videos = [];
    videolist.each((_, element) => {
        if ($(element).attr('target') === '_blank' || $(element).find('.overlay').attr('target') === '_blank') return;
        const href = $(element).attr('href') || $(element).find('.overlay').attr('href');
        const title = $(element).find('.home-rows-videos-title').text() || $(element).find('.card-mobile-title').text();
        let cover = $(element).find('img').attr('src');
        if (cover && cover.includes('background')) cover = $(element).find('img').eq(1).attr('src');
        if (href) {
            videos.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: '',
            });
        }
    });

    return { page: parseInt(page), list: videos };
}

async function detail(inReq, _outResp) {
    const url = inReq.body.id;
    const html = await request(url);
    const $ = load(html);

    const title = $('h1').first().text().trim();
    const pic = $('meta[property="og:image"]').attr('content') || '';

    // 播放列表（同系列其他集）
    let tracks = [];
    const playlist = $('.hover-video-playlist:first > div');
    playlist.each((_, e) => {
        const name = $(e).find('.card-mobile-title').text();
        const href = $(e).find('a.overlay').attr('href');
        if (href) tracks.unshift(`${name}$${href}`);
    });
    // 当前集插入最前
    tracks.unshift(`播放$${url}`);

    return {
        list: [{
            vod_id: url,
            vod_name: title,
            vod_pic: pic,
            vod_play_from: '默认',
            vod_play_url: tracks.join('#'),
        }],
    };
}

async function play(inReq, _outResp) {
    const url = inReq.body.id;
    const html = await request(url);
    const $ = load(html);

    const playUrl = $('link[rel="preload"][as="video"][type="video/mp4"]').attr('href') || '';

    return {
        parse: 0,
        url: playUrl,
        header: { 'User-Agent': UA },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const page = inReq.body.pg || 1;
    const url = `${site}/search?query=${text}&page=${page}`;

    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.col-xs-6').each((_, element) => {
        if ($(element).find('.overlay').attr('target') === '_blank') return;
        const href = $(element).find('.overlay').attr('href');
        const title = $(element).find('.card-mobile-title').text();
        const cover = $(element).find('img').eq(1).attr('src');
        if (href) {
            videos.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: '',
            });
        }
    });

    return { list: videos };
}

export default {
    meta: {
        key: 'hanime',
        name: 'Hanime',
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