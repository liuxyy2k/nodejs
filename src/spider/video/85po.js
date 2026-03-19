import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const site = 'https://www.85xo.com';

async function request(reqUrl) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA,
            'Referer': site + '/'
         }
    });
    return resp.data;
}

function parseCards($) {
    const list = [];
    $('.thumb').each((_, element) => {
        const href     = $(element).find('a').attr('href') || '';
        const title    = $(element).find('.title').text() || '';
        const cover    = $(element).find('.lazy-load').attr('data-webp') || '';
        const subTitle = $(element).find('.time').text().trim();
        if (!href || !title) return;
        list.push({
            vod_id:      href,
            vod_name:    title,
            vod_pic:     cover,
            vod_remarks: subTitle,
        });
    });
    return list;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '/', type_name: '首页' },
        { type_id: '/latest-updates/', type_name: '最新' },
        { type_id: '/4k/', type_name: '4k' },
        { type_id: '/top-rated/', type_name: '最赞' },
        { type_id: '/most-popular/', type_name: '热门' }
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;
    let url  = `${site}${tid}`
    if(page > 1) url = `${url}?mode=async&function=get_block&block_id=list_videos_most_recent_videos&sort_by=post_date&from=${page}&_=${Date.now()}`
    const html = await request(url);
    const $    = load(html);
    const list = parseCards($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const href = inReq.body.id;
    const html = await request(href);
    const $    = load(html);

    const title =  $('meta[property="og:title"]').attr('content') || '';
    const pic =  $('meta[property="og:image"]').attr('content') || '';
    const des =  $('meta[name="description"]').attr('content') || '';
    return {
        list: [{
            vod_id:         href,
            vod_name:       title,
            vod_pic:        pic,
            vod_play_from: '85po',
            vod_play_url:  `播放$${href}`,
            vod_content: des
        }],
    };
}

async function play(inReq, _outResp) {
    const url = inReq.body.id;
    const html = await request(url);
    const $ = load(html);

    // 从下载链接提取各清晰度真实地址
    const sources = {};
    $('.fav-drop a[href*="get_file"]').each((_, el) => {
        const href = $(el).attr('href');
        const text = $(el).text();  // "MP4 720p, 19.17 Mb"

        // 去掉 download 参数，变成播放地址
        const playUrl = href
            .replace(/&download_filename=[^&]+/, '')
            .replace(/&download=true/, '');

        if (text.includes('1080p')) sources['1080p'] = playUrl;
        else if (text.includes('720p')) sources['720p'] = playUrl;
        else if (text.includes('480p')) sources['480p'] = playUrl;
    });

    console.log('真实地址:', sources);

    // 优先级 1080p > 720p > 480p
    const playUrl = sources['1080p'] || sources['720p'] || sources['480p'];
    if (!playUrl) throw new Error('未找到播放地址');

    // 拼 rnd
    const rnd = Date.now();
    const finalUrl = `${playUrl}&rnd=${rnd}`;

    return {
        parse: 0,
        url: finalUrl,
        header: { 'User-Agent': UA, 'Referer': url },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd || '');
    const page = parseInt(inReq.body.pg) || 1;

    const html = await request(`${site}/search?key=${text}`);
    const $    = load(html);
    const list = parseCards($);

    return { list };
}

export default {
    meta: {
        key: '85po',
        name: '85po',
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