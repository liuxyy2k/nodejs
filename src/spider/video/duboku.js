import axios from 'axios';
import { load } from 'cheerio';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const site = 'https://www.dbku.tv';
const headers = {
    Referer:        site,
    Origin:         site,
    'User-Agent':   UA,
};

async function request(url) {
    const resp = await axios.get(url, { headers });
    return resp.data;
}

function base64decode(str) {
    return Buffer.from(str, 'base64').toString('utf-8');
}

function customBase64decode(str) {
    const base64DecodeChars = [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,62,-1,-1,-1,63,52,53,54,55,56,57,58,59,60,61,-1,-1,-1,-1,-1,-1,-1,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,-1,-1,-1,-1,-1,-1,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,-1,-1,-1,-1,-1];
    let c1, c2, c3, c4, i = 0, out = '';
    const len = str.length;
    while (i < len) {
        do { c1 = base64DecodeChars[str.charCodeAt(i++) & 0xff]; } while (i < len && c1 === -1);
        if (c1 === -1) break;
        do { c2 = base64DecodeChars[str.charCodeAt(i++) & 0xff]; } while (i < len && c2 === -1);
        if (c2 === -1) break;
        out += String.fromCharCode((c1 << 2) | ((c2 & 0x30) >> 4));
        do { c3 = str.charCodeAt(i++) & 0xff; if (c3 === 61) return out; c3 = base64DecodeChars[c3]; } while (i < len && c3 === -1);
        if (c3 === -1) break;
        out += String.fromCharCode(((c2 & 0xf) << 4) | ((c3 & 0x3c) >> 2));
        do { c4 = str.charCodeAt(i++) & 0xff; if (c4 === 61) return out; c4 = base64DecodeChars[c4]; } while (i < len && c4 === -1);
        if (c4 === -1) break;
        out += String.fromCharCode(((c3 & 0x03) << 6) | c4);
    }
    return out;
}

function decodePlayer(player, encrypt) {
    if (encrypt == 1) {
        return decodeURIComponent(player);
    } else if (encrypt == 2) {
        return decodeURIComponent(customBase64decode(player));
    } else if (encrypt == 3) {
        let p = player.substring(8);
        p = base64decode(p);
        p = p.substring(8, p.length - 8);
        return p;
    }
    return player;
}

const filterList = {
    1: [
        { key: 'cateId', name: '分类', value: [{ n: '全部', v: '' },{ n: '喜剧', v: '喜剧' },{ n: '爱情', v: '爱情' },{ n: '恐怖', v: '恐怖' },{ n: '动作', v: '动作' },{ n: '科幻', v: '科幻' },{ n: '剧情', v: '剧情' },{ n: '警匪', v: '警匪' },{ n: '战争', v: '战争' },{ n: '犯罪', v: '犯罪' },{ n: '动画', v: '动画' },{ n: '奇幻', v: '奇幻' },{ n: '武侠', v: '武侠' },{ n: '冒险', v: '冒险' },{ n: '悬疑', v: '悬疑' },{ n: '惊悚', v: '惊悚' },{ n: '古装', v: '古装' },{ n: '同性', v: '同性' }] },
        { key: 'area',   name: '地区', value: [{ n: '全部', v: '' },{ n: '大陆', v: '大陆' },{ n: '香港', v: '香港' },{ n: '台湾', v: '台湾' },{ n: '韩国', v: '韩国' },{ n: '英国', v: '英国' },{ n: '法国', v: '法国' },{ n: '加拿大', v: '加拿大' },{ n: '澳大利亚', v: '澳大利亚' }] },
        { key: 'year',   name: '年份', value: [{ n: '全部', v: '' },{ n: '2026', v: '2026' },{ n: '2025', v: '2025' },{ n: '2024', v: '2024' },{ n: '2023', v: '2023' },{ n: '2022', v: '2022' },{ n: '2020', v: '2020' },{ n: '2019', v: '2019' }] },
        { key: 'by',     name: '排序', value: [{ n: '时间', v: '' },{ n: '人气', v: '人气' },{ n: '评分', v: '评分' }] },
    ],
    2: [
        { key: 'subId',  name: '类型', value: [{ n: '全部', v: '' },{ n: '陆剧', v: '13' },{ n: '日韩剧', v: '15' },{ n: '短剧', v: '21' },{ n: '台泰剧', v: '14' },{ n: '港剧', v: '20' }] },
        { key: 'cateId', name: '剧情', value: [{ n: '全部', v: '' },{ n: '悬疑', v: '悬疑' },{ n: '武侠', v: '武侠' },{ n: '科幻', v: '科幻' },{ n: '都市', v: '都市' },{ n: '爱情', v: '爱情' },{ n: '古装', v: '古装' },{ n: '战争', v: '战争' },{ n: '青春', v: '青春' },{ n: '偶像', v: '偶像' },{ n: '喜剧', v: '喜剧' },{ n: '家庭', v: '家庭' },{ n: '奇幻', v: '奇幻' },{ n: '剧情', v: '剧情' },{ n: '乡村', v: '乡村' },{ n: '年代', v: '年代' },{ n: '警匪', v: '警匪' },{ n: '谍战', v: '谍战' },{ n: '历险', v: '历险' },{ n: '罪案', v: '罪案' },{ n: '宫廷', v: '宫廷' },{ n: '经典', v: '经典' },{ n: '动作', v: '动作' },{ n: '惊悚', v: '惊悚' },{ n: '历史', v: '历史' },{ n: '穿越', v: '穿越' },{ n: '同性', v: '同性' }] },
        { key: 'area',   name: '地区', value: [{ n: '全部', v: '' },{ n: '大陆', v: '大陆' },{ n: '香港', v: '香港' },{ n: '台湾', v: '台湾' },{ n: '韩国', v: '韩国' },{ n: '日本', v: '日本' },{ n: '新加坡', v: '新加坡' },{ n: '泰国', v: '泰国' }] },
        { key: 'year',   name: '年份', value: [{ n: '全部', v: '' },{ n: '2026', v: '2026' },{ n: '2025', v: '2025' },{ n: '2024', v: '2024' },{ n: '2023', v: '2023' },{ n: '2022', v: '2022' },{ n: '2021', v: '2021' },{ n: '2020', v: '2020' },{ n: '2019', v: '2019' },{ n: '2018', v: '2018' },{ n: '2017', v: '2017' },{ n: '更早', v: '更早' }] },
        { key: 'by',     name: '排序', value: [{ n: '时间', v: '' },{ n: '人气', v: '人气' },{ n: '评分', v: '评分' }] },
    ],
    3: [
        { key: 'cateId', name: '分类', value: [{ n: '全部', v: '' },{ n: '真人秀', v: '真人秀' },{ n: '选秀', v: '选秀' },{ n: '竞演', v: '竞演' },{ n: '情感', v: '情感' },{ n: '旅游', v: '旅游' },{ n: '音乐', v: '音乐' },{ n: '美食', v: '美食' },{ n: '纪实', v: '纪实' },{ n: '生活', v: '生活' },{ n: '游戏互动', v: '游戏互动' },{ n: '竞技', v: '竞技' },{ n: '搞笑', v: '搞笑' },{ n: '脱口秀', v: '脱口秀' }] },
        { key: 'area',   name: '地区', value: [{ n: '全部', v: '' },{ n: '大陆', v: '大陆' },{ n: '韩国', v: '韩国' }] },
        { key: 'year',   name: '年份', value: [{ n: '全部', v: '' },{ n: '2026', v: '2026' },{ n: '2025', v: '2025' },{ n: '2024', v: '2024' },{ n: '2023', v: '2023' },{ n: '2022', v: '2022' },{ n: '2021', v: '2021' },{ n: '2020', v: '2020' },{ n: '2019', v: '2019' },{ n: '更早', v: '更早' }] },
        { key: 'by',     name: '排序', value: [{ n: '时间', v: '' },{ n: '人气', v: '人气' },{ n: '评分', v: '评分' }] },
    ],
    4: [
        { key: 'cateId', name: '剧情', value: [{ n: '全部', v: '' },{ n: '武侠', v: '武侠' },{ n: '科幻', v: '科幻' },{ n: '热血', v: '热血' },{ n: '推理', v: '推理' },{ n: '爆笑', v: '爆笑' },{ n: '冒险', v: '冒险' },{ n: '校园', v: '校园' },{ n: '动作', v: '动作' },{ n: '机战', v: '机战' },{ n: '竞技', v: '竞技' },{ n: '少女', v: '少女' },{ n: '格斗', v: '格斗' },{ n: '恋爱', v: '恋爱' },{ n: '魔幻', v: '魔幻' }] },
        { key: 'area',   name: '地区', value: [{ n: '全部', v: '' },{ n: '大陆', v: '大陆' },{ n: '日本', v: '日本' },{ n: '法国', v: '法国' },{ n: '美国', v: '美国' }] },
        { key: 'year',   name: '年份', value: [{ n: '全部', v: '' },{ n: '2026', v: '2026' },{ n: '2025', v: '2025' },{ n: '2024', v: '2024' },{ n: '2023', v: '2023' },{ n: '2022', v: '2022' },{ n: '2021', v: '2021' },{ n: '2020', v: '2020' },{ n: '2019', v: '2019' },{ n: '2018', v: '2018' },{ n: '2017', v: '2017' },{ n: '2015', v: '2015' }] },
        { key: 'by',     name: '排序', value: [{ n: '时间', v: '' },{ n: '人气', v: '人气' },{ n: '评分', v: '评分' }] },
    ],
};

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '1', type_name: '电影'  },
        { type_id: '2', type_name: '连续剧' },
        { type_id: '3', type_name: '综艺'  },
        { type_id: '4', type_name: '动漫'  },
    ];
    const filters = {};
    for (const c of classes) filters[c.type_id] = filterList[c.type_id];
    return { class: classes, filters };
}

async function category(inReq, _outResp) {
    const id   = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;
    const { area = '', by = '', cateId = '', year = '', subId = '' } = inReq.body.filters || {};

    const url  = `${site}/vodshow/${subId || id}-${area}-${by}-${cateId}-----${page}---${year}.html`;
    const html = await request(url);
    const $    = load(html);

    const cards = [];
    const seen  = new Set();

    $('.myui-vodlist__box > a').each((_, e) => {
        const path = $(e).attr('href');
        if (path && path.startsWith('/voddetail/') && !seen.has(path)) {
            seen.add(path);
            cards.push({
                vod_id:      path,
                vod_name:    $(e).attr('title')         || '',
                vod_pic:     $(e).attr('data-original') || '',
                vod_remarks: $(e).find('.text-right').text(),
            });
        }
    });

    return { page, pagecount: cards.length > 0 ? page + 1 : page, list: cards, filter: filterList[id] };
}

async function detail(inReq, _outResp) {
    const id   = inReq.body.id;
    const url  = id.startsWith('http') ? id : `${site}${id}`;
    const html = await request(url);
    const $    = load(html);

    const tracks = [];
    $('#playlist1 a').each((_, e) => {
        const p = $(e).attr('href');
        if (p && p.startsWith('/vodplay/')) {
            tracks.push(`${$(e).text()}$${site}${p}`);
        }
    });

    const name = $('h1.pic-text').text().trim() || $('title').text().split('-')[0].trim();
    const pic  = $('.myui-vodlist__thumb').attr('data-original') || '';

    return {
        list: [{
            vod_id:        id,
            vod_name:      name,
            vod_pic:       pic,
            vod_play_from: '在线',
            vod_play_url:  tracks.join('#'),
        }],
    };
}

async function play(inReq, _outResp) {
    const url  = inReq.body.id;
    const html = await request(url);

    let match = html.match(/var player_data\s*=\s*({.*?})\s*<\/script>/);
    if (!match) match = html.match(/var player_.*?\s*=\s*({.*?})\s*<\/script>/);
    if (!match) throw new Error('未找到播放数据');

    const obj      = JSON.parse(match[1]);
    const playUrl  = decodePlayer(obj.url, obj.encrypt);
    const result   = { parse: 0, url: playUrl, header: { 'User-Agent': UA, Referer: site } };

    if (obj.url_next) {
        result.next = obj.encrypt == 2
            ? decodeURIComponent(customBase64decode(obj.url_next))
            : obj.url_next;
    }

    return result;
}

async function search(inReq, _outResp) {
    const page = parseInt(inReq.body.page) || 1;
    if (page > 1) return { list: [] };

    const text = encodeURIComponent(inReq.body.wd);
    const html = await request(`${site}/vodsearch/-------------.html?wd=${text}&submit=`);
    const $    = load(html);
    const list = [];

    $('a.myui-vodlist__thumb').each((_, e) => {
        const path = $(e).attr('href');
        if (path && path.startsWith('/voddetail/')) {
            list.push({
                vod_id:      path,
                vod_name:    $(e).attr('title')         || '',
                vod_pic:     $(e).attr('data-original') || '',
                vod_remarks: $(e).find('.text-right').text(),
            });
        }
    });

    return { list };
}

export default {
    meta: { key: 'dbku', name: '独播库', type: 3 },
    api: async (fastify) => {
        fastify.post('/init',     init);
        fastify.post('/home',     home);
        fastify.post('/category', category);
        fastify.post('/detail',   detail);
        fastify.post('/play',     play);
        fastify.post('/search',   search);
    },
};