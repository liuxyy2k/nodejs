import axios from 'axios';
import { load } from 'cheerio';
import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const site = 'https://zh.xhamster.com';

async function request(url) {
    const resp = await axios.get(url, {
        headers: { 'User-Agent': UA },
        httpsAgent: agent
    });
    return resp.data;
}

function parseCards($) {
    const list = [];
    $('.thumb-list__item').each((_, element) => {
        const href     = $(element).find('a.video-thumb__image-container').attr('href') || '';
        const title    = $(element).find('.thumb-image-container__image').attr('alt') || '';
        const cover    = $(element).find('.thumb-image-container__image').attr('src') || '';
        const subTitle = $(element).find('.video-thumb-views').text().trim();
        const duration = $(element).find('.thumb-image-container__duration').text().trim();
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
        { type_id: '/newest',       type_name: 'Newest'      },
        { type_id: '/best/weekly',  type_name: 'Weekly Best' },
        { type_id: '/4k',           type_name: '4K'          },
    ];

    const html = await request(`${site}/newest`);
    const $    = load(html);
    const list = parseCards($);

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    const url  = page > 1 ? `${site}${tid}/${page}` : `${site}${tid}`;
    const html = await request(url);
    const $    = load(html);
    const list = parseCards($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const href = inReq.body.id;
    const html = await request(href);
    const $    = load(html);

    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic  = $('meta[property="og:image"]').attr('content') || '';

    // 提取 initials-script 里的视频源
    const script = $('#initials-script').text();

    let playParts = [];
    try {
        // 用正则替代 eval，安全提取 h264 sources
        const initialsMatch = script.match(/window\.initials\s*=\s*(\{[\s\S]+\});?\s*$/);
        if (initialsMatch) {
            const initials = JSON.parse(initialsMatch[1]);
            const videos   = initials?.xplayerSettings?.sources?.standard?.h264 || [];
            playParts = videos.map(e => `${e.label}$${e.url}`);
        }
    } catch (e) {
        // 正则方式失败，尝试直接正则提取 h264 数组
        const h264Match = script.match(/"h264"\s*:\s*(\[[\s\S]+?\])\s*,\s*"(hls|webm)"/);
        if (h264Match) {
            try {
                const videos = JSON.parse(h264Match[1]);
                playParts = videos.map(e => `${e.label}$${e.url}`);
            } catch (e2) {
                console.error('h264 parse error:', e2.message);
            }
        }
    }

    return {
        list: [{
            vod_id:        href,
            vod_name:      name,
            vod_pic:       pic,
            vod_play_from: 'xhamster',
            vod_play_url:  playParts.join('#'),
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: {
            'User-Agent': UA,
            'Referer':    inReq.body.flag || site + '/',
        },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd || '');
    const page = parseInt(inReq.body.pg) || 1;

    const html = await request(`${site}/search/${text}?page=${page}`);
    const $    = load(html);
    const list = parseCards($);

    return { list };
}

export default {
    meta: {
        key: 'xhamster',
        name: 'xHamster',
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