import axios from 'axios';
import * as cheerio from 'cheerio';

const searchUrl = 'https://search.bilibili.com';
const liveApi   = 'https://api.live.bilibili.com';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0';

const http = axios.create({
    timeout: 15_000,
    headers: { 'User-Agent': UA },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

// 从 href 中提取 bilibili.com/ 和 ? 之间的房间号
function extractRoomId(href) {
    const m = href.match(/bilibili\.com\/([^?]+)/);
    return m ? m[1] : href;
}

// 解析直播搜索页卡片（category / search 共用）
function parseCards($) {
    const videos = [];
    $('div.video-list-item').each((_, el) => {
        try {
            const item    = $(el);
            const nameEl  = item.find('h3.bili-live-card__info--tit');
            const name    = nameEl.text().trim().replace('直播中', '');
            const href    = nameEl.find('a').attr('href') || '';
            const id      = extractRoomId(href);

            let pic = item.find('img').attr('src') || '';
            if (pic && !pic.startsWith('http')) pic = 'https:' + pic;

            const remark = item.find('a.bili-live-card__info--uname').text().trim();

            if (!id || !name) return;
            videos.push({ vod_id: id, vod_name: name, vod_pic: pic, vod_remarks: remark });
        } catch { /* ignore */ }
    });
    return videos;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    return {
        class: [
            { type_id: '舞',      type_name: '舞蹈'   },
            { type_id: '音乐',    type_name: '音乐'   },
            { type_id: '手游',    type_name: '手游'   },
            { type_id: '网游',    type_name: '网游'   },
            { type_id: '单机游戏', type_name: '单机游戏' },
            { type_id: '虚拟主播', type_name: '虚拟主播' },
            { type_id: '电台',    type_name: '电台'   },
            { type_id: '体育',    type_name: '体育'   },
            { type_id: '聊天',    type_name: '聊天'   },
            { type_id: '娱乐',    type_name: '娱乐'   },
            { type_id: '电影',    type_name: '影视'   },
            { type_id: '新闻',    type_name: '新闻'   },
        ],
        list:    [],
        filters: {},
    };
}

async function category(inReq, _outResp) {
    const cid  = inReq.body.id;
    const pg   = parseInt(inReq.body.page) || 1;

    const { data } = await http.get(`${searchUrl}/live`, {
        params: { keyword: cid, page: pg },
    });
    const $    = cheerio.load(data);
    const list = parseCards($);

    return { page: pg, pagecount: 9999, limit: 90, total: 999999, list };
}

async function detail(inReq, _outResp) {
    const did = inReq.body.id;

    const { data } = await http.get(`${liveApi}/xlive/web-room/v2/index/getRoomPlayInfo`, {
        params: {
            room_id:  did,
            platform: 'web',
            protocol: '0,1',
            format:   '0,1,2',
            codec:    '0,1',
        },
    });

    const streams = data?.data?.playurl_info?.playurl?.stream || [];
    const urls    = [];

    streams.forEach((vod, idx) => {
        try {
            const codec = vod.format?.[0]?.codec?.[0];
            const info  = codec?.url_info?.[1] ?? codec?.url_info?.[0];
            if (!codec || !info) return;
            const url = info.host + codec.base_url + info.extra;
            urls.push(`${idx + 1}号线路$${url}`);
        } catch { /* ignore */ }
    });

    return {
        list: [{
            vod_id:        did,
            vod_content:   '欢迎观看哔哩直播',
            vod_play_from: '哔哩专线',
            vod_play_url:  urls.join('#'),
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse:  0,
        url:    inReq.body.id,
        header: { 'User-Agent': UA },
    };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg  = parseInt(inReq.body.pg) || 1;

    const { data } = await http.get(`${searchUrl}/live`, {
        params: { keyword: key, page: pg },
    });
    const $    = cheerio.load(data);
    const list = parseCards($);

    return { page: pg, pagecount: 9999, limit: 90, total: 999999, list };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'bililive2',
        name: '📺哔哩直播',
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