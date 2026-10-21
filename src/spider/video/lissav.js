import req from '../../util/req.js';

/**
 * LissAV · https://lissav.my/asian/zh-CN
 * 播放: /asian/zh-CN/api/video/stream?video_uid={uid}
 */

const DEFAULT_HOST = 'https://lissav.my';
const DEFAULT_BASE = '/asian/zh-CN';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const CHANNELS = {
    recent: { name: '最近更新', path: '/asian/zh-CN/videos/recent' },
    new_releases: { name: '新作上市', path: '/asian/zh-CN/videos/new-releases' },
    hot_today: { name: '今日热门', path: '/asian/zh-CN/videos/hot/today' },
    hot_week: { name: '本周热门', path: '/asian/zh-CN/videos/hot/week' },
    hot_month: { name: '本月热门', path: '/asian/zh-CN/videos/hot/month' },
    uncensored_leak: { name: '无码流出', path: '/asian/zh-CN/videos/tag/%E6%97%A0%E7%A0%81%E6%B5%81%E5%87%BA' },
    chinese_sub: { name: '中文字幕', path: '/asian/zh-CN/videos/tag/%E4%B8%AD%E6%96%87%E5%AD%97%E5%B9%95' },
    danti: { name: '单体作品', path: '/asian/zh-CN/videos/tag/%E5%8D%95%E4%BD%93%E4%BD%9C%E5%93%81' },
};

let host = DEFAULT_HOST;
let base = DEFAULT_BASE;

function applyConfig(extend) {
    host = DEFAULT_HOST;
    base = DEFAULT_BASE;
    if (!extend) return;
    let conf = extend;
    if (typeof extend === 'string' && extend.trim().startsWith('{')) {
        try {
            conf = JSON.parse(extend);
        } catch {
            return;
        }
    }
    if (conf && typeof conf === 'object') {
        if (conf.host) host = String(conf.host).replace(/\/$/, '');
        if (conf.base) base = String(conf.base);
    }
}

function fetchHeaders(referer = '', accept) {
    return {
        'User-Agent': UA,
        Accept: accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Referer: referer || `${host}${base}/`,
    };
}

async function fetchText(url, referer = '', accept) {
    if (!url) return '';
    try {
        const resp = await req.get(url, {
            headers: fetchHeaders(referer, accept),
            timeout: 18000,
            responseType: 'text',
            validateStatus: () => true,
        });
        if (resp.status === 200) {
            return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
        }
    } catch (e) {
        console.warn('[lissav] GET error', url, e.message);
    }
    return '';
}

function absUrl(u) {
    if (!u) return '';
    let s = String(u).trim().replace(/\\\//g, '/');
    if (s.startsWith('//')) return `https:${s}`;
    if (s.startsWith('http')) return s;
    if (s.startsWith('/')) return `${host}${s}`;
    return `${host}/${s}`;
}

function parseList(html) {
    const videos = [];
    const seen = new Set();
    if (!html) return videos;

    const re =
        /href="((?:https?:\/\/(?:www\.)?lissav\.my)?\/asian\/zh-CN\/video\/cid\/([a-zA-Z0-9._-]+))"/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const href = m[1];
        const cid = m[2];
        const full = absUrl(href);
        if (seen.has(full)) continue;
        seen.add(full);

        const start = Math.max(0, m.index - 400);
        const block = html.slice(start, m.index + m[0].length + 900);

        let title = '';
        const tm = block.match(/(?:title|alt)=["']([^"']{2,300})["']/i);
        if (tm) title = tm[1].trim();
        if (!title || title.length < 2) {
            const tm2 = block.match(/streamit-video-card__caption-link[^>]*title=["']([^"']+)["']/i);
            if (tm2) title = tm2[1].trim();
        }
        if (!title) title = cid.toUpperCase();

        let pic = '';
        const picPats = [
            /data-poster=["']([^"']+)["']/i,
            /src=["'](https?:\/\/[^"']+cover[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i,
            /src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i,
        ];
        for (const pat of picPats) {
            const pm = block.match(pat);
            if (pm && !/logo|loading/i.test(pm[1])) {
                pic = absUrl(pm[1]);
                break;
            }
        }

        let tips = '';
        const em = block.match(/streamit-video-card__edition[^>]*>([^<]+)</i);
        if (em) tips = em[1].trim();
        if (!tips) {
            const tm3 = block.match(/streamit-video-card__time[^>]*>[\s\S]*?<p[^>]*>([^<]+)<\/p>/i);
            if (tm3) tips = tm3[1].trim();
        }

        videos.push({
            vod_id: full,
            vod_name: title.slice(0, 120),
            vod_pic: pic,
            vod_remarks: tips || cid.toUpperCase(),
        });
    }
    return videos;
}

function extractUid(html) {
    if (!html) return '';
    const pats = [
        /data-streamit-page-video-uid=["']([a-f0-9]+)["']/i,
        /videoUid\s*=\s*["']([a-f0-9]+)["']/i,
        /"videoUid"\s*:\s*"([a-f0-9]+)"/i,
    ];
    for (const pat of pats) {
        const m = html.match(pat);
        if (m) return m[1];
    }
    return '';
}

async function fetchPlaylist(uid, referer) {
    if (!uid) return [];
    const api = `${host}${base}/api/video/stream?video_uid=${encodeURIComponent(uid)}`;
    const text = await fetchText(api, referer || `${host}${base}/`, 'application/json, text/plain, */*');
    if (!text || !text.trim().startsWith('{')) return [];

    let data;
    try {
        data = JSON.parse(text);
    } catch {
        return [];
    }

    const plays = [];
    const seen = new Set();
    const pl = data.playlist || data.sources || [];
    for (const item of pl) {
        if (!item || typeof item !== 'object') continue;
        const u = item.url || item.src || '';
        if (!u || seen.has(u) || /preview/i.test(u)) continue;
        seen.add(u);
        const mode = String(item.playMode || '').toLowerCase();
        let label = `线路${plays.length + 1}`;
        if (mode) label = `${label}(${mode})`;
        plays.push([label, u]);
    }
    return plays;
}

function buildCategoryUrl(tid, pg) {
    const page = parseInt(pg, 10) || 1;
    const info = CHANNELS[tid] || CHANNELS.recent;
    const path = info.path;
    if (page <= 1) return `${host}${path}`;
    const sep = path.includes('?') ? '&' : '?';
    return `${host}${path}${sep}page=${page}`;
}

function parsePageCount(html, pg, count) {
    const page = parseInt(pg, 10) || 1;
    if (count >= 12 || new RegExp(`[?&]page=${page + 1}`).test(html) || /pagination/i.test(html)) {
        return page + 1;
    }
    return page;
}

function playHeader() {
    return {
        'User-Agent': UA,
        Referer: `${host}/`,
        Origin: host,
    };
}

async function resolvePlay(raw, referer = '') {
    let play = String(raw || '').trim();
    const header = playHeader();

    if (/^https?:\/\//i.test(play) && /\.(m3u8|mp4)(\?|$)/i.test(play)) {
        return { parse: 0, url: play, header };
    }

    if (play.includes('/api/video/stream')) {
        const m = play.match(/video_uid=([a-f0-9]+)/i);
        const uid = m ? m[1] : '';
        const plays = await fetchPlaylist(uid, referer || `${host}${base}/`);
        if (plays.length) return { parse: 0, url: plays[0][1], header };
        return { parse: 1, jx: 1, url: play, header };
    }

    if (!play.startsWith('http')) play = absUrl(play);
    const html = await fetchText(play, referer || `${host}${base}/`);
    const uid = extractUid(html);
    const plays = await fetchPlaylist(uid, play);
    if (plays.length) return { parse: 0, url: plays[0][1], header };

    for (const u of html.match(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*/gi) || []) {
        const clean = u.replace(/&amp;/g, '&');
        if (!/preview/i.test(clean)) return { parse: 0, url: clean, header };
    }

    return { parse: 1, jx: 1, url: play, header };
}

async function init(inReq, _outResp) {
    applyConfig(inReq.body?.extend ?? inReq.body?.ext ?? '');
    return {};
}

async function home(_inReq, _outResp) {
    const classes = Object.entries(CHANNELS).map(([type_id, v]) => ({
        type_id,
        type_name: v.name,
    }));
    const html = await fetchText(`${host}${base}/videos/recent`);
    return { class: classes, filters: {}, list: parseList(html).slice(0, 24) };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.tid ?? inReq.body.id ?? 'recent');
    const pg = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const url = buildCategoryUrl(tid, pg);
    const html = await fetchText(url);
    const videos = parseList(html);
    return {
        list: videos,
        page: pg,
        pagecount: parsePageCount(html, pg, videos.length),
        limit: 24,
        total: 9999,
    };
}

async function detail(inReq, _outResp) {
    let pageUrl = String(Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id || '').trim();
    if (!pageUrl) return { list: [] };

    if (!pageUrl.startsWith('http')) {
        pageUrl = pageUrl.startsWith('/')
            ? absUrl(pageUrl)
            : `${host}${base}/video/cid/${pageUrl}`;
    }

    const html = await fetchText(pageUrl);
    if (!html) return { list: [] };

    let name = '';
    let m = html.match(/<title>([^<]+)<\/title>/i);
    if (m) {
        name = m[1]
            .replace(/^\s*LissAV\s*[|｜]\s*/i, '')
            .replace(/\s*[-|—].*$/, '')
            .trim();
    }
    if (!name) {
        m = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
        if (m) name = m[1].replace(/^\s*LissAV\s*[|｜]\s*/i, '').trim();
    }

    let pic = '';
    m = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    if (m) pic = absUrl(m[1]);

    let desc = '';
    m = html.match(/property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    if (m) desc = m[1].trim().slice(0, 500);

    const uid = extractUid(html);
    let plays = await fetchPlaylist(uid, pageUrl);

    if (!plays.length) {
        const seen = new Set();
        for (const u of html.match(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*/gi) || []) {
            const clean = u.replace(/&amp;/g, '&');
            if (seen.has(clean) || /preview/i.test(clean)) continue;
            seen.add(clean);
            plays.push([`直链${plays.length + 1}`, clean]);
        }
    }

    if (!plays.length && uid) {
        plays.push(['线路API', `${host}${base}/api/video/stream?video_uid=${uid}`]);
    }
    if (!plays.length) {
        plays.push(['正片', pageUrl]);
    }

    const playUrl = plays.map(([n, u]) => `${n}$${u}`).join('#');

    return {
        list: [
            {
                vod_id: pageUrl,
                vod_name: name || 'LissAV',
                vod_pic: pic,
                vod_remarks: uid,
                vod_actor: '',
                vod_director: '',
                vod_content: desc,
                vod_play_from: 'LissAV',
                vod_play_url: playUrl,
            },
        ],
    };
}

async function play(inReq, _outResp) {
    let raw = String(inReq.body.id || '');
    if (raw.includes('$')) raw = raw.split('$').pop();
    return resolvePlay(raw);
}

async function search(inReq, _outResp) {
    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    const pg = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    if (!key) {
        return { list: [], page: 1, pagecount: 1, limit: 24, total: 0 };
    }

    let url = `${host}${base}/videos/search/${encodeURIComponent(key)}`;
    if (pg > 1) url += `?page=${pg}`;
    let html = await fetchText(url);
    let videos = parseList(html);

    if (!videos.length) {
        url = `${host}${base}/search?q=${encodeURIComponent(key)}`;
        if (pg > 1) url += `&page=${pg}`;
        html = await fetchText(url);
        videos = parseList(html);
    }

    return {
        list: videos,
        page: pg,
        pagecount: videos.length >= 12 ? pg + 1 : pg,
        limit: 24,
        total: videos.length,
    };
}

export default {
    meta: {
        key: 'lissav',
        name: '🌸Liss·AV',
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
