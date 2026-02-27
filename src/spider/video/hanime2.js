import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Mobile/15E148 Safari/604.1';
const site = 'https://hanime1.me';

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...headers },
    });
    return resp.data;
}

function isValidHanimeUrl(href) {
    if (!href) return false;
    if (href.includes('://')) {
        const domainMatch = href.match(/https?:\/\/([^\/]+)/);
        if (domainMatch) {
            const domain = domainMatch[1];
            return domain === 'hanime1.me' || domain.endsWith('.hanime1.me');
        }
    }
    return true;
}

function normalizeHref(href) {
    if (!href) return '';
    return href.startsWith('/') ? `${site}${href}` : href;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const html = await request(site);
    const $ = load(html);

    const ignore = ['新番預告', 'H漫畫', '無碼黃油'];
    let classes = [];

    $('#main-nav-home > a.nav-item').each((_, e) => {
        const name = $(e).text();
        const href = $(e).attr('href');
        if (ignore.some(i => name.includes(i))) return;
        classes.push({
            type_id: encodeURI(href),
            type_name: name,
        });
    });

    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    let typeurl = inReq.body.id;
    const page = inReq.body.page || 1;
    const url = page > 1 ? `${typeurl}&page=${page}` : typeurl;

    const html = await request(url);
    const $ = load(html);

    let videos = [];

    let videoContainers = $('.video-item-container');
    if (videoContainers.length === 0) {
        videoContainers = $('.home-rows-videos-wrapper > a, .content-padding-new > .row > .search-doujin-videos.col-xs-6');
    }

    videoContainers.each((_, element) => {
        if ($(element).hasClass('video-item-container')) {
            const href = normalizeHref($(element).find('.video-link').attr('href'));
            if (!isValidHanimeUrl(href)) return;

            const title = $(element).find('.title').text().trim();
            const cover = $(element).find('.main-thumb').attr('src');
            const duration = $(element).find('.duration').text().trim();
            const remarks = [];
            $(element).find('.stat-item').each((i, statEl) => {
                const text = $(statEl).text().trim();
                if (i === 0) remarks.push(text.replace('thumb_up', '').trim());
                else if (i === 1) remarks.push(text);
            });

            if (href) videos.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: remarks.join(' · '),
            });
        } else {
            const href = normalizeHref($(element).attr('href') || $(element).find('.overlay').attr('href'));
            if (!isValidHanimeUrl(href)) return;

            const title = $(element).find('.home-rows-videos-title').text() || $(element).find('.card-mobile-title').text();
            let cover = $(element).find('img').attr('src');
            if (cover?.includes('background')) cover = $(element).find('img').eq(1).attr('src');

            if (href) videos.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: '',
            });
        }
    });

    return { page: parseInt(page), list: videos };
}

async function detail(inReq, _outResp) {
    const url = inReq.body.id;
    const html = await request(url);
    const $ = load(html);

    const title = $('h1').first().text().trim() || $('title').text().trim();
    const pic = $('meta[property="og:image"]').attr('content') || '';

    // 收集所有清晰度
    const videoElement = $('video#player');
    let tracks = [];

    videoElement.find('source').each((_, element) => {
        const src = $(element).attr('src');
        const size = $(element).attr('size') || 'unknown';
        if (src) tracks.push(`${size}p$${src}`);
    });

    // 如果没有 source 标签，用 src 属性
    if (tracks.length === 0) {
        const src = videoElement.attr('src');
        if (src) tracks.push(`默认$${src}`);
    }

    // 如果还没有，用 preload link
    if (tracks.length === 0) {
        const preload = $('link[rel="preload"][as="video"][type="video/mp4"]').attr('href');
        if (preload) tracks.push(`默认$${preload}`);
    }

    return {
        list: [{
            vod_id: url,
            vod_name: title,
            vod_pic: pic,
            vod_play_from: '默认',
            vod_play_url: tracks.join('#'),
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
    const text = encodeURIComponent(inReq.body.wd);
    const page = inReq.body.pg || 1;
    const url = `${site}/search?query=${text}&broad=on&page=${page}`;

    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.video-item-container').each((_, element) => {
        const href = normalizeHref($(element).find('.video-link').attr('href'));
        if (!isValidHanimeUrl(href)) return;

        const title = $(element).find('.title').text().trim();
        const cover = $(element).find('.main-thumb').attr('src');
        const duration = $(element).find('.duration').text().trim();
        const remarks = [];
        $(element).find('.stat-item').each((i, statEl) => {
            const text = $(statEl).text().trim();
            if (i === 0) remarks.push(text.replace('thumb_up', '').trim());
            else if (i === 1) remarks.push(text);
        });

        if (href) videos.push({
            vod_id: href,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: remarks.join(' · '),
        });
    });

    return { list: videos };
}

export default {
    meta: {
        key: 'hanime2',
        name: 'Hanime2',
        type: 3
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