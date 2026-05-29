import axios from 'axios';
import * as cheerio from 'cheerio';

const site = 'https://c-you.hair';

const UA_MOBILE  = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36';
const UA_IPHONE  = 'Mozilla/5.0 (iPhone; CPU iPhone OS 9_1 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Version/9.0 Mobile/13B143 Safari/601.1';

const http = axios.create({
    timeout: 10_000,
    headers: { 'User-Agent': UA_MOBILE },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCards($) {
    const list = [];
    $('.col-md-3.resent-grid.recommended-grid').each((_, el) => {
        const item  = $(el);
        const href  = item.find('.resent-grid-img a').attr('href') || '';
        const title = item.find('h5 a.title').text().trim();
        const img   = item.find('.resent-grid-img img').attr('data-original') || '';
        const views = item.find('.views-info span').text().trim();
        if (!href || !title) return;
        list.push({
            vod_id:      href,
            vod_name:    title,
            vod_pic:     img,
            vod_remarks: views ? `${views}观看` : '',
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
        list = parseCards(cheerio.load(data));
    } catch { /* ignore */ }

    return {
        class: [
            { type_id: '6',  type_name: '国产精品' },
            { type_id: '7',  type_name: '中文字幕' },
            { type_id: '8',  type_name: '伦理影片' },
            { type_id: '9',  type_name: '自拍偷拍' },
            { type_id: '10', type_name: '口交视频' },
            { type_id: '11', type_name: '日韩无码' },
            { type_id: '12', type_name: '制服诱惑' },
            { type_id: '13', type_name: '国产色情' },
        ],
        list,
        filters: {},
    };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg  = parseInt(inReq.body.page) || 1;
    const url = pg <= 1
        ? `${site}/vodtype/${tid}.html`
        : `${site}/vodtype/${tid}-${pg}.html`;

    const { data } = await http.get(url);
    const $    = cheerio.load(data);

    // 解析总页数：.pager .active a 文本如 "1/99"
    let pagecount = 9999;
    const pageInfo = $('.pager .active a').text().trim();
    if (pageInfo.includes('/')) {
        const total = pageInfo.split('/').pop().trim();
        if (/^\d+$/.test(total)) pagecount = parseInt(total);
    }

    return { page: pg, pagecount, limit: 90, total: 999999, list: parseCards($) };
}

async function detail(inReq, _outResp) {
    const vod_id = inReq.body.id;
    const url    = site + vod_id;

    const { data } = await http.get(url);
    const $        = cheerio.load(data);

    const title    = $('.song-info h3').text().trim();
    const img      = $('.video-grid img').attr('src') || '';
    const infoText = $('#myList li p').text().trim();

    const pubMatch = infoText.match(/发布时间：([\d\-]+)/);
    const durMatch = infoText.match(/视频时长：(\S+)/);
    const catMatch = infoText.match(/影片分类：(\S+)/);
    const pubTime  = pubMatch?.[1] || '';
    const duration = durMatch?.[1] || '';
    const category = catMatch?.[1]?.trim() || '';

    let content = '';
    if (infoText.includes('\u200b')) {
        content = infoText.split('\u200b').pop().trim();
    }
    if (!content) {
        const lines = infoText.split('\n').map((l) => l.trim()).filter(Boolean);
        content = lines[lines.length - 1] || '';
    }
    let playUrl = '';
    let playFrom = '在线播放';
    const match = data.match(/var\s+player_aaaa\s*=\s*(\{.*?\})<\/script>/s);
    if (match) {
        const obj = JSON.parse(match[1]);
        playUrl = obj.url;
        playFrom = obj.from;
    }

    return {
        list: [{
            vod_id,
            vod_name:      title,
            vod_pic:       img,
            type_name:     category,
            vod_year:      pubTime.length >= 4 ? pubTime.slice(0, 4) : '',
            vod_area:      '',
            vod_actor:     '',
            vod_director:  '',
            vod_remarks:   duration,
            vod_content:   content,
            vod_play_from: playFrom,
            vod_play_url:  playUrl,
        }],
    };
}

async function play(inReq, _outResp) {
    const pid     = inReq.body.id;
    const playUrl = site + pid;

    const base = {
        parse:  1,
        url:    playUrl,
        header: { 'User-Agent': UA_IPHONE },
    };

    try {
        const { data: html } = await http.get(playUrl);

        // 1. player_data JSON
        const pdMatch = html.match(/var\s+player_data\s*=\s*(\{.*?\});/s);
        if (pdMatch) {
            try {
                const obj = JSON.parse(pdMatch[1]);
                if (obj.url) return { ...base, parse: 0, url: obj.url };
            } catch { /* ignore */ }
        }

        // 2. iframe
        const ifrMatch = html.match(/<iframe[^>]+src="([^"]+)"/);
        if (ifrMatch) return { ...base, parse: 1, url: ifrMatch[1] };

        // 3. video src
        const vidMatch = html.match(/<video[^>]+src="([^"]+)"/);
        if (vidMatch) return { ...base, parse: 0, url: vidMatch[1] };

        // 4. source src
        const srcMatch = html.match(/<source[^>]+src="([^"]+)"/);
        if (srcMatch) return { ...base, parse: 0, url: srcMatch[1] };

    } catch { /* ignore */ }

    // 兜底：交给壳子嗅探
    return base;
}

async function search(inReq, _outResp) {
    const key = encodeURIComponent(inReq.body.wd || '');
    const pg  = parseInt(inReq.body.pg) || 1;
    const url = pg <= 1
        ? `${site}/vodsearch/${key}-------------.html`
        : `${site}/vodsearch/${key}-------------${pg}---.html`;

    try {
        const { data } = await http.get(url);
        return { list: parseCards(cheerio.load(data)) };
    } catch {
        return { list: [] };
    }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'madouhs',
        name: '🔥豹纹黑丝',
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