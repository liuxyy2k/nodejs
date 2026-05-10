import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';

const PORT   = process.env.DEV_HTTP_PORT || 9988;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const site = 'https://wanwuu.com';

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...headers }
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
        return `http://127.0.0.1:${PORT}/spider/wanwu/3/img?url=${encodeURIComponent(e64(t))}`;
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
        { type_id: '/videos/watchings/', type_name: '正在播放' },
        { type_id: '/videos/popular/', type_name: '当前最热' },
        { type_id: '/videos/new/', type_name: '最近更新' },
        { type_id: '/videos/zhibo-huifang/', type_name: '直播回放' },
        { type_id: '/videos/search/套路直播/', type_name: '套路直播' },
        { type_id: '/videos/search/玩物直播/', type_name: '玩物直播' },
        { type_id: '/videos/search/深喉/', type_name: '深喉' },
        { type_id: '/videos/guochan-sm/', type_name: '国产sm' },
        { type_id: '/videos/rihan-sm/', type_name: '日韩sm' },
        { type_id: '/videos/oumei-sm/', type_name: '欧美sm' },
        { type_id: '/videos/dongman-sm/', type_name: '动漫sm' },
        { type_id: '/videos/mon/', type_name: '本月最热' },
        { type_id: '/videos/hd/', type_name: '高清' },
        { type_id: '/videos/most/', type_name: '收藏最多' }
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    let typeurl = site + inReq.body.id;
    const page = inReq.body.page || 1;
    const url = page > 1 ?  `${typeurl}page/${page}/` : typeurl;
    console.log(url)
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
    const evalMatch = $('.player-container').find('script').html()
    if (evalMatch) {
        const firstDecoded = await unpackPacker(evalMatch);
        console.log(firstDecoded)
        // 从代码中提取各参数
        const idMatch = firstDecoded.match(/id=(\d+)/);
        const imgMatch = firstDecoded.match(/img=([^&"]+)/);
        const adsMatch = firstDecoded.match(/ads=([^&"]*)/);
        const uMatch = firstDecoded.match(/encodeURIComponent\("([^"]+)"\)/);
        const tValue = firstDecoded.match(/parseInt\(\(new Date\(\)\)\.getTime\(\)\/1000\/1800\)/);
        const jsUrl = `/videos/detail_play?id=${idMatch[1]}&img=${imgMatch[1]}&ads=${adsMatch[1]}&u=${encodeURIComponent(uMatch[1])}&t=${tValue}`;
        const respJs = await request(site + jsUrl);
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

async function unpackPacker(source) {
        const match = source.match(
            /\}\('([\s\S]+?)',\s*(\d+),\s*(\d+),\s*'([\s\S]+?)'\.split\('\|'\)/
        );
        if (!match) return null;

        const [, p, a, c, kStr] = match;
        const base = parseInt(a);
        const count = parseInt(c);
        const k = kStr.split('|');

        const decode = (n) => {
            return (n < base ? '' : decode(parseInt(n / base))) +
                ((n = n % base) > 35
                    ? String.fromCharCode(n + 29)
                    : n.toString(36));
        };

        const dict = {};
        let i = count;
        while (i--) {
            dict[decode(i)] = k[i] || decode(i);
        }

        return p.replace(/\b\w+\b/g, (w) => dict[w] || w);
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
        key: 'wanwu',
        name: '🔥玩物社区',
        type: 3
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/img',  imgProxy);
    },
};