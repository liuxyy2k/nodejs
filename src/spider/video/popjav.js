import axios from 'axios';
import { load } from 'cheerio';

// import { HttpsProxyAgent } from 'https-proxy-agent';
// // 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const site = 'https://popjav.in';

async function request(url) {
    const resp = await axios.get(url, {
        headers: { 'User-Agent': UA },
        // httpsAgent: agent
    });
    return resp.data;
}

function parseCards($) {
    const list = [];
    $('.post-list a').each((_, element) => {
        const href     = $(element).attr('href') || '';
        const title    = $(element).find('img').attr('alt') || '';
        const cover    = $(element).find('img').attr('src') || '';
        const remark    = $(element).find('.post-list-time').text() || '';
        if (!href || !title) return;
        list.push({ vod_id: href, vod_name: title, vod_pic: cover,vod_remarks: remark });
    });
    return list;
}



async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '/censored/',                       type_name: '有码'},
        { type_id: '/uncensored/',                   type_name: '无码'},
        { type_id: '/amature/',                 type_name: '素人'},
        { type_id: '/fc2ppv/',                type_name: 'FC2'},
        { type_id: '/vr/',               type_name: 'VR'},
        { type_id: '/trend/',                   type_name: '热度' },
        { type_id: '/popularity/',                  type_name: '人气' },
        { type_id: '/uncensored',                type_name: '无码' }
    ];
    return { class: classes, filters: {}};
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;
    const url = `${site}${tid}page/${page}/`
    console.log(url)
    const html = await request(url);
    const $    = load(html);
    const list = parseCards($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const href = inReq.body.id;
    const html = await request(href);
    const $    = load(html);

    const name = $('#player-width h1').text().trim() || '';
    const des  = $('#post-content').text() || '';
    let pic  = $('#iframe img').attr('src') || '';
    let playUrl = ''
    const reg = /<script>\s*eval\(function\(p,a,c,k,e,d\)[\s\S]*?\)\)\s*<\/script>/
    const match = html.match(reg)
    if (match) {
        const js = match[0].replace(/<script>\s*/i, '').replace(/\s*<\/script>/i, '')
        const unpacked = eval(js.replace('eval', ''))
        const urls = [...new Set(
            [...unpacked.matchAll(/https?:\/\/[^"' ]+\/[ev]\/[a-z0-9]+/gi)]
            .map(v => v[0])
        )]
        playUrl= urls[0]
        

    }   
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
    const url = inReq.body.id;
    let playUrl = ''
    const resp = await axios.get(url, {
        headers: { 'User-Agent': UA,'Referer': site + '/' },
        // httpsAgent: agent
    });
    
    const reg2 = /eval\(function\(p,a,c,k,e,d\)[\s\S]*?split\('\|'\)\)\)/
    const match2 = resp.data.match(reg2)
    if (match2) {
        const packed = match2[0]
        const unpacked = eval(packed.replace('eval', ''))
        const hls4 = unpacked.match(/"hls4":"(\/stream\/[^"]+\.m3u8)"/)?.[1];
        if (hls4) {
            playUrl = hls4
        }
    }
    const domain = new URL(url).hostname;
     return {
        parse: 0,
        url: domain + playUrl,
        header: { 'User-Agent': UA,
                'Referer': url
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
        key: 'popJav',
        name: 'PopJav',
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