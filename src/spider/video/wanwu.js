import axios from 'axios';
import { load } from 'cheerio';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const site = 'https://wanwuu.com';

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...headers }
    });
    return resp.data;
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
            const pic = $(element).find('.w-full').attr('data-src') || '';
            const id = $(element).attr('href') || '';
            const name = $(element).find('.w-full').attr('alt') || '';
            const remark = $(element).find('.text-sm').eq(0).text().trim() || '';
            if (!id || !name) return;
            videos.push({
                vod_id: id,
                vod_name: name,
                vod_pic: pic,
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
            const pic = $(element).find('.w-full').attr('data-src') || '';
            const id = $(element).find('a').eq(0).attr('href') || '';
            const name = $(element).find('h2').text().trim() || '';
            const remark = $(element).find('.text-sm').text().trim() || '';
            if (!id || !name) return;
            videos.push({
                vod_id: id,
                vod_name: name,
                vod_pic: pic,
                vod_remarks: remark
            });
        } catch (e) {}
    });

    return { list: videos };
}

export default {
    meta: {
        key: '玩物社区',
        name: '玩物社区',
        type: 3
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