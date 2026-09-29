import axios from 'axios';
import * as cheerio from 'cheerio';



const site    = 'https://www.mrcx2.yachts';
const baseUrl = `${site}/cn/home/web`;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

const http = axios.create({
    timeout: 15_000,
    headers: { 'User-Agent': UA, Referer: `${site}/` },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchHtml(url) {
    const { data } = await http.get(url);
    return cheerio.load(data);
}

// background-image:url(...) → url 字符串
function extractBgImg($el) {
    let img = $el.attr('data-original') || $el.attr('style') || '';
    if (img.includes('background-image:')) {
        const m = img.match(/url\(["']?(.*?)["']?\)/);
        img = m ? m[1] : '';
    }
    return img;
}

// 解析视频列表（category / search / homeVideo 共用）
function parseCards($, selector) {
    const videos = [];
    $(selector).each((_, el) => {
        const item  = $(el);
        const a     = item.find('.stui-vodlist__thumb');
        const href  = a.attr('href') || '';
        const title = a.attr('title') || item.find('.title a').attr('title') || '';
        const img   = extractBgImg(a);
        if (!title || !href) return;

        const score = item.find('.score').text().trim() || '0.0 分';
        const plays = item.find('.text').text().trim()  || '播放0次';

        videos.push({
            vod_id:      href,
            vod_name:    title,
            vod_pic:     img,
            vod_remarks: `${score} | ${plays}`,
        });
    });
    return videos;
}

function resolveUrl(id) {
    if (!id) return '';
    if (id.startsWith('http')) return id;
    if (id.startsWith('/'))    return site + id;
    return `${baseUrl}/${id}`;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    let classes = [];
    let list    = [];

    try {
        const $ = await fetchHtml(`${baseUrl}/`);

        // 分类
        const seen = new Set();
        const trySelectors = ['.stui-header__menu li a', '.dropdown.type li a'];
        for (const sel of trySelectors) {
            $(sel).each((_, el) => {
                const name = $(el).text().trim();
                const href = $(el).attr('href') || '';
                if (!name || name === '首页') return;
                const m = href.match(/\/type\/id\/(\d+)\.html/);
                if (!m || seen.has(m[1])) return;
                seen.add(m[1]);
                classes.push({ type_id: m[1], type_name: name });
            });
            if (classes.length) break;
        }

        // 首页视频
        list = parseCards($, '.stui-vodlist li.index');
    } catch (e) {
        console.error('home error:', e.message);
    }

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg  = parseInt(inReq.body.page) || 1;
    const url = `${baseUrl}/index.php/vod/type/id/${tid}/page/${pg}.html`;

    let list = [];
    try {
        const $ = await fetchHtml(url);
        list = parseCards($, '.stui-vodlist li');
    } catch (e) {
        console.error('category error:', e.message);
    }

    return { page: pg, pagecount: 9999, limit: 90, total: 999999, list };
}

async function detail(inReq, _outResp) {
    const aid      = inReq.body.id;
    const playUrl  = resolveUrl(aid);

    const vod = {
        vod_id:        aid,
        vod_name:      '',
        vod_pic:       '',
        vod_remarks:   '',
        vod_content:   '',
        vod_play_from: 'E佬通用视频',
        vod_play_url:  `正片$${playUrl}`,
    };

    try {
        const $  = await fetchHtml(playUrl);
        const html = $.html();
        const match = html.match(/var\s+(player_[a-zA-Z0-9]+|player_data)\s*=\s*({[\s\S]*?})\s*<\/script>/);
        const jsonText = match[2];
        const data = JSON.parse(jsonText);
        vod.vod_name = $('title').text().trim();
        vod.vod_play_url = `正片$${data.url}`;
        // 封面
        let pic = extractBgImg($('.stui-vodlist__thumb').first());
        if (!pic) {
            $('img').each((_, el) => {
                const src = $(el).attr('src') || '';
                if (src.toLowerCase().includes('cover')) { pic = src; return false; }
            });
        }
        vod.vod_pic = pic;
        
        vod.vod_remarks = $('.stui-vodlist__detail .text').text().trim();
        vod.vod_content = ($('.content').text() || $('.detail').text() || $('.stui-content__detail').text()).trim();
    } catch (e) {
        console.error('detail error:', e.message);
    }

    return { list: [vod] };
}

async function play(inReq, _outResp) {
    const id      = inReq.body.id || '';
    const playUrl = resolveUrl(id);

    return {
        parse:   1,
        url:     playUrl,
        header:  { 'User-Agent': UA, Referer: `${site}/` },
    };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg  = parseInt(inReq.body.pg) || 1;

    let list = [];
    if (!key) return { list };

    try {
        const url = `${baseUrl}/index.php/vod/search/wd/${encodeURIComponent(key)}/page/${pg}.html`;
        const $   = await fetchHtml(url);
        list      = parseCards($, '.stui-vodlist li');
    } catch (e) {
        console.error('search error:', e.message);
    }

    return { list };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'mrcx',
        name: '🌸美人吹箫',
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