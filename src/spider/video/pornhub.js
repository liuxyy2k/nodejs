import axios from 'axios';
import { load } from 'cheerio';
const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const site = 'https://cn.pornhub.com';
// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
async function request(url) {
    const resp = await axios.get(url, {
        headers: { 'User-Agent': UA },
        // httpsAgent: agent
    });
    return resp.data;
}

function parseCards($) {
    const list = [];
    $('li.videoBox').each((_, element) => {
        const href     = $(element).find('.phimage a.img').attr('href') || '';
        const title    = $(element).find('.title a').attr('title') || '';
        const cover    = $(element).find('.phimage a.img img').attr('src')
                      || $(element).find('.phimage a.img img').attr('data-mediumthumb')
                      || '';
        const subTitle = $(element).find('.views').text().trim();
        const duration = $(element).find('.duration').text().trim();
        if (!href || !title) return;
        list.push({
            vod_id:      href,
            vod_name:    title,
            vod_pic:     cover,
            vod_remarks: `${subTitle} ${duration}`.trim(),
        });
    });
    return list;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: 'sy', type_name: 'Home'        },
        { type_id: 'cm', type_name: 'Newest'       },
        { type_id: 'mv', type_name: 'Most Viewed'  },
        { type_id: 'ht', type_name: 'Hottest'      },
        { type_id: 'tr', type_name: 'Top Rated'    },
    ];

    const html = await request(`${site}/video?`);
    const $    = load(html);
    const list = parseCards($);

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const id   = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    let url;
    if (id === 'sy') {
        url = page > 1
            ? `${site}/video?page=${page}`
            : `${site}/video?`;
    } else {
        url = page > 1
            ? `${site}/video?o=${id}&page=${page}`
            : `${site}/video?o=${id}`;
    }

    const html = await request(url);
    const $    = load(html);
    const list = parseCards($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const href = inReq.body.id;
    const html = await request(`${site}${href}`);

    // 提取 flashvars 中的视频信息
    const match = html.match(/var flashvars_.*? = \{(.*?)\};/s);
    if (!match) return { list: [{ vod_id: href, vod_name: href, vod_pic: '', vod_play_from: 'pornhub', vod_play_url: '' }] };

    const json   = JSON.parse('{' + match[1] + '}');
    const videos = (json.mediaDefinitions || []).filter(e => e.format === 'hls');

    // 多清晰度：720p$url#1080p$url
    const playUrl = videos.map(e => `${e.quality}$${e.videoUrl}`).join('#');

    const $ = load(html);
    const name = $('meta[property="og:title"]').attr('content') || href;
    const pic  = $('meta[property="og:image"]').attr('content') || '';

    return {
        list: [{
            vod_id:        href,
            vod_name:      name,
            vod_pic:       pic,
            vod_play_from: 'pornhub',
            vod_play_url:  playUrl,
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: { 'User-Agent': UA ,
            'Referer': 'https://cn.pornhub.com/'
        },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd || '');
    const page = parseInt(inReq.body.pg) || 1;

    const html = await request(`${site}/video/search?search=${text}&page=${page}`);
    const $    = load(html);
    const list = parseCards($);

    return { list };
}

export default {
    meta: {
        key: 'pornhub',
        name: '🎥PornHub',
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