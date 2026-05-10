import axios from 'axios';
import { load } from 'cheerio';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://xojav.tv';

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...headers }
    });
    return resp.data;
}

function parseVods($) {
    const videos = [];
    $('.item').each((_, element) => {
        const pic = $(element).find('img').attr('data-src') || '';
        const url = $(element).find('a').eq(0).attr('href') || '';
        const name = $(element).find('h4').text().trim();
        const remarks = $(element).find('.card-video__duration').text().trim();
        if (pic.endsWith('.gif') || !name) return;
        videos.push({
            vod_id: url,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: remarks
        });
    });
    return videos;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const html = await request(site + '/categories');
    const $ = load(html);
    let classes = [];
    //获取分类
    $('.card-cat-v2__link').each((_, element) => {
        const type_id = $(element).attr('href') || '';
        const type_name = $(element).find('h4').text().trim() || '';
        classes.push({
            type_id:   type_id,
            type_name: type_name,
        });
    });   
    const list = parseVods($);
    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;
    const url = `${tid}?mode=async&function=get_block&block_id=list_videos_common_videos_list&sort_by=release_at&from=${page}&_=${Math.floor(Date.now() / 1000)}`;
    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);
    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const html = await request(id);
    const $ = load(html);
    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic = $('meta[property="og:image"]').attr('content') || '';
    const year = $('meta[property="video:release_date"]').attr('content') || '';
    const section = $('.max-width-md').find('script').last().html()
    console.log(section)
    const match = section.match(/https?:\/\/[^\s'"]+\.m3u8/);
    let playUrl = match ? match[0] : ''
    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_year: year,
            vod_play_from: 'Xojav',
            vod_play_url: '播放$' + playUrl,
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
    const url = `${site}/videos/list/keyword/${text}`;
    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { list };
}

export default {
    meta: {
        key: 'Xojav',
        name: '🔥Xojav',
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