import axios from 'axios';

const UA  = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const api = 'https://avdbapi.com/api.php/provide/vod';

// ─── HTTP Client ──────────────────────────────────────────────────────────────

const http = axios.create({ timeout: 15_000 });

async function get(url, extraHeaders = {}) {
    const { data } = await http.get(url, {
        headers: { 'User-Agent': UA, ...extraHeaders },
    });
    return data;
}

// ─── List Formatter ───────────────────────────────────────────────────────────

function formatList(list) {
    return (list || []).map((v) => ({
        vod_id:      String(v.id),
        vod_name:    v.name,
        vod_pic:     v.poster_url,
        vod_remarks: v.tag,
        vod_pubdate: v.created_at,
        vod_duration: v.time,
    }));
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const data = await get(api);
    const classes = (data?.class || []).map((r) => ({
        type_id:   r.type_id,
        type_name: r.type_name,
    }));
    return { class: classes, list: [], filters: {} };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    let   pg   = parseInt(inReq.body.page) || 1;
    if (pg === 0) pg = 1;

    const data = await get(`${api}?t=${tid}&ac=detail&pg=${pg}`);
    const list = formatList(data?.list);

    return { page: pg, pagecount: list.length < 20 ? pg : pg + 1, list, filter: [] };
}

async function detail(inReq, _outResp) {
    const id   = inReq.body.id;
    const data = await get(`${api}?ac=detail&ids=${id}`);
    const item = data?.list?.[0];

    let playUrl = '';
    if (item?.episodes) {
        const embedUrl = item.episodes.server_data.Full.link_embed;
        console.log('embedUrl:', embedUrl);

        const html  = await get(embedUrl, { Referer: 'https://avdbapi.com/' });
        const match = html.match(/m3u8\s*:\s*"((\/play\/token_hash\?hash=[^"]+))"/);
        const path  = match?.[1] ?? null;
        if (path) playUrl = new URL(embedUrl).origin + path;
    }

    return {
        list: [{
            vod_id:        id,
            vod_name:      item?.name     || '',
            vod_pic:       item?.poster_url || '',
            vod_play_from: 'Avdb',
            vod_play_url:  `播放$${playUrl}`,
        }],
    };
}

async function play(inReq, _outResp) {
    const url    = inReq.body.id;
    const origin = new URL(url).origin;
    return {
        parse:  0,
        url,
        header: { 'User-Agent': UA, Referer: `${origin}/` },
    };
}

async function search(inReq, _outResp) {
    const wd  = encodeURIComponent(inReq.body.wd || '');
    let   pg  = parseInt(inReq.body.page) || 1;
    if (pg === 0) pg = 1;

    const data = await get(`${api}?ac=detail&wd=${wd}&pg=${pg}`);
    const list = formatList(data?.list);

    return { page: pg, pagecount: list.length < 20 ? pg : pg + 1, list };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'avdb',
        name: '🔥Avdb',
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