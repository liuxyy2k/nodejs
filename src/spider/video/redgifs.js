import axios from 'axios';

const apiBase = 'https://api.redgifs.com/v2';
let token = '';

const http = axios.create({
    timeout: 10_000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept:       'application/json, text/plain, */*',
        Origin:       'https://www.redgifs.com',
        Referer:      'https://www.redgifs.com/',
    },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchToken() {
    if (token) return token;
    try {
        const { data } = await http.get(`${apiBase}/auth/temporary`);
        token = data.token || '';
        return token;
    } catch {
        return null;
    }
}

function authHeaders(tok) {
    return { Authorization: `Bearer ${tok}` };
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const tok = await fetchToken();
    let list  = [];
    if (tok) {
        try {
            const { data } = await http.get(`${apiBase}/gifs/search`, {
                headers: authHeaders(tok),
                params:  { search_text: 'trending', order: 'trending', count: 20, page: 1 },
            });
            list = (data.gifs || []).map((item) => ({
                vod_id:      `trending:${item.id}`,
                vod_name:    `Video ${item.id}`,
                vod_pic:     item.urls?.thumbnail || '',
                vod_remarks: `👁️ ${item.views || 0}`,
            }));
        } catch { /* ignore */ }
    }

    return {
        class: [
            { type_id: 'trending', type_name: '🔥 Trending' },
            { type_id: 'top',      type_name: '🏆 Top'      },
            { type_id: 'latest',   type_name: '✨ New'       },
        ],
        list,
        filters: {},
    };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg  = parseInt(inReq.body.page) || 1;

    const result = { list: [], page: pg, pagecount: 10, limit: 20, total: 200 };
    const tok    = await fetchToken();
    if (!tok) return result;

    try {
        const { data } = await http.get(`${apiBase}/gifs/search`, {
            headers: authHeaders(tok),
            params:  { search_text: 'trending', order: tid, count: 20, page: pg },
        });
        result.list = (data.gifs || []).map((item) => ({
            vod_id:      `${tid}:${item.id}`,
            vod_name:    `Video ${item.id}`,
            vod_pic:     item.urls?.thumbnail || '',
            vod_remarks: `👁️ ${item.views || 0}`,
        }));
    } catch { /* ignore */ }

    return result;
}

async function detail(inReq, _outResp) {
    const vid      = inReq.body.id;
    const [category, realId] = vid.includes(':') ? vid.split(':', 2) : ['trending', vid];

    const tok = await fetchToken();
    if (!tok) return { list: [] };

    const headers = authHeaders(tok);

    // 当前视频详情
    let currentGif = {};
    try {
        const { data } = await http.get(`${apiBase}/gifs/${realId}`, { headers });
        currentGif = data.gif || {};
    } catch {
        return { list: [] };
    }

    // 同分类列表作为选集
    const playlist = [];
    try {
        const { data } = await http.get(`${apiBase}/gifs/search`, {
            headers,
            params: { search_text: 'trending', order: category, count: 20, page: 1 },
        });
        for (const item of data.gifs || []) {
            if (item.id === realId) continue;
            const videoUrl = item.urls?.hd || item.urls?.sd;
            if (videoUrl) playlist.push(`Video ${item.id}$${videoUrl}`);
        }
    } catch { /* ignore */ }

    // 当前视频插到第一位
    const currentUrl = currentGif.urls?.hd || currentGif.urls?.sd;
    if (currentUrl) playlist.unshift(`Video ${currentGif.id}$${currentUrl}`);

    return {
        list: [{
            vod_id:        vid,
            vod_name:      currentGif.id || '',
            vod_pic:       currentGif.urls?.thumbnail || '',
            vod_play_from: 'RedGifs 合集',
            vod_play_url:  playlist.join('#'),
            vod_content:   `Tags: ${(currentGif.tags || []).join(',')}`,
        }],
    };
}

async function play(inReq, _outResp) {
    return { parse: 0, url: inReq.body.id };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg  = parseInt(inReq.body.pg) || 1;
    return category({ body: { id: key, page: pg } });
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'redgifs',
        name: '🎥RedGifs',
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