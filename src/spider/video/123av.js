import axios from 'axios';

const site = 'https://123av.fun';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const http = axios.create({
    timeout: 15_000,
    headers: {
        'User-Agent':      UA,
        Accept:            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds) {
    const dur = parseInt(seconds) || 0;
    const h   = Math.floor(dur / 3600);
    const m   = Math.floor((dur % 3600) / 60);
    const s   = dur % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function extractVideoList(html) {
    if (!html) return [];
    const videos = [];
    const cardRe = /<a\s+([^>]*data-src="https:\/\/static\.123av\.fun\/[^"]+\.m3u8"[^>]*)>(.*?)<\/a>/gs;

    for (const [, attrs, content] of html.matchAll(cardRe)) {
        try {
            const srcM    = attrs.match(/data-src="(https:\/\/static\.123av\.fun\/[^"]+\.m3u8)"/);
            const idM     = attrs.match(/data-id="(\d+)"/);
            if (!srcM || !idM) continue;

            const posterM = attrs.match(/data-poster="([^"]*)"/);
            const durM    = attrs.match(/data-duration="(\d+)"/);
            const titleM  = content.match(/<xwya-video[^>]*alt="([^"]*)"/);

            const vid = idM[1];
            videos.push({
                vod_id:      vid,
                vod_name:    titleM ? titleM[1].trim() : `视频${vid}`,
                vod_pic:     posterM ? posterM[1] : '',
                vod_remarks: durM ? formatDuration(durM[1]) : '',
            });
        } catch { /* ignore */ }
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
        const { data } = await http.get(`${site}/publish-time/sort-desc/page-1`);
        list = extractVideoList(data);
    } catch { /* ignore */ }

    return {
        class: [
            { type_id: 'publish-time/sort-desc',  type_name: '最新发布' },
            { type_id: 'view-count/sort-desc',     type_name: '最多播放' },
            { type_id: 'comment-count/sort-desc',  type_name: '最多评论' },
            { type_id: 'favorite-count/sort-desc', type_name: '最多收藏' },
            { type_id: 'explore',                  type_name: '探索发现' },
            { type_id: 'list',                     type_name: '排行榜'   },
        ],
        list,
        filters: {},
    };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const pg   = parseInt(inReq.body.page) || 1;

    const { data } = await http.get(`${site}/${tid}/page-${pg}`);
    return {
        page:      pg,
        pagecount: 999,
        limit:     20,
        total:     999 * 20,
        list:      extractVideoList(data),
    };
}

async function detail(inReq, _outResp) {
    const vid = inReq.body.id;

    try {
        const { data: html } = await http.get(`${site}/detail/${vid}`);

        const srcM    = html.match(/data-src="(https:\/\/static\.123av\.fun\/[^"]+\.m3u8)"/);
        const posterM = html.match(/data-poster="([^"]*)"/);
        const titleM  = html.match(/<h1[^>]*>([^<]+)<\/h1>/)
                     || html.match(/property="og:title"\s+content="([^"]*)"/);
        const descM   = html.match(/property="og:description"\s+content="([^"]*)"/);
        const durM    = html.match(/data-duration="(\d+)"/);

        const m3u8     = srcM?.[1]    || '';
        const vod_pic  = posterM?.[1] || '';
        const vod_name = titleM?.[1]?.trim() || '';

        return {
            list: [{
                vod_id:        vid,
                vod_name,
                vod_pic,
                vod_remarks:   durM ? formatDuration(durM[1]) : '',
                vod_content:   descM?.[1] || '',
                vod_play_from: '短视频',
                vod_play_url:  m3u8 ? `正片$${m3u8}` : '',
                type_name:     '短视频',
                vod_year:      '',
                vod_area:      '',
                vod_director:  '',
                vod_actor:     '',
            }],
        };
    } catch {
        return { list: [] };
    }
}

async function play(inReq, _outResp) {
    const pid = inReq.body.id;

    const base = { header: { 'User-Agent': UA, Referer: `${site}/` } };

    // 已经是 m3u8 直接播放
    if (pid.startsWith('http') && pid.includes('.m3u8')) {
        return { ...base, parse: 0, url: pid };
    }

    // 详情页二次提取
    if (pid.includes('/detail/')) {
        try {
            const { data: html } = await http.get(pid);
            const m = html.match(/data-src="(https:\/\/static\.123av\.fun\/[^"]+\.m3u8)"/);
            if (m) return { ...base, parse: 0, url: m[1] };
        } catch { /* ignore */ }
    }

    return { ...base, parse: 1, url: pid };
}

async function search(inReq, _outResp) {
    const key = encodeURIComponent(inReq.body.wd || '');
    const pg  = parseInt(inReq.body.pg) || 1;

    try {
        const { data } = await http.get(`${site}/search/${key}/page-${pg}`);
        return { page: pg, pagecount: 99, limit: 20, total: 99 * 20, list: extractVideoList(data) };
    } catch {
        return { list: [] };
    }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  '123av',
        name: '🔥123AV短视频',
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