import axios from 'axios';
import { load } from 'cheerio';

const site = 'https://139fm.cyou';

const headers = {
    'User-Agent':                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    'Accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language':           'zh-CN,zh;q=0.9,zh-TW;q=0.8',
    'Accept-Encoding':           'gzip, deflate, br, zstd',
    'Cache-Control':             'max-age=0',
    'Connection':                'keep-alive',
    'Sec-Fetch-Site':            'same-origin',
    'Sec-Fetch-Mode':            'navigate',
    'Sec-Fetch-User':            '?1',
    'Sec-Fetch-Dest':            'document',
    'Upgrade-Insecure-Requests': '1',
};

const categoryMap = {
    '1': '长篇有声',
    '2': '短篇有声',
    '3': '自慰催眠',
    '4': 'ASMR专区',
};

const anchorMap = [
    '小苮儿', '步非烟团队', '小野猫', '戴逸', '姽狐',
    '小咪', '浅浅', '季姜', '丽莎', '雅朵',
    '曼曼', '小窈', 'ASMR专区',
];

// ─── 工具函数 ──────────────────────────────────────────────────────────────

async function request(url, extraHeaders = {}) {
    const resp = await axios.get(url, { headers: { ...headers, ...extraHeaders } });
    return resp.data;
}

// ROT13 转换
function rot13(str) {
    return str.replace(/[a-zA-Z]/g, c => {
        const base = c <= 'Z' ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
    });
}

// ROT13 → Base64解码 → ROT13
function dd0(encrypted, defaultVal = '') {
    try {
        const step1 = rot13(encrypted);
        const step2 = Buffer.from(step1, 'base64').toString('utf-8');
        return rot13(step2);
    } catch {
        return defaultVal;
    }
}

// 从 HTML 中提取 _conf.a 数组
function extractConf(html) {
    const patterns = [
        /var\s+_conf\s*=\s*\{\s*a\s*:\s*\[((?:'[^']*'\s*,?\s*)*)\]/,
        /var\s+_conf\s*=\s*\{\s*a\s*:\s*\[((?:"[^"]*"\s*,?\s*)*)\]/,
        /_conf\s*=\s*\{\s*a\s*:\s*\[((?:'[^']*'\s*,?\s*)*)\]/,
        /_conf\s*=\s*\{\s*a\s*:\s*\[((?:"[^"]*"\s*,?\s*)*)\]/,
        /a\s*:\s*\[((?:'[^']*'\s*,?\s*)*)\]/,
        /a\s*:\s*\[((?:"[^"]*"\s*,?\s*)*)\]/,
    ];

    for (const pattern of patterns) {
        const m = html.match(pattern);
        if (m) {
            const content = m[1];
            let strings = [...content.matchAll(/'([^']*)'/g)].map(x => x[1]);
            if (!strings.length) {
                strings = [...content.matchAll(/"([^"]*)"/g)].map(x => x[1]);
            }
            if (strings.length) return { a: strings };
        }
    }
    return null;
}

function decryptAll(conf) {
    if (!conf || !Array.isArray(conf.a)) return [];
    return conf.a.filter(Boolean).map(s => dd0(s));
}

// 解析音频列表（首页/分类/搜索通用）
function parseAudios($) {
    const audios = [];
    $('.mh-item').each((_, el) => {
        const href  = $(el).find('a[href]').first().attr('href') || '';
        const title = $(el).find('h2.title a').text().trim();
        const style = $(el).find('p.mh-cover').attr('style') || '';
        const picM  = style.match(/url\((.*?)\)/);
        const pic   = picM ? picM[1].replace(/['"]/g, '') : '';
        const remarks = $(el).find('p.chapter').text().trim() || '暂无简介';
        const vodId = href.split('/').pop();
        if (href && title) {
            audios.push({ vod_id: vodId, vod_name: title, vod_pic: pic, vod_remarks: remarks });
        }
    });
    return audios;
}

// ─── API 处理函数 ──────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const html = await request(`${site}/podcasts`);
    const $    = load(html);

    const classes = [];

    // 内容分类
    $('dl#areas dd').each((_, el) => {
        const val  = $(el).attr('data-val');
        const name = $(el).text().trim();
        if (val && val !== '-1') classes.push({ type_id: val, type_name: name });
    });

    // 主播分类
    $('dl#tags dd').each((_, el) => {
        const val = $(el).attr('data-val');
        if (val && val !== '全部' && anchorMap.includes(val)) {
            classes.push({ type_id: `anchor_${val}`, type_name: `主播-${val}` });
        }
    });

    const list = parseAudios($);
    return { class: classes, filters: {}, list };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg  = parseInt(inReq.body.page) || 1;

    const params = new URLSearchParams();
    if (tid.startsWith('anchor_')) {
        params.set('tag', tid.replace('anchor_', ''));
    } else if (tid in categoryMap) {
        params.set('area', tid);
    }
    if (pg > 1) params.set('page', pg);

    const url  = `${site}/podcasts${params.toString() ? '?' + params : ''}`;
    const html = await request(url);
    const $    = load(html);

    const list = parseAudios($);

    // 解析总页数
    let pagecount = 1;
    $('.pagination a[title]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m    = href.match(/page=(\d+)/);
        if (m) pagecount = Math.max(pagecount, parseInt(m[1]));
    });

    return { page: pg, pagecount, limit: 48, total: list.length * pagecount, list };
}

async function detail(inReq, _outResp) {
    const id   = inReq.body.id;
    const html = await request(`${site}/podcast/${id}`);
    const $    = load(html);

    // 解密音频 URL
    const conf          = extractConf(html);
    const decryptedUrls = decryptAll(conf);

    // 基本信息
    const title    = $('title').text().replace('-139FM', '').trim();
    let   pic      = $('img[data-amplitude-song-info="cover_art_url"]').attr('src') || '';
    if (!pic) {
        const style = $('.mh-cover').attr('style') || '';
        const m     = style.match(/url\((.*?)\)/);
        if (m) pic  = m[1].replace(/['"]/g, '');
    }

    // 正则提取 JSON 字段
    const descM    = html.match(/"desc":\s*"([^"]*)"/);
    const areaM    = html.match(/"area":\s*"([^"]*)"/);
    const tagM     = html.match(/"tag":\s*"([^"]*)"/);
    const clicksM  = html.match(/"clicks":\s*"([^"]*)"/);

    const content  = descM   ? descM[1].replace('简介：', '')       : '暂无简介';
    const remarks  = clicksM ? clicksM[1].replace('热度：', '热度:') : '';
    const typeName = areaM   ? areaM[1].replace('类型：', '').trim() : '';
    const actor    = tagM    ? tagM[1].replace('主播：', '').trim()  : '';

    // 集数列表
    const playParts = [];
    $('.song').each((index, el) => {
        const epTitle    = $(el).find('.song-title').text().trim() || `第${index + 1}集`;
        const requireBuy = $(el).attr('data-require-buy') === '1';
        const chapterId  = $(el).attr('data-chapter-id') || '';
        const audioUrl   = decryptedUrls[index] || `${id}_${chapterId}_${index}`;
        const label      = requireBuy ? `${epTitle}[付费]` : epTitle;
        playParts.push(`${label}$${audioUrl}`);
    });

    return {
        list: [{
            vod_id:        id,
            vod_name:      title.replace('全集免费高清无修在线阅读', '').trim(),
            vod_pic:       pic,
            type_name:     typeName,
            vod_actor:     actor,
            vod_director:  `共${playParts.length}集`,
            vod_content:   content,
            vod_remarks:   remarks,
            vod_play_from: '139FM',
            vod_play_url:  playParts.join('#'),
        }],
    };
}

async function play(inReq, _outResp) {
    const id = inReq.body.id;

    // 已经是完整 URL，直接播放
    if (id.startsWith('http')) {
        return {
            parse:  0,
            url:    id,
            header: { 'Referer': site, 'User-Agent': headers['User-Agent'], 'Accept': '*/*', 'Range': 'bytes=0-' },
        };
    }

    // 格式：podcastId_chapterId_index
    const parts = id.split('_');
    if (parts.length >= 3) {
        const [podcastId, , index] = parts;
        try {
            const html          = await request(`${site}/podcast/${podcastId}`);
            const conf          = extractConf(html);
            const decryptedUrls = decryptAll(conf);
            const audioUrl      = decryptedUrls[parseInt(index)];
            if (audioUrl) {
                return {
                    parse:  0,
                    url:    audioUrl,
                    header: {
                        'Referer':    `${site}/podcast/${podcastId}`,
                        'User-Agent': headers['User-Agent'],
                        'Accept':     '*/*',
                        'Range':      'bytes=0-',
                    },
                };
            }
        } catch {}
    }

    return { parse: 0, url: '', header: {} };
}

async function search(inReq, _outResp) {
    const keyword = encodeURIComponent(inReq.body.wd);
    const pg      = parseInt(inReq.body.pg) || 1;
    const url     = `${site}/search?keyword=${keyword}${pg > 1 ? `&page=${pg}` : ''}`;

    const html = await request(url);
    const $    = load(html);
    const list = parseAudios($);

    return { page: pg, pagecount: 1, total: list.length, list };
}

// ─── 导出 ──────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'fm139',
        name: '139FM有声小说',
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