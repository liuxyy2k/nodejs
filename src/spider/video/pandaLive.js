import axios from 'axios';

const site = 'https://5721004.xyz';

const http = axios.create({
    timeout: 10_000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer:      'https://www.pandalive.co.kr/',
        Origin:       'https://www.pandalive.co.kr',
    },
});

const PROXIES = [
    'https://hubu.515355.xyz/proxy/?',
    'https://flank.515355.xyz/proxy/',
    'https://uae2.515355.xyz/proxy/',
    'https://pol.515355.xyz/proxy/',
    'https://f00.515355.xyz/proxy/',
    'https://ce2.515355.xyz/proxy/?',
];

const DEFAULT_PIC = 'https://tupian.li/images/2024/03/30/660769b1ba623.png';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchJsonData() {
    try {
        const { data } = await http.get(`${site}/player/list.json`);
        return (data.list || []).map((item) => {
            const userId  = item.userId  || '';
            const nick    = item.userNick || '未知主播';
            const isAdult = item.isAdult  || false;
            const isPw    = item.isPw     || false;
            const vType   = item.type     || '';
            return {
                vod_id:      `live_${userId}`,
                vod_name:    `📺 ${nick}`,
                vod_pic:     item.thumbUrl || DEFAULT_PIC,
                vod_remarks: `👤 ${item.user || 0} ${isAdult ? '🔞' : ''}`,
                vod_content: item.title || '無標題',
                vod_actor:   userId,
                _isAdult:    isAdult,
                _isPw:       isPw,
                _type:       vType,
                _user_count: item.user          || 0,
                _score:      item.totalScoreCnt || 0,
                _bookmark:   item.bookmarkCnt   || 0,
            };
        });
    } catch {
        return [];
    }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    let list = [];
    try {
        const all = await fetchJsonData();
        list = all.slice(0, 30);
    } catch { /* ignore */ }

    return {
        class: [
            { type_id: 'pandalive', type_name: '🐼 PandaTV' },
        ],
        filters: {
            pandalive: [
                {
                    key: 'type', name: '類型', value: [
                        { n: '全部',     v: 'all'   },
                        { n: '🔞 19+',  v: 'adult' },
                        { n: '🔐 密碼房', v: 'pw'   },
                        { n: '💎 粉絲房', v: 'fan'  },
                    ],
                },
                {
                    key: 'sort', name: '排序', value: [
                        { n: '觀眾量 ↓',    v: 'user-desc'           },
                        { n: '實時熱度 ↓',  v: 'totalScoreCnt-desc'  },
                        { n: '關注量 ↓',    v: 'bookmarkCnt-desc'    },
                    ],
                },
            ],
        },
        list,
    };
}

async function category(inReq, _outResp) {
    const extend = inReq.body.extend || {};
    const pg     = parseInt(inReq.body.page) || 1;
    const limit  = 30;

    let filtered = await fetchJsonData();

    // 篩選
    const fType = extend.type || 'all';
    if      (fType === 'adult') filtered = filtered.filter((v) => v._isAdult);
    else if (fType === 'pw')    filtered = filtered.filter((v) => v._isPw);
    else if (fType === 'fan')   filtered = filtered.filter((v) => v._type === 'fan');

    // 排序
    const sortType = extend.sort || 'user-desc';
    if      (sortType === 'user-desc')           filtered.sort((a, b) => b._user_count - a._user_count);
    else if (sortType === 'totalScoreCnt-desc')  filtered.sort((a, b) => b._score     - a._score);
    else if (sortType === 'bookmarkCnt-desc')    filtered.sort((a, b) => b._bookmark  - a._bookmark);

    // 分頁
    const start    = (pg - 1) * limit;
    const pageList = filtered.slice(start, start + limit);

    return {
        page:      pg,
        pagecount: Math.max(1, Math.ceil(filtered.length / limit)),
        limit,
        total:     filtered.length,
        list:      pageList,
    };
}

async function detail(inReq, _outResp) {
    const rawId  = Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id;
    const userId = rawId.replace('live_', '');

    let streamUrl = '';
    try {
        const { data: m3uText } = await http.get(`${site}/player/list.m3u`);
        const lines = m3uText.split('\n');

        // 精確匹配
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(`,${userId},`) && i + 1 < lines.length) {
                streamUrl = lines[i + 1].trim();
                break;
            }
        }
        // 模糊匹配
        if (!streamUrl) {
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes(userId) && i + 1 < lines.length) {
                    streamUrl = lines[i + 1].trim();
                    break;
                }
            }
        }
    } catch { /* ignore */ }

    const playLinks = [
        `直連$${streamUrl}`,
        ...PROXIES.map((p, i) => `代理${i + 1}$${p}${streamUrl}`),
    ];

    return {
        list: [{
            vod_id:        rawId,
            vod_name:      `PandaTV - ${userId}`,
            vod_pic:       DEFAULT_PIC,
            vod_content:   `主播: ${userId}`,
            vod_play_from: 'PandaLive',
            vod_play_url:  playLinks.join('#'),
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse:  0,
        url:    inReq.body.id,
        header: http.defaults.headers,
    };
}

async function search(inReq, _outResp) {
    const key  = (inReq.body.wd || '').toLowerCase();
    const pg   = parseInt(inReq.body.pg) || 1;
    const all  = await fetchJsonData();
    const list = all
        .filter((v) => v.vod_name.toLowerCase().includes(key) || v.vod_actor.toLowerCase().includes(key))
        .slice(0, 50);
    return { list, page: pg };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'pandalive2',
        name: '🔥熊猫直播',
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