import axios from 'axios';
import { load } from 'cheerio';
// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const host     = 'https://618013.xyz';
const apiHost  = 'https://h5.xxoo168.org';

const headers = {
    'User-Agent':      UA,
    'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate',
    'Connection':      'keep-alive',
    'Referer':         host,
};

async function request(url, extraHeaders = {}) {
    const resp = await axios.get(url, { headers: { ...headers, ...extraHeaders } });
    return resp.data;
}

// ─── 工具函数 ──────────────────────────────────────────────────────────────

function decryptTitle(encrypted) {
    try {
        return encrypted.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ 128)).join('');
    } catch {
        return encrypted;
    }
}

function extractVideos($, limit) {
    const videos = [];
    $('.vodbox').each((_, el) => {
        try {
            let vodId = ''
            let link = $(el).attr('href') || '';
            if (link.startsWith('/')) link = host + link;
            if(!link.includes('.m3u8')) {
                vodId = '618013.xyz_' + new URL(link).searchParams.get("m")
            } else {
                vodId = '618013.xyz_' + new URL(link).searchParams.get("v")
            }

            // 标题解密
            let titleEncrypted = $(el).find('p.km-script').text().trim();
            if (!titleEncrypted) titleEncrypted = $(el).find('p').first().text().trim();
            const title = decryptTitle(titleEncrypted);

            // 封面
            let pic = $(el).find('img').attr('data-original') || $(el).find('img').attr('src') || '';
            if (pic.startsWith('//'))  pic = 'https:' + pic;
            else if (pic.startsWith('/')) pic = host + pic;

            videos.push({
                vod_id:      vodId,
                vod_name:    title,
                vod_pic:     pic,
                vod_remarks: '',
            });
        } catch {}
    });
    return limit ? videos.slice(0, limit) : videos;
}

function getText($, selectors) {
    for (const sel of selectors) {
        const text = $(sel).first().text().trim();
        if (text) return text;
    }
    return '';
}

// ─── API 处理函数 ──────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '618013.xyz_1',  type_name: '全部视频' },
        { type_id: '618013.xyz_22', type_name: '制服诱惑' },
        { type_id: '618013.xyz_6',  type_name: '国产视频' },
        { type_id: '618013.xyz_8',  type_name: '清纯少女' },
        { type_id: '618013.xyz_9',  type_name: '辣妹大奶' },
        { type_id: '618013.xyz_10', type_name: '女同专属' },
        { type_id: '618013.xyz_11', type_name: '素人出演' },
        { type_id: '618013.xyz_12', type_name: '角色扮演' },
        { type_id: '618013.xyz_20', type_name: '人妻熟女' },
        { type_id: '618013.xyz_23', type_name: '日韩剧情' },
        { type_id: '618013.xyz_21', type_name: '经典伦理' },
        { type_id: '618013.xyz_7',  type_name: '成人动漫' },
        { type_id: '618013.xyz_14', type_name: '精品二区' },
        { type_id: '618013.xyz_40', type_name: '精品三区' },
        { type_id: '618013.xyz_53', type_name: '动漫中字' },
        { type_id: '618013.xyz_52', type_name: '日本无码' },
        { type_id: '618013.xyz_33', type_name: '中文字幕' },
        { type_id: '618013.xyz_44', type_name: '国产传媒' },
        { type_id: '618013.xyz_32', type_name: '国产自拍' },
    ];

    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const pg   = inReq.body.page || 1;
    const [domain, typeId] = tid.split('_');

    let url = `https://${domain}/index.php/vod/type/id/${typeId}.html`;
    if (pg > 1) url = url.replace('.html', `/page/${pg}.html`);

    const html = await request(url);
    const $    = load(html);
    const list = extractVideos($, 20);

    return { 
        pg, pagecount: pg + 1, list
    };
}

async function detail(inReq, _outResp) {
    const vid = inReq.body.id;
    const [domain, videoId] = vid.split('_');
    const apiUrl  = `${apiHost}/api/v2/vod/reqplay/${videoId}`;
    let playUrl = ''
    if(videoId.startsWith('https')) {
        playUrl = videoId
    } else {
        const html = await request(apiUrl);
        playUrl = html.data.httpurl
    }
    return {
        list: [{
            vod_id:        vid,
            vod_name:      '',
            vod_pic:       '',
            vod_play_from: '香蕉视频',
            vod_play_url:  '播放$' + playUrl,
        }],
    };
}

async function play(inReq, _outResp) {
 return {
        parse: 0,
        url: inReq.body.id,
        header: { 
            'User-Agent': UA ,
            'Referer': host + '/'
        },
    };
}

async function search(inReq, _outResp) {
    const keyword = encodeURIComponent(inReq.body.wd);
    const pg      = inReq.body.pg || 1;
    const url     = `${host}/index.php/vod/search.html?wd=${keyword}&page=${pg}`;

    const html = await request(url);
    const $    = load(html);
    const list = extractVideos($);

    return { list };
}

// ─── 导出 ──────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  'xiangjiao',
        name: '💋香蕉视频',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
    },
};