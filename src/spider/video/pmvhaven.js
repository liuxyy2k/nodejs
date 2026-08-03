import axios from 'axios';

const API = 'https://pmvhaven.com/api';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

const H = {
    Accept: 'application/json, text/plain, */*',
    Origin: 'https://pmvhaven.com',
    Referer: 'https://pmvhaven.com/',
    'User-Agent': UA,
};

const PHEADERS = {
    'User-Agent': 'Mozilla/5.0',
    Referer: 'https://pmvhaven.com/',
    Origin: 'https://pmvhaven.com',
};

const http = axios.create({
    timeout: 25000,
    headers: H,
    validateStatus: () => true,
});

async function getJson(url) {
    const r = await http.get(url);
    if (r.status < 200 || r.status >= 300) {
        throw new Error(`HTTP ${r.status}`);
    }
    return typeof r.data === 'object' ? r.data : JSON.parse(r.data);
}

function videoItem(v) {
    return {
        vod_id: v._id || v.id || '',
        vod_name: v.title || 'Untitled',
        vod_pic: v.thumbnailUrl || '',
        vod_remarks: `${v.duration || ''}·${v.views || ''}`,
    };
}

function playUrl(d) {
    const plays = [];
    if (d.hlsMasterPlaylistUrl) {
        plays.push(`自动$${d.hlsMasterPlaylistUrl}`);
    }
    for (const v of d.hlsVariants || []) {
        if (v.playlistUrl) {
            plays.push(`${v.resolution || '源'}$${v.playlistUrl}`);
        }
    }
    if (!plays.length && d.videoUrl) {
        plays.push(`源$${d.videoUrl}`);
    }
    return plays;
}

function parseExtend(extend) {
    if (!extend) return {};
    if (typeof extend === 'string') {
        try {
            return JSON.parse(extend);
        } catch {
            return {};
        }
    }
    return typeof extend === 'object' ? extend : {};
}

async function categoryFolder(tid, pg) {
    const key = String(tid).replace(/@$/, '');
    let items = [];
    let total = 0;
    let limit = 24;

    if (key.startsWith('tag@')) {
        const name = key.slice(4);
        const url = `${API}/videos?page=${pg}&limit=24&tag=${encodeURIComponent(name)}&sort=-views`;
        const j = await getJson(url);
        items = (j.videos || []).map(videoItem);
        total = parseInt(j.pagination?.total || 0, 10);
        limit = 24;
    } else if (key.startsWith('pl@')) {
        const pid = key.slice(3);
        try {
            const dd = (await getJson(`${API}/playlists/${pid}`)).data || {};
            const vids = dd.videoDetails || [];
            items = vids.map(videoItem);
            total = vids.length;
            limit = 24;
        } catch {
            return { list: [], page: pg, pagecount: 1, limit: 24, total: 0 };
        }
    }

    const pagecount = total ? Math.max(1, Math.ceil(total / limit)) : 1;
    return { list: items, page: pg, pagecount, limit, total };
}

async function detailVideo(vid) {
    const d = (await getJson(`${API}/videos/${vid}`)).data || {};
    const plays = playUrl(d);
    return {
        list: [
            {
                vod_id: vid,
                vod_name: d.title || 'Untitled',
                vod_pic: d.thumbnailUrl || '',
                vod_remarks: d.duration || '',
                vod_content:
                    (d.music || []).map(String).join(' ') || d.description || '',
                vod_play_from: 'PMVHaven',
                vod_play_url: plays.join('#'),
            },
        ],
    };
}

async function detailPlaylist(pid) {
    const dd = (await getJson(`${API}/playlists/${pid}`)).data || {};
    const items = dd.videoDetails || [];
    const plays = [];
    for (const v of items) {
        const u = v.hlsMasterPlaylistUrl || v.videoUrl;
        if (u) plays.push(`${v.title || 'video'}$${u}`);
    }
    return {
        list: [
            {
                vod_id: `pl:${pid}`,
                vod_name: dd.name || 'Playlist',
                vod_pic: dd.thumbnailUrl || '',
                vod_remarks: `${items.length} 视频`,
                vod_play_from: 'PMVHaven',
                vod_play_url: plays.join('#'),
            },
        ],
    };
}

async function detailTag(tag) {
    const url = `${API}/videos?page=1&limit=60&tag=${encodeURIComponent(tag)}&sort=-views`;
    const j = await getJson(url);
    const items = j.videos || [];
    const plays = [];
    for (const v of items) {
        const u = v.hlsMasterPlaylistUrl || v.videoUrl;
        if (u) plays.push(`${v.title || 'video'}$${u}`);
    }
    return {
        list: [
            {
                vod_id: `tag:${tag}`,
                vod_name: `#${tag}`,
                vod_pic: '',
                vod_remarks: `${items.length} 视频`,
                vod_play_from: 'PMVHaven',
                vod_play_url: plays.join('#'),
            },
        ],
    };
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    return {
        class: [
            { type_id: 'latest', type_name: '最新更新' },
            { type_id: 'trending', type_name: '热点趋势' },
            { type_id: 'popular', type_name: '人气流行' },
            { type_id: 'playlists', type_name: '播放列表' },
            { type_id: 'browse', type_name: '分类标签' },
        ],
        filters: {
            popular: [
                {
                    key: 'period',
                    name: '时间',
                    value: [
                        { n: '全部', v: '' },
                        { n: '今日', v: '1' },
                        { n: '本周', v: '7' },
                        { n: '本月', v: '30' },
                    ],
                },
            ],
            trending: [
                {
                    key: 'period',
                    name: '时间',
                    value: [
                        { n: '1小时', v: '1h&tab=hot' },
                        { n: '6小时', v: '6h&tab=hot' },
                        { n: '今日', v: '' },
                    ],
                },
            ],
        },
    };
}

async function category(inReq, _outResp) {
    let pg = parseInt(String(inReq.body.page || '1').trim(), 10);
    if (Number.isNaN(pg)) pg = 1;
    const tid = String(inReq.body.id || '');
    const extend = parseExtend(inReq.body.extend);

    if (tid.includes('@')) {
        return categoryFolder(tid, pg);
    }

    let items = [];
    let total = 0;
    let limit = 24;

    if (tid === 'popular') {
        const period = extend.period || '';
        let url = `${API}/videos?page=${pg}&limit=24&sort=-views`;
        if (period) {
            const days = parseInt(String(period).trim(), 10);
            if (!Number.isNaN(days)) {
                const dt = new Date(Date.now() - days * 86400000)
                    .toISOString()
                    .replace(/\.\d{3}Z$/, '.000Z');
                url += `&uploadDateFrom=${dt}`;
            }
        }
        const j = await getJson(url);
        items = (j.videos || []).map(videoItem);
        total = parseInt(j.pagination?.total || 0, 10);
        limit = 24;
    } else if (tid === 'trending') {
        const period = extend.period || '24h&tab=hot';
        const url = `${API}/videos/trending?page=${pg}&limit=24&period=${period}`;
        const j = await getJson(url);
        items = (j.videos || []).map(videoItem);
        total = parseInt(j.count || 0, 10);
        limit = 24;
    } else if (tid === 'random') {
        const j = await getJson(`${API}/videos?page=${pg}&limit=24&sort=random`);
        items = (j.videos || []).map(videoItem);
        total = parseInt(j.pagination?.total || 0, 10);
        limit = 24;
    } else if (tid === 'browse') {
        const j = await getJson(`${API}/tags/popular?page=${pg}&limit=30`);
        const tags = j.data || [];
        items = [];
        for (const t of tags) {
            const name = t.name || '';
            if (!name) continue;
            items.push({
                vod_id: `tag@${name}`,
                vod_name: name,
                vod_pic: '',
                vod_tag: 'folder',
                vod_remarks: `▶ ${t.usageCount || ''}`,
            });
        }
        total = parseInt(j.pagination?.total || 0, 10);
        limit = 30;
    } else if (tid === 'playlists') {
        const j = await getJson(`${API}/playlists?page=${pg}&limit=24`);
        const pls = j.data || [];
        items = [];
        for (const p of pls) {
            const pid = p._id || p.id || '';
            if (!pid) continue;
            const cnt = (p.videos || []).length;
            const priv = !p.isPublic;
            items.push({
                vod_id: `pl@${pid}`,
                vod_name: p.name || 'Playlist',
                vod_pic: p.thumbnailUrl || '',
                vod_tag: 'folder',
                vod_remarks: `${priv ? '🔒私密 ' : ''}${cnt} 视频`,
            });
        }
        const meta = j.meta || {};
        total = parseInt(
            meta.total || meta.count || meta.pagination?.total || 0,
            10,
        );
        limit = 24;
    } else if (tid === 'latest') {
        const j = await getJson(
            `${API}/videos?page=${pg}&limit=24&sort=-releaseDate`,
        );
        items = (j.videos || []).map(videoItem);
        total = parseInt(j.pagination?.total || 0, 10);
        limit = 24;
    }

    const pagecount = total ? Math.max(1, Math.ceil(total / limit)) : 1;
    return { list: items, total, page: pg, pagecount, limit };
}

async function detail(inReq, _outResp) {
    const tid = String(inReq.body.id || '');
    if (tid.startsWith('pl:')) return detailPlaylist(tid.slice(3));
    if (tid.startsWith('tag:')) return detailTag(tid.slice(4));
    return detailVideo(tid);
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const url = `${API}/videos?page=1&limit=24&q=${encodeURIComponent(key)}&sort=-views`;
    const j = await getJson(url);
    return { list: (j.videos || []).map(videoItem) };
}

async function play(inReq, _outResp) {
    const id = inReq.body.id || '';
    if (id.includes('m3u8')) {
        return {
            parse: 0,
            url: id,
            header: PHEADERS,
            format: 'application/x-mpegURL',
        };
    }
    return {
        parse: 0,
        url: id,
        header: PHEADERS,
        format: 'video/mp4',
    };
}

export default {
    meta: {
        key: 'pmvhaven',
        name: '🔥PMVHaven',
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
