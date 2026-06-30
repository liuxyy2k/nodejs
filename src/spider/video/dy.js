import axios from 'axios';

const site = 'https://live.douyin.com';
const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let cookieCache = '';

const http = axios.create({
    timeout: 10_000,
    headers: {
        'User-Agent':      UA,
        Accept:            'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    },
});

const CLASSES_CONFIG = [
    { type_id: '10000$3', type_name: '娱乐天地' },
    { type_id: '10001$3', type_name: '科技文化' },
    { type_id: '102$4',   type_name: '音乐'     },
    { type_id: '103$4',   type_name: '游戏'     },
    { type_id: '105$4',   type_name: '舞蹈'     },
    { type_id: '101$4',   type_name: '聊天'     },
    { type_id: '108$4',   type_name: '运动'     },
    { type_id: '107$4',   type_name: '生活'     },
    { type_id: '106$4',   type_name: '文化'     },
    { type_id: '104$4',   type_name: '二次元'   },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function base36Encode(num) {
    const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
    if (num === 0) return '0';
    let res = '';
    while (num > 0) {
        const rem = num % 36;
        res = alphabet[rem] + res;
        num = Math.floor(num / 36);
    }
    return res;
}

function generateDeviceId() {
    const ts = base36Encode(Date.now());
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let rand = '';
    for (let i = 0; i < 13; i++) rand += chars[Math.floor(Math.random() * chars.length)];
    return ts + rand;
}

async function getCookie() {
    if (cookieCache) return cookieCache;
    try {
        const res = await http.get(site);
        const setCookie = res.headers['set-cookie'];
        if (setCookie) {
            const joined = Array.isArray(setCookie) ? setCookie.join(';') : setCookie;
            const m = joined.match(/ttwid=([^;]+)/);
            if (m) cookieCache = `ttwid=${m[1]}`;
        }
    } catch { /* ignore */ }
    return cookieCache;
}

async function getHeaders() {
    const cookie = await getCookie();
    return {
        'User-Agent': UA,
        Accept:       'application/json, text/plain, */*',
        Referer:      site,
        ...(cookie ? { Cookie: cookie } : {}),
    };
}

function firstNonEmpty(...values) {
    for (const v of values) {
        if (v !== undefined && v !== null && v !== '') return v;
    }
    return null;
}

function parseRawLiveData(item) {
    if (!item || typeof item !== 'object') return null;
    const candidates = [
        item.lives?.rawdata, item.lives?.raw_data,
        item.live?.rawdata, item.live_info?.rawdata,
        item.aweme_info?.live_info?.rawdata,
        item.data?.rawdata, item.rawdata,
        item.lives, item.live, item.live_info,
        item.aweme_info?.live_info, item.aweme_info,
        item.data, item,
    ];
    for (const c of candidates) {
        if (typeof c === 'string') {
            try {
                const parsed = JSON.parse(c);
                if (parsed && typeof parsed === 'object') return parsed;
            } catch { /* ignore */ }
        } else if (c && typeof c === 'object') {
            return c;
        }
    }
    return null;
}

function normalizeSearchItem(raw, fallback = {}) {
    if (!raw || typeof raw !== 'object') return null;

    const roomId = firstNonEmpty(
        raw.id_str, raw.room_id_str,
        raw.room?.id_str, raw.room?.id,
        raw.room_id, raw.roomId
    );
    if (!roomId) return null;

    const webRid = firstNonEmpty(
        raw.owner?.web_rid, raw.web_rid, raw.room?.owner?.web_rid
    ) || generateDeviceId();

    const nickname = firstNonEmpty(
        raw.owner?.nickname, raw.nickname,
        raw.room?.owner?.nickname, fallback.nickname
    ) || '抖音直播';

    const title = firstNonEmpty(raw.title, raw.room?.title, fallback.title, nickname);

    const pic = firstNonEmpty(
        raw.owner?.avatar_large?.url_list?.[0],
        raw.room?.cover?.url_list?.[0],
        raw.cover?.url_list?.[0],
        raw.cover_url
    ) || '';

    const onlineText = firstNonEmpty(
        raw.room?.stats?.user_count_str, raw.user_count_str,
        raw.room?.user_count_str, raw.user_count
    );
    const tagText = firstNonEmpty(
        raw.video_feed_tag,
        raw.room?.partition_road_map?.[0]?.title,
        raw.partition?.title,
        fallback.tag
    );
    const remark = [tagText, onlineText].filter(Boolean).join(' ');

    return {
        vod_id:      `${webRid}@@${roomId}`,
        vod_name:    nickname,
        vod_pic:     pic,
        vod_remarks: remark,
        vod_content: title,
    };
}

function extractSearchVideos(payload) {
    if (!Array.isArray(payload)) return [];
    const seen = new Set();
    const results = [];
    for (const item of payload) {
        const raw = parseRawLiveData(item);
        const norm = normalizeSearchItem(raw, {
            nickname: item.nickname,
            title:    item.title || item.desc,
            tag:      item.search_keyword,
        });
        if (!norm || seen.has(norm.vod_id)) continue;
        seen.add(norm.vod_id);
        results.push(norm);
    }
    return results;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    return { class: CLASSES_CONFIG, list: [], filters: {} };
}

async function category(inReq, _outResp) {
    const tid  = String(inReq.body.id);
    const page = parseInt(inReq.body.page) || 1;
    const offset = 15 * (page - 1);

    const parts = tid.split('$');
    if (parts.length < 2) return { list: [], page, pagecount: 0, limit: 15, total: 9999 };
    const [partition, ptype] = parts;

    const params = {
        aid: '6383', app_name: 'douyin_web', live_id: '1',
        device_platform: 'web', language: 'zh-CN',
        browser_language: 'zh-CN', browser_platform: 'Win32',
        browser_name: 'Chrome', browser_version: '120.0.0.0',
        partition, partition_type: ptype,
        count: '15', offset: String(offset),
        web_rid: generateDeviceId(),
        cookie_enabled: 'true', screen_width: '1920', screen_height: '1080',
    };

    const headers = await getHeaders();
    const urls = [
        'https://live.douyin.com/webcast/web/partition/detail/room/v2/',
        'https://webcast.amemv.com/webcast/web/partition/detail/room/v2/',
    ];

    let list = [];
    for (const url of urls) {
        try {
            const { data } = await http.get(url, { headers, params });
            if (data.status_code !== 0) continue;
            const items = data.data?.data;
            if (!items) break;

            list = items.map((it) => {
                const webRid = it.web_rid || generateDeviceId();
                const room   = it.room;
                return {
                    vod_id:      `${webRid}@@${room.id_str}`,
                    vod_name:    room.title,
                    vod_pic:     room.cover.url_list[0],
                    vod_remarks: `${room.owner.nickname} (🔥${room.stats.user_count_str})`,
                };
            });
            break;
        } catch { continue; }
    }

    return { list, page, pagecount: 9999, limit: 15, total: 999999 };
}

async function search(inReq, _outResp) {
    const kw = (inReq.body.wd || '').trim();
    if (!kw) return { list: [], page: 1 };

    const headers = await getHeaders();

    // 策略1：专用直播搜索
    try {
        const { data } = await http.get('https://www.douyin.com/aweme/v1/web/live/search/', {
            headers,
            params: {
                device_platform: 'webapp', aid: '6383', channel: 'channel_pc_web',
                search_channel: 'aweme_live', search_source: 'switch_tab',
                query_correct_type: '1', need_filter_settings: '1', list_type: 'single',
                keyword: kw, offset: '0', count: '20', os_version: '10',
            },
        });
        const list = extractSearchVideos(data.data);
        if (list.length) return { list, page: 1 };
    } catch { /* ignore */ }

    // 策略2：通用搜索
    try {
        const { data } = await http.get('https://www.douyin.com/aweme/v1/web/general/search/stream/', {
            headers,
            params: {
                device_platform: 'webapp', aid: '6383', channel: 'channel_pc_web',
                search_channel: 'aweme_live', keyword: kw, offset: '0',
                count: '20', os_version: '10',
            },
        });
        const list = extractSearchVideos(data.data);
        if (list.length) return { list, page: 1 };
    } catch { /* ignore */ }

    // 降级：分区搜索
    try {
        const { data } = await http.get('https://live.douyin.com/webcast/web/partition/search/', {
            headers: await getHeaders(),
            params: { keyword: kw, aid: '6383' },
        });
        const partitions = data.data?.SearchResult || [];
        if (!partitions.length) return { list: [], page: 1 };

        const merged = [];
        const seen   = new Set();
        for (let i = 0; i < Math.min(3, partitions.length); i++) {
            const part  = partitions[i].partition || {};
            const pId   = part.id_str;
            const pType = part.type;
            if (!pId || pType === undefined) continue;

            const cateRet = await category(
                { body: { id: `${pId}$${pType}`, page: 1 } }, null
            );
            for (const item of cateRet.list || []) {
                if (seen.has(item.vod_id)) continue;
                seen.add(item.vod_id);
                item.vod_remarks = item.vod_remarks || part.title || kw;
                merged.push(item);
                if (merged.length >= 20) break;
            }
            if (merged.length >= 20) break;
        }
        return { list: merged, page: 1 };
    } catch { /* ignore */ }

    return { list: [], page: 1 };
}

async function detail(inReq, _outResp) {
    const rawId = inReq.body.id;
    if (!rawId) return { list: [] };

    const parts = rawId.split('@@');
    if (parts.length !== 2) return { list: [] };
    const [webRid, roomId] = parts;

    const headers = await getHeaders();
    const params = {
        aid: '6383', app_name: 'douyin_web', live_id: '1',
        device_platform: 'web', enter_from: 'web_live',
        browser_language: 'zh-CN', browser_platform: 'Win32',
        browser_name: 'Chrome', browser_version: '120.0.0.0',
        web_rid: webRid, room_id_str: roomId,
        enter_source: '', is_need_double_stream: 'false',
    };

    try {
        const { data } = await http.get('https://live.douyin.com/webcast/room/web/enter/', { headers, params });
        const info = data.data?.data?.[0];
        if (!info) return { list: [] };

        const resolutionMap = {
            FULL_HD1: '蓝光', HD1: '超清', ORIGION: '原画', SD1: '标清', SD2: '高清',
        };

        const flvPull = info.stream_url?.flv_pull_url || {};
        const flvEpisodes = Object.entries(flvPull).map(([k, v]) => `${resolutionMap[k] || k}$${v}`);

        const hlsPull = info.stream_url?.hls_pull_url_map || {};
        const hlsEpisodes = Object.entries(hlsPull).map(([k, v]) => `${resolutionMap[k] || k}$${v}`);

        const fromParts = [];
        const urlParts  = [];
        if (flvEpisodes.length) { fromParts.push('FLV'); urlParts.push(flvEpisodes.join('#')); }
        if (hlsEpisodes.length) { fromParts.push('HLS'); urlParts.push(hlsEpisodes.join('#')); }

        return {
            list: [{
                vod_id:        rawId,
                vod_name:      info.title,
                vod_pic:       info.cover.url_list[0],
                vod_actor:     info.owner.nickname,
                vod_content:   `【天神IY】${info.title}`,
                vod_play_from: fromParts.join('$$$'),
                vod_play_url:  urlParts.join('$$$'),
            }],
        };
    } catch {
        return { list: [] };
    }
}

async function play(inReq, _outResp) {
    const id = inReq.body.id;
    if (!id) return { parse: 0, url: '', header: { 'User-Agent': UA } };
    return {
        parse:  0,
        url:    id,
        header: { 'User-Agent': UA, Referer: site },
    };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'douyin_live',
        name: '🔥抖音直播',
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