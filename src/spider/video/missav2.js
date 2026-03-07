import axios from 'axios';
import { load } from 'cheerio';
// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const siteUrl = 'https://missav.app';
const searchUrl = siteUrl + '/vodsearch/-------------/?wd=';
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

async function request(url) {
    const resp = await axios.get(url, { headers});
    return resp.data;
}

// 解析视频列表（对应 Java 的 parseVods）
function parseVods($) {
    const list = [];
    $('.thumbnail').each((_, element) => {
        const pic = $(element).find('.lozad').attr('data-src') || '';
        const url = $(element).find('a').eq(0).attr('href') || '';
        const name = $(element).find('.my-2 ').text().trim() || '';
        const type = $(element).find('.left-1').text().trim() || '';
        const date = $(element).find('.right-1').text().trim() || '';
        if (pic.endsWith('.gif') || !name) return;
        list.push({
            vod_id: url,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: type + '|' + date,
        });
    });
    return list;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
            { type_id: '/vodtype/51', type_name: '中文字幕' },
            { type_id: '/vodtype/26', type_name: '国产精品' },
            { type_id: '/vodtype/27', type_name: '国产剧情' },
            { type_id: '/vodtype/29', type_name: '国产自拍' },
            { type_id: '/vodtype/35', type_name: '国产主播' },
            { type_id: '/vodtype/85', type_name: '国模私拍' },
            { type_id: '/vodtype/91', type_name: '网红明星' },
            { type_id: '/vodtype/105', type_name: '国产SM' },
            { type_id: '/vodtype/107', type_name: '台湾辣妹' },
            { type_id: '/vodtype/108', type_name: '香港正妹' },
            { type_id: '/vodtype/31', type_name: '人妻' },
            { type_id: '/vodtype/44', type_name: '素人' },
            { type_id: '/vodtype/46', type_name: '口爆颜射' },
            { type_id: '/vodtype/47', type_name: '萝莉少女' },
            { type_id: '/vodtype/48', type_name: '美乳巨乳' },
            { type_id: '/vodtype/52', type_name: '制服诱惑' },
            { type_id: '/vodtype/57', type_name: '调教' },
            { type_id: '/vodtype/58', type_name: '出轨' },
            { type_id: '/vodtype/101', type_name: '有码精品' },
            { type_id: '/vodtype/102', type_name: '无码精品' },
            { type_id: '/vodtype/104', type_name: '欧美精品' },
            { type_id: '/vodtype/103', type_name: '动漫精品' },
            { type_id: '/vodtype/39', type_name: '伦理' },
    ];

    let filterObj = {
         '/vodtype/51': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '发型日期', v: 'time' },
                    { n: '评分',     v: 'score' },
                    { n: '浏览数',   v: 'hits' },
                    { n: '点赞数',   v: 'up' }   
                ]
            }
        ],
        '/vodtype/26': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '发型日期', v: 'time' },
                    { n: '评分',     v: 'score' },
                    { n: '浏览数',   v: 'hits' },
                    { n: '点赞数',   v: 'up' }   
                ]
            }
        ],
        '/vodtype/27': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '发型日期', v: 'time' },
                    { n: '评分',     v: 'score' },
                    { n: '浏览数',   v: 'hits' },
                    { n: '点赞数',   v: 'up' }   
                ]
            }
        ],
        '/vodtype/29': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '发型日期', v: 'time' },
                    { n: '评分',     v: 'score' },
                    { n: '浏览数',   v: 'hits' },
                    { n: '点赞数',   v: 'up' }   
                ]
            }
        ],
        '/vodtype/35': [
            {
                key: 'by',
                name: '排序',
                value: [
                    { n: '发型日期', v: 'time' },
                    { n: '评分',     v: 'score' },
                    { n: '浏览数',   v: 'hits' },
                    { n: '点赞数',   v: 'up' }   
                ]
            }
        ],
    }
    return { class: classes, filters: filterObj };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg = inReq.body.page || 1;
    let ext = inReq.body.filters;
    if (typeof ext === 'string') {
        try {
            ext = JSON.parse(filters)
        } catch (e) {
            ext = {}
        }
    }
    ext = ext || {}
    let by = ext?.by || ''
    let url = `${siteUrl}${tid}-${pg}` + '/';
    if(by !== '') {
        url = `${siteUrl}${tid}--${by}------${pg}---/`;
    }
    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

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
    const url = siteUrl + id;
    const html = await request(url);
    const $ = load(html);

    const name = $('.space-y-4 h1').text() || '';
    const description =  $('meta[name="description"]').eq(0).attr('content') || '';
    const pic = '';
    let playUrl =''
    const str = $('.plyr--video script').html()
    const match = str.match(/"url"\s*:\s*"([^"]+)"/);
    if (match) {
         playUrl = match[1].replace(/\\\//g, "/");
    }
    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_play_from: 'miss',
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
            'Referer': 'https://missav.app/'
        },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const url = searchUrl + text;
    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { list };
}

export default {
    meta: {
        key: 'miss',
        name: 'Miss',
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