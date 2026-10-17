import { load } from 'cheerio';
import req from '../../util/req.js';
import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
const site = 'https://javlust.net';

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
    $('.col-sm-6').each((_, el) => {
        const href = $(el).find('a').eq(0).attr('href') || '';
        if (!href) return;
        list.push({
            vod_id: $(el).find('a').eq(0).attr('href') || '',
            vod_name: $(el).find('h6').text().trim() || '',
            vod_pic: $(el).find('img').attr('data-src') || '',
            vod_remarks: $(el).find('.video-details').text().trim() || '',
        });
    });
    return list;
}

async function init() {
    return {};
}

async function home() {
    return {
        class: [
            { type_id: '/genre?name=featured-actress', type_name: '精选视频' },
            { type_id: '/most-viewed', type_name: '浏览量最高' },
            { type_id: '/amateur?sort=latest', type_name: '素人' },
            { type_id: '/censored?sort=latest', type_name: '有码' },
            { type_id: '/reducing-mosaic?sort=latest', type_name: '缩减马赛克' },
            { type_id: '/uncensored', type_name: '无码' },
            { type_id: '/genre?name=hi-def', type_name: '高清' },
            { type_id: '/genre?name=tall-girl', type_name: '高个女孩' },
            { type_id: '/genre?name=4k', type_name: '4K' },
            { type_id: '/genre?name=slender', type_name: '苗条' },
        ],
        filters: {},
    };
}

async function category(inReq) {
    let url = `${site}${inReq.body.id}&page=${inReq.body.page || inReq.body.pg || 1}`;
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const $ = load(await request(`${url}`));
    return { page, pagecount: 9999999, list: parseVods($) };
}

async function detail(inReq) {
    const id = inReq.body.id;
    const $ = load(await request(`${site}${id}`));

    const vod_play_from = [];
    const vod_play_url = [];

    // 获取播放线路
    $('button[data-src]').each((i, el) => {
        const name = $(el)
            .clone()
            .find('i')
            .remove()
            .end()
            .text()
            .trim()
            .replace(/\s+/g, ' ');

        const url = $(el).attr('data-src')?.trim();

        if (!url) return;

        // TVBox线路名称
        vod_play_from.push(name || `服务器${i + 1}`);

        // 当前页面只有一个播放地址，所以格式为：播放$URL
        vod_play_url.push(`播放$${url}`);
    });

    // 标题
    let vod_name = $('head title').text().trim();

    // 如果 title 太杂，可以优先取页面 h4
    const pageTitle = $('.mt-3 h4').first().text().trim();
    if (pageTitle) {
        vod_name = pageTitle;
    }

    // 封面
    let vod_pic = '';

    // 优先 og:image
    vod_pic = $('meta[property="og:image"]').attr('content') || '';

    // 没有的话尝试其他图片
    if (!vod_pic) {
        vod_pic =
            $('meta[name="twitter:image"]').attr('content') ||
            $('.card img').first().attr('src') ||
            '';
    }

    // 简介
    const vod_content =
        $('meta[name="description"]').attr('content') ||
        $('.mt-3 h4').first().text().trim() ||
        '';

    return {
        list: [{
            vod_id: id,
            vod_name,
            vod_pic,
            vod_content,
            vod_play_from: vod_play_from.join('$$$'),
            vod_play_url: vod_play_url.join('$$$'),
        }],
    };
}

async function play(inReq) {
    const id = inReq.body.id;
    const html = await request(`${id}`);
    const $ = load(html);
    const playUrl = $('#front-player').find('source').attr('src') || '';
    return { parse: 0, url: playUrl, header: { 'User-Agent': UA, Referer: `${site}/` } };
}

async function search(inReq) {
    const $ = load(await request(`${site}/search?q=${encodeURIComponent(inReq.body.wd || '')}`));
    return { list: parseVods($) };
}

export default {
    meta: { key: 'javlust', name: '🌸Javlust', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
