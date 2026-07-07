import axios from 'axios';

const site = 'https://s_ae_ep_k.cha18c8.top';

const http = axios.create({
    timeout: 12_000,
    headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        Referer:           site + '/',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseList(html) {
    if (!html) return [];
    const videos = [];

    let parts = html.split('class="vod"');
    if (parts.length < 2) parts = html.split('class="pack-ykpack"');

    for (const part of parts.slice(1)) {
        const idM = part.match(/href=".*?(?:detail\/id\/|\/v\/|\/id\/)(\d+)\.html"/);
        if (!idM) continue;

        const picM = part.match(/data-original="([^"]+)"/);
        let pic = picM ? picM[1] : '';
        if (pic.startsWith('//')) pic = 'https:' + pic;

        let name = '';

        // A. title 属性
        const tM = part.match(/title="([^"]+)"/);
        if (tM) name = tM[1].trim();

        // B. vod-txt / vod-name 下的 a 标签
        if (!name || name === '未知') {
            const txtM = part.match(/vod-txt">.*?<a[^>]*>(.*?)<\/a>/s);
            if (txtM) name = txtM[1].replace(/<.*?>/g, '').trim();
        }

        // C. 连续汉字暴力提取
        if (!name || name === '未知') {
            const hzM = part.match(/[\u4e00-\u9fa5]{3,}/);
            if (hzM) name = hzM[0];
        }

        videos.push({
            vod_id:   idM[1],
            vod_name: name || '未知资源',
            vod_pic:  pic,
        });
    }
    return videos;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const { data: html } = await http.get(site);

    const classes = [];
    const seen    = new Set();
    const navRe   = /href=".*?\/vod\/type\/id\/(\d+)\.html"[^>]*>([^<]+)<\/a>/g;

    for (const [, tid, rawName] of html.matchAll(navRe)) {
        const name = rawName.trim();
        if (['首页', '留言', '传送门', '更多'].includes(name) || seen.has(tid)) continue;
        classes.push({ type_id: tid, type_name: name });
        seen.add(tid);
    }

    return { class: classes, list: parseList(html), filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg  = parseInt(inReq.body.page) || 1;

    const { data: html } = await http.get(
        `${site}/index.php/vod/type/id/${tid}/page/${pg}.html`
    );
    return { page: pg, pagecount: 999, limit: 20, list: parseList(html) };
}

async function detail(inReq, _outResp) {
    const vid = Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id;
    const { data: html } = await http.get(
        `${site}/index.php/vod/play/id/${vid}/sid/1/nid/1.html`
    );

    // 标题
    const nameM = html.match(/在线播放：([^<]+) -/);
    const name  = nameM ? nameM[1].trim() : '视频详情';

    // player_aaaa
    let finalUrl = '';
    const jsonM  = html.match(/var\s+player_aaaa\s*=\s*(\{.*?\});/s);
    if (jsonM) {
        try {
            const data = JSON.parse(jsonM[1]);
            let u   = data.url   || '';
            const enc = String(data.encrypt || '0');
            if      (enc === '2') u = Buffer.from(u, 'base64').toString('utf-8');
            else if (enc === '1') u = decodeURIComponent(u);
            finalUrl = u.replace(/\\\//g, '/');
        } catch { /* ignore */ }
    }

    // 备用
    if (!finalUrl) {
        const urlM = html.match(/["'](https?[:\\/]+[^"']+\.m3u8[^"']*)['"]/);
        if (urlM) finalUrl = urlM[1].replace(/\\\//g, '/');
    }

    if (finalUrl && finalUrl.startsWith('/')) finalUrl = site + finalUrl;

    return {
        list: [{
            vod_id:        vid,
            vod_name:      name,
            vod_play_from: '极速专线',
            vod_play_url:  `正片$${finalUrl}`,
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse:  0,
        url:    inReq.body.id,
        header: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            Referer:      site + '/',
            Origin:       site,
        },
    };
}

async function search(inReq, _outResp) {
    const key = encodeURIComponent(inReq.body.wd || '');
    const { data: html } = await http.get(
        `${site}/index.php/vod/search.html?wd=${key}`
    );
    return { list: parseList(html) };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'okcm',
        name: '🔥OK传媒',
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