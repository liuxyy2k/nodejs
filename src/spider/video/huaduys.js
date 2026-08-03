import axios from 'axios';
import * as cheerio from 'cheerio';


const site = 'https://hd28.huadutx.com/';

const UA_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0';
const UA_MOBILE = 'Linux; Android 12; Pixel 3 XL) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.101 Mobile Safari/537.36';

// 运行时 Cookie（init 时获取）
let cookieStr = '';

const http = axios.create({ timeout: 15_000 });

// ─── Cookie 初始化 ────────────────────────────────────────────────────────────

async function fetchCookie() {
    try {
        const res = await axios.get(site, {
            headers: { 'User-Agent': UA_PC },
            maxRedirects: 5,
        });
        const cookies = res.headers['set-cookie'] || [];
        const jar = {};
        for (const c of cookies) {
            const m = c.match(/^([^=]+)=([^;]*)/);
            if (m) jar[m[1].trim()] = m[2].trim();
        }
        const session = jar['server_name_session'] || '';
        const first   = Object.entries(jar).find(([k]) => k !== 'server_name_session');
        const parts   = [];
        if (first)   parts.push(`${first[0]}=${first[1]}`);
        if (session) parts.push(`server_name_session=${session}`);
        cookieStr = parts.join('; ');
    } catch { /* ignore */ }
}

function getHeaders(extraHost = 'rb.huaduys.org') {
    return {
        Host:                     extraHost,
        Connection:               'keep-alive',
        'User-Agent':             UA_PC,
        Accept:                   'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Sec-Fetch-Site':         'same-origin',
        'Sec-Fetch-Mode':         'navigate',
        'Sec-Fetch-Dest':         'document',
        Referer:                  'https://rb.huaduys.org/',
        'Accept-Language':        'zh-CN,zh;q=0.9',
        Cookie:                   cookieStr,
        'Accept-Encoding':        'gzip, deflate',
    };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchHtml(url) {
    const { data } = await http.get(url, { headers: getHeaders() });
    return data;
}

// extractMiddleText (pl=0: 提取两端字符串之间的文本)
function extractBetween(text, start, end) {
    const si = text.indexOf(start);
    if (si === -1) return '';
    const ei = text.indexOf(end, si + start.length);
    if (ei === -1) return '';
    return text.slice(si + start.length, ei).replace(/\\/g, '');
}

// extractMiddleText pl=1: 匹配 regex，返回空格拼接结果
function extractMatches(text, start, end, re) {
    const si = text.indexOf(start);
    if (si === -1) return '';
    const ei = text.indexOf(end, si + start.length);
    if (ei === -1) return '';
    const mid = text.slice(si + start.length, ei);
    const matches = [...mid.matchAll(new RegExp(re, 'gs'))].map((m) => m[1]);
    return matches.join(' ');
}

function parseVideos($) {
    const videos = [];
    const skip = new Set(['广告点赞']);

    $('ul.stui-vodlist.clearfix').each((_, ulEl) => {
        $(ulEl).find('li').each((_, li) => {
            const item   = $(li);
            const thumb  = item.find('a.stui-vodlist__thumb.picture.w-thumb.img-shadow');
            const remark = thumb.text().trim() + '点赞';
            if (skip.has(remark)) return;

            const h4   = item.find('h4.title.text-overflow');
            const name = h4.text().trim();
            const id   = h4.find('a').attr('href') || '';
            let   pic  = item.find('img').attr('data-original') || '';
            if (pic && !pic.startsWith('http')) pic = site + pic;

            videos.push({ vod_id: id, vod_name: name, vod_pic: pic, vod_remarks: '集多▶️' + remark });
        });
    });
    return videos;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    await fetchCookie();
    return {};
}

async function home(_inReq, _outResp) {
    const html = await fetchHtml(site);
    const $    = cheerio.load(html);

    const classes = [];
    const skip    = new Set(['首页', '发布页', '免费VPN下载']);

    $('ul.stui-header__menu.type-slide li').each((_, li) => {
        const name = $(li).text().trim();
        if (skip.has(name)) return;
        const href = $(li).find('a').attr('href') || '';
        const fenge = href.split('.html');
        const id = `${fenge[0]}-----------.html`.replace('vodtype', 'vodshow');
        classes.push({ type_id: id, type_name: '集多🌠' + name });
    });

    const list = parseVideos($);
    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const cid  = inReq.body.id;
    const pg   = parseInt(inReq.body.page) || 1;
    const fenge = cid.split('---.html');
    const url   = `${site}${fenge[0]}${pg}---.html`;

    const html = await fetchHtml(url);
    const $    = cheerio.load(html);
    return { list: parseVideos($), page: pg, pagecount: 9999, limit: 90, total: 999999 };
}

async function detail(inReq, _outResp) {
    let did = inReq.body.id;
    if (!did.startsWith('http')) did = site + did;

    let res = await fetchHtml(did);
    // HTML 实体解码
    res = res.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

    // 获取外部配置（跳转链接）
    let jumpName = '', jumpUrl = '';
    try {
        const { data: code } = await http.get('http://rihou.cc:88/je.json');
        jumpName = extractBetween(code, "s1='", "'");
        jumpUrl  = extractBetween(code, "s2='", "'");
    } catch { /* ignore */ }

    const content  = '集多🎉为您介绍剧情📢' + extractMatches(res, '标题：', '</span>', /alt="(.*?)"/g);
    const director = extractMatches(res, '分类：', '</p>',   /target=".*?">(.*?)<\/a>/g);
    const actor    = extractMatches(res, '演员：', '</span>', /target=".*?">(.*?)<\/a>/g);
    const remarks  = extractMatches(res, '类别：', '</li>',  /target=".*?">(.*?)<\/a>/g);
    const year     = extractMatches(res, '日期：', 'p>',     /<\/strong>(.*?)</g);
    const area     = extractMatches(res, '时长：', 'p>',     /<\/strong>(.*?)</g);

    let xianlu = '', bofang = '';
    if (!content.includes(jumpName)) {
        bofang = jumpUrl;
        xianlu = '1';
    } else {
        let id = extractBetween(res, 'class="btn btn-primary" href="', '"');
        if (!id.startsWith('http')) id = site + id;
        bofang = '集多请您欣赏$' + id;
        xianlu = '花都专线';
    }

    return {
        list: [{
            vod_id:        did,
            vod_director:  director,
            vod_actor:     actor,
            vod_remarks:   remarks,
            vod_year:      year,
            vod_area:      area,
            vod_content:   content,
            vod_play_from: xianlu,
            vod_play_url:  bofang,
        }],
    };
}

async function play(inReq, _outResp) {
    const id = inReq.body.id;
    const res = await fetchHtml(id);

    const raw    = extractBetween(res, '"","url":"', '"');
    const decoded = decodeURIComponent(Buffer.from(raw, 'base64').toString('utf-8'));

    return {
        parse:  0,
        url:    decoded,
        header: { 'User-Agent': UA_MOBILE },
    };
}

async function search(inReq, _outResp) {
    const key  = inReq.body.wd || '';
    const pg   = parseInt(inReq.body.pg) || 1;
    const url  = `${site}/vodsearch/-------------.html?wd=${encodeURIComponent(key)}`;

    const html = await fetchHtml(url);
    const $    = cheerio.load(html);
    return { list: parseVideos($), page: pg, pagecount: 9999, limit: 90, total: 999999 };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: { key: 'huadu', name: '🔥花都影院', type: 3 },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
    },
};