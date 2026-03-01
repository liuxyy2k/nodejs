import axios from 'axios';
import { load } from 'cheerio';

const UA   = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Mobile/15E148 Safari/604.1';
const site = 'https://ppp.porn';

async function request(url, headers = {}) {
    const resp = await axios.get(url, {
        headers: { 'User-Agent': UA, ...headers },
    });
    return resp.data;
}

function parseCards($, selector = '#list_videos_common_videos_list_items .item') {
    const list = [];
    $(selector).each((_, element) => {
        const title    = $(element).find('h4 a').text().trim();
        const cover    = $(element).find('img').attr('data-src') || '';
        const href     = $(element).find('h4 a').attr('href') || '';
        const duration = $(element).find('.card-video__duration').text().trim();
        if (!href || !title) return;
        list.push({
            vod_id:      href,
            vod_name:    title,
            vod_pic:     cover,
            vod_remarks: duration,
        });
    });
    return list;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const html = await request(`${site}/categories/`, { 'Referer': 'https://ppp.porn/pp1/' });
    const $    = load(html);

    const classes = [];
    $('section.padding-bottom-xl .card-cat-v2').each((_, e) => {
        const title = $(e).find('.card-cat-v2__title').text().trim();
        const count = $(e).find('.card-cat-v2__count').text().trim();
        const href  = $(e).find('a').attr('href') || '';
        if (!title || !href) return;
        classes.push({
            type_id:   href,
            type_name: `${title}(${count})`,
        });
    });

    // 首页推荐取第一个分类第一页
    const firstHref = classes[0]?.type_id || '';
    let list = [];
    if (firstHref) {
        const listUrl  = `${firstHref}?mode=async&function=get_block&block_id=list_videos_common_videos_list&sort_by=post_date&from=1`;
        const listHtml = await request(listUrl);
        const $2       = load(listHtml);
        list           = parseCards($2);
    }

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const href = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    const url  = `${href}?mode=async&function=get_block&block_id=list_videos_common_videos_list&sort_by=post_date&from=${page}`;
    const html = await request(url);
    const $    = load(html);
    const list = parseCards($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const href = inReq.body.id;
    const html = await request(href);
    const $    = load(html);

    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic  = $('meta[property="og:image"]').attr('content') || '';

    let m3u8Url = '';
    $('script').each((_, script) => {
        if (m3u8Url) return;
        const content = $(script).html() || '';
        if (content.includes('.m3u8')) {
            const match = content.match(/https?:\/\/[\w./-]+\.m3u8/);
            if (match) m3u8Url = match[0];
        }
    });

    return {
        list: [{
            vod_id:        href,
            vod_name:      name,
            vod_pic:       pic,
            vod_play_from: 'pppPorn',
            vod_play_url:  `播放$${m3u8Url}`,
        }],
    };
}

async function play(inReq, _outResp) {
     return {
        parse: 0,
        url: inReq.body.id,
        header: { 'User-Agent': UA },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd || '');
    const page = parseInt(inReq.body.pg) || 1;

    const url  = `${site}/search/${text}/?mode=async&function=get_block&block_id=list_videos_videos_list_search_result&q=${text}&category_ids=&sort_by=&from_videos=${page}&from_albums=${page}`;
    const html = await request(url);
    const $    = load(html);
    const list = parseCards($, '#list_videos_videos_list_search_result_items .item');

    return { list };
}

export default {
    meta: {
        key: 'pppporn',
        name: 'pppPorn',
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