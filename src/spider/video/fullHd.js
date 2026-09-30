import axios from 'axios';
import * as cheerio from 'cheerio';

const site = 'https://www.fullhd.xxx/zh';

const UA = 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.87 Safari/537.36';

const http = axios.create({
    timeout: 10_000,
    headers: { 'User-Agent': UA },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function absUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return site + (url.startsWith('/') ? '' : '/') + url;
}

// 解析视频卡片（category / search / home 共用）
function parseCards($, selector = '.list-videos .item') {
    const list = [];
    $(selector).each((_, el) => {
        const item    = $(el);
        const a       = item.find('a').first();
        const name    = a.attr('title') || '';
        const id      = a.attr('href')  || '';
        const img     = item.find('img.lazyload');
        const pic     = img.attr('data-src') || '';
        const remark  = item.find('span.duration').text().trim();
        if (!id) return;
        list.push({
            vod_id:      absUrl(id),
            vod_name:    name,
            vod_pic:     absUrl(pic),
            vod_remarks: remark,
        });
    });
    return list;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    let list = [];
    try {
        const { data } = await http.get(`${site}/`);
        const $    = cheerio.load(data);
        const sec  = $('#list_videos_videos_watched_right_now_items');
        list = parseCards($, sec.length ? '#list_videos_videos_watched_right_now_items .item' : '.item');
    } catch { /* ignore */ }

    return {
        class: [
            { type_id: 'latest-updates', type_name: '最新视频🌠' },
            { type_id: 'top-rated',      type_name: '最佳视频🌠' },
            { type_id: 'most-popular',   type_name: '热门影片🌠' },
        ],
        list,
        filters: {},
    };
}

async function category(inReq, _outResp) {
    const cid = inReq.body.id;
    const pg  = parseInt(inReq.body.page) || 1;
    const url = pg > 1 ? `${site}/${cid}/${pg}/` : `${site}/${cid}/`;

    try {
        const { data } = await http.get(url);
        const $    = cheerio.load(data);
        return { page: pg, pagecount: 9999, limit: 90, total: 999999, list: parseCards($) };
    } catch {
        return { page: pg, pagecount: 1, limit: 90, total: 0, list: [] };
    }
}

async function detail(inReq, _outResp) {
    const did = absUrl(inReq.body.id);
    const { data: html } = await http.get(did);

    // 提取标题
    const titleM  = html.match(/<h1>(.*?)<\/h1>/s);
    const content = titleM ? '👉' + titleM[1].replace(/\\/g, '') : '';

    // 提取女优
    const actorM = html.match(/<span>Pornstars:<\/span>(.*?)<\/div>/s);
    let actor = '';
    if (actorM) {
        actor = [...actorM[1].matchAll(/href=".*?">(.*?)<\/a>/g)]
            .map((m) => m[1]).join(' ');
    }

    return {
        list: [{
            vod_id:        did,
            vod_actor:     actor,
            vod_director:  '',
            vod_content:   content,
            vod_play_from: '💗4K💗',
            vod_play_url:  `播放$${did}`,
        }],
    };
}

async function play(inReq, _outResp) {
    const id    = inReq.body.id;
    const parts = id.split('http');
    const url   = parts.length > 1 ? 'http' + parts[1] : id;

    const { data: html } = await http.get(url);
    const videoM = html.match(/<video(.*?)<\/video>/s);
    if (!videoM) return { parse: 1, url };

    const $   = cheerio.load(`<video${videoM[1]}</video>`);
    const src = $('source').first().attr('src');
    if (!src) return { parse: 1, url };

    // 跟随最多两次 302 重定向
    let finalUrl = src;
    for (let i = 0; i < 2; i++) {
        try {
            const res = await http.head(finalUrl, { maxRedirects: 0, validateStatus: (s) => s < 400 });
            if (res.status === 302 && res.headers.location) {
                finalUrl = res.headers.location;
            } else break;
        } catch (e) {
            if (e.response?.status === 302 && e.response.headers.location) {
                finalUrl = e.response.headers.location;
            } else break;
        }
    }

    return { parse: 0, url: finalUrl, header: { 'User-Agent': UA } };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg  = parseInt(inReq.body.pg) || 1;
    const url = pg > 1 ? `${site}/search/${key}/${pg}/` : `${site}/search/${key}/`;

    try {
        const { data } = await http.get(url);
        const $    = cheerio.load(data);
        return { page: pg, pagecount: 9999, limit: 90, total: 999999, list: parseCards($) };
    } catch {
        return { list: [] };
    }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'fullhd',
        name: '💃FullHD',
        type: 1,
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