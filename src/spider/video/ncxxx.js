import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';

// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

const site = 'https://529493.ncxxldd001.top';

const PORT   = process.env.DEV_HTTP_PORT || 9988;

async function request(reqUrl) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA },
        // httpsAgent: agent
    });
    return resp.data;
}


async function parseVods($) {
    const items = [];
    $('.thumbnail-group li').each((_, element) => {
        const rawPic = $(element).find('.loadi').attr('data-original') || '';
        const url = $(element).find('.thumbnail').attr('href') || '';
        const name = $(element).find('h5').text().trim();
        const date  = $(element).find('.title').text().trim();
        if (name && url) {
            items.push(
                { 
                    vod_id: url, 
                    vod_name: name, 
                    vod_pic: rawPic,
                    vod_remarks: date
                }
            );
        }
    });

    return items
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '29',            type_name: '每日更新1区' },
        { type_id: '30',            type_name: '每日更新2区' },
        { type_id: '92',            type_name: '每日更新3区' }
    ];
     let filterObj = {
         '29': [
            {
                key: 'tag',
                name: '分类',
                value: [
                    { n: '黑料网曝', v: '73' },
                    { n: '主播做爱', v: '64' },
                    { n: '传媒出品', v: '65' },
                    { n: '探花约炮', v: '66' },
                    { n: '自拍视频', v: '67' },
                    { n: '高清做爱', v: '74' },
                    { n: '动漫',     v: '69' },
                    { n: '欧美精品', v: '68' },
                    { n: 'AI换脸',   v: '76' },
                    { n: '女同',     v: '70' },
                    { n: '调教SM',   v: '75' }
                ]
            }
        ],
        '30': [
            {
                key: 'tag',
                name: '分类',
                value: [
                    { n: '国产精品', v: '77' },
                    { n: '偷拍自拍', v: '54' },
                    { n: '国产探花', v: '57' },
                    { n: '直播做爱', v: '50' },
                    { n: '精品推荐', v: '49' },
                    { n: '网曝流出', v: '55' },
                    { n: '乱伦实录',     v: '62' },
                    { n: '换脸明星', v: '63' },
                    { n: '麻豆诱惑',   v: '61' },
                    { n: '制服诱惑',     v: '60' },
                    { n: '人妻熟女',   v: '58' }
                ]
            }
        ],
        '92': [
            {
                key: 'tag',
                name: '分类',
                value: [
                    { n: '网红头条', v: '99' },
                    { n: '国产主播', v: '96' },
                    { n: '国产视频', v: '95' },
                    { n: '网曝黑料', v: '94' },
                    { n: '国产传媒', v: '97' },
                    { n: '明星换脸', v: '100' },
                    { n: '女同',     v: '98' },
                    { n: '抖阴视频', v: '101' },
                    { n: '伦理三级',   v: '114' },
                    { n: '欧美无码',     v: '110' },
                    { n: '强奸乱伦',   v: '112' },
                    { n: '女优明星',   v: '111' },
                    { n: '制服诱惑',   v: '115' },
                    { n: '日本有码',   v: '108' },
                    { n: '日本无码',   v: '109' },
                    { n: '萝莉少女',   v: '113' },
                    { n: '中文字幕',   v: '107' },
                    { n: '激情动漫',   v: '102' },
                    { n: 'SM调教',   v: '103' },
                    { n: '韩国主播',   v: '104' },
                    { n: 'VR视角',   v: '105' },
                    { n: '人妖',   v: '106' },
                    
                ]
            }
        ],
    }
    return { class: classes, filters: filterObj };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    let ext = inReq.body.filters;
    if (typeof ext === 'string') {
        try {
            ext = JSON.parse(filters)
        } catch (e) {
            ext = {}
        }
    }
    ext = ext || {}
    let tag = ext?.tag || ''
    const page = parseInt(inReq.body.page) || 1;
    let url = `${site}/ncxx/index.php/vod/type/id/${tag === '' ? tid : tag}/page/${page}.html`
    const html = await request(url);
    const $ = load(html);
    const list = await parseVods($);
    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const html = await request(`${site}${id}`);
    const $ = load(html);

    let name = $('meta[name="keywords"]').attr('content') || '';
    const desc = $('meta[name="og:description"]').attr('content') || '';
    const playUrl = $('.btn-success').attr('href') || ''
    const playData = await request(`${site}${playUrl}`);
    const match = playData.match(/var player_aaaa\s*=\s*({[\s\S]*?})\s*<\/script>/);
    let m3u8 = ''
    if (match) {
        const objStr = match[1];
        console.log(objStr);

        // 如果需要解析成对象
        const obj = JSON.parse(objStr.replace(/\\\//g, '/')); // 修正 \/ 为 /
        name = obj.vod_data.vod_name
        m3u8 = obj.url
        console.log(obj);
    } else {
        console.log('未匹配到 player_aaaa 对象');
    }
    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: '',
            vod_play_from: '农村xx伦',
            vod_play_url: '播放$' + m3u8,
            vod_content: desc,
        }],
    };
}

async function play(inReq, _outResp) {
    const url = inReq.body.id
    const myUrl = new URL(url);
    const html = await request(`${url}`);
    const match = html.match(/var\s+videoUrl\s*=\s*"([^"]+)"/);
    let videoUrl = '';
    if (match) {
        videoUrl = match[1];
        console.log(videoUrl);
    } else {
        console.log("未匹配到 videoUrl");
    }
    return {
        parse: 0,
        url: videoUrl,
        header: { 'User-Agent': UA , 'Referer': myUrl.origin},
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const html = await request(`${site}/ncxx/index.php/vod/search.html?wd=${text}`);
    const $ = load(html);
    const list = await parseVods($);

    return { list };
}


export default {
    meta: {
        key: 'ncxxx',
        name: '🔥农村xx伦',
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