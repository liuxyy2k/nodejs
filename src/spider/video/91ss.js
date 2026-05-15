import axios from 'axios';

const site = 'https://91shenshi.com';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

const http = axios.create({
    timeout: 15_000,
    headers: { 'User-Agent': UA },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchHtml(url, referer = null) {
    const headers = referer ? { Referer: referer } : {};
    const { data } = await http.get(url, { headers });
    return data;
}

function absUrl(url) {
    if (!url) return '';
    return url.startsWith('http') ? url : site + url;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    return {
        class: [
            { type_id: '/category/photo/', type_name: '全部写真'          },
            { type_id: '/tags/',           type_name: '📁 全部标签(二级目录)' },
        ],
        list:    [],
        filters: {},
    };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg  = parseInt(inReq.body.page) || 1;

    // ── 二级目录：所有标签文件夹 ──────────────────────────────────────────
    if (tid === '/tags/') {
        const html  = await fetchHtml(`${site}/tags/`);
        const items = [];
        // <a href="/tags/名称/1/" ...> 名称 <span>(数量)</span>
        const re = /href="(\/tags\/[^"]+?)\/1\/".*?>\s*([^<]+)\s*<span>\((.*?)\)<\/span>/gs;
        for (const m of html.matchAll(re)) {
            const [, link, name, count] = m;
            items.push({
                vod_id:      link.replace(/\/$/, '') + '/',
                vod_name:    name.trim(),
                vod_pic:     `${site}/favicon.svg`,
                vod_remarks: `文件夹 | ${count}个合集`,
            });
        }
        return { page: 1, pagecount: 1, limit: items.length, total: items.length, list: items };
    }

    // ── 三级页面：标签下的文章列表 ────────────────────────────────────────
    const base = tid.replace(/^\/|\/$/g, '');
    const url  = `${site}/${base}/${pg}/`;
    const html = await fetchHtml(url);

    const list = [];
    const re   = /<a\s+href="(\/posts\/[^"]+)"[^>]*>.*?<img[^>]+src="([^"]+)"[^>]*alt="([^"]+)"/gs;
    for (const m of html.matchAll(re)) {
        const [, u, p, t] = m;
        list.push({
            vod_id:      u,
            vod_name:    t.trim().replace(/\s*\[\d+P.*?\]/g, ''),
            vod_pic:     absUrl(p),
            vod_remarks: '写真合集',
        });
    }

    const hasNext = html.includes(`/${pg + 1}/`) || html.includes('Next page');
    return { page: pg, pagecount: hasNext ? pg + 1 : pg, limit: 24, total: 999, list };
}

async function detail(inReq, _outResp) {
    const id   = inReq.body.id;
    const html = await fetchHtml(`${site}${id}`);
    if (!html) return { list: [] };

    const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/s);
    const title   = h1Match ? h1Match[1].trim() : '写真详情';

    const articleMatch = html.match(/<article[^>]*>(.*?)<\/article>/s);
    const content      = articleMatch ? articleMatch[1] : html;

    const imgRe    = /src="([^"]+\.(?:jpg|jpeg|png|webp|avif)[^"]*)"/gi;
    const seen     = new Set();
    const playUrls = [];

    for (const m of content.matchAll(imgRe)) {
        const img = m[1];
        const low = img.toLowerCase();
        if (['logo', 'avatar', 'icon', 'ads', 'badge'].some((x) => low.includes(x))) continue;
        if (seen.has(img)) continue;
        seen.add(img);
        playUrls.push(`图${playUrls.length + 1}$${absUrl(img)}`);
    }

    return {
        list: [{
            vod_id:        id,
            vod_name:      title,
            vod_play_from: '91绅士',
            vod_play_url:  playUrls.join('#'),
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse:  0,
        url:    inReq.body.id,
        header: { Referer: site },
    };
}

async function search(inReq, _outResp) {
    const key = encodeURIComponent((inReq.body.wd || '').trim());
    const pg  = parseInt(inReq.body.pg) || 1;
    // 复用 category 逻辑，跳转对应标签
    return category({ body: { id: `/tags/${key}/`, page: pg } });
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  '91shenshi',
        name: '🔥91绅士',
        type: 1,
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