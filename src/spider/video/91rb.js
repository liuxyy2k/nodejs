import axios from 'axios';

/**
 * 91热爆 - https://rb.jnyk08.icu
 * API: https://api.vuecloudrb.com
 */

const site = 'https://rb.jnyk08.icu';
const api = 'https://api.vuecloudrb.com';

const http = axios.create({
    timeout: 10_000,
    validateStatus: () => true,
    headers: {
        'User-Agent': 'Mozilla/5.0',
        Referer: `${site}/`,
        Origin: site,
    },
});

function getHeaders() {
    return {
        'User-Agent': 'Mozilla/5.0',
        Referer: `${site}/`,
        Origin: site,
    };
}

async function apiGet(path, params = {}) {
    try {
        const resp = await http.get(`${api}${path}`, { params, headers: getHeaders() });
        if (resp.status !== 200) return null;
        return resp.data;
    } catch (e) {
        console.log(`[91rb] apiGet error: ${e.message}`);
        return null;
    }
}

function formatTime(s) {
    try {
        const sec = parseInt(s || 0, 10) || 0;
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const ss = sec % 60;
        if (h) {
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
        }
        return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    } catch {
        return '';
    }
}

function getPic(item) {
    return item?.video_img || item?.screenshot1 || '';
}

function normalizeList(data) {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
        return data.data || data.list_new?.data || data.list_hot?.data || [];
    }
    return [];
}

function toVodItems(data) {
    return normalizeList(data)
        .filter((i) => i?.video_id || i?.id)
        .map((i) => ({
            vod_id: String(i.video_id || i.id || ''),
            vod_name: i.title || i.name || '',
            vod_pic: getPic(i),
            vod_remarks: formatTime(i.duration),
        }));
}

function buildPlayUrl(vid) {
    const id = String(vid || '').trim();
    let base;
    if (/^\d+$/.test(id)) {
        base = String(Math.floor(parseInt(id, 10) / 1000) * 1000);
    } else {
        base = id.slice(0, -3) + '000';
    }
    return `https://delivery.douyinpaly.com/hls/contents/videos/${base}/${id}/${id}.mp4/index.m3u8`;
}

function pageResult(data, pg) {
    const content = data && typeof data === 'object' ? data : {};
    return {
        list: toVodItems(content),
        page: pg,
        pagecount: content.last_page || pg,
        limit: 24,
        total: content.total || 0,
    };
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: 'all', type_name: '推荐' },
        { type_id: 'new', type_name: '最新' },
        { type_id: 'hot', type_name: '热门' },
    ];

    try {
        const cate = await apiGet('/videos/classification', { page: 1, size: 50, categories: 0, sort: 'post_date' });
        const content = cate?.content || [];
        for (const i of content) {
            if (i?.category_id) {
                classes.push({ type_id: String(i.category_id), type_name: i.title || '' });
            }
        }
    } catch {
        /* ignore */
    }

    const data = await apiGet('/videos/index_byall', {
        page: 1,
        size: 24,
        categories: 0,
        sort: 'post_date',
    });
    const list = toVodItems(data?.content?.list_new || {});

    return { class: classes, filters: {}, list };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || 'all');
    const pg = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;

    let content = {};

    if (tid === 'all') {
        const data = await apiGet('/videos/index', { page: pg, size: 24 });
        content = data?.content || {};
    } else if (tid === 'new') {
        const data = await apiGet('/videos/index_byall', {
            page: pg,
            size: 24,
            categories: 0,
            sort: 'post_date',
        });
        content = data?.content?.list_new || {};
    } else if (tid === 'hot') {
        const data = await apiGet('/videos/index_byall', {
            page: pg,
            size: 24,
            categories: 0,
            sort: 'video_viewed',
        });
        content = data?.content?.list_hot || {};
    } else if (tid.startsWith('tag_')) {
        const data = await apiGet('/videos/list_bytags', {
            page: pg,
            size: 24,
            categories: 0,
            sort: 'post_date',
            tags: tid.slice(4),
        });
        content = data?.content || {};
    } else {
        const data = await apiGet('/videos/index', {
            page: pg,
            size: 24,
            categories: tid,
            sort: 'post_date',
        });
        content = data?.content || {};
    }

    return pageResult(content, pg);
}

async function detail(inReq, _outResp) {
    const vid = String(inReq.body.id || '');
    const data = await apiGet('/videos/detail', { id: vid });
    const c = data?.content || {};

    const name = c.title || vid;
    const pic = c.video_img || '';
    const tags = (c.tags || [])
        .filter((i) => i && typeof i === 'object')
        .map((i) => i.tag || '')
        .filter(Boolean)
        .join(',');
    const cats = (c.categories || [])
        .filter((i) => i && typeof i === 'object')
        .map((i) => i.title || '')
        .filter(Boolean)
        .join(',');

    return {
        list: [
            {
                vod_id: vid,
                vod_name: name,
                vod_pic: pic,
                type_name: cats,
                vod_year: c.post_date || '',
                vod_area: '',
                vod_remarks: formatTime(c.duration),
                vod_actor: tags,
                vod_director: '',
                vod_content: name,
                vod_play_from: '直连',
                vod_play_url: `${name}$${vid}`,
            },
        ],
    };
}

async function play(inReq, _outResp) {
    const vid = String(inReq.body.id || '').trim();
    const url = buildPlayUrl(vid);
    return {
        parse: 0,
        url,
        header: getHeaders(),
    };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg = parseInt(inReq.body.pg || inReq.body.page || 1, 10) || 1;

    const data = await apiGet('/videos/search', { keyword: key, page: pg, limit: 20 });
    const content = data?.content || {};

    return {
        list: toVodItems(content),
        page: pg,
        pagecount: content.last_page || 1,
        limit: 20,
        total: content.total || 0,
    };
}

export default {
    meta: {
        key: '91rb',
        name: '🎞️91热爆',
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
