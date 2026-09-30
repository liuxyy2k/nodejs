import req from '../../util/req.js';

const DEFAULT_HOST = 'https://mdcmai4.xyz';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SHORT_DRAMA_TID = 'short_drama_ai';
const API_CATEGORIES = '/api/v1/categories?type=video';
const API_VIDEOS = '/api/v1/videos';
const API_SHORT_DRAMAS = '/api/v1/short-dramas';
const API_SHORT_DRAMA_DETAIL = (id) => `/api/v1/short-dramas/${id}?productId=1`;
const API_SEARCH = '/api/v1/videos/search';
const API_M3U8_PROXY = '/api/v1/m3u8/proxy?path=';
const API_IMG_PROXY = '/api/v1/image/proxy?path=';

let host = DEFAULT_HOST;

function hdr() {
    return {
        'User-Agent': UA,
        Referer: `${host}/`,
        Origin: host,
        Accept: 'application/json, text/plain, */*',
    };
}

function playHdr() {
    return {
        'User-Agent': UA,
        Referer: `${host}/`,
        Origin: host,
    };
}

async function fetchJson(url) {
    try {
        const resp = await req.get(url, {
            headers: hdr(),
            timeout: 10000,
            validateStatus: () => true,
        });
        const data = resp.data;
        if (data && typeof data === 'object') return data;
        if (typeof data === 'string' && data.trim()) {
            try {
                return JSON.parse(data);
            } catch {
                return {};
            }
        }
    } catch {
        /* ignore */
    }
    return {};
}

function formatCover(coverPath) {
    if (!coverPath) return '';
    const p = String(coverPath);
    if (p.startsWith('http')) return p;
    if (p.startsWith('/uploads/') || p.startsWith('/api/')) return `${host}${p}`;
    return `${host}${API_IMG_PROXY}${encodeURIComponent(p)}`;
}

function formatPlayUrl(videoPath) {
    if (!videoPath) return '';
    const p = String(videoPath);
    if (p.startsWith('http')) return p;
    if (p.startsWith('/api/v1/m3u8/proxy')) return `${host}${p}`;
    return `${host}${API_M3U8_PROXY}${encodeURIComponent(p)}`;
}

function formatDuration(seconds) {
    const n = parseInt(seconds, 10) || 0;
    if (!n) return '';
    let m = Math.floor(n / 60);
    const s = n % 60;
    const h = Math.floor(m / 60);
    m %= 60;
    if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function mapVideoItem(item) {
    const vUrl = item.videoUrl || '';
    return {
        vod_id: `video@@${item.id}@@${vUrl}@@${item.title || ''}@@${item.coverUrl || ''}`,
        vod_name: item.title || '',
        vod_pic: formatCover(item.coverUrl || ''),
        vod_remarks: formatDuration(item.durationSec) || item.categoryName || '',
    };
}

async function init(inReq) {
    host = DEFAULT_HOST;
    const ext = String(inReq?.body?.extend || '').trim();
    if (ext.startsWith('http')) {
        host = ext.replace(/\/+$/, '');
    } else if (ext.startsWith('{')) {
        try {
            const cfg = JSON.parse(ext);
            if (cfg.host) host = String(cfg.host).replace(/\/+$/, '');
        } catch {
            /* keep default */
        }
    }
    return {};
}

async function home() {
    const classes = [{ type_id: SHORT_DRAMA_TID, type_name: '🔥 AI短剧' }];
    const res = await fetchJson(`${host}${API_CATEGORIES}`);
    if (res.code === 200 && Array.isArray(res.data)) {
        for (const cat of res.data) {
            if (cat.enabled === false) continue;
            classes.push({
                type_id: String(cat.id),
                type_name: cat.name || '未知分类',
            });
        }
    }
    return { class: classes, filters: {}, list: [] };
}

async function category(inReq) {
    const page = parseInt(inReq.body.page || inReq.body.pg, 10) || 1;
    const tid = String(inReq.body.id || inReq.body.tid || '');
    let videos = [];
    let pagecount = page;
    let total = 0;
    let limit = 24;

    if (tid === SHORT_DRAMA_TID) {
        limit = 12;
        const res = await fetchJson(
            `${host}${API_SHORT_DRAMAS}?productId=1&sortBy=heat&page=${page}&size=12`,
        );
        if (res.code === 200) {
            const data = res.data || {};
            pagecount = data.totalPages || page;
            total = data.total || 0;
            for (const item of data.items || []) {
                const epCnt = item.episodeCount ?? 1;
                const rating = item.rating ?? 0;
                videos.push({
                    vod_id: `drama@@${item.id}@@${item.title || ''}@@${item.coverUrl || ''}`,
                    vod_name: item.title || '',
                    vod_pic: formatCover(item.coverUrl || ''),
                    vod_remarks: `评分:${rating} | 共${epCnt}集`,
                });
            }
        }
    } else {
        const res = await fetchJson(`${host}${API_VIDEOS}?page=${page}&size=24&categoryId=${encodeURIComponent(tid)}`);
        if (res.code === 200) {
            const data = res.data || {};
            pagecount = data.totalPages || page;
            total = data.total || 0;
            videos = (data.items || []).map(mapVideoItem);
        }
    }

    return {
        list: videos,
        page,
        pagecount,
        limit,
        total,
    };
}

async function detail(inReq) {
    let vodId = inReq.body.id;
    if (Array.isArray(vodId)) vodId = vodId[0];
    vodId = String(vodId || '');

    let title = '在线播放';
    let cover = '';
    let fromName = '专线播放';
    let playUrlStr = '暂无播放地址$error';

    if (vodId.includes('@@')) {
        const parts = vodId.split('@@');
        const vtype = parts[0];
        if (vtype === 'drama') {
            const dramaId = parts[1];
            title = parts[2] || '短剧详情';
            cover = parts[3] || '';
            const res = await fetchJson(`${host}${API_SHORT_DRAMA_DETAIL(dramaId)}`);
            const episodes = [];
            if (res.code === 200 && res.data && typeof res.data === 'object') {
                const dramaData = res.data;
                title = dramaData.title || title;
                cover = dramaData.coverUrl || cover;
                for (const ep of dramaData.episodes || []) {
                    const epNo = ep.episodeNo ?? 1;
                    const raw = ep.videoUrl || '';
                    if (!raw) continue;
                    episodes.push(`第${epNo}集$${formatPlayUrl(raw)}`);
                }
            }
            playUrlStr = episodes.length ? episodes.join('#') : '暂无分集数据$error';
            fromName = 'AI短剧专线';
        } else {
            const videoUrl = parts[2] || '';
            title = parts[3] || '视频详情';
            cover = parts[4] || '';
            const playStream = formatPlayUrl(videoUrl);
            playUrlStr = playStream ? `正片$${playStream}` : '暂无播放地址$error';
            fromName = '专线播放';
        }
    }

    return {
        list: [{
            vod_id: vodId,
            vod_name: title,
            vod_pic: formatCover(cover),
            vod_play_from: fromName,
            vod_play_url: playUrlStr,
        }],
    };
}

async function search(inReq) {
    const page = parseInt(inReq.body.pg || inReq.body.page, 10) || 1;
    const key = String(inReq.body.wd || inReq.body.key || '');
    const res = await fetchJson(
        `${host}${API_SEARCH}?page=${page}&size=24&q=${encodeURIComponent(key)}`,
    );
    let videos = [];
    let pagecount = page;
    let total = 0;
    if (res.code === 200) {
        const data = res.data || {};
        pagecount = data.totalPages || page;
        total = data.total || 0;
        videos = (data.items || []).map(mapVideoItem);
    }
    return {
        list: videos,
        page,
        pagecount,
        limit: 24,
        total,
    };
}

async function play(inReq) {
    let id = String(inReq.body.id || '').trim();
    if (id.includes('$')) id = id.split('$').pop().trim();
    return {
        parse: 0,
        url: id,
        header: playHdr(),
    };
}

export default {
    meta: {
        key: 'mdcmai',
        name: '📖2048短剧',
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
