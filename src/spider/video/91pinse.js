import { load } from 'cheerio';
import req from '../../util/req.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://91pinse.com';

function pageHeaders(referer, extra = {}) {
    return {
        'User-Agent': UA,
        Referer: referer || `${site}/`,
        Origin: site,
        Accept: '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        ...extra,
    };
}

async function request(reqUrl, referer = '') {
    const resp = await req.get(reqUrl, {
        headers: pageHeaders(referer, {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }),
        timeout: 20000,
    });
    return resp.data;
}

async function csrfToken(url) {
    await req.loadCookies();
    const cookie = await req.getCookieJar().getCookieString(url);
    const m = String(cookie || '').match(/csrftoken=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    let classes = [
        { type_id: '',   type_name: '首页' },
        { type_id: '/v/',        type_name: '最新视频' },
        { type_id: '/v/hot/',         type_name: '热门视频' },
        { type_id: '/rank/recently-featured', type_name: '精选视频' },
        { type_id: '/rank/current-hot',       type_name: '当前热门' },
        { type_id: '/rank/month-hot',     type_name: '月度趋势' },
        { type_id: '/rank/month-favorite',        type_name: '月度收藏' },
    ];
    
    let filterObj = {
    }
    return { class: classes, filters: filterObj };
}

async function category(inReq, _outResp) {
    const typeurl = inReq.body.id;
    const page = inReq.body.page || 1;
    let url = `${site}${typeurl}?page=${page}`;
    if(typeurl === '') {
        url = `${site}`;
    }
    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.video-card').each((_, element) => {
        const href = $(element).find('a').attr('href');
        const title = $(element).find('.video-card-title').text().trim() || '';
        const cover = $(element).find('img').attr('src');
        const time = $(element).find('.video-duration').text();
        if (href) {
            videos.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: time 
            });
        }
    });

    return { page: parseInt(page), list: videos };
}



async function detail(inReq, _outResp) {
    const url = inReq.body.id;
    const pageUrl = site + url;
    const html = await request(pageUrl, pageUrl);
    const $ = load(html);

    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic  = $('meta[property="og:image"]').attr('content') || '';
    const vid = String(url).split('/').filter(Boolean).pop();
    const play = `${site}/api/videos/${vid}/playback`;
    const csrf = await csrfToken(play);
    const resp = await req.post(play, null, {
        headers: pageHeaders(pageUrl, {
            'X-Requested-With': 'XMLHttpRequest',
            ...(csrf ? { 'X-CSRFToken': csrf } : {}),
        }),
        timeout: 20000,
    });
    const data = resp.data || {};
    const lines = [];
    if (data.url) lines.push(`播放$${data.url}`);
    if (data.fallback_url && data.fallback_url !== data.url) {
        lines.push(`备用$${data.fallback_url}`);
    }
    return {
        list: [{
            vod_id: url,
            vod_name: name,
            vod_pic: pic,
            vod_play_from: '91pinse',
            vod_play_url: lines.join('#') || `播放$`,
        }],
    };
}

async function play(inReq, _outResp) {
    const id = inReq.body.id
    return {
        parse: 0,
        url: id,
        header: { 'User-Agent': UA, 'Referer': site + '/' },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const page = inReq.body.pg || 1;
    const url = `${site}/vod/search.html?wd=${text}`;

    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.group').each((_, element) => {
        const href = $(element).find('a').attr('href');
        const title = $(element).find('.link-hover').text().trim() || '';
        const cover = $(element).find('img').attr('src');
        const time = $(element).find('.left-1').text();
        const type = $(element).find('.right-1').text();
        if (href) {
            videos.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: time + ' ' + type,
            });
        }
    });

    return { list: videos };
}

export default {
    meta: {
        key: '91pinse',
        name: '🎞️91Pinse',
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