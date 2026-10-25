import axios from 'axios';

const SITE = {
    name:    'XSZAV',
    domains: ['https://cn.xsz-av.com', 'https://tw.xsz-av.com', 'https://en.xsz-av.com'],
};

const CATS = [
    { type_id: 'japanese',       type_name: '日本AV'  },
    { type_id: 'uncensored',     type_name: '无码影片' },
    { type_id: 'uncensored-leak',type_name: '无码流出' },
    { type_id: 'amateur',        type_name: '素人'    },
    { type_id: 'chinese',        type_name: '中国'    },
    { type_id: 'korean',         type_name: '韩国'    },
    { type_id: 'western',        type_name: '欧美'    },
    { type_id: 'hanime',         type_name: '动漫'    },
    { type_id: 'actresses',      type_name: '女优'    },
    { type_id: 'tags',           type_name: '标签'    },
];

const VIDEO_CATS = ['japanese','uncensored','uncensored-leak','amateur','chinese','korean','western','hanime'];

const SORTS = [
    { n: '最新更新', v: '' }, { n: '正在观看', v: 'bw' }, { n: '最多观看', v: 'mv' },
    { n: '最受欢迎', v: 'tf' }, { n: '最长', v: 'lg' },
];
const ACT_SORTS = [
    { n: '最多观看', v: '' }, { n: '视频', v: 'v' }, { n: '出道', v: 'd' },
];

const UA      = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const TIMEOUT = 15_000;
const RETRY   = 3;
const LOGO    = 'https://cn.xsz-av.com/logo.png';

let hostCache = '';

const http = axios.create({
    timeout: TIMEOUT,
    headers: {
        'User-Agent': UA,
        Referer:      'https://cn.xsz-av.com/',
        Accept:       'text/html,application/xhtml+xml,*/*',
    },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normExtend(extend) {
    if (!extend) return {};
    if (typeof extend === 'object') return extend;
    try {
        const o = JSON.parse(String(extend));
        return typeof o === 'object' ? o : {};
    } catch { return {}; }
}

function normPg(pg, def = 1) {
    const n = parseInt(pg);
    return isNaN(n) || n < 1 ? def : n;
}

function normIds(ids) {
    const arr = Array.isArray(ids) ? ids.map(String) : String(ids || '').split(',');
    return arr.map((s) => s.trim()).filter(Boolean);
}

function query(params) {
    const parts = params.filter(([, v]) => v !== null && v !== '' && v !== undefined).map(([k, v]) => `${k}=${v}`);
    return parts.length ? '?' + parts.join('&') : '';
}

function decodeHtml(str) {
    return String(str || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

function txtOf(s) {
    let r = (s || '').replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
    r = r.replace(/<[^>]+>/g, ' ');
    return decodeHtml(r).replace(/\s+/g, ' ').trim();
}

function pagecount(html, pg) {
    const nums = [...(html || '').matchAll(/[?&]page=(\d+)/g)].map((m) => parseInt(m[1]));
    return nums.length ? Math.max(...nums) : pg;
}

async function getBase() {
    if (hostCache) return hostCache;
    for (const d of SITE.domains) {
        try {
            const { status } = await http.get(d + '/');
            if (status < 500) { hostCache = d; return d; }
        } catch { /* ignore */ }
    }
    hostCache = SITE.domains[0];
    return hostCache;
}

async function httpGet(path, base = null) {
    const b    = base || await getBase();
    const urls = path.startsWith('http') ? [path] : [b.replace(/\/$/, '') + path];
    if (!base && !path.startsWith('http')) {
        for (const d of SITE.domains) {
            const u = d.replace(/\/$/, '') + path;
            if (!urls.includes(u)) urls.push(u);
        }
    }
    for (const u of urls) {
        for (let i = 0; i < RETRY; i++) {
            try {
                const { data, status, request } = await http.get(u);
                if (status < 400 && data) {
                    const finalUrl = request?.res?.responseUrl || u;
                    const m = finalUrl.match(/^(https?:\/\/[^/]+)/);
                    return [data, m ? m[1] : b];
                }
            } catch { /* ignore */ }
            await new Promise((r) => setTimeout(r, 400 * (i + 1)));
        }
    }
    return ['', b];
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

function parseVideos(html) {
    const out  = [], seen = new Set();
    const blocks = (html || '').split('<div class="thumbnail"');
    for (const b of blocks.slice(1)) {
        const vidM = b.match(/href="\/video\/(\d+)"/);
        if (!vidM) continue;
        const vid = vidM[1];
        if (seen.has(vid)) continue;
        seen.add(vid);

        const picM = b.match(/<img[^>]+data-src="(https:\/\/img[^"]+)"/);
        const pic  = picM ? picM[1] : '';

        let title = '';
        const altM = b.match(/<img[^>]+alt="([^"]*)"/);
        if (altM) title = decodeHtml(altM[1]).trim();
        if (!title) {
            const re = new RegExp(`href="/video/${vid}"[^>]*class="text-zinc[^"]*"[^>]*>(.*?)</a>`, 's');
            const tm = b.match(re);
            if (tm) title = txtOf(tm[1]);
        }

        const durM = b.match(/>\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*<\/span>/);
        const dur  = durM ? durM[1] : '';

        out.push({ vod_id: vid, vod_name: title.slice(0, 120), vod_pic: pic, vod_remarks: dur });
    }
    return out;
}

function parseActresses(html) {
    const out = [], seen = new Set();
    const re  = /href="(\/actresses\/[^"]+)"[^>]*>\s*<div class="mx-auto[^"]*"[^>]*>\s*<img[^>]+alt="([^"]*)"[^>]+data-src="(https:\/\/img[^"]+)"/gs;
    for (const m of (html || '').matchAll(re)) {
        const [, href, name, pic] = m;
        if (seen.has(href)) continue;
        seen.add(href);

        const tail    = (html || '').slice(m.index + m[0].length, m.index + m[0].length + 600);
        const cntM    = tail.match(/(\d+)\s*视频/);
        const debutM  = tail.match(/出道:\s*(\d+)/);
        let remarks   = '';
        if (cntM)   remarks = cntM[1] + ' 视频';
        if (debutM) remarks = (remarks + ' · 出道 ' + debutM[1]).replace(/^ ·|· $/, '').trim();

        const enc = href.split('/actresses/')[1];
        out.push({
            vod_id:      'actress:' + enc,
            vod_name:    decodeHtml(name).trim(),
            vod_pic:     pic,
            vod_remarks: remarks,
            vod_tag:     'folder',
        });
    }
    return out;
}

function parseTags(html) {
    const out = [], seen = new Set();
    const re  = /href="\/search\/videos\/([^"]+)" class="text-orange[^"]*">([^<]+)<\/a>/g;
    for (const m of (html || '').matchAll(re)) {
        const [, enc, name] = m;
        if (seen.has(enc) || !name.trim()) continue;
        seen.add(enc);
        out.push({ vod_id: 'tag:' + enc, vod_name: name.trim(), vod_pic: LOGO, vod_remarks: '标签', vod_tag: 'folder' });
    }
    return out;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(inReq, _outResp) {
    const ext = normExtend(inReq.body?.extend || '');
    const h   = ext.host || ext.url || ext.site || '';
    if (h.startsWith('http')) hostCache = h.replace(/\/$/, '');
    return {};
}

async function home(_inReq, _outResp) {
    const filters = {};
    for (const c of VIDEO_CATS) filters[c] = [{ key: 'o', name: '排序', init: '', value: SORTS }];
    filters['actresses'] = [{ key: 'o', name: '排序', init: '', value: ACT_SORTS }];

    let list = [];
    try {
        const [html] = await httpGet('/videos/japanese');
        list = parseVideos(html);
    } catch { /* ignore */ }

    return { class: CATS, filters, list };
}

async function category(inReq, _outResp) {
    let tid    = String(inReq.body.id || 'japanese');
    const pg   = normPg(inReq.body.page);
    const ext  = normExtend(inReq.body.extend || {});
    const sort = ext.o || '';

    if (tid.startsWith('actress:')) {
        const enc = tid.split(':')[1];
        const [html] = await httpGet('/actresses/' + enc + query([['page', pg > 1 ? pg : '']]));
        const items  = parseVideos(html);
        return { list: items, page: pg, pagecount: pagecount(html, pg), limit: items.length, total: 999999 };
    }

    if (tid.startsWith('tag:')) {
        const enc = tid.split(':')[1];
        const [html] = await httpGet('/search/videos/' + enc + query([['page', pg > 1 ? pg : '']]));
        const items  = parseVideos(html);
        return { list: items, page: pg, pagecount: pagecount(html, pg), limit: items.length, total: 999999 };
    }

    if (tid === 'actresses') {
        const [html] = await httpGet('/actresses' + query([['o', sort], ['page', pg > 1 ? pg : '']]));
        const items  = parseActresses(html);
        return { list: items, page: pg, pagecount: pagecount(html, pg), limit: items.length, total: 999999 };
    }

    if (tid === 'tags') {
        const [html] = await httpGet('/tags' + query([['page', pg > 1 ? pg : '']]));
        const items  = parseTags(html);
        return { list: items, page: pg, pagecount: pagecount(html, pg), limit: items.length, total: 999999 };
    }

    if (!VIDEO_CATS.includes(tid)) tid = 'japanese';
    const [html] = await httpGet('/videos/' + tid + query([['o', sort], ['page', pg > 1 ? pg : '']]));
    const items  = parseVideos(html);
    return { list: items, page: pg, pagecount: pagecount(html, pg), limit: items.length, total: 999999 };
}

async function detail(inReq, _outResp) {
    const vids = normIds(inReq.body.id);
    if (!vids.length) return { list: [] };

    let vid = vids[0];
    if (vid.includes('/')) vid = vid.replace(/\/$/, '').split('/').pop();
    if (!/^\d+$/.test(vid)) return { list: [] };

    const [html, base] = await httpGet('/video/' + vid);
    if (!html) return { list: [] };

    const h1M  = html.match(/<h1[^>]*>(.*?)<\/h1>/s);
    const title = h1M ? txtOf(h1M[1]) : '';

    let pic = '';
    const picM = html.match(/<img src="(https:\/\/img[^"]*w_800[^"]*)"/) ||
                 html.match(/<video[^>]+>[\s\S]*?<img src="(https:\/\/img[^"]+)"/s);
    if (picM) pic = picM[1];

    const fields = {}, actors = [], classes = [];
    for (const m of html.matchAll(/<span class="mr-1">([^<]+)<\/span>(.*?)<\/div>/gs)) {
        const lab  = m[1].trim().replace(/:$/, '');
        const rest = m[2];
        const links = [...rest.matchAll(/href="[^"]+"[^>]*>([^<]+)<\/a>/g)].map((x) => x[1]);
        if (lab === 'AV女优') actors.push(...links);
        else if (lab === '类型') classes.push(...links);
        else fields[lab] = txtOf(rest);
    }

    const parts = [];
    if (fields['番号'])   parts.push('番号: ' + fields['番号']);
    if (fields['添加日期']) parts.push('添加日期: ' + fields['添加日期']);
    if (fields['标题'])   parts.push('原标题: ' + fields['标题']);
    if (classes.length)  parts.push('类型: ' + classes.join(', '));
    if (actors.length)   parts.push('女优: ' + actors.join(', '));

    return {
        list: [{
            vod_id:        vid,
            vod_name:      title,
            vod_pic:       pic,
            vod_year:      (fields['添加日期'] || '').slice(0, 4),
            vod_actor:     actors.join(', '),
            vod_class:     classes.join(', '),
            vod_content:   parts.join(' · '),
            vod_play_from: 'XSZAV',
            vod_play_url:  '高清$' + (base || await getBase()) + '/video/' + vid,
        }],
    };
}

async function play(inReq, _outResp) {
    let raw = String(inReq.body.id || '');
    if (raw.includes('$') && !raw.startsWith('http')) raw = raw.split('$')[1];
    raw = raw.trim();

    const base = await getBase();
    let url = '', pageUrl = base + '/';

    if (/^\d+$/.test(raw)) {
        pageUrl = base + '/video/' + raw;
        const [html, b2] = await httpGet(pageUrl);
        const m = (html || '').match(/src="(\/media\/v_[a-z0-9]+\.m3u8)"/);
        if (m) url = (b2 || base) + m[1];
    } else if (raw.includes('/video/')) {
        const [html, b2] = await httpGet(raw);
        pageUrl = raw.startsWith('http') ? raw : (b2 || base) + raw;
        const m = (html || '').match(/src="(\/media\/v_[a-z0-9]+\.m3u8)"/);
        if (m) url = (b2 || base) + m[1];
    } else if (raw.startsWith('http')) {
        url = raw;
    }

    return {
        parse:   0,
        jx:      0,
        playUrl: '',
        url,
        header:  { 'User-Agent': UA, Referer: pageUrl, Origin: base },
    };
}

async function search(inReq, _outResp) {
    const key = encodeURIComponent((inReq.body.wd || '').trim());
    const pg  = normPg(inReq.body.pg);
    if (!key) return { list: [], page: pg };

    const path   = '/search/videos/' + key + query([['page', pg > 1 ? pg : '']]);
    const [html] = await httpGet(path);
    return { list: parseVideos(html), page: pg };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: { key: 'xszav', name: 'XSZAV', type: 1 },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
    },
};