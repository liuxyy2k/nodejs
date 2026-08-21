import axios from 'axios';
import { load } from 'cheerio';
import https from 'https';

const DEFAULT_SITE = 'https://www.zhizhewanshui.shop';
const UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

const CLASSES = [
    { type_id: '1', type_name: '在线国产' },
    { type_id: '6', type_name: '传媒剧情' },
    { type_id: '7', type_name: '国产主播' },
    { type_id: '8', type_name: '国产明星' },
    { type_id: '9', type_name: '抖阴视频' },
    { type_id: '10', type_name: '网爆黑料' },
    { type_id: '11', type_name: '网红头条' },
    { type_id: '12', type_name: '萝莉少女' },
    { type_id: '13', type_name: '欧美无码' },
    { type_id: '14', type_name: '日本无码' },
    { type_id: '15', type_name: '制服诱惑' },
    { type_id: '16', type_name: '强奸乱伦' },
];

let siteUrl = DEFAULT_SITE;
const headers = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    Referer: siteUrl,
};

function parseExtend(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function absUrl(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    if (path.startsWith('//')) return `https:${path}`;
    try {
        return new URL(path, `${siteUrl}/`).href;
    } catch {
        return path;
    }
}

async function request(url) {
    try {
        const resp = await axios.get(url, {
            headers,
            timeout: 15000,
            validateStatus: () => true,
            responseType: 'text',
        });
        if (resp.status >= 400) return '';
        return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch (e) {
        console.log(`[智者玩水] 请求失败: ${url} -> ${e.message}`);
        return '';
    }
}

function extractVid(url) {
    return String(url || '').match(/\/detail\/id\/(\d+)/)?.[1] || '';
}

function extractImage($el) {
    if (!$el || !$el.length) return '';
    for (const attr of ['data-original', 'data-src', 'original-src', 'src', 'data-url']) {
        const val = ($el.attr(attr) || '').trim();
        if (val && !val.startsWith('data:')) return absUrl(val);
    }
    const style = $el.attr('style') || '';
    const bg = style.match(/url\((['"]?)([^"')]+)\1\)/);
    return bg ? absUrl(bg[2]) : '';
}

function parseList(html) {
    const $ = load(html);
    const videos = [];
    const seen = new Set();
    let lis = $('ul.img-list-data li');
    if (!lis.length) {
        $('a[href*="/detail/id/"]').each((_, el) => {
            const $a = $(el);
            const href = $a.attr('href') || '';
            const vid = extractVid(href);
            if (!vid || seen.has(vid)) return;
            seen.add(vid);
            const $container = $a.closest('li, div').length ? $a.closest('li, div') : $a;
            let $img = $a.find('img');
            if (!$img.length) $img = $container.find('img');
            let title = $a.attr('title') || '';
            if (!title) title = $container.find('h3, .title, .name').text().trim();
            if (!title) title = $a.text().trim();
            if (title) {
                videos.push({
                    vod_id: vid,
                    vod_name: title,
                    vod_pic: extractImage($img.first()),
                    vod_remarks: '',
                });
            }
        });
        return videos;
    }
    lis.each((_, el) => {
        const $li = $(el);
        const $a = $li.find('a[href*="/detail/id/"]').first();
        if (!$a.length) return;
        const vid = extractVid($a.attr('href') || '');
        if (!vid || seen.has(vid)) return;
        seen.add(vid);
        let title = $a.attr('title') || '';
        if (!title) title = $li.find('h3.text-ellipsis').text().trim();
        if (!title) title = $li.find('h3, .title, .name').text().trim();
        if (title) {
            videos.push({
                vod_id: vid,
                vod_name: title,
                vod_pic: extractImage($li.find('img').first()),
                vod_remarks: '',
            });
        }
    });
    return videos;
}

function parsePlayerJson(html) {
    const aaaa = html.match(/var\s+player_aaaa\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
    if (aaaa) {
        try {
            const obj = JSON.parse(aaaa[1].trim());
            let playUrl = obj.url || '';
            const enc = Number(obj.encrypt || 0);
            if (enc === 1) {
                try {
                    playUrl = Buffer.from(playUrl, 'base64').toString('utf8');
                } catch {
                    /* keep */
                }
            } else if (enc === 2) {
                try {
                    playUrl = decodeURIComponent(playUrl);
                } catch {
                    /* keep */
                }
            }
            if (playUrl) return playUrl.replace(/\\\//g, '/');
        } catch {
            /* next */
        }
    }
    const data = html.match(/var\s+player_data\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
    if (data) {
        try {
            const obj = JSON.parse(data[1].trim());
            if (obj.url) return String(obj.url).replace(/\\\//g, '/');
        } catch {
            /* next */
        }
    }
    const mac = html.match(/MacPlayer\.PlayUrl\s*=\s*["']([^"']+)["']/);
    if (mac) {
        let playUrl = mac[1];
        if (/^[A-Za-z0-9+/=]+$/.test(playUrl) && playUrl.length % 4 === 0) {
            try {
                playUrl = Buffer.from(playUrl, 'base64').toString('utf8');
            } catch {
                /* keep */
            }
        }
        return playUrl.replace(/\\\//g, '/');
    }
    return html.match(/(https?:\/\/[^"'\s]+\.m3u8(?:\?[^"'\s]*)?)/)?.[1] || '';
}

async function init(inReq) {
    const ext = parseExtend(inReq?.body?.extend);
    if (ext.host) siteUrl = String(ext.host).replace(/\/$/, '');
    if (ext.userAgent) headers['User-Agent'] = ext.userAgent;
    if (ext.cookie) headers.Cookie = ext.cookie;
    if (ext.referer) headers.Referer = ext.referer;
    else headers.Referer = siteUrl;
    return {};
}

async function home() {
    const html = await request(`${siteUrl}/`);
    return { class: CLASSES, filters: {}, list: html ? parseList(html) : [] };
}

async function category(inReq) {
    let pg = parseInt(inReq.body.page, 10);
    if (!Number.isFinite(pg) || pg < 1) pg = 1;
    const tid = String(inReq.body.id || '1');
    const url =
        pg === 1
            ? `${siteUrl}/index.php/vod/type/id/${tid}.html`
            : `${siteUrl}/index.php/vod/type/id/${tid}/page/${pg}.html`;
    const html = await request(url);
    if (!html) return { list: [], page: pg, pagecount: 1, limit: 30, total: 0 };
    const videos = parseList(html);
    const totalMatch = html.match(/共(\d+)条数据/);
    const total = totalMatch ? parseInt(totalMatch[1], 10) : videos.length;
    const pagecount = totalMatch ? Math.ceil(total / 30) : 999;
    return { list: videos, page: pg, pagecount, limit: 30, total };
}

async function detail(inReq) {
    let vid = inReq.body.id;
    if (Array.isArray(vid)) vid = vid[0];
    vid = String(vid || '');
    if (vid.includes(':')) vid = vid.split(':').pop();
    if (!vid) return { list: [] };
    const html = await request(`${siteUrl}/index.php/vod/detail/id/${vid}.html`);
    if (!html) return { list: [] };
    const $ = load(html);
    let title = $('h2.c_pink.text-ellipsis').first().text().trim();
    if (!title) title = $('h1').first().text().trim();
    if (!title) title = $('.title').first().text().trim();

    let poster = '';
    $('img.lazy').each((_, el) => {
        if (poster) return;
        poster = extractImage($(el));
    });
    if (!poster) {
        for (const sel of ['div[class*="thumb"] img', 'div[class*="pic"] img', 'div[class*="poster"] img']) {
            const $img = $(sel).first();
            if ($img.length) {
                poster = extractImage($img);
                if (poster) break;
            }
        }
    }

    let desc = '';
    for (const cls of ['desc', 'sketch', 'vod-content', 'stui-content__desc', 'hl-content-text', 'detail-info', 'content-text']) {
        const text = $(`[class*="${cls}"]`).text().replace(/\s+/g, ' ').trim();
        if (text) {
            desc = text;
            break;
        }
    }

    const playFrom = [];
    const playUrl = [];
    $('a[href*="/play/"]').each((_, el) => {
        const $a = $(el);
        const name = ($a.attr('title') || $a.text() || '线路一').trim();
        const href = $a.attr('href') || '';
        if (!href) return;
        playFrom.push(name);
        playUrl.push(`${name}$${absUrl(href)}`);
    });
    if (!playFrom.length) {
        playFrom.push('线路一');
        playUrl.push(`线路一$${siteUrl}/index.php/vod/play/id/${vid}/sid/1/nid/1.html`);
    }
    return {
        list: [
            {
                vod_id: vid,
                vod_name: title,
                vod_pic: poster,
                vod_content: desc,
                vod_play_from: playFrom.join('$$$'),
                vod_play_url: playUrl.join('#'),
            },
        ],
    };
}

async function search(inReq) {
    let pg = parseInt(inReq.body.page, 10);
    if (!Number.isFinite(pg) || pg < 1) pg = 1;
    const key = encodeURIComponent(String(inReq.body.wd || ''));
    const url =
        pg === 1
            ? `${siteUrl}/index.php/vod/search.html?wd=${key}`
            : `${siteUrl}/index.php/vod/search/page/${pg}/wd/${key}.html`;
    const html = await request(url);
    return { list: html ? parseList(html) : [], page: pg };
}

async function play(inReq) {
    let id = String(inReq.body.id || '');
    if (!id) return { parse: 0, url: '', header: '' };
    const url = /^https?:\/\//i.test(id) ? id : absUrl(id);
    const html = await request(url);
    if (!html) return { parse: 0, url: '', header: '' };
    let playUrl = parsePlayerJson(html);
    if (playUrl && playUrl.endsWith('/index.m3u8')) {
        playUrl = playUrl.replace('/index.m3u8', '/2000kb/hls/index.m3u8');
    }
    return {
        parse: 0,
        url: playUrl,
        header: {
            'User-Agent': headers['User-Agent'],
            Referer: siteUrl,
            Origin: siteUrl,
        },
        jx: 0,
    };
}

export default {
    meta: {
        key: 'zhizhews',
        name: '🔥智者玩水',
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
