import axios from 'axios';
import * as cheerio from 'cheerio';

const site = 'https://masex.tv';

const http = axios.create({
    timeout: 10_000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Referer:      site + '/zh-CN',
    },
});

// ─── Static Options ───────────────────────────────────────────────────────────

const SORT_OPTS = [
    { n: '最近更新', v: 'latest' }, { n: '发布日期', v: 'release' },
    { n: '今天最多观看', v: 'view_day' }, { n: '本周最多观看', v: 'view_week' },
    { n: '本月最多观看', v: 'view_month' }, { n: '最多观看', v: 'view_count' }, { n: '最受欢迎', v: 'favorite' },
];
const DURATION_OPTS = [
    { n: '全部时长', v: '' }, { n: '45分钟以内', v: 'lt-45' }, { n: '45-90分钟', v: '45-90' },
    { n: '90-120分钟', v: '90-120' }, { n: '120分钟以上', v: 'gt-122' },
];
const FILTER_OPTS = [
    { n: '全部', v: '' }, { n: '单体作品', v: 'single' }, { n: '中文字幕', v: 'chinese_sub' }, { n: '可下载', v: 'download' },
];
const TAG_GROUPS = ['类别', '主题', '行为', '体型', '服装', '角色'];
const ACTOR_SORT_OPTS = [
    { n: '视频数量', v: 'count' }, { n: '姓名', v: 'name' }, { n: '最多观看', v: 'view' }, { n: '最受欢迎', v: 'favorite' },
];
const ACTOR_HEIGHT_OPTS = [{ n: '全部身高', v: '' }, ...['130-134','135-139','140-144','145-149','150-154','155-159','160-164','165-169','170-174','175-179','180-184','185-189','190-194'].map((v) => ({ n: `${v} cm`, v }))];
const ACTOR_CUP_OPTS   = [{ n: '全部胸围', v: '' }, ...'ABCDEFGHIJKLMNOPQZ'.split('').map((v) => ({ n: `${v} 杯`, v }))];
const ACTOR_AGE_OPTS   = [{ n: '全部年龄', v: '' }, { n: '< 20 岁', v: '0-19' }, { n: '20-24 岁', v: '20-24' }, { n: '25-29 岁', v: '25-29' }, { n: '30-34 岁', v: '30-34' }, { n: '35-39 岁', v: '35-39' }, { n: '40-44 岁', v: '40-44' }, { n: '45-49 岁', v: '45-49' }, { n: '50-54 岁', v: '50-54' }, { n: '> 60 岁', v: '60-99' }];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normPic(pic) {
    if (!pic) return '';
    return pic.startsWith('http://') ? 'https://' + pic.slice(7) : pic;
}

function buildUrl(path, pg, extend = {}) {
    const q = [];
    for (const k of ['sort', 'duration', 'filter', 'height', 'cup', 'age']) {
        const v = extend[k];
        if (v) q.push(`${k}=${encodeURIComponent(v)}`);
    }
    if (pg > 1) q.push(`page=${pg}`);
    return site + path + (q.length ? '?' + q.join('&') : '');
}

function empty(pg) {
    return { list: [], page: pg, pagecount: pg, limit: 30, total: 0 };
}

function buildFilters() {
    const f = [
        { key: 'sort',     name: '排序', value: SORT_OPTS     },
        { key: 'duration', name: '时长', value: DURATION_OPTS },
        { key: 'filter',   name: '筛选', value: FILTER_OPTS   },
    ];
    const tagCls  = [{ n: '全部', v: '' }, ...TAG_GROUPS.map((g) => ({ n: g, v: g }))];
    const actorF  = [
        { key: 'height', name: '身高', value: ACTOR_HEIGHT_OPTS },
        { key: 'cup',    name: '胸围', value: ACTOR_CUP_OPTS   },
        { key: 'age',    name: '年龄', value: ACTOR_AGE_OPTS   },
        { key: 'sort',   name: '排序', value: ACTOR_SORT_OPTS  },
    ];
    return {
        latest:       f,
        'tag/531':    f,
        'tag/268':    f,
        tags:         [{ key: 'cls', name: '分类', value: tagCls }],
        'actor/all':  actorF,
    };
}

// ─── List Parsers ─────────────────────────────────────────────────────────────

function parseVideoCards($, areas = null) {
    const videos = [], seen = new Set();
    $('a[class*="card"]').each((_, el) => {
        const a   = $(el);
        const href = a.attr('href') || '';
        const name = (a.find('[class*="card-title"]').text().trim() || a.find('img').attr('alt') || '').trim();
        const pic  = normPic(a.find('img').attr('src') || '');
        if (!name || !href || seen.has(href)) return;
        seen.add(href);
        const remark = areas || '';
        videos.push({ vod_id: href, vod_name: name, vod_pic: pic, vod_remarks: remark });
    });
    return videos;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    let list = [];
    try {
        const { data } = await http.get(site + '/zh-CN');
        const $      = cheerio.load(data);
        const areas  = new Set(['最近更新', '热门推荐', 'VR', '片商']);
        const seen   = new Set();

        $('div[class*="sec"]').each((_, sec) => {
            const title = $(sec).find('[class*="sec-title"]').first().text().trim();
            if (!areas.has(title)) return;
            $(sec).find('a[class*="card"]').each((_, el) => {
                const a    = $(el);
                const href = a.attr('href') || '';
                const name = (a.find('[class*="card-title"]').text().trim() || a.find('img').attr('alt') || '').trim();
                const pic  = normPic(a.find('img').attr('src') || '');
                if (!name || !href || seen.has(href)) return;
                seen.add(href);
                list.push({ vod_id: href, vod_name: name, vod_pic: pic, vod_remarks: title });
            });
        });
    } catch { /* ignore */ }

    return {
        class: [
            { type_id: 'latest',     type_name: '最近更新' },
            { type_id: 'tag/531',    type_name: '中文'     },
            { type_id: 'tag/268',    type_name: 'VR'       },
            { type_id: 'tags',       type_name: '类型'     },
            { type_id: 'maker',      type_name: '系列'     },
            { type_id: 'maker/all',  type_name: '片商'     },
            { type_id: 'actor/all',  type_name: '女优'     },
        ],
        filters: buildFilters(),
        list,
    };
}

async function category(inReq, _outResp) {
    const tid  = String(inReq.body.id);
    const pg   = parseInt(inReq.body.page) || 1;
    let extend = inReq.body.extend || {};
    if (typeof extend === 'string') { try { extend = JSON.parse(extend); } catch { extend = {}; } }

    if (tid === 'tags')      return tagList(extend);
    if (tid === 'maker')     return seriesList(pg);
    if (tid === 'maker/all') return makerList(pg, extend);
    if (tid === 'actor/all') return actorList(pg, extend);

    const path = tid.startsWith('/') ? tid : '/zh-CN/' + tid;
    return videoList(path, pg, extend);
}

async function tagList(extend) {
    const group = extend.cls || '';
    try {
        const { data } = await http.get(site + '/zh-CN/tags');
        const $   = cheerio.load(data);
        const out = [];
        $('div[class*="sec"]').each((_, sec) => {
            const title = $(sec).find('[class*="tag-sec-title"]').first().text().trim();
            if (!TAG_GROUPS.includes(title)) return;
            if (group && title !== group) return;
            $(sec).find('a[class*="tag-grid-item"]').each((_, el) => {
                const a    = $(el);
                const href = a.attr('href') || '';
                const name = a.find('[class*="tag-grid-name"]').text().trim();
                const m    = href.match(/\/tag\/(\d+)/);
                if (!name || !m) return;
                out.push({ vod_id: 'tag/' + m[1], vod_name: name, vod_pic: '', vod_tag: 'folder', vod_remarks: title });
            });
        });
        return { list: out, page: 1, pagecount: 1, limit: out.length, total: out.length };
    } catch { return empty(1); }
}

async function seriesList(pg) {
    const url = site + '/zh-CN/maker' + (pg > 1 ? `?page=${pg}` : '');
    try {
        const { data } = await http.get(url);
        const $    = cheerio.load(data);
        const out  = [], seen = new Set();
        $('a[class*="series-card"]').each((_, el) => {
            const a     = $(el);
            const href  = a.attr('href') || '';
            const name  = a.find('[class*="series-card-name"]').text().trim();
            const style = a.find('[class*="series-card-img"]').attr('style') || '';
            const pm    = style.match(/url\('([^']+)'\)/);
            const pic   = pm ? pm[1] : '';
            const sid   = href.match(/\/series\/(\d+)/);
            if (!name || !sid || seen.has(href)) return;
            seen.add(href);
            out.push({ vod_id: 'series/' + sid[1], vod_name: name, vod_pic: normPic(pic), vod_tag: 'folder', vod_remarks: '系列' });
        });
        return { list: out, page: pg, pagecount: 999, limit: 30, total: 999 };
    } catch { return empty(pg); }
}

async function makerList(pg, extend) {
    const url = buildUrl('/zh-CN/maker/all', pg, extend);
    try {
        const { data } = await http.get(url);
        const $    = cheerio.load(data);
        const out  = [], seen = new Set();
        $('a[class*="maker-grid-link"]').each((_, el) => {
            const a    = $(el);
            const href = a.attr('href') || '';
            if (!href.includes('/maker/')) return;
            const name = a.find('[class*="maker-grid-name"]').text().trim();
            const pic  = normPic(a.find('img[class*="maker-circle-img"]').attr('src') || '');
            const mid  = href.match(/\/maker\/(\d+)/);
            if (!name || !mid || seen.has(href)) return;
            seen.add(href);
            out.push({ vod_id: 'maker/' + mid[1], vod_name: name, vod_pic: pic, vod_tag: 'folder', vod_remarks: '片商' });
        });
        return { list: out, page: pg, pagecount: 999, limit: 30, total: 999 };
    } catch { return empty(pg); }
}

async function actorList(pg, extend) {
    const url = buildUrl('/zh-CN/actor/all', pg, extend);
    try {
        const { data } = await http.get(url);
        const $    = cheerio.load(data);
        const out  = [], seen = new Set();
        $('a[class*="maker-grid-link"]').each((_, el) => {
            const a     = $(el);
            const href  = a.attr('href') || '';
            if (!href.includes('/actor/')) return;
            const name  = a.find('[class*="maker-grid-name"]').text().trim();
            const pic   = normPic(a.find('img[class*="maker-circle-img"]').attr('src') || '');
            const count = a.find('[class*="maker-grid-count"]').text().trim();
            const aid   = href.match(/\/actor\/(\d+)/);
            if (!name || !aid || seen.has(href)) return;
            seen.add(href);
            out.push({ vod_id: 'actor/' + aid[1], vod_name: name, vod_pic: pic, vod_tag: 'folder', vod_remarks: count || '女优' });
        });
        return { list: out, page: pg, pagecount: 999, limit: 30, total: 999 };
    } catch { return empty(pg); }
}

async function videoList(path, pg, extend) {
    const url = buildUrl(path, pg, extend);
    try {
        const { data } = await http.get(url);
        const $      = cheerio.load(data);
        const videos = [], seen = new Set();
        $('a[class*="card"]').each((_, el) => {
            const a    = $(el);
            const href = a.attr('href') || '';
            const name = (a.find('[class*="card-title"]').text().trim() || a.find('img').attr('alt') || '').trim();
            const pic  = normPic(a.find('img').attr('src') || '');
            if (!name || !href || seen.has(href)) return;
            seen.add(href);
            videos.push({ vod_id: href, vod_name: name, vod_pic: pic, vod_remarks: '' });
        });
        return { list: videos, page: pg, pagecount: 999, limit: 30, total: 999 };
    } catch { return empty(pg); }
}

async function detail(inReq, _outResp) {
    const id  = inReq.body.id;
    const url = id.startsWith('http') ? id : site + id;
    try {
        const { data } = await http.get(url);
        const $ = cheerio.load(data);

        const title   = $('h1[class*="vd-title"]').text().trim() || $('h1').first().text().trim();
        const pic     = normPic($('video[class*="vd-player"]').attr('poster') || '');
        const vid     = $('video[class*="vd-player"]').attr('data-video-id') || '';
        let   trailer = $('video[class*="vd-player"]').attr('data-trailer-url')?.trim() || '';
        if (!trailer && vid) trailer = `${site}/trailer/${vid}`;

        const meta = {};
        $('div[class*="vd-meta-row"]').each((_, row) => {
            const label = $(row).find('[class*="vd-meta-label"]').text().trim();
            const val   = $(row).find('[class*="vd-meta-val"]').text().trim().replace(/\s+/g, ' ');
            if (label && val) meta[label] = val;
        });
        const content = Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join('  ');

        return {
            list: [{
                vod_id:        id,
                vod_name:      title,
                vod_pic:       pic,
                vod_content:   content,
                vod_play_from: '官方试看',
                vod_play_url:  trailer ? `第1集$${trailer}` : '',
            }],
        };
    } catch { return { list: [] }; }
}

async function play(inReq, _outResp) {
    const id = inReq.body.id;
    if (id.includes('/trailer/') || /\.(m3u8|mp4)$/.test(id)) {
        return { parse: 0, url: id, header: http.defaults.headers };
    }
    const target = id.startsWith('http') ? id : site + id;
    try {
        const { data: text } = await http.get(target);
        let playUrl = '';
        for (const re of [/https?:\/\/[^"']+\.m3u8[^"']*/i, /https?:\/\/[^"']+\.mp4[^"']*/i, /src\s*=\s*["']([^"']+)['"]/]) {
            const m = text.match(re);
            if (m) { playUrl = m[1] || m[0]; break; }
        }
        if (!playUrl) playUrl = id;
        if (!playUrl.startsWith('http')) {
            playUrl = playUrl.startsWith('/') ? site + playUrl : 'https:' + playUrl;
        }
        return { parse: 0, url: playUrl, header: http.defaults.headers };
    } catch { return { parse: 0, url: id, header: http.defaults.headers }; }
}

async function search(inReq, _outResp) {
    const key = encodeURIComponent(inReq.body.wd || '');
    try {
        const { data } = await http.get(`${site}/zh-CN/search?q=${key}`);
        const $      = cheerio.load(data);
        const videos = [], seen = new Set();
        $('a[class*="card"]').slice(0, 30).each((_, el) => {
            const a    = $(el);
            const href = a.attr('href') || '';
            const name = (a.find('[class*="card-title"]').text().trim() || a.find('img').attr('alt') || '').trim();
            const pic  = normPic(a.find('img').attr('src') || '');
            if (!name || !href || seen.has(href)) return;
            seen.add(href);
            videos.push({ vod_id: href, vod_name: name, vod_pic: pic, vod_remarks: '' });
        });
        return { list: videos, page: 1, pagecount: 1, limit: 30, total: videos.length };
    } catch { return { list: [], page: 1, pagecount: 0, limit: 0, total: 0 }; }
}

export default {
    meta: { key: 'masex', name: '🔥Masex', type: 3 },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
    },
};