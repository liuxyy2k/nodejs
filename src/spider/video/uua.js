import { load } from 'cheerio';
import req from '../../util/req.js';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const SITE = 'https://www.uaa.com';

async function fetchPage(url, referer = '') {
    const resp = await req.get(url, {
        headers: {
            'User-Agent': UA,
            Referer: referer || `${SITE}/`,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            Origin: SITE,
        },
        timeout: 15000,
        validateStatus: () => true,
    });
    return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
}

function parseVods($) {
    const list = [];
    $('.video_li').each((_, e) => {
        const href = $(e).find('a').eq(0).attr('href') || '';
        const title = $(e).find('.title').text().trim();
        const cover = $(e).find('.cover').attr('src') || $(e).find('.cover').attr('data-cfsrc') || '';
        const pubdate = $(e).find('span').first().text();
        list.push({
            vod_id: href,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: pubdate,
        });
    });
    return list;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '&origin=1', type_name: '国产视频' },
        { type_id: '&origin=2', type_name: '日本AV' },
        { type_id: '&category=无码流出&origin=2', type_name: '无码流出' },
        { type_id: '&origin=3', type_name: 'H动漫' },
        { type_id: '&origin=5', type_name: '欧美' },
        { type_id: '&origin=4', type_name: '正规' },
        { type_id: '&category=主播福利&origin=', type_name: '主播福利' },
        { type_id: '&category=自拍&origin=', type_name: '自拍' },
        { type_id: '&category=高清AV&origin=2', type_name: '高清AV' },
        { type_id: '&category=里番&origin=', type_name: '里番' },
        { type_id: '&category=泡面番&origin=', type_name: '泡面番' },
        { type_id: '&category=短剧&origin=', type_name: '短剧' },
        { type_id: '&category=偷拍&origin=', type_name: '偷拍' },
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page, 10) || 1;
    const url = `${SITE}/video/list?keyword=&searchType=1${tid}&tag=&sort=1&page=${page}`;
    const html = await fetchPage(url);
    const $ = load(html);
    const list = parseVods($);

    return { page, pagecount: list.length > 0 ? page + 1 : page, list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    const url = id.startsWith('http') ? id : `${SITE}${id}`;
    const html = await fetchPage(url);
    const $ = load(html);

    const videoUrl = $('#mui-player').attr('src') || '';

    return {
        list: [{
            vod_id: id,
            vod_name: '',
            vod_pic: '',
            vod_play_from: '有爱爱',
            vod_play_url: `播放$${videoUrl}`,
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: {
            'User-Agent': UA,
            Referer: `${SITE}/`,
            Origin: SITE,
        },
    };
}

async function search(inReq, _outResp) {
    const page = Math.max(parseInt(inReq.body.page, 10) || 1, 1);
    const text = encodeURIComponent(inReq.body.wd);

    const url = page > 1
        ? `${SITE}/video/list?keyword=${text}&category=&origin=&tag=&sort=0&page=${page}`
        : `${SITE}/video/list?searchType=1&keyword=${text}`;

    const html = await fetchPage(url);
    const $ = load(html);
    const list = parseVods($);

    return { page, pagecount: list.length > 0 ? page + 1 : page, list };
}

export default {
    meta: { key: 'uaa', name: '🔥有爱爱', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
