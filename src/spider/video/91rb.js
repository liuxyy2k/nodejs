import axios from 'axios';
import * as cheerio from 'cheerio';

// import { HttpsProxyAgent } from 'https-proxy-agent';
// const agent = new HttpsProxyAgent(
//     'http://127.0.0.1:7897'
// );

const site = 'https://www.91rb.com';

const headers = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Referer:           site + '/',
};

const http = axios.create({ timeout: 15_000, headers});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ensureId(s) {
    const m = String(s).match(/(\d+)/);
    return m ? m[1] : String(s);
}

function absUrl(url) {
    if (!url) return url;
    const u = url.trim();
    if (u.startsWith('//'))  return 'https:' + u;
    if (u.startsWith('/'))   return site + u;
    return u;
}

function parseSrcsetFirst(srcset) {
    if (!srcset) return '';
    return srcset.split(',')[0].trim().split(' ')[0];
}

function coverFallback(vid) {
    try {
        const iv    = parseInt(vid);
        const group = iv - (iv % 1000);
        return `https://rimg.iomycdn.com/videos_screenshots/${group}/${iv}/preview.jpg`;
    } catch {
        return '';
    }
}

function buildListUrl(tid, pg) {
    const path   = tid.replace(/^\/|\/$/g, '') || 'latest-updates';
    const suffix = String(pg) !== '1' ? `/${pg}/` : '/';
    return `${site}/${path}${suffix}`;
}

function parseListPage($, page) {
    const videos = [];
    const seen   = new Set();

    $('main a[href*="/videos/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m    = href.match(/\/videos\/(\d+)\//);
        if (!m || href.includes('/login')) return;

        const vid = m[1];
        if (seen.has(vid)) return;
        seen.add(vid);

        let title = '';
        let pic   = '';
        const img = $(el).find('img').first();

        if (img.length) {
            title = (img.attr('alt') || '').trim();
            pic   = (img.attr('src') || img.attr('data-src') || img.attr('data-original') || '').trim();
            if (!pic) pic = parseSrcsetFirst(img.attr('data-srcset') || img.attr('srcset') || '');
            pic = absUrl(pic);
        } else {
            title = ($(el).text() || '').trim();
        }

        title = title || `视频 ${vid}`;
        if (!pic || pic.startsWith('data:')) pic = coverFallback(vid);

        videos.push({ vod_id: href, vod_name: title, vod_pic: pic, vod_remarks: '' });
    });

    return { list: videos, page: String(page), pagecount: 9999, limit: 48, total: 0 };
}

async function fetchPage(url) {
    const { data } = await http.get(url);
    return cheerio.load(data);
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: 'latest-updates',                          type_name: '最新上传' },
        { type_id: 'most-popular',                            type_name: '热门视频' },
        { type_id: 'most-favourited',                         type_name: '收藏最多' },
        { type_id: 'tags/av2/',                               type_name: '日本AV'  },
        { type_id: 'tags/jav/',                               type_name: 'jav'     },
        { type_id: 'tags/20c3f16d021b069ce3af1da50b15bd83/',  type_name: '韩国'    },
    ];

    let list = [];
    try {
        const $ = await fetchPage(buildListUrl('latest-updates', '1'));
        list = parseListPage($, '1').list;
    } catch { /* ignore */ }

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg  = inReq.body.page || '1';

    try {
        const $ = await fetchPage(buildListUrl(tid, pg));
        return parseListPage($, pg);
    } catch {
        return { list: [], page: pg, pagecount: 1, limit: 48, total: 0 };
    }
}

async function detail(inReq, _outResp) {
    const vid        = inReq.body.id;
    const detailUrl  = `${site}/videos/${vid}/`;
    let   name       = `视频 ${vid}`;
    let   pic        = '';

    // try {
    //     const { data } = await http.get(detailUrl, { maxRedirects: 5 });
    //     const $        = cheerio.load(data);
    //     name           = $('h1').text().trim() || name;
    //     pic            = $('meta[property="og:image"]').attr('content')?.trim()
    //                   || $('meta[name="twitter:image"]').attr('content')?.trim()
    //                   || '';
    //     if (pic) pic = absUrl(pic);
    // } catch { /* ignore */ }

    // if (!pic) pic = coverFallback(vid);

    return {
        list: [{
            vod_id:        vid,
            vod_name:      name,
            vod_pic:       pic,
            vod_play_from: '91RB',
            vod_play_url:  `正片$${vid}`,
        }],
    };
}

async function play(inReq, _outResp) {
    const vid   = inReq.body.id;
    const match = vid.match(/\/videos\/(\d+)\/([^/]+)\//);
    let id = ''
    let k = ''
    if (match) {
         id = match[1];
         k = match[2];
    }
    const group = parseInt(id) - (parseInt(id) % 1000);
    const m3u8  = `https://91rbnet.gslb-al.com/hls/contents/videos/${group}/${id}/${id}.mp4/index.m3u8?k=${k}&t=${Date.now()}`;

    return { parse: 0, url: m3u8, header: headers };
}

async function search(inReq, _outResp) {
    const key = encodeURIComponent(inReq.body.wd || '');
    const pg  = inReq.body.pg || '1';
    const url = pg === '1'
        ? `${site}/search/${key}/`
        : `${site}/search/${key}/${pg}/`;

    try {
        const $ = await fetchPage(url);
        return parseListPage($, pg);
    } catch {
        return { list: [], page: pg, pagecount: 1, total: 0 };
    }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  '91rb',
        name: '🔥91热爆',
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