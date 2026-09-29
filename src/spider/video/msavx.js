import axios from 'axios';
import { load } from 'cheerio';

const HOST = 'http://transwww.marcelf.com';
const SITE = HOST + '/cn/';
const UA =
    'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const COOKIE = 'ym_iscookie=1; ym_show_number7338=1; _slide_passed=1; ad_index=1';

const SKIP_CATS = new Set([
    '首页', '登录', '注册', '会员', '充值', 'APP', '下载', '搜索', '排行', '最新', '热门',
    '专题', '资讯', '留言', '求片', '更多', '观看日本AV', '观看AV', '我的收藏',
    '我的影片收藏', '我的片单', '我的女优收藏', '观看记录',
]);

function headers(referer) {
    return {
        'User-Agent': UA,
        Referer: referer || SITE,
        Cookie: COOKIE,
        'Accept-Language': 'zh-CN,zh;q=0.9',
    };
}

function href(h) {
    if (!h) return '';
    const raw = String(h).replace(/\\\//g, '/');
    try {
        return new URL(raw, HOST).href;
    } catch {
        return raw;
    }
}

function clean(s) {
    return String(s || '')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function decodeHtml(text) {
    const m = String(text || '').match(/"([0-9a-fA-F]{1000,})"/);
    if (m) {
        try {
            return Buffer.from(m[1], 'hex').toString('utf8');
        } catch {
            /* ignore */
        }
    }
    return String(text || '');
}

async function getHtml(url, referer) {
    const resp = await axios.get(url, {
        headers: headers(referer),
        timeout: 20000,
        responseType: 'text',
        validateStatus: () => true,
    });
    const data = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    return decodeHtml(data);
}

function titleFromScript(text) {
    const m = String(text).match(/window\.videoConfig\s*=\s*\{[\s\S]*?title:\s*"([^"]+)"/);
    return m ? clean(m[1]) : '';
}

function imgFromScript(text) {
    const m = String(text).match(/window\.videoConfig\s*=\s*\{[\s\S]*?img:\s*"([^"]+)"/);
    return m ? href(m[1]) : '';
}

function videoUrlFromScript(text) {
    const m = String(text).match(/window\.videoConfig\s*=\s*\{[\s\S]*?url:\s*"([^"]+)"/);
    return m ? href(m[1]) : '';
}

function searchPage(html) {
    const $ = load(html);
    const out = [];
    const seen = new Set();

    $('.video-preview-trigger').each((_, el) => {
        const $el = $(el);
        const a = $el.find('a[href]').first();
        let u = href(a.attr('href') || '');
        if (!u || seen.has(u)) return;
        const pic = href($el.find('img').attr('src') || $el.find('img').attr('data-src') || '');
        let title = clean($el.nextAll('a').first().text() || $el.find('a').eq(1).text() || '');
        if (!title) {
            try {
                title = decodeURIComponent(u.replace(/\/$/, '').split('/').pop() || '');
            } catch {
                title = u.replace(/\/$/, '').split('/').pop() || '';
            }
        }
        out.push({ vod_id: u, vod_name: title, vod_pic: pic, vod_remarks: '' });
        seen.add(u);
    });

    if (out.length) return out;

    $('a.video-preview-trigger[href*="/cn/"]').each((_, el) => {
        const $el = $(el);
        const u = href($el.attr('href') || '');
        if (!u || seen.has(u)) return;
        let title = '';
        try {
            title = decodeURIComponent(u.replace(/\/$/, '').split('/').pop() || '');
        } catch {
            title = u.replace(/\/$/, '').split('/').pop() || '';
        }
        out.push({
            vod_id: u,
            vod_name: title,
            vod_pic: href($el.find('img').attr('src') || $el.find('img').attr('data-src') || ''),
            vod_remarks: '',
        });
        seen.add(u);
    });
    return out;
}

function actressItems(html) {
    const $ = load(html);
    const out = [];
    const seen = new Set();
    $('a[href*="/cn/actresses/"]').each((_, el) => {
        const $el = $(el);
        const u = href($el.attr('href') || '');
        if (!u || seen.has(u) || /\/cn\/actresses\/?$/.test(u.split('?')[0])) return;
        let name = clean($el.text());
        if (!name) {
            try {
                name = decodeURIComponent(u.replace(/\/$/, '').split('/').pop() || '');
            } catch {
                name = u.replace(/\/$/, '').split('/').pop() || '';
            }
        }
        const pic = href($el.find('img').attr('src') || $el.find('img').attr('data-src') || '');
        out.push({
            vod_id: 'folder_' + u,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: '目录',
            vod_tag: 'folder',
        });
        seen.add(u);
    });
    return out;
}

function folderLinks(html, kind) {
    const $ = load(html);
    const out = [];
    const seen = new Set();
    $(`a[href*="/cn/${kind}/"]`).each((_, el) => {
        const $el = $(el);
        const u = href($el.attr('href') || '');
        if (!u || seen.has(u) || new RegExp(`/cn/${kind}/?$`).test(u.split('?')[0])) return;
        const name = clean($el.text());
        if (!name || /\d+\s*条影片/.test(name)) return;
        const pic = href($el.find('img').attr('src') || $el.find('img').attr('data-src') || '');
        out.push({
            vod_id: 'folder_' + u,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: '目录',
            vod_tag: 'folder',
        });
        seen.add(u);
    });
    return out;
}

function parseTotal(html) {
    const m = String(html).match(/\.\$\("mac_total"\)\.text\(["'](\d+)["']\)/i);
    if (m) return parseInt(m[1], 10);
    return 0;
}

function pageCount(html, pg, items, total) {
    const next = new RegExp(`href=["'][^"']*[?&]page=${pg + 1}[^"']*["'][^>]*>\\s*下一页`, 'i').test(html);
    let pc = next ? pg + 1 : pg;
    if (!next && items.length >= 20) pc = pg + 1;
    if (total && items.length > 0) pc = Math.max(pc, pg);
    return pc;
}

async function cats() {
    const t = await getHtml(SITE, SITE);
    const $ = load(t);
    const blocks = [];
    $('div[class*="dropdown-menu"], div[class*="flex flex-col"], div[class*="hidden xl:flex"]').each((_, el) => {
        blocks.push($(el).html() || '');
    });
    const $src = load(blocks.length ? blocks.join('\n') : t);
    const list = [];
    const seen = new Set();
    $src('a[href*="/cn/"], a[href*="/dm"]').each((_, el) => {
        const $el = $src(el);
        const u = href($el.attr('href') || '');
        const name = clean($el.text());
        if (!name || SKIP_CATS.has(name) || seen.has(u)) return;
        if (u.includes('/user/') || u.toLowerCase().includes('javascript:')) return;
        if (!/\/(cn|dm\d+)\//.test(u)) return;
        list.push({ type_id: u, type_name: name });
        seen.add(u);
    });
    return list;
}

async function init() {
    return {};
}

async function home() {
    const raw = await cats();
    const classes = [];
    for (const c of raw) {
        if (c.type_name === '女优一览') {
            classes.push({ type_id: 'folder_' + href('/cn/actresses'), type_name: '女优一览', vod_tag: 'folder' });
            continue;
        }
        if (c.type_name === '类型') {
            classes.push({ type_id: 'folder_' + href('/cn/genres'), type_name: '类型', vod_tag: 'folder' });
            continue;
        }
        if (c.type_name === '发行商') {
            classes.push({ type_id: 'folder_' + href('/cn/makers'), type_name: '发行商', vod_tag: 'folder' });
            continue;
        }
        classes.push(c);
    }
    const html = await getHtml(SITE, SITE);
    return { class: classes, filters: {}, list: searchPage(html) };
}

function withPage(u, pg) {
    if (String(pg) === '1') return u;
    if (u.includes('?page=')) return u.replace(/([?&]page=)\d+/, `$1${pg}`);
    return u + (u.includes('?') ? '&' : '?') + 'page=' + pg;
}

async function category(inReq) {
    let tid = String(inReq.body.id || '');
    const pg = parseInt(inReq.body.page || 1, 10) || 1;

    if (tid.startsWith('folder_')) {
        let u = tid.slice(7);
        if (/\/cn\/actresses\/[^/?#]+\/?$/.test(u)) {
            u = u.replace(/\/$/, '') + '?sort=published_at&page=' + pg;
        } else {
            u = withPage(u, pg);
        }
        const text = await getHtml(u, u);
        const total = parseTotal(text);
        const rootU = u.split('?')[0].replace(/\/$/, '');
        let items = [];
        if (/\/cn\/actresses$/.test(rootU)) items = actressItems(text);
        else if (/\/cn\/genres$/.test(rootU)) items = folderLinks(text, 'genres');
        else if (/\/cn\/makers$/.test(rootU)) items = folderLinks(text, 'makers');
        else items = searchPage(text);
        return { page: pg, pagecount: pageCount(text, pg, items, total), limit: items.length, total, list: items };
    }

    let u = tid.startsWith('http') ? tid : href(tid);
    u = withPage(u, pg);
    const text = await getHtml(u, SITE);
    const items = searchPage(text);
    let total = parseTotal(text);
    if (!total && items.length) {
        const mm = String(text).match(/pageCount\s*[:=]\s*(\d+)/i);
        if (mm) total = parseInt(mm[1], 10);
    }
    return { page: pg, pagecount: pageCount(text, pg, items, total), limit: items.length, total, list: items };
}

async function detail(inReq) {
    let u = inReq.body.id;
    if (Array.isArray(u)) u = u[0];
    u = href(String(u));
    const text = await getHtml(u, SITE);
    let title = titleFromScript(text);
    if (!title) {
        const $ = load(text);
        title = clean($('h1').first().text());
        if (!title) {
            try {
                title = decodeURIComponent(u.replace(/\/$/, '').split('/').pop() || '');
            } catch {
                title = u.replace(/\/$/, '').split('/').pop() || '';
            }
        }
    }
    let pic = imgFromScript(text);
    if (!pic) {
        const $ = load(text);
        pic = href($('meta[property="og:image"]').attr('content') || '');
    }
    const $ = load(text);
    const content = clean($('meta[name="description"]').attr('content') || '');
    const play = videoUrlFromScript(text) || u;
    return {
        list: [
            {
                vod_id: u,
                vod_name: title,
                vod_pic: pic,
                vod_content: content,
                vod_play_from: 'MSAVX',
                vod_play_url: '正片$' + play,
            },
        ],
    };
}

async function play(inReq) {
    let url = String(inReq.body.id || '');
    let pageUrl = '';
    if (/^https?:\/\//i.test(url) && !/\.(?:mp4|m3u8|flv|m4v)(?:$|[?#])/i.test(url)) {
        pageUrl = url;
        const text = await getHtml(url, url);
        url = videoUrlFromScript(text) || url;
    }
    return {
        parse: /\.(?:m3u8|mp4|flv|m4v)(?:$|[?#])/i.test(url) ? 0 : 1,
        jx: 0,
        playUrl: '',
        url,
        header: {
            'User-Agent': UA,
            Referer: pageUrl || SITE,
        },
    };
}

async function search(inReq) {
    const key = encodeURIComponent(String(inReq.body.wd || ''));
    const pg = parseInt(inReq.body.page || 1, 10) || 1;
    let u = SITE + 'search?keyword=' + key;
    if (pg !== 1) u += '&page=' + pg;
    const text = await getHtml(u, SITE);
    const items = searchPage(text);
    return {
        page: pg,
        pagecount: items.length >= 20 ? pg + 1 : pg,
        limit: items.length,
        total: items.length,
        list: items,
    };
}

export default {
    meta: {
        key: 'msavx',
        name: '🌸MSAVX',
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
