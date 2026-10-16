import { load } from 'cheerio';
import req from '../../util/req.js';

/* ==========================================================================
 *  Javdoe  ·  https://javdoe.sh
 *  日本成人影片在线播放站(番号 / 类别 / 女优 / 片商 / 字幕分区)
 *  ---------------------------------------------------------------------
 *  【站点结构】老式 PHP 模板站(defboot),列表全部走 AJAX 分段接口,
 *  详情页与目录页是服务端直出。三个数据接口:
 *
 *    1) 站内主子页列表  /<sec>/[<page>/]?ajax=browse_videos
 *       sec ∈ releaseday | recent | popular | rated
 *    2) 分类/标签/字幕页 /<slug>/[recent/<page>/]?ajax=category_videos
 *       例:/big-tits/   /big-tits/recent/2/   /english-subtitle/
 *    3) 搜索            /search/video/?s=<kw>&o=recent&page=<n>&ajax=search_results
 *
 *  三者都返回 JSON:{ status, html, pagination, total, next_url }
 *  html 里就是和普通列表页一样的 <li id="video-<id>"> 卡片。
 *
 *  【播放】详情页里直出 9 个服务器按钮(<button class="button_choice_server">),
 *  每个按钮的 data-embed / data-embeds 是 base64,解码后得到真实 iframe 地址
 *  (其中 4 个自带 7 条线路的 failover 数组)。播放时逐个请求 iframe,
 *  从返回页面里取出 FIRST = {...} 的 src,即为 m3u8 直链(实测可直连拉流)。
 *  第三方线路(mycloudz / streamtape 之类)取不到直链时,原样交回 iframe 地址,
 *  由客户端内嵌浏览器打开。
 *
 *  【登录】无需登录。全站内容游客可看。
 * ========================================================================== */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const site = 'https://javdoe.sh';

// 走 browse_videos 的一级栏目;其余(分类 / 标签 / 字幕)走 category_videos
const BROWSE_SECTIONS = ['releaseday', 'recent', 'popular', 'rated'];

/* --------------------------------------------------------------------------
 *  基础工具
 * ------------------------------------------------------------------------ */
function baseHeaders(referer = `${site}/`) {
    return {
        'User-Agent': UA,
        Referer: referer,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
        Connection: 'keep-alive',
    };
}

function abs(u) {
    if (!u) return '';
    const s = String(u).trim();
    if (/^https?:\/\//i.test(s)) return s;
    return site + (s.startsWith('/') ? s : `/${s}`);
}

function absUrl(u, base) {
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    try {
        return new URL(u, base).href;
    } catch (e) {
        return '';
    }
}

function originOf(u) {
    try {
        return new URL(u).origin + '/';
    } catch (e) {
        return `${site}/`;
    }
}

// base64(站点前端用 atob 解 data-embed,这里两种环境都兼容)
function b64decode(s) {
    const t = String(s || '').trim().replace(/-/g, '+').replace(/_/g, '/');
    if (!t) return '';
    try {
        if (typeof Buffer !== 'undefined') return Buffer.from(t, 'base64').toString('utf8');
        return decodeURIComponent(escape(atob(t)));
    } catch (e) {
        return '';
    }
}

function b64encode(s) {
    try {
        if (typeof Buffer !== 'undefined') {
            return Buffer.from(String(s), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        }
        return btoa(unescape(encodeURIComponent(String(s)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) {
        return '';
    }
}

function clean(t) {
    return String(t || '').replace(/\s+/g, ' ').trim();
}

/* --------------------------------------------------------------------------
 *  请求
 * ------------------------------------------------------------------------ */
async function getText(url, referer) {
    const resp = await req.get(url, { headers: baseHeaders(referer) });
    const d = resp && resp.data !== undefined ? resp.data : resp;
    return typeof d === 'string' ? d : String(d === undefined || d === null ? '' : d);
}

async function getJson(url, referer) {
    const headers = {
        ...baseHeaders(referer),
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
    };
    try {
        const resp = await req.get(url, { headers });
        const d = resp && resp.data !== undefined ? resp.data : resp;
        if (d && typeof d === 'object') return d;
        return JSON.parse(String(d));
    } catch (e) {
        // 拿不到 JSON 说明这条路径不是 ajax 口,交回调用方走直出解析
        return null;
    }
}

/* --------------------------------------------------------------------------
 *  列表解析
 * ------------------------------------------------------------------------ */
function parseCards(html) {
    const $ = load(String(html || ''));
    const list = [];
    const seen = new Set();

    $('li[id^="video-"]').each((_, el) => {
        const $li = $(el);
        const $a = $li.find('a.thumbnail').first().length ? $li.find('a.thumbnail').first() : $li.find('a[href]').first();
        const href = $a.attr('href') || '';
        if (!href || href.indexOf('javascript:') === 0) return;

        const key = href.split('?')[0];
        if (seen.has(key)) return;
        seen.add(key);

        const $img = $li.find('img').first();
        const name = clean($li.find('span.video-title').first().text()) || clean($a.attr('title')) || clean($img.attr('alt'));
        const pic = $img.attr('src') || $img.attr('data-src') || $img.attr('data-original') || '';

        // 角标里通常是「2026-06-04 27 seconds ago」,只留日期
        const overlay = clean($li.find('span.video-overlay').first().text());
        const date = (overlay.match(/\d{4}-\d{2}-\d{2}/) || [])[0] || '';

        list.push({
            vod_id: href,
            vod_name: name,
            vod_pic: abs(pic),
            vod_remarks: date,
        });
    });

    return list;
}

// 分页:页码列表里最大的数字就是总页数
function parsePageCount(paginationHtml, page) {
    let max = parseInt(page, 10) || 1;
    const $ = load(String(paginationHtml || ''));
    $('a').each((_, el) => {
        const t = clean($(el).text());
        if (/^\d+$/.test(t)) {
            const n = parseInt(t, 10);
            if (n > max) max = n;
        }
    });
    return max;
}

// 直出页面上取页数:必须限定在 .pagination 里,
// 否则会被页脚的 2257 声明链接之类的数字带偏
function parsePageCountInPage(html, page) {
    const $ = load(String(html || ''));
    const box = $('.pagination').first();
    if (!box.length) return parseInt(page, 10) || 1;
    return parsePageCount(box.html() || '', page);
}

// 目录页(女优墙)
function parseModels(html) {
    const $ = load(String(html || ''));
    const list = [];
    const seen = new Set();
    $('.models .model').each((_, el) => {
        const $a = $(el).find('a').first();
        const href = $a.attr('href') || '';
        if (!href || seen.has(href)) return;
        seen.add(href);
        const name = clean($(el).find('.model-title').first().text()) || clean($a.attr('title'));
        const cnt = clean($(el).find('.model-overlay').first().text());
        list.push({
            vod_id: href,
            vod_name: name || '未知女优',
            vod_pic: '',
            vod_remarks: cnt ? `${cnt} 部` : '',
        });
    });
    return list;
}

// 目录页(片商墙,链接直接指向站内搜索)
function parseChannels(html) {
    const $ = load(String(html || ''));
    const list = [];
    const seen = new Set();
    $('.channellist').each((_, el) => {
        const $a = $(el).find('a[href]').first();
        const href = $a.attr('href') || '';
        if (!href || seen.has(href)) return;
        seen.add(href);
        const name = clean($(el).find('.namec').first().text());
        const des = clean($(el).find('.des_channel').first().text());
        const img = $(el).find('img').first().attr('src') || '';
        list.push({
            vod_id: href,
            vod_name: name || '片商',
            vod_pic: abs(img),
            vod_content: des,
            vod_remarks: '片商',
        });
    });
    return list;
}

/* --------------------------------------------------------------------------
 *  路径拼装
 * ------------------------------------------------------------------------ */
function normPath(tid) {
    let p = String(tid || '').trim();
    if (!p) p = '/recent/';
    if (/^https?:\/\//i.test(p)) {
        try {
            p = new URL(p).pathname + new URL(p).search;
        } catch (e) {
            p = '/recent/';
        }
    }
    if (!p.startsWith('/')) p = `/${p}`;
    return p;
}

// 列表请求地址(第 1 页不带页码,站点分页形态是 /<sec>/<n>/ 与 /<slug>/recent/<n>/)
function buildListUrl(tid, page) {
    const p = normPath(tid);
    const sec = p.split('/').filter(Boolean)[0] || '';

    if (BROWSE_SECTIONS.includes(sec)) {
        const path = page > 1 ? `/${sec}/${page}/` : `/${sec}/`;
        return { url: `${site}${path}?ajax=browse_videos`, path };
    }

    const base = p.split('?')[0];
    const withSlash = base.endsWith('/') ? base : `${base}/`;
    if (page > 1) {
        return { url: `${site}${withSlash}recent/${page}/?ajax=category_videos`, path: `${withSlash}recent/${page}/` };
    }
    return { url: `${site}${withSlash}?ajax=category_videos`, path: withSlash };
}

/* --------------------------------------------------------------------------
 *  详情解析
 * ------------------------------------------------------------------------ */
// 详情页每行是 <div class="col-md-8">… Genre: <a>Young Wife</a> …</div>
// 注意 tags 那行内部还嵌着 description 容器,取文本前先把它摘掉
function readFields(html) {
    const $ = load(String(html || ''));
    const out = {};
    const labels = ['genre', 'release day', 'studio', 'director', 'label', 'country', 'tags'];

    const scan = (selector, strict) => {
        $(selector).each((_, el) => {
            if (Object.keys(out).length >= labels.length) return;
            const $c = $(el).clone();
            $c.find('div, p, script, style, ul, ol').remove();
            const t = clean($c.text());
            if (!t || t.length > (strict ? 100 : 400)) return;

            const m = t.match(/^([A-Za-z ]{3,14}):\s*(.*)$/);
            if (!m) return;
            const key = m[1].toLowerCase().trim();
            if (labels.indexOf(key) < 0 || out[key] !== undefined) return;
            // 兜底扫描时,值里还夹着别的字段名说明这行是多行混合,不要
            if (!strict && /[A-Za-z ]{3,14}:/.test(m[2])) return;

            out[key] = clean(m[2]);
        });
    };

    scan('div.col-md-8', true);
    scan('div', false);

    // 兜底:国家行有时前面挂了别的说明
    if (!out['country']) {
        const m = String(html).match(/fa-caret-right"[^>]*><\/i>\s*Country:\s*(?:<a[^>]*>)?([^<]*)/i);
        if (m) out['country'] = clean(m[1]);
    }

    return out;
}

function parseServers(html) {
    const $ = load(String(html || ''));
    const servers = [];

    $('button.button_choice_server').each((_, el) => {
        const $b = $(el);
        const name = clean($b.attr('data-name')) || clean($b.text()).replace(/^(VIP|HOT|NEW|FREE)\s*/i, '').trim();
        const urls = [];

        const embs = $b.attr('data-embeds');
        const emb = $b.attr('data-embed');

        if (embs) {
            const dec = b64decode(embs);
            try {
                const arr = JSON.parse(dec);
                if (Array.isArray(arr)) {
                    arr.forEach((u) => {
                        if (u) urls.push(u);
                    });
                }
            } catch (e) {
                /* 忽略坏数据 */
            }
        }
        if (!urls.length && emb) {
            const one = b64decode(emb);
            if (one) urls.push(one);
        }

        // 每条线路自带 7 个镜像,播的时候逐个试;留 2 个 + 1 条主线路兜底,
        // 免得播放 id 太长,也免得撞上「这条线路站点自己都没源」时不至于播不了
        if (urls.length) servers.push({ name: name || `线路${servers.length + 1}`, urls: urls.slice(0, 2) });
    });

    // 主线路(优先 Xcloud,退回第一个)→ 作为所有线路的最终兜底
    if (servers.length > 1) {
        const primary = servers.find((s) => /xcloud|cloud/i.test(s.name)) || servers[0];
        servers.forEach((s) => {
            if (s !== primary && primary.urls[0]) s.urls.push(primary.urls[0]);
        });
    }

    return servers;
}

function secToTime(sec) {
    const n = parseInt(sec, 10);
    if (!n || n <= 0) return '';
    const h = Math.floor(n / 3600);
    const m = Math.round((n % 3600) / 60);
    if (h > 0) return m > 0 ? `${h}小时${m}分钟` : `${h}小时`;
    return `${m}分钟`;
}

/* --------------------------------------------------------------------------
 *  播放解析
 * ------------------------------------------------------------------------ */
// 线路服务端明确回「没源」的标记(同一线路的其他镜像基本一样的下场,可以直接跳)
const NOSOURCE = '__NOSOURCE__';

// 给请求加个上限,别让一条慢线路把整个播放拖死
function withTimeout(p, ms) {
    return Promise.race([
        p,
        new Promise((resolve) => {
            setTimeout(() => resolve(null), ms);
        }),
    ]);
}

// 从 iframe 页里取真实流地址,三种形态依次试:
//   1) 内联 var FIRST = {...} 的 src(大部分线路)
//   2) 只给 TOKEN 的播放器 → 再问一次 <播放器>?json=1&next=0&p=TOKEN 拿 media
//   3) 裸 m3u8 / mp4 地址
async function resolveStream(embedUrl) {
    let html = '';
    try {
        html = await getText(embedUrl, `${site}/`);
    } catch (e) {
        return '';
    }
    if (!html) return '';

    const m = html.match(/var\s+FIRST\s*=\s*(\{[\s\S]*?\})\s*;/);
    if (m) {
        try {
            const info = JSON.parse(m[1]);
            if (info && info.src) {
                const u = absUrl(info.src, embedUrl);
                if (u) return u;
            }
        } catch (e) {
            /* 继续走下面的兜底 */
        }
    }

    const tk = html.match(/var\s+TOKEN\s*=\s*["']([^"']+)["']/);
    if (tk && tk[1]) {
        const base = embedUrl.split('?')[0];
        const api = `${base}?json=1&next=0&p=${encodeURIComponent(tk[1])}`;
        const d = await withTimeout(getJson(api, embedUrl), 8000);
        if (d && d.success) {
            const media = d.media || d.src || d.url || d.file || '';
            const u = absUrl(media, embedUrl);
            if (u) return u;
        }
        if (d && d.success === false) return NOSOURCE;
    }

    const m2 = html.match(/["']([^"']*\.m3u8[^"']*)["']/i);
    if (m2) {
        const u = absUrl(m2[1], embedUrl);
        if (u) return u;
    }

    const m3 = html.match(/["']([^"']*\.mp4[^"']*)["']/i);
    if (m3) {
        const u = absUrl(m3[1], embedUrl);
        if (u) return u;
    }

    return '';
}

/* --------------------------------------------------------------------------
 *  接口实现
 * ------------------------------------------------------------------------ */
async function init(inReq) {
    return { webHome: `${site}/`, searchable: 1, quickSearch: 1, filter: 1 };
}

async function home(inReq) {
    const classes = [
        { type_id: 'recent', type_name: '最近更新' },
        { type_id: 'releaseday', type_name: '最新发行' },
        { type_id: 'popular', type_name: '最多观看' },
        { type_id: 'rated', type_name: '最高评分' },
        { type_id: 'english-subtitle', type_name: '英文字幕' },
        { type_id: 'chinese-subtitles', type_name: '中文字幕' },
        { type_id: 'jav-sub', type_name: 'JAV 字幕' },
        { type_id: 'categories', type_name: '全部类别' },
        { type_id: 'pornstar', type_name: '女优列表' },
        { type_id: 'channels', type_name: '片商列表' },
    ];

    // 动态挂上站点真实类别(按作品数排序)
    try {
        const html = await getText(`${site}/categories/?o=videos`);
        const $ = load(html);
        const seen = new Set(classes.map((c) => c.type_id));
        $('li[id^="category-"]').each((_, el) => {
            const $a = $(el).find('a[href]').first();
            const href = ($a.attr('href') || '').replace(/^\//, '').replace(/\/$/, '');
            const name = clean($(el).find('.category-title').first().text());
            const cnt = clean($(el).find('.category-overlay').first().text());
            if (!href || !name || seen.has(href)) return;
            seen.add(href);
            if (classes.length >= 70) return;
            classes.push({ type_id: href, type_name: cnt ? `${name} · ${cnt}` : name });
        });
    } catch (e) {
        /* 动态类别拉不到不影响固定分类 */
    }

    // 再挂一批热门女优
    try {
        const html = await getText(`${site}/pornstar/popular/`);
        const $ = load(html);
        let n = 0;
        $('.models .model').each((_, el) => {
            if (n >= 16) return;
            const $a = $(el).find('a[href]').first();
            const href = ($a.attr('href') || '').replace(/^\//, '').replace(/\/$/, '');
            const name = clean($(el).find('.model-title').first().text());
            if (!href || !name) return;
            n += 1;
            classes.push({ type_id: href, type_name: `👤 ${name}` });
        });
    } catch (e) {
        /* 同上 */
    }

    return { class: classes, filters: {} };
}

async function category(inReq) {
    const tid = inReq.body.id || inReq.body.tid || '';
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    const p = normPath(tid);
    const sec = p.split('/').filter(Boolean)[0] || '';
    const parts = p.split('/').filter(Boolean);

    // 1) 片商墙 / 女优墙 / 类别墙:目录页,直出
    if (parts.length === 1 && ['categories', 'pornstar', 'channels'].indexOf(sec) >= 0) {
        const html = await getText(`${site}/${sec}/`);
        const list = sec === 'pornstar' ? parseModels(html) : sec === 'channels' ? parseChannels(html) : parseCards(html);
        return { page: 1, pagecount: 1, list };
    }

    // 2) 片商墙里的链接直接指向站内搜索
    if (sec === 'search') {
        const q = new URLSearchParams(p.split('?')[1] || '').get('s') || '';
        return search({ body: { wd: q, page } });
    }

    // 3) 普通列表:先走 AJAX,拿不到 JSON 就退回直出解析(例如女优作品页)
    const { url, path } = buildListUrl(tid, page);
    const d = await getJson(url, `${site}${path}`);

    if (d && typeof d === 'object') {
        const html = d.html || '';
        return {
            page,
            pagecount: parsePageCount(d.pagination || html, page),
            list: parseCards(html),
        };
    }

    const html = await getText(`${site}${path}`, `${site}${path}`);
    const list = parseCards(html);
    if (list.length) {
        return { page, pagecount: parsePageCountInPage(html, page), list };
    }
    return { page, pagecount: 1, list: parseModels(html) };
}

async function detail(inReq) {
    const id = inReq.body.id || '';
    const url = /^https?:\/\//i.test(id) ? id : abs(id);
    const html = await getText(url, `${site}/`);
    const $ = load(html);

    const name = clean($('h1').first().text()) || clean($('meta[property="og:title"]').attr('content'));
    const pic = $('meta[property="og:image"]').attr('content') || '';
    const desc = clean($('p.description').first().text()) || clean($('meta[property="og:description"]').attr('content'));
    const durSec = $('meta[property="og:video:duration"]').attr('content') || '';

    const f = readFields(html);
    const release = f['release day'] || '';
    const year = (release.match(/\d{4}/) || [])[0] || '';

    const servers = parseServers(html);

    const playFrom = servers.map((s) => s.name).join('$$$');
    const playUrl = servers
        .map((s) => `${s.name}$${b64encode(JSON.stringify(s.urls))}`)
        .join('$$$');

    const typeName = [f['genre'], f['tags']].filter(Boolean).join(' / ');

    return {
        list: [
            {
                vod_id: id,
                vod_name: name,
                vod_pic: pic,
                vod_content: desc,
                vod_year: year,
                vod_area: f['country'] || '',
                vod_pubdate: release,
                vod_duration: secToTime(durSec),
                vod_director: f['director'] || '',
                vod_remarks: f['studio'] || f['label'] || '',
                type_name: typeName,
                vod_play_from: playFrom,
                vod_play_url: playUrl,
            },
        ],
    };
}

async function play(inReq) {
    const raw = String(inReq.body.id || '');

    let urls = [];
    const decoded = b64decode(raw);
    if (decoded) {
        try {
            const arr = JSON.parse(decoded);
            if (Array.isArray(arr)) urls = arr.filter(Boolean);
        } catch (e) {
            /* 不是编码数据,下面按原样处理 */
        }
    }
    if (!urls.length && /^https?:\/\//i.test(raw)) urls = [raw];

    // 逐条线路试解析,拿到直链就直接给客户端
    for (let i = 0; i < urls.length; i += 1) {
        const u = urls[i];
        const real = await resolveStream(u);

        if (real === NOSOURCE) {
            // 这条线路服务端没源,同一线路的镜像就不用再试了,直接跳到最后那条兜底线路
            if (urls.length > 2) i = urls.length - 2;
            continue;
        }

        if (real) {
            return {
                parse: 0,
                url: real,
                header: { 'User-Agent': UA, Referer: originOf(u) },
            };
        }
    }

    // 全部解析不出来(第三方线路)→ 交回 iframe,交给客户端内嵌浏览器
    if (urls.length) {
        return {
            parse: 1,
            url: urls[0],
            header: { 'User-Agent': UA, Referer: `${site}/` },
        };
    }

    return { parse: 1, url: raw, header: { 'User-Agent': UA, Referer: `${site}/` } };
}

async function search(inReq) {
    const wd = String(inReq.body.wd || inReq.body.key || '').trim();
    const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
    if (!wd) return { page: 1, pagecount: 1, list: [] };

    const path = `/search/video/?s=${encodeURIComponent(wd)}&o=recent&page=${page}`;
    const d = await getJson(`${site}${path}&ajax=search_results`, `${site}${path}`);

    if (d && typeof d === 'object') {
        const html = d.html || '';
        return {
            page,
            pagecount: parsePageCount(d.pagination || html, page),
            list: parseCards(html),
        };
    }

    const html = await getText(`${site}${path}`, `${site}${path}`);
    return { page, pagecount: parsePageCountInPage(html, page), list: parseCards(html) };
}

export default {
    meta: { key: 'javdoe', name: '🌸Javdoe', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
