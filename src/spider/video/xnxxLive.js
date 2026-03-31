import axios from 'axios';
import { load } from 'cheerio';
// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const siteUrl = 'https://www.xnxx-livecams.com';
const searchUrl = siteUrl + '/vodsearch/-------------/?wd=';
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': siteUrl + '/'
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
            { type_id: '', type_name: '精选' },
            { type_id: 'f', type_name: '女性' },
            { type_id: 'm', type_name: '男士' },
            { type_id: 'c', type_name: '情侣' },
            { type_id: 't', type_name: '跨性别' },
    ];

    let filterObj = {
        '': [
            {
                key: 'reg',
                name: '地区',
                value: [
                    { n: '亚洲',   v: 'AS' },
                    { n: '北美',   v: 'NA' },
                    { n: '南美',   v: 'SA' },
                    { n: '欧洲',   v: 'ER' },
                    { n: '其他',   v: 'O' }     
                ]
            }
        ],
        'f': [
            {
                key: 'reg',
                name: '地区',
                value: [
                    { n: '亚洲',   v: 'AS' },
                    { n: '北美',   v: 'NA' },
                    { n: '南美',   v: 'SA' },
                    { n: '欧洲',   v: 'ER' },
                    { n: '其他',   v: 'O' }     
                ]
            }
        ],
        'm': [
            {
                key: 'reg',
                name: '地区',
                value: [
                    { n: '亚洲',   v: 'AS' },
                    { n: '北美',   v: 'NA' },
                    { n: '南美',   v: 'SA' },
                    { n: '欧洲',   v: 'ER' },
                    { n: '其他',   v: 'O' }     
                ]
            }
        ],
        'c': [
            {
                key: 'reg',
                name: '地区',
                value: [
                    { n: '亚洲',   v: 'AS' },
                    { n: '北美',   v: 'NA' },
                    { n: '南美',   v: 'SA' },
                    { n: '欧洲',   v: 'ER' },
                    { n: '其他',   v: 'O' }     
                ]
            }
        ],
        't': [
            {
                key: 'reg',
                name: '地区',
                value: [
                    { n: '亚洲',   v: 'AS' },
                    { n: '北美',   v: 'NA' },
                    { n: '南美',   v: 'SA' },
                    { n: '欧洲',   v: 'ER' },
                    { n: '其他',   v: 'O' }     
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
    let reg = ext?.reg || ''
    let url = `https://www.xnxx-livecams.com/api/ts/roomlist/room-list/?campaign=7CGuc&disable_sound=0&genders=${tid}&limit=90&offset=${(pg-1) * 90}&tour=EuIR&track=xn-tab`
    if(tid === '') {
        url = `https://www.xnxx-livecams.com/api/ts/roomlist/room-list/?campaign=7CGuc&disable_sound=0&limit=90&offset=${(pg-1) * 90}&tour=EuIR&track=xn-tab`
    }
    // reg 不为空时追加
    if (reg !== '') {
        url += `&regions=${reg}`
    }
    const html = await request(url);
    const videos = []
    for (const item of html.rooms) {
        if (item.username) {
            videos.push({
                vod_id: item.username,
                vod_name: item.username,
                vod_pic: item.img,
                vod_remarks: item.location,
            })
        }
    }

    return { page: pg, list: videos };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const html = await request(`${siteUrl}/${id}/`);
    const match = html.match(/window\.initialRoomDossier\s*=\s*("(?:\\.|[^"])*")/);
    if (!match) return null;
    // 先把 JS 字符串转成正常字符串
    const jsonStr = JSON.parse(match[1]);
    // 再把 JSON 转对象
    const room = JSON.parse(jsonStr);
    // ❗先判断是否在线
    if (room.room_status !== 'public' || !room.hls_source) {
        return {
            list: [{
                vod_id: id,
                vod_name: id + ' (未开播)',
                vod_pic: '',
                vod_play_from: 'xnxx',
                vod_play_url: '',
                vod_content: room.room_title
            }]
        };
    }

    let playUrl = room.hls_source
    // const master  = await request(playUrl);
    // console.log(master)
    // //解析最高画质
    // const best = getBestStream(master, playUrl);

    return {
        list: [{
            vod_id: id,
            vod_name: id,
            vod_pic: '',
            vod_play_from: 'xnxx',
            vod_play_url: '高清$' + playUrl,
            vod_content: room.room_title
        }],
    };
}

function getBestStream(content, baseUrl) {
    const lines = content.split('\n');
    const streams = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (!line.startsWith('#EXT-X-STREAM-INF')) continue;

        const url = lines[i + 1]?.trim();
        if (!url) continue;

        const resolution = line.match(/RESOLUTION=(\d+)x(\d+)/);

        if (!resolution) continue;

        const width = Number(resolution[1]);
        const height = Number(resolution[2]);

        streams.push({
            pixels: width * height,
            url: new URL(url, baseUrl).href
        });
    }

    return streams.sort((a, b) => b.pixels - a.pixels)[0];
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: headers
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
        key: 'xnxx',
        name: 'XnxxLive',
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