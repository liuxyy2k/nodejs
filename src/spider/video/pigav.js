import axios from 'axios';

const site   = 'https://pigav.ws';
const apiUrl = `${site}/api/v1`;
const PAGE_SIZE = 24;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const http = axios.create({
    timeout: 12_000,
    headers: {
        'User-Agent': UA,
        Accept:       'application/json, text/plain, */*',
        Origin:       site,
        Referer:      `${site}/`,
    },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fixUrl(path) {
    if (!path) return '';
    return path.startsWith('http') ? path : site + path;
}

function formatTime(seconds) {
    try {
        const sec = parseInt(seconds) || 0;
        const h   = Math.floor(sec / 3600);
        const m   = Math.floor((sec % 3600) / 60);
        const s   = sec % 60;
        const pad = (n) => String(n).padStart(2, '0');
        return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    } catch {
        return '';
    }
}

async function getVideos(url) {
    try {
        const { data } = await http.get(url);
        const items    = Array.isArray(data) ? data : (data.data || []);
        return items.map((item) => ({
            vod_id:      item.shortUUID || item.uuid,
            vod_name:    item.name || '',
            vod_pic:     fixUrl(item.thumbnailPath || ''),
            vod_remarks: formatTime(item.duration || 0),
        }));
    } catch {
        return [];
    }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const list = await getVideos(`${apiUrl}/videos?sort=-publishedAt&count=${PAGE_SIZE}&start=0`);
    return {
        class: [
            { type_id: 'publishedAt', type_name: '最近更新' },
            { type_id: 'hot',         type_name: '热门视频' },
            { type_id: 'views',       type_name: '最多观看' },
        ],
        list,
        filters: {},
    };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const pg   = Math.max(1, parseInt(inReq.body.page) || 1);
    const sortMap = { publishedAt: '-publishedAt', hot: '-hot', views: '-views' };
    const sort    = sortMap[tid] || '-publishedAt';
    const start   = (pg - 1) * PAGE_SIZE;

    const list = await getVideos(`${apiUrl}/videos?sort=${sort}&count=${PAGE_SIZE}&start=${start}`);
    return { page: pg, pagecount: 9999, limit: PAGE_SIZE, list };
}

async function detail(inReq, _outResp) {
    const vid = Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id;

    try {
        const { data } = await http.get(`${apiUrl}/videos/${vid}`);
        return {
            list: [{
                vod_id:        vid,
                vod_name:      data.name || '',
                vod_pic:       fixUrl(data.thumbnailPath || ''),
                vod_remarks:   formatTime(data.duration || 0),
                vod_actor:     data.channel?.displayName || '',
                vod_content:   data.description || '',
                vod_play_from: 'PigAV',
                vod_play_url:  `播放正片$${vid}`,
            }],
        };
    } catch {
        return { list: [] };
    }
}

async function play(inReq, _outResp) {
    const id = inReq.body.id;

    const playHeaders = {
        'User-Agent':    UA,
        Referer:         `${site}/videos/${id}`,
        Origin:          site,
        Accept:          '*/*',
        Range:           'bytes=0-',
        Connection:      'keep-alive',
        'Sec-Fetch-Dest': 'video',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
    };

    try {
        const { data } = await http.get(`${apiUrl}/videos/${id}`);

        let playUrl = '';

        // 优先 HLS m3u8
        const streaming = data.streamingPlaylists || [];
        if (streaming.length) {
            const idx = Math.max(0, streaming.length - 2);
            playUrl   = streaming[idx]?.playlistUrl || '';
        }

        // 备选 MP4 直链
        if (!playUrl) {
            const files    = data.files || [];
            const suitable = files.filter((f) => (f.resolution?.height || 0) <= 720);
            const best     = suitable.length ? suitable[suitable.length - 1] : files[0];
            playUrl = best?.fileUrl || best?.fileDownloadUrl || '';
        }

        if (playUrl) {
            return { parse: 0, url: fixUrl(playUrl), header: playHeaders };
        }
    } catch { /* ignore */ }

    return { parse: 0, url: '' };
}

async function search(inReq, _outResp) {
    const key  = encodeURIComponent(inReq.body.wd || '');
    const pg   = Math.max(1, parseInt(inReq.body.pg) || 1);
    const start = (pg - 1) * PAGE_SIZE;

    const list = await getVideos(`${apiUrl}/search/videos?search=${key}&count=${PAGE_SIZE}&start=${start}`);
    return { list };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'pigav',
        name: '🌸PigAV',
        type: 1,
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