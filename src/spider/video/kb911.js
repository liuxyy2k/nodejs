import axios from 'axios';
import * as cheerio from 'cheerio';

const site = 'https://kb11.adultporna-av1sim111.xyz';

const UA = 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.87 Safari/537.36';

const http = axios.create({
    timeout: 15_000,
    headers: { 'User-Agent': UA },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchHtml(url, extraHeaders = {}) {
    const { data } = await http.get(url, { headers: extraHeaders });
    return data;
}

function parseCards($) {
    const list = [];
    $('ul.row.row-space8.row-m-space8 li').each((_, el) => {
        const a       = $(el).find('section a');
        const name    = a.attr('title') || '';
        const id      = a.attr('href')  || '';
        const remarks = a.find('span small').text().trim();
        const pic     = a.find('img').attr('src') || '';
        if (!name || !id) return;
        list.push({ vod_id: id, vod_name: name, vod_pic: pic, vod_remarks: remarks });
    });
    return list;
}

// ─── Static Classes ───────────────────────────────────────────────────────────

const STATIC_CLASSES = [
    { type_id: '/t/86',  type_name: '女优' },
    { type_id: '/t/141', type_name: '日本番號' },
    { type_id: '/t/1',   type_name: '日本有码' },
    { type_id: '/t/5',   type_name: '日本无码' },
    { type_id: '/t/32',  type_name: '日本巨乳无码' },
    { type_id: '/t/34',  type_name: '日本人妻无码' },
    { type_id: '/t/35',  type_name: '日本制服无码' },
    { type_id: '/t/223', type_name: '日本乱伦无码' },
    { type_id: '/t/224', type_name: '日本强奸无码' },
    { type_id: '/t/36',  type_name: '日本丝袜美腿' },
    { type_id: '/t/13',  type_name: '日本中文字幕' },
    { type_id: '/t/53',  type_name: '日本绝美少女' },
    { type_id: '/t/6',   type_name: '日本强奸乱伦' },
    { type_id: '/t/7',   type_name: '日本巨乳' },
    { type_id: '/t/9',   type_name: '日本制服诱惑' },
    { type_id: '/t/11',  type_name: '日本调教' },
    { type_id: '/t/58',  type_name: '日本口爆' },
    { type_id: '/t/30',  type_name: '欧美' },
    { type_id: '/t/164', type_name: '成人动漫' },
    { type_id: '/t/85',  type_name: '伦理电影' },
    { type_id: '/t/2',   type_name: '国产传媒' },
    { type_id: '/t/163', type_name: '国产视频' },
    { type_id: '/t/67',  type_name: '国产空姐模特' },
    { type_id: '/t/69',  type_name: '国产学生' },
    { type_id: '/t/70',  type_name: '国产人妻熟女' },
    { type_id: '/t/71',  type_name: '国产乱伦' },
    { type_id: '/t/72',  type_name: '国产自慰' },
    { type_id: '/t/73',  type_name: '国产野合车震' },
    { type_id: '/t/75',  type_name: '国产名人' },
    { type_id: '/t/74',  type_name: '国产OL' },
    { type_id: '/t/18',  type_name: '国产剧情' },
    { type_id: '/t/19',  type_name: '国产偷拍' },
    { type_id: '/t/76',  type_name: '国产网曝' },
    { type_id: '/t/227', type_name: '综合传媒' },
    { type_id: '/t/38',  type_name: '麻豆合集' },
    { type_id: '/t/109', type_name: '葫芦影业' },
    { type_id: '/t/111', type_name: '天美传媒' },
    { type_id: '/t/112', type_name: '果冻传媒' },
    { type_id: '/t/131', type_name: '91制片厂' },
    { type_id: '/t/113', type_name: '蜜桃传媒' },
    { type_id: '/t/114', type_name: '精东影业' },
    { type_id: '/t/115', type_name: '皇家华人' },
    { type_id: '/t/116', type_name: 'SWAG' },
    { type_id: '/t/120', type_name: '兔子先生' },
    { type_id: '/t/122', type_name: 'PsychoPornTW' },
    { type_id: '/t/124', type_name: '微啪 & 陌丽影像传媒' },
    { type_id: '/t/125', type_name: '大象传媒' },
    { type_id: '/t/126', type_name: '乌鸦传媒' },
    { type_id: '/t/225', type_name: '综合番号' },
    { type_id: '/t/142', type_name: '200GANA' },
    { type_id: '/t/146', type_name: '259LUXU' },
    { type_id: '/t/147', type_name: '261ARA' },
    { type_id: '/t/148', type_name: '277DCV' },
    { type_id: '/t/143', type_name: '300MIUM' },
    { type_id: '/t/149', type_name: '300MAAN' },
    { type_id: '/t/150', type_name: '300NTK' },
    { type_id: '/t/152', type_name: '328HMDN' },
    { type_id: '/t/154', type_name: '336KNB' },
    { type_id: '/t/155', type_name: '348NTR' },
    { type_id: '/t/156', type_name: '390JAC' },
    { type_id: '/t/158', type_name: '428SUKE' },
    { type_id: '/t/181', type_name: 'AARM' },
    { type_id: '/t/180', type_name: 'ADN' },
    { type_id: '/t/185', type_name: 'ATID' },
    { type_id: '/t/192', type_name: 'DFDM' },
    { type_id: '/t/194', type_name: 'DLDSS' },
];

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [...STATIC_CLASSES];
    const seen    = new Set(classes.map((c) => c.type_name));

    try {
        const html = await fetchHtml(`${site}/zzzz`);
        const $    = cheerio.load(html);
        $('dd').each((_, el) => {
            const a    = $(el).find('a');
            const name = a.text().trim();
            const id   = (a.attr('href') || '').replace(/\/$/, '');
            if (!name || !id || seen.has(name)) return;
            seen.add(name);
            classes.push({ type_id: id, type_name: name });
        });
    } catch { /* ignore */ }

    // 首页视频
    let list = [];
    try {
        const html = await fetchHtml(`${site}/show/30/`);
        list = parseCards(cheerio.load(html));
    } catch { /* ignore */ }

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const cid  = inReq.body.id;
    let   pg   = parseInt(inReq.body.page) || 1;
    if (pg === 0) pg = 1;

    const url  = pg === 1 ? `${site}${cid}` : `${site}${cid}-${pg}`;
    const html = await fetchHtml(url);
    const list = parseCards(cheerio.load(html));

    return { page: pg, pagecount: 9999, limit: 90, total: 999999, list };
}

async function detail(inReq, _outResp) {
    const did  = inReq.body.id.replace('voddetail', 'v');
    const html = await fetchHtml(`${site}${did}`);

    const match = html.match(/"","url":"(.*?)"/);
    if (!match) return { list: [] };

    const playUrl = match[1].replace(/\\/g, '');
    return {
        list: [{
            vod_id:        did,
            vod_name:      '',
            vod_pic:       '',
            vod_play_from: '91网曝',
            vod_play_url:  '播放$'+playUrl,
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse:  0,
        url:    inReq.body.id,
        header: { 'User-Agent': UA },
    };
}

async function search(inReq, _outResp) {
    const key  = inReq.body.wd || '';
    let   pg   = parseInt(inReq.body.pg) || 1;
    if (pg === 0) pg = 1;

    const url  = `${site}/s/page/${pg}/wd/${encodeURIComponent(key)}`;
    const html = await fetchHtml(url, { 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' });
    const list = parseCards(cheerio.load(html));

    return { page: pg, pagecount: 9999, limit: 90, total: 999999, list };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'kb11',
        name: '🔥91网曝黑料',
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