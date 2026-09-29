import axios from 'axios';

const site = 'https://zh.stripol.com/';

const http = axios.create({
    timeout: 15_000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0',
    },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ETHNICITY = [
    { n: '中国', v: 'tagLanguageChinese'    },
    { n: '亚洲', v: 'ethnicityAsian'        },
    { n: '白人', v: 'ethnicityWhite'        },
    { n: '拉丁', v: 'ethnicityLatino'       },
    { n: '混血', v: 'ethnicityMultiracial'  },
    { n: '印度', v: 'ethnicityIndian'       },
    { n: '阿拉伯', v: 'ethnicityMiddleEastern' },
    { n: '黑人', v: 'ethnicityEbony'        },
];

const EXTRA_MEN = [
    { n: '情侣', v: 'sexGayCouples'         },
    { n: '直男', v: 'orientationStraight'   },
];

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: 'girls',   type_name: '女主播'  },
        { type_id: 'couples', type_name: '情侣'    },
        { type_id: 'men',     type_name: '男主播'  },
        { type_id: 'trans',   type_name: '跨性别'  },
    ];

    const filters = {};
    for (const { type_id: tid } of classes) {
        const value = tid === 'men' ? [...ETHNICITY, ...EXTRA_MEN] : [...ETHNICITY];
        filters[tid] = [{ key: 'tag', value }];
    }

    return { class: classes, filters, list: [] };
}

async function category(inReq, _outResp) {
    const tid    = inReq.body.id;
    const pg     = parseInt(inReq.body.page) || 1;
    const extend = inReq.body.extend || {};
    const limit  = 60;
    const offset = limit * (pg - 1);

    let url = `${site}api/front/models?improveTs=false&removeShows=false&limit=${limit}&offset=${offset}&primaryTag=${tid}&sortBy=viewersRating&rcmGrp=A&rbCnGr=true&prxCnGr=false&nic=false`;
    if (extend.tag) url += `&filterGroupTags=%5B%5B%22${extend.tag}%22%5D%5D`;

    const { data } = await http.get(url);
    const total   = parseInt(data.filteredCount) || 0;

    const list = (data.models || []).map((vod) => ({
        vod_id:      String(vod.username),
        vod_name:    String(vod.username).trim(),
        vod_pic:     `https://img.doppiocdn.net/thumbs/${vod.snapshotTimestamp}/${vod.id}`,
        vod_remarks: vod.groupShowType ? '购票表演中' : '',
    }));

    return {
        page:      pg,
        pagecount: Math.ceil(total / limit),
        limit,
        total,
        list,
    };
}

async function detail(inReq, _outResp) {
    const username = inReq.body.id;
    const { data } = await http.get(`${site}api/front/v2/models/username/${username}/cam`);

    const info = data.cam;
    const user = data.user.user;
    const id   = String(user.id);

    return {
        list: [{
            vod_id:        id,
            vod_name:      String(info.topic).trim(),
            vod_pic:       String(user.avatarUrl),
            vod_director:  username,
            vod_area:      String(user.country),
            vod_play_from: '直播线路',
            vod_play_url:  `${id}$${id}`,
        }],
    };
}

async function play(inReq, _outResp) {
    const id  = inReq.body.id;
    const m3u = `https://edge-hls.growcdnssedge.com/hls/${id}/master/${id}_auto.m3u8?playlistType=lowLatency`;

    const { data: m3uText } = await http.get(m3u);
    const lines = m3uText.trim().split('\n');

    let psch = '', pkey = '';
    const urlList = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('#EXT-X-MOUFLON:')) {
            const parts = line.split(':');
            if (parts.length >= 4) { psch = parts[2]; pkey = parts[3]; }
        }

        if (line.includes('#EXT-X-STREAM-INF')) {
            const nameStart = line.indexOf('NAME="') + 6;
            const nameEnd   = line.indexOf('"', nameStart);
            const qn        = line.slice(nameStart, nameEnd);
            const urlBase   = lines[i + 1] || '';
            const fullUrl   = `${urlBase}&psch=${psch}&pkey=${pkey}`;
            urlList.push(qn, fullUrl);
        }
    }

    return {
        parse:       0,
        url:         urlList,
        contentType: '',
        header:      http.defaults.headers,
    };
}

async function search(_inReq, _outResp) {
    return { list: [] };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'stripol',
        name: '🔴Stripol直播',
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