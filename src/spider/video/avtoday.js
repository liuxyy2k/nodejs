import axios from 'axios';
import { load } from 'cheerio';
// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const site = 'https://avtoday.io';

async function request(url, headers = {}) {
    const resp = await axios.get(url, {
        headers: { 'User-Agent': UA, ...headers },
        // httpsAgent: agent
    });
    return resp.data;
}

function parseCards($) {
    const list = [];
    $('.thumbnail').each((_, element) => {
        const title = $(element).find('.video-title a').text();
        if (!title || title.includes('[廣告]')) return;

        const href     = $(element).find('.video-title a').attr('href') || '';
        const subTitle = $(element).find('.video-tag').text().trim();
        const duration = $(element).find('.video-duration').text().trim();
        const pubdate  = $(element).find('.video-date').text().trim();
        const style    = $(element).find('.preview-video').attr('style') || '';
        const match    = style.match(/url\('(.*?)'\)/);
        const cover    = match ? site + match[1] : '';

        list.push({
            vod_id:      href,
            vod_name:    title,
            vod_pic:     cover,
            vod_remarks: subTitle,
        });
    });
    return list;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const html = await request(`${site}/catalog`);
    const $    = load(html);

    const classes = [];
    $('.swiper-wrapper > .swiper-slide').each((_, e) => {
        const name = $(e).find('.btn-categories__title').text().trim();
        const info = $(e).find('.btn-categories__info').text().split(' ')[0];
        const href = $(e).find('a.btn-categories').attr('href') || '';
        if (!name || !href || name === 'AI AV后宮') return;
        classes.push({
            type_id:   href,
            type_name: `${name} (${info})`,
        });
    });

    // 首页推荐用第一个分类或首页
    const html2 = await request(site);
    const $2    = load(html2);
    const list  = parseCards($2);

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    const url  = page > 1 ? `${tid}?page=${page}` : tid;
    const html = await request(url);
    const $    = load(html);
    const list = parseCards($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const href = inReq.body.id; // 形如 /video/xxxxx
    const code = href.split('/video/')[1];
    const playerUrl = `${site}/player?s=${code}`;

    const html    = await request(playerUrl, { Referer: `${site}${href}` });
    const m3u8Match = html.match(/m3u8_url\s+=\s+'(.+)'/);
    const playUrl = m3u8Match ? m3u8Match[1] : '';

    return {
        list: [{
            vod_id:        href,
            vod_name:      href,
            vod_pic:       '',
            vod_play_from: 'avtoday',
            vod_play_url:  `播放$${playUrl}`,
        }],
    };
}

async function play(inReq, _outResp) {
    const url = inReq.body.id;
    return {
        parse: 0,
        url,
        header: {
            'User-Agent': UA,
            'Referer': 'https://avtoday.io/player?s=' + url.replace('/video/',''),
        },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd || '');
    const page = parseInt(inReq.body.pg) || 1;

    const html = await request(`${site}/search?s=${text}&page=${page}`);
    const $    = load(html);
    const list = parseCards($);

    return { list };
}

export default {
    meta: {
        key: 'avtoday',
        name: 'AVToday',
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