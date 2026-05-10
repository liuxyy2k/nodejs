import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const site = 'https://bgm.girigirilove.com';
const headers = {
    'Referer': `${site}/`,
    'Origin': site,
    'User-Agent': UA,
};

async function request(reqUrl) {
    const resp = await axios.get(reqUrl, { headers });
    return resp.data;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: `${site}/show/2--------{page}---/`,  type_name: '日番' },
        { type_id: `${site}/show/3--------{page}---/`,  type_name: '美番' },
        { type_id: `${site}/show/21--------{page}---/`, type_name: '剧场版' },
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const page = inReq.body.page || 1;
    const url = inReq.body.id.replace('{page}', page);

    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('a.public-list-exp').each((_, each) => {
        const href = $(each).attr('href');
        if (href) {
            videos.push({
                vod_id: site + href,
                vod_name: $(each).attr('title'),
                vod_pic: site + $(each).find('img.gen-movie-img').attr('data-src'),
                vod_remarks: $(each).find('.public-list-prb').text(),
            });
        }
    });

    return { page: parseInt(page), list: videos };
}

async function detail(inReq, _outResp) {
    const url = inReq.body.id;
    const html = await request(url);
    const $ = load(html);

    const title = $('h1').first().text().trim();
    const pic = $('meta[property="og:image"]').attr('content') || '';

    // 收集分组名
    let gn = [];
    $('a.swiper-slide').each((_, each) => {
        const cleanText = $(each).text().replace(/[0-9]/g, '').replace(/\s+/g, ' ').trim();
        gn.push(cleanText);
    });
    if (gn.length === 0) gn = ['默认'];

    let playFroms = [];
    let playUrls = [];

    $('div.anthology-list-box').each((i, each) => {
        const groupTitle = gn[i] || `选集${i + 1}`;
        let tracks = [];
        $(each).find('a.this-link').each((_, item) => {
            const name = $(item).text().trim();
            const href = $(item).attr('href');
            if (href) tracks.push(`${name}$${site + href}`);
        });
        playFroms.push(groupTitle);
        playUrls.push(tracks.join('#'));
    });

    return {
        list: [{
            vod_id: url,
            vod_name: title,
            vod_pic: pic,
            vod_play_from: playFroms.join('$$$'),
            vod_play_url: playUrls.join('$$$'),
        }],
    };
}

async function play(inReq, _outResp) {
    const url = inReq.body.id;
    const html = await request(url);

    const obj = JSON.parse(html.match(/player_aaaa=(.+?)<\/script>/)[1]);
    const m3u = decodeURIComponent(base64decode(obj.url));

    return {
        parse: 0,
        url: m3u,
        header: { 'User-Agent': UA },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const page = inReq.body.pg || 1;
    const url = `${site}/search/${text}----------${page}---/`;

    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.flex.rel.overflow').each((_, each) => {
        const href = $(each).find('a[target="_blank"]').attr('href');
        if (href) {
            videos.push({
                vod_id: site + href,
                vod_name: $(each).find('h3.slide-info-title').text().trim(),
                vod_pic: site + $(each).find('img.gen-movie-img').attr('data-src'),
                vod_remarks: $(each).find('.slide-info-remarks.cor5').text().trim(),
            });
        }
    });

    return { list: videos };
}

function base64decode(str) {
    const base64DecodeChars = [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,62,-1,-1,-1,63,52,53,54,55,56,57,58,59,60,61,-1,-1,-1,-1,-1,-1,-1,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,-1,-1,-1,-1,-1,-1,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,-1,-1,-1,-1,-1];
    let c1, c2, c3, c4, i = 0, out = '';
    const len = str.length;
    while (i < len) {
        do { c1 = base64DecodeChars[str.charCodeAt(i++) & 0xff] } while (i < len && c1 == -1);
        if (c1 == -1) break;
        do { c2 = base64DecodeChars[str.charCodeAt(i++) & 0xff] } while (i < len && c2 == -1);
        if (c2 == -1) break;
        out += String.fromCharCode((c1 << 2) | ((c2 & 0x30) >> 4));
        do { c3 = str.charCodeAt(i++) & 0xff; if (c3 == 61) return out; c3 = base64DecodeChars[c3] } while (i < len && c3 == -1);
        if (c3 == -1) break;
        out += String.fromCharCode(((c2 & 0xf) << 4) | ((c3 & 0x3c) >> 2));
        do { c4 = str.charCodeAt(i++) & 0xff; if (c4 == 61) return out; c4 = base64DecodeChars[c4] } while (i < len && c4 == -1);
        if (c4 == -1) break;
        out += String.fromCharCode(((c3 & 0x03) << 6) | c4);
    }
    return out;
}

export default {
    meta: {
        key: 'girigirilove',
        name: '🔥ギリギリ动漫',
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