import req from '../../util/req.js';
import { randStr } from '../../util/misc.js';
import dayjs from 'dayjs';
import CryptoJS from 'crypto-js';

let domain = 'https://frodo.douban.com';
let device = {};

function sig(link) {
    link += `&udid=${device.id}&uuid=${device.id}&&rom=android&apikey=0dad551ec0f84ed02907ff5c42e8ec70&s=rexxar_new&channel=Yingyongbao_Market&timezone=Asia/Shanghai&device_id=${device.id}&os_rom=android&apple=c52fbb99b908be4d026954cc4374f16d&mooncake=0f607264fc6318a92b9e13c65db7cd3c&sugar=0`;
    const u = new URL(link);
    const ts = dayjs().unix().toString();
    let sha1 = CryptoJS.HmacSHA1('GET&' + encodeURIComponent(u.pathname) + '&' + ts, 'bf7dddc7c9cfe6f7');
    let signa = CryptoJS.enc.Base64.stringify(sha1);
    return link + '&_sig=' + encodeURIComponent(signa) + '&_ts=' + ts;
}

async function request(reqUrl, ua) {
    const resp = await req.get(reqUrl, {
        headers: {
            'User-Agent': ua || device.ua,
        },
    });
    return resp.data;
}

async function init(inReq, _outResp) {
    const deviceKey = inReq.server.prefix + '/device';
    device = await inReq.server.db.getObjectDefault(deviceKey, {});
    if (!device.id) {
        device.id = randStr(40).toLowerCase();
        device.ua = `Rexxar-Core/0.1.3 api-client/1 com.douban.frodo/7.9.0(216) Android/28 product/Xiaomi11 rom/android network/wifi udid/${device.id} platform/mobile com.douban.frodo/7.9.0(216) Rexxar/1.2.151 platform/mobile 1.2.151`;
        await inReq.server.db.push(deviceKey, device);
    }
    return {};
}

async function home(_inReq, _outResp) {
    let classes = [
        {
            type_id: 'movie/hot_gaia',
            type_name: '电影',
        },
        {
            type_id: 'subject_collection/tv_hot/items',
            type_name: '电视剧',
        },
        {
            type_id: 'subject_collection/tv_domestic/items',
            type_name: '国产剧',
        },
        {
            type_id: 'subject_collection/tv_american/items',
            type_name: '美剧',
        },
        {
            type_id: 'subject_collection/tv_japanese/items',
            type_name: '日剧',
        },
        {
            type_id: 'subject_collection/tv_korean/items',
            type_name: '韩剧',
        },
        {
            type_id: 'subject_collection/tv_animation/items',
            type_name: '动漫',
        },
        {
            type_id: 'subject_collection/show_hot/items',
            type_name: '综艺',
        },
    ];
    return {
        class: classes,
        filters: {},
    };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const pg = inReq.body.page;
    let page = pg || 1;
    if (page == 0) page = 1;
    const link = sig(`${domain}/api/v2/${tid}?area=全部&sort=recommend&playable=0&loc_id=0&start=${(page - 1) * 30}&count=30`);
    const data = await request(link);
    let videos = [];
    for (const vod of data.items || data.subject_collection_items) {
        let score = (vod.rating ? vod.rating.value || '' : '').toString();
        videos.push({
            vod_id: vod.id,
            vod_name: vod.title,
            vod_pic: vod.pic.normal || vod.pic.large,
            vod_remarks: score.length > 0 ? '评分:' + score : '',
        });
    }
    return {
        page: parseInt(page),
        pagecount: Math.ceil(data.total / 30),
        list: videos,
    };
}

async function detail(_inReq, _outResp) {
    return {};
}

async function play(_inReq, _outResp) {
    return {};
}

async function search(_inReq, _outResp) {
    return {};
}

export default {
    meta: {
        key: 'douban',
        name: '豆瓣‍',
        type: 3,
        indexs: 1,
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
