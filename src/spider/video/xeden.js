import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const site = 'https://xeden.net';
const apiBase = `${site}/api`;

// 列表每页条数（站点自己也是 24）
const PAGE_SIZE = 24;
// 站点默认只吐最近 100 条，带上 days 才是全库；这个值够大就行
const ALL_DAYS = 3650;

const SORTS = ['latest', 'newest', 'trending', 'most_viewed', 'ranked', 'top_rated'];

// ─────────────────────────── 请求头 ───────────────────────────

const CLIENT_HINTS = {
    'sec-ch-ua': '"Chromium";v="120", "Not:A-Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
};

const HTML_HEADERS = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
};

// 播放页（upload18.to/play/index/<slug>）现在挂了 Cloudflare 防护：
// 只带 UA + Referer 会直接吃 403「Just a moment」，必须把浏览器的
// sec-fetch-* / sec-ch-ua 指纹头一起带上才放行。这里按 iframe 内嵌场景给一版，
// 再备一版 document 场景，被挑战就换一套重试。
const PLAY_PAGE_HEADERS = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'iframe',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-User': '?1',
    ...CLIENT_HINTS,
};

const PLAY_PAGE_HEADERS_ALT = {
    ...PLAY_PAGE_HEADERS,
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
};
delete PLAY_PAGE_HEADERS_ALT['Sec-Fetch-User'];

const PLAY_PAGE_HEADERS_MIN = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Fetch-Dest': 'iframe',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'cross-site',
    ...CLIENT_HINTS,
};

// 分片/清单侧的请求头：照真实浏览器加载 m3u8 的样子拼（Origin + Referer 都指向播放页所在站）
// 旧版写死了 Referer: upload18.org、Origin: xeden.net，跟实际加载方对不上，容易吃 403。
function streamHeader(playPageUrl) {
    let origin = 'https://upload18.to';
    try {
        origin = new URL(playPageUrl).origin;
    } catch (e) {
        // 用默认值
    }
    return {
        'User-Agent': UA,
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': playPageUrl || `${origin}/`,
        'Origin': origin,
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
        ...CLIENT_HINTS,
    };
}

function isChallenge(html) {
    if (!html) return true;
    return /<title>\s*(Just a moment|Attention Required)/i.test(html)
        || /you have been blocked/i.test(html)
        || /cf_chl_opt|__cf_chl_|cf-browser-verification/i.test(html);
}

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

// 播放页可能被 CF 挑战，这里轮着换几套指纹头重试
async function requestPlayPage(reqUrl, referer = '') {
    const variants = [PLAY_PAGE_HEADERS, PLAY_PAGE_HEADERS_ALT, PLAY_PAGE_HEADERS_MIN];
    let lastError = null;

    for (let i = 0; i < variants.length; i += 1) {
        const headers = { ...variants[i] };
        // 第一轮带 Referer（真从站里点进 iframe 的样子），之后摘掉再试，两种都放过
        if (i === 0 && referer) headers.Referer = referer;
        try {
            const resp = await axios.get(reqUrl, {
                headers,
                timeout: 20000,
                maxRedirects: 3,
                validateStatus: (status) => status >= 200 && status < 500,
            });
            const html = typeof resp.data === 'string' ? resp.data : '';
            if (resp.status === 200 && html && !isChallenge(html)) {
                return html;
            }
            lastError = new Error(`播放页返回 ${resp.status}`);
        } catch (e) {
            lastError = e;
        }
    }

    throw new Error(
        `播放页被站点防护拦截（${lastError ? lastError.message : '未知原因'}）`,
    );
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

function unescapeUrl(u) {
    if (!u) return '';
    return String(u)
        .replace(/\\u0026/gi, '&')
        .replace(/\\u003d/gi, '=')
        .replace(/\\\//g, '/')
        .replace(/&amp;/g, '&')
        .replace(/^['"]|['"]$/g, '')
        .trim();
}

function pickFromPlayerConfig(html) {
    // 真清单在 window.PLAYER_CONFIG 里（JSON），字段：m3u8 / alternate720 / workerDomains
    const matched = html.match(/(?:window\.)?PLAYER_CONFIG\s*=\s*(\{[\s\S]*?\})\s*;\s*(?:\n|<\/script>|$)/)
        || html.match(/(?:window\.)?PLAYER_CONFIG\s*=\s*(\{[\s\S]*?\})\s*;/);
    if (matched) {
        let cfg = null;
        try {
            cfg = JSON.parse(matched[1]);
        } catch (e) {
            cfg = null;
        }
        // 注意：清单地址的路径是 base64 编过的（.../m/L3YvT1ZFT1BQSUUt...），
        // 整串里根本不含 ".m3u8" 字样，所以只能按“是不是一条 http(s) 地址”来判断，
        // 千万别拿后缀去筛，会一条都命中不了。
        if (cfg) {
            const list = [cfg.m3u8, cfg.alternate720, cfg.alternate, cfg.source, cfg.url, cfg.file];
            for (const item of list) {
                if (item && typeof item === 'string') {
                    const candidate = unescapeUrl(item);
                    if (/^https?:\/\//i.test(candidate)) {
                        return candidate;
                    }
                }
            }
        }
    }

    // 兜底 1：JSON 里直接躺着的播放字段（同样不看后缀）
    const byField = html.match(/"(?:m3u8|alternate720|hls|playlist)"\s*:\s*"([^"]+)"/i);
    if (byField) {
        const candidate = unescapeUrl(byField[1]);
        if (/^https?:\/\//i.test(candidate)) return candidate;
    }

    // 兜底 2：页面上裸出现的地址——带 .m3u8 的，或播放域名的 /m/ 清单路径
    const withExt = html.match(/https?:\/\/[^"'\s\\<>]+\.m3u8[^"'\s\\<>]*/i);
    if (withExt) return unescapeUrl(withExt[0]);

    const byHost = html.match(/https?:\/\/[^"'\s\\<>]*helvid\.com\/m\/[^"'\s\\<>]+/i);
    if (byHost) return unescapeUrl(byHost[0]);

    return '';
}

async function resolveEmbed(embedUrl) {
    const url = String(embedUrl || '').trim();
    if (!url) return { url: '', header: HTML_HEADERS };

    // 站点部分片源用的是 avdbapi 的播放页，清单地址直接写在 ?s= 里
    const byParam = url.match(/[?&]s=([^&]+)/);
    if (byParam) {
        const target = decodeURIComponent(byParam[1]);
        if (/\.m3u8/i.test(target)) {
            return { url: target, header: streamHeader(url) };
        }
    }

    // 主站播放页是 upload18.to / upload18.org，真清单在 window.PLAYER_CONFIG 里
    const html = await requestPlayPage(url, `${site}/`);
    if (/Page not found|404 Not Found/i.test(html) && !/PLAYER_CONFIG/.test(html)) {
        throw new Error('播放页 404，该片源在站方已经失效');
    }

    const playlist = pickFromPlayerConfig(html);
    if (playlist) {
        return { url: playlist, header: streamHeader(url) };
    }

    return { url: '', header: HTML_HEADERS };
}

async function resolvePlayUrl(raw) {
    const str = String(raw || '').trim();
    if (!str) throw new Error('缺少视频 id');

    // 客户端直接把清单地址丢进来
    if (/^https?:\/\/[^\s]+\.m3u8/i.test(str)) {
        return { url: str, header: streamHeader('https://upload18.to/') };
    }

    // 客户端直接把播放页地址丢进来
    if (/^https?:\/\//i.test(str) && !/xeden\.net/i.test(str)) {
        let resolved = { url: '', header: HTML_HEADERS };
        try {
            resolved = await resolveEmbed(str);
        } catch (e) {
            resolved = { url: '', header: HTML_HEADERS };
        }
        if (resolved.url) {
            return { url: resolved.url, header: resolved.header };
        }
        // 实在解不出来就把播放页交出去，让客户端自己嗅探，别直接黑屏
        return { url: str, header: HTML_HEADERS, parse: 1 };
    }

    const slug = toSlug(str);
    if (!slug) throw new Error('缺少视频 id');

    // 每次播放现取：清单 token 有时效（约 1 小时）且绑请求方网段，不能缓存
    const data = await requestJson(`/videos/${encodeURIComponent(slug)}/stream`, {}, false);
    const direct = decodeEmbed(data.streamUrl);
    if (direct && /^https?:\/\//i.test(direct)) {
        return { url: direct, header: streamHeader('https://upload18.to/') };
    }

    const embed = decodeEmbed(data.embedUrl);
    if (!embed) throw new Error('该片源没有给出播放地址');

    // 播放页被防护挡掉时不抛错，退回播放页地址交给客户端嗅探
    let resolved = { url: '', header: HTML_HEADERS };
    try {
        resolved = await resolveEmbed(embed);
    } catch (e) {
        resolved = { url: '', header: HTML_HEADERS };
    }
    if (resolved.url) {
        return { url: resolved.url, header: resolved.header };
    }

    // 解不出清单就把播放页交出去，让客户端嗅探
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
    let raw = b.id !== undefined ? b.id : (b.url !== undefined ? b.url : (b.play !== undefined ? b.play : (b.vod_id !== undefined ? b.vod_id : '')));
    if (Array.isArray(raw)) raw = raw[0];
    raw = String(raw === undefined || raw === null ? '' : raw).trim();
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
        header: result.header || {},
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
