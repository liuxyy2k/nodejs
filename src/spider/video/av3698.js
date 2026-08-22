import axios from 'axios';
import https from 'https';

const HOST = 'https://av3698.cc';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/** [type_id, type_name, category_api_id] */
const CATS = [
    [1, '日韩无码', 54], [2, '国产主播', 55], [3, '日韩精品', 57], [4, '欧美劲爆', 58],
    [5, '成人动漫', 59], [6, '自拍偷拍', 60], [7, '伦理影片', 61], [8, '视频二区', 69],
    [9, '巨乳尤物', 70], [10, '颜射系列', 71], [11, '口交视频', 72], [12, '自慰系列', 73],
    [13, '教师学生', 74], [14, '群P换妻', 75], [15, 'AI换脸', 76], [16, '视频三区', 56],
    [17, '中文字幕', 62], [18, '人妻系列', 63], [19, '制服诱惑', 64], [20, '强奸乱伦', 65],
    [21, '无码流出', 66], [22, '主播诱惑', 67], [23, '在线观看', 68], [24, '视频四区', 77],
    [25, '熟女专区', 78], [26, '欧美专区', 79], [27, '调教捆绑', 80], [28, '情趣丝袜', 81],
    [29, '抖阴短视', 82], [30, '素人探花', 83], [31, '国模私拍', 84], [32, 'SWAG', 85],
    [33, '91大神', 86], [34, '麻豆传媒', 87], [35, '蜜桃传媒', 88], [36, '国产传媒', 89],
    [37, '视频五区', 90], [38, '野战车震', 91], [39, 'SM调教', 92], [40, '家庭乱伦', 93],
    [41, '百合女同', 94], [42, '学生空姐', 95], [43, '撸管必看', 96], [44, '偷情少妇', 97],
    [45, '萝莉幼齿', 98], [46, '嫩模大秀', 99], [47, '原味内衣', 100], [48, '视频六区', 101],
    [49, '韩系主播', 102], [50, '情侣自拍', 103], [51, '美腿丝袜', 104], [52, '超碰在线', 105],
    [53, '福利导航', 106], [54, '视频七区', 107], [55, '网红主播', 108], [56, '足控专区', 109],
    [57, '视频八区', 110], [58, '抖阴直播', 111], [59, '九色视频', 112], [60, '香蕉视频', 113],
    [61, '视频九区', 114], [62, '红杏视频', 115], [63, '杏吧视频', 116], [64, '草榴视频', 117],
    [65, '色影视界', 118], [66, '人人视频', 119], [67, '视频十区', 120], [68, '女仆咖啡', 121],
    [69, '露出调教', 122], [70, '温泉旅馆', 123], [71, '紧身旗袍', 124], [72, '在线影视', 125],
    [73, '里番动漫', 126], [74, '三级剧情', 127], [75, '明星换脸', 128], [76, '男男专区', 129],
    [77, '主播热舞', 130], [78, '素人自拍', 131],
];


const http = axios.create({
    timeout: 15000,
    validateStatus: () => true,
    headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Referer: `${HOST}/`,
    },
});

async function fetchHtml(url) {
    try {
        const r = await http.get(url);
        if (r.status < 200 || r.status >= 400) return '';
        return typeof r.data === 'string' ? r.data : String(r.data || '');
    } catch {
        return '';
    }
}

function catApiId(tid) {
    const raw = String(tid || '').split(':').pop();
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return null;
    for (const [cid, , cat] of CATS) {
        if (cid === n) return cat;
    }
    return null;
}

function decodeThumb(pic) {
    if (!pic) return '';
    if (pic.includes('cached-thumb?url=')) {
        const m = pic.match(/url=([^&"]+)/);
        if (m) {
            try {
                return decodeURIComponent(m[1]);
            } catch {
                return m[1];
            }
        }
    }
    return pic;
}

function parseCards(html) {
    const items = [];
    if (!html) return items;
    const re = /<article class="media-card">([\s\S]*?)<\/article>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const box = m[1];
        const hm = box.match(/href="(\/xwatch\/\d+)"/);
        if (!hm) continue;
        const vid = hm[1];
        const titleM = box.match(/class="card-title"[^>]*>([^<]+)<\/a>/);
        const title = titleM ? titleM[1].trim() : vid;
        const picM = box.match(/<img[^>]+src="([^"]+)"/);
        let pic = picM ? picM[1] : '';
        pic = decodeThumb(pic);
        const durM = box.match(/class="duration"[^>]*>([^<]+)</);
        const remark = durM ? durM[1].trim() : '';
        items.push({
            vod_id: vid,
            vod_name: title,
            vod_pic: pic,
            vod_remarks: remark,
        });
    }
    return items;
}

function playHeader() {
    return { 'User-Agent': UA, Referer: `${HOST}/` };
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = CATS.map(([cid, name]) => ({ type_id: String(cid), type_name: name }));
    let html = await fetchHtml(`${HOST}/`);
    let list = parseCards(html);
    if (!list.length) {
        html = await fetchHtml(`${HOST}/?source=external&category=54`);
        list = parseCards(html);
    }
    return { class: classes, filters: {}, list };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id || '1';
    const pg = parseInt(inReq.body.page, 10) || 1;
    const catId = catApiId(tid);
    if (catId === null) {
        return { list: [], page: 1, pagecount: 1 };
    }
    const html = await fetchHtml(`${HOST}/?q=&source=external&category=${catId}&page=${pg}`);
    const list = parseCards(html);
    const pm = html.match(/第\s*(\d+)\s*\/\s*(\d+)\s*页/);
    const pagecount = pm ? parseInt(pm[2], 10) : 1;
    return { list, page: pg, pagecount };
}

async function detail(inReq, _outResp) {
    let did = String(inReq.body.id || '');
    if (!did.startsWith('/')) did = `/xwatch/${did.replace(/^\/+/, '')}`;
    const html = await fetchHtml(`${HOST}${did}`);
    if (!html) return { list: [] };

    const titleM = html.match(/<title>([^<]+)/);
    let title = titleM ? titleM[1].replace(' · av3698.cc', '').trim() : did;

    let stream = '';
    const sm = html.match(/data-stream="([^"]+)"/);
    if (sm) stream = sm[1];
    if (!stream) {
        const m2 = html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/);
        if (m2) stream = m2[0];
    }

    const pm = html.match(/poster="([^"]+)"/);
    const pic = pm ? pm[1] : '';

    if (!stream) return { list: [] };

    return {
        list: [
            {
                vod_id: did,
                vod_name: title || did,
                vod_pic: pic,
                vod_content: title || did,
                vod_play_from: 'av3698',
                vod_play_url: `直链$${stream}`,
                vod_remarks: 'M3U8',
            },
        ],
    };
}

async function search(inReq, _outResp) {
    const key = encodeURIComponent(inReq.body.wd || '');
    let html = await fetchHtml(`${HOST}/?q=${key}`);
    let list = parseCards(html);
    if (!list.length) {
        html = await fetchHtml(`${HOST}/?source=home&q=${key}`);
        list = parseCards(html);
    }
    return { list };
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    return { parse: 0, url: id, jx: 0, header: playHeader() };
}

export default {
    meta: {
        key: 'av3698',
        name: '🔥AV3698',
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
