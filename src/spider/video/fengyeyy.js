import axios from 'axios';
import * as cheerio from 'cheerio';

const site = 'https://maihaolian.com';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

const http = axios.create({
    timeout: 15_000,
    headers: {
        'User-Agent':      UA,
        Accept:            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    },
});

// ─── Static Filters ───────────────────────────────────────────────────────────

const AREA = [
    {n:'全部',v:''},{n:'大陆',v:'大陆'},{n:'香港',v:'香港'},{n:'台湾',v:'台湾'},
    {n:'美国',v:'美国'},{n:'韩国',v:'韩国'},{n:'日本',v:'日本'},{n:'泰国',v:'泰国'},
    {n:'新加坡',v:'新加坡'},{n:'马来西亚',v:'马来西亚'},{n:'印度',v:'印度'},
    {n:'英国',v:'英国'},{n:'法国',v:'法国'},{n:'加拿大',v:'加拿大'},
    {n:'西班牙',v:'西班牙'},{n:'俄罗斯',v:'俄罗斯'},{n:'其它',v:'其它'},
];
const YEAR = [
    {n:'全部',v:''},...['2026','2025','2024','2023','2022','2021','2020','2019','2018',
    '2017','2016','2015','2014','2013','2012','2011','2010','2009','2008','2007',
    '2006','2005','2004'].map(y=>({n:y,v:y})),
];
const LANG = [
    {n:'全部',v:''},{n:'国语',v:'国语'},{n:'英语',v:'英语'},{n:'粤语',v:'粤语'},
    {n:'闽南语',v:'闽南语'},{n:'韩语',v:'韩语'},{n:'日语',v:'日语'},
    {n:'法语',v:'法语'},{n:'德语',v:'德语'},{n:'其它',v:'其它'},
];
const SORT   = [{n:'时间',v:'time'},{n:'人气',v:'hits'},{n:'评分',v:'score'}];
const LETTER = [{n:'全部',v:''},...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c=>({n:c,v:c})),{n:'0-9',v:'0-9'}];

function nv(pairs) { return pairs.map(([n,v])=>({n,v})); }

const FILTERS = {
    '2': [
        {key:'class', name:'类型', value:[{n:'全部',v:'2'},{n:'国产剧',v:'13'},{n:'日韩剧',v:'15'},{n:'海外剧',v:'16'}]},
        {key:'area',  name:'地区', value:AREA},
        {key:'genre', name:'剧情', value:nv([['全部',''],['古装','古装'],['战争','战争'],['青春偶像','青春偶像'],['喜剧','喜剧'],['家庭','家庭'],['犯罪','犯罪'],['动作','动作'],['奇幻','奇幻'],['剧情','剧情'],['历史','历史'],['经典','经典'],['乡村','乡村'],['情景','情景'],['商战','商战'],['网剧','网剧'],['其他','其他']])},
        {key:'year',   name:'年份', value:YEAR},
        {key:'lang',   name:'语言', value:LANG},
        {key:'letter', name:'字母', value:LETTER},
        {key:'sort',   name:'排序', value:SORT},
    ],
    '1': [
        {key:'class', name:'类型', value:[{n:'全部',v:'1'},{n:'动作片',v:'6'},{n:'喜剧片',v:'7'},{n:'恐怖片',v:'8'},{n:'科幻片',v:'9'},{n:'爱情片',v:'10'},{n:'剧情片',v:'11'},{n:'战争片',v:'12'},{n:'纪录片',v:'20'}]},
        {key:'area',  name:'地区', value:AREA},
        {key:'genre', name:'剧情', value:nv([['全部',''],['喜剧','喜剧'],['爱情','爱情'],['恐怖','恐怖'],['动作','动作'],['科幻','科幻'],['剧情','剧情'],['战争','战争'],['警匪','警匪'],['犯罪','犯罪'],['动画','动画'],['奇幻','奇幻'],['武侠','武侠'],['冒险','冒险'],['枪战','枪战'],['悬疑','悬疑'],['惊悚','惊悚'],['经典','经典'],['青春','青春'],['文艺','文艺'],['微电影','微电影'],['古装','古装'],['历史','历史'],['运动','运动'],['农村','农村'],['儿童','儿童'],['网络电影','网络电影']])},
        {key:'year',   name:'年份', value:YEAR},
        {key:'lang',   name:'语言', value:LANG},
        {key:'letter', name:'字母', value:LETTER},
        {key:'sort',   name:'排序', value:SORT},
    ],
    '4': [
        {key:'class', name:'类型', value:[{n:'全部',v:'4'},{n:'国产动漫',v:'25'},{n:'日韩动漫',v:'26'}]},
        {key:'genre', name:'剧情', value:nv([['全部',''],['情感','情感'],['科幻','科幻'],['热血','热血'],['推理','推理'],['搞笑','搞笑'],['冒险','冒险'],['奇幻','奇幻'],['战斗','战斗'],['校园','校园'],['萝莉','萝莉'],['治愈','治愈'],['原创','原创'],['亲子','亲子'],['益智','益智'],['励志','励志'],['其他','其他']])},
        {key:'area',  name:'地区', value:[{n:'全部',v:''},{n:'大陆',v:'大陆'},{n:'香港',v:'香港'},{n:'台湾',v:'台湾'},{n:'美国',v:'美国'},{n:'韩国',v:'韩国'},{n:'日本',v:'日本'},{n:'法国',v:'法国'},{n:'英国',v:'英国'},{n:'其它',v:'其它'}]},
        {key:'year',   name:'年份', value:YEAR},
        {key:'lang',   name:'语言', value:LANG},
        {key:'letter', name:'字母', value:LETTER},
        {key:'sort',   name:'排序', value:SORT},
    ],
    '3': [
        {key:'class', name:'类型', value:[{n:'全部',v:'3'},{n:'大陆综艺',v:'21'},{n:'日韩综艺',v:'22'}]},
        {key:'genre', name:'剧情', value:nv([['全部',''],['选秀','选秀'],['情感','情感'],['访谈','访谈'],['播报','播报'],['音乐','音乐'],['美食','美食'],['旅游','旅游'],['搞笑','搞笑'],['游戏','游戏'],['亲子','亲子'],['其它','其它']])},
        {key:'area',  name:'地区', value:[{n:'全部',v:''},{n:'大陆',v:'大陆'},{n:'香港',v:'香港'},{n:'台湾',v:'台湾'},{n:'美国',v:'美国'},{n:'韩国',v:'韩国'},{n:'日本',v:'日本'},{n:'英国',v:'英国'},{n:'其它',v:'其它'}]},
        {key:'year',   name:'年份', value:YEAR},
        {key:'lang',   name:'语言', value:LANG},
        {key:'letter', name:'字母', value:LETTER},
        {key:'sort',   name:'排序', value:SORT},
    ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchHtml(url) {
    if (!url.startsWith('http')) url = site + url;
    const { data } = await http.get(url);
    return data;
}

function fixPic(u) {
    if (!u) return '';
    if (u.startsWith('//')) return 'https:' + u;
    return u.replace(/&amp;/g, '&');
}

function parseVideoList(html) {
    const $      = cheerio.load(html);
    const videos = [];
    const seen   = new Set();

    $('a.public-list-exp').each((_, el) => {
        const a    = $(el);
        const href = a.attr('href') || '';
        const m    = href.match(/\/detail\/(\d+)\.html/);
        if (!m) return;
        const vodId = m[1];
        if (seen.has(vodId)) return;
        seen.add(vodId);

        const span    = a.find('span.public-prt').toArray().map((s) => $(s).text()).join(',');
        const imgEl   = a.find('img').first();
        const vodName = a.attr('title') || imgEl.attr('alt') || '';
        const vodPic  = fixPic(imgEl.attr('data-src') || '');
        const remarkEl = a.find('.ft2, .public-list-prb').first();
        const remarks  = remarkEl.text().trim();

        videos.push({ vod_id: vodId, vod_name: vodName.trim(), vod_pic: vodPic, vod_remarks: remarks, vod_year: span });
    });
    return videos;
}

function parseSearchList(html) {
    const $      = cheerio.load(html);
    const videos = [];
    const seen   = new Set();

    $('a.public-list-exp').each((_, el) => {
        const a    = $(el);
        const href = a.attr('href') || '';
        const m    = href.match(/\/detail\/(\d+)\.html/);
        if (!m) return;
        const vodId = m[1];
        if (seen.has(vodId)) return;
        seen.add(vodId);

        const imgEl  = a.find('img').first();
        const vodPic = fixPic(imgEl.attr('data-src') || '');
        const titleEl = $(`a.thumb-txt[href="/detail/${vodId}.html"]`).first();
        const vodName = titleEl.text().trim() || imgEl.attr('alt') || '';
        const remarkEl = a.find('.public-list-prb, .ft2').first();

        videos.push({ vod_id: vodId, vod_name: vodName.trim(), vod_pic: vodPic, vod_remarks: remarkEl.text().trim() });
    });
    return videos;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    let list = [];
    try {
        const html = await fetchHtml('/');
        list = parseVideoList(html);
    } catch { /* ignore */ }

    return {
        class: [
            {type_id:'/label/qq',   type_name:'腾讯VIP精选'},
            {type_id:'/label/bli',  type_name:'B站VIP精选'},
            {type_id:'/label/youku',type_name:'优酷VIP精选'},
            {type_id:'5',           type_name:'红果短剧'},
            {type_id:'2',           type_name:'电视剧'},
            {type_id:'1',           type_name:'电影'},
            {type_id:'4',           type_name:'动漫'},
            {type_id:'3',           type_name:'综艺'},
        ],
        filters: FILTERS,
        list,
    };
}

async function category(inReq, _outResp) {
    const tid    = inReq.body.id;
    const pg     = parseInt(inReq.body.page) || 1;
    const extend = inReq.body.extend || {};
    const filter = inReq.body.filter || {};

    // label 分类
    if (tid.startsWith('/label')) {
        const html  = await fetchHtml(`${tid}/page/${pg}.html`);
        const items = parseVideoList(html);
        return { list: items, page: pg, pagecount: items.length < 24 ? pg : pg + 2, limit: 24, total: (items.length < 24 ? pg : pg + 2) * 24 };
    }

    // 合并 extend + filter
    const args = {};
    if (extend && typeof extend === 'object') {
        for (const [k, v] of Object.entries(extend)) { if (v) args[k] = String(v); }
    }
    if (filter && typeof filter === 'object') {
        for (const [k, v] of Object.entries(filter)) { if (v && !(k in args)) args[k] = String(v); }
    }

    const routeTid = args.class || args.tid || String(tid);
    const area     = args.area   || '';
    const genre    = args.genre  || '';
    const year     = args.year   || '';
    const lang     = args.lang   || '';
    const letter   = args.letter || '';
    const sort     = args.sort   || '';

    // 无筛选
    if (!area && !genre && !year && !lang && !letter && !sort) {
        const html  = await fetchHtml(`/cupfox-list/${routeTid}--------${pg}---.html`);
        const items = parseVideoList(html);
        const $     = cheerio.load(html);
        let pagecount = pg;
        $('a.page-link').each((_, el) => {
            if ($(el).text() === '尾页') {
                const m = ($(el).attr('href') || '').match(/---(\d+)---/);
                if (m) { pagecount = parseInt(m[1]); return false; }
            }
        });
        if (!items.length) pagecount = 0;
        return { list: items, page: pg, pagecount, limit: 36, total: 9999 };
    }

    // 有筛选
    const segs = [routeTid, area, sort, genre, lang, letter, '', '', year];
    const url  = `/cupfox-list/${segs.join('-')}.html`;
    const html = await fetchHtml(url);
    return { list: parseVideoList(html), page: 1, pagecount: 1, limit: 36, total: 9999 };
}

async function detail(inReq, _outResp) {
    const vid = (inReq.body.id || '').split(',')[0].trim();
    try {
        const html = await fetchHtml(`/detail/${vid}.html`);
        const $    = cheerio.load(html);

        const vodName = $('h3.slide-info-title').text().trim();
        const picEl   = $('img.lazy').first();
        const vodPic  = fixPic(picEl.attr('data-src') || '');

        let vodDirector = '', vodActor = '';
        $('.slide-info').each((_, el) => {
            const text = $(el).text().replace(/\s+/g, ' ').trim();
            if (text.startsWith('导演：')) vodDirector = text.replace('导演：', '').trim();
            else if (text.startsWith('演员：')) vodActor = text.replace('演员：', '').trim();
        });

        const vodContent = $('#height_limit').text().replace(/\s+/g, ' ').trim();

        const playFrom = [];
        $('.anthology-tab a.swiper-slide').each((_, el) => {
            const name = $(el).text().trim();
            if (name) playFrom.push(name);
        });

        const playUrl = [];
        $('.anthology-list-box').each((i, block) => {
            const epList = [];
            $(block).find('li a').each((_, a) => {
                const href = $(a).attr('href') || '';
                const m    = href.match(/\/play\/(.*?)\.html/);
                if (m) epList.push(`${$(a).text().trim()}$${vid}-${m[1]}`);
            });
            epList.reverse();
            if (epList.length && i < playFrom.length) playUrl.push(epList.join('#'));
        });

        const validFrom = playFrom.filter((_, i) => i < playUrl.length);

        return {
            list: [{
                vod_id:        vid,
                vod_name:      vodName,
                vod_pic:       vodPic,
                vod_director:  vodDirector,
                vod_actor:     vodActor,
                vod_content:   vodContent,
                vod_play_from: validFrom.join('$$$'),
                vod_play_url:  playUrl.join('$$$'),
            }],
        };
    } catch {
        return { list: [] };
    }
}

async function play(inReq, _outResp) {
    const id  = inReq.body.id;
    const url = id.startsWith('http') ? id : `${site}/play/${id}.html`;

    try {
        const html = await fetchHtml(url);
        const m    = html.match(/player_aaaa=(.*?)<\/script>/s);
        if (!m) return { parse: 1, url };

        let pd = {};
        try { pd = JSON.parse(m[1]); } catch { /* ignore */ }

        const playUrl = pd.url;
        const playId  = pd.from;

        if (!playUrl) return { parse: 0, url: 'https://php.doube.eu.org/error.m3u8', header: { 'User-Agent': 'Mozilla/5.0' } };

        if (playUrl.startsWith('http') && (playUrl.endsWith('.m3u8') || playUrl.endsWith('.mp4'))) {
            return { parse: 0, url: playUrl, header: { 'User-Agent': 'Mozilla/5.0' } };
        }

        // 第三方解析
        const apiMap = {
            YYNB: 'https://zzrs.mfdyvip.com/player/mplayer.php',
            JD4K: 'https://fgsrg.hzqingshan.com/player/mplayer.php',
        };

        const mobileUA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
        const headers  = {
            'User-Agent':   mobileUA,
            Accept:         'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-language': 'zh-CN,zh;q=0.9',
            referer:        'https://www.ht10010.com/',
        };

        const page1 = await http.get(`https://fgsrg.hzqingshan.com/player/?url=${playUrl}`, { headers });
        const tokenM = page1.data.match(/data-te="(.*?)"/);
        if (!tokenM) return { parse: 1, url };

        const { data: result } = await http.post(apiMap[playId], new URLSearchParams({ url: playUrl, token: tokenM[1] }), {
            headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        if (result.code === 200 && result.url) {
            return {
                parse:  0,
                url:    result.url,
                header: { 'User-Agent': UA },
            };
        }
    } catch { /* ignore */ }

    return { parse: 1, url };
}

async function search(inReq, _outResp) {
    const key     = decodeURIComponent(inReq.body.wd || '');
    const pg      = parseInt(inReq.body.pg) || 1;
    const html    = await fetchHtml(`/cupfox-search/${encodeURIComponent(key)}----------${pg}---.html`);
    const items   = parseSearchList(html);
    return { list: items, page: pg, pagecount: 1, limit: 36, total: items.length };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'maihaolian',
        name: '🎬枫叶影院',
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