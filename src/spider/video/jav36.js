import axios from 'axios';

const site = 'https://jav36.com';
const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const http = axios.create({
    timeout: 15_000,
    headers: { 'User-Agent': UA },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseList(html) {
    const re   = /href="https:\/\/jav36\.com\/videos\/(?<id_path>\d+\/(?<id>[^/]+)\/)"\s+title="(?<name>[^"]+)".*?data-original="(?<pic>[^"]+)"/gs;
    const list = [];
    for (const m of html.matchAll(re)) {
        list.push({
            vod_id:      m.groups.id_path,
            vod_name:    m.groups.name.trim(),
            vod_pic:     m.groups.pic,
            vod_remarks: 'Full HD',
        });
    }
    return list;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    let list = [];
    try {
        const { data } = await http.get(`${site}/latest-updates/`);
        list = parseList(data);
    } catch { /* ignore */ }

    return {
        class: [
            { type_id: 'latest-updates/', type_name: '最新更新' },
            { type_id: 'tags/4k/',        type_name: '4K高清'   },
        ],
        list,
        filters: {},
    };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg  = parseInt(inReq.body.page) || 1;
    const url = pg > 1 ? `${site}/${tid}${pg}/` : `${site}/${tid}`;

    try {
        const { data } = await http.get(url);
        return { list: parseList(data) };
    } catch {
        return { list: [] };
    }
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    return {
        list: [{
            vod_id:        id,
            vod_name:      'Video',
            vod_play_from: 'Direct',
            vod_play_url:  `Play$${id}`,
        }],
    };
}

async function play(inReq, _outResp) {
    const id  = inReq.body.id;
    const url = `${site}/videos/${id}`;

    try {
        const { data } = await http.get(url);
        const m = data.match(/"contentUrl"\s*:\s*"([^"]+)"/);
        if (m) {
            return {
                parse:  0,
                url:    m[1],
                header: { 'User-Agent': UA, Referer: `${site}/` },
            };
        }
    } catch { /* ignore */ }

    return { parse: 0, url };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg  = parseInt(inReq.body.pg) || 1;
    const url = pg > 1 ? `${site}/search/${key}/${pg}/` : `${site}/search/${key}/`;

    try {
        const { data } = await http.get(url);
        return { list: parseList(data) };
    } catch {
        return { list: [] };
    }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'jav36',
        name: '🔥JAV36',
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