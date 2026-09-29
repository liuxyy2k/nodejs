import axios from 'axios';
import https from 'https';

const HOST = 'https://pektino.com';
const LANG = 'zh-CN';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const FILTERS = {
    all: [
        {
            key: 'time_range',
            name: '时间分类',
            value: [
                { n: '每日', v: 'daily' },
                { n: '每周', v: 'weekly' },
                { n: '每月', v: 'monthly' },
                { n: '所有时间', v: 'all' },
            ],
        },
        {
            key: 'sort',
            name: '排序方式',
            value: [
                { n: '按点赞', v: 'favorite' },
                { n: '按观看数', v: 'pv' },
                { n: '按时长', v: 'time' },
                { n: '最近添加', v: 'created' },
            ],
        },
    ],
};


const http = axios.create({
    timeout: 15000,
    validateStatus: () => true,
    headers: {
        'User-Agent': UA,
        Referer: `${HOST}/`,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    },
});

function fixUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) return `${HOST}${url}`;
    return `${HOST}/${url}`;
}

function parseExtend(inReq) {
    let ext = inReq.body.filters || inReq.body.extend || {};
    if (typeof ext === 'string') {
        try {
            ext = JSON.parse(ext);
        } catch {
            ext = {};
        }
    }
    return ext && typeof ext === 'object' ? ext : {};
}

async function fetchHtml(url) {
    try {
        const r = await http.get(url);
        if (r.status !== 200) return '';
        return typeof r.data === 'string' ? r.data : String(r.data || '');
    } catch (e) {
        console.log(`[PeKtino] 请求失败: ${e.message}`);
        return '';
    }
}

function findInitialItems(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.props?.pageProps?.initialItems) return obj.props.pageProps.initialItems;
    if (Array.isArray(obj)) {
        for (const item of obj) {
            const r = findInitialItems(item);
            if (r) return r;
        }
    } else {
        for (const value of Object.values(obj)) {
            const r = findInitialItems(value);
            if (r) return r;
        }
    }
    return null;
}

function findVideoUrl(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (typeof obj.url === 'string' && obj.url.includes('video.twimg.com')) return obj.url;
    if (Array.isArray(obj)) {
        for (const item of obj) {
            const r = findVideoUrl(item);
            if (r) return r;
        }
    } else {
        for (const value of Object.values(obj)) {
            const r = findVideoUrl(value);
            if (r) return r;
        }
    }
    return null;
}

function parseNextDataItems(html) {
    const videos = [];
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) return videos;
    try {
        const data = JSON.parse(m[1]);
        const items = findInitialItems(data);
        if (!items) return videos;
        for (const item of items) {
            const vid = item.url_cd || '';
            if (!vid) continue;
            const title = item.anime_title || vid;
            let pic = fixUrl(item.thumbnail || '');
            let duration = '';
            if (item.time != null) {
                const mins = Math.floor(item.time / 60);
                const secs = item.time % 60;
                duration = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            }
            const views = item.pv ?? '';
            const fav = item.favorite ?? '';
            const remarks = [];
            if (duration) remarks.push(`⏱${duration}`);
            if (views !== '') remarks.push(`👁${views}`);
            if (fav !== '') remarks.push(`❤${fav}`);
            videos.push({
                vod_id: vid,
                vod_name: title,
                vod_pic: pic,
                vod_remarks: remarks.join(' | '),
            });
        }
    } catch (e) {
        console.log(`[PeKtino] 解析 __NEXT_DATA__ 失败: ${e.message}`);
    }
    return videos;
}

function extractVideos(html) {
    const videos = [];
    if (!html) return videos;

    let pattern =
        /<div class="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden mb-4">([\s\S]*?)<\/div>\s*<div class="m-2">/g;
    let items = [...html.matchAll(pattern)].map((m) => m[1]);
    if (!items.length) {
        pattern =
            /<div class="bg-white[^"]*rounded-lg[^"]*shadow-md[^"]*overflow-hidden mb-4">([\s\S]*?)<\/div>\s*<div class="m-2">/g;
        items = [...html.matchAll(pattern)].map((m) => m[1]);
    }

    for (const item of items) {
        try {
            const linkM = item.match(/href="(\/zh-CN\/movie\/[^"]+)"/);
            if (!linkM) continue;
            const link = linkM[1];
            const imgM = item.match(/<img[^>]*src="([^"]+)"[^>]*>/);
            const pic = imgM ? fixUrl(imgM[1]) : '';
            const durM = item.match(
                /<div class="absolute bottom-2 right-2 bg-black\/60 text-white text-xs px-2 py-1 rounded-lg">([^<]+)<\/div>/,
            );
            const duration = durM ? durM[1].trim() : '';
            const viewsM = item.match(/<img src="\/icons\/eye-black\.svg"[^>]*>([^<]+)<\/span>/);
            const views = viewsM ? viewsM[1].trim() : '';
            const favM = item.match(/<img src="\/icons\/heart-black\.svg"[^>]*><span[^>]*>([^<]+)<\/span>/);
            const fav = favM ? favM[1].trim() : '';
            const titleM = item.match(/alt="([^"]+)"/);
            const title = titleM ? titleM[1] : link.split('/').pop();
            const vidM = link.match(/\/movie\/([^/]+)/);
            const vid = vidM ? vidM[1] : link;
            const remarks = [];
            if (duration) remarks.push(`⏱${duration}`);
            if (views) remarks.push(`👁${views}`);
            if (fav) remarks.push(`❤${fav}`);
            videos.push({
                vod_id: vid,
                vod_name: title,
                vod_pic: pic,
                vod_remarks: remarks.join(' | '),
            });
        } catch {
            /* skip */
        }
    }

    if (videos.length) return videos;
    return parseNextDataItems(html);
}

function getPagecount(html) {
    const pages = [...html.matchAll(/<a[^>]*href="[^"]*page=(\d+)"[^>]*>/g)].map((m) => parseInt(m[1], 10));
    if (pages.length) return Math.max(...pages);
    const lastM = html.match(/href="[^"]*page=(\d+)"[^>]*>最后/);
    if (lastM) return parseInt(lastM[1], 10);
    return 1;
}

function buildCategoryUrl(pg, extend) {
    const timeRange = extend.time_range || 'all';
    const sort = extend.sort || 'favorite';
    let url;
    if (timeRange === 'daily') url = `${HOST}/${LANG}/`;
    else if (timeRange === 'weekly') url = `${HOST}/${LANG}/weekly`;
    else if (timeRange === 'monthly') url = `${HOST}/${LANG}/monthly`;
    else url = `${HOST}/${LANG}/all`;

    const params = [];
    if (sort) params.push(`sort=${sort}`);
    if (pg > 1) params.push(`page=${pg}`);
    if (params.length) url += `?${params.join('&')}`;
    return url;
}

function twimgHeader() {
    return {
        'User-Agent': UA,
        Referer: 'https://x.com/',
        Origin: 'https://x.com',
        Accept: 'video/mp4,video/webm,video/*;q=0.8,*/*;q=0.5',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Connection: 'keep-alive',
    };
}

function siteHeader() {
    return {
        'User-Agent': UA,
        Referer: `${HOST}/`,
        Origin: HOST,
        Accept: 'video/mp4,video/webm,video/*;q=0.8,*/*;q=0.5',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    };
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const fakeReq = {
        body: {
            id: 'all',
            page: 1,
            filters: { time_range: 'all', sort: 'favorite' },
        },
    };
    const cat = await category(fakeReq, _outResp);
    return {
        class: [{ type_id: 'all', type_name: '全部' }],
        filters: FILTERS,
        list: cat.list || [],
    };
}

async function category(inReq, _outResp) {
    let pg = parseInt(inReq.body.page, 10) || 1;
    const extend = parseExtend(inReq);
    const url = buildCategoryUrl(pg, extend);
    const html = await fetchHtml(url);
    if (!html) {
        return { list: [], page: pg, pagecount: 1, limit: 20, total: 0 };
    }
    const videos = extractVideos(html);
    let pagecount = getPagecount(html);
    if (pagecount < pg) pagecount = pg;
    return {
        list: videos,
        page: pg,
        pagecount,
        limit: 20,
        total: pagecount * 20,
    };
}

async function detail(inReq, _outResp) {
    let vid = inReq.body.id;
    if (Array.isArray(vid)) vid = vid[0];
    vid = String(vid || '');
    if (!vid) return { list: [] };

    let url;
    if (vid.startsWith('http')) url = vid;
    else if (vid.startsWith('/')) url = fixUrl(vid);
    else url = `${HOST}/${LANG}/movie/${vid}`;

    const html = await fetchHtml(url);
    if (!html) return { list: [] };

    let title = '';
    let tm = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    if (tm) title = tm[1].replace(/<[^>]+>/g, '').trim();
    if (!title) {
        tm = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/);
        if (tm) title = tm[1];
    }
    if (!title) title = vid;

    let pic = '';
    let pm = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/);
    if (pm) pic = pm[1];
    if (!pic) {
        pm = html.match(/<img[^>]*src="([^"]+)"[^>]*class="[^"]*object-cover[^"]*"/);
        if (pm) pic = pm[1];
    }
    pic = fixUrl(pic);

    let playUrl = '';
    const nextM = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (nextM) {
        try {
            playUrl = findVideoUrl(JSON.parse(nextM[1])) || '';
        } catch {
            /* ignore */
        }
    }
    if (!playUrl) {
        const mp4M = html.match(/(https:\/\/video\.twimg\.com\/[^\s"']+\.mp4[^\s"']*)/);
        if (mp4M) playUrl = mp4M[1];
    }
    if (!playUrl) {
        const videoM = html.match(/<video[^>]*src="([^"]+)"/);
        if (videoM) playUrl = videoM[1];
    }

    const vodPlayUrl = playUrl ? `播放$${playUrl}` : `网页播放$${url}`;

    return {
        list: [
            {
                vod_id: vid,
                vod_name: title,
                vod_pic: pic,
                vod_content: '',
                vod_play_from: 'PeKtino',
                vod_play_url: vodPlayUrl,
            },
        ],
    };
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    if (!id) return { parse: 0, url: '', header: {} };

    if (id.startsWith('http://') || id.startsWith('https://')) {
        if (/\.mp4|\.m3u8/i.test(id)) {
            const header = id.includes('video.twimg.com') ? twimgHeader() : siteHeader();
            return { parse: 0, url: id, header };
        }
        const html = await fetchHtml(id);
        if (html) {
            const mp4M = html.match(/(https:\/\/video\.twimg\.com\/[^\s"']+\.mp4[^\s"']*)/);
            if (mp4M) {
                return { parse: 0, url: mp4M[1], header: twimgHeader() };
            }
        }
        return { parse: 1, url: id, header: { Referer: `${HOST}/` } };
    }

    const url = fixUrl(id);
    if (!url) return { parse: 0, url: '', header: {} };
    return { parse: 0, url, header: siteHeader() };
}

async function search(inReq, _outResp) {
    const key = encodeURIComponent(inReq.body.wd || '');
    let pg = parseInt(inReq.body.pg || inReq.body.page, 10) || 1;
    if (pg < 1) pg = 1;

    let html = await fetchHtml(`${HOST}/${LANG}/search?q=${key}&page=${pg}`);
    if (!html) html = await fetchHtml(`${HOST}/${LANG}/category/${key}?page=${pg}`);
    if (!html) {
        return { list: [], page: pg, pagecount: 1, limit: 20, total: 0 };
    }

    const videos = extractVideos(html);
    let pagecount = getPagecount(html);
    if (pagecount < pg) pagecount = pg;
    return {
        list: videos,
        page: pg,
        pagecount,
        limit: 20,
        total: pagecount * 20,
    };
}

export default {
    meta: {
        key: 'pektino',
        name: '🎥PeKtino',
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
