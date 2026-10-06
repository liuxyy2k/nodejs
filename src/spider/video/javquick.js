import { load } from 'cheerio';
import req from '../../util/req.js';
import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
const site = 'https://javquick.com';

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
        httpsAgent: agent
    });
    return resp.data;
}

function parseVods($) {
    const list = [];
    $('article').each((_, el) => {
        list.push({
            vod_id: $(el).find('a').eq(0).attr('href') || '',
            vod_name: $(el).find('h2').text().trim() || '',
            vod_pic: $(el).find('img').attr('data-srcset') || $(el).find('img').attr('src') ||'',
            vod_remarks: 'Jav',
        });
    });
    return list;
}

async function init() {
    return {};
}

async function home() {
    let classList = [];
    classList.push({
        type_id: '/release',
        type_name: '最新发行',
    });
    const html = await request(`${site}/genres`);
    const $ = load(html);
    $('.genre-item').each((_, el) => {
        classList.push({
            type_id: $(el).find('a').eq(0).attr('href') || '',
            type_name: $(el).find('a').text().trim() || '',
        });
    });
    return { class: classList, filters: {} };
}

async function category(inReq) {
    let url = `${site}${inReq.body.id}?page=${inReq.body.page || inReq.body.pg || 1}`;
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const $ = load(await request(`${url}`));
    return { page, pagecount: 9999999, list: parseVods($) };
}

async function detail(inReq) {
    const id = inReq.body.id;
    const $ = load(await request(`${site}${id}`));
    const currentUrl = `${site}${id}`;
    const vod_play_from = [];
    const vod_play_url = [];
    $('#video-source-list .video-format').each((i, el) => {
        // 清晰度：HD / FullHD
        const format = $(el)
            .find('.video-format-header')
            .text()
            .trim();

        const urls = [];

        $(el).find('.video-source-btn').each((j, a) => {

            const name = $(a).text().trim();
            let href = $(a).attr('href');

            // 当前页面的第1集 href="#"
            if (!href || href === '#') {
                href = currentUrl;
            } else {
                // 相对地址转绝对地址
                href = new URL(href, currentUrl).href;
            }

            urls.push(`${name}$${href}`);
        });

        // 当前清晰度有播放地址才加入
        if (urls.length > 0) {
            vod_play_from.push(format);
            vod_play_url.push(urls.join('#'));
        }
    });

    return {
        list: [{
            vod_id: id,
            vod_name: $('head').find('title').text().trim() || '',
            vod_pic: '',
            vod_content: $('meta[name="description"]').attr('content') || '',
            vod_play_from: vod_play_from.join('$$$'),
            vod_play_url: vod_play_url.join('$$$'),
        }],
    };
}

async function play(inReq) {
    const id = inReq.body.id;
    const $ = load(await request(`${id}`));
    const dataId = $('#video-player').attr('data-id');
    const playUrl = await request(`${site}/watch?token=${dataId}`);
    return { parse: 0, url: playUrl, header: { 'User-Agent': UA, Referer: `${site}/` } };
}

async function search(inReq) {
    const $ = load(await request(`${site}/search?q=${encodeURIComponent(inReq.body.wd || '')}`));
    return { list: parseVods($) };
}

export default {
    meta: { key: 'javquick', name: '🌸Javquick', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
