import axios from 'axios';

const site = 'https://www.adultporna-av107.com';

const http = axios.create({
    timeout: 15_000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        Referer:      site + '/zzzz',
        Accept:       'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }
});

const CLASSES = [
    { type_name: '每日最新',   type_id: '/topic/'             },
    { type_name: '国产视频',   type_id: '/t/163/'             },
    { type_name: '网曝黑料',   type_id: '/t/232/'             },
    { type_name: '主播大秀',   type_id: '/t/236/'             },
    { type_name: 'AV解说',    type_id: '/t/233/'             },
    { type_name: '国产自拍',   type_id: '/t/48/'              },
    { type_name: '抖阴视频',   type_id: '/t/231/'             },
    { type_name: '国模私拍',   type_id: '/t/45/'              },
    { type_name: '空姐模特',   type_id: '/t/67/'              },
    { type_name: '91制片厂',  type_id: '/t/131/'             },
    { type_name: '糖心VLOG',  type_id: '/t/128/'             },
    { type_name: '日本有码',   type_id: '/label/sortjp/'      },
    { type_name: '国产传媒',   type_id: '/label/sortcnseries/' },
    { type_name: '番号专区',   type_id: '/label/sortseries/'  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function absUrl(u) {
    if (!u) return '';
    u = u.replace(/\\\//g, '/');
    return u.startsWith('http') ? u : new URL(u, site).href;
}

function stripTags(s) {
    return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function isVideoFormat(url) {
    return /\.(m3u8|mp4|flv|avi|mkv|mov)(\?|$)/i.test(String(url || '').split('?')[0]);
}

async function fetchHtml(url) {
    const fullUrl = url.startsWith('http') ? url : new URL(url, site).href;
    const { data } = await http.get(fullUrl);
    return data;
}

function getPic(chunk) {
    const m = chunk.match(/<img[^>]+(?:data-original|data-src|data-lazyload|src)=["']([^"']+)['"]/i);
    return m ? absUrl(m[1]) : '';
}

function parseList(html) {
    const arr  = [];
    const seen = new Set();
    const re   = /<a[^>]+href=["']\/voddetail\/(\d+)\/?["'][^>]*>.*?<\/a>/gis;

    for (const m of html.matchAll(re)) {
        const vid = m[1];
        if (seen.has(vid)) continue;
        const href  = `/voddetail/${vid}/`;
        const i     = html.indexOf(href);
        const chunk = html.slice(Math.max(0, i - 800), i + 2500);

        const tmRe = new RegExp(`href=["']${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*(?:title=["']([^"']+)["'])?`, 'is');
        const tm   = chunk.match(tmRe);
        const am   = chunk.match(/<img[^>]+alt=["']([^"']+)['"]/i);
        const sm   = chunk.match(/<small[^>]*>(.*?)<\/small>/is);

        const name = (tm?.[1] || am?.[1] || vid).trim();
        arr.push({ vod_id: vid, vod_name: stripTags(name), vod_pic: getPic(chunk), vod_remarks: sm ? stripTags(sm[1]) : '' });
        seen.add(vid);
    }
    return arr;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const html = await fetchHtml('/zzzz');
    return { class: CLASSES, list: parseList(html), filters: {} };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id);
    const pg  = String(inReq.body.page || '1');

    let path = tid.startsWith('/') ? tid : '/t/' + tid.replace(/^\/|\/$/g, '') + '/';
    if (pg !== '1') path = path.replace(/\/$/, '') + '/page/' + pg + '/';

    const html = await fetchHtml(path);
    const data = parseList(html);
    return { list: data, page: parseInt(pg), pagecount: data.length ? 999 : parseInt(pg), limit: 24, total: 999999 };
}

async function detail(inReq, _outResp) {
    const vid  = String(inReq.body.id).replace(/^\/+|\/+$/g, '').split('/').pop();
    const html = await fetchHtml(`/voddetail/${vid}/`);

    let name = '';
    for (const pattern of [
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)['"]/i,
        /<h1[^>]*>(.*?)<\/h1>/is,
        /title=["']([^"']+)['"]/i,
    ]) {
        const m = html.match(pattern);
        if (m && stripTags(m[1])) { name = stripTags(m[1]); break; }
    }

    const picM = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)['"]/i);
    const pic  = picM ? absUrl(picM[1]) : getPic(html);

    const em      = html.match(/(?:剧情|简介|介绍|详情)[^<]*<\/[^>]+>\s*<[^>]+>(.*?)<\//is);
    const content = em ? stripTags(em[1]) : (name || vid);

    const plays = [];
    const hrefRe = new RegExp(`href=["'](/v/${vid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?[^"']*)["']`, 'gi');
    for (const m of html.matchAll(hrefRe)) { if (!plays.includes(m[1])) plays.push(m[1]); }
    if (!plays.length) plays.push(`/v/${vid}/`);

    const playUrl = plays.map((u, i) => `第${i + 1}集$${absUrl(u)}`).join('#');

    return {
        list: [{
            vod_id:        vid,
            vod_name:      name || vid,
            vod_pic:       pic,
            vod_content:   content,
            vod_play_from: '播放',
            vod_play_url:  playUrl,
        }],
    };
}

async function play(inReq, _outResp) {
    const pid = String(inReq.body.id);
    const url = pid.startsWith('http') ? pid : absUrl('/v/' + pid.replace(/^\/+|\/+$/g, '').split('/').pop() + '/');

    if (isVideoFormat(url)) return { parse: 0, url, header: http.defaults.headers };

    const html = await fetchHtml(url);
    let play = '';

    const m = html.match(/player_aaaa\s*=\s*(\{.*?\})\s*</is) || html.match(/player_aaaa\s*=\s*(\{.*?\})/is);
    if (m) {
        try {
            play = JSON.parse(m[1].replace(/\\\//g, '/')).url || '';
        } catch {
            const mm = m[1].match(/["']url["']\s*:\s*["']([^"']+)['"]/);
            play = mm ? mm[1].replace(/\\\//g, '/') : '';
        }
    }

    if (!play) {
        const mm = html.match(/(https?:\\?\/\\?\/[^"']+?\.(?:m3u8|mp4)[^"']*)/i);
        play = mm ? mm[1].replace(/\\\//g, '/') : url;
    }

    return { parse: isVideoFormat(play) ? 0 : 1, url: play, header: http.defaults.headers };
}

async function search(inReq, _outResp) {
    const key  = encodeURIComponent(inReq.body.wd || '');
    const pg   = parseInt(inReq.body.pg) || 1;
    const html = await fetchHtml(`/s/?wd=${key}`);
    const data = parseList(html);
    return { list: data, page: pg, pagecount: 1, limit: 24, total: data.length };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: { key: 'adultporna', name: '🌸AdultPorna', type: 3 },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
    },
};