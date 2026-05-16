import axios from 'axios';
import * as cheerio from 'cheerio';

// import { HttpsProxyAgent } from 'https-proxy-agent';
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const site = 'https://www.tube8.com';

const UA = 'Mozilla/5.0 (Linux; Android 10; SM-G960F Build/QP1A.190711.020; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0.6943.98 Mobile Safari/537.36';

const http = axios.create({
    timeout: 15_000,
    headers: {
        'User-Agent': UA,
        Accept:       'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        Referer:      site + '/',
    },
    // httpsAgent: agent,
});

// ─── 分类中文映射 ─────────────────────────────────────────────────────────────

const CAT_MAP = {
    'amateur': '业余自拍', 'anal': '肛交', 'asian': '亚裔', 'bigdick': '大屌',
    'blowjob': '口交', 'creampie': '内射', 'ebony': '黑人', 'fetish': '恋物',
    'gay': '同性', 'hardcore': '硬核', 'hentai': '动漫', 'latina': '拉丁',
    'lesbian': '女同', 'mature': '熟女', 'milf': '人妻', 'public': '公共场所',
    'teens': '少女(18+)', 'threesome': '3P/多P', 'vr-porn': 'VR视频',
    'big-tits': '巨乳', 'blonde': '金发', 'facial': '颜射', 'gangbang': '群交',
    'handjob': '手淫', 'massage': '按摩', 'masturbation': '自慰', 'pov': '第一人称',
    'roleplay': '角色扮演', 'squirt': '潮吹', 'stockings': '丝袜', 'student': '学生',
    'babe': '美女', 'bbw': '肥满', 'brunette': '黑发', 'bukkake': '颜射派对',
    'cartoon': '卡通', 'casting': '试镜', 'compilation': '合集', 'cosplay': 'Cosplay',
    'couple': '情侣', 'cumshot': '射精', 'double-penetration': '双洞',
    'euro': '欧洲', 'funny': '搞笑', 'group-sex': '群交', 'homemade': '自制',
    'indian': '印度', 'interracial': '跨种族', 'japanese': '日本', 'outdoor': '户外',
    'reality': '真人秀', 'redhead': '红发', 'school': '学校', 'step-fantasy': '继亲幻想',
    'striptease': '脱衣舞', 'toys': '玩具', 'vintage': '经典', 'webcam': '网络摄像头',
    'china': '中国', 'korean': '韩国', 'thai': '泰国', 'filipina': '菲律宾',
    'vietnamese': '越南', 'taiwanese': '台湾', 'hong-kong': '香港',
    'russian': '俄罗斯', 'german': '德国', 'french': '法国', 'british': '英国',
    'american': '美国', 'italian': '意大利', 'brazilian': '巴西', 'czech': '捷克',
};

const Q_MAP = { '4K': 2160, '2160': 2160, '1440': 1440, '1080': 1080, '720': 720, '480': 480, '240': 240 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fixUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return site + (url.startsWith('/') ? '' : '/') + url;
}

async function getHtml(url) {
    try {
        const { data } = await http.get(fixUrl(url));
        return data;
    } catch(err) {
        console.error(err);
        return '<html></html>';
    }
}

function makeFolder(href, name, pic, ratio) {
    return {
        vod_id:   `folder_${href}`,
        vod_name: name.trim(),
        vod_pic:  pic,
        vod_tag:  'folder',
        style:    { ratio, type: 'rect' },
    };
}

function parseVideoList($) {
    const list = [];
    $('.video-box, .videoblock').each((_, el) => {
        const item = $(el);
        const link = item.find('a.tmvideolink').length ? item.find('a.tmvideolink') : item.find('a').first();
        const href = link.attr('href') || '';
        if (!href || !href.includes('porn-video')) return;

        const title    = item.find('.video-title-text').text().trim()
                      || link.attr('title')
                      || item.find('img').attr('alt')
                      || '';
        const pic      = item.find('img.thumb-image').attr('data-src') || item.find('img').attr('src') || '';
        const duration = item.find('.video-duration').text().trim();

        list.push({
            vod_id:      fixUrl(href),
            vod_name:    title,
            vod_pic:     pic,
            vod_remarks: duration,
            style:       { ratio: 1.77, type: 'rect' },
        });
    });
    return list;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '/newest.html',    type_name: '最新视频' },
        {type_id: 'top.html',    type_name: '评分最高' },
        { type_id: '/categories', type_name: '类别大全' },
        { type_id: '/top-channels/',  type_name: '全部频道' },
        { type_id: '/pornstars', type_name: '全部明星' },
    ];

    const sortFilter = {
        key: 'sort', name: '排序', value: [
            { n: '最新', v: '' },
            { n: '最热', v: '/most-viewed' },
            { n: '评分', v: '/best' },
            { n: '最长', v: '/longest' },
        ],
    };

    const filters = Object.fromEntries(classes.map((c) => [c.type_id, [sortFilter]]));

    // 首页视频
    let list = [];
    try {
        const html = await getHtml('/newest');
        list = parseVideoList(cheerio.load(html));
    } catch { /* ignore */ }

    return { class: classes, filters, list };
}

async function category(inReq, _outResp) {
    const tid    = inReq.body.id;
    const pg     = parseInt(inReq.body.page) || 1;
    const extend = inReq.body.extend || {};
    let   vdata  = [];

    // ── 类别大全 ──────────────────────────────────────────────────────────────
    if (tid === '/categories') {
        const html = await getHtml('/categories.html');
        const $    = cheerio.load(html);
        $('a[href*="/cat/"]').each((_, el) => {
            const href = $(el).attr('href') || '';
            if (!href || href.includes('porn-video')) return;
            const catKey  = href.replace(/\/$/, '').split('/').pop();
            const rawName = $(el).text().replace('Category', '').trim();
            const name    = CAT_MAP[catKey] || rawName;
            const pic      = $(el).find('img').attr('src') || $(el).find('img').attr('data-src') || '';
            vdata.push(makeFolder(href, name, pic, 1.33));
        });

    // ── 全部频道 ──────────────────────────────────────────────────────────────
    } else if (tid === '/top-channels/') {
        const url  = pg !== 1 ? `/top-channels?page=${pg}/` : '/top-channels/';
        const html = await getHtml(url);
        const $    = cheerio.load(html);
        $('a[href*="/channel/"]').each((_, el) => {
            const href = $(el).attr('href') || '';
            if (!href || href.includes('porn-video')) return;
            const name = $(el).find('.channel-name').text() || $(el).find('.title').text() || $(el).text();
            const pic  = $(el).find('img').attr('src') || $(el).find('img').attr('data-src') || '';
            vdata.push(makeFolder(href, name, pic, 1.0));
        });

    // ── 全部明星 ──────────────────────────────────────────────────────────────
    } else if (tid === '/pornstars') {
        const url  = pg !== 1 ? `/pornstars/page/${pg}/` : '/pornstars/';
        const html = await getHtml(url);
        const $    = cheerio.load(html);
        console.log(url)
        $('.performer-link').each((_, el) => {
            
            const href = $(el).attr('href') || '';
            
            if (!href || href.includes('porn-video')) return;
            const name = $(el).find('.pornstar-name').text() || $(el).text();
            const pic  = $(el).find('img').attr('src') || $(el).find('img').attr('data-src') || '';
            vdata.push(makeFolder(href, name, pic, 0.75));
        });

    // ── 视频列表（最新 / 分类 / 频道 / 明星 子页）────────────────────────────
    } else {
        let realTid = tid.replace('folder_', '').replace(/\/$/, '');

        const sort = extend.sort || '';
        if (sort && !realTid.includes(sort)) realTid += sort;

        const isEntityPage = realTid.includes('/pornstar/') || realTid.includes('/channel/');
        let url;
        if (pg === 1) {
            url = realTid;
        } else {
            url = isEntityPage ? `${realTid}/?page=${pg}` : `${realTid}/page/${pg}/`;
        }
        const html = await getHtml(url);
        
        vdata = parseVideoList(cheerio.load(html));
    }

    return { page: pg, pagecount: 9999, limit: 20, total: 999999, list: vdata };
}

async function detail(inReq, _outResp) {
    const pageUrl = inReq.body.id;
    let html;
    try {
        const { data, status } = await http.get(pageUrl);
        html = data;
        if (status === 404) return { list: [{ vod_name: '视频已删除', vod_play_url: '' }] };
    } catch {
        return { list: [] };
    }

    if (['has been flagged', 'Disabled Video', 'Removed Video', 'Inactive Video'].some((x) => html.includes(x))) {
        return { list: [{ vod_name: '视频已删除', vod_play_url: '' }] };
    }

    const $ = cheerio.load(html);
    const title = $('meta[property="og:title"]').attr('content') || 'Unknown';
    const cover = $('meta[property="og:image"]').attr('content') || '';

    let videoUrls = [];
    try {
        const m = html.match(/"format":"mp4",.*?"videoUrl":"([^"]+)"/);
        if (m) {
            const jsonUrl  = m[1].replace(/\\\//g, '/');
            const { data } = await http.get(jsonUrl);

            const valid = data
                .filter((e) => e.videoUrl)
                .map((e) => {
                    let q  = String(e.quality || 'SD').toUpperCase();
                    if (!q.endsWith('P')) q += 'P';
                    let qv = 0;
                    for (const [k, v] of Object.entries(Q_MAP)) {
                        if (q.includes(k)) { qv = v; break; }
                    }
                    return { q, qv, url: e.videoUrl };
                })
                .sort((a, b) => b.qv - a.qv);

            videoUrls = valid.map((i) => `${i.q}$${i.url}`);
        } else {
            videoUrls = ['解析失败$ERROR'];
        }
    } catch (e) {
        videoUrls = [`解析异常$${e.message}`];
    }

    return {
        list: [{
            vod_name:      title,
            vod_pic:       cover,
            vod_play_from: 'Tube8',
            vod_play_url:  videoUrls.join('#'),
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse:  0,
        url:    inReq.body.id,
        header: { 'User-Agent': UA, Referer: site + '/' },
    };
}

async function search(inReq, _outResp) {
    const key  = inReq.body.wd || '';
    const pg   = parseInt(inReq.body.pg) || 1;
    const html = await getHtml(`/searches.html?q=${encodeURIComponent(key)}&page=${pg}`);
    return { list: parseVideoList(cheerio.load(html)), page: pg };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'tube8',
        name: '🔥Tube8',
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