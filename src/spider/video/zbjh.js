import axios from 'axios';

const host = 'https://zh.stripchat.com/';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0',
};

// ─── API 处理函数 ──────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_name: '女主播', type_id: 'girls'   },
        { type_name: '情侣',   type_id: 'couples' },
        { type_name: '男主播', type_id: 'men'     },
        { type_name: '跨性别', type_id: 'trans'   },
    ];

    const value = [
        { n: '中国',   v: 'tagLanguageChinese'     },
        { n: '亚洲',   v: 'ethnicityAsian'         },
        { n: '白人',   v: 'ethnicityWhite'         },
        { n: '拉丁',   v: 'ethnicityLatino'        },
        { n: '混血',   v: 'ethnicityMultiracial'   },
        { n: '印度',   v: 'ethnicityIndian'        },
        { n: '阿拉伯', v: 'ethnicityMiddleEastern' },
        { n: '黑人',   v: 'ethnicityEbony'         },
    ];
    const value_gay = [
        { n: '情侣', v: 'sexGayCouples'       },
        { n: '直男', v: 'orientationStraight' },
    ];

    const filters = {};
    for (const tid of ['girls', 'couples', 'men', 'trans']) {
        const c_value = tid === 'men' ? [...value, ...value_gay] : [...value];
        filters[tid] = [{ key: 'tag', value: c_value }];
    }

    return { class: classes, filters };
}

async function category(inReq, _outResp) {
    const tid    = inReq.body.id;
    const pg     = parseInt(inReq.body.page) || 1;
    const extend = inReq.body.extend || {};
    const limit  = 60;
    const offset = limit * (pg - 1);

    let url = `${host}api/front/models?improveTs=false&removeShows=false&limit=${limit}&offset=${offset}&primaryTag=${tid}&sortBy=viewersRating&rcmGrp=A&rbCnGr=true&prxCnGr=false&nic=false`;
    if (extend.tag) url += `&filterGroupTags=%5B%5B%22${extend.tag}%22%5D%5D`;

    const rsp      = (await axios.get(url, { headers: HEADERS, timeout: 10000 })).data;
    const vodList  = rsp.models || [];
    const videos   = vodList.map(vod => ({
        vod_id:      String(vod.username).trim(),
        vod_name:    String(vod.username).trim(),
        vod_pic:     `https://img.doppiocdn.net/thumbs/${vod.snapshotTimestamp}/${vod.id}`,
        vod_remarks: vod.groupShowType ? '购票表演中' : '',
    }));
    const total = parseInt(rsp.filteredCount || 0);

    return {
        list:      videos,
        page:      pg,
        pagecount: Math.ceil(total / limit),
        limit,
        total,
    };
}

async function detail(inReq, _outResp) {
    const username = inReq.body.id;
    const rsp      = (await axios.get(`${host}api/front/v2/models/username/${username}/cam`, { headers: HEADERS, timeout: 10000 })).data;
    const info     = rsp.cam;
    const user     = rsp.user.user;
    const id       = String(user.id);

    return {
        list: [{
            vod_id:        id,
            vod_name:      String(info.topic).trim(),
            vod_pic:       String(user.avatarUrl),
            vod_director:  username,
            vod_area:      String(user.country),
            vod_play_from: '老僧酿酒',
            vod_play_url:  `${id}$${id}`,
        }],
    };
}

async function play(inReq, _outResp) {
    const id      = inReq.body.id;
    const m3u8Url = `https://edge-hls.doppiocdn.net/hls/${id}/master/${id}_auto.m3u8?playlistType=lowLatency`;

    const resp  = await axios.get(m3u8Url, { headers: HEADERS, timeout: 10000, responseType: 'text' });
    const lines = resp.data.trim().split('\n');

    let psch = '', pkey = '';
    const url = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('#EXT-X-MOUFLON:')) {
            const parts = line.split(':');
            if (parts.length >= 4) {
                psch = parts[2];
                pkey = parts[3];
            }
        }
        if (line.includes('#EXT-X-STREAM-INF')) {
            const nameMatch = line.match(/NAME="([^"]+)"/);
            const qn        = nameMatch ? nameMatch[1] : '';
            const urlBase   = lines[i + 1] || '';
            const fullUrl   = `${urlBase}&psch=${psch}&pkey=${pkey}`;
            url.push(qn, fullUrl);
        }
    }

    return { url, parse: '0', contentType: '', header: HEADERS };
}

async function search(_inReq, _outResp) {
    return { list: [] };
}

// ─── 导出 ──────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'stripchat',
        name: 'Stripchat',
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