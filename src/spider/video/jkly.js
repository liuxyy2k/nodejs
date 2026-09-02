import axios from 'axios';
import https from 'https';

const SITE = 'https://8n78s7s7.jksolsotoday.buzz';
const UA =
    'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36';
const REFERER = `${SITE}/gogo/`;

const CATS = {
    '2': '国产视频',
    '3': '国产主播',
    '4': '91大神',
    '5': '热门事件',
    '6': '传媒自拍',
    '7': '日本有码',
    '8': '日本无码',
    '9': '日韩主播',
    '10': '动漫肉番',
    '11': '女同性恋',
    '12': '中文字幕',
    '13': '强奸乱伦',
    '14': '熟女人妻',
    '15': '制服诱惑',
    '16': 'AV解说',
    '17': '女星换脸',
    '23': '中文字幕',
    '35': '国产视频',
    '57': '日本有码',
    '58': '欧美精品',
    '423': '中文视频',
    '424': '麻豆视频',
    '437': '香蕉视频',
    '441': '糖心VLOG',
    '444': '欧美精品',
};

const UNSAFE_TERMS = [
    '幼女',
    '萝莉',
    '初中',
    '高中',
    '未成年',
    '未满18',
    '学生妹',
    '学生娘',
    '少女',
    '00后',
];


const http = axios.create({
    timeout: 15000,
    validateStatus: () => true,
    headers: {
        'User-Agent': UA,
        Referer: REFERER,
        Accept: 'text/html,application/xhtml+xml',
    },
});

function clean(s) {
    return String(s || '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
}

function abs(u) {
    if (!u) return '';
    const fixed = String(u).replace(/\\\//g, '/').trim();
    try {
        return new URL(fixed, `${SITE}/`).href;
    } catch {
        return fixed;
    }
}

function pageUrl(tid, page) {
    return `${SITE}/vodtype/${tid}-${Math.max(1, parseInt(page, 10) || 1)}/`;
}

function playHeader(extra = {}) {
    return { 'User-Agent': UA, Referer: REFERER, ...extra };
}

async function fetchHtml(url, retry = 2) {
    for (let i = 0; i <= retry; i++) {
        try {
            const r = await http.get(url);
            const text = typeof r.data === 'string' ? r.data : String(r.data || '');
            if (text.length > 200) return text;
        } catch {
            /* retry */
        }
        if (i < retry) await new Promise((r) => setTimeout(r, 400));
    }
    return '';
}

function parseCards(html, allowUnsafe = false) {
    const out = [];
    const seen = new Set();
    if (!html) return out;

    const re = /href=["']([^"']*?\/vodplay\/(\d+)-1-(\d+)\/?)["']/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const href = m[1];
        const vid = m[2];
        if (seen.has(vid)) continue;

        const start = Math.max(0, m.index - 600);
        const end = Math.min(html.length, m.index + m[0].length + 2600);
        const block = html.slice(start, end);

        let title = '';
        let tm = block.match(/class=["'][^"']*mo-situ-name[^"']*["'][^>]*title=["'](.*?)["']/is);
        if (!tm) tm = block.match(/class=["'][^"']*mo-situ-name[^"']*["'][^>]*>(.*?)<\/a>/is);
        if (tm) title = clean(tm[1]);
        if (!title) {
            tm = new RegExp(`href=["'][^"']*?/vodplay/${vid}-1-1/?["'][^>]*title=["'](.*?)["']`, 'is').exec(
                block,
            );
            if (tm) title = clean(tm[1]);
        }
        if (!title) continue;
        title = title.replace(/\s*(?:立即播放|播放)\s*$/, '').trim();
        if (!title) continue;
        if (!allowUnsafe && UNSAFE_TERMS.some((x) => title.includes(x))) continue;
        seen.add(vid);

        let pic = '';
        let pm = block.match(/(?:data-original|data-src)=["']([^"']+)/i);
        if (pm) pic = abs(pm[1]);
        if (!pic) {
            pm = block.match(/<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"']*)?)["']/i);
            if (pm) pic = abs(pm[1]);
        }
        if (!pic) {
            pm = block.match(/src=["']([^"']+)/i);
            if (pm) {
                const url = pm[1].trim();
                if (!url.endsWith('.js') && !url.endsWith('.css') && !url.endsWith('.svg') && !url.endsWith('.ico') && !url.startsWith('data:')) {
                    pic = abs(url);
                }
            }
        }
        if (!pic) {
            pm = block.match(/background-image\s*:\s*url\(["']?(.*?)["']?\)/i);
            if (pm) pic = abs(pm[1]);
        }

        let date = '';
        const dm = block.match(/class=["'][^"']*time[^"']*["'][^>]*>(.*?)<\/span>/is);
        if (dm) date = clean(dm[1]);

        out.push({
            vod_id: abs(href),
            vod_name: title,
            vod_pic: pic,
            vod_remarks: date,
            vod_year: date ? date.slice(0, 2) : '',
            vod_content: '',
        });
    }
    return out;
}

async function homeVideos() {
    const html = await fetchHtml(`${SITE}/gogo/`);
    return parseCards(html).slice(0, 60);
}

function normId(ids) {
    let s = ids;
    if (Array.isArray(s)) s = s[0] || '';
    s = decodeURIComponent(String(s)).trim().replace(/^["']|["']$/g, '');
    if (s.startsWith('[')) {
        try {
            return normId(JSON.parse(s));
        } catch {
            /* ignore */
        }
    }
    let m = s.match(/\/vodplay\/(\d+-\d+-\d+)/);
    if (m) return `${SITE}/vodplay/${m[1]}/`;
    m = s.match(/(\d+)/);
    if (m) return `${SITE}/vodplay/${m[1]}-1-1/`;
    return s;
}

async function extractPlayUrl(url) {
    const html = await fetchHtml(url);
    let m = html.match(/player_data\s*=\s*(\{.*?\})\s*<\/script>/is);
    if (!m) m = html.match(/player_data\s*=\s*(\{.*?\})/is);
    if (!m) return '';
    try {
        const d = JSON.parse(m[1].replace(/\\\//g, '/'));
        const u = d.url || '';
        return u ? abs(u) : '';
    } catch {
        return '';
    }
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = Object.entries(CATS).map(([type_id, type_name]) => ({ type_id, type_name }));
    return { class: classes, filters: {}, list: await homeVideos() };
}

async function category(inReq, _outResp) {
    const tid = String(inReq.body.id || '2');
    let page = parseInt(inReq.body.page, 10) || 1;
    if (page < 1) page = 1;
    const html = await fetchHtml(pageUrl(tid, page));
    const list = parseCards(html);
    let pm = html.match(new RegExp(`/vodtype/${tid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)/[^"']*["'][^>]*>尾页`, 'i'));
    if (!pm) pm = html.match(new RegExp(`/vodtype/${tid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)/`));
    let pagecount = page;
    if (pm) {
        const n = parseInt(pm[1], 10);
        if (!Number.isNaN(n)) pagecount = n;
    }
    return { list, page, pagecount, limit: 30, total: pagecount * 30 };
}

async function detail(inReq, _outResp) {
    const url = normId(inReq.body.id);
    const html = await fetchHtml(url);

    let title = '';
    let tm = html.match(/<span[^>]*class=["'][^"']*(?:mo-pnxs|wrap-arow)[^"']*["'][^>]*>(.*?)<\/span>/is);
    if (tm) title = clean(tm[1]);
    if (!title) {
        tm = html.match(/<title>(.*?)<\/title>/is);
        title = tm ? clean(tm[1]) : '';
        title = title.split(/详情介绍|在线观看|迅雷下载/)[0].replace(/^\s*-\s*|\s*-\s*$/g, '').trim();
    }

    let pic = '';
    let pm = html.match(/(?:data-original|data-src)=["']([^"']+)/i);
    if (pm) pic = abs(pm[1]);
    if (!pic) {
        pm = html.match(/<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"']*)?)["']/i);
        if (pm) pic = abs(pm[1]);
    }
    if (!pic) {
        pm = html.match(/<img[^>]+src=["']([^"']+)/i);
        if (pm) {
            const imgUrl = pm[1].trim();
            if (!imgUrl.endsWith('.js') && !imgUrl.endsWith('.css') && !imgUrl.endsWith('.svg') && !imgUrl.endsWith('.ico') && !imgUrl.startsWith('data:')) {
                pic = abs(imgUrl);
            }
        }
    }

    let content = '';
    const dm = html.match(/<meta[^>]+name=["']description["'][^>]+content=["'](.*?)["']/is);
    if (dm) content = clean(dm[1]);

    return {
        list: [
            {
                vod_id: url,
                vod_name: title,
                vod_pic: pic,
                type_name: '',
                vod_year: '',
                vod_area: '',
                vod_actor: '',
                vod_director: '',
                vod_content: content,
                vod_remarks: '',
                vod_play_from: '乐播云',
                vod_play_url: `正片$${url}`,
            },
        ],
    };
}

async function search(inReq, _outResp) {
    const key = String(inReq.body.wd || '');
    let page = parseInt(inReq.body.pg || inReq.body.page, 10) || 1;
    if (page < 1) page = 1;
    try {
        const r = await http.post(
            `${SITE}/vodsearch/-------------/`,
            new URLSearchParams({ wd: key }).toString(),
            {
                headers: {
                    ...playHeader(),
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            },
        );
        const html = typeof r.data === 'string' ? r.data : String(r.data || '');
        return { list: parseCards(html), page, pagecount: 1 };
    } catch {
        return { list: [], page, pagecount: 1 };
    }
}

async function play(inReq, _outResp) {
    try {
        let u = String(inReq.body.id || '');
        if (!/\.m3u8(?:\?|$)/i.test(u)) u = await extractPlayUrl(normId(u));
        return {
            parse: 0,
            url: u,
            header: playHeader(),
            format: 'application/x-mpegURL',
        };
    } catch {
        return { parse: 0, url: '', header: playHeader() };
    }
}

async function proxyHandler(inReq, outResp) {
    let url = inReq.query.url || '';
    if (Array.isArray(url)) url = url[0] || '';
    url = decodeURIComponent(url || '');
    if (!url.startsWith('http')) return outResp.code(404).type('text/plain').send('');

    try {
        const low = url.toLowerCase();
        const isM3u8 = low.includes('.m3u8');
        const resp = await http.get(url, {
            headers: playHeader(),
            responseType: isM3u8 ? 'text' : 'arraybuffer',
            timeout: 20000,
        });
        if (resp.status >= 400) return outResp.code(resp.status).send('');

        if (isM3u8) {
            let text = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
            text = text.replace(/^(\/[^#\s][^\r\n]*)/gm, (line) => {
                try {
                    return new URL(line, url).href;
                } catch {
                    return line;
                }
            });
            return outResp
                .code(200)
                .type('application/vnd.apple.mpegurl')
                .send(text);
        }

        let mime = 'application/octet-stream';
        if (low.includes('.ts')) mime = 'video/mp2t';
        return outResp.type(resp.headers['content-type'] || mime).send(Buffer.from(resp.data));
    } catch (e) {
        return outResp.code(500).type('text/plain').send(String(e.message || e));
    }
}

export default {
    meta: {
        key: 'jkly',
        name: '🔥JK领域',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/proxy', proxyHandler);
    },
};
