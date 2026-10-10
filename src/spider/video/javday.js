import axios from 'axios';
import { load } from 'cheerio';
import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const site = 'https://javday.app';

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...headers },
        // httpsAgent: agent
    });
    return resp.data;
}

function parseVods($) {
    const videos = [];
    $('.col-style').each((_, element) => {
        let pic = $(element).find('.videoBox-cover').attr('style') || '';
        const match = pic.match(/url\(([^)]+)\)/);
        if (match) {
            pic = match[1].replace('"','').replace('\"','')
        }
        const url = $(element).find('a').eq(0).attr('href') || '';
        const name = $(element).find('.title').text().trim();
        if (pic.endsWith('.gif') || !name) return;
        videos.push({
            vod_id: url,
            vod_name: name,
            vod_pic: pic,
        });
    });
    return videos;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '/category/new-release/', type_name: '新作上市' },
        { type_id: '/label/new/', type_name: '最近更新' },
        { type_id: '/label/hot/', type_name: '人气系列' },
        { type_id: '/category/censored/', type_name: '有码' },
        { type_id: '/category/uncensored/', type_name: '无码' },
        { type_id: '/category/aiav/', type_name: 'AI短剧' },
        { type_id: '/category/uncensored-leaked/', type_name: '无码流出' },
    ];

    return { class: classes,filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    let url = `${site}${tid}page/${page}/`;
    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const url = `${site}${id}`;
    const html = await request(url);
    const $ = load(html);

    const name = $('meta[property="keywords"]').attr('content') || '';
    const pic =  $('meta[property="og:image"]').attr('content') || '';
    const description =  $('meta[property="og:description"]').attr('content') || '';
    const vcontainer = $('.vcontainer script').html()
    let playUrl = '';
    const match = vcontainer.match(/url:\s*['"]([^'"]+\.m3u8)['"]/);
    if (match) {
       playUrl = match[1]
    }
    
    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_play_from: 'JavDay',
            vod_play_url: '播放$' + playUrl,
            vod_content: description
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: { 'User-Agent': UA,
            'Referer': site + '/'
        },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const url = `${site}search/?wd=${text}`;
    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { list };
}

export default {
    meta: {
        key: 'javday',
        name: '🌸JavDay',
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