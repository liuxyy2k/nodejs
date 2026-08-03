import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import https from 'https';

const UA =
    'Mozilla/5.0 (Linux; Android 12; SM-G9750 Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/89.0.4389.72 MQQBrowser/6.2 TBS/046279 Mobile Safari/537.36';

let host = 'https://gzbk.didi51-tedb0997.cc';
const hosts = [host, 'https://www.gg51.com', 'https://gg51.com'];
const imgHost = 'https://oytsuig.kwvqaj.cn';
let validHosts = [];

const jar = new CookieJar();

const headers = {
    'User-Agent': UA,
    Referer: `${host}/`,
    Origin: host,
    Accept: 'application/json,text/plain,*/*',
};

const session = wrapper(
    axios.create({
        jar,
        timeout: 8000,
        validateStatus: () => true,
        headers,
    }),
);

const PARENT_DEFAULT = {
    guochan: '23',
    rihan: '11',
    oumei: '15',
    qita: '19',
};

const FILTERS = {
    guochan: [
        {
            key: 'sub',
            name: '子分类',
            value: [
                { n: '中文字幕', v: '' },
                { n: '重磅泄密', v: '8' },
                { n: '偷拍自拍', v: '5' },
                { n: '绿帽偷情', v: '6' },
                { n: '网红明星', v: '24' },
                { n: '国产主播', v: '47' },
                { n: '推特网红', v: '26' },
                { n: '萝莉学生', v: '27' },
                { n: '热门校园', v: '31' },
                { n: '家庭乱伦', v: '32' },
                { n: '经典三级', v: '29' },
                { n: '国产剧情', v: '25' },
                { n: '其他剧情', v: '45' },
            ],
        },
        {
            key: 'sub',
            name: '子分类',
            value: [
                { n: '大厂原创', v: '7' },
                { n: '果冻传媒', v: '36' },
                { n: '天美传媒', v: '38' },
                { n: '猫爪影像', v: '39' },
                { n: '精东影业', v: '40' },
                { n: '星空传媒', v: '41' },
                { n: '起点传媒', v: '42' },
                { n: '蜜桃影像', v: '44' },
                { n: 'SA国际', v: '43' },
            ],
        },
    ],
    rihan: [
        {
            key: 'sub',
            name: '子分类',
            value: [
                { n: '中文字幕', v: '' },
                { n: '强奸迷奸', v: '14' },
                { n: '高清无码', v: '12' },
                { n: '熟女人妻', v: '13' },
                { n: '韩国主播', v: '46' },
            ],
        },
    ],
    oumei: [
        {
            key: 'sub',
            name: '子分类',
            value: [
                { n: '剧情大片', v: '' },
                { n: '黑白配', v: '16' },
                { n: '美颜巨乳', v: '18' },
                { n: '欧美少妇', v: '48' },
            ],
        },
    ],
    qita: [
        {
            key: 'sub',
            name: '子分类',
            value: [
                { n: '动漫3D', v: '' },
                { n: 'SM', v: '30' },
                { n: 'AI换脸', v: '22' },
                { n: '女同男同', v: '20' },
                { n: '蕾丝之恋', v: '34' },
                { n: '龙阳之好', v: '35' },
            ],
        },
    ],
};

function isVideoFormat(url) {
    return /\.(m3u8|mp4|flv|avi|mkv|mov|ts)(\?|$)/i.test(url || '');
}

function match(text, pat) {
    const m = (text || '').match(pat);
    return m ? m[1] : '';
}

function clean(text) {
    return String(text || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function fix(url) {
    url = String(url || '')
        .trim()
        .replace(/\\\//g, '/');
    if (!url) return '';
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('http')) return url;
    if (url.startsWith('/')) return imgHost.replace(/\/$/, '') + url;
    return imgHost.replace(/\/$/, '') + '/' + url;
}

function formatDuration(val) {
    if (!val) return '';
    const s = String(val).trim();
    if (s.includes(':')) return s;
    const seconds = parseInt(Number(s), 10);
    if (Number.isNaN(seconds)) return s;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const sec = seconds % 60;
    const pad = (n) => String(n).padStart(2, '0');
    if (h > 0) return `${pad(h)}:${pad(m)}:${pad(sec)}`;
    return `${pad(m)}:${pad(sec)}`;
}

function setHost(h) {
    host = String(h || '').replace(/\/$/, '');
    headers.Referer = `${host}/`;
    headers.Origin = host;
}

function rc4(data, key) {
    const s = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    const keyBuf = Buffer.from(key, 'utf8');
    const dataBuf = Buffer.from(data, 'utf8');
    for (let i = 0; i < 256; i++) {
        j = (j + s[i] + keyBuf[i % keyBuf.length]) % 256;
        [s[i], s[j]] = [s[j], s[i]];
    }
    let i = 0;
    j = 0;
    const out = Buffer.alloc(dataBuf.length);
    for (let k = 0; k < dataBuf.length; k++) {
        i = (i + 1) % 256;
        j = (j + s[i]) % 256;
        [s[i], s[j]] = [s[j], s[i]];
        out[k] = dataBuf[k] ^ s[(s[i] + s[j]) % 256];
    }
    return out;
}

function guardCookie(guard) {
    try {
        const key = guard.slice(0, 8);
        const tail = guard.slice(12).replace(/\D/g, '');
        const val = String(parseInt(tail, 10) * 2 + 16);
        return rc4(val, key).toString('base64');
    } catch {
        return '';
    }
}

function b64(s) {
    try {
        const pad = '='.repeat((4 - (s.length % 4)) % 4);
        return Buffer.from(s + pad, 'base64').toString('utf8');
    } catch {
        return '';
    }
}

function decodeHex(s) {
    try {
        return Buffer.from(s, 'hex').toString('utf8');
    } catch {
        return '';
    }
}

function decodeUri(s) {
    try {
        return decodeURIComponent(s);
    } catch {
        return '';
    }
}

function decodeShellOnce(html) {
    if (!html) return '';
    const stripped = String(html).trim();
    if (/^[A-Za-z0-9+/=]{100,}$/.test(stripped)) {
        const s = b64(stripped);
        if (s.length > 100) return s;
    }
    if (html.length > 100 && (html.match(/%/g) || []).length > 20 && html.slice(0, 200).includes('%3C')) {
        const s = decodeUri(html);
        if (s !== html && s.includes('<')) return s;
    }
    for (const p of [
        /atob\(["']([A-Za-z0-9+/=]+)["']\)/,
        /window\.atob\(["']([A-Za-z0-9+/=]+)["']\)/,
        /Base64\.decode\(["']([A-Za-z0-9+/=]+)["']\)/,
    ]) {
        const m = html.match(p);
        if (m) {
            const s = b64(m[1]);
            if (s.length > 100) return s;
        }
    }
    const mArr = html.match(/Uint8Array\(\s*\[([0-9,\s]+)\]/);
    if (mArr) {
        try {
            const s = mArr[1]
                .split(',')
                .filter((x) => x.trim())
                .map((x) => String.fromCharCode(parseInt(x.trim(), 10)))
                .join('');
            if (s.length > 100) return s;
        } catch {
            /* ignore */
        }
    }
    const mUri = html.match(/['"]((?:%[0-9A-Fa-f]{2}){20,})['"]/);
    if (mUri) {
        const s = decodeUri(mUri[1]);
        if (s.length > 100) return s;
    }
    const mHex = html.match(/['"]([0-9a-fA-F]{80,})['"]/);
    if (mHex) {
        const s = decodeHex(mHex[1]);
        if (s.length > 100) return s;
    }
    return html;
}

function decodeShell(html) {
    let old = '';
    let cur = html || '';
    for (let i = 0; i < 8; i++) {
        if (cur === old) break;
        old = cur;
        cur = decodeShellOnce(cur);
    }
    return cur;
}

async function getCookie(name) {
    try {
        const cookies = await jar.getCookies(host + '/');
        const found = cookies.find((c) => c.key === name);
        return found ? found.value : '';
    } catch {
        return '';
    }
}

async function get(url) {
    try {
        let r = await session.get(url, { headers, timeout: 8000 });
        let html = typeof r.data === 'string' ? r.data : String(r.data || '');
        if (html.includes('/_guard/auto.js') || html.trim().length < 80) {
            let ck = '';
            const setCookie = r.headers?.['set-cookie'];
            if (Array.isArray(setCookie)) {
                for (const c of setCookie) {
                    const m = String(c).match(/guard=([^;]+)/);
                    if (m) {
                        ck = m[1];
                        break;
                    }
                }
            }
            if (!ck) ck = await getCookie('guard');
            if (ck) {
                const guardret = guardCookie(ck);
                await jar.setCookie(`guardret=${guardret}; Path=/`, host + '/');
                r = await session.get(url, { headers, timeout: 8000 });
                html = typeof r.data === 'string' ? r.data : String(r.data || '');
            }
        }
        return decodeShell(html);
    } catch {
        return '';
    }
}

async function findHosts() {
    if (validHosts.length) return validHosts;
    const res = [];
    const base = [host, ...hosts.filter((h) => h !== host)];
    for (const raw of base) {
        try {
            const h = raw.replace(/\/$/, '');
            const r = await session.get(`${h}/data/domains`, { headers, timeout: 4000 });
            const js = typeof r.data === 'object' ? r.data : JSON.parse(r.data);
            const ds = js.landingdomains || js.domains || [];
            for (const x of ds) {
                const d = String(x).replace(/\/$/, '');
                if (d && !res.includes(d)) res.push(d);
            }
            if (res.length) break;
        } catch {
            /* ignore */
        }
    }
    for (const raw of base) {
        const h = raw.replace(/\/$/, '');
        if (!res.includes(h)) res.push(h);
    }
    validHosts = res;
    return res;
}

function fastHosts() {
    const res = [];
    for (const h of [host, ...validHosts]) {
        const x = String(h || '').replace(/\/$/, '');
        if (x && !res.includes(x)) res.push(x);
    }
    return res;
}

function uniqueList(arr) {
    const res = [];
    const seen = new Set();
    for (const item of arr || []) {
        const vid = item.vod_id || '';
        const key = vid.includes('@@@') ? vid.split('@@@')[0] : vid;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        res.push(item);
    }
    return res;
}

function parseApiList(arr) {
    const res = [];
    for (const item of arr || []) {
        const vid = String(item.view_key || item.id || item.vod_id || '');
        const name = clean(String(item.title || item.name || item.vod_name || ''));
        const pic = fix(String(item.poster || item.pic || item.vod_pic || ''));
        const play = String(item.play_url || item.url || item.vod_play_url || '');
        const remark = formatDuration(
            item.duration || item.vod_remarks || item.display_heat || item.hits,
        );
        let id = vid;
        if (!id && play) id = play;
        if (!id || !name) continue;
        const sid = `${id}@@@${play}@@@${encodeURIComponent(name)}@@@${encodeURIComponent(pic)}`;
        res.push({
            vod_id: sid,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: remark,
        });
    }
    return res;
}

function parseList(html) {
    const res = [];
    if (!html) return res;
    const re = /<a[^>]+href=["']([^"']*\/view\/([a-f0-9]{16})[^"']*)["']/gi;
    let m;
    while ((m = re.exec(html))) {
        const vid = m[2];
        const pos = m.index + m[0].length;
        const block = html.slice(m.index, pos + 8000);
        let name =
            match(block, /alt=["']([^"']{2,})/i) ||
            match(block, /title=["']([^"']{2,})/i) ||
            match(block, /<span[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)/i) ||
            match(block, /<div[^>]*class="[^"]*info[^"]*"[^>]*>([^<]+)/i) ||
            clean(block.slice(0, 1000).replace(/<[^>]+>/g, ' '));
        if (!name || name.length < 2) continue;
        const pic = match(
            block,
            /(?:data-original|data-src|src)=["']([^"']+\.(?:jpg|jpeg|png|webp|js)[^"']*)/i,
        );
        let remark = match(
            block,
            /<div[^>]*class="[^"]*info[^"]*"[^>]*>[\s\S]*?<span[^>]*>[\s\S]*?<\/span>\s*<span[^>]*>([^<]+)<\/span>/i,
        );
        if (!remark) remark = match(block, /<span[^>]*>(\d{1,2}:\d{2})<\/span>/i);
        res.push({
            vod_id: vid,
            vod_name: clean(name),
            vod_pic: fix(pic),
            vod_remarks: clean(remark),
        });
    }
    return uniqueList(res);
}

function extractPlay(html) {
    if (!html) return '';
    const ps = [
        /initPlayer\(["']([^"']+)["']/,
        /["']url["']\s*:\s*["']([^"']+)["']/,
        /["']play_url["']\s*:\s*["']([^"']+)["']/,
        /(https?:\/\/[^"']+\.(?:m3u8|mp4)(?:\?[^"']*)?)/i,
    ];
    for (const p of ps) {
        const m = html.match(p);
        if (m) {
            const u = m[1].replace(/\\\//g, '/');
            if (isVideoFormat(u)) return u;
        }
    }
    return '';
}

async function postList(h, tid, realPg) {
    try {
        h = h.replace(/\/$/, '');
        const url = `${h}/data/getlistbyid`;
        const hs = {
            ...headers,
            Referer: `${h}/category/${tid}`,
            Origin: h,
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        };
        const r = await session.post(url, `id=${tid}&page=${realPg}`, {
            headers: hs,
            timeout: 5000,
        });
        const js = typeof r.data === 'object' ? r.data : JSON.parse(r.data);
        const arr = js.listData || js.data || js.list || [];
        if (!arr.length) return [];
        setHost(h);
        validHosts = validHosts.filter((x) => x !== host);
        validHosts.unshift(host);
        return parseApiList(arr);
    } catch {
        return [];
    }
}

async function apiList(tid, pg) {
    let realPg = '2';
    try {
        realPg = String(parseInt(pg, 10) + 1);
    } catch {
        realPg = '2';
    }
    const preferred = fastHosts();
    for (const h of preferred) {
        const data = await postList(h, tid, realPg);
        if (data.length) return data;
    }
    for (const h of await findHosts()) {
        if (preferred.includes(h)) continue;
        const data = await postList(h, tid, realPg);
        if (data.length) return data;
    }
    return [];
}

async function mergeCategory(tids, pg) {
    const res = [];
    for (const tid of tids) {
        const arr = await apiList(String(tid), String(pg));
        for (const item of arr) {
            res.push(item);
            if (res.length >= 10) return uniqueList(res);
        }
    }
    return uniqueList(res);
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_name: '国产', type_id: 'guochan' },
        { type_name: '日韩', type_id: 'rihan' },
        { type_name: '欧美', type_id: 'oumei' },
        { type_name: '其他', type_id: 'qita' },
    ];
    let data = [];
    for (const raw of await findHosts()) {
        const h = raw.replace(/\/$/, '');
        const html = await get(`${h}/`);
        const lst = parseList(html);
        if (lst.length) {
            setHost(h);
            data = lst;
            break;
        }
    }
    return { class: classes, filters: FILTERS, list: data };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg = parseInt(inReq.body.page, 10) || 1;
    let extend = inReq.body.extend || {};
    if (typeof extend === 'string') {
        try {
            extend = JSON.parse(extend);
        } catch {
            extend = {};
        }
    }
    const sub = extend.sub || '';
    const realTid = sub || PARENT_DEFAULT[tid] || tid;
    let data = await apiList(String(realTid), String(pg));
    if (String(realTid) === '21' && !data.length) {
        data = await mergeCategory(['23', '24', '25', '27'], pg);
    }
    return {
        page: pg,
        pagecount: data.length ? 999 : pg,
        limit: 10,
        total: data.length ? 999999 : 0,
        list: data,
    };
}

async function detail(inReq, _outResp) {
    const sid = inReq.body.id || '';
    const ps = sid.split('@@@');
    const vid = ps[0] || sid;
    const play = ps[1] || '';
    const name = ps[2] ? decodeURIComponent(ps[2]) : vid;
    let pic = ps[3] ? decodeURIComponent(ps[3]) : '';
    if (play) {
        return {
            list: [
                {
                    vod_id: sid,
                    vod_name: name,
                    vod_pic: pic,
                    vod_content: name,
                    vod_play_from: 'GG51',
                    vod_play_url: `${name}$${play}`,
                },
            ],
        };
    }
    const html = await get(`${host}/view/${vid}`);
    let title = match(html, /<title>(.*?)<\/title>/i);
    title = title ? clean(title).split('-')[0].trim() : vid;
    pic = fix(match(html, /(?:poster|data-original|src)=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)/i));
    const playUrl = extractPlay(html);
    return {
        list: [
            {
                vod_id: sid,
                vod_name: title,
                vod_pic: pic,
                vod_content: title,
                vod_play_from: 'GG51',
                vod_play_url: `${title}$${playUrl || sid}`,
            },
        ],
    };
}

async function play(inReq, _outResp) {
    const sid = inReq.body.id || '';
    const ps = sid.split('@@@');
    const url = ps.length > 1 ? ps[1] : sid;
    if (isVideoFormat(url)) {
        return { parse: 0, url, header: { ...headers } };
    }
    const html = await get(`${host}/view/${ps[0]}`);
    const playUrl = extractPlay(html);
    if (playUrl) {
        return { parse: 0, url: playUrl, header: { ...headers } };
    }
    return { parse: 1, url, header: { ...headers } };
}

async function search(inReq, _outResp) {
    const key = inReq.body.wd || '';
    const pg = String(inReq.body.pg || '1');
    const wd = encodeURIComponent(key);
    const urls = [
        `${host}/search/${wd}`,
        `${host}/search/${wd}/${pg}`,
        `${host}/search/${wd}/page/${pg}`,
        `${host}/search?keyword=${wd}&page=${pg}`,
        `${host}/search/?keyword=${wd}&page=${pg}`,
    ];
    for (const url of urls) {
        const html = await get(url);
        const data = parseList(html);
        if (data.length) return { list: data };
    }
    return { list: [] };
}

export default {
    meta: {
        key: 'gg51',
        name: '🔥GG51',
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
