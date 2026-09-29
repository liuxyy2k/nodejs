import axios from 'axios';

const site = 'https://toptv15.cyou';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const http = axios.create({
    timeout: 10_000,
    headers: { 'User-Agent': UA, Referer: site },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function absUrl(url) {
    if (!url) return '';
    return url.startsWith('http') ? url : site + url;
}

// category / search 共用正则解析
function parseVideoList(html) {
    const re   = /href="(\/index\.php\/vod\/detail\/id\/(\d+)\.html)".*?data-original="(.*?)".*?vod-name.*?>(.*?)</gs;
    const list = [];
    for (const m of html.matchAll(re)) {
        list.push({
            vod_id:      m[2],
            vod_name:    m[4].trim(),
            vod_pic:     absUrl(m[3]),
            vod_remarks: '',
        });
    }
    return list;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    return {
        class: [
            { type_id: '1',  type_name: '国产自拍' },
            { type_id: '2',  type_name: '国产传媒' },
            { type_id: '3',  type_name: '探花系列' },
            { type_id: '4',  type_name: '人妻熟女' },
            { type_id: '5',  type_name: '日本无码' },
            { type_id: '6',  type_name: '美乳巨乳' },
            { type_id: '7',  type_name: '强制侵犯' },
            { type_id: '8',  type_name: '制服诱惑' },
            { type_id: '9',  type_name: '绝色佳人' },
            { type_id: '10', type_name: '家庭乱伦' },
            { type_id: '11', type_name: '绝顶潮吹' },
            { type_id: '12', type_name: '网红主播' },
        ],
        list:    [],
        filters: {},
    };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg  = parseInt(inReq.body.page) || 1;

    const { data } = await http.get(
        `${site}/index.php/vod/type/id/${tid}/page/${pg}.html`
    );

    return { page: pg, pagecount: 999, limit: 20, total: 9999, list: parseVideoList(data) };
}

async function detail(inReq, _outResp) {
    const vod_id = inReq.body.id;
    const { data: html } = await http.get(
        `${site}/index.php/vod/detail/id/${vod_id}.html`
    );

    const nameMatch = html.match(/vod-name.*?>(.*?)</) || html.match(/title-box.*?>(.*?)</);
    const picMatch  = html.match(/detail-pic.*?src="(.*?)"/) || html.match(/data-original="(.*?)"/);

    // 解析剧集列表
    const playRe  = /href="\/index\.php\/vod\/play\/id\/(\d+)\/sid\/(\d+)\/nid\/(\d+)\.html">(.*?)</g;
    const urls    = [];
    for (const m of html.matchAll(playRe)) {
        urls.push(`${m[4]}$${m[1]}-${m[2]}-${m[3]}`);
    }
    if (!urls.length) urls.push(`立即播放$${vod_id}-1-1`);

    return {
        list: [{
            vod_id,
            vod_name:      nameMatch ? nameMatch[1].trim() : '视频详情',
            vod_pic:       picMatch  ? picMatch[1]         : '',
            vod_play_from: 'TOP-TV',
            vod_play_url:  urls.join('#'),
        }],
    };
}

async function play(inReq, _outResp) {
    const id    = inReq.body.id;
    const parts = id.split('-');

    const playUrl = parts.length === 3
        ? `${site}/index.php/vod/play/id/${parts[0]}/sid/${parts[1]}/nid/${parts[2]}.html`
        : `${site}/index.php/vod/play/id/${id}.html`;

    try {
        const { data: html } = await http.get(playUrl);
        const m = html.match(/var player_aaaa=(.*?)<\/script>/s);
        if (m) {
            const url = JSON.parse(m[1])?.url || '';
            if (url) return { parse: 0, url, header: { 'User-Agent': UA, Referer: site } };
        }
    } catch { /* ignore */ }

    return { parse: 1, url: playUrl };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg  = parseInt(inReq.body.pg) || 1;

    const { data } = await http.get(
        `${site}/index.php/vod/search/page/${pg}/wd/${encodeURIComponent(key)}.html`
    );

    return { list: parseVideoList(data) };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'toptv',
        name: '🎬TopTV',
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