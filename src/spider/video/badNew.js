import axios from 'axios';
import { load } from 'cheerio';
import { config } from './config.js';

const site = 'https://bad.news';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const SERVER_API = config.SERVER_API;

// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

async function request(reqUrl) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA },
        // httpsAgent: agent
    });
    return resp.data;
}

// async function request(targetUrl) {
//     try {
//         const resp = await axios.post(SERVER_API, {
//             url: targetUrl,
//             referer: site + '/',
//             key: 'mira123'  // 必须加上这个，对应你 server.js 里的 AUTH_KEY
//         }, {
//             timeout: 60000,
//             // 明确指定是 JSON 格式，确保宝塔那边的 express.json() 能解析
//             headers: {
//                 'Content-Type': 'application/json'
//             }
//         });

//         // 如果服务器返回的是字符串（HTML），resp.data 就是源码
//         return resp.data;
//     } catch (e) {
//         console.log('中转请求失败:', e.message);
//         // 如果这里报错 403，就说明是 key 的问题
//         // 如果报错 404，说明 SERVER_API 地址写错了
//         throw e;
//     }
// }

// 解析视频列表（对应 Java 的 parseVods）
function parseVods($) {
    const list = [];
    $('.link').each((_, element) => {
        const pic = $(element).find('.my-videos').attr('poster') ||  $(element).find('.lazy').attr('data-echo') || '';
        const url = $(element).find('a.title').attr('href') || '';
        const name = $(element).find('a.title').text().trim() || '';
        const time = $(element).find('.ct-time').text().trim() || '';
        if (pic.endsWith('.gif') || !name) return;
        list.push({
            vod_id: url,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: time,
        });
    });
    return list;
}

function parseVodsDm($) {
    const list = [];
    $('.post-medium').each((_, element) => {
        const pic = $(element).find('.img-responsive').attr('data-echo') || '';
        const url = $(element).find('.afterglow').attr('href') || '';
        const name = $(element).find('.title').text().trim() || '';
        if (pic.endsWith('.gif') || !name) return;
        list.push({
            vod_id: url,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: '',
        });
    });
    return list;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
            { type_id: '/tag/porn',      type_name: '短视频' },
            { type_id: '/tag/long-porn', type_name: '长视频' },
            { type_id: '/av/tag/中文字幕',  type_name: '中文字幕' },
            { type_id: '/av/uncensored/type-uncensored-leak',  type_name: '无码' },
            { type_id: '/av/uncensored/type-heyzo',  type_name: 'HEYZO' },
            { type_id: '/av/uncensored/type-tokyohot',  type_name: '东京热' },
            { type_id: '/av/uncensored/type-1pondo',  type_name: '一本道' },
            { type_id: '/av/uncensored/type-caribbeancom',  type_name: 'CARIBBEANCOM' },
            { type_id: '/av/uncensored/type-10musume',  type_name: '10musume' },
            { type_id: '/av/uncensored/type-gachinco',  type_name: 'gachinco' },
            { type_id: '/av/uncensored/type-marriedslash',  type_name: '人妻斩' },
            { type_id: '/av/type-luxu',  type_name: 'LULU ' },
            { type_id: '/av/type-gana',  type_name: 'GNNA' },
            { type_id: '/av/type-maan',  type_name: 'maan' },
            { type_id: '/av/type-scute',  type_name: 'scute' },
            { type_id: '/av/type-ara',  type_name: 'ara' },
            { type_id: '/av/type-siro',  type_name: 'SIRO' },
            { type_id: '/dm',            type_name: 'H动漫' },
            { type_id: '/dm/type/q-3D',            type_name: '3D动画' },
            { type_id: '/dm/type/q-同人',            type_name: '同人' }
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    let tid = inReq.body.id;
    const pg = inReq.body.page || 1;
    const url = `${site}${tid}/page-${pg}`
    const html = await request(url);

    const $ = load(html);
    let list = parseVods($);
    if (tid.startsWith('/dm')) {
        list = parseVodsDm($);
    }
    return {
        page: parseInt(pg),
        pagecount: parseInt(pg) + 1,
        limit: 20,
        total: (parseInt(pg) + 1) * 20,
        list,
    };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const url = `${site}${id}`
    const html = await request(url);
    const $ = load(html);
    const name =  $('meta[property="og:title"]').attr('content') || '';
    const description =  $('meta[property="og:description"]').attr('content') || '';
    const pic = $('meta[property="og:image"]').attr('content') || '';
    const list = [];
    
    $('.link').each((_, element) => {
        const url = $(element).find('.my-videos').attr('data-source') || '';
        if(url) list.push(url);
    });
    if(list.length === 0) {
        const url = $('.custom-video-player').find('source').attr('src')
        if(url) list.push(url);
    }
    
    if(id.startsWith('/dm')) {
        const url = $('.my-videos').attr('data-source')
        if(url) list.push(url);
    }
    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_play_from: 'badMews',
            vod_play_url: list.map((url, i) => `第${i + 1}集$${url}`).join('#'),
            vod_content: description
        }],
    };
}




async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: {
            'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
        },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const url = `${siteUrl}/search/q-${text}/type-porn`;
    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { list };
}

export default {
    meta: {
        key: 'badNew',
        name: '🔥BadNews',
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