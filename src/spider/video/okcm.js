import axios from 'axios';
import https from 'https';

/**
 * OK传媒 - MacCMS v10 · https://s_ae_ep_k.cha18c8.top
 * player_aaaa 解密 + 多级标题提取
 */

const site = 'https://s_ae_ep_k.cha18c8.top';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

const SKIP_NAMES = new Set(['首页', '留言', '传送门', '更多']);

const http = axios.create({
    timeout: 12_000,
    validateStatus: () => true,
});

function getHeaders() {
    return {
        'User-Agent': UA,
        Referer: `${site}/`,
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Origin: site,
    };
}

async function fetchHtml(url) {
    try {
        const resp = await http.get(url, { headers: getHeaders(), responseType: 'text' });
        if (resp.status !== 200) return '';
        return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch {
        return '';
    }
}

function parseList(html) {
    const videos = [];
    if (!html) return videos;

    let parts = html.split('class="vod"');
    if (parts.length < 2) parts = html.split('class="pack-ykpack"');

    for (let i = 1; i < parts.length; i++) {
        const part = parts[i];

        const mId = part.match(/href=".*?(?:detail\/id\/|\/v\/|\/id\/)(\d+)\.html"/);
        if (!mId) continue;

        const mPic = part.match(/data-original="([^"]+)"/);
        let pic = mPic ? mPic[1] : '';
        if (pic.startsWith('//')) pic = `https:${pic}`;

        let name = '';
        const tMatch = part.match(/title="([^"]+)"/);
        if (tMatch) name = tMatch[1].trim();

        if (!name || name === '未知') {
            const txtMatch = part.match(/vod-txt">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/);
            if (txtMatch) name = txtMatch[1].replace(/<[^>]+>/g, '').trim();
        }

        if (!name || name === '未知') {
            const hanzi = part.match(/[\u4e00-\u9fa5]{3,}/g);
            if (hanzi?.length) name = hanzi[0];
        }

        videos.push({
            vod_id: mId[1],
            vod_name: name || '未知资源',
            vod_pic: pic,
        });
    }

    return videos;
}

function parseClasses(html) {
    const classes = [];
    const seen = new Set();
    const re = /href=".*?\/vod\/type\/id\/(\d+)\.html"[^>]*>([^<]+)<\/a>/g;

    for (const m of html.matchAll(re)) {
        const tid = m[1];
        const name = m[2].trim();
        if (SKIP_NAMES.has(name) || seen.has(tid)) continue;
        classes.push({ type_id: tid, type_name: name });
        seen.add(tid);
    }

    return classes;
}

function decryptPlayUrl(data) {
    let u = data.url || '';
    const enc = String(data.encrypt ?? '0');

    if (enc === '2') {
        try {
            u = Buffer.from(u, 'base64').toString('utf8');
        } catch {
            /* keep */
        }
    } else if (enc === '1') {
        u = decodeURIComponent(u);
    }

    return u.replace(/\\\//g, '/');
}

function extractPlayUrl(html) {
    const mJson = html.match(/var\s+player_aaaa\s*=\s*(\{[\s\S]*?\});/);
    if (mJson) {
        try {
            const data = JSON.parse(mJson[1]);
            const url = decryptPlayUrl(data);
            if (url) return url.startsWith('/') ? site + url : url;
        } catch {
            /* fallback */
        }
    }

    const mUrl = html.match(/["'](https?:\\?\/\\?\/[^"']+\.m3u8[^"']*)["']/);
    if (mUrl) {
        let url = mUrl[1].replace(/\\\//g, '/');
        if (url.startsWith('/')) url = site + url;
        return url;
    }

    return '';
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const html = await fetchHtml(site);
    return {
        class: html ? parseClasses(html) : [],
        filters: {},
        list: html ? parseList(html) : [],
    };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '');
    const pg = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const url = `${site}/index.php/vod/type/id/${tid}/page/${pg}.html`;
    const html = await fetchHtml(url);

    return {
        page: pg,
        pagecount: 999,
        limit: 20,
        list: parseList(html),
    };
}

async function detail(inReq, _outResp) {
    const vid = String(inReq.body.id || '');
    const playPage = `${site}/index.php/vod/play/id/${vid}/sid/1/nid/1.html`;
    const html = await fetchHtml(playPage);

    let name = '视频详情';
    const mName = html.match(/在线播放：([^<]+)\s*-/);
    if (mName) name = mName[1].trim();

    const finalUrl = extractPlayUrl(html);

    return {
        list: [
            {
                vod_id: vid,
                vod_name: name,
                vod_play_from: '极速专线',
                vod_play_url: `正片$${finalUrl}`,
            },
        ],
    };
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    return {
        parse: 0,
        url: id,
        header: getHeaders(),
    };
}

async function search(inReq, _outResp) {
    const key = encodeURIComponent(inReq.body.wd || '');
    const url = `${site}/index.php/vod/search.html?wd=${key}`;
    const html = await fetchHtml(url);
    return { list: parseList(html) };
}

export default {
    meta: {
        key: 'okcm',
        name: '🔥OK传媒',
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
