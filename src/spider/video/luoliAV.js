import axios from 'axios';

const site = 'https://212602.luoliav.cc';

const http = axios.create({
    timeout: 10_000,
    headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer:           site,
        Accept:            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function absUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (url.startsWith('//'))   return 'https:' + url;
    if (url.startsWith('/'))    return site + url;
    return site + '/' + url;
}

function cleanUrl(url) {
    return url.replace(/\?.*$/, '');
}

function parseVideoList(html) {
    const videos = [];

    // 主方案：group item div
    const itemRe = /<div[^>]*class="[^"]*group[^"]*item[^"]*"[^>]*>(.*?)<\/div>\s*<\/div>\s*<\/div>/gs;
    const items  = [...html.matchAll(itemRe)].map((m) => m[1]);

    if (items.length) {
        for (const item of items) {
            try {
                const hrefM  = item.match(/<a[^>]*href="([^"]+)"[^>]*>/);
                if (!hrefM) continue;

                const imgM = item.match(/<img[^>]*data-original="([^"]+)"[^>]*>/)
                          || item.match(/<img[^>]*src="([^"]+)"[^>]*>/);
                if (!imgM) continue;

                const titleM = item.match(/<a[^>]*class="[^"]*font-bold[^"]*"[^>]*>([^<]+)<\/a>/)
                            || item.match(/<a[^>]*>([^<]+)<\/a>\s*<\/div>\s*$/);
                if (!titleM) continue;

                videos.push({
                    vod_id:      cleanUrl(absUrl(hrefM[1])),
                    vod_name:    titleM[1].trim(),
                    vod_pic:     absUrl(imgM[1]),
                    vod_remarks: '',
                });
            } catch { /* ignore */ }
        }
        return videos;
    }

    // 备选方案
    const altRe = /<a[^>]*href="([^"]+)"[^>]*>.*?<img[^>]*data-original="([^"]+)"[^>]*>.*?<a[^>]*class="[^"]*font-bold[^"]*"[^>]*>([^<]+)<\/a>/gs;
    for (const m of html.matchAll(altRe)) {
        videos.push({
            vod_id:      cleanUrl(absUrl(m[1])),
            vod_name:    m[3].trim(),
            vod_pic:     absUrl(m[2]),
            vod_remarks: '',
        });
    }
    return videos;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    let list = [];
    try {
        const { data } = await http.get(`${site}/index.html`);
        list = parseVideoList(data);
    } catch { /* ignore */ }

    return {
        class: [
            { type_id: '1', type_name: '国产精选' },
            { type_id: '2', type_name: '日韩AV'   },
            { type_id: '3', type_name: '蓝光超清' },
            { type_id: '4', type_name: '欧美精品' },
            { type_id: '5', type_name: '异族风情' },
            { type_id: '6', type_name: '动漫专区' },
        ],
        list,
        filters: {},
    };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg  = parseInt(inReq.body.page) || 1;

    try {
        const { data: html } = await http.get(
            `${site}/list.php?cid=${tid}&page=${pg}`
        );
        const list = parseVideoList(html);

        // 解析分页
        let pagecount = pg + 2;
        const pageRe  = new RegExp(`list\\.php\\?cid=${tid}&(?:amp;)?page=(\\d+)">(\\d+)<\\/a>`, 'g');
        const pages   = [...html.matchAll(pageRe)].map((m) => parseInt(m[2]));
        if (pages.length) pagecount = Math.max(...pages);

        return { page: pg, pagecount, limit: 30, total: list.length * pagecount, list };
    } catch {
        return { page: pg, pagecount: 1, limit: 30, total: 0, list: [] };
    }
}

async function detail(inReq, _outResp) {
    const vod_id = inReq.body.id;
    const url    = absUrl(vod_id);

    try {
        const { data: html } = await http.get(url);

        // 标题
        let vod_name = '未知标题';
        const titleM = html.match(/<title>([^<]+)<\/title>/);
        if (titleM) vod_name = titleM[1].replace(/\s*-\s*少女AV.*/, '').trim();

        // 封面
        let vod_pic = '';
        const picM = html.match(/<img[^>]+src="([^"]+)"[^>]*class="[^"]*thumb[^"]*"/)
                  || html.match(/<meta property="og:image" content="([^"]+)"/)
                  || html.match(/<img[^>]+data-original="([^"]+)"/);
        if (picM) vod_pic = absUrl(picM[1]);

        // 播放地址
        let play_url = '';
        const m3u8M = html.match(/(https?:\/\/[^"']+\.m3u8[^"']*)/);
        const mp4M  = html.match(/(https?:\/\/[^"']+\.mp4[^"']*)/);
        const jsM   = html.match(/var[^;]*video[^=]*=[^"']*["']([^"']+\.m3u8[^"']*)['"]/i);
        play_url = m3u8M?.[1] || mp4M?.[1] || jsM?.[1] || url;

        return {
            list: [{
                vod_id,
                vod_name,
                vod_pic,
                vod_content:   '',
                vod_actor:     '',
                vod_director:  '',
                vod_area:      '',
                vod_year:      '',
                vod_play_from: '萝莉AV',
                vod_play_url:  `播放$${play_url}`,
            }],
        };
    } catch {
        return {
            list: [{
                vod_id,
                vod_name:      '加载失败',
                vod_pic:       '',
                vod_play_from: '默认',
                vod_play_url:  `播放$${vod_id}`,
            }],
        };
    }
}

async function play(inReq, _outResp) {
    const id = inReq.body.id;

    if (/\.(m3u8|mp4|flv|ts)$/.test(id)) {
        return { parse: 0, url: id };
    }

    const playUrl = cleanUrl(absUrl(id));
    return { parse: 1, url: playUrl };
}

async function search(inReq, _outResp) {
    const key = encodeURIComponent(inReq.body.wd || '');
    const pg  = parseInt(inReq.body.pg) || 1;

    try {
        const { data: html } = await http.get(
            `${site}/search.php?keyword=${key}&page=${pg}`
        );
        const list = parseVideoList(html);
        return { page: pg, pagecount: 1, limit: 30, total: list.length, list };
    } catch {
        return { list: [] };
    }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'luoliav',
        name: '🌸萝莉AV',
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