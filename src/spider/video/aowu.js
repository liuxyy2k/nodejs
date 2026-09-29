import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';
import CryptoJS from 'crypto-js';
const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const site = 'https://www.aowu.tv';
const vodApi = `${site}/index.php/ds_api/vod`;

function md5(text) {
    return crypto.createHash('md5').update(text).digest('hex');
}

function base64Decode(text) {
    return Buffer.from(text, 'base64').toString('utf-8');
}

function decryptAES(ciphertext, key) {
    try {
        const rawData  = CryptoJS.enc.Base64.parse(ciphertext);
        const iv       = CryptoJS.lib.WordArray.create(rawData.words.slice(0, 4));
        const encrypted = CryptoJS.lib.WordArray.create(rawData.words.slice(4));
        const decrypted = CryptoJS.AES.decrypt(
            { ciphertext: encrypted },
            CryptoJS.enc.Utf8.parse(key),
            { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
        );
        return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (e) {
        console.error('decryptAES error:', e.message);
        return null;
    }
}

async function request(url, headers = {}) {
    const resp = await axios.get(url, {
        headers: { 'User-Agent': UA, ...headers }
    });
    return resp.data;
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    const classes = [
        { type_id: '/show/YAAAAK-.html', type_name: '新番' },
        { type_id: '/show/kAAAAK-.html', type_name: '番剧' },
        { type_id: '/show/1AAAAK-.html', type_name: '剧场' },
    ];

    const time = Math.round(Date.now() / 1000);
    const key  = md5('DS' + time + 'DCC147D11943AF75');
    const params = new URLSearchParams({
        type: 20, class: '', area: '', lang: '',
        version: '', state: '', letter: '',
        page: 1, time, key,
    });

    const resp = await axios.post(vodApi, params.toString(), {
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const data = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
    const list = (data.list || []).map(e => ({
        vod_id:      String(e.url),
        vod_name:    e.vod_name,
        vod_pic:     e.vod_pic,
        vod_remarks: e.vod_remarks || '',
    }));

    return { class: classes, list, filters: {} };
}

async function category(inReq, _outResp) {
    const tid  = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;

    const time = Math.round(Date.now() / 1000);
    const key  = md5('DS' + time + 'DCC147D11943AF75');
    const params = new URLSearchParams({
        type: tid, class: '', area: '', lang: '',
        version: '', state: '', letter: '',
        page, time, key,
    });

    const resp = await axios.post(vodApi, params.toString(), {
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const data = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
    const list = (data.list || []).map(e => ({
        vod_id:      site + String(e.url),
        vod_name:    e.vod_name,
        vod_pic:     e.vod_pic,
        vod_remarks: e.vod_remarks || '',
    }));

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const url  = inReq.body.id; // 存的是完整 URL
    const html = await request(url);
    const $    = load(html);

    const name = $('meta[property="og:title"]').attr('content') || '';
    const pic  = $('meta[property="og:image"]').attr('content') || '';

    const fromList = [];
    $('.anthology-tab .swiper-slide').each((_, e) => {
        const name  = $(e).clone().children('i, span').remove().end().text().trim();
        const count = $(e).find('.badge').text().trim();
        fromList.push(`${name}(${count})`);
    });

    const playFromArr = [];
    const playUrlArr  = [];

    $('.anthology-list-box').each((i, e) => {
        const from   = fromList[i] || `线路${i + 1}`;
        const tracks = [];
        $(e).find('li a').each((_, a) => {
            const name = $(a).text().trim();
            const href = $(a).attr('href') || '';
            tracks.push(`${name}$${site}${href}`);
        });
        playFromArr.push(from);
        playUrlArr.push(tracks.join('#'));
    });

    return {
        list: [{
            vod_id:        url,
            vod_name:      name,
            vod_pic:       pic,
            vod_play_from: playFromArr.join('$$$'),
            vod_play_url:  playUrlArr.join('$$$'),
        }],
    };
}

async function play(inReq, _outResp) {
    const url  = inReq.body.id;
    const html = await request(url);
    const $    = load(html);

    try {
        const scriptText = $('script:contains(player_aaaa)').html() || '';
        const config     = JSON.parse(scriptText.replace('var player_aaaa=', ''));
        let purl = config.url;
        if (config.encrypt == 2) purl = decodeURIComponent(base64Decode(purl));

        const artPlayer = `${site}/player/?url=${purl}`;
        const artRes    = await request(artPlayer, { Referer: url });

        if (artRes) {
            const sessionKey   = artRes.match(/const sessionKey\s=\s"([^"]+)"/)?.[1];
            const encryptedUrl = artRes.match(/const encryptedUrl\s=\s"([^"]+)"/)?.[1];
            if (sessionKey && encryptedUrl) {
                const realUrl = decryptAES(encryptedUrl, sessionKey);
                if (realUrl) return { parse: 0, url: realUrl, header: { 'User-Agent': UA } };
            }
        }
    } catch (e) {
        console.error('play error:', e.message);
    }

    return { parse: 0, url, header: { 'User-Agent': UA } };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd || '');
    const page = parseInt(inReq.body.pg) || 1;
    if (page > 1) return { list: [] };

    const html = await request(`${site}/search/-------------.html?wd=${text}`);
    const $    = load(html);

    const list = [];
    $('.vod-detail').each((_, element) => {
        const href     = $(element).find('.detail-info > a').attr('href') || '';
        const title    = $(element).find('.detail-pic img').attr('alt') || '';
        const cover    = $(element).find('.detail-pic img').attr('data-src') || '';
        const subTitle = $(element).find('.slide-info-remarks.cor5').text().trim();
        if (!href || !title) return;
        list.push({
            vod_id:      site + href,
            vod_name:    title,
            vod_pic:     cover,
            vod_remarks: subTitle,
        });
    });

    return { list };
}

export default {
    meta: {
        key: 'aowu',
        name: '🎌嗷呜动漫',
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