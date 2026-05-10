import axios from 'axios';

const siteUrl = 'https://jable.tv';

const headers = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Referer:           'https://jable.tv/',
};

async function request(url, headers = {}) {
    const resp = await axios.get(url, {
        headers
    });
    return resp.data;
}

function postList(html, pg) {
    const list   = [];
    if (!html) return { list, page: pg, pagecount: pg, limit: 24, total: 9999 };

    const blocks = html.split('<div class="video-img-box').slice(1);

    for (const block of blocks) {
        const hrefMatch  = block.match(/href=["']([^"']+\/videos\/[^"']+)['"]/);
        if (!hrefMatch) continue;

        let u = hrefMatch[1];
        u     = u.startsWith('http') ? u : `${siteUrl}/${u.replace(/^\//, '')}`;

        const titleMatch = block.match(/<h6 class="title"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/);
        const t          = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '未知';

        const picMatch   = block.match(/data-src=["']([^"']+)["']/) || block.match(/src=["']([^"']+)["']/);
        const p          = picMatch ? picMatch[1] : '';

        list.push({
            vod_id:      `${u}@@@${t}@@@${p}`,
            vod_name:    t,
            vod_pic:     p,
            vod_remarks: '1080P',
        });
    }

    return { list, page: pg, pagecount: list.length > 0 ? pg + 1 : pg, limit: 24, total: 9999 };
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const html = await request(siteUrl);
    let   cats = [];

    if (html) {
        const pattern = /href=["'](?:https:\/\/jable\.tv)?\/((?:categories|tags)\/[^"'\/]+|latest-updates|hot)\/?["'][^>]*>(.*?)<\/a>/gi;
        const seen    = new Set();

        for (const m of html.matchAll(pattern)) {
            const tid  = m[1].replace(/\/$/, '');
            const name = m[2].replace(/<[^>]+>/g, '').trim();
            if (tid && name && !seen.has(tid)) {
                seen.add(tid);
                cats.push({ type_id: tid, type_name: name });
            }
        }
    }

    // 兜底静态分类
    if (cats.length === 0) {
        cats = [
            { type_id: 'latest-updates',              type_name: '最近更新' },
            { type_id: 'hot',                         type_name: '热门影片' },
            { type_id: 'categories/chinese-subtitle', type_name: '中文字幕' },
            { type_id: 'categories/uncensored',       type_name: '無碼'     },
            { type_id: 'categories/lesbian',          type_name: '女同'     },
            { type_id: 'categories/creampie',         type_name: '中出'     },
        ];
    }

    return { class: cats, filters: {} };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const page = Math.max(parseInt(inReq.body.page) || 1, 1);
    const url  = page === 1 ? `${siteUrl}/${tid}/` : `${siteUrl}/${tid}/${page}/`;
    const html = await request(url);
    return postList(html, page);
}

async function detail(inReq, _outResp) {
    const vid   = inReq.body.id;
    let   url   = vid, name = '未知', pic = '';

    if (vid.includes('@@@')) {
        const parts = vid.split('@@@');
        url  = parts[0];
        name = parts[1] || name;
        pic  = parts[2] || pic;
    }

    const html     = await request(url);
    let   m3u8Url  = '';

    if (html) {
        const m = html.match(/https?:\/\/[^\s'"]+\.m3u8/);
        if (m) m3u8Url = m[0];
    }

    return {
        list: [{
            vod_id:        vid,
            vod_name:      name,
            vod_pic:       pic,
            vod_play_from: 'Jable',
            vod_play_url:  `播放$${m3u8Url || url}`,
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse:  0,
        url:    inReq.body.id,
        header: headers,
    };
}

async function search(inReq, _outResp) {
    const key  = inReq.body.wd  || '';
    const page = Math.max(parseInt(inReq.body.page) || 1, 1);
    const url  = page === 1
        ? `${siteUrl}/search/${key}/`
        : `${siteUrl}/search/${key}/${page}/`;
    const html = await request(url);
    return postList(html, page);
}

export default {
    meta: { key: 'jableT3', name: '🔥Jable(T3)', type: 3 },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
    },
};