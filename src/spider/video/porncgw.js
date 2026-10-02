import { load } from 'cheerio';
import req from '../../util/req.js';

const site = 'https://porncgw.com';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CLASSES = [
    { type_id: '/', type_name: '首页' },
    { type_id: '/list', type_name: '短视频' },
    { type_id: '/recommend/', type_name: '推荐吃瓜' },
    { type_id: '/today/', type_name: '今日吃瓜' },
    { type_id: '/hot/', type_name: '热门爆料' },
    { type_id: '/shrd/', type_name: '社会热点' },
    { type_id: '/entertainment/', type_name: '热门短片' },
    { type_id: '/door/', type_name: '门事件' },
    { type_id: '/ai/', type_name: 'AI成人' },
    { type_id: '/long-video/', type_name: '长视频' },
    { type_id: '/archives/', type_name: '吃瓜社区' },
];

const FILTERS = [
    {
        key: 'cat',
        name: '分类',
        value: [
            { n: '默认', v: '' },
            { n: '学生校园', v: '/hot/xsxy/' },
            { n: '网红黑料', v: '/hot/whhl/' },
            { n: '熟女少妇', v: '/hot/snsf/' },
            { n: '吃瓜榜单', v: '/hot/cgbd/' },
            { n: '娱乐八卦', v: '/shrd/ylbg/' },
            { n: '网友爆料', v: '/shrd/wybl/' },
            { n: '出轨偷情', v: '/entertainment/cgtq/' },
            { n: '自拍流出', v: '/entertainment/zplc/' },
            { n: '酒店', v: '/door/jiudian/' },
            { n: '车震', v: '/door/chezhen/' },
            { n: 'AI短剧', v: '/ai/aidj/' },
            { n: 'AI漫剧', v: '/ai/AImj/' },
            { n: '女同系列', v: '/ntxl/' },
            { n: '欧美系列', v: '/omxl/' },
            { n: '剧情演绎', v: '/jqyy/' },
            { n: '亚洲传媒', v: '/yzcm/' },
            { n: '社区今日吃瓜', v: '/archives/jinrichigua/' },
            { n: '社区学生校园', v: '/archives/xueshengxiaoyuan/' },
            { n: '必看大瓜', v: '/archives/bikandagua/' },
            { n: '明星黑料', v: '/archives/mingxingheiliao/' },
            { n: '社区网红黑料', v: '/archives/wanghongheiliao/' },
            { n: '吃瓜新闻', v: '/archives/chiguaxinwen/' },
            { n: '真实投稿', v: '/archives/zhenshitougao/' },
        ],
    },
    {
        key: 'tag',
        name: '标签',
        value: [
            { n: '全部', v: '' },
            { n: '素人真实', v: '素人真实' },
            { n: '抖音擦边', v: '抖音擦边' },
            { n: '高颜值美女', v: '高颜值美女' },
            { n: '眼镜妹', v: '眼镜妹' },
            { n: '巨乳美女', v: '巨乳美女' },
            { n: '女大学生', v: '女大学生' },
            { n: '网红吃瓜', v: '网红吃瓜' },
        ],
    },
];

function abs(u) {
    if (!u) return '';
    u = String(u).trim().replace(/&amp;/g, '&');
    if (u.startsWith('http://') || u.startsWith('https://')) return u;
    if (u.startsWith('//')) return `https:${u}`;
    if (u.startsWith('/')) return site + u;
    return `${site}/${u}`;
}

function parseExtend(raw) {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    try {
        const o = JSON.parse(String(raw));
        return o && typeof o === 'object' ? o : {};
    } catch {
        return {};
    }
}

function headers() {
    return {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Referer: `${site}/`,
        Origin: site,
    };
}

async function fetchHtml(url) {
    try {
        const res = await req.get(url, {
            headers: headers(),
            timeout: 20000,
            validateStatus: () => true,
        });
        return typeof res.data === 'string' ? res.data : '';
    } catch {
        return '';
    }
}

function normPath(p) {
    p = String(p || '').trim();
    if (!p) return '/';
    try {
        if (p.startsWith('http')) p = new URL(p).pathname;
    } catch {}
    if (!p.startsWith('/')) p = `/${p}`;
    return p;
}

function buildListUrl(tid, page, ext = {}) {
    const pg = Math.max(1, parseInt(page, 10) || 1);
    const tag = String(ext.tag || '').trim();
    if (tag) {
        const base = `/search/${encodeURIComponent(tag)}/`;
        return abs(pg > 1 ? `${base}${pg}/` : base);
    }
    let path = normPath(ext.cat || tid || '/');
    if (path === '/') {
        return pg > 1 ? `${site}/list/${pg}/` : `${site}/`;
    }
    if (path === '/list') {
        return pg > 1 ? `${site}/list/${pg}/` : `${site}/list`;
    }
    if (!path.endsWith('/')) path += '/';
    return abs(pg > 1 ? `${path}${pg}/` : path);
}

function parseId(href) {
    const h = normPath(href);
    const m = h.match(/^\/(video|drama|post)\/(\d+)(?:\/(\d+))?/);
    if (!m) return '';
    return m[3] ? `${m[1]}/${m[2]}/${m[3]}` : `${m[1]}/${m[2]}`;
}

function coverOf($el) {
    const img = $el.find('img').first();
    return (
        img.attr('data-src') ||
        img.attr('data-original') ||
        img.attr('src') ||
        ''
    );
}

function listId(id) {
    if (!id) return '';
    return id.startsWith('drama/') ? id.split('/').slice(0, 2).join('/') : id.split('/').slice(0, 2).join('/');
}

function parseVods($) {
    const vods = [];
    const seen = new Set();
    const add = (href, name, pic, remarks) => {
        const id = listId(parseId(href));
        if (!id || seen.has(id) || !name) return;
        seen.add(id);
        let cover = abs(pic);
        if (/cover-placeholder/i.test(cover)) cover = '';
        vods.push({
            vod_id: id,
            vod_name: name,
            vod_pic: cover,
            vod_remarks: remarks,
        });
    };

    $('a.card-link[href]').each((_, el) => {
        const a = $(el);
        const href = a.attr('href') || '';
        if (!/\/(video|drama)\/\d+/.test(href)) return;
        let name = (a.attr('aria-label') || '').split('，')[0].trim();
        if (!name) name = a.find('h2, .card-title, .video-title').first().text().trim() || a.text().replace(/\s+/g, ' ').trim();
        const remarks = a.text().match(/[\d.]+[w万k]?播放|[上下]\d+集|全\d+集/)?.[0] || '';
        add(href, name, coverOf(a), remarks);
    });

    $('a[href^="/post/"]').each((_, el) => {
        const a = $(el);
        const href = a.attr('href') || '';
        if (!/\/post\/\d+/.test(href)) return;
        const text = a.text().replace(/\s+/g, ' ').trim();
        if (!text || text.length < 4) return;
        let name = text
            .replace(/^预览中/, '')
            .replace(/今日吃瓜|必看大瓜|明星黑料|网红黑料|吃瓜新闻|真实投稿|学生校园/g, '')
            .replace(/[\d.]+[万w]?阅读.*$/, '')
            .replace(/·\s*\d+.*$/, '')
            .trim();
        const remarks = text.match(/[\d.]+[万w]?阅读|\d+小时前|\d+天前/)?.[0] || '';
        add(href, name, coverOf(a), remarks);
    });

    return vods;
}

function parsePagecount($, page, tid) {
    let max = page;
    const path = normPath(tid).replace(/\/$/, '');
    $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/\/(\d+)\/?$/);
        if (!m) return;
        if (path && path !== '/' && !href.includes(path) && !href.includes('/search/') && !href.includes('/tag/')) return;
        const n = parseInt(m[1], 10);
        if (n > 1 && n < 20000) max = Math.max(max, n);
    });
    if ($('a').filter((_, el) => /下一页/.test($(el).text())).length && max <= page) max = page + 1;
    return max;
}

function extractPlay(html) {
    const urls = [];
    const seen = new Set();
    const add = (u) => {
        u = abs(u);
        if (!u || !/\.(m3u8|mp4)(\?|$)/i.test(u)) return;
        let key = u;
        try {
            key = new URL(u).pathname;
        } catch {}
        if (seen.has(key)) return;
        seen.add(key);
        urls.push(u);
    };
    for (const re of [
        /data-preview-src="([^"]+)"/g,
        /https?:\/\/[^"'\\\s]+(?:m3u8|mp4)[^"'\\\s]*/gi,
    ]) {
        let m;
        while ((m = re.exec(html))) add((m[1] || m[0]).replace(/&amp;/g, '&'));
    }
    return urls;
}

function dramaEps($, id) {
    const eps = [];
    const seen = new Set();
    $(`a[href*="/drama/${id}/"]`).each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/\/drama\/(\d+)\/(\d+)\/?/);
        if (!m) return;
        const n = parseInt(m[2], 10);
        if (seen.has(n)) return;
        seen.add(n);
        let name = $(el).text().replace(/\s+/g, ' ').trim();
        name = name.replace(/^▶/, '').replace(/立即观看|从头看/g, '').trim();
        if (!name || /^\d+$/.test(name)) name = `第${String(n).padStart(2, '0')}集`;
        else if (!/^第/.test(name)) name = `第${String(n).padStart(2, '0')}集 ${name.replace(/^\d+/, '').trim()}`;
        eps.push({ n, name, id: `drama/${id}/${n}` });
    });
    eps.sort((a, b) => a.n - b.n);
    return eps;
}

async function init() {
    return {};
}

async function home() {
    const html = await fetchHtml(`${site}/`);
    const filters = {};
    for (const c of CLASSES) filters[c.type_id] = FILTERS;
    return {
        class: CLASSES,
        filters,
        list: parseVods(load(html)),
    };
}

async function category(inReq) {
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const tid = String(inReq.body.id || '/');
    const ext = parseExtend(inReq.body.extend || inReq.body.filters || inReq.body.filter);
    const url = buildListUrl(tid, page, ext);
    const html = await fetchHtml(url);
    const $ = load(html);
    const list = parseVods($);
    return {
        list,
        page,
        pagecount: parsePagecount($, page, ext.tag ? `/search/${ext.tag}` : ext.cat || tid),
        limit: 20,
        total: 0,
    };
}

async function detail(inReq) {
    let raw = inReq.body.id;
    if (Array.isArray(raw)) raw = raw[0];
    raw = String(raw || '').replace(/^\/+|\/+$/g, '');
    if (!raw) return { list: [] };
    const kind = raw.split('/')[0];
    const nid = raw.split('/')[1];
    const path = kind === 'drama' ? `/drama/${nid}/` : `/${raw}/`;
    const html = await fetchHtml(abs(path));
    const $ = load(html);
    const name = $('h1').first().text().replace(/\s+/g, ' ').trim() || raw;
    const pic =
        $('meta[property="og:image"]').attr('content') ||
        $('img[data-src]').first().attr('data-src') ||
        '';
    const content =
        $('meta[property="og:description"]').attr('content') ||
        $('meta[name="description"]').attr('content') ||
        '';
    let playFrom = 'porn吃瓜网';
    let playUrl = '';
    if (kind === 'drama') {
        const eps = dramaEps($, nid);
        playUrl = (eps.length ? eps : [{ name: '第01集', id: `drama/${nid}/1` }])
            .map((e) => `${e.name}$${e.id}`)
            .join('#');
    } else {
        const plays = extractPlay(html);
        playUrl = plays.length
            ? plays.map((u, i) => `${plays.length > 1 ? '线路' + (i + 1) : '播放'}$${u}`).join('#')
            : `播放$${raw}`;
    }
    return {
        list: [
            {
                vod_id: raw,
                vod_name: name,
                vod_pic: abs(pic),
                vod_content: content,
                vod_play_from: playFrom,
                vod_play_url: playUrl,
            },
        ],
    };
}

async function play(inReq) {
    let raw = String(inReq.body.id || '');
    if (raw.includes('$')) raw = raw.split('$').pop();
    if (/^https?:\/\//i.test(raw) && /\.(m3u8|mp4)/i.test(raw)) {
        return { parse: 0, url: raw, header: { 'User-Agent': UA, Referer: `${site}/` } };
    }
    raw = raw.replace(/^\/+|\/+$/g, '');
    const html = await fetchHtml(abs(`/${raw}/`));
    const plays = extractPlay(html);
    return {
        parse: 0,
        url: plays[0] || '',
        header: { 'User-Agent': UA, Referer: `${site}/` },
    };
}

async function search(inReq) {
    const kw = String(inReq.body.wd || '').trim();
    if (!kw) return { list: [] };
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const base = `/search/${encodeURIComponent(kw)}/`;
    const html = await fetchHtml(abs(page > 1 ? `${base}${page}/` : base));
    const $ = load(html);
    return { list: parseVods($), page, pagecount: parsePagecount($, page, '/search/') };
}

export default {
    meta: { key: 'porncgw', name: '🍉porn吃瓜网', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
