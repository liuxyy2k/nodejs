import axios from 'axios';
import { load } from 'cheerio';

const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const site = 'https://zh.xhamster.com';

async function request(url) {
    const resp = await axios.get(url, {
        headers: { 'User-Agent': UA }
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
        { type_id: '/categories/asian',       type_name: '亚洲人'      },
        { type_id: '/categories/jav',       type_name: '日本AV'      },
        { type_id: '/categories/amateur',       type_name: '素人'      },
        { type_id: '/categories/uncensored',       type_name: '无码'      },
        { type_id: '/categories/18-year-old',       type_name: '十八岁'      },
        { type_id: '/categories/milf',       type_name: '人妻'      },
        { type_id: '/newest',       type_name: 'Newest'      },
        { type_id: '/best/weekly',  type_name: 'Weekly Best' },
        { type_id: '/4k',           type_name: '4K'          },
    ];
    return { class: classes, filters: {} };
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

    const m3u8 = html.match(/href="([^"]+\.m3u8[^"]*)"/)?.[1];
    const base = m3u8.substring(0, m3u8.lastIndexOf('/') + 1);
    const resm3U8 = await axios.get(m3u8, {
        headers: {
            "User-Agent": UA,
            Referer: href,
        },
    });
    const lines = resm3U8.data.split('\n')
    let bestUrl = []
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.includes('#EXT-X-STREAM-INF')) {
            const m = line.match(/RESOLUTION=\d+x(\d+)/)
            if (m) {
                const height = parseInt(m[1])
                const rawUrl = lines[i + 1]?.trim()
                const fullUrl = new URL(rawUrl, m3u8).href
                bestUrl.push(`${height}$${fullUrl}`)
            }
        }
    }
    // 按分辨率从大到小排序
    bestUrl.sort((a, b) => {
        const h1 = parseInt(a.split('$')[0])
        const h2 = parseInt(b.split('$')[0])
        return h2 - h1
    })   
    return {
        list: [{
            vod_id:        href,
            vod_name:      name,
            vod_pic:       pic,
            vod_play_from: 'xhamster',
            vod_play_url:   bestUrl.join('#'),
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