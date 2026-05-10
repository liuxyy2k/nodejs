import axios from 'axios';
import { load } from 'cheerio';
import { config } from './config.js';
import CryptoJS from 'crypto-js';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';
const site = 'https://jav.sb';


const SERVER_API = config.SERVER_API;

async function request(targetUrl) {
    try {
        const resp = await axios.post(SERVER_API, {
            url: targetUrl,
            referer: site + '/',
            key: 'mira123'
        }, {
            timeout: 60000,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        return resp.data;
    } catch (e) {
        console.log('中转请求失败:', e.message);
        throw e;
    }
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classurl = `${site}`;
    const html = await request(classurl);
    const $ = load(html);

    let classes = [];
    const ignore = ['首頁'];
    $('.leading-6').each((_, e) => {
        const name = $(e).text();
        const href = $(e).attr('href');
        if (!href || ignore.some(i => name.includes(i))) return;
        classes.push({ type_id: href, type_name: name });
    });
    let filterObj = {
    }
    return { class: classes, filters: filterObj };
}

async function category(inReq, _outResp) {
    const typeurl = inReq.body.id;
    const page = inReq.body.page || 1;
    let url = `${site}${typeurl}`;
    if(page > 1) {
        url = `${site}${typeurl.replace('.html')}-${page}`;
    }
    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.thumbnail').each((_, element) => {
        const href = $(element).find('.text-secondary').attr('href');
        const title = $(element).find('.text-secondary').text().trim() || '';
        const cover = $(element).find('.w-full').attr('data-src');
        const duration = $(element).find('.right-1').text();
        if (href) {
            videos.push({
                vod_id: href,
                vod_name: title,
                vod_pic: site + cover,
                vod_remarks: duration,
            });
        }
    });

    return { page: parseInt(page), list: videos };
}

function stringToBytes(str) {
    return Buffer.from(str, 'utf-8');
}

function xorBytes(buffer, key) {
    const result = Buffer.alloc(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
        result[i] = buffer[i] ^ key;
    }
    return result;
}

// Base62 字符表
const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function encodeBase62(buffer) {
    let num = BigInt('0x' + buffer.toString('hex'));
    if (num === 0n) return '0';

    let result = '';
    while (num > 0n) {
        const rem = num % 62n;
        result = chars[Number(rem)] + result;
        num = num / 62n;
    }
    return result;
}

function encrypt(str) {
    const key = 0x7b;
    const bytes = stringToBytes(str);
    const xored = xorBytes(bytes, key);
    return encodeBase62(xored);
}

async function detail(inReq, _outResp) {
    const url = inReq.body.id;
    const html = await request(site + url);
    const $ = load(html);

    const name = $('meta[name="twitter:title"]').attr('content') || '';
    const pic = $('meta[property=witter:image"]').attr('content') || '';
    const description = $('meta[name=description"]').attr('content') || '';
    const plar = $('.plyr__video-wrapper').find('iframe').attr('src')
    const plarData = await request(site + plar);
    const urlObj = new URL(site + plar);
    const file = urlObj.searchParams.get('src');
    console.log(file)
    //获取token
    const tokenData = await request(`https://jav.sb/token.php?file=${file}`);
    const token = tokenData.token
    const ts = tokenData.ts
    // 4. 生成 sign
    const tsNow = Math.floor(Date.now() / 1000);
    const ky_ = file + '@' + tsNow;
    const sign = encrypt(ky_);
    // 6. 获取真实 m3u8
    const realRes = await request(
        `https://jav.sb/save_m3u8_cache.php?file=${file}&token=${token}&ts=${ts}&sign=${sign}`
    );
    const m3u8 = site + realRes.m3u8_file + '&sign=' + sign;
    return {
        list: [{
            vod_id: url,
            vod_name: name,
            vod_pic: pic,
            vod_play_from: 'JavSb',
            vod_play_url: '播放$' + m3u8
        }],
    };
}

async function play(inReq, _outResp) {
    return {
        parse: 0,
        url: inReq.body.id,
        header: { 'User-Agent': UA, 'Referer': site },
    };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd);
    const page = inReq.body.pg || 1;
    const url = `${site}/vod/search.html?wd=${text}`;

    const html = await request(url);
    const $ = load(html);

    let videos = [];
    $('.thumbnail').each((_, element) => {
        const href = $(element).find('.text-secondary').attr('href');
        const title = $(element).find('.text-secondary').text().trim() || '';
        const cover = $(element).find('.w-full').attr('data-src');
        const duration = $(element).find('.right-1').text();
        if (href) {
            videos.push({
                vod_id: href,
                vod_name: title,
                vod_pic: site + cover,
                vod_remarks: duration,
            });
        }
    });

    return { list: videos };
}

export default {
    meta: {
        key: 'javsb',
        name: '🔥Javsb',
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