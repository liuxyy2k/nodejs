import axios from 'axios';
import { load } from 'cheerio';
import { config } from './config.js';
import CryptoJS from 'crypto-js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://vlxxsex.online';

import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');


async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA },
    });
    return resp.data;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    let classes = [
        { type_id: '',   type_name: '首页' },
        { type_id: '/phim-sex-vietsub/',        type_name: '越南字幕' },
        { type_id: '/phim-sex-loan-luan/',         type_name: '乱伦' },
        { type_id: '/phim-sex-hiep-dam/',       type_name: '强奸' },
        { type_id: '/phim-sex-khong-che/',     type_name: '裸露' },
        { type_id: '/phim-sex-vung-trom/',        type_name: '阴谋' },
        { type_id: '/phim-sex-hay/', type_name: '性甘草' },
        { type_id: '/vlxx/',            type_name: 'vlxx' },
        { type_id: '/xnxx/',     type_name: 'xnxx' },
        { type_id: '/xvideos/',  type_name: 'xvideos' }
    ];
    
    let filterObj = {
    }
    return { class: classes, filters: filterObj };
}

async function category(inReq, _outResp) {
    const typeurl = inReq.body.id;
    const page = inReq.body.page || 1;
    let url = `${site}${typeurl}page/${page}/`;
    if(typeurl === '') {
        url = `${site}${typeurl}/page/${page}/`;
    }
    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.videos-list article').each((_, element) => {
        const href = $(element).find('a').attr('href');
        const title = $(element).find('.entry-header').text().trim() || '';
        const cover = $(element).find('img').attr('data-src');
        const duration = $(element).find('.rating-bar span').text();
        if (href) {
            videos.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: duration,
            });
        }
    });

    return { page: parseInt(page), list: videos };
}



async function detail(inReq, _outResp) {
    const url = inReq.body.id;
    const html = await request(url);
    const $ = load(html);

    const name = $('meta[name="twitter:title"]').attr('content') || '';
    const pic  = $('meta[property="twitter:image"]').attr('content') || '';
    const description = $('meta[name="description"]').attr('content') || '';
    let embed = $('.responsive-player iframe').attr('src') || '';
    return {
        list: [{
            vod_id: url,
            vod_name: name,
            vod_pic: pic,
            vod_play_from: 'Vlxx',
            vod_play_url: embed ? `播放$${embed}` : ''
        }]
    };
}

function unpackPacker(code) {
    const args = code.match(
        /}\(\s*'([\s\S]*?)'\s*,\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/
    );

    if (!args) return '';

    let payload = args[1];
    const base = parseInt(args[2]);
    let count = parseInt(args[3]);
    const dict = args[4].split('|');

    // 关键：支持更复杂情况
    for (let i = count - 1; i >= 0; i--) {
        if (dict[i]) {
            const reg = new RegExp('\\b' + i.toString(base) + '\\b', 'g');
            payload = payload.replace(reg, dict[i]);
        }
    }

    return payload;
}

async function play(inReq, _outResp) {
    const id = inReq.body.id
    const origin = new URL(id).origin;
    console.log(origin)
    const resp = await axios.get(id, {
        headers: { 'User-Agent': UA,
            'Referer': site
         },
    });
    const embResp = resp.data;
    const match = embResp.match(
        /eval\(function\(p,a,c,k,e,d\)[\s\S]+?}\(\s*'[\s\S]+?'\s*,\s*\d+\s*,\s*\d+\s*,\s*'[\s\S]+?'\.split\('\|'\)\s*\)\)/
    );
    const evalCode = match[0];

    let payload = ''
    let m3u8 = '';
    if (evalCode) {
        payload = unpackPacker(evalCode);
        const link = payload.match(/var\s+links\s*=\s*(\{[\s\S]*?\})/);
        let links = {};
        if (link) {
            links = JSON.parse(link[1]);
            m3u8 = origin + links.hls4
        }
    }

    return {
        parse: 0,
        url: m3u8,
        header: { 'User-Agent': UA, 'Referer': id },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const page = inReq.body.pg || 1;
    const url = `${site}/vod/search.html?wd=${text}`;

    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.videos-list article').each((_, element) => {
        const href = $(element).find('a').attr('href');
        const title = $(element).find('.entry-header').text().trim() || '';
        const cover = $(element).find('img').attr('data-src');
        const duration = $(element).find('.rating-bar span').text();
        if (href) {
            videos.push({
                vod_id: href,
                vod_name: title,
                vod_pic: site + cover,
                vod_remarks: duration,
            });
        }
    });

    return { list: videos };
}

export default {
    meta: {
        key: 'vlxxsex',
        name: '🌸Vlxxsex',
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