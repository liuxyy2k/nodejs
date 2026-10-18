import { load } from 'cheerio';
import { createHash, createCipheriv, createDecipheriv } from 'crypto';
import req from '../../util/req.js';

/* ==========================================================================
 *  ZiziFlix  ·  https://ziziflix.com
 *  JAV 影片资料库 + 在线播放(番号 / 类别 / 女优 / 片商 / 系列 / 导演 / 年份)
 *  ---------------------------------------------------------------------
 *  【站点结构】WordPress(moviestream 主题),列表页 / 详情页全部服务端直出,
 *  cheerio 直接吃,不需要任何 AJAX 接口。路由很规整:
 *
 *    首页        /                       分页 /page/<n>/        (单页 190+ 卡)
 *    最新发布    /latest-av/             分页 /latest-av/page/<n>/
 *    热门        /popular/page/<n>/
 *    类别        /genre/<slug>/page/<n>/        目录 /genre/
 *    片商        /tag/<slug>/page/<n>/          目录 /studio/   (实为 tag)
 *    系列        /movie-series/<slug>/page/<n>/ 目录 /label/
 *    导演        /director/<slug>/page/<n>/     目录 /director/
 *    演员        /actor/<slug>/page/<n>/        (无总目录,从详情页进)
 *    国家        /country/<slug>/page/<n>/      目录 /country/
 *    年份        /years/<yyyy>/page/<n>/        目录 /years/
 *    搜索        /?s=<kw>&page=<n>              可选 &order=added|popular|title|imdb|latest
 *
 *    目录页统一是 <ul class="taxindex"><li><a href><span>名字</span><i>片数</i></a></li>
 *
 *  【播放】详情页内嵌播放器 iframe:
 *      <iframe src="https://play.ziziflix.com/?v=<slug>">
 *  该页 const datas = "<base64>" 解出清单后,直链按播放器 lite.bundle 的算法签:
 *
 *      key = md5(把 size 每个数字字符当成 0-9 的字节)
 *      token = base64(base64(AES-256-CTR(path)))   // key/iv 都是 key 的 hex 文本
 *      path  = /mp4/<md5_id>/<res_id>/<size>?v=<slug>
 *      地址  = https://<sub 对应域名>/sora/<size>/<token>
 *
 *  这个地址 302 到 video/mp4,文件头是 ftyp,体积等于清单里的 size。
 *  `${url}/${path}` 和 fristDatas 的 .fd 是加密分片,不能当播放地址。
 *
 *  【登录】不需要,全站游客可看。
 *  【说明】站点本身没有剧照、没有播放量统计,所以 vod_hits 不填、不编。
 * ========================================================================== */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const site = 'https://ziziflix.com';

// 目录型页面(返回的是分类索引,不是影片卡片)
const TAX_PAGES = ['genre', 'studio', 'label', 'director', 'country', 'years'];

/* --------------------------------------------------------------------------
 *  基础工具
 * ------------------------------------------------------------------------ */
function baseHeaders(referer = `${site}/`) {
    return {
        'User-Agent': UA,
        Referer: referer,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh-Hans;q=0.9,en;q=0.8',
        Connection: 'keep-alive',
    };
}

function clean(t) {
    return String(t === undefined || t === null ? '' : t).replace(/\s+/g, ' ').trim();
}

function abs(u) {
    if (!u) return '';
    const s = String(u).trim();
    if (/^https?:\/\//i.test(s)) return s;
    return site + (s.startsWith('/') ? s : `/${s}`);
}

// 把各种写法的分类 id 归一成站内相对路径: "genre/big-tits/" / "https://ziziflix.com/genre/big-tits/"
function normPath(tid) {
    let p = String(tid || '').trim();
    if (!p) return '';
    p = p.replace(/^https?:\/\/[^/]+/i, '');
    p = p.split('#')[0].split('?')[0];
    p = p.replace(/^\/+/, '').replace(/\/+$/, '');
    return p;
}

function b64encode(s) {
    try {
        return Buffer.from(String(s), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) {
        return '';
    }
}

function b64decode(s) {
    const t = String(s || '').trim().replace(/-/g, '+').replace(/_/g, '/');
    if (!t) return '';
    try {
        return Buffer.from(t, 'base64').toString('utf8');
    } catch (e) {
        return '';
    }
}

/* --------------------------------------------------------------------------
 *  请求 (带一层内存缓存,首页/目录页不用每次都拉)
 * ------------------------------------------------------------------------ */
const memCache = new Map();

async function getText(url, referer, ttl = 0) {
    const key = `${url}`;
    if (ttl > 0) {
        const hit = memCache.get(key);
        if (hit && Date.now() - hit.t < ttl) return hit.v;
    }
    const resp = await req.get(url, { headers: baseHeaders(referer || `${site}/`) });
    const d = resp && resp.data !== undefined ? resp.data : resp;
    const text = typeof d === 'string' ? d : String(d === undefined || d === null ? '' : d);
    if (ttl > 0) memCache.set(key, { t: Date.now(), v: text });
    return text;
}

/* --------------------------------------------------------------------------
 *  列表卡片
 *    <article class="box">
 *      <a class="tip" href="/<slug>/" title="番号">
 *        <img src="...jpg">
 *        <span class="quality JP">JP</span>
 *        <h2 class="entry-title">番号</h2>
 *        <span class="addyear">JP</span> ... <i class="type">SUBBED</i>
 *      </a>
 *      <div class="note">
 *        <div class="g">类别</div><div class="c">国家</div>
 *        <div class="t"><time>2026</time></div>
 *      </div>
 *    </article>
 * ------------------------------------------------------------------------ */
function parseCards(html) {
    const $ = load(String(html || ''));
    const out = [];
    const seen = new Set();

    $('article.box').each((_, el) => {
        const $el = $(el);
        const $a = $el.find('a[itemprop="url"]').first().length
            ? $el.find('a[itemprop="url"]').first()
            : $el.find('a[href]').first();
        const href = $a.attr('href') || '';
        if (!href) return;
        const id = abs(href);
        if (seen.has(id)) return;
        seen.add(id);

        const name = clean($el.find('.entry-title').first().text()) || clean($a.attr('title')) || clean($a.attr('alt'));
        if (!name) return;

        const pic = $el.find('img').first().attr('src') || $el.find('img').first().attr('data-src') || '';
        const genres = $el.find('.note .g a').map((i, a) => clean($(a).text())).get().filter(Boolean);
        const country = clean($el.find('.note .c').first().text());
        const rawYear = clean($el.find('.note time').first().text()) || clean($el.find('.note time').first().attr('datetime'));
        const year = (String(rawYear).match(/\d{4}/) || [])[0] || '';
        const quality = clean($el.find('.overlay .quality').first().text());
        const subbed = clean($el.find('.addinfox-text .type').first().text());

        const remarks = [quality, subbed].filter(Boolean).join(' · ');

        out.push({
            vod_id: id,
            vod_name: name,
            vod_pic: pic ? abs(pic) : '',
            vod_year: year,
            vod_area: country,
            type_name: genres.join(' / '),
            vod_remarks: remarks,
        });
    });

    return out;
}

// 目录页(类别/片商/系列/导演/国家/年份)的索引项
function parseTaxIndex(html) {
    const $ = load(String(html || ''));
    const out = [];
    const seen = new Set();

    $('ul.taxindex li a').each((_, a) => {
        const $a = $(a);
        const href = $a.attr('href') || '';
        const name = clean($a.find('span').first().text()) || clean($a.text());
        const cnt = clean($a.find('i').first().text());
        if (!href || !name) return;
        const id = abs(href);
        if (seen.has(id)) return;
        seen.add(id);

        out.push({
            vod_id: id,
            vod_name: name,
            vod_pic: '',
            vod_remarks: /\d/.test(cnt) ? `${cnt} 部` : '',
        });
    });

    return out;
}

// 分页: 取 .pagination 里最大的页码
function parsePageCount(html) {
    const $ = load(String(html || ''));
    let max = 1;
    $('.pagination a.page-numbers, .pagination span.page-numbers').each((_, el) => {
        const t = clean($(el).text());
        const n = parseInt(t, 10);
        if (n > max) max = n;
    });
    return max;
}

/* --------------------------------------------------------------------------
 *  详情页
 *    字段在 <ul class="data"><li><b>Release:</b> <span class="colspan">…</span></li>
 *    Release / Studio / Label / Genre / Cast / Country / Director / Status
 * ------------------------------------------------------------------------ */
function readDataFields($) {
    const f = {};
    $('ul.data > li').each((_, el) => {
        const $el = $(el);
        const label = clean($el.find('b').first().text()).replace(/[:：]\s*$/, '').toLowerCase();
        if (!label) return;
        const $v = $el.find('span.colspan').first();
        if (!$v.length) return;

        const links = $v.find('a').map((i, a) => clean($(a).text())).get().filter(Boolean);
        const val = links.length ? links.join(' / ') : clean($v.text());
        if (!val) return;
        if (f[label] === undefined) f[label] = val;
    });
    return f;
}

function parseDetail(html, id) {
    const $ = load(String(html || ''));

    const name = clean($('h1.entry-title').first().text())
        || clean($('meta[property="og:title"]').attr('content'))
        || clean($('title').first().text());

    let pic = $('meta[property="og:image"]').attr('content') || '';
    if (!pic) pic = $('.limage img, img.ts-post-image').first().attr('src') || '';

    const f = readDataFields($);
    const release = f.release || '';
    const year = (release.match(/\d{4}/) || [])[0] || '';

    // 上映日期: 优先 itemprop=datePublished 的 datetime
    let pubdate = clean($('time[itemprop="datePublished"]').first().attr('datetime'));
    if (!pubdate) pubdate = clean($('time[itemprop="dateCreated"]').first().attr('datetime')) || release;

    const genres = [];
    $('ul.data li').each((_, li) => {
        const label = clean($(li).find('b').first().text()).replace(/[:：]\s*$/, '').toLowerCase();
        if (label !== 'genre') return;
        $(li).find('span[itemprop="genre"] a').each((i, a) => {
            const t = clean($(a).text());
            if (t) genres.push(t);
        });
    });

    const casts = [];
    $('ul.data li').each((_, li) => {
        const label = clean($(li).find('b').first().text()).replace(/[:：]\s*$/, '').toLowerCase();
        if (label !== 'cast') return;
        $(li).find('span[itemprop="actor"] a').each((i, a) => {
            const t = clean($(a).text());
            if (t) casts.push(t);
        });
    });

    const embed = $('iframe[src*="play.ziziflix.com"]').first().attr('src')
        || (String(html).match(/https:\/\/play\.ziziflix\.com\/\?v=[A-Za-z0-9_-]+/) || [])[0]
        || '';

    const typeName = genres.length ? genres.join(' / ') : clean(f.genre || '');
    const remarks = [f.status, f.studio].filter(Boolean).join(' · ');

    return {
        vod_id: id,
        vod_name: name,
        vod_pic: pic ? abs(pic) : '',
        vod_year: year,
        vod_area: f.country || '',
        vod_pubdate: pubdate,
        vod_director: f.director || '',
        vod_actor: casts.length ? casts.join(',') : (f.cast || ''),
        vod_remarks: remarks,
        type_name: typeName,
        vod_content: [f.studio ? `片商: ${f.studio}` : '', f.label ? `系列: ${f.label}` : '', f.status ? `状态: ${f.status}` : '']
            .filter(Boolean)
            .join(' | '),
        _embed: embed,
        _studio: f.studio || '',
        _label: f.label || '',
    };
}

/* --------------------------------------------------------------------------
 *  播放源解析
 *    play.ziziflix.com/?v=<slug>  →  const datas = "<base64>"
 *    → JSON{ user_id, slug, md5_id, media }
 *    → key = md5("user_id:slug:md5_id"), AES-256-CTR, iv = key[:16]
 *    → {"mp4":{"sources":[{label,res_id,size,path,url}]}}
 * ------------------------------------------------------------------------ */
async function resolveMedia(embedUrl) {
    const html = await getText(embedUrl, `${site}/`);
    const m = String(html).match(/const\s+datas\s*=\s*"([^"]+)"/);
    if (!m) return null;

    let meta;
    try {
        meta = JSON.parse(Buffer.from(m[1], 'base64').toString('latin1'));
    } catch (e) {
        return null;
    }
    if (!meta || !meta.media) return null;

    const keyHex = createHash('md5')
        .update(`${meta.user_id}:${meta.slug}:${meta.md5_id}`)
        .digest('hex');
    const key = Buffer.from(keyHex, 'utf8'); // 32 字节 ASCII
    const iv = key.subarray(0, 16);

    let plain;
    try {
        const decipher = createDecipheriv('aes-256-ctr', key, iv);
        const body = Buffer.from(String(meta.media), 'latin1');
        plain = Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
    } catch (e) {
        return null;
    }

    let data;
    try {
        data = JSON.parse(plain);
    } catch (e) {
        return null;
    }

    const sources = [];
    const push = (kind, arr) => {
        (arr || []).forEach((s) => {
            if (!s || s.status === false) return;
            let url = '';
            if (s.url && s.path) url = `${String(s.url).replace(/\/+$/, '')}/${String(s.path).replace(/^\/+/, '')}`;
            else if (s.url && /^https?:\/\//i.test(s.url)) url = s.url;
            if (!url) return;
            sources.push({
                kind,
                label: clean(s.label || `${s.res_id || ''}p`) || kind,
                res_id: Number(s.res_id || 0),
                size: Number(s.size || 0),
                codec: s.codec || '',
                sub: s.sub || '',
                url,
            });
        });
    };

    Object.keys(data || {}).forEach((kind) => {
        const node = data[kind];
        if (node && Array.isArray(node.sources)) push(kind.toUpperCase(), node.sources);
    });

    // 注意:fristDatas 只是首段(partSize 通常 8~10MB),单独拿来播只能放开头,
    // 所以不作为播放源使用 —— 没有完整 path 的作品在 play 里退回 iframe 播放器。

    // 去重 + 按清晰度从高到低
    const seen = new Set();
    const uniq = sources.filter((s) => {
        if (seen.has(s.url)) return false;
        seen.add(s.url);
        return true;
    });
    uniq.sort((a, b) => b.res_id - a.res_id || b.size - a.size);

    return { sources: uniq, raw: data, meta };
}

// 播放器 expandKey: 数字字符按数值 0-9 进 md5,其余字符按 charCode
function numericKey(value) {
    const raw = String(value);
    const bytes = Buffer.from(raw.split('').map((c) => (/\d/.test(c) ? Number(c) : c.charCodeAt(0))));
    return createHash('md5').update(bytes).digest('hex');
}

function encryptPath(plaintext, keyHex) {
    const keyBytes = Buffer.from(keyHex, 'utf8');
    const iv = Buffer.from(keyHex.slice(0, 16), 'utf8');
    const enc = Buffer.concat([
        createCipheriv('aes-256-ctr', keyBytes, iv).update(Buffer.from(plaintext, 'utf8')),
        createCipheriv('aes-256-ctr', keyBytes, iv).final(),
    ]);
    return Buffer.from(enc.toString('base64').replace(/=/g, ''), 'utf8').toString('base64').replace(/=/g, '');
}

function sourceHost(media, source) {
    const domains = media?.raw?.mp4?.domains || [];
    const sub = String(source.sub || '');
    const hit = domains.find((d) => sub && String(d).startsWith(`${sub}.`));
    if (hit) return String(hit);
    if (domains[0]) return String(domains[0]);
    return '';
}

function directMp4(media, source) {
    const host = sourceHost(media, source);
    const size = Number(source.size || 0);
    const md5Id = media?.meta?.md5_id;
    const slug = media?.meta?.slug;
    if (!host || !size || !md5Id || !slug || !source.res_id) return '';
    const path = `/mp4/${md5Id}/${source.res_id}/${size}?v=${slug}`;
    const token = encryptPath(path, numericKey(size));
    return `https://${host}/sora/${size}/${token}`;
}

function qualityName(s) {
    if (s.label) {
        const l = String(s.label).toLowerCase();
        if (/^\d{3,4}p$/.test(l)) return l;
    }
    return clean(s.label) || `${s.res_id || ''}p`.replace(/^p$/, '原画');
}

/* --------------------------------------------------------------------------
 *  接口
 * ------------------------------------------------------------------------ */
async function init() {
    return {
        class: [],
        filters: {},
    };
}

async function home() {
    const classes = [
        { type_id: 'home', type_name: '🏠 首页推荐' },
        { type_id: 'latest-av', type_name: '🆕 最新发布' },
        { type_id: 'popular', type_name: '🔥 最受欢迎' },
    ];

    // 年份
    try {
        const html = await getText(`${site}/years/`, `${site}/`, 6 * 3600 * 1000);
        const $ = load(html);
        const years = [];
        $('ul.taxindex li a').each((_, a) => {
            const href = $(a).attr('href') || '';
            const name = clean($(a).find('span').first().text()) || clean($(a).text());
            if (/years\/\d{4}/.test(href) && name) years.push({ type_id: `years/${name}`, type_name: `📅 ${name}` });
        });
        years
            .sort((a, b) => (parseInt(b.type_name.replace(/\D/g, ''), 10) || 0) - (parseInt(a.type_name.replace(/\D/g, ''), 10) || 0))
            .slice(0, 8)
            .forEach((y) => classes.push(y));
    } catch (e) {
        /* 年份拉不到不影响主分类 */
    }

    // 头部大类入口(目录页)
    classes.push(
        { type_id: 'genre', type_name: '📚 全部类别' },
        { type_id: 'studio', type_name: '🏷️ 片商目录' },
        { type_id: 'label', type_name: '🎬 系列目录' },
        { type_id: 'director', type_name: '🎥 导演目录' },
        { type_id: 'country', type_name: '🌏 国家' },
    );

    // 真实类别(按片量排序,挂前 30 个)
    try {
        const html = await getText(`${site}/genre/`, `${site}/`, 6 * 3600 * 1000);
        const $ = load(html);
        const items = [];
        $('ul.taxindex li a').each((_, a) => {
            const href = $(a).attr('href') || '';
            const name = clean($(a).find('span').first().text());
            const cnt = parseInt(clean($(a).find('i').first().text()), 10) || 0;
            if (!href || !name) return;
            items.push({ type_id: normPath(href), type_name: `${name}${cnt ? ` · ${cnt}` : ''}`, cnt });
        });
        items.sort((a, b) => b.cnt - a.cnt);
        items.slice(0, 30).forEach((it) => classes.push({ type_id: it.type_id, type_name: it.type_name }));
    } catch (e) {
        /* 同上 */
    }

    // 热门片商(前 16)
    try {
        const html = await getText(`${site}/studio/`, `${site}/`, 6 * 3600 * 1000);
        const items = parseTaxIndex(html);
        items.slice(0, 16).forEach((it) => classes.push({ type_id: normPath(it.vod_id), type_name: `🏢 ${it.vod_name}` }));
    } catch (e) {
        /* 同上 */
    }

    return { class: classes, filters: {} };
}

async function category(inReq) {
    const body = inReq.body || {};
    const tid = body.id || body.tid || body.type_id || '';
    const page = parseInt(body.page || body.pg || 1, 10) || 1;
    const path = normPath(tid);
    const first = path.split('/').filter(Boolean)[0] || '';

    // 目录页: 返回索引卡片
    if (path && TAX_PAGES.indexOf(first) >= 0 && path.split('/').filter(Boolean).length === 1) {
        const html = await getText(`${site}/${path}/`, `${site}/`, 6 * 3600 * 1000);
        const list = parseTaxIndex(html);
        return { page: 1, pagecount: 1, limit: list.length, total: 0, list };
    }

    // 影片列表
    let url;
    if (!path || path === 'home') url = page > 1 ? `${site}/page/${page}/` : `${site}/`;
    else url = page > 1 ? `${site}/${path}/page/${page}/` : `${site}/${path}/`;

    const html = await getText(url, `${site}/`);
    const list = parseCards(html);
    const pagecount = parsePageCount(html);

    return {
        page,
        pagecount: Math.max(pagecount, page),
        limit: list.length || 24,
        total: 0,
        list,
    };
}

async function detail(inReq) {
    const raw = String((inReq.body && inReq.body.id) || '');
    const url = /^https?:\/\//i.test(raw) ? raw : abs(raw);
    const html = await getText(url, `${site}/`);
    const vod = parseDetail(html, raw || url);

    const lines = [];
    if (vod._embed) {
        try {
            const media = await resolveMedia(vod._embed);
            (media?.sources || []).forEach((s) => {
                if (!directMp4(media, s)) return;
                lines.push(`${qualityName(s)}$${b64encode(`${vod._embed}|${s.res_id}`)}`);
            });
        } catch (e) {
            /* 播放器页失败就不出线路 */
        }
    }

    const item = {
        vod_id: raw || url,
        vod_name: vod.vod_name,
        vod_pic: vod.vod_pic,
        vod_content: vod.vod_content,
        vod_year: vod.vod_year,
        vod_area: vod.vod_area,
        vod_pubdate: vod.vod_pubdate,
        vod_director: vod.vod_director,
        vod_actor: vod.vod_actor,
        vod_remarks: vod.vod_remarks,
        type_name: vod.type_name,
        vod_play_from: lines.length ? 'Zizi' : '',
        vod_play_url: lines.join('#'),
    };

    return { list: [item] };
}

async function play(inReq) {
    const fail = { parse: 0, url: '', header: { 'User-Agent': UA } };
    const raw = String((inReq.body && inReq.body.id) || '').trim();
    if (!raw) return fail;

    let target = b64decode(raw) || raw;
    let resId = '';
    const pipe = target.lastIndexOf('|');
    if (pipe > -1) {
        resId = target.slice(pipe + 1);
        target = target.slice(0, pipe);
    }

    let embed = '';
    if (/play\.ziziflix\.com/i.test(target)) embed = target;
    else {
        const page = /^https?:\/\//i.test(target) ? target : abs(target);
        const html = await getText(page, `${site}/`);
        embed = parseDetail(html, page)._embed;
    }
    if (!embed) return fail;

    const media = await resolveMedia(embed);
    const sources = media?.sources || [];
    const source = sources.find((s) => String(s.res_id) === String(resId)) || sources[0];
    const url = source ? directMp4(media, source) : '';
    if (!url) return fail;

    return {
        parse: 0,
        url,
        header: {
            'User-Agent': UA,
            Referer: 'https://play.ziziflix.com/',
        },
    };
}

async function search(inReq) {
    const body = inReq.body || {};
    const wd = String(body.wd || body.key || body.word || '').trim();
    const page = parseInt(body.page || body.pg || 1, 10) || 1;
    const order = String(body.order || '').trim();

    if (!wd) return { page: 1, pagecount: 1, limit: 0, total: 0, list: [] };

    // 站内搜索分页走 /page/<n>/?s=<kw>(不是 &page=),这点跟列表页不一样
    const params = new URLSearchParams();
    params.set('s', wd);
    if (order) params.set('order', order);

    const url = page > 1 ? `${site}/page/${page}/?${params.toString()}` : `${site}/?${params.toString()}`;
    const html = await getText(url, `${site}/`);
    const list = parseCards(html);

    return { page, pagecount: parsePageCount(html), limit: list.length || 24, total: 0, list };
}

export default {
    meta: { key: 'ziziflix', name: '🌸ZiziFlix', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
