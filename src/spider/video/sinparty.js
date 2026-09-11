import axios from 'axios';

const CONFIG_MODE = 'filter';

const HOST = 'https://sinparty.com';
const API_HOST = 'https://api.sinparty.com';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const HEADERS = {
    'User-Agent': UA,
    Accept: 'application/json, text/plain, */*',
    Referer: `${HOST}/`,
    Origin: HOST,
};

const NATIVE_CATEGORIES = [
    { type_id: 'all', type_name: '✨ 精选' },
    { type_id: 'girls', type_name: '👩 女生' },
    { type_id: 'guys', type_name: '👨 男生' },
    { type_id: 'couples', type_name: '👩‍❤️‍👨 情侣' },
    { type_id: 'trans', type_name: '🏳️‍⚧️ 变性人' },
];

const NATIVE_FILTERS = {
    all: [
        {
            key: 'cat',
            name: '排序',
            value: [
                { n: '全部', v: '' },
                { n: '热门推荐', v: 'trending' },
                { n: '近期新人', v: 'new' },
                { n: '私人节目', v: 'status_private' },
            ],
        },
    ],
    girls: [
        {
            key: 'cat',
            name: '标签',
            value: [
                { n: '全部', v: '' },
                { n: '亚洲', v: 'asian' },
                { n: '成熟', v: 'mature' },
                { n: '大胸', v: 'big_boobs' },
                { n: '视角', v: 'pov' },
            ],
        },
    ],
    guys: [
        {
            key: 'cat',
            name: '标签',
            value: [
                { n: '全部', v: '' },
                { n: '肌肉', v: 'muscular' },
                { n: '亚洲男', v: 'asian' },
                { n: '熊系', v: 'bear' },
                { n: '少年', v: 'twink' },
            ],
        },
    ],
    trans: [
        {
            key: 'cat',
            name: '标签',
            value: [
                { n: '全部', v: '' },
                { n: '成熟', v: 'mature' },
                { n: '青少年', v: 'teen' },
            ],
        },
    ],
};

const FLATTENED_CATEGORIES = [
    { type_id: 'all', type_name: '✨ 精选推荐' },
    { type_id: 'all_trending', type_name: '🔥 精选-热门' },
    { type_id: 'all_new', type_name: '🌱 精选-新人' },
    { type_id: 'all_status_private', type_name: '🔒 精选-私播' },
    { type_id: 'girls', type_name: '👩 女生全部' },
    { type_id: 'girls_asian', type_name: '🌏 女生-亚洲' },
    { type_id: 'girls_mature', type_name: '💃 女生-成熟' },
    { type_id: 'girls_big_boobs', type_name: '🍒 女生-大胸' },
    { type_id: 'girls_pov', type_name: '👁️ 女生-视角' },
    { type_id: 'guys', type_name: '👨 男生全部' },
    { type_id: 'guys_muscular', type_name: '💪 男生-肌肉' },
    { type_id: 'guys_asian', type_name: '👲 男生-亚洲' },
    { type_id: 'guys_bear', type_name: '🐻 男生-熊系' },
    { type_id: 'guys_twink', type_name: '🧑 男生-少年' },
    { type_id: 'couples', type_name: '👩‍❤️‍👨 情侣连播' },
    { type_id: 'trans', type_name: '🏳️‍⚧️ 变性全部' },
    { type_id: 'trans_mature', type_name: '👵 变性-成熟' },
    { type_id: 'trans_teen', type_name: '👧 变性-青少' },
];

const M3U_GROUPS = [
    { id: 'all', groupName: '🔞 SinParty - 精选推荐' },
    { id: 'girls', groupName: '🔞 SinParty - 女生直播' },
    { id: 'guys', groupName: '🔞 SinParty - 男生帅哥' },
    { id: 'couples', groupName: '🔞 SinParty - 情侣连播' },
    { id: 'trans', groupName: '🔞 SinParty - 变性视角' },
];

const http = axios.create({
    timeout: 15000,
    headers: HEADERS,
    validateStatus: () => true,
});

function parseFilters(raw) {
    if (!raw) return {};
    if (typeof raw === 'string') {
        let f = raw;
        try {
            if (f.includes('%')) f = decodeURIComponent(f);
        } catch {
            /* ignore */
        }
        if (!f.startsWith('{') && /^[a-zA-Z0-9+/=]+$/.test(f)) {
            try {
                f = Buffer.from(f, 'base64').toString('utf8');
            } catch {
                /* ignore */
            }
        }
        try {
            return JSON.parse(f);
        } catch {
            const m = f.match(/"cat"\s*:\s*"([^"]+)"/);
            return m ? { cat: m[1] } : {};
        }
    }
    return raw;
}

function getFilterCat(inReq) {
    const body = inReq.body || {};
    const query = inReq.query || {};
    const ext = parseFilters(body.filters || body.extend || body.f || query.f || query.ext || query.filter || '');
    return ext.cat || '';
}

async function fetchApiItems(tid, pg, extCat) {
    const qParams = new URLSearchParams({
        page: String(pg),
        per_page: '40',
        od: 'desc',
    });

    let mainTid = String(tid || 'all');
    let subVal = extCat || '';
    if (mainTid.includes('_')) {
        const parts = mainTid.split('_');
        mainTid = parts[0];
        subVal = parts.slice(1).join('_');
    }

    if (mainTid === 'couples') {
        qParams.append('category[]', 'couples');
    } else if (mainTid === 'trans') {
        qParams.append('category[]', 'trans');
    } else if (mainTid === 'guys') {
        qParams.append('gender[]', 'm');
    } else {
        qParams.append('gender[]', 'f');
        qParams.append('so', 'has_straight');
    }

    if (subVal) {
        if (subVal.startsWith('status_')) {
            qParams.append('status[]', subVal.replace('status_', ''));
        } else {
            qParams.append('trending[]', subVal);
        }
    }

    const resp = await http.get(`${API_HOST}/v2/web/live-cams/web-rtc?${qParams.toString()}`);
    const root = typeof resp.data === 'object' ? resp.data : {};
    const data = root.data || {};
    const items = data.items || [];
    const vlist = [];

    for (const item of items) {
        let vid = '';
        let pic = '';
        let name = '';
        if (item.creator_user_hash) {
            vid = `native|${item.creator_user_hash}`;
            pic = item.thumbnail_url || String(item.poster_set_template || '').replace('{size}', '360');
            name = item.title;
        } else if (item.Nickname) {
            vid = `external|${item.Nickname}`;
            pic = item.Thumbnail || item.Snapshot;
            name = item.Nickname;
        } else {
            continue;
        }
        vlist.push({
            vod_id: vid,
            vod_name: name || 'Live Cam',
            vod_pic: pic || '',
            vod_remarks: `🔥 HOT: ${item.viewers || 0}`,
        });
    }

    return { list: vlist, total: data.total || 0 };
}

async function requestStreamUrl(vid) {
    const parts = String(vid || '').split('|');
    if (parts.length < 2) return null;
    const [mode, key] = parts;

    try {
        if (mode === 'external') {
            const extApi = `https://manifest-server.naiadsystems.com/live/s:${key}.json?vdc=true`;
            const resp = await http.get(extApi, {
                headers: {
                    'User-Agent': UA,
                    Referer: 'https://sinpartylive.com/',
                    sitedomain: 'sinpartylive.com',
                    tenantid: 'SM',
                },
            });
            if (resp.status === 200 && resp.data) {
                const hls = resp.data.formats?.['mp4-hls'] || {};
                const pUrl =
                    hls.manifest ||
                    (hls.encodings?.length ? hls.encodings[hls.encodings.length - 1].location : null);
                if (pUrl) return String(pUrl).replace(/&amp;/g, '&');
            }
        } else {
            const resp = await http.get(`${API_HOST}/v2/web/live-cams/web-rtc/${key}`);
            if (resp.status === 200) {
                return resp.data?.data?.playback_url || null;
            }
        }
    } catch {
        /* ignore */
    }
    return null;
}

function getRequestBase(inReq) {
    const proto = inReq.headers['x-forwarded-proto'];
    const scheme = proto
        ? String(proto).split(',')[0].trim()
        : inReq.socket?.encrypted
          ? 'https'
          : 'http';
    return `${scheme}://${inReq.headers.host}`;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    let list = [];
    try {
        const resData = await fetchApiItems('all', '1', '');
        list = resData.list || [];
    } catch {
        list = [];
    }

    if (CONFIG_MODE === 'flat') {
        return { class: FLATTENED_CATEGORIES, list };
    }
    return { class: NATIVE_CATEGORIES, list, filters: NATIVE_FILTERS };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || 'all');
    const pg = parseInt(inReq.body.page || inReq.body.pg, 10) || 1;
    const filterCat = getFilterCat(inReq);
    const result = { list: [], page: pg, pagecount: 1, limit: 40, total: 0 };
    try {
        const resData = await fetchApiItems(tid, pg, filterCat);
        result.list = resData.list || [];
        result.total = resData.total || result.list.length;
        result.pagecount = result.total > 0 ? Math.ceil(result.total / 40) : 1;
    } catch {
        /* ignore */
    }
    return result;
}

async function detail(inReq, _outResp) {
    let vid = inReq.body.id;
    if (Array.isArray(vid)) vid = vid[0];
    vid = String(vid || '').trim();
    if (!vid) return { list: [] };

    const vod = {
        vod_id: vid,
        vod_name: '大秀极速高清直播间',
        vod_pic: '',
        vod_remarks: '📡 LIVE',
        vod_content: 'SinParty 直播',
        vod_play_from: 'SinParty',
        vod_play_url: '',
    };
    try {
        const streamUrl = await requestStreamUrl(vid);
        vod.vod_play_url = streamUrl
            ? `超级原画极速流$${streamUrl}`
            : '主播下播或换切流$http://0.0.0.0/off.m3u8';
    } catch {
        vod.vod_play_url = '网络流解析异常$http://0.0.0.0/error.m3u8';
    }
    return { list: [vod] };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: HEADERS,
    };
}

async function search(_inReq, _outResp) {
    return { list: [] };
}

async function liveM3u(inReq, outResp) {
    const origin = getRequestBase(inReq);
    const prefix = inReq.server?.prefix || '/spider/sinparty/3';
    let m3u = '#EXTM3U x-tvg-url=""\n';
    try {
        const results = await Promise.all(M3U_GROUPS.map((g) => fetchApiItems(g.id, '1', '')));
        for (let i = 0; i < M3U_GROUPS.length; i++) {
            const groupInfo = M3U_GROUPS[i];
            const resData = results[i];
            if (!resData?.list?.length) continue;
            const seen = new Set();
            for (const room of resData.list) {
                if (!room.vod_id || seen.has(room.vod_id)) continue;
                seen.add(room.vod_id);
                m3u += `#EXTINF:-1 tvg-logo="${room.vod_pic}" group-title="${groupInfo.groupName}",${room.vod_name} (${room.vod_remarks})\n${origin}${prefix}/proxy_play?vid=${encodeURIComponent(room.vod_id)}\n`;
            }
        }
    } catch (e) {
        m3u += `#EXTINF:-1 group-title="错误提示",聚合数据解析异常: ${e.message}\nhttp://0.0.0.0\n`;
    }
    if (m3u === '#EXTM3U x-tvg-url=""\n') {
        m3u += `#EXTINF:-1 group-title="错误提示",未捕获到任何在线直播源\nhttp://0.0.0.0\n`;
    }
    return outResp.type('text/plain; charset=utf-8').send(m3u);
}

async function proxyPlay(inReq, outResp) {
    const vid = inReq.query.vid;
    if (!vid) return outResp.code(400).send('Missing VID');
    const streamUrl = await requestStreamUrl(vid);
    if (!streamUrl) return outResp.code(404).send('Offline');
    return outResp.redirect(streamUrl);
}

export default {
    meta: {
        key: 'sinparty',
        name: '🔞 SinParty',
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
    },
};
