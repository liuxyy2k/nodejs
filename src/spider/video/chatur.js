import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const site = 'https://chaturbate.com';

// ─── HTTP Client ──────────────────────────────────────────────────────────────

const http = axios.create({
    timeout: 10_000,
    headers: { 'User-Agent': UA }
});

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
    const classes = [
            { type_id: '', type_name: '精选' },
            { type_id: 'f', type_name: '女性' },
            { type_id: 'm', type_name: '男士' },
            { type_id: 'c', type_name: '情侣' },
            { type_id: 't', type_name: '跨性别' },
    ];
    let filterObj = {
        '': [
            {
                key: 'reg',
                name: '地区',
                value: [
                    { n: '亚洲',   v: 'AS' },
                    { n: '北美',   v: 'NA' },
                    { n: '南美',   v: 'SA' },
                    { n: '欧洲',   v: 'ER' },
                    { n: '其他',   v: 'O' }     
                ]
            }
        ],
        'f': [
            {
                key: 'reg',
                name: '地区',
                value: [
                    { n: '亚洲',   v: 'AS' },
                    { n: '北美',   v: 'NA' },
                    { n: '南美',   v: 'SA' },
                    { n: '欧洲',   v: 'ER' },
                    { n: '其他',   v: 'O' }     
                ]
            }
        ],
        'm': [
            {
                key: 'reg',
                name: '地区',
                value: [
                    { n: '亚洲',   v: 'AS' },
                    { n: '北美',   v: 'NA' },
                    { n: '南美',   v: 'SA' },
                    { n: '欧洲',   v: 'ER' },
                    { n: '其他',   v: 'O' }     
                ]
            }
        ],
        'c': [
            {
                key: 'reg',
                name: '地区',
                value: [
                    { n: '亚洲',   v: 'AS' },
                    { n: '北美',   v: 'NA' },
                    { n: '南美',   v: 'SA' },
                    { n: '欧洲',   v: 'ER' },
                    { n: '其他',   v: 'O' }     
                ]
            }
        ],
        't': [
            {
                key: 'reg',
                name: '地区',
                value: [
                    { n: '亚洲',   v: 'AS' },
                    { n: '北美',   v: 'NA' },
                    { n: '南美',   v: 'SA' },
                    { n: '欧洲',   v: 'ER' },
                    { n: '其他',   v: 'O' }     
                ]
            }
        ],
    }
    return {
        class: classes,
        filters: filterObj
    };
}

async function category(inReq, _outResp) {
    const tid    = inReq.body.id;
    const pg     = parseInt(inReq.body.page) || 0;
    const gender = { f: 'f', m: 'm', c: 'c', t: 't' }[tid] ?? '';
    let ext = inReq.body.filters;
    if (typeof ext === 'string') {
        try {
            ext = JSON.parse(filters)
        } catch (e) {
            ext = {}
        }
    }
    ext = ext || {}
    let reg = ext?.reg || ''
    let param = {
            enable_recommendations: false,
            genders: gender,
            limit:   90,
            offset:  (pg-1) * 90,
            regions: reg
    }
    if(tid === '') {
        param = {
            enable_recommendations: false,
            limit:   90,
            offset:  (pg-1) * 90,
            regions: reg
        }
    }
    
    const { data } = await http.get(`${site}/api/ts/roomlist/room-list/`, {
        params: param
    });

    const total = data.total_count || 0;
    const list  = (data.rooms || []).map(formatRoom);

    return {
        page:      pg + 1,
        pagecount: Math.ceil(total / 90),
        limit:     90,
        total,
        list,
    };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    return {
        list: [{
            vod_id:        id,
            vod_name:      `Chaturbate - ${id}`,
            vod_pic:       '',
            vod_play_from: 'Chaturbate',
            vod_play_url:  `直播源$${id}`,
        }],
    };
}

async function play(inReq, _outResp) {
    const id = inReq.body.id;

    let playUrl = id;
    try {
        const { data } = await http.post(
            `${site}/get_edge_hls_url_ajax/`,
            new URLSearchParams({ room_slug: id }),
            { headers: { 'X-Requested-With': 'XMLHttpRequest' } }
        );
        playUrl = data.url || id;
        const resm3U8 = await axios.get(playUrl, {
            headers: {
                "User-Agent": UA,
                Referer: site + '/',
            },
        });

        const lines = resm3U8.data.split('\n')
        let best = {
            height: 0,
            url: ''
        };
    
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.includes('#EXT-X-STREAM-INF')) {
                const m = line.match(/RESOLUTION=\d+x(\d+)/);
                if (m) {
                    const height = parseInt(m[1]);
                    const url = lines[i + 1]?.trim();
                    if (url && height > best.height) {
                        best.height = height;
                        best.url = url;
                    }
                }
            }
        }
        playUrl = new URL(best.url, playUrl).href;
    } catch {
        playUrl = id;
    }

    return {
        parse:  0,
        url:    playUrl,
        header: { 'X-Requested-With': 'XMLHttpRequest','Referer': site+ '/','User-Agent': UA },
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
        key:  'chaturbate',
        name: 'Chaturbate',
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