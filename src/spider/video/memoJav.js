import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const site = 'https://memojav.com';

async function request(url, headers = {}) {
    const resp = await axios.get(url, {
        headers: { 'User-Agent': UA,'Referer': site+ '/' }
    });
    return resp.data;
}

function parseCards($) {
    const list = [];
    $('.video-item').each((_, element) => {
        const href     = $(element).attr('href') || '';
        const title    = $(element).find('.video-title').text().trim();
        const cover    = $(element).find('img').attr('src') || '';
        if (!href || !title) return;
        list.push({
            vod_id:      href,
            vod_name:    title,
            vod_pic:     cover
        });
    });
    return list;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const ignore = ['首页', '其他', '热门标签', '筛选'];
    const html   = await request(site + '/categories/');
    const $      = load(html);

    const classes = [
        {
            type_id: '/',
            type_name: '首页'
        },
        {
            type_id: '/video/',
            type_name: '最近更新'
        },
         {
            type_id: '/best/',
            type_name: '最佳视频'
        }
    ];
    $('.flexw .mrb16').each((_, e) => {
        const name = $(e).text().trim();
        const href = $(e).attr('href') || '';
        if (!name || !href) return;
        if (ignore.some(ig => name.includes(ig))) return;
        classes.push({ type_id: href, type_name: name });
    });

    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;
    let url  = `${site}${tid}/page-${page}`;
    if(tid === '/') {
        url  = `${site}${tid}`;
    }
    if(tid != '/best/' && tid != '/video/' && tid != '/') {
        url = page > 1 ? `${site}/categories/page-${page}` : `${site}${tid}`
    }
    const html = await request(url);
    const $    = load(html);
    const list = parseCards($);

    return { page, pagecount: page + 1, list };
}

async function video_sig() {
    const t = Date.now().toString();

    let sig = Buffer.from(t).toString('base64');
    let s = sig.length - 12;

    sig = sig.substr(s, 10);

    let sts = 1;
    for (let i = 0; i < 10; i++) {
        sts += sig.charCodeAt(i) * i * 1743;
    }

    return `&sig=${sig}&sts=${sts}`;
}

async function detail(inReq, _outResp) {
    const href = inReq.body.id;
    const html = await request(site + href);
    const $    = load(html);

    const name = $('meta[name="twitter:title"]').attr('content') || '';
    const pic = $('meta[name="twitter:image"]').attr('content') || '';
    const description = $('meta[name=description"]').attr('content') || '';
    const id = href.split('/')[2]
    const sig = await video_sig()
    let url = `${site}/hls/get_video_info.php?id=${id}${sig}`
    const m3u8Data = await request(url);
    // 去掉 for (;;);
    const jsonStr = m3u8Data.replace(/^for\s*\(\s*;;\s*\);\s*/, '');
    console.log(jsonStr)
    const data = JSON.parse(jsonStr);

    // 解码 URL
    let playUrl  = decodeURIComponent(data.url);
    return {
        list: [{
            vod_id:        href,
            vod_name:      name,
            vod_pic:       pic,
            vod_play_from: 'memojav',
            vod_play_url:  `播放$${playUrl}`,
            vod_content:   description,
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
    const text = encodeURIComponent(inReq.body.wd || '');
    const page = parseInt(inReq.body.pg) || 1;

    const html = await request(`${site}/page/${page}?s=${text}`);
    const $    = load(html);
    const list = parseCards($);

    return { list };
}

export default {
    meta: {
        key: 'memojav',
        name: '🔥Memojav',
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