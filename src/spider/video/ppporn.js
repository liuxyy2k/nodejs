import axios from 'axios';
import { load } from 'cheerio';

// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://ppp.porn';

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, 'Referer': site + '/', ...headers },
        // httpsAgent: agent
    });
    return resp.data;
}

function parseVods($) {
    const videos = [];
    $('.item.card-video').each((_, element) => {
        const url = $(element).find('figure').find('a').attr('href') || '';
        const pic = $(element).find('img').attr('data-src') || '';
        const name = $(element).find('.card-video__title').text().trim();
        const remark = $(element).find('.card-video__duration').text().trim();
        if (pic.endsWith('.gif') || !name) return;
        videos.push({
            vod_id: url,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: remark
        });
    });
    return videos;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '/new/', type_name: '最新上架' },
        { type_id: '/pp1/hot/', type_name: '近期热门' },
        { type_id: '/categories/', type_name: '所有分类' }
    ];

    return { class: classes,filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;
    let list = [];
    if(tid=='/categories/') {
        const url = `${site}${tid}`;
        const html = await request(url);
        const $ = load(html)
        $('.card-cat-v2').each((_, element) => {
            const url = $(element).find('a').attr('href') || '';
            const pic = $(element).find('img').attr('src') || '';
            const name = $(element).find('.card-cat-v2__title').text().trim();
            const remark = $(element).find('.card-cat-v2__count').text().trim();
            list.push({
                vod_id:  `folder_${url}`,
                vod_name: name,
                vod_pic: pic,
                vod_tag:  'folder',
                style:    { ratio: 1.77, type: 'rect' },
                vod_remarks: remark
            });
        });
    } else if(tid.startsWith("folder_")) {
        const url = tid.replace('folder_', '');
        const html = await request(url);
        const $ = load(html)
        list= await parseVods($);
    } else {
        let url = `${site}${tid}?mode=async&function=get_block&block_id=list_videos_${tid=='/new/' ? 'latest' : 'common'}_videos_list&sort_by=${tid=='/new/' ? 'post_date' : 'video_viewed_today'}&from=${page}&_=${Date.now()}`;
        const html = await request(url);
        const $ = load(html);
        list = parseVods($);
    }
    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const html = await request(id);
    const $ = load(html);
    let playUrl = '';
    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic = $('meta[property="og:image"]').attr('content') || '';
    const description = $('meta[property="description"]').attr('content') || '';
    const data = $('section.max-width-md').text().trim();
    const match = data.match(/https?:\/\/[^\s'"]+\.m3u8/g);
    playUrl = match ? match[0] : '';
    
    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_play_from: '99porn',
            vod_play_url: '第1集$' + playUrl,
            vod_content: description
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: { 'User-Agent': UA,'Referer': site + '/' },
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
        key: 'ppporn',
        name: '🔥Pppporn',
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