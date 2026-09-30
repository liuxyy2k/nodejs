import axios from 'axios';

const API_BASE = 'https://jinguoduanju.me';
const TOKEN = 'zlZy0xsTLhDBPCrJ8tpzNazlrrkEBpoPcuIHCnjCwiU';
const DEFAULT_NAV = '2';
const PAGE_SIZE = 20;

const HEADERS = {
    Accept: 'application/json',
    Authorization: `Bearer ${TOKEN}`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

const CLASSES = [
    { type_id: '2', type_name: '全部' },
    { type_id: 'latest', type_name: '最新上线'},
    { type_id: 'heat', type_name: '热度排行'},
    { type_id: 'landing', type_name: '精选推荐'},
    { type_id: '7', type_name: '原创精品' },
    { type_id: '3', type_name: '单体作品' },
    { type_id: '6', type_name: '动漫改编' },
    { type_id: '5', type_name: '影视改编' },
];

const http = axios.create({
    timeout: 20000,
    headers: HEADERS,
    validateStatus: () => true,
});

async function api(path) {
    const resp = await http.get(`${API_BASE}${path}`);
    if (resp.status !== 200) {
        throw new Error(`API ${path} -> ${resp.status}`);
    }
    return resp.data;
}

function absCover(url) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    return `${API_BASE}${url.startsWith('/') ? url : `/${url}`}`;
}

function formatDrama(d) {
    const group = (d.tags && d.tags[0]) || '短剧';
    return {
        vod_id: String(d.id),
        vod_name: d.title || `drama-${d.id}`,
        vod_pic: absCover(d.coverUrl),
        vod_remarks: group,
    };
}

async function listDramas(navId = DEFAULT_NAV) {
    const data = await api(`/api/v1/dramas?sort=latest&navigationId=${navId}`);
    return Array.isArray(data) ? data : (data?.items || data?.list || []);
}

async function getDramaDetail(dramaId) {
    const data = await api(`/api/v1/dramas/${dramaId}`);
    const drama = data?.drama || data || {};
    const episodes = data?.episodes || drama?.episodes || [];
    return { drama, episodes };
}

async function resolvePlayUrl(dramaId, epNumber) {
    const { episodes } = await getDramaDetail(dramaId);
    if (!episodes.length) throw new Error('No episodes');
    let target = episodes[0];
    if (epNumber) {
        target = episodes.find((e) => String(e.number) === String(epNumber)) || target;
    }
    const play = await api(`/api/v1/episodes/${target.id}/play`);
    if (!play?.videoUrl) throw new Error('No videoUrl');
    return play.videoUrl;
}

function getRequestBase(inReq) {
    const proto = inReq.headers['x-forwarded-proto'];
    const scheme = proto
        ? String(proto).split(',')[0].trim()
        : (inReq.socket?.encrypted ? 'https' : 'http');
    return `${scheme}://${inReq.headers.host}`;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    return { class: CLASSES, filters: {}, list: [] };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || DEFAULT_NAV);
    const page = parseInt(inReq.body.page, 10) || 1;
    const all = await listDramas(tid);
    const start = (page - 1) * PAGE_SIZE;
    const list = all.slice(start, start + PAGE_SIZE).map(formatDrama);
    return {
        page,
        pagecount: Math.max(1, Math.ceil(all.length / PAGE_SIZE)),
        limit: PAGE_SIZE,
        total: all.length,
        list,
    };
}

async function detail(inReq, _outResp) {
    const dramaId = String(inReq.body.id || '');
    const { drama, episodes } = await getDramaDetail(dramaId);
    const lines = episodes.map((e) => {
        const name = e.title || `第${e.number}集`;
        return `${name}$${e.id}`;
    });
    return {
        list: [{
            vod_id: dramaId,
            vod_name: drama.title || dramaId,
            vod_pic: absCover(drama.coverUrl),
            vod_content: drama.description || '',
            vod_remarks: `${episodes.length}集`,
            vod_play_from: '金果短剧',
            vod_play_url: lines.join('#'),
        }],
    };
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    const playData = await api(`/api/v1/episodes/${id}/play`);
    return {
        parse: 0,
        url: playData.videoUrl,
        header: HEADERS,
    };
}

async function search(inReq, _outResp) {
    const key = String(inReq.body.wd || '').trim().toLowerCase();
    if (!key) return { list: [] };
    const all = await listDramas(DEFAULT_NAV);
    const list = all
        .filter((d) => String(d.title || '').toLowerCase().includes(key))
        .slice(0, 50)
        .map(formatDrama);
    return { list };
}

async function liveM3u(inReq, outResp) {
    const origin = getRequestBase(inReq);
    const prefix = inReq.server?.prefix || '/spider/jinguo/3';
    const dramas = await listDramas(DEFAULT_NAV);
    let m3u = '#EXTM3U\n';
    for (const d of dramas) {
        const logo = absCover(d.coverUrl);
        const group = (d.tags && d.tags[0]) || '短剧';
        const name = String(d.title || `drama-${d.id}`).replace(/[\r\n,]/g, ' ');
        m3u += `#EXTINF:-1 tvg-id="${d.id}" tvg-logo="${logo}" group-title="${group}",${name}\n`;
        m3u += `${origin}${prefix}/proxy_play?vid=${encodeURIComponent(d.id)}\n`;
    }
    return outResp
        .header('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8')
        .header('Access-Control-Allow-Origin', '*')
        .header('Cache-Control', 'public, max-age=300')
        .send(m3u);
}

async function proxyPlay(inReq, outResp) {
    const dramaId = inReq.query?.vid;
    const ep = inReq.query?.ep;
    if (!dramaId) return outResp.code(400).send('Missing vid');
    try {
        const url = await resolvePlayUrl(dramaId, ep);
        return outResp.redirect(url);
    } catch (e) {
        return outResp.code(404).send(String(e.message || e));
    }
}

async function playAll(inReq, outResp) {
    const dramaId = String(inReq.params?.id || '');
    const origin = getRequestBase(inReq);
    const prefix = inReq.server?.prefix || '/spider/jinguo/3';
    const { drama, episodes } = await getDramaDetail(dramaId);
    let m3u = '#EXTM3U\n';
    for (const e of episodes) {
        const name = `${drama.title || dramaId} - ${e.title || e.number}`.replace(/[\r\n,]/g, ' ');
        m3u += `#EXTINF:-1,${name}\n`;
        m3u += `${origin}${prefix}/proxy_play?vid=${encodeURIComponent(dramaId)}&ep=${encodeURIComponent(e.number)}\n`;
    }
    return outResp
        .header('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8')
        .header('Access-Control-Allow-Origin', '*')
        .send(m3u);
}

export default {
    meta: {
        key: 'jinguo',
        name: '📖禁果短剧',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/live.m3u', liveM3u);
        fastify.get('/proxy_play', proxyPlay);
        fastify.get('/playall/:id', playAll);
    },
};
