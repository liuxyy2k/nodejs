import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://xeden.net';
const apiBase = `${site}/api`;

// 列表分页每页条数（站点自己也是 24）
const PAGE_SIZE = 24;
// 站点默认只吐最近 100 条，带上 days 才是全库；这个值够大就行
const ALL_DAYS = 3650;

const SORTS = ['latest', 'newest', 'trending', 'most_viewed', 'ranked', 'top_rated'];

const HTML_HEADERS = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
};

// 播放域名（helvid.com）前面挂着防护：缺 sec-fetch-* / sec-ch-ua 直接 403，
// 并且签名里带 d=chromium，UA 换成 ExoPlayer 那种会 404，所以这几个头必须原样带上
const PLAY_HEADER = {
    'User-Agent': UA,
    'Referer': 'https://upload18.org/',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'sec-ch-ua': '"Chromium";v="120", "Not:A-Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    // 分片不带 Origin 会被拦成 403，播放器一般不会自己带，所以这里补上
    'Origin': site,
};

// ─────────────────────────── 站点接口 token ───────────────────────────
// 站点所有 /api 数据接口都要 X-Eden-Token，token 从 /api/_token 现取，有效期 30 分钟

let tokenValue = '';
let tokenExpireAt = 0;
let tokenPending = null;

async function getToken(force = false) {
    if (!force && tokenValue && Date.now() < tokenExpireAt) {
        return tokenValue;
    }
    if (tokenPending) {
        return tokenPending;
    }
    tokenPending = (async () => {
        const resp = await axios.get(`${apiBase}/_token`, {
            headers: { 'User-Agent': UA, 'Accept': 'application/json' },
            timeout: 20000,
        });
        const data = resp.data || {};
        if (!data.token) {
            throw new Error('站点没有返回 token');
        }
        tokenValue = data.token;
        // 提前一分钟过期，避免卡在边界上
        tokenExpireAt = Date.now() + Math.max((Number(data.ttl) || 0) - 60000, 60000);
        return tokenValue;
    })();
    try {
        return await tokenPending;
    } finally {
        tokenPending = null;
    }
}

function buildQuery(params = {}) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue;
        search.set(key, String(value));
    }
    const query = search.toString();
    return query ? `?${query}` : '';
}

async function requestJson(path, params = {}, retry = true) {
    const token = await getToken();
    const resp = await axios.get(`${apiBase}${path}${buildQuery(params)}`, {
        headers: {
            'User-Agent': UA,
            ...HTML_HEADERS,
            'Accept': 'application/json',
            'X-Eden-Token': token,
        },
        timeout: 20000,
        maxRedirects: 3,
        validateStatus: (status) => status >= 200 && status < 500,
    });

    if (resp.status === 401 && retry) {
        await getToken(true);
        return requestJson(path, params, false);
    }
    if (resp.status !== 200) {
        throw new Error(`站点接口 ${path} 返回 ${resp.status}`);
    }
    return resp.data || {};
}

async function requestHtml(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...HTML_HEADERS, ...headers },
        timeout: 20000,
        maxRedirects: 3,
        validateStatus: (status) => status >= 200 && status < 400,
    });
    const html = resp.data;
    if (typeof html !== 'string') return '';
    if (/<title>\s*Just a moment|<title>\s*Attention Required/i.test(html)) {
        throw new Error('播放页被 Cloudflare 挑战：往 cookie.json 里补一份 cf_clearance');
    }
    return html;
}

// ─────────────────────────── 字段处理 ───────────────────────────

function toSlug(raw) {
    if (!raw) return '';
    const str = String(raw).trim().split('#')[0];
    const byQuery = str.match(/[?&](?:id|slug)=([^&#]+)/);
    if (byQuery && !/^https?:\/\//i.test(str)) return decodeURIComponent(byQuery[1]);
    const clean = str.split('?')[0].replace(/\/+$/, '');
    const parts = clean.split('/');
    return parts[parts.length - 1] || '';
}

function picOf(video) {
    const pic = video.thumbnail || '';
    if (!pic) return '';
    return /^https?:\/\//i.test(pic) ? pic : `${site}${pic.startsWith('/') ? '' : '/'}${pic}`;
}

function toVod(video) {
    if (!video || !video.slug) return null;
    return {
        vod_id: video.slug,
        vod_name: video.title || video.slug,
        vod_pic: picOf(video),
    };
}

function toVodList(videos) {
    return (Array.isArray(videos) ? videos : []).map(toVod).filter(Boolean);
}

// 站点把播放地址做了层混淆：x1: + base64，再整串 XOR 0x5A
function decodeEmbed(raw) {
    if (!raw || typeof raw !== 'string') return '';
    if (!raw.startsWith('x1:')) return raw;
    try {
        const bin = Buffer.from(raw.slice(3), 'base64').toString('binary');
        let out = '';
        for (let i = 0; i < bin.length; i += 1) {
            out += String.fromCharCode(bin.charCodeAt(i) ^ 0x5a);
        }
        return out;
    } catch (e) {
        return '';
    }
}

function typeOfId(tid) {
    const raw = String(tid || '').trim();
    if (!raw) return { kind: 'sort', value: 'latest' };
    const index = raw.indexOf(':');
    if (index === -1) {
        return SORTS.includes(raw) ? { kind: 'sort', value: raw } : { kind: 'category', value: raw };
    }
    const kind = raw.slice(0, index);
    const value = raw.slice(index + 1);
    if (!['sort', 'category', 'tag', 'performer', 'studio'].includes(kind)) {
        return { kind: 'category', value: raw };
    }
    return { kind, value };
}

// ─────────────────────────── 播放解析 ───────────────────────────

async function resolveEmbed(embedUrl) {
    const url = String(embedUrl || '').trim();
    if (!url) return '';

    // 站点部分片源用的是 avdbapi 的播放页，清单地址直接写在 ?s= 里
    const byParam = url.match(/[?&]s=([^&]+)/);
    if (byParam) {
        const target = decodeURIComponent(byParam[1]);
        if (/\.m3u8/i.test(target)) return target;
    }

    // 主站播放页是 upload18.to / upload18.org，真清单在 window.PLAYER_CONFIG 里
    const html = await requestHtml(url, { Referer: `${site}/` });
    if (/Page not found/i.test(html) && !/PLAYER_CONFIG/.test(html)) {
        throw new Error('播放页 404，该片源在站方已经失效');
    }
    const match = html.match(/window\.PLAYER_CONFIG\s*=\s*(\{[\s\S]*?\});/);
    if (match) {
        let cfg = null;
        try {
            cfg = JSON.parse(match[1]);
        } catch (e) {
            cfg = null;
        }
        if (cfg && (cfg.m3u8 || cfg.alternate720)) {
            return cfg.m3u8 || cfg.alternate720;
        }
    }

    // 兜底：页面里直接出现清单地址
    const direct = html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i);
    if (direct) return direct[0];

    return '';
}

async function resolvePlayUrl(raw) {
    const str = String(raw || '').trim();
    if (!str) throw new Error('缺少视频 id');

    if (/^https?:\/\/[^\s]+\.m3u8/i.test(str)) {
        return { url: str, header: PLAY_HEADER };
    }

    // 客户端直接把播放页地址丢进来
    if (/^https?:\/\//i.test(str) && !/xeden\.net/i.test(str)) {
        const resolved = await resolveEmbed(str);
        if (resolved) return { url: resolved, header: PLAY_HEADER };
        return { url: str, header: HTML_HEADERS, parse: 1 };
    }

    const slug = toSlug(str);
    if (!slug) throw new Error('缺少视频 id');

    // 每次播放现取：清单 token 有时效、还绑请求方网段，不能缓存
    const data = await requestJson(`/videos/${encodeURIComponent(slug)}/stream`, {}, false);
    const direct = decodeEmbed(data.streamUrl);
    if (direct) return { url: direct, header: PLAY_HEADER };

    const embed = decodeEmbed(data.embedUrl);
    if (!embed) throw new Error('该片源没有给出播放地址');

    const resolved = await resolveEmbed(embed);
    if (resolved) return { url: resolved, header: PLAY_HEADER };

    // 实在解不出来就把播放页交出去，让客户端自己嗅探，别直接黑屏
    return { url: embed, header: HTML_HEADERS, parse: 1 };
}

// ─────────────────────────── 六个接口 ───────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: 'sort:latest', type_name: '最新' },
        { type_id: 'sort:trending', type_name: '热门' },
        { type_id: 'sort:most_viewed', type_name: '最多观看' },
        { type_id: 'sort:top_rated', type_name: '高分' },
    ];

    try {
        const data = await requestJson('/categories');
        for (const category of data.categories || []) {
            if (!category || !category.slug) continue;
            classes.push({ type_id: `category:${category.slug}`, type_name: category.name || category.slug });
        }
    } catch (e) {
        // 分类拿不到不影响首页出内容
    }

    const data = await requestJson('/videos', { sort: 'latest', page: 1, limit: PAGE_SIZE, days: ALL_DAYS });
    const list = toVodList(data.videos);

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const { kind, value } = typeOfId(inReq.body.id);
    const page = parseInt(inReq.body.page, 10) || 1;

    let data;
    if (kind === 'performer') {
        data = await requestJson(`/performers/${encodeURIComponent(value)}`, { page, limit: PAGE_SIZE });
    } else if (kind === 'studio') {
        data = await requestJson(`/studios/${encodeURIComponent(value)}`, { page, limit: PAGE_SIZE });
    } else {
        const params = { page, limit: PAGE_SIZE, days: ALL_DAYS };
        if (kind === 'sort') {
            params.sort = value || 'latest';
        } else if (kind === 'tag') {
            params.tag = value;
        } else {
            params.category = value;
        }
        data = await requestJson('/videos', params);
    }

    const list = toVodList(data.videos);
    const pages = parseInt(data.pages, 10) || 0;

    let pagecount = pages > 0 ? pages : page + 1;
    if (!list.length && page > 1) pagecount = page - 1;

    return { page, pagecount, list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    if (!id) throw new Error('缺少视频 id');

    let data;
    try {
        data = await requestJson(`/videos/${encodeURIComponent(id)}`);
    } catch (e) {
        // 片不存在时站点给 404，按空列表返回，别把整个详情页拖死
        if (/404/.test(e.message)) return { list: [] };
        throw e;
    }
    const video = data.video || null;
    if (!video) return { list: [] };

    const performers = (video.performerDetails || []).map((item) => item.name).filter(Boolean);
    const categories_ = video.categories || [];
    const tags = video.tags || [];
    const intro = video.seoIntro || video.seoDescription || '';

    const pieces = [intro];
    if (performers.length) pieces.push(`演员：${performers.join('、')}`);
    if (video.studio) pieces.push(`片商：${video.studio}`);
    if (categories_.length) pieces.push(`分类：${categories_.join('、')}`);
    if (tags.length) pieces.push(`标签：${tags.join('、')}`);
    if (video.viewsCount) pieces.push(`观看：${video.viewsCount}`);
    if (video.codeTags && video.codeTags.length) pieces.push(`番号：${video.codeTags[0]}`);

    return {
        list: [{
            vod_id: video.slug || id,
            vod_name: video.title || video.slug || id,
            vod_pic: picOf(video),
            vod_year: (video.uploadedAt || '').slice(0, 4),
            vod_remarks: video.duration || '',
            vod_content: pieces.filter(Boolean).join('\n'),
            vod_play_from: 'XEDEN',
            // 单集：集名$slug（只用 1 个 $；$$$ 才是多线路分隔）
            vod_play_url: `正片$${video.slug || id}`,
        }],
    };
}

function playInputId(body) {
    const b = body || {};
    let raw = b.id ?? b.url ?? b.play ?? b.vod_id ?? '';
    if (Array.isArray(raw)) raw = raw[0];
    raw = String(raw ?? '').trim();
    if (!raw) return '';
    // 兼容旧版误写的 第1集$$slug
    if (raw.includes('$$$')) raw = raw.split('$$$').pop() || '';
    if (raw.includes('$$')) raw = raw.split('$$').pop() || '';
    if (raw.includes('$') && !/^https?:\/\//i.test(raw)) {
        raw = raw.slice(raw.lastIndexOf('$') + 1);
    }
    return raw.trim();
}

async function play(inReq, _outResp) {
    const id = playInputId(inReq && inReq.body);
    if (!id) throw new Error('缺少视频 id（请检查 vod_play_url 是否为 正片$slug）');
    const result = await resolvePlayUrl(id);
    return {
        parse: result.parse || 0,
        url: result.url,
        header: result.header,
    };
}

async function search(inReq, _outResp) {
    const text = String(inReq.body.wd || '').trim();
    const page = parseInt(inReq.body.page, 10) || 1;

    if (!text) {
        return { page, pagecount: 1, list: [] };
    }

    const data = await requestJson('/search', { q: text, page, limit: PAGE_SIZE });
    const list = toVodList(data.videos);
    const pages = parseInt(data.pages, 10) || 0;

    let pagecount = pages > 0 ? pages : page + 1;
    if (!list.length && page > 1) pagecount = page - 1;

    return { page, pagecount, list };
}

export default {
    meta: {
        key: 'xeden',
        name: '🌸XEDEN',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
