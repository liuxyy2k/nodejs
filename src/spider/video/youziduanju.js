import { load } from 'cheerio';
import req from '../../util/req.js';
import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
const site = 'https://youzidj.com';

import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const headers = {
    'User-Agent': UA,
    Referer: `${site}/`,
};
async function request(reqUrl) {
    const resp = await axios.get(reqUrl, {
        headers: headers,
        // httpsAgent: agent
    });
    return resp.data;
}

function parseVods($) {
    const list = [];
    $('.drama-card').each((_, el) => {
        const vod_pic = $(el).find('img').attr('src').startsWith('/') ? site + $(el).find('img').attr('src') : site + $(el).find('img').attr('data-image-src');
        list.push({
            vod_id: $(el).find('a').eq(0).attr('href') || '',
            vod_name: $(el).find('.drama-card-title').text().trim() || '',
            vod_pic: vod_pic,
            vod_remarks: $(el).find('.drama-poster-episodes').text().trim() ||'',
        });
    });
    return list;
}

async function init() {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
            { type_id: '/dramas/', type_name: '全部' },
            { type_id: '/dramas/category/cultivation/', type_name: '修仙' },
            { type_id: '/dramas/category/wealthy-family/', type_name: '豪门' },
            { type_id: '/dramas/category/family-ethics/', type_name: '伦理' },
            { type_id: '/dramas/category/campus/', type_name: '校园' },
            { type_id: '/dramas/category/martial-arts/', type_name: '武侠' },
            { type_id: '/dramas/category/urban/', type_name: '都市' },
            { type_id: '/dramas/category/costume/', type_name: '古装' }
    ];
    return { class: classes, filters: {} };
}

async function category(inReq) {
    let url = `${site}${inReq.body.id}page/${inReq.body.page || inReq.body.pg || 1}/`;
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const $ = load(await request(`${url}`));
    return { page, pagecount: 9999999, list: parseVods($) };
}

async function detail(inReq) {
    const id = inReq.body.id;
    const $ = load(await request(`${id}`));
    const playList = [];
    $('.series-episode-grid a').each((_, el) => {
        const name = $(el).text().trim();
        const url = $(el).attr('href');
        if (name && url) {
            playList.push(`${name}$${url}`);
        }
    });
    return {
        list: [{
            vod_id: id,
            vod_name: $('meta[property="og:title"]').attr('content') || '',
            vod_pic: $('meta[property="og:image"]').attr('content') || '',
            vod_content: $('meta[property="og:description"]').attr('content') || '',
            vod_play_from: '柚子短剧',
            vod_play_url: playList.join('#'),
        }],
    };
}

function takeCookies(resp, jar) {
    for (const raw of resp.headers?.['set-cookie'] || []) {
        const pair = String(raw).split(';')[0];
        const name = pair.split('=')[0];
        if (name) jar.set(name, pair);
    }
}

async function play(inReq) {
    const page = String(inReq.body.id || '').trim();
    const html = await request(page);
    const videoId = String(html).match(/data-video="([^"]+)"/)?.[1] || '';
    const jar = new Map();
    const base = {
        'User-Agent': UA,
        Referer: page,
        Origin: site,
        'Content-Type': 'application/json',
    };
    if (!videoId) {
        return { parse: 0, url: '', header: { 'User-Agent': UA, Referer: page || `${site}/` } };
    }
    const boot = await axios.post(`${site}/api/account/bootstrap`, {}, {
        headers: base,
        timeout: 20000,
        validateStatus: () => true,
    });
    takeCookies(boot, jar);
    const cookie = () => [...jar.values()].join('; ');
    const resp = await axios.post(`${site}/api/playback/${videoId}?mode=native&startup=1`, {}, {
        headers: { ...base, Cookie: cookie() },
        timeout: 20000,
        validateStatus: () => true,
    });
    takeCookies(resp, jar);
    const path = resp.data?.url || '';
    const url = path.startsWith('http') ? path : path ? new URL(path, site).href : '';
    return {
        parse: 0,
        url,
        header: {
            'User-Agent': UA,
            Referer: page,
            Cookie: cookie(),
        },
    };
}

async function search(inReq) {
    const $ = load(await request(`${site}/search?q=${encodeURIComponent(inReq.body.wd || '')}`));
    return { list: parseVods($) };
}

export default {
    meta: { key: 'youzi', name: '📖柚子短剧', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
