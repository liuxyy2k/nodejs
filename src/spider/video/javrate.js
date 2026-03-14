import axios from 'axios';
import { load } from 'cheerio';

const siteUrl = 'https://www.javrate.com';
const searchUrl = siteUrl + '/search/javs?search_query=';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function request(url) {
    const resp = await axios.post('http://192.168.31.245:8191/v1', {
        cmd: 'request.get',
        url: url,
        maxTimeout: 60000,
    });
    return resp.data.solution.response;
}

function parseVods($) {
    const list = [];
    $('.mgn-item').each((_, element) => {
        if(!$(element).attr('data-index')) return
        const pic = $(element).find('.mgn-cover').attr('src') || '';
        const url = $(element).find('.movie-card-link').attr('href') || '';
        const name = $(element).find('.movie-card-link').attr('title') || '';
        const year = $(element).find('.mgn-badge-year').text().trim() || '';
        const type = $(element).find('.mgn-badge-type').text().trim() || '';
        list.push({
            vod_id: url,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: year + '|' + type,
        });
    });
    return list;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
            { type_id: '/movie/new', type_name: '最近更新' },
            { type_id: '/menu/uncensored', type_name: '无码A片' },
            { type_id: '/menu/censored', type_name: '日本A片' },
            { type_id: '/menu/chinese', type_name: '国产AV' },
            { type_id: '/best', type_name: '最多人看' }
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg = inReq.body.page || 1;
    let url = `${siteUrl}${tid}`;
    if( pg > 1) {
        url = `${siteUrl}${tid}/5-2-${pg}`
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

    const name = $('meta[name="twitter:title"]').attr('content') || '';
    const pic = $('meta[property=witter:image"]').attr('content') || '';
    const description = $('meta[name=description"]').attr('content') || '';
    const player = $('#v2-player').attr('src')
    let plaUrl = siteUrl + player
    const resp = await request(plaUrl);
    const match = resp.match(/initialSignedUrl:\s*'([^']+\.m3u8[^']*)'/);
    let m3u8 = match ? match[1] : '';
    const m3u8Data = await axios.get(m3u8, {
        headers: { 'User-Agent': UA,
                    'Referer': url
        },
    });
    console.log(m3u8Data.data)
    let top = m3u8.replace('playlist.m3u8','')
    const res = []
    const lines = m3u8Data.data.split("\n").filter(v => v.includes("/video.m3u8"))
    for(const line of lines){
        const name = line.trim().replace("/video.m3u8", "")
        const m = name.match(/(\d+)p|(\d+)x(\d+)/)
        if(!m) continue
        const r = parseInt(m[1] || m[3])
        res.push({
            name,
            resolution: r,
            url: `${top}${line.trim()}`
        })
    }
    // 从高到低排序
    res.sort((a, b) => b.resolution - a.resolution)
    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_play_from: 'javrate',
            vod_play_url: res.map(v => `${v.name}$${v.url}`).join("#"),
            vod_content: description
        }],
    };
}

async function decUrl(str) {
    let b64 = "";
    for (let i = 0; i < str.length; i++) {
        b64 += String.fromCharCode(str.charCodeAt(i) - 3);
    }
    return Buffer.from(b64, "base64").toString("utf-8");
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: {
            'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
            'Referer': ''
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
        key: 'javrate',
        name: '鉴黄师',
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