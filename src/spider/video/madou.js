import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const site = 'https://madou.club';

async function request(url, headers = {}) {
    const resp = await axios.get(url, {
        headers: { 'User-Agent': UA, ...headers },
    });
    return resp.data;
}

function parseCards($) {
    const list = [];
    $('.excerpts-wrapper article').each((_, element) => {
        const href     = $(element).find('a').attr('href') || '';
        const title    = $(element).find('h2').text().trim();
        const cover    = $(element).find('img').attr('data-src') || '';
        const subTitle = $(element).find('.post-view').text().trim();
        if (!href || !title) return;
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
    const ignore = ['首页', '其他', '热门标签', '筛选'];
    const html   = await request(site);
    const $      = load(html);

    const classes = [];
    $('.sitenav a').each((_, e) => {
        const name = $(e).text().trim();
        const href = $(e).attr('href') || '';
        if (!name || !href) return;
        if (ignore.some(ig => name.includes(ig))) return;
        classes.push({ type_id: href, type_name: name });
    });

    const list = parseCards($);
    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    const url  = page > 1 ? `${tid}/page/${page}` : tid;
    const html = await request(url);
    const $    = load(html);
    const list = parseCards($);

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const href = inReq.body.id;
    const html = await request(href);
    const $    = load(html);

    // 获取 iframe 地址
    const iframeSrc = $('.article-content iframe').attr('src') || '';
    if (!iframeSrc) {
        return { list: [{ vod_id: href, vod_name: href, vod_pic: '', vod_play_from: 'madou', vod_play_url: '' }] };
    }

    const dash       = iframeSrc.match(/^(https?:\/\/[^/]+)/)[1];
    const iframeHtml = await request(iframeSrc);
    const $2         = load(iframeHtml);
    const scriptText = $2('body script').eq(5).text();

    const tokenMatch = scriptText.match(/var token = "(.+)";/);
    const m3u8Match  = scriptText.match(/var m3u8 = '(.+)';/);
    const token      = tokenMatch ? tokenMatch[1] : '';
    const m3u8       = m3u8Match  ? m3u8Match[1]  : '';
    const playUrl    = token ? `${dash}${m3u8}?token=${token}` : `${dash}${m3u8}`;

    const name = $('h1').first().text().trim() || href;
    const pic  = $('meta[property="og:image"]').attr('content') || '';

    return {
        list: [{
            vod_id:        href,
            vod_name:      name,
            vod_pic:       pic,
            vod_play_from: 'madou',
            vod_play_url:  `播放$${playUrl}`,
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

    const html = await request(`${site}/page/${page}?s=${text}`);
    const $    = load(html);
    const list = parseCards($);

    return { list };
}

export default {
    meta: {
        key: 'madou',
        name: '💋麻豆社',
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