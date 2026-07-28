import axios from 'axios';
import * as cheerio from 'cheerio';
import { parse as parseQs } from 'querystring';
import { URL } from 'url';

const HOST = 'https://hanime1.me';
const PLAY_PREFIX = 'hanime1://play/';

const CATEGORIES = [
    { type_id: 'all',     type_name: '全部',         genre: ''              },
    { type_id: 'hentai',  type_name: '裏番',         genre: '裏番'          },
    { type_id: 'short',   type_name: '泡麵番',       genre: '泡麵番'        },
    { type_id: 'motion',  type_name: 'Motion Anime', genre: 'Motion Anime'  },
    { type_id: 'cg3d',    type_name: '3DCG',         genre: '3DCG'          },
    { type_id: 'd25',     type_name: '2.5D',         genre: '2.5D'          },
    { type_id: 'd2',      type_name: '2D動畫',       genre: '2D動畫'        },
    { type_id: 'ai',      type_name: 'AI生成',       genre: 'AI生成'        },
    { type_id: 'mmd',     type_name: 'MMD',          genre: 'MMD'           },
    { type_id: 'cosplay', type_name: 'Cosplay',      genre: 'Cosplay'       },
];

const SORTS = ['最新上市','最新上傳','本日排行','本週排行','本月排行','觀看次數','讚好比例','時長最長','他們在看'];
const DURATIONS = ['','1 分鐘 +','5 分鐘 +','10 分鐘 +','20 分鐘 +','30 分鐘 +','60 分鐘 +','0 - 10 分鐘','0 - 20 分鐘'];

// 运行时配置
let hostUrl       = HOST;
let userAgent     = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';
let preferredQuality = 0;
let cookieStr     = '';
let timeoutMs     = 20_000;
let retries       = 2;

const http = axios.create({ timeout: timeoutMs });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clean(value) {
    return String(value || '').replace(/\u00a0/g, ' ').trim().replace(/\s+/g, ' ');
}

function parsePage(value) {
    const n = parseInt(value);
    return isNaN(n) || n < 1 ? 1 : n;
}

function boundedInt(value, def, low, high) {
    const n = parseInt(value);
    return isNaN(n) ? def : Math.min(high, Math.max(low, n));
}

function parseConfig(extend) {
    if (extend && typeof extend === 'object') return extend;
    const text = String(extend || '').trim();
    if (!text) return {};
    const candidates = [text];
    try {
        const padded = text + '='.repeat((4 - text.length % 4) % 4);
        candidates.push(Buffer.from(padded, 'base64').toString('utf-8'));
    } catch { /* ignore */ }
    for (const c of candidates) {
        try {
            const v = JSON.parse(c);
            if (v && typeof v === 'object') return v;
        } catch { /* ignore */ }
    }
    return text.includes('=') ? { cookie: text } : {};
}

function normalizeHost(value) {
    const text = String(value || '').trim().replace(/\/$/, '');
    return text.startsWith('http') ? text : HOST;
}

function videoId(value) {
    const text = String(value || '').trim().replace(/^atvp_detail:/, '').trim();
    if (/^\d+$/.test(text)) return text;
    let m = text.match(/hanime1:\/\/(?:video|play)\/(\d+)/);
    if (m) return m[1];
    try {
        const qs = new URL(text).searchParams.get('v');
        if (qs && /^\d+$/.test(qs)) return qs;
    } catch { /* ignore */ }
    m = text.match(/(?:[?&]v=|\/watch\/)(\d+)/);
    return m ? m[1] : '';
}

function parsePlayId(value) {
    const text = String(value || '').trim();
    const m = text.match(/^hanime1:\/\/play\/(\d+)\/(\d+)$/);
    if (m) return [m[1], parseInt(m[2])];
    const vid = videoId(text);
    return vid ? [vid, 0] : ['', 0];
}

function qualityFromUrl(value, url) {
    let m = String(value || '').match(/(\d{3,4})/);
    if (!m) m = String(url || '').match(/[-_](\d{3,4})p(?:\.|[/?])/i);
    return m ? parseInt(m[1]) : 0;
}

function categoryGenre(tid) {
    const val = String(tid || 'all');
    const cat = CATEGORIES.find((c) => c.type_id === val || c.genre === val);
    return cat?.genre || '';
}

function isChallenge(source) {
    const text = String(source || '').slice(0, 80000).toLowerCase();
    return [
        '<title>just a moment...</title>',
        'id="challenge-form"',
        'cf-browser-verification',
        'cf-chl-captcha',
        'attention required! | cloudflare',
    ].some((s) => text.includes(s));
}

function selectSource(sources, requestedQuality) {
    if (!sources.length) return null;
    const target = requestedQuality || preferredQuality;
    if (target) {
        const exact = sources.find(([q]) => q === target);
        if (exact) return exact;
        return sources.reduce((a, b) => Math.abs(a[0] - target) <= Math.abs(b[0] - target) ? a : b);
    }
    return sources[0];
}

function getHeaders(referer) {
    const h = {
        'User-Agent':      userAgent,
        Accept:            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.7',
        'Cache-Control':   'no-cache',
        Referer:           referer || hostUrl + '/',
    };
    if (cookieStr) h.Cookie = cookieStr.replace(/^Cookie:\s*/i, '').trim();
    return h;
}

async function requestText(path, params = {}) {
    const url = new URL(path.replace(/^\//, ''), hostUrl + '/').href;
    let lastErr;
    for (let i = 0; i <= retries; i++) {
        try {
            const { data, status, request } = await http.get(url, {
                params,
                headers: getHeaders(),
                maxRedirects: 5,
                timeout:      timeoutMs,
            });
            if (isChallenge(data) || [403, 429, 503].includes(status)) {
                throw new Error('Cloudflare 驗證未通過；請在同一出口的瀏覽器完成驗證，再於 Extend 填入 Cookie 和相同 User-Agent');
            }
            return [data, request?.res?.responseUrl || url];
        } catch (e) {
            lastErr = e;
            if (i < retries) await new Promise((r) => setTimeout(r, 350 * (i + 1)));
        }
    }
    throw new Error(String(lastErr?.message || '請求失敗'));
}

// ─── 解析 ─────────────────────────────────────────────────────────────────────

function parseSources(html) {
    const $       = cheerio.load(html);
    const values  = new Map();

    $('video source[src]').each((_, el) => {
        const src     = $(el).attr('src') || '';
        const url     = src.startsWith('http') ? src : new URL(src, hostUrl + '/').href;
        const quality = qualityFromUrl($(el).attr('size'), url);
        if (url.startsWith('http')) values.set(quality, url);
    });

    if (!values.size) {
        $('link[rel="preload"][as="video"]').each((_, el) => {
            const src = $(el).attr('href') || '';
            const url = src.startsWith('http') ? src : new URL(src, hostUrl + '/').href;
            values.set(qualityFromUrl('', url), url);
        });
    }

    return [...values.entries()].sort((a, b) => b[0] - a[0]);
}

function parseListing(source, page) {
    const $     = cheerio.load(source);
    const cards = [];
    const seen  = new Set();

    // 优先带 .search-videos 的 a 标签
    let nodes = $('a[href*="/watch"]').filter((_, el) => $(el).find('.search-videos').length > 0);
    if (!nodes.length) nodes = $('a.video-link[href*="/watch"]');

    nodes.each((_, el) => {
        const vid = videoId($(el).attr('href') || '');
        if (!vid || seen.has(vid)) return;
        seen.add(vid);

        const title    = clean($(el).find('.home-rows-videos-title, .title').first().text() || $(el).attr('title'));
        const image    = $(el).find('img').first().attr('src') || '';
        const duration = clean($(el).find('[class*="duration"]').first().text());

        cards.push({
            vod_id:      vid,
            vod_name:    title || `Hanime1 ${vid}`,
            vod_pic:     image ? new URL(image, hostUrl + '/').href : '',
            vod_remarks: duration,
        });
    });

    // 分页
    const pageNums = [];
    $('ul.pagination li').each((_, el) => {
        const t = parseInt($(el).text().trim());
        if (!isNaN(t)) pageNums.push(t);
    });
    const pagecount = Math.max(page, ...pageNums);
    const limit     = cards.length;

    return { list: cards, page, pagecount, limit, total: pagecount * limit };
}

function parseDetail(source, vid, pageUrl) {
    const $ = cheerio.load(source);

    let title = clean($('meta[property="og:title"]').attr('content') || $('h3#shareBtn-title').text() || $('title').text());
    title = title.replace(/\s*-\s*Hanime1\.me\s*$/i, '').trim();

    const cover    = $('meta[property="og:image"]').attr('content') || $('video#player').attr('poster') || '';
    const content  = clean($('meta[name="description"]').attr('content'));
    const actor    = clean($('a#video-artist-name').text());
    const genre    = clean($('a[href*="genre="]').last().text());
    const dateM    = ($.html() || '').match(/\b(20\d{2})-\d{2}-\d{2}\b/);

    const tagValues = [];
    $('div.single-video-tag a').each((_, el) => {
        const v = clean($(el).text()).replace(/\s*\(\d+\)\s*$/, '');
        if (v && !tagValues.includes(v)) tagValues.push(v);
    });

    const sources   = parseSources(source);
    const playItems = sources.length
        ? sources.map(([q]) => `${q ? q + 'P' : '自動'}$${PLAY_PREFIX}${vid}/${q || 0}`)
        : [`自動$${PLAY_PREFIX}${vid}/0`];

    return {
        vod_id:        vid,
        vod_name:      title || `Hanime1 ${vid}`,
        vod_pic:       cover ? new URL(cover, pageUrl).href : '',
        type_name:     genre,
        vod_year:      dateM ? dateM[1] : '',
        vod_actor:     actor,
        vod_content:   content,
        vod_tag:       tagValues.slice(0, 24).join(','),
        vod_play_from: 'Hanime1直鏈',
        vod_play_url:  playItems.join('#'),
    };
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(inReq, _outResp) {
    const config = parseConfig(inReq.body?.extend || '');
    hostUrl          = normalizeHost(config.host);
    timeoutMs        = boundedInt(config.timeout, 20, 8, 45) * 1000;
    retries          = boundedInt(config.retries, 2, 0, 4);
    preferredQuality = boundedInt(config.preferred_quality, 0, 0, 4320);
    cookieStr        = String(config.cookie || config.cf_cookie || '').trim();
    userAgent        = String(config.user_agent || userAgent).trim();
    http.defaults.timeout = timeoutMs;
    return {};
}

async function home(_inReq, _outResp) {
    const classes = CATEGORIES.map(({ type_id, type_name }) => ({ type_id, type_name }));
    const sortValues     = SORTS.map((v) => ({ n: v, v }));
    const durationValues = DURATIONS.map((v) => ({ n: v || '全部', v }));
    const filters = {};
    for (const { type_id } of CATEGORIES) {
        filters[type_id] = [
            { key: 'sort',     name: '排序', value: sortValues     },
            { key: 'duration', name: '時長', value: durationValues },
        ];
    }

    // 首页推荐
    let list = [];
    try {
        const [source] = await requestText('/search', { sort: '最新上傳', page: 1 });
        list = parseListing(source, 1).list;
    } catch { /* ignore */ }

    return { class: classes, filters, list };
}

async function category(inReq, _outResp) {
    const tid    = inReq.body.id;
    const pg     = parsePage(inReq.body.page);
    const extend = inReq.body.extend || {};
    const genre  = categoryGenre(tid);
    const params = { sort: String(extend.sort || '最新上傳'), page: pg };
    if (genre)          params.genre    = genre;
    if (extend.duration) params.duration = String(extend.duration);

    try {
        const [source] = await requestText('/search', params);
        return parseListing(source, pg);
    } catch (e) {
        return { list: [], page: pg, pagecount: pg, limit: 0, total: 0, msg: `分類讀取失敗: ${e.message}` };
    }
}

async function detail(inReq, _outResp) {
    const rawId = Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id;
    const vid   = videoId(rawId);
    if (!vid) return { list: [] };

    try {
        const [source, pageUrl] = await requestText('/watch', { v: vid });
        return { list: [parseDetail(source, vid, pageUrl)] };
    } catch (e) {
        const msg = `詳情讀取失敗: ${e.message}`;
        return { list: [{ vod_id: vid, vod_name: `Hanime1 ${vid}`, vod_remarks: msg, vod_play_from: 'Hanime1直鏈', vod_play_url: `重試$${PLAY_PREFIX}${vid}/0` }] };
    }
}

async function play(inReq, _outResp) {
    const [vid, requestedQuality] = parsePlayId(inReq.body.id);
    if (!vid) return { parse: 0, jx: 0, playUrl: '', url: '', header: {}, msg: '無法識別播放 ID' };

    try {
        const [source, pageUrl] = await requestText('/watch', { v: vid });
        const sources  = parseSources(source);
        const selected = selectSource(sources, requestedQuality);
        if (!selected) return { parse: 0, jx: 0, playUrl: '', url: '', header: {}, msg: '播放頁沒有可用的直鏈' };
        return {
            parse:   0,
            jx:      0,
            playUrl: '',
            url:     selected[1],
            header:  { 'User-Agent': userAgent, Referer: pageUrl, Origin: hostUrl },
        };
    } catch (e) {
        return { parse: 0, jx: 0, playUrl: '', url: '', header: {}, msg: `播放解析失敗: ${e.message}` };
    }
}

async function search(inReq, _outResp) {
    const key = clean(inReq.body.wd || '');
    const pg  = parsePage(inReq.body.pg);
    if (!key) return { list: [], page: pg, pagecount: pg, limit: 0, total: 0 };

    try {
        const [source] = await requestText('/search', { query: key, page: pg });
        return parseListing(source, pg);
    } catch (e) {
        return { list: [], page: pg, pagecount: pg, limit: 0, total: 0, msg: `搜尋失敗: ${e.message}` };
    }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: { key: 'hanime1', name: '🔥Hanime1', type: 1 },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
    },
};