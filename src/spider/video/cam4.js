import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const site = 'https://zh.cam4.com';

const headers = {
    'Referer':  site + '/',
    'Origin':   site,
    'User-Agent': UA,
};

async function request(reqUrl) {
    await ensureCookie();
    const resp = await axios.get(reqUrl, {
        headers: headers
    });
    return resp.data;
}

async function ensureCookie() {
    if (headers['Cookie']) return;
    try {
        const resp = await axios.get(site + '/', { headers, maxRedirects: 5 });
        const setCookie = resp.headers['set-cookie'];
        if (setCookie && setCookie[0]) {
            headers['Cookie'] = setCookie[0].split(';')[0];
        }
    } catch (e) {
        const setCookie = e.response?.headers?.['set-cookie'];
        if (setCookie && setCookie[0]) {
            headers['Cookie'] = setCookie[0].split(';')[0];
        }
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRoom(r) {
    const age = r.display_age ? ` (${r.display_age})` : '';
    return {
        vod_id:      r.username,
        vod_name:    `${r.username}${age}`,
        vod_pic:     r.img || '',
        vod_remarks: r.num_users,
    };
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    return {
        class: [
            { type_id: 'female',        type_name: '女性' },
            { type_id: 'male',          type_name: '男性' },
            { type_id: 'transgender',   type_name: '横向' },
            { type_id: 'couple',        type_name: '夫妇' },
            { type_id: 'all',           type_name: '全部' },
        ],
        filters: {},
    };
}

async function category(inReq, _outResp) {
    const tid    = inReq.body.id;
    const pg     = parseInt(inReq.body.page) || 0;
    let url = `${site}/${tid}?page=${pg}`
    const html = await request(url);
    const match = html.match(/window\.apolloState\s*=\s*({[\s\S]*?});/);
    const videos = []
    if (match) {
        const jsonStr = match[1];
        const data = JSON.parse(jsonStr);
        const list = Object.keys(data)
            .filter(k => k.startsWith("BroadcastItem:"))
            .map(k => data[k]);
        for (const item of list) {
            if (item.preview) {
                videos.push({
                    vod_id: item.preview.src + '|' + item.username,
                    vod_name: item.username,
                    vod_pic: item.profileImageURL,
                    vod_remarks: item.viewers + '浏览',
                })
            }
        }
    }
    return { page: pg, list: videos };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    return {
        list: [{
            vod_id:        id.split('|')[0],
            vod_name:      id.split('|')[1],
            vod_pic:       '',
            vod_play_from: 'Cms4',
            vod_play_url:  `直播源$${id.split('|')[0]}`,
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: { 'User-Agent': UA,'Referer': site + '/'},
    };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg  = parseInt(inReq.body.pg) || 0;

    const { data } = await http.get(`${site}/api/ts/roomlist/room-list/`, {
        params: {
            enable_recommendations: false,
            limit:  90,
            offset: pg * 90,
            query:  key,
        },
    });

    const list = (data.rooms || []).map(formatRoom);
    return { list };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'cms4',
        name: '🔥Cms4Live',
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