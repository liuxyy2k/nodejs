import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const site = 'https://anime1.me';
const api  = 'https://v.anime1.me/api';

async function request(url, opts = {}) {
    const resp = await axios.get(url, {
        headers: { 'User-Agent': UA },
        ...opts,
    });
    return resp;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    // 固定单一分类
    const classes = [{ type_id: 'list', type_name: '动画列表' }];

    // 首页展示 animelist.json 前几条
    const { data } = await request(`${site}/animelist.json`);
    const items = Array.isArray(data) ? data : JSON.parse(data);
    const list = items.slice(0, 48).map(e => ({
        vod_id:      `${e[0]}`,
        vod_name:    e[1],
        vod_pic:     '',
        vod_remarks: e[2] || '',
    }));

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const page = parseInt(inReq.body.page) || 1;
    // 只有第1页返回完整列表
    if (page > 1) return { page, pagecount: 1, list: [] };

    const { data } = await request(`${site}/animelist.json`);
    const items = Array.isArray(data) ? data : JSON.parse(data);
    const list = items.map(e => ({
        vod_id:      `${e[0]}`,
        vod_name:    e[1],
        vod_pic:     '',
        vod_remarks: e[2] || '',
    }));

    return { page: 1, pagecount: 1, list };
}

async function detail(inReq, _outResp) {
    const id   = inReq.body.id;
    const url  = `${site}/?cat=${id}`;
    const { data } = await request(url);
    const $    = load(data);

    const playParts = [];
    $('#main > article').each((_, e) => {
        const name = $(e).find('.entry-title a').text().trim();
        const href = $(e).find('.entry-title a').attr('href') || '';
        if (name && href) playParts.push(`${name}$${href}`);
    });

    // 剧集顺序反转（网站最新在前）
    playParts.reverse();

    const title = $('h1').first().text().trim() || id;

    return {
        list: [{
            vod_id:        id,
            vod_name:      title,
            vod_pic:       '',
            vod_play_from: 'anime1',
            vod_play_url:  playParts.join('#'),
        }],
    };
}

async function play(inReq, _outResp) {
    const href = inReq.body.id; // 单集页面 URL

    const { data } = await request(href);
    const $        = load(data);
    const apireq   = $('.vjscontainer > video').attr('data-apireq') || '';

    // POST 到 api 获取真实播放地址
    const apires = await axios.post(api, `d=${apireq}`, {
        headers: {
            'User-Agent':   UA,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer':      href,
        },
    });

    const resData = typeof apires.data === 'string'
        ? JSON.parse(apires.data)
        : apires.data;

    let playUrl = resData.s?.[0]?.src || '';
    if (playUrl && !playUrl.startsWith('https:')) playUrl = 'https:' + playUrl;

    // 提取 Set-Cookie
    let cookie = '';
    const setCookie = apires.headers['set-cookie'];
    if (setCookie) {
        (Array.isArray(setCookie) ? setCookie : setCookie.split(','))
            .forEach(c => { cookie += `${c.split(';')[0]}; `; });
    }

    return {
        parse: 0,
        url: playUrl,
        header: {
            'User-Agent': UA,
            'Cookie':     cookie.trim(),
        },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd || '');
    const page = parseInt(inReq.body.pg) || 1;
    const { data } = await request(`${site}/page/${page}?s=${text}`);
    const $ = load(data);

    const list = [];
    $('#main > article').each((_, e) => {
        const name = $(e).find('.entry-footer .cat-links a').text().trim();
        const href = $(e).find('.entry-footer .cat-links a').attr('href') || '';
        if (!name || !href) return;
        // href 形如 /?cat=123，提取 id
        const idMatch = href.match(/cat=(\d+)/);
        const id = idMatch ? idMatch[1] : href;
        list.push({ vod_id: id, vod_name: name, vod_pic: '' });
    });

    return { list };
}

export default {
    meta: {
        key: 'anime1',
        name: '🎌Anime1',
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