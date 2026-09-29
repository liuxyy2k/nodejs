import axios from 'axios';

const BASE_URL = 'https://jable.sbs';
const FALLBACK_URLS = ['https://jable.sbs', 'https://jable.tv'];

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

const TIMEOUT = 15_000;

const STATIC_CATS = [
    ['categories/chinese-subtitle', '中文字幕', 'https://imgcdn18.piccdn1.cfd/assets-cdn.jable.tv/contents/categories/12/s1_chinese-subtitle.jpg', '20843部'],
    ['categories/roleplay', '角色剧情', 'https://imgcdn18.piccdn1.cfd/assets-cdn.jable.tv/contents/categories/9/s1_roleplay.jpg', '31733部'],
    ['categories/uniform', '制服诱惑', 'https://imgcdn18.piccdn1.cfd/assets-cdn.jable.tv/contents/categories/10/s1_uniform.jpg', '11883部'],
    ['categories/pantyhose', '丝袜美腿', 'https://imgcdn18.piccdn1.cfd/assets-cdn.jable.tv/contents/categories/3/s1_pantyhose.jpg', '7126部'],
    ['categories/bdsm', '主奴调教', 'https://imgcdn18.piccdn1.cfd/assets-cdn.jable.tv/contents/categories/14/s1_sm.jpg', '5312部'],
    ['categories/sex-only', '直接开啪', 'https://imgcdn18.piccdn1.cfd/assets-cdn.jable.tv/contents/categories/13/s1_sex-only.jpg', '6516部'],
    ['categories/insult', '凌辱快感', 'https://imgcdn18.piccdn1.cfd/assets-cdn.jable.tv/contents/categories/11/s1_rape.jpg', '3538部'],
    ['categories/pov', '男友视角', 'https://imgcdn18.piccdn1.cfd/assets-cdn.jable.tv/contents/categories/5/s1_pov.jpg', '4063部'],
    ['categories/groupsex', '多P群交', 'https://imgcdn18.piccdn1.cfd/assets-cdn.jable.tv/contents/categories/4/s1_groupsex.jpg', '5406部'],
    ['categories/lesbian', '女同欢愉', 'https://imgcdn18.piccdn1.cfd/assets-cdn.jable.tv/contents/categories/2/s1_lesbian.jpg', '425部'],
    ['categories/uncensored', '无码解放', 'https://imgcdn18.piccdn1.cfd/assets-cdn.jable.tv/contents/categories/6/s1_uncensored.jpg', '266部'],
    ['categories/private-cam', '盗摄偷拍', 'https://imgcdn18.piccdn1.cfd/assets-cdn.jable.tv/contents/categories/8/s1_s1_private-cam.jpg', '520部'],
];

const httpClient = axios.create({
    timeout: TIMEOUT,
    headers: HEADERS,
    maxRedirects: 5,
    validateStatus: () => true,
});

function classes() {
    return [
        { type_id: 'latest-updates', type_name: '最近更新' },
        { type_id: 'hot', type_name: '热门影片' },
        { type_id: 'categories/chinese-subtitle', type_name: '中文字幕' },
        { type_id: 'new-release', type_name: '全新上市' },
        { type_id: 'categories', type_name: '主题&标签' },
    ];
}

function candidates(url) {
    if (!url) return [];
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        parsed = new URL(url, BASE_URL + '/');
    }
    const pathQuery = parsed.pathname + parsed.search;
    const result = [url];
    for (const host of FALLBACK_URLS) {
        const candidate = host.replace(/\/$/, '') + pathQuery;
        if (!result.includes(candidate)) result.push(candidate);
    }
    return result;
}

async function fetch(url) {
    for (const candidate of candidates(url)) {
        try {
            const { data, status } = await httpClient.get(candidate, { responseType: 'text' });
            if (status >= 200 && status < 400 && data) return String(data);
        } catch (e) {
            console.log('[Jable] fetch failed:', candidate, e.message);
        }
    }
    return '';
}

function absolute(value) {
    if (!value) return '';
    if (value.startsWith('http')) return value;
    if (value.startsWith('//')) return `https:${value}`;
    return `${BASE_URL.replace(/\/$/, '')}/${String(value).replace(/^\//, '')}`;
}

function isGate(page) {
    return page.includes('继续访问') && (page.includes('/enter') || page.includes('continue-button'));
}

function first(text, pattern) {
    const m = String(text || '').match(pattern);
    return m ? m[1].trim() : '';
}

function clean(value) {
    return String(value || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function isVideoFormat(url) {
    const u = url || '';
    return u.includes('.m3u8') || u.includes('.mp4');
}

function pageUrl(path, page) {
    const p = String(path || 'latest-updates').replace(/^\/+|\/+$/g, '') || 'latest-updates';
    if (page > 1) return `${BASE_URL}/${p}/${page}/`;
    return `${BASE_URL}/${p}/`;
}

function pageCount(pageHtml) {
    const html = pageHtml || '';
    let nums = [...html.matchAll(/\/latest-updates\/(\d+)\//gi)].map((m) => parseInt(m[1], 10));
    if (!nums.length) {
        nums = [...html.matchAll(/\/(?:hot|categories\/.+?|tags\/.+?|new-release)\/(\d+)\//gi)].map((m) => parseInt(m[1], 10));
    }
    if (!nums.length) {
        nums = [...html.matchAll(/<a[^>]+href=["'][^"']*\/(\d+)\/["']/gi)].map((m) => parseInt(m[1], 10));
    }
    if (nums.length) return Math.max(...nums);
    const nums2 = [...html.matchAll(/[?&]page=(\d+)/gi)].map((m) => parseInt(m[1], 10));
    if (nums2.length) return Math.max(...nums2);
    return 1;
}

function parseList(page) {
    const result = [];
    const seen = new Set();
    const cards = [...String(page || '').matchAll(
        /<div[^>]+class=["'][^"']*\bcol-6\b[^"']*\bcol-sm-4\b[^"']*["'][^>]*>.*?(?=<div[^>]+class=["'][^"']*\bcol-6\b[^"']*\bcol-sm-4\b|<\/section>)/gis,
    )];

    for (const [card] of cards) {
        const links = [...card.matchAll(/<a[^>]+href=["']([^"']*\/videos\/[^"']+)["'][^>]*>/gi)].map((m) => m[1]);
        const href = links.length ? links[links.length - 1] : '';
        const title = first(card, /<h6[^>]*class=["'][^"']*title[^"']*["'][^>]*>.*?<a[^>]*>(.*?)<\/a>/is);
        let pic = first(card, /<img[^>]+(?:data-src|data-original|src)=["']([^"']+)["']/i);
        const duration = first(card, /class=["'][^"']*absolute-bottom-right[^"']*["'][^>]*>.*?(\d+:\d+(?::\d+)?)/is);
        if (!href || !title) continue;

        const url = absolute(href);
        if (seen.has(url)) continue;
        seen.add(url);

        if (pic.includes('placeholder')) {
            pic = first(card, /data-src=["']([^"']+)["']/i) || pic;
        }

        result.push({
            vod_id: url,
            vod_name: clean(title),
            vod_pic: absolute(pic),
            vod_remarks: duration,
        });
    }
    return result;
}

function listResult(page, number) {
    const data = page && !isGate(page) ? parseList(page) : [];
    const count = pageCount(page || '');
    return {
        page: number,
        pagecount: count,
        limit: 24,
        total: count * 24,
        list: data,
    };
}

async function categoriesFolder() {
    const result = { list: [], page: 1, pagecount: 1, limit: 200, total: 200 };

    const catHtml = await fetch(`${BASE_URL}/categories/`);
    if (catHtml && !isGate(catHtml)) {
        const re = /<a[^>]*href=["'](?:https?:\/\/jable\.(?:sbs|tv))?(\/categories\/([^"']+))["'][^>]*>([\s\S]*?)<\/a>/gi;
        for (const m of catHtml.matchAll(re)) {
            const catPath = m[1].replace(/^\/+|\/+$/g, '');
            const block = m[3];
            let pic = '';
            const imgM = block.match(/<img[^>]*src=["']([^"']+)["']/i);
            if (imgM) {
                pic = imgM[1].startsWith('//') ? `https:${imgM[1]}` : imgM[1];
            }
            let name = '';
            let count = '';
            const center = block.match(/<div[^>]*class=["'][^"']*absolute-center[^"']*["'][^>]*>(.*?)<\/div>/is);
            if (center) {
                const centerText = center[1];
                name = centerText.replace(/<small[^>]*>.*?<\/small>/gis, '').replace(/<[^>]+>/g, '').trim();
                const cntM = centerText.match(/<small[^>]*>\s*([\d,]+)\s*(?:部|个)?\s*<\/small>/i);
                if (cntM) count = `${cntM[1]}部`;
            }
            if (!name) name = clean(block);
            if (name) {
                result.list.push({
                    vod_id: catPath,
                    vod_name: clean(name),
                    vod_pic: pic,
                    vod_remarks: count || '主题',
                    vod_tag: 'folder',
                    style: { type: 'rect', ratio: 1.4 },
                });
            }
        }
    }

    if (!result.list.some((item) => item.vod_id.startsWith('categories/'))) {
        for (const [cid, cname, cpic, ccount] of STATIC_CATS) {
            result.list.push({
                vod_id: cid,
                vod_name: cname,
                vod_pic: cpic,
                vod_remarks: ccount,
                vod_tag: 'folder',
                style: { type: 'rect', ratio: 1.4 },
            });
        }
    }

    const tagsHtml = await fetch(`${BASE_URL}/latest-updates/`);
    if (tagsHtml && !isGate(tagsHtml)) {
        const seen = new Set();
        const tagRe = /href=["'](?:https?:\/\/jable\.(?:sbs|tv))?(\/tags\/[^"']+)["'][^>]*>([^<]+)<\/a>/gi;
        for (const m of tagsHtml.matchAll(tagRe)) {
            const tagPath = m[1].replace(/^\/+|\/+$/g, '');
            const tagName = clean(m[2]);
            if (!seen.has(tagPath) && tagName) {
                seen.add(tagPath);
                result.list.push({
                    vod_id: tagPath,
                    vod_name: tagName,
                    vod_pic: '',
                    vod_remarks: '标签',
                    vod_tag: 'folder',
                    style: { type: 'rect', ratio: 1 },
                });
            }
        }
    }

    return result;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const html = await fetch(`${BASE_URL}/latest-updates/`);
    const result = listResult(html, 1);
    result.class = classes();
    return result;
}

async function category(inReq, _outResp) {
    const page = parseInt(inReq.body.page) || 1;
    const path = String(inReq.body.id || 'latest-updates').replace(/^\/+|\/+$/g, '');

    if (path === 'categories') {
        return categoriesFolder();
    }

    const html = await fetch(pageUrl(path, page));
    if (!html || isGate(html)) {
        return { page, pagecount: 0, limit: 24, total: 0, list: [] };
    }
    return listResult(html, page);
}

async function detail(inReq, _outResp) {
    const raw = inReq.body.id;
    const value = Array.isArray(raw) ? raw[0] : raw;
    const url = absolute(String(value || ''));
    if (!url) return { list: [] };

    const page = await fetch(url);
    if (!page || isGate(page)) return { list: [] };

    let title = first(page, /<section[^>]+class=["'][^"']*video-info[^"']*["'][^>]*>.*?<h4[^>]*>(.*?)<\/h4>/is);
    title = clean(title) || clean(first(page, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i));
    title = title || clean(first(page, /<title[^>]*>(.*?)<\/title>/is));

    let pic = first(page, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i);
    pic = pic || first(page, /<video[^>]+poster=["']([^"']+)/i);

    const actorMatches = [...page.matchAll(/<a[^>]+class=["'][^"']*model[^"']*["'][^>]*>[\s\S]*?<span[^>]+(?:title|data-original-title)=["']([^"']+)/gi)];
    const actor = [...new Set(actorMatches.map((m) => clean(m[1])).filter(Boolean))].join(',');

    const publish = first(page, /上市于\s*([^<]+)/);
    const quality = first(page, /<div[^>]+class=["'][^"']*header-right[^"']*["'][^>]*>.*?<h6[^>]*>(.*?)<\/h6>/is);

    return {
        list: [{
            vod_id: url,
            vod_name: title || url.replace(/\/$/, '').split('/').pop(),
            vod_pic: absolute(pic),
            type_name: '',
            vod_year: clean(publish),
            vod_area: '日本',
            vod_remarks: clean(quality) || '',
            vod_actor: actor,
            vod_director: '',
            vod_content: title || '',
            vod_play_from: 'JableTV',
            vod_play_url: `正片$${url}`,
        }],
    };
}

async function play(inReq, _outResp) {
    const value = String(inReq.body.id || '');
    if (isVideoFormat(value)) {
        return { parse: 0, url: value, header: { 'User-Agent': HEADERS['User-Agent'] } };
    }

    const url = absolute(value);
    const page = url ? await fetch(url) : '';
    let m3u8 = first(page, /\bvar\s+hlsUrl\s*=\s*["']([^"']+\.m3u8(?:\?[^"']*)?)["']/i);
    if (!m3u8) {
        m3u8 = first(page, /["'](https?:\/\/[^"']+\.m3u8(?:\?[^"']*)?)["']/i);
    }

    if (m3u8) {
        return {
            parse: 0,
            url: m3u8,
            header: { 'User-Agent': HEADERS['User-Agent'], Referer: url },
        };
    }
    return {
        parse: 1,
        url: value,
        header: { 'User-Agent': HEADERS['User-Agent'] },
    };
}

async function search(inReq, _outResp) {
    const page = parseInt(inReq.body.pg || inReq.body.page) || 1;
    const q = encodeURIComponent(String(inReq.body.wd || ''));
    let url = `${BASE_URL}/search/?q=${q}`;
    if (page > 1) url += `&page=${page}`;
    return listResult(await fetch(url), page);
}

export default {
    meta: {
        key: 'jableNew',
        name: '🌸Jable新版',
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
