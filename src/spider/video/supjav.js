import axios from 'axios';
import { load } from 'cheerio';
import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const site = 'https://supjav.com/zh';

async function request(reqUrl, headers = {}) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA, ...headers },
        httpsAgent: agent
    });
    return resp.data;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: 'popular',                    type_name: '热门' },
        { type_id: 'category/censored-jav',      type_name: '有码' },
        { type_id: 'category/uncensored-jav',    type_name: '无码' },
        { type_id: 'category/amateur',           type_name: '素人' },
        { type_id: 'category/chinese-subtitles', type_name: '中文字幕' },
        { type_id: 'category/reducing-mosaic',   type_name: '无码破解' },
    ];
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const id = inReq.body.id;
    const page = inReq.body.page || 1;
    const url = `${site}/${id}/page/${page}`;
    try {
        const resp = await axios.get(`${site}`, { headers: { 'User-Agent': UA }, httpsAgent: agent });
    } catch(e) {
        console.log(e.response?.status);
        console.log(e.response?.headers['cf-ray']);  // 有这个就是 CF
        console.log(e.response?.data?.substring(0, 500));  // 看响应内容
    }
    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.post').each((_, e) => {
        const href = $(e).find('a').attr('href');
        const title = $(e).find('a').attr('title');
        const cover = $(e).find('a img').attr('src')?.replace('!320x216.jpg', '');
        if (href) {
            videos.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: '',
            });
        }
    });

    return { page: parseInt(page), list: videos };
}

async function detail(inReq, _outResp) {
    const url = inReq.body.id;
    const html = await request(url);
    const $ = load(html);

    const title = $('title').first().text().trim();
    const pic = $('meta[property="og:image"]').attr('content') || '';

    // 收集所有播放源
    let tracks = [];
    $('a.btn-server').each((_, e) => {
        const name = $(e).text().trim();
        const dataLink = $(e).attr('data-link');
        if (dataLink) tracks.push(`${name}$${dataLink}`);
    });

    return {
        list: [{
            vod_id: url,
            vod_name: title,
            vod_pic: pic,
            vod_play_from: '默认',
            vod_play_url: tracks.join('#'),
        }],
    };
}

async function play(inReq, _outResp) {
    const data = inReq.body.id;
    const name = inReq.body.flag || '';

    const param = data.split('').reverse().join('');
    const url = `https://lk1.supremejav.com/supjav.php?c=${param}`;
    const res = await request(url, {
        Referer: `https://lk1.supremejav.com/supjav.php?l=${data}&bg=undefined`,
    });

    let playUrl = '';

    if (name === 'TV') {
        const config = res
            .match(/decodeURIComponent\(escape\(r\)\)\}(.*)\)/)[1]
            .replace(/["\(\)]/g, '')
            .split(',');
        const decrypted = decrypt(...config);
        playUrl = decrypted.match(/var urlPlay = '(.*?)';/)[1];

        function decrypt(h, u, n, t, e, r) {
            r = '';
            for (var i = 0, len = h.length; i < len; i++) {
                var s = '';
                while (h[i] !== n[e]) { s += h[i]; i++; }
                for (var j = 0; j < n.length; j++) s = s.replace(new RegExp(n[j], 'g'), j);
                r += String.fromCharCode(_0xe99c(s, e, 10) - t);
            }
            return decodeURIComponent(escape(r));
        }

        function _0xe99c(d, e, f) {
            const str = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/';
            const g = str.split('');
            const h = g.slice(0, e);
            const i = g.slice(0, f);
            const j = d.split('').reverse().reduce((a, b, c) => {
                if (h.indexOf(b) !== -1) return (a += h.indexOf(b) * Math.pow(e, c));
            }, 0);
            let k = '';
            let jj = j;
            while (jj > 0) { k = i[jj % f] + k; jj = (jj - (jj % f)) / f; }
            return k || '0';
        }

    } else if (name === 'FST') {
        const $ = load(res);
        $('script').each((_, e) => {
            if ($(e).text().includes('eval')) {
                const script = $(e).text().replace('eval', '');
                const result = eval(script);
                playUrl = result.match(/sources:\[\{file:"(.*?)"\}\]/)[1];
            }
        });

    } else if (name === 'ST') {
        const $ = load(res);
        let robot = $('#robotlink').text();
        robot = robot.substring(0, robot.indexOf('&token=') + 7);
        $('script').each((_, e) => {
            const script = $(e).text();
            if (script.includes("getElementById('robotlink')")) {
                const token = script.split('&token=')[1].split("'")[0];
                playUrl = 'https:/' + robot + token + '&stream=1';
            }
        });

    } else if (name === 'VOE') {
        const location = res.match(/window\.location\.href = '(.*?)';/)[1];
        const locres = await request(location);
        playUrl = locres.match(/prompt\("Node", "(.*?)"\);/)[1];
    }

    return {
        parse: 0,
        url: playUrl,
        header: { 'User-Agent': UA },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const page = inReq.body.pg || 1;
    const url = `${site}/page/${page}?s=${text}`;

    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.post').each((_, e) => {
        const href = $(e).find('a').attr('href');
        const title = $(e).find('a').attr('title');
        const cover = $(e).find('a img').attr('data-original');
        const remarks = $(e).find('.con .meta .date').text();
        if (href) {
            videos.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: remarks,
            });
        }
    });

    return { list: videos };
}

export default {
    meta: {
        key: 'supjav',
        name: 'SupJav',
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