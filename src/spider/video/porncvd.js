import axios from 'axios';
import { load } from 'cheerio';
import { config } from './config.js';

const FLARE_URL = config.FLARE_URL;

const siteUrl = 'https://porncvd.com';
const searchUrl = siteUrl + '/search/javs?search_query=';
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

async function request(url) {
    const resp = await axios.post(FLARE_URL, {
        cmd: 'request.get',
        url: url,
        maxTimeout: 60000,
    });
    return resp.data.solution.response;
}

// 解析视频列表（对应 Java 的 parseVods）
function parseVods($) {
    const list = [];
    $('.col-sm-6').each((_, element) => {
        const pic = $(element).find('.img-fluid').attr('data-src') || '';
        const url = $(element).find('a').eq(0).attr('href') || '';
        const name = $(element).find('h3').text().trim() || '';
        const remark = $(element).find('.iconicfill-eye').text().trim() || '';
        if (pic.endsWith('.gif') || !name) return;
        list.push({
            vod_id: url,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: remark,
        });
    });
    return list;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
            { type_id: '/cat/探花/', type_name: '探花' },
            { type_id: '/cat/自拍/', type_name: '自拍' },
            { type_id: '/cat/流出/', type_name: '流出' },
            { type_id: '/cat/偷拍/', type_name: '偷拍' },
            { type_id: '/cat/台灣/', type_name: '台湾' },
            { type_id: '/cat/國產/', type_name: '国产' },
            { type_id: '/cat/日韓/', type_name: '日韩' },
            { type_id: '/cat/动漫/', type_name: '动漫' },
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg = inReq.body.page || 1;

    const url = `${siteUrl}${tid}${pg}`;
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

    const name = $('meta[name="keywords"]').attr('content') || '';
    const pic = $('meta[property="og:image"]').attr('content') || '';
    const base = new URL(pic).origin;
    const str = $('#video-in').attr('value')
    let base64 = await decUrl(str)

    let playUrl = base + base64
    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_play_from: 'porncvd',
            vod_play_url: '播放$' + playUrl,
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
        key: 'PornCvd',
        name: 'PornCvd',
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