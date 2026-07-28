import axios from 'axios';

const site = 'https://prshinezenx.blog';

const http = axios.create({
    timeout: 15_000,
    headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer:           site + '/',
        Accept:            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    },
});

const CLASSES = [
    { type_id: '43', type_name: '国产精选' },
    { type_id: '31', type_name: '束缚玩法' },
    { type_id: '35', type_name: '中字专区' },
    { type_id: '33', type_name: '女优精选' },
    { type_id: '53', type_name: '传媒拍摄' },
    { type_id: '29', type_name: '变性纪实' },
    { type_id: '21', type_name: '同志日常' },
    { type_id: '23', type_name: '百合情境' },
    { type_id: '39', type_name: '欧美精选' },
    { type_id: '45', type_name: '虚拟换脸' },
    { type_id: '47', type_name: '少女幻想' },
    { type_id: '49', type_name: '主播日记' },
    { type_id: '51', type_name: '约会实录' },
    { type_id: '55', type_name: '伦理剧场' },
    { type_id: '57', type_name: '黑料档案' },
    { type_id: '63', type_name: '自拍实录' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchHtml(url) {
    try {
        const { data } = await http.get(url);
        return data;
    } catch {
        return null;
    }
}

function extractVodData(html) {
    if (!html) return null;
    const m = html.match(/const binaryStr = atob\('([^']+)'\)/);
    if (!m) return null;
    try {
        const json = Buffer.from(m[1], 'base64').toString('utf-8');
        return JSON.parse(json);
    } catch {
        return null;
    }
}

function parseList(items) {
    if (!Array.isArray(items)) return [];
    return items.map((item) => {
        const vodId  = String(item.vod_id || '');
        if (!vodId) return null;
        const name   = item.vod_name || '未知标题';
        let   pic    = item.vod_pic  || '';
        if (pic && !pic.startsWith('http')) pic = site + pic;
        const remark = item.vod_duration || '';
        const typeId = String(item.type_id || '');
        return {
            vod_id:      `${vodId}|$|${name}|$|${pic}|$|${remark}|$|${typeId}`,
            vod_name:    name,
            vod_pic:     pic,
            vod_remarks: remark,
        };
    }).filter(Boolean);
}

function decodeAojiexi(url) {
    const m = url.match(/url=([^&]+)/);
    if (!m) return url;
    return decodeURIComponent(m[1]);
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    let list = [];
    try {
        const html = await fetchHtml(site + '/');
        const data = extractVodData(html);
        if (data) {
            const items = data.other_request_data?.random_list || data.request_data?.list || [];
            list = parseList(items.slice(0, 20));
        }
    } catch { /* ignore */ }

    return { class: CLASSES, filters: {}, list };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const pg   = parseInt(inReq.body.page) || 1;
    const url  = `${site}/vodlist/type/${tid}/keyword/all/orderby/default/page/${pg}.html`;

    const html = await fetchHtml(url);
    const data = extractVodData(html);
    if (!data) return { list: [], page: pg, pagecount: 1, limit: 20, total: 0 };

    const items      = data.request_data?.list || [];
    const total      = data.request_data?.total || 0;
    const limit      = data.limit || 20;
    const totalPages = total > 0 ? Math.ceil(total / limit) : 1;

    return { list: parseList(items), page: pg, pagecount: totalPages, limit, total };
}

async function detail(inReq, _outResp) {
    const raw   = String(Array.isArray(inReq.body.id) ? inReq.body.id[0] : inReq.body.id || '');
    const parts = raw.split('|$|');

    let vodId   = raw, vodName = '', vodPic = '', vodRemark = '', typeId = '';
    if (parts.length >= 5) {
        [vodId, vodName, vodPic, vodRemark, typeId] = parts;
    }

    const detailUrl = typeId
        ? `${site}/voddetail/type/${typeId}/id/${vodId}.html`
        : `${site}/voddetail/type/all/id/${vodId}.html`;

    const html = await fetchHtml(detailUrl);
    let playPage = '';
    if (html) {
        const data = extractVodData(html);
        if (data) {
            const info = data.vod_info || {};
            playPage  = info.vod_play_url || '';
            if (!vodName)   vodName   = info.vod_name     || '未知标题';
            if (!vodPic)    vodPic    = info.vod_pic       || '';
            if (!vodRemark) vodRemark = info.vod_duration  || '';
        }
    }

    if (!playPage) {
        return { list: [{ vod_id: vodId, vod_name: vodName || '未知标题', vod_pic: vodPic, vod_remarks: vodRemark, vod_play_from: '播放', vod_play_url: '' }] };
    }

    if (playPage.includes('aojiexi.com')) {
        playPage = decodeAojiexi(playPage);
    }

    return {
        list: [{
            vod_id:        vodId,
            vod_name:      vodName || '未知标题',
            vod_pic:       vodPic,
            vod_remarks:   vodRemark,
            vod_content:   '',
            vod_play_from: '播放',
            vod_play_url:  `播放$${playPage}`,
        }],
    };
}

async function play(inReq, _outResp) {
    const vid = inReq.body.id || '';
    if (!vid) return { parse: 0, url: '' };

    if (/\.(m3u8|mp4)(\?|$)/.test(vid)) {
        return { parse: 0, url: vid, header: http.defaults.headers };
    }

    if (vid.includes('aojiexi.com')) {
        return { parse: 0, url: decodeAojiexi(vid), header: http.defaults.headers };
    }

    if (vid.startsWith('http')) {
        const html = await fetchHtml(vid);
        if (html) {
            const m = html.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/);
            if (m) return { parse: 0, url: m[0], header: http.defaults.headers };
        }
    }

    return { parse: 1, url: vid };
}

async function search(inReq, _outResp) {
    const key  = inReq.body.wd || '';
    const pg   = parseInt(inReq.body.pg) || 1;
    if (!key) return { list: [] };

    const url  = `${site}/vodlist/type/all/keyword/${encodeURIComponent(key)}/orderby/default/page/${pg}.html`;
    const html = await fetchHtml(url);
    const data = extractVodData(html);
    if (!data) return { list: [] };

    return { list: parseList(data.request_data?.list || []) };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: { key: 'prshinezenx', name: '🔥怦然心动', type: 1 },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
    },
};