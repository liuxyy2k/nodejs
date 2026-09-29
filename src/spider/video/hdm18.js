import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const site = 'https://18hdm.com';

// import { HttpsProxyAgent } from 'https-proxy-agent';

const PORT = process.env.DEV_HTTP_PORT || 9988;

// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...headers },
        // httpsAgent: agent
    });
    return resp.data;
}

function getImgUrl($el) {
    const src = $el.attr('data-src') || '';
    console.log(src)
    const enc = extractImgFromOnload($el.attr('onload') || '');
    const t   = enc || src;
    if (!t) return '';
    if (enc || shouldDecrypt(t)) {
        return `http://127.0.0.1:${PORT}/spider/hdm18/3/img?url=${encodeURIComponent(e64(t))}`;
    }
    return absUrl(t);
}

function extractImgFromOnload(onload) {
    const m = (onload || '').match(/load(?:Share)?Img\s*\([^,]+,\s*['"]([^'"]+)['"]/);
    return m ? m[1] : '';
}

function shouldDecrypt(url) {
    const u = (url || '').toLowerCase();
    return ['pic.gylhaa.cn', 'new.slfpld.cn', '/upload_01/', '/upload/'].some(x => u.includes(x));
}

function absUrl(u) {
    if (!u) return '';
    if (u.startsWith('//'))  return 'https:' + u;
    if (u.startsWith('/'))   return site + u;
    return u;
}

function aesDecrypt(buf) {
    const key      = Buffer.from('f5d965df75336270');
    const iv       = Buffer.from('97b60394abc2fbe1');
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    return Buffer.concat([decipher.update(buf), decipher.final()]);
}

function e64(s) {
    try { return Buffer.from(s || '').toString('base64'); } catch { return ''; }
}

function d64(s) {
    try { return Buffer.from(s || '', 'base64').toString('utf-8'); } catch { return ''; }
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
 const classes = [
        { type_id: '/sort/hot/', type_name: 'Hanime' },
        { type_id: '/category/lf/', type_name: '里番' },
        { type_id: '/category/tr/', type_name: '同人作品' },
        { type_id: '/category/pmf/', type_name: '泡面番' },
        { type_id: '/category/ma/', type_name: 'Ma' },
        { type_id: '/category/3d/', type_name: '3D动画' },
        { type_id: '/category/mmd/', type_name: 'MMD' },
        { type_id: '/category/cosplay/', type_name: 'Cosplay' },
        { type_id: '/category/gm/', type_name: '国漫' }
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    let typeurl = site + inReq.body.id;
    const page = inReq.body.page || 1;
    const url = page > 1 ?  `${typeurl}${page}/` : typeurl;
    const html = await request(url);
    const $ = load(html);
    let videos = [];
    
    $('.flex').each((_, element) => {
        try {
            const imgEl = $(element).find('.w-full');
            const id = $(element).attr('href') || '';
            const name = $(element).find('.w-full').attr('alt') || '';
            const remark = $(element).find('.text-sm').eq(0).text().trim() || '';
            if (!id || !name) return;
            videos.push({
                vod_id: id,
                vod_name: name,
                vod_pic: imgEl.length ? getImgUrl(imgEl) : '',
                vod_remarks: remark
            });
            console.log(videos)
        } catch (e) {}
    });

    return { page: parseInt(page), list: videos };
}

async function detail(inReq, _outResp) {
    const url = inReq.body.id;
    const html = await request(site + url);
    const $ = load(html);
    let playUrl = ''
    const title = $('meta[name="twitter:title"]').attr('content') || '';
    const pic = '';

    const evalMatch = html.match(/\('(.+?)',\s*(\d+),\s*(\d+),\s*'(.+?)'\.split/);
    if (evalMatch) {
        const [, p, a, c, keyStr] = evalMatch;
        const k = keyStr.split('|');
        const base = parseInt(a);
        const count = parseInt(c);

        // 还原映射表
        const dict = {};
        for (let i = count - 1; i >= 0; i--) {
            dict[i.toString(base)] = k[i] || i.toString(base);
        }
        // 替换模板
        const result = p.replace(/\b\w+\b/g, (w) => dict[w] || w);
        // 单独提取 hash（长十六进制字符串）
        const hashMatch = keyStr.match(/[0-9a-f]{64,}/);
        const jsUrl = site + '/player/' + hashMatch?.[0] + '/' +  parseInt(Date.now()/1000/ 2000) + '.js?v=1'
        const respJs = await request(jsUrl);
        console.log('提取的respJs:', respJs);
        const respMatch = respJs.match(/\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
        if (respMatch) {
            const [, rp, ra, rc, rkStr] = respMatch;
            const rk = rkStr.split('|');
            const rBase = parseInt(ra);
            const rCount = parseInt(rc);

            // decode 函数（支持 base > 36 的字符编码）
            const decode = (n) => {
                return (n < rBase ? '' : decode(parseInt(n / rBase))) +
                    ((n = n % rBase) > 35 ? String.fromCharCode(n + 29) : n.toString(36));
            };

            // 构建字典
            const rDict = {};
            let i = rCount;
            while (i--) {
                rDict[decode(i)] = rk[i] || decode(i);
            }

            // 还原代码
            const decoded = rp.replace(/\b\w+\b/g, (w) => rDict[w] || w);
            console.log('还原后的respJs:', decoded);

            // 提取 url 字段（匹配 'url':'...' 或 "url":"..." ）
           const urlMatch = decoded.match(/https?:\/\/[^\s'"\\]+/);
            if (urlMatch) {
                playUrl = urlMatch[0];
                console.log('提取的播放地址:', playUrl);
            }
        }
    }
    return {
        list: [{
            vod_id: url,
            vod_name: title,
            vod_pic: pic,
            vod_play_from: '默认',
            vod_play_url: '播放$' + playUrl,
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: { 'User-Agent': UA },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const page = inReq.body.pg || 1;
    const url = `${site}/?q=${text}&page=${page}`;

    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.video-item').each((_, element) => {
        try {
            const imgEl = $(element).find('.w-full').attr('data-src') || '';
            const id = $(element).attr('href') || '';
            const name = $(element).find('.w-full').attr('alt') || '';
            const remark = $(element).find('.text-sm').eq(0).text().trim() || '';
            if (!id || !name) return;
            videos.push({
                vod_id: id,
                vod_name: name,
                vod_pic: imgEl.length ? getImgUrl(imgEl) : '',
                vod_remarks: remark
            });
        } catch (e) {}
    });

    return { list: videos };
}

async function imgProxy(inReq, reply) {
    try {
        let raw = d64(inReq.query.url);
        const match = raw.match(/loadBannerDirect\('([^']*)'/);
        if (match) raw = match[1];
        if (!raw) return reply.code(404).send('');

        const resp = await axios.get(raw, {
            headers: {
                'User-Agent': UA,
                'Referer':    `${site}/`,
                'Origin':     site,
            },
            responseType: 'arraybuffer',
            timeout:      10000,
        });

        const decrypted = aesDecrypt(Buffer.from(resp.data));
        let   ct        = 'image/jpeg';
        if (decrypted[0] === 0x89 && decrypted[1] === 0x50) ct = 'image/png';
        else if (decrypted.slice(0, 4).toString() === 'GIF8')  ct = 'image/gif';

        reply.header('Content-Type', ct).send(decrypted);
    } catch (e) {
        console.error('imgProxy error:', e.message);
        reply.code(500).send('');
    }
}

export default {
    meta: {
        key: 'hdm18',
        name: '🌸Hdm18',
        type: 3
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/img',    imgProxy);
    },
};