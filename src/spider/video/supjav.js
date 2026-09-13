import { load } from 'cheerio';
import req from '../../util/req.js';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const site = 'https://supjav.com/zh';

async function request(targetUrl, referer = '') {
    const headers = {
        'User-Agent': UA,
        Referer: referer || `${site}/`,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
    };
    // 走 req.js：自动带上 cookie.json 里的 Cookie，并保存响应 Set-Cookie
    const resp = await req.get(targetUrl, { headers });
    return resp.data;
}

function parseVods($) {
    const cards = [];
    $('.clearfix .post').each((_, e) => {
        const href    = $(e).find('a').attr('href') || '';
        const title   = $(e).find('a').attr('title') || '';
        const cover   = ($(e).find('.thumb').attr('data-original') || '').replace('!320x216.jpg', '');
        const remarks = $(e).find('.con .meta .date').text().trim();
        cards.push({
            vod_id:      href,
            vod_name:    title,
            vod_pic:     cover,
            vod_remarks: remarks,
        });
    });
    return cards;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: 'popular',                     type_name: '热门'     },
        { type_id: 'category/censored-jav',       type_name: '有码'     },
        { type_id: 'category/uncensored-jav',     type_name: '无码'     },
        { type_id: 'category/amateur',            type_name: '素人'     },
        { type_id: 'category/chinese-subtitles',  type_name: '中文字幕' },
        { type_id: 'category/reducing-mosaic',    type_name: '无码破解' },
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;
    let url = `${site}/${tid}/page/${page}`
    const html = await request(url);
    const $    = load(html);
    const list = parseVods($);
    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const id   = inReq.body.id;
    const html = await request(id);
    const $    = load(html);

    const name = $('meta[name="description"]').attr('content') || '';
    const des  = $('meta[name="description"]').attr('content') || '';

    const tracks = [];
    $('a.btn-server').each((_, e) => {
        const trackName = $(e).text().trim();
        const dataLink  = $(e).attr('data-link') || '';
        if(trackName !== 'TV') return
        tracks.push(`${trackName}$${dataLink}`);
    });
    
     let data = tracks[0].split('$')[1]
     const param = data.split('').reverse().join('');
     const url   = `https://lk1.supremejav.com/supjav.php?c=${param}`;

     const res = await req.get(url, {
        headers: {
            'User-Agent': UA,
            Referer: `https://lk1.supremejav.com/supjav.php?l=${data}&bg=undefined`,
        },
    });
    const el = load(res.data);
    let playUrl = el('#video_player').attr('data-hash')
    const resm3U8 = await req.get(playUrl, {
        headers: {
            "User-Agent": UA,
            Referer: `https://turbovidhls.com/`,
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
                const url = lines[i + 1]?.trim()
                bestUrl.push(`${height}$${url}`)
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
            vod_id:        id,
            vod_name:      name,
            vod_pic:       '',
            vod_play_from: 'SupJav',
            vod_play_url:  bestUrl.join('#'),
            vod_content: des
        }],
    };
}

function getBestM3U8(text) {
    const lines = text.split('\n')
    let bestUrl = ''
    let bestHeight = 0
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.includes('#EXT-X-STREAM-INF')) {
            const m = line.match(/RESOLUTION=\d+x(\d+)/)
            if (m) {
                const height = parseInt(m[1])
                const url = lines[i + 1]?.trim()
                if (height > bestHeight) {
                    bestHeight = height
                    bestUrl = url
                }
            }
        }
    }

    return bestUrl
}

async function play(inReq, _outResp) {
     return {
        url: inReq.body.id,
        header: {
            'User-Agent': UA,
            'Referer': 'https://turbovidhls.com/'
        },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const page = parseInt(inReq.body.page) || 1;

    const html = await request(`${site}/page/${page}?s=${text}`);
    const $    = load(html);
    const list = parseVods($);

    return { list };
}

export default {
    meta: {
        key:  'supjav',
        name: '🔥SupjAv',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
    },
};