import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const site = 'https://91pornpp.com';

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, Referer: `${site}/`, ...headers },
        timeout: 25000,
    });
    return resp.data;
}

function parseVods($) {
    const videos = [];
    $('div.p91-tile').each((_, element) => {
        const $el = $(element);
        const $a = $el.find('a.p91-tilelink').first();
        const url = $a.attr('href') || $el.find('a[href]').first().attr('href') || '';
        const hit = url.match(/\/(\d+)(?:[?#/]|$)/);
        const id = (hit && hit[1]) || $el.attr('data-id') || '';
        const name = $el.find('h3').first().text().trim() || $el.find('img').first().attr('alt') || '';
        const pic = $el.find('img').first().attr('src') || $el.find('.p91-thumb').attr('data-preview') || '';
        const remark = $el.find('.p91-tlen').first().text().trim();
        if (!id || !name) return;
        videos.push({
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: remark,
        });
    });
    return videos;
}

function parsePageCount($, page) {
    let pagecount = page;
    $('a[href]').each((_, element) => {
        const href = $(element).attr('href') || '';
        const match = href.match(/\/page\/(\d+)/);
        if (!match) return;
        const n = parseInt(match[1]);
        if (n > pagecount) pagecount = n;
    });
    return pagecount;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: 'remen', type_name: '热门' },
        { type_id: 'benyue', type_name: '本月最热' },
        { type_id: 'yuanchuang', type_name: '91原创' },
        { type_id: 'jiajing', type_name: '最近加精' },
        { type_id: 'renqi', type_name: '人妻' },
        { type_id: 'tiaojiao', type_name: '调教' },
        { type_id: 'juru', type_name: '巨乳' },
        { type_id: 'xuesheng', type_name: '女大学生' },
        { type_id: 'houru', type_name: '后入' },
        { type_id: 'qiaotun', type_name: '翘臀' },
        { type_id: 'nvyou', type_name: '女友' },
        { type_id: 'laopo', type_name: '老婆' },
        { type_id: 'heisi', type_name: '黑丝' },
        { type_id: 'koujiao', type_name: '口交' },
        { type_id: 'shunv', type_name: '熟女' },
        { type_id: 'neishe', type_name: '内射' },
        { type_id: 'saohuo', type_name: '骚货' },
        { type_id: 'zipai', type_name: '自拍' },
        { type_id: 'gaochao', type_name: '高潮' },
        { type_id: 'jipinmeinv', type_name: '极品美女' },
        { type_id: 'fancha', type_name: '反差' },
        { type_id: 'siwa', type_name: '丝袜' },
        { type_id: 'shaofu', type_name: '少妇' },
        { type_id: 'ziwei', type_name: '自慰' },
        { type_id: 'loulian', type_name: '露脸' },
        { type_id: 'mugou', type_name: '母狗' },
        { type_id: 'wutao', type_name: '无套' },
        { type_id: 'chugui', type_name: '出轨' },
        { type_id: 'jiudian', type_name: '酒店' },
        { type_id: 'yuepao', type_name: '约炮' },
        { type_id: 'saobi', type_name: '骚逼' },
        { type_id: 'zhibo', type_name: '直播' },
        { type_id: 'chigua', type_name: '吃瓜' },
        { type_id: 'hushi', type_name: '护士' },
        { type_id: 'anmo', type_name: '按摩' },
        { type_id: 'qingchun', type_name: '清纯' },
        { type_id: 'manzhan', type_name: '漫展' },
        { type_id: 'chezhen', type_name: '车震' },
        { type_id: 'huwai', type_name: '户外' },
        { type_id: 'zhanli', type_name: '站立' },
    ];

    const html = await request(site);
    const $ = load(html);
    const list = parseVods($);

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    let url = `${site}/${tid}`;
    if (page > 1) {
        url = `${site}/${tid}/page/${page}`;
    }

    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { page, pagecount: parsePageCount($, page), list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const url = `${site}/${id}`;
    const html = await request(url);
    const $ = load(html);

    const name = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || '';
    const pic = $('meta[property="og:image"]').attr('content') || '';
    const desc = $('meta[name="description"]').attr('content') || '';
    const remark = $('.p91-tlen').first().text().trim();
    const actor = $('.p91-vauthor-t b').first().text().trim();

    const tags = [];
    $('.p91-vtags a').each((_, element) => {
        const text = $(element).text().trim();
        if (text && !tags.includes(text)) tags.push(text);
    });

    let playUrl = '';
    try {
        const data = await request(`${site}/api/play/${id}/0`, { Accept: 'application/json' });
        const src = (data && data.src) || '';
        if (src) playUrl = `第1集$${src}`;
    } catch (e) {
        playUrl = '';
    }

    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_content: desc,
            vod_remarks: remark,
            vod_actor: actor,
            type_name: tags.join(','),
            vod_play_from: '91pornpp',
            vod_play_url: playUrl,
        }],
    };
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    let url = id;

    if (/^\d+$/.test(id)) {
        try {
            const data = await request(`${site}/api/play/${id}/0`, { Accept: 'application/json' });
            url = (data && data.src) || '';
        } catch (e) {
            url = '';
        }
    }

    return {
        parse: 0,
        url,
        header: { 'User-Agent': UA, Referer: `${site}/` },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const url = `${site}/search?q=${text}`;
    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { list };
}

export default {
    meta: {
        key: '91pornpp',
        name: '🎞️91pornpp',
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
