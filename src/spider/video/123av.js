import axios from 'axios';
import https from 'https';

const SITE = 'https://123av.fun';
const UA = 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36';

const TYPE_MAP = {
    'publish-time': '最新发布',
    'view-count': '最多播放',
    'comment-count': '最多评论',
    'favorite-count': '最多收藏',
};

const http = axios.create({
    timeout: 20000,
    headers: {
        'User-Agent': UA,
        Accept: 'text/html,*/*;q=0.8',
        Referer: `${SITE}/`,
    },
    validateStatus: () => true,
});

async function fetchPage(path) {
    try {
        const resp = await http.get(path.startsWith('http') ? path : `${SITE}${path}`);
        const html = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
        if (resp.status >= 400 || !html) return '';
        return html;
    } catch {
        return '';
    }
}

function formatDuration(seconds) {
    const dur = parseInt(seconds, 10) || 0;
    const h = Math.floor(dur / 3600);
    const m = Math.floor((dur % 3600) / 60);
    const s = dur % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function extractVodCards(html) {
    if (!html) return [];
    const items = [];
    const seen = new Set();

    const cardRe = /<a\s+([^>]*data-src="https:\/\/static\.123av\.fun\/[^"]+\.m3u8"[^>]*)>([\s\S]*?)<\/a>/g;
    for (const [, attrs, content] of html.matchAll(cardRe)) {
        const srcM = attrs.match(/data-src="(https:\/\/static\.123av\.fun\/[^"]+\.m3u8)"/);
        const idM = attrs.match(/data-id="(\d+)"/) || attrs.match(/href="\/detail\/(\d+)/);
        if (!srcM || !idM) continue;
        const vid = idM[1];
        if (seen.has(vid)) continue;
        seen.add(vid);
        const posterM = attrs.match(/data-poster="([^"]*)"/);
        const durM = attrs.match(/data-duration="(\d+)"/);
        const titleM = content.match(/<xwya-video[^>]*alt="([^"]*)"/) || content.match(/alt="([^"]+)"/);
        items.push({
            vod_id: vid,
            vod_name: titleM ? titleM[1].trim() : `视频${vid}`,
            vod_pic: posterM ? posterM[1] : '',
            vod_remarks: durM ? formatDuration(durM[1]) : '',
        });
    }

    for (const m of html.matchAll(/<a[^>]*href="\/detail\/(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g)) {
        const vid = m[1];
        if (seen.has(vid)) continue;
        seen.add(vid);
        const inner = m[2];
        let name = inner.match(/alt="([^"]+)"/)?.[1] || '';
        if (!name) {
            name = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
        }
        const pic =
            inner.match(/data-poster="([^"]+)"/)?.[1] ||
            inner.match(/poster="([^"]+)"/)?.[1] ||
            '';
        items.push({
            vod_id: vid,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: '',
        });
    }
    return items;
}

function extractDetail(html) {
    const info = {};
    const play = html.match(/"contentUrl"\s*:\s*"([^"]+)"/);
    if (play) info.play_url = play[1];
    const pic = html.match(/"thumbnailUrl"\s*:\s*"([^"]+)"/);
    if (pic) info.pic = pic[1];
    const name = html.match(/"name"\s*:\s*"([^"]+)"/);
    if (name) info.name = name[1];
    if (!info.name) {
        const title = html.match(/<title>([^<]+)<\/title>/i);
        if (title) info.name = title[1].replace(/\s*-\s*123AV\.FUN/i, '').trim();
    }
    if (!info.play_url) {
        const src = html.match(/data-src="(https:\/\/static\.123av\.fun\/[^"]+\.m3u8)"/);
        if (src) info.play_url = src[1];
    }
    if (!info.pic) {
        const poster = html.match(/data-poster="([^"]*)"/);
        if (poster) info.pic = poster[1];
    }
    return info;
}

function toVod(it) {
    return {
        vod_id: it.vod_id || it.id,
        vod_name: it.vod_name || it.name || '',
        vod_pic: it.vod_pic || it.pic || '',
        type_name: '',
        vod_remarks: it.vod_remarks || '',
    };
}

async function init() {
    return {};
}

async function home() {
    const html = await fetchPage('/');
    const list = extractVodCards(html).slice(0, 50).map(toVod);
    return {
        class: Object.entries(TYPE_MAP).map(([type_id, type_name]) => ({ type_id, type_name })),
        filters: {},
        list,
    };
}

async function category(inReq) {
    const tid = String(inReq.body.id || 'publish-time');
    const pg = parseInt(inReq.body.page, 10) || 1;
    const sort = tid.includes('/') ? tid : `${tid}/sort-desc`;
    const path = pg <= 1 ? `/${sort}` : `/${sort}/page-${pg}`;
    const html = await fetchPage(path);
    const items = extractVodCards(html).map(toVod);
    const hasNext = html.includes(`page-${pg + 1}`);
    return {
        list: items,
        page: pg,
        pagecount: hasNext ? pg + 1 : pg,
        limit: 50,
        total: 0,
    };
}

async function detail(inReq) {
    let vid = inReq.body.id;
    if (Array.isArray(vid)) vid = vid[0];
    vid = String(vid || '').split('@')[0].trim();
    if (!vid) return { list: [] };
    const html = await fetchPage(`/detail/${vid}`);
    if (!html) return { list: [] };
    const info = extractDetail(html);
    const playUrl = info.play_url || '';
    return {
        list: [
            {
                vod_id: vid,
                vod_name: info.name || '未知',
                vod_pic: info.pic || '',
                type_name: '',
                vod_year: '',
                vod_area: '',
                vod_remarks: '',
                vod_actor: '',
                vod_director: '',
                vod_content: '',
                vod_play_from: '在线播放',
                vod_play_url: playUrl ? `正片$${playUrl}` : `正片$${vid}`,
            },
        ],
    };
}

async function search(inReq) {
    const key = encodeURIComponent(String(inReq.body.wd || ''));
    const pg = parseInt(inReq.body.page || inReq.body.pg, 10) || 1;
    try {
        let html = await fetchPage(`/search?keyword=${key}`);
        if (!html || !extractVodCards(html).length) {
            html = await fetchPage(`/search/${key}/page-${pg}`);
        }
        return { list: extractVodCards(html).slice(0, 20).map(toVod), page: pg };
    } catch {
        return { list: [] };
    }
}

async function play(inReq) {
    let id = String(inReq.body.id || '').split('@')[0].trim();
    const header = { 'User-Agent': UA, Referer: `${SITE}/` };
    if (/^https?:\/\//i.test(id) && /\.m3u8/i.test(id)) {
        return { parse: 0, url: id, playUrl: id, header };
    }
    if (id.includes('/detail/')) {
        id = id.match(/\/detail\/(\d+)/)?.[1] || id;
    }
    const html = await fetchPage(`/detail/${id}`);
    if (!html) return { parse: 0, url: '', playUrl: '', header };
    const info = extractDetail(html);
    const playUrl = info.play_url || '';
    return { parse: 0, url: playUrl, playUrl, header };
}

export default {
    meta: {
        key: '123dsp',
        name: '🌸123短视频',
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
