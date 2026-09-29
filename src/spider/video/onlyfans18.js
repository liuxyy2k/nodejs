import axios from 'axios';
import { load } from 'cheerio';
import { config } from './config.js';

const site = 'https://onlyfans18.vip';
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

// 解析视频列表（对应 Java 的 parseVods）
function parseVods($) {
    const list = [];
    $('.videoBox').each((_, element) => {
        const pic = $(element).find('.index-lazy-img').attr('data-src');
        const url = $(element).attr('href') || '';
        const name = $(element).find('.title').text().trim() || '';
        const time = $(element).find('.number').text().trim() || '';
        if (pic.endsWith('.gif') || !name) return;
        list.push({
            vod_id: url,
            vod_name: name,
            vod_pic: site + pic,
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
            { type_id: '',      type_name: '首页' },
            { type_id: '/index.php/label/new', type_name: '最新' },
            { type_id: '/index.php/vod/type/id/4',  type_name: '自拍' },
            { type_id: '/index.php/vod/type/id/1',  type_name: 'onlyfans' },
            { type_id: '/index.php/vod/type/id/2',  type_name: '网黄' },
            { type_id: '/index.php/vod/type/id/3',  type_name: '品牌' }
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    let tid = inReq.body.id;
    const pg = inReq.body.page || 1;
    let url = `${site}${tid}/page/${pg}.html`
    if(tid === '') {
        url = `${site}`;
    }
    
    const html = await request(url);
    const $ = load(html);
    let list = parseVods($);
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
    const name =  $('.video-title').text() || '';
    const description =  $('.video-title').text() || '';
    const pic = $('meta[property="og:image"]').attr('content') || '';
    const list = [];
    const match = html.match(/var\s+player_data\s*=\s*(\{.*?\})/s);
    let playUrl = ''
    if (match) {
        const playerData = JSON.parse(match[1]);
        playUrl = site + playerData.url;
    }
    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_play_from: 'onlyfans18',
            vod_play_url: '播放$' + playUrl,
            vod_content: description
        }],
    };
}




async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: {
            'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
            'Referer': site + '/'
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
        key: 'onlyfans18',
        name: '🎥Onlyfans18',
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