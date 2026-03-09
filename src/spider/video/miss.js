import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0';
const DEFAULT_SITE = 'https://missav.live';
const KEY_SITE    = '/missavSite';
const KEY_COOKIE  = '/missavCookie';

// ─── 工具函数 ──────────────────────────────────────────────────────────────

async function getSite(db) {
    try {
        const val = (await db.getData(KEY_SITE)).missav || '';
        if (!val) return DEFAULT_SITE;
        return val.startsWith('http') ? val : `https://${val}`;
    } catch {
        return DEFAULT_SITE;
    }
}

async function getCookie(db) {
    try {
        return await db.getData(KEY_COOKIE) || '';
    } catch {
        return '';
    }
}

async function buildHeaders(db) {
    const headers = {
        'User-Agent':      UA,
        'Accept':          'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, compress, deflate, br',
    };
    const cookie = await getCookie(db);
    if (cookie) headers['Cookie'] = cookie;
    return headers;
}

async function request(url, db) {
    const headers = await buildHeaders(db);
    const resp = await axios.get(url, { headers });
    return resp.data;
}

// ─── API 处理函数 ──────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(inReq, _outResp) {
    const db = inReq.server.db;

    const classes = [
        { type_id: 'dm265/cn/chinese-subtitle',  type_name: '中文字幕' },
        { type_id: 'dm513/cn/new',               type_name: '最近更新' },
        { type_id: 'dm509/cn/release',           type_name: '新作上市' },
        { type_id: 'dm561/cn/uncensored-leak',   type_name: '无码'     },
        { type_id: 'dm168/cn/weekly-hot',        type_name: '本週热门' },
        { type_id: 'dm207/cn/monthly-hot',       type_name: '本月热门' },
        { type_id: 'dm95/cn/fc2',                type_name: 'FC2'      },
        { type_id: 'dm34/cn/madou',              type_name: '麻豆'     },
    ];

    // 从数据库读取自定义演员列表
    let actors = [];
    try {
        actors = (await db.getData('/missavActors') || [])
            .filter(a => a.enabled)
            .map(a => a.name);
    } catch {}

    const filterOptions = [
        {
            key:   'filt',
            name:  '筛选',
            init:  'all',
            value: [
                { n: '全部',     v: 'all'               },
                { n: '单人作品', v: 'individual'        },
                { n: '多人作品', v: 'multiple'          },
                { n: '中文字幕', v: 'chinese-subtitle'  },
            ],
        },
        {
            key:   'sort',
            name:  '排序',
            init:  'released_at',
            value: [
                { n: '发行时间',   v: 'released_at'   },
                { n: '最近更新',   v: 'published_at'  },
                { n: '收藏数',     v: 'saved'         },
                { n: '今日浏览数', v: 'today_views'   },
                { n: '本周浏览数', v: 'weekly_views'  },
                { n: '本月浏览数', v: 'monthly_views' },
                { n: '总浏览数',   v: 'views'         },
            ],
        },
        {
            key:   'actor',
            name:  '演员筛选',
            init:  'all',
            value: [
                { n: '全部', v: 'all' },
                ...actors.map(name => ({ n: name, v: name })),
            ],
        },
    ];

    const filters = {};
    for (const cls of classes) filters[cls.type_id] = filterOptions;

    return { class: classes, filters };
}

async function category(inReq, _outResp) {
    const db      = inReq.server.db;
    let   typeId  = inReq.body.id;
    const filters = inReq.body.filters || {};
    let   page    = inReq.body.page || 1;
    if (page == 0) page = 1;

    // 演员筛选优先级最高
    if (filters.actor && filters.actor !== 'all') {
        typeId = `cn/actresses/${encodeURIComponent(filters.actor)}`;
    }

    // 内容筛选
    if (filters.filt && filters.filt !== 'all') {
        typeId += `?filters=${filters.filt}`;
    }

    // 排序
    if (filters.sort) {
        const sep = typeId.includes('?') ? '&' : '?';
        typeId += `${sep}sort=${filters.sort}`;
    }

    // 分页
    typeId += typeId.includes('?') ? `&page=${page}` : `?page=${page}`;

    const site = await getSite(db);
    const html = await request(`${site}/${typeId}`, db);
    const $ = load(html);

    const list = [];
    $('.thumbnail').each((_, el) => {
        const href     = $(el).find('.text-secondary').attr('href');
        const title    = $(el).find('.text-secondary').text().trim().replace(/\s+/g, ' ');
        const cover    = $(el).find('.w-full').attr('data-src');
        const remarks  = $(el).find('.left-1').text().trim();
        const duration = $(el).find('.right-1').text().trim();
        list.push({ vod_id: href, vod_name: title, vod_pic: cover, vod_remarks: remarks, vod_duration: duration });
    });

    return {
        page,
        pagecount: list.length < 12 ? page : page + 1,
        list,
    };
}

async function detail(inReq, _outResp) {
    const db   = inReq.server.db;
    const url  = inReq.body.id;
    const html = await request(url, db);

    const SURRIT  = 'https://surrit.com/';
    const PLAYLIST = '/playlist.m3u8';

    // 从页面源码中提取视频 UUID
    const match = html.match(/nineyu\.com\\\/(.+)\\\/seek\\\/_0\.jpg/);
    const tracks = [];

    if (match && match[1]) {
        const uuid = match[1];

        // 获取 m3u8 播放列表
        const m3u8Text = await request(SURRIT + uuid + PLAYLIST, db);
        const lines = m3u8Text.split('\n').filter(l => l.includes('/video.m3u8'));

        // 解析各分辨率
        const resolutions = [];
        for (const line of lines) {
            const name = line.replace('/video.m3u8', '');
            const rm   = name.match(/(\d+)p|(\d+)x(\d+)/);
            if (rm) {
                const res = parseInt(rm[1] || rm[3]);
                resolutions.push({ name, resolution: res, url: `${SURRIT}${uuid}/${line}` });
            }
        }

        // 取最高分辨率
        if (resolutions.length > 0) {
            resolutions.sort((a, b) => b.resolution - a.resolution);
            const best = resolutions[0];
            tracks.push({ name: best.name, url: best.url });
        }
    }

    return {
        list: [{
            vod_id:        url,
            vod_name:      '',
            vod_pic:       '',
            vod_play_from: 'MissAV',
            vod_play_url:  tracks.map(t => `${t.name}$${t.url}`).join('#'),
        }],
    };
}

async function play(inReq, _outResp) {
    const db   = inReq.server.db;
    const site = await getSite(db);
    return {
        parse:  0,
        url:    inReq.body.id,
        header: { 'User-Agent': UA, 'Referer': site },
    };
}

async function search(inReq, _outResp) {
    const db      = inReq.server.db;
    let   page    = inReq.body.page || 1;
    if (page == 0) page = 1;
    const keyword = encodeURIComponent(inReq.body.wd);
    const site    = await getSite(db);

    const html = await request(`${site}/cn/search/${keyword}?page=${page}`, db);
    const $    = load(html);

    const list = [];
    $('.thumbnail').each((_, el) => {
        const href     = $(el).find('.text-secondary').attr('href');
        const title    = $(el).find('.text-secondary').text().trim().replace(/\s+/g, ' ');
        const cover    = $(el).find('.w-full').attr('data-src');
        const remarks  = $(el).find('.left-1').text().trim();
        const duration = $(el).find('.right-1').text().trim();
        list.push({ vod_id: href, vod_name: title, vod_pic: cover, vod_remarks: remarks, vod_duration: duration });
    });

    return {
        page,
        pagecount: list.length < 12 ? page : page + 1,
        list,
    };
}

// ─── 导出 ──────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'missav',
        name: 'MissAV',
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