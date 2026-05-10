import axios from 'axios';
import { load } from 'cheerio';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Mobile/15E148 Safari/604.1';
const site = 'https://www.hanime.xyz';
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
 const classes = [
        { type_id: '/?sort=id', type_name: '最新' },
        { type_id: '/?sort=hits', type_name: '最多' },
        { type_id: '/?sort=score', type_name: '推荐' },
        { type_id: '/?sort=likes', type_name: '最好' },
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    let typeurl = site + inReq.body.id;
    const page = inReq.body.page || 1;
    const url = page > 1 ? `${typeurl}&page=${page}` : typeurl;

    const html = await request(url);
    const $ = load(html);

    let videos = [];

    $('.col-xl-2').each((_, element) => {
        try {
            const pic = $(element).find('.card-img-top').attr('src') || '';
            const id = $(element).find('a').eq(0).attr('href') || '';
            const name = $(element).find('.visited').text().trim() || '';
            const remark = $(element).find('.fa').text().trim() || '';
            if (!id || !name) return;
            videos.push({
                vod_id: id,
                vod_name: name,
                vod_pic: pic.startsWith('https://') ? pic : site + pic,
                vod_remarks: remark
            });
        } catch (e) {}
    });

    return { page: parseInt(page), list: videos };
}

async function detail(inReq, _outResp) {
    const url = inReq.body.id;
    const html = await request(site + url);
    const $ = load(html);
    const title = $('meta[name="keywords"]').attr('content') || '';
    const pic = site + $('.vjs-poster img').attr('src') || '';
    const playUrl = $('.video-js source').attr('src') || '';
    return {
        list: [{
            vod_id: url,
            vod_name: title,
            vod_pic: pic,
            vod_play_from: '默认',
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
    const page = inReq.body.pg || 1;
    const url = `${site}/?q=${text}&page=${page}`;

    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.col-xl-2').each((_, element) => {
        try {
            const pic = $(element).find('.card-img-top').attr('src') || '';
            const id = $(element).find('a').eq(0).attr('href') || '';
            const name = $(element).find('.visited').text().trim() || '';
            const remark = $(element).find('.fa').text().trim() || '';
            if (!id || !name) return;
            videos.push({
                vod_id: id,
                vod_name: name,
                vod_pic: pic.startsWith('https://') ? pic : site + pic,
                vod_remarks: remark
            });
        } catch (e) {}
    });

    return { list: videos };
}

export default {
    meta: {
        key: 'hanime2',
        name: '🔥Hanime2',
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