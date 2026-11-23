import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://supjav.blog';
const playerHost = 'https://upload18.to';

const HTML_HEADERS = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
};

// 播放域名前面挂着 Cloudflare，缺这几个头会直接 403；d 参数必须是 chromium 系 UA
const PLAY_HEADER = {
    'User-Agent': UA,
    'Referer': `${playerHost}/`,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'sec-ch-ua': '"Chromium";v="120", "Not:A-Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
};

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...HTML_HEADERS, ...headers },
        timeout: 20000,
        maxRedirects: 3,
        validateStatus: (status) => status >= 200 && status < 400,
    });
    const html = resp.data;
    if (typeof html !== 'string') return html;
    if (/<title>\s*Just a moment|<title>\s*Attention Required/i.test(html)) {
        throw new Error('站点被 Cloudflare 挑战：往 cookie.json 里补一份 cf_clearance');
    }
    return html;
}

function toSlug(href) {
    if (!href) return '';
    const str = String(href).trim();
    const byQuery = str.match(/[?&]slug=([^&#]+)/);
    if (byQuery) return decodeURIComponent(byQuery[1]);
    const clean = str.split('#')[0].split('?')[0].replace(/\/+$/, '');
    const parts = clean.split('/');
    return parts[parts.length - 1] || '';
}

function parseVods($, scope) {
    const videos = [];
    const root = scope && scope.length ? scope : $.root();
    root.find('div.box-item').each((_, element) => {
        const thumbA = $(element).find('div.thumb a').first();
        const detailA = $(element).find('div.detail a').first();
        const img = $(element).find('div.thumb img').first();
        const id = toSlug(thumbA.attr('href') || detailA.attr('href') || '');
        const name = (detailA.text() || img.attr('alt') || '').trim();
        const pic = img.attr('src') || img.attr('data-original') || img.attr('data-src') || '';
        if (!id || !name) return;
        videos.push({
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
        });
    });
    return videos;
}

function readLastPage($) {
    let last = 0;
    $('div.pagination a').each((_, element) => {
        const href = $(element).attr('href') || '';
        const match = href.match(/[?&]page=(\d+)/);
        if (match) {
            const num = parseInt(match[1], 10);
            if (num > last) last = num;
        }
    });
    return last;
}

function categoryPath(tid) {
    if (!tid || tid === 'newest' || tid === 'new') return '/';
    if (tid.startsWith('genre:')) return `/category/${tid.slice(6)}`;
    if (tid.startsWith('category:')) return `/category/${tid.slice(9)}`;
    return `/${tid}`;
}

async function resolvePlayUrl(raw) {
    const str = String(raw || '').trim();
    if (/^https?:\/\//i.test(str) && /\.m3u8/i.test(str)) return str;
    const slug = toSlug(str);
    if (!slug) throw new Error('缺少视频 id');

    const pageUrl = `${playerHost}/play/index/${slug}`;
    const html = await request(pageUrl, { Referer: `${site}/video/${slug}` });
    const match = String(html).match(/window\.PLAYER_CONFIG\s*=\s*(\{[\s\S]*?\});/);
    if (!match) throw new Error('播放页里没有找到 PLAYER_CONFIG，可能该片源已下架');
    let cfg;
    try {
        cfg = JSON.parse(match[1]);
    } catch (e) {
        throw new Error('PLAYER_CONFIG 解析失败');
    }
    if (!cfg || !cfg.m3u8) throw new Error('播放页没有给出 m3u8 地址');
    return cfg.m3u8;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: 'newest', type_name: '最新' },
        { type_id: 'uncensored', type_name: '无码' },
        { type_id: 'uncensored-leaked', type_name: '无码流出' },
        { type_id: 'censored', type_name: '有码' },
        { type_id: 'chinese', type_name: '中文字幕' },
        { type_id: 'amateur', type_name: '素人' },
    ];

    const html = await request(`${site}/`);
    const $ = load(html);
    // 首页分了 最新/无码/有码/… 好几块，只取第一块「New Release」
    const list = parseVods($, $('section').first());

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    const path = categoryPath(tid);
    let url = `${site}${path}`;
    if (page > 1) {
        url += `?page=${page}`;
    }

    const html = await request(url);
    const $ = load(html);
    // 首页是一页好几块（最新/无码/有码…），翻页时同样只取第一块，否则会把整页各块都拼进来
    const list = parseVods($, path === '/' ? $('section').first() : null);
    const last = readLastPage($);

    let pagecount = last > page ? last : page + 1;
    if (!list.length && page > 1) pagecount = page - 1;

    return { page, pagecount, list };
}

async function detail(inReq, _outResp) {
    const id = toSlug(inReq.body.id);
    if (!id) throw new Error('缺少视频 id');

    const url = `${site}/video/${id}`;
    const html = await request(url);
    const $ = load(html);

    if (!$('#player').length && !$('h1').length) {
        return { list: [] };
    }

    const name = $('h1').first().text().trim()
        || ($('meta[property="og:title"]').attr('content') || '').replace(/\s*JAV Video HD \|.*$/i, '');
    const pic = $('meta[property="og:image"]').attr('content') || '';
    const desc = $('meta[property="og:description"]').attr('content') || '';

    // 详情块里的 Release date 大多是 Unknown，真正的时间在 og:description 里
    let year = '';
    const released = desc.match(/released on (\d{4})-\d{2}-\d{2}/i);
    if (released) {
        year = released[1];
    } else {
        $('div.detail-item div').each((_, element) => {
            const label = $(element).find('span').first().text().trim();
            const value = $(element).find('span').eq(1).text().trim();
            if (!year && /release date/i.test(label) && /\d{4}/.test(value)) {
                year = (value.match(/\d{4}/) || [])[0];
            }
        });
    }

    const embed = $('#player iframe').attr('src') || '';
    const key = toSlug(embed) || id;

    // 播放地址不在这里定死：token 带过期时间和请求方网段，交给 play() 现取
    const playUrl = `第1集$$${key}`;

    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_year: year,
            vod_play_from: 'SupJav',
            vod_play_url: playUrl,
        }],
    };
}

async function play(inReq, _outResp) {
    const url = await resolvePlayUrl(inReq.body.id);
    return {
        parse: 0,
        url,
        header: PLAY_HEADER,
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd || '');
    const page = parseInt(inReq.body.page) || 1;

    let url = `${site}/search?keyword=${text}`;
    if (page > 1) {
        url += `&page=${page}`;
    }

    const html = await request(url);
    const $ = load(html);
    const list = parseVods($);

    return { list };
}

export default {
    meta: {
        key: 'supjavblog',
        name: '🌸SupJav·blog',
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
