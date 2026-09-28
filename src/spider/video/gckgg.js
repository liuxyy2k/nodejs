import req from '../../util/req.js';

/**
 * 吉利猫 · gckgg.com
 */

const HOST = 'https://gckgg.com';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const DEFAULT_PARENTS = [
    ['46', '日韩自拍'],
    ['43', '色情主播'],
    ['44', '国产av'],
    ['59', '乱伦侵犯'],
    ['47', '日本无码'],
    ['50', '无码字幕'],
    ['49', '色情动漫'],
    ['48', '有码字幕'],
    ['51', '欧美av'],
    ['52', '18禁重口味'],
    ['53', '偷拍偷窥'],
    ['54', '网爆吃瓜'],
    ['55', '传媒a片'],
    ['56', '探花约炮'],
    ['57', '三级伦理'],
    ['58', 'av解说'],
];

const SORTS = [
    { n: '最新', v: 'time' },
    { n: '最热', v: 'hits' },
    { n: '日榜', v: 'hits_day' },
    { n: '周榜', v: 'hits_week' },
    { n: '月榜', v: 'hits_month' },
    { n: '评分', v: 'score' },
];

let categories = [];
let filters = null;

function fetchHeaders() {
    return {
        'User-Agent': UA,
        Referer: `${HOST}/`,
    };
}

async function fetchHtml(url, timeout = 20000) {
    if (!url) return '';
    try {
        const resp = await req.get(url, {
            headers: fetchHeaders(),
            timeout,
            responseType: 'text',
            validateStatus: () => true,
        });
        if (resp.status === 200) {
            return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
        }
    } catch {
        /* ignore */
    }
    return '';
}

function unesc(s) {
    return String(s || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
        .trim();
}

function fixUrl(u) {
    if (!u) return '';
    const s = String(u).trim();
    if (s.startsWith('//')) return `https:${s}`;
    if (s.startsWith('/')) return `${HOST}${s}`;
    if (s.startsWith('http')) return s;
    return s;
}

function parseDict(v) {
    if (!v) return {};
    if (typeof v === 'object' && !Array.isArray(v)) return v;
    if (typeof v === 'string') {
        try {
            const d = JSON.parse(v);
            return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
        } catch {
            return {};
        }
    }
    return {};
}

function normId(raw) {
    const s = String(raw || '').trim();
    let m = s.match(/\/vod\/(?:play|detail)\/id\/(\d+)\.html/i);
    if (m) return m.group(1);
    if (/^\d+$/.test(s)) return s;
    m = s.match(/(\d+)/);
    return m ? m.group(1) : s;
}

function parseList(html) {
    const results = [];
    const seen = new Set();
    const blocks = String(html || '').match(/<li>\s*<div class="video-item">([\s\S]*?)<\/li>/gi) || [];

    for (const block of blocks) {
        const b = block;
        const m = b.match(/href="[^"]*?\/vod\/play\/id\/(\d+)\.html"/i);
        if (!m || seen.has(m[1])) continue;
        seen.add(m[1]);

        const img = b.match(/<img[^>]*data-src="([^"]+)"[^>]*alt="([^"]*)"/i);
        let title = img ? unesc(img[2]) : '';
        if (!title) {
            const t = b.match(/class="line-clamp-[^"]*"[^>]*>\s*([^<]+?)\s*<\/a>/i);
            title = t ? unesc(t[1]) : '';
        }

        let pic = img ? fixUrl(img[1]) : '';
        if (!pic) {
            const p2 = b.match(/og:image" content="([^"]+)"/i);
            pic = p2 ? fixUrl(p2[1]) : '';
        }

        const rem = b.match(/rounded-large text-white">([^<]+)<\/div>/i);
        results.push({
            vod_id: m[1],
            vod_name: title,
            vod_pic: pic,
            vod_remarks: rem ? rem[1].trim() : '',
        });
    }
    return results;
}

function pageCount(html, pg) {
    const page = parseInt(pg, 10) || 1;
    if (!html || !/class="video-item"/.test(html)) return page > 1 ? page : 1;
    if (/title="下一页"/.test(html)) return page + 1;
    return page;
}

function parseSortPage(html) {
    let parents = [];
    const children = {};
    const parts = String(html || '').split(/<h2[^>]*>([^<]+)<\/h2>/i);

    for (let i = 1; i < parts.length; i += 2) {
        const pname = unesc(parts[i]);
        const body = parts[i + 1] || '';
        const subs = [...body.matchAll(/href="\/index\.php\/vod\/type\/id\/(\d+)\.html"[^>]*>([^<]+)</gi)].map(
            (x) => [x[1], unesc(x[2])],
        );
        if (!subs.length) continue;
        if (pname === '视频类别') parents = subs;
        else children[pname] = subs;
    }

    if (!parents.length) {
        parents = DEFAULT_PARENTS.map(([tid, name]) => [tid, name]);
    }
    return { parents, children };
}

async function buildFilters() {
    if (filters !== null) return filters;

    const html = await fetchHtml(`${HOST}/index.php/label/sort.html`);
    const { parents, children } = parseSortPage(html);

    categories = parents.map(([tid, name]) => ({ type_id: tid, type_name: name }));
    filters = {};

    for (const [tid, pname] of parents) {
        const f = [{ key: 'by', name: '排序', value: SORTS }];
        const subs = children[pname] || [];
        if (subs.length) {
            f.unshift({
                key: 'sub',
                name: '子分类',
                value: [{ n: '全部', v: '' }, ...subs.map(([tid2, n]) => ({ n, v: tid2 }))],
            });
        }
        filters[tid] = f;
    }

    return filters;
}

async function init(_inReq, _outResp) {
    categories = [];
    filters = null;
    return {};
}

async function home(_inReq, _outResp) {
    const filterMap = await buildFilters();
    const homeHtml = await fetchHtml(`${HOST}/`);
    return {
        class: categories,
        filters: filterMap,
        list: parseList(homeHtml),
    };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.tid ?? inReq.body.id ?? '').trim();
    const pg = Math.max(parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1, 1);

    const f = {
        ...parseDict(inReq.body.filter),
        ...parseDict(inReq.body.filters),
        ...parseDict(inReq.body.extend),
    };

    let cur = f.sub || tid;
    cur = String(cur).match(/^\d+$/) ? String(cur) : tid;
    const by = f.by || '';

    let url;
    if (by && /^[a-z_0-9]+$/.test(String(by))) {
        url = `${HOST}/index.php/vod/show/id/${cur}/by/${by}/page/${pg}.html`;
    } else {
        url = `${HOST}/index.php/vod/type/id/${cur}/page/${pg}.html`;
    }

    const html = await fetchHtml(url);
    const vods = parseList(html);
    let pagecount = pageCount(html, pg);
    if (!vods.length && pg > 1) pagecount = pg;

    return {
        page: pg,
        pagecount,
        limit: 20,
        total: 0,
        list: vods,
    };
}

async function detail(inReq, _outResp) {
    const raw = Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id;
    const vid = normId(raw);
    if (!vid) return { list: [] };

    const html = unesc(await fetchHtml(`${HOST}/index.php/vod/play/id/${vid}.html`));

    let name = '';
    let m = html.match(/<h1 class="dx-title[^"]*"[^>]*>([^<]+)<\/h1>/i);
    if (m) name = unesc(m[1]);
    if (!name) {
        m = html.match(/og:title" content="([^"]*)"/i);
        if (m) name = unesc(m[1].split(' - ')[0]);
    }

    let pic = '';
    m = html.match(/og:image" content="([^"]+)"/i);
    if (m) pic = fixUrl(m[1]);

    let vclass = '';
    m = html.match(/href="\/index\.php\/vod\/type\/id\/\d+\.html"[^>]*>([^<]+)<\/a>/i);
    if (m) vclass = unesc(m[1]);

    const tags = [];
    for (const tm of html.matchAll(/href="\/index\.php\/vod\/search\/wd\/([^"]+)\.html"[^>]*>\s*([^<]+?)\s*<\/a>/gi)) {
        const t = unesc(tm[2]);
        if (t && !tags.includes(t)) tags.push(t);
        if (tags.length >= 8) break;
    }

    m = html.match(/>([^<>]*(?:天前|小时前|分钟前))\s*</);
    const remarks = m ? m[1].trim() : '';
    const playUrl = `${HOST}/index.php/vod/play/id/${vid}.html`;

    return {
        list: [
            {
                vod_id: vid,
                vod_name: name,
                vod_pic: pic,
                vod_class: vclass,
                tag: tags.join(','),
                vod_remarks: remarks,
                vod_content: tags.length ? `标签：${tags.join(' / ')}` : '',
                vod_play_from: '吉利猫',
                vod_play_url: `播放$${playUrl}`,
            },
        ],
    };
}

async function search(inReq, _outResp) {
    const key = String(inReq.body.wd || inReq.body.key || '').trim();
    const pg = Math.max(parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1, 1);
    if (!key) {
        return { page: 1, pagecount: 1, list: [] };
    }

    const q = encodeURIComponent(key);
    const url =
        pg > 1
            ? `${HOST}/index.php/vod/search/page/${pg}/wd/${q}.html`
            : `${HOST}/index.php/vod/search/wd/${q}.html`;

    const html = await fetchHtml(url);
    const vods = parseList(html);
    let pagecount = pageCount(html, pg);
    if (!vods.length && pg > 1) pagecount = pg;

    return { page: pg, pagecount, list: vods };
}

async function play(inReq, _outResp) {
    let url = String(inReq.body.id || '').trim();
    if (url.includes('$')) url = url.split('$').pop().trim();
    if (!url.startsWith('http')) url = fixUrl(url);

    const header = fetchHeaders();
    let parseFlag = 0;

    if (!/\.m3u8/i.test(url) && !/\.mp4/i.test(url)) {
        const html = await fetchHtml(url);
        let url2 = '';
        if (html) {
            let m = html.match(/const\s+source\s*=\s*['"]([^'"]+)['"]/i);
            if (m) url2 = m[1];
            if (!url2) {
                m = html.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
                if (m) url2 = m[1];
            }
            if (!url2) {
                m = html.match(/(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/i);
                if (m) url2 = m[1];
            }
        }
        if (url2) url = fixUrl(url2);
        else parseFlag = 1;
    }

    return {
        parse: parseFlag,
        playUrl: '',
        url,
        header,
    };
}

export default {
    meta: {
        key: 'gckgg',
        name: '🔥吉利猫',
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
