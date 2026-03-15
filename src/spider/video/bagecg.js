import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';
import fs from 'fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

const site = 'https://bg88.fun';
const api = 'https://bg88.fun/api/community/dynamic/'

const PORT   = process.env.DEV_HTTP_PORT || 9988;

async function request(reqUrl) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA,
            'Referer': site + '/'
         }
    });
    return resp.data;
}

// 解密
function Cr(e) {
  const keyIv = "pagecom@encrsalt"; // 16字节，作为 key 和 IV

  const key = Buffer.from(keyIv, 'utf8');   // 16 bytes → AES-128
  const iv  = Buffer.from(keyIv, 'utf8');   // 16 bytes

  // 原始密文（base64 → buffer）
  const ciphertext = Buffer.from(e, 'base64');

  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  decipher.setAutoPadding(true); // PKCS7

  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return JSON.parse(decrypted.toString('utf8'));
}

function getImgUrl(src) {
    const t  =  src;
    console.log(src)
    if (!t) return '';
    if (shouldDecrypt(t)) {
        return `http://127.0.0.1:${PORT}/spider/bgcg/3/img?url=${encodeURIComponent(e64(t))}`;
    }
    return absUrl(t);
}

function extractImgFromOnload(onload) {
    const m = (onload || '').match(/load(?:Share)?Img\s*\([^,]+,\s*['"]([^'"]+)['"]/);
    return m ? m[1] : '';
}

function shouldDecrypt(url) {
    const u = (url || '').toLowerCase();
    return ['pic.gylhaa.cn', 'new.slfpld.cn', '/upload_01/', '/upload/','/imagebj','/jhimage','xszc666.com'].some(x => u.includes(x));
}

function absUrl(u) {
    if (!u) return '';
    if (u.startsWith('//'))  return 'https:' + u;
    if (u.startsWith('/'))   return site + u;
    return u;
}

function xorDecrypt(buf) {
    const key = [50, 48, 50, 48, 45, 122, 113, 51, 45, 56, 56, 56];
    const on = 100;
    const out = Buffer.from(buf); // 复制一份
    for (let i = 0; i < on; i++) {
        out[i] ^= key[i % key.length];
    }
    return out;
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
        { type_id: '1',            type_name: '今日爆走' },
        { type_id: '2',            type_name: '爆走热点' },
        { type_id: '5',            type_name: '看片娱乐' },
        { type_id: '6',            type_name: '网红明星' },
        { type_id: '7',            type_name: '学生校园' },
        { type_id: '8',            type_name: '领导干部' },
        { type_id: '9',            type_name: '海外吃瓜' },
        { type_id: '11',            type_name: '乱伦曝光' },
        { type_id: '12',            type_name: '案发现场' },
        { type_id: '13',           type_name: '母狗公示' },
        { type_id: '14',            type_name: '爆走猎奇' },
        { type_id: '15',            type_name: '反差档案' },
        { type_id: '16',            type_name: '嫩屄学妹' },
        { type_id: '17',            type_name: '黄播精选' },
        { type_id: '18',            type_name: '狼友日记' },
        { type_id: '19',            type_name: 'PUA教学' },
        { type_id: '21',            type_name: '擦边撩骚' }
    ];

    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;
    const limit = 20;
    let url = api + `list?page=${page}&pageSize=${limit}&classifyId=${tid}&_t=${Number(new Date())}`
    const data = await request(url);
    const dedata = await Cr(data.encData)
    const total = dedata.total
    const mediaList = dedata.data
    const domain = dedata.domain
    const list = mediaList.map(item => {
        return {
            vod_id: item.dynamicId,
            vod_name: item.title,
            vod_pic: getImgUrl(domain + (item.coverImg?.[0] || '')),
            vod_remarks: item.fakeWatchTimes
        };
    });
    return { 
        page, 
        pagecount: Math.ceil(total / limit),
        limit: limit,
        total: total,
        list 
    };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    let url = api + `/dynamicInfo?dynamicId=${id}&_t=${Number(new Date())}`
    const html = await request(url);
    const detailData = await Cr(html.encData)
    console.log(detailData)
    const domain = detailData.domain
    const name = detailData.data.title
    const pic  = domain + detailData.data.coverImg[0]
    const desc = detailData.data.contents.find(i => i.type === 0)?.text || '';
    let videoUrl = detailData.data.contents.find(i => i.type === 2)?.video?.videoUrl || '';
    //https://bg88.fun/api/m3u8/h5/decode?path=bzc/20260313/ig/4r/4p/yr/ebb948ed4845471a901414b0acff0ccf.m3u8
    videoUrl = 'https://bg88.fun/api/m3u8/h5/decode?path=' + videoUrl
    return {
        list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_play_from: '扒哥吃瓜',
            vod_play_url: '播放$' + videoUrl,
            vod_content: desc
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: { 'User-Agent': UA ,
            'Referer': 'https://bg88.fun/'
        },
    };
}

async function search(inReq, _outResp) {
    let url = api + `keyWord?searchWord=${encodeURIComponent(inReq.body.wd)}&page=1&pageSize=10&searchType=1&_t=${Number(new Date())}`
    const data = await request(url);
    const dedata = await Cr(data.encData)
    const mediaList = dedata.data
    const domain = dedata.domain
    const list = mediaList.map(item => {
        return {
            vod_id: item.dynamicId,
            vod_name: item.title,
            vod_pic: domain + (item.coverImg?.[0] || ''),
            vod_remarks: item.fakeWatchTimes
        };
    });

    return { list };
}

// imgProxy 里换成 xorDecrypt，加上条件判断
async function imgProxy(inReq, reply) {
    try {
        let raw = d64(inReq.query.url);
        
        const match = raw.match(/loadBannerDirect\('([^']*)'/);
        if (match) raw = match[1];
    
        const resp = await axios.get(raw, {
            headers: { 'User-Agent': UA, 'Referer': `${site}/`, 'Origin': site },
            responseType: 'arraybuffer',
            timeout: 10000,
        });

        const buf = shouldDecrypt(raw)
            ? xorDecrypt(Buffer.from(resp.data))
            : Buffer.from(resp.data);


        let ct = 'image/jpeg';
        if (buf[0] === 0x89 && buf[1] === 0x50) ct = 'image/png';
        else if (buf.slice(0, 4).toString() === 'GIF8') ct = 'image/gif';

        reply
            .header('Content-Type', ct)
            .header('Content-Length', buf.length)
            .header('Cache-Control', 'no-cache')
            .send(buf);
    } catch (e) {
        console.error('imgProxy error:', e.message, e.stack);
        reply.code(500).send('');
    }
}

export default {
    meta: {
        key: 'bgcg',
        name: '扒哥吃瓜',
        type: 3,
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