import axios from 'axios';
import { load } from 'cheerio';
import { config } from './config.js';

const UA   = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Mobile/15E148 Safari/604.1';
const site = 'https://hanime1.me';

// ================= FlareSolverr 配置 =================

const FLARE_URL = config.FLARE_URL;

async function fetch(url) {
   const resp = await axios.post(FLARE_URL, {
        cmd: 'request.get',
        url: url,
        maxTimeout: 60000,
    });
    return resp.data.solution.response;
}

function cfCheck($) {
    if ($('title').text() === 'Just a moment...') throw new Error('CF blocked');
}

function isSameDomain(href) {
    if (!href?.includes('://')) return true;
    const m = href.match(/https?:\/\/([^/]+)/);
    if (!m) return true;
    return m[1] === 'hanime1.me' || m[1].endsWith('.hanime1.me');
}

function fixHref(href) {
    if (!href) return href;
    return href.startsWith('/') ? `${site}${href}` : href;
}

// ─── API 处理函数 ──────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    console.log(FLARE_URL)
    return {};
}

async function home(_inReq, _outResp) {
    const data = await fetch(site);
    const $    = load(data);
    cfCheck($);

    const ignore  = ['新番预告', 'H漫画', '无码黄油'];
    const classes = [];

    $('#main-nav-home > a.nav-item').each((_, e) => {
        const name = $(e).text();
        const href = $(e).attr('href');
        if (ignore.some(ig => name.includes(ig))) return;
        classes.push({ type_name: name, type_id: encodeURI(href) });
    });

    return { class: classes };
}

async function category(inReq, _outResp) {
    let url  = inReq.body.id;
    const pg = parseInt(inReq.body.page) || 1;
    if (pg > 1) url += `&page=${pg}`;

    const data = await fetch(url);
    const $    = load(data);
    cfCheck($);

    const videos = [];

    let containers = $('.video-item-container');
    if (containers.length === 0) {
        containers = $('.home-rows-videos-wrapper > a, .content-padding-new > .row > .search-doujin-videos.col-xs-6');
    }

    containers.each((_, element) => {
        if ($(element).hasClass('video-item-container')) {
            let href = $(element).find('.video-link').attr('href');
            if (!isSameDomain(href)) return;
            href = fixHref(href);

            const title    = $(element).find('.title').text().trim();
            const cover    = $(element).find('.main-thumb').attr('src');
            const likes    = $(element).find('.stat-item').eq(0).text().trim().replace('thumb_up', '').trim();
            const views    = $(element).find('.stat-item').eq(1).text().trim();
            const duration = $(element).find('.duration').text().trim();
            const remarks  = [likes, views].filter(Boolean).join(' · ');

            videos.push({ vod_id: href, vod_name: title, vod_pic: cover, vod_remarks: remarks });
        } else {
            let href = $(element).attr('href') || $(element).find('.overlay').attr('href');
            if (!isSameDomain(href)) return;
            href = fixHref(href);

            const title = $(element).find('.home-rows-videos-title').text() || $(element).find('.card-mobile-title').text();
            let cover   = $(element).find('img').attr('src');
            if (cover?.includes('background')) cover = $(element).find('img').eq(1).attr('src');

            videos.push({ vod_id: href, vod_name: title, vod_pic: cover, vod_remarks: '' });
        }
    });

    return { list: videos, page: pg, pagecount: 9999, limit: 90, total: 999999 };
}

async function detail(inReq, _outResp) {
    const url  = inReq.body.id;
    const data = await fetch(url);
    const $    = load(data);
    cfCheck($);

    const videoEl = $('video#player');
    const sources = [];

    // 方式1: link[rel=preload][as=video]
    $('link[rel="preload"][as="video"]').each((_, el) => {
        const src = $(el).attr('href');
        if (src) sources.push({ name: '默认', url: src });
    });

    // 方式2: source 标签
    if (sources.length === 0) {
        videoEl.find('source').each((_, el) => {
            const src  = $(el).attr('src');
            const size = $(el).attr('size') || 'default';
            if (src) sources.push({ name: `${size}p`, url: src });
        });
    }

    // 方式3: 直接 src
    if (sources.length === 0) {
        const src = videoEl.attr('src');
        if (src) sources.push({ name: '默认', url: src });
    }

    const playUrl = sources.map(s => `${s.name}$${s.url}`).join('#');
    const title   = $('h1').first().text().trim() || 'hanime';
    const pic     = $('meta[property="og:image"]').attr('content') || '';

    return {
        list: [{
            vod_id:        url,
            vod_name:      title,
            vod_pic:       pic,
            vod_play_from: 'hanime',
            vod_play_url:  playUrl,
        }],
    };
}

async function play(inReq, _outResp) {
    return { parse: 0, url: inReq.body.id, header: { 'User-Agent': UA } };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd || '');
    const pg   = parseInt(inReq.body.pg || inReq.body.page || '1');
    const url  = `${site}/search?query=${text}&broad=on&page=${pg}`;

    const data = await fetch(url);
    const $    = load(data);

    const videos = [];

    $('.video-item-container').each((_, element) => {
        let href = $(element).find('.video-link').attr('href');
        if (!isSameDomain(href)) return;
        href = fixHref(href);

        const title   = $(element).find('.title').text().trim();
        const cover   = $(element).find('.main-thumb').attr('src');
        const likes   = $(element).find('.stat-item').eq(0).text().trim().replace('thumb_up', '').trim();
        const views   = $(element).find('.stat-item').eq(1).text().trim();
        const remarks = [likes, views].filter(Boolean).join(' · ');

        videos.push({ vod_id: href, vod_name: title, vod_pic: cover, vod_remarks: remarks });
    });

    return { list: videos };
}

// ─── 导出 ──────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'hanime',
        name: 'Hanime',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
    },
};