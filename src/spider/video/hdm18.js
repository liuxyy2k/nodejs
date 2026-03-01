import axios from 'axios';
import { load } from 'cheerio';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const site = 'https://18hdm.com';

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
        key: 'hdm18',
        name: 'Hdm18',
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