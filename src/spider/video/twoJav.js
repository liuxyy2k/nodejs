import axios from 'axios';
import { load } from 'cheerio';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const site = 'https://twojav.com/cn';

async function request(url) {
    const resp = await axios.get(url, {
        headers: { 'User-Agent': UA }
    });
    return resp.data;
}

function parseCards($) {
    const list = [];
    $('.video-card').each((_, element) => {
        const href     = $(element).find('.thumbnail-link').attr('href') || '';
        const title    = $(element).find('.title').text().trim() || '';
        const cover    = $(element).find('.thumbnail').attr('style') || '';
        const match = cover.match(/background-image:\s*url\(['"]?(.*?)['"]?\)/);
        let pic = ''
        if (match) {
             pic = match[1]
        }
        if (!href || !title) return;
        list.push({ vod_id: href, vod_name: title, vod_pic: pic });
    });
    return list;
}



async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '/new',                       type_name: '最近更新'},
        { type_id: '/release',                   type_name: '新作上市'},
        { type_id: '/today-hot',                 type_name: '今日热门'},
        { type_id: '/weekly-hot',                type_name: '本周热门'},
        { type_id: '/monthly-hot',               type_name: '本月热门'},
        { type_id: '/amateur',                   type_name: '素人' },
        { type_id: '/censored',                  type_name: '有码' },
        { type_id: '/uncensored',                type_name: '无码' }
    ];
    let filterObj = {
         '/amateur': [
             {
                key: 'by',
                name: '排序',
                value: [
                    { n: '最近更新',   v: 'update' },
                    { n: '今日热播', v: 'release' },
                    { n: '最受欢迎', v: 'play' },
                    { n: '今日热门', v: 'today_views' },
                    { n: '本周热门', v: 'weekly_views' },
                    { n: '本月热门', v: 'monthly_views' },
                    { n: '最多观看', v: 'views' }
                ]
            }
        ],
        '/censored': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '最近更新',   v: '' },
                    { n: '今日热播', v: 'by/hits_day/' },
                    { n: '本周最热', v: 'by/hits_week/' },
                    { n: '今日点赞', v: 'by/up_day/' },
                    { n: '本周点赞', v: 'by/up_week/' },
                    { n: '最高评分', v: 'by/up/' }
                ]
            }
        ],
        '/uncensored': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '最近更新',   v: '' },
                    { n: '今日热播', v: 'by/hits_day/' },
                    { n: '本周最热', v: 'by/hits_week/' },
                    { n: '今日点赞', v: 'by/up_day/' },
                    { n: '本周点赞', v: 'by/up_week/' },
                    { n: '最高评分', v: 'by/up/' }
                ]
            }
        ]
    }
    return { class: classes, filters: filterObj};
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;
    const filters = inReq.body.filters;
    let ext = {}
    if (typeof filters === 'string') {
        try {
            ext = JSON.parse(filters)
        } catch (e) {
            ext = {}
        }
    } else {
        ext = filters
    }
    ext = ext || {}
    let by = ext?.by || ''
    const url = by ? `${site}${tid}?sort=${by}&page=${page}` : `${site}${tid}?page=${page}`
    console.log(url)
    const html = await request(url);
    const $    = load(html);
    const list = parseCards($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const href = inReq.body.id;
    let url = 'https://twojav.com' + href
    const html = await request(url);
    
    const $    = load(html);

    const name = $('meta[name="keywords"]').attr('content') || '';
    const des  = $('meta[name="description"]').attr('content') || '';
    let pic  = $('.plyr__poster').attr('style') || '';
    const match = pic.match(/background-image:\s*url\((?:['"]|&quot;)?(.*?)(?:['"]|&quot;)?\)/);
    if(match) pic = match[1]
    const m = html.match(/currentAddress\s*=\s*['"](https?:\/\/[^'"]+\.m3u8)['"]/)
    const playUrl = m ? m[1] : ''
    return {
        list: [{
            vod_id:        href,
            vod_name:      name,
            vod_pic:       pic,
            vod_play_from: 'TwoJav',
            vod_play_url:  `播放$${playUrl}`,
            vod_content: des
        }],
    };
}

async function play(inReq, _outResp) {
     return {
        parse: 0,
        url: inReq.body.id,
        header: { 'User-Agent': UA,
            'Referer': 'https://twojav.com/'
         },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd || '');
    const page = parseInt(inReq.body.pg) || 1;
    const html = await request(`${site}/search?q=${text}`);
    const $    = load(html);
    const list = parseCards($);
    return { list };
}

export default {
    meta: {
        key: 'twoJav',
        name: '🌸TwoJav',
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