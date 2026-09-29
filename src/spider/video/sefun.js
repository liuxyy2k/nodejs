import axios from 'axios';
import crypto from 'crypto';
import CryptoJS from "crypto-js"
import { load } from 'cheerio';

const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';
const site = 'https://www.7sefun.top';

const PLAYER_CONFIG = {
    '2bdm':    { show: '七色R线',       ps: '0', parse: '' },
    lmm:       { show: '七色A线',       ps: '1', parse: 'https://dp.no3acg.com/player/ec.php?code=qw&if=1&from=lmm&url=' },
    H265:      { show: '高清H265',      ps: '0', parse: '' },
    CYDD1:     { show: '七色C线',       ps: '0', parse: '' },
    ndx:       { show: '七色B线',       ps: '0', parse: '' },
    funzy:     { show: '日漫高清',      ps: '0', parse: 'https://nplayer.7sefun.top/player/index.php?code=qw&url=' },
    funzycn:   { show: '国语高清',      ps: '0', parse: '' },
    funzy4K:   { show: '4K超清',        ps: '0', parse: '' },
    tsfun:     { show: '特摄',          ps: '0', parse: '' },
    sssfun:    { show: '日漫流畅版',    ps: '0', parse: 'https://www.7sefun.com/jx.php?url=' },
    sssfuncn:  { show: '国语流畅',      ps: '0', parse: '' },
    gmfun:     { show: '国漫',          ps: '0', parse: '' },
    gmfun4k:   { show: '国漫4K',        ps: '0', parse: '' },
    funzyjp:   { show: '日配版',        ps: '0', parse: '' },
    mmfun:     { show: '美漫',          ps: '0', parse: '' },
    '7sefun':  { show: '七色番',        ps: '0', parse: 'https://play.7sefun.com/?url=' },
    videojs:   { show: 'videojs',       ps: '0', parse: '' },
    iva:       { show: 'iva',           ps: '0', parse: '' },
    iframe:    { show: 'iframe',        ps: '0', parse: '' },
    link:      { show: '外链',          ps: '0', parse: '' },
    dplayer:   { show: '七色',          ps: '0', parse: '' },
    MIPFS:     { show: 'M线',           ps: '0', parse: '' },
    bilibili:  { show: 'bilibili',      ps: '1', parse: 'https://jx.jsonplayer.com/player/?url=' },
    lzm3u8:    { show: '备用有广告版',  ps: '0', parse: 'https://mf.qiau.cn/json.php?url=' },
    qiyi:      { show: '奇艺视频',      ps: '1', parse: 'https://jx.jsonplayer.com/player/?url=' },
    qq:        { show: '腾讯视频',      ps: '1', parse: 'https://jx.jsonplayer.com/player/?url=' },
    youku:     { show: '优酷视频',      ps: '1', parse: 'https://jx.jsonplayer.com/player/?url=' },
};

// ─── 工具函数 ──────────────────────────────────────────────────────────────

async function fetch(url) {
    const resp = await axios.get(url, { headers: { 'User-Agent': UA }, timeout: 15000 });
    return resp.data;
}

// 对应 base64Decode + unescape
function base64Decode(str) {
    return Buffer.from(str, 'base64').toString('utf-8');
}

// 对应 decrypt(d) — AES-256-CBC，key='2890'+uid+'tB959C'，iv='2F131BE91247866E'
function decrypt(d, uid){
    const key = CryptoJS.enc.Utf8.parse("2890" + uid + "tB959C")
    const iv  = CryptoJS.enc.Utf8.parse("2F131BE91247866E")
    const decrypted = CryptoJS.AES.decrypt(d, key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    })

    return CryptoJS.enc.Utf8.stringify(decrypted)
}

// ─── API 处理函数 ──────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    return {
        class: [
            { type_name: 'TV番劇',  type_id: '1' },
            { type_name: '国漫',    type_id: '5' },
            { type_name: '剧场电影', type_id: '2' },
            { type_name: '特摄剧',  type_id: '4' },
        ],
    };
}

async function category(inReq, _outResp) {
    const id   = inReq.body.id;
    const pg   = parseInt(inReq.body.page) || 1;
    const url  = `${site}/vodshow/${id}--time------${pg}---.html`;

    const data = await fetch(url);
    const $    = load(data);
    const videos = [];

    $('div.video').each((_, element) => {
        const href     = $(element).find('a.video-wrapper').attr('href');
        const title    = $(element).find('.video-name').text();
        const cover    = $(element).find('img.videoimg').attr('src');
        const subTitle = $(element).find('.video-view').text();
        videos.push({
            vod_id:      href,
            vod_name:    title,
            vod_pic:     cover,
            vod_remarks: subTitle || '',
        });
    });

    return { list: videos, page: pg, pagecount: 9999, limit: 90, total: 999999 };
}

async function detail(inReq, _outResp) {
    const id   = inReq.body.id;
    const url  = site + id;
    const data = await fetch(url);
    const $    = load(data);

    // 解析播放列表
    const lists  = [];
    const titles = [];

    $('.chat-stream .chat-header.anim').each((_, e) => {
        titles.push($(e).find('.chat-stream-bfq').text());
    });

    $('.vod-play-list-container').each((i, e) => {
        const tracks = [];
        $(e).find('span').each((_, el) => {
            const name = $(el).find('a').text();
            const href = $(el).find('a').attr('href');
            if (name && href) tracks.push(`${name}$${site + href}`);
        });
        lists.push({
            from:     titles[i] || `线路${i + 1}`,
            playUrl:  tracks.join('#'),
        });
    });

    // 构建 vod_play_from 和 vod_play_url（多线路用$$$分隔）
    const fromStr = lists.map(l => l.from).join('$$$');
    const urlStr  = lists.map(l => l.playUrl).join('$$$');

    return {
        list: [{
            vod_id:        id,
            vod_name:      $('h1').first().text().trim(),
            vod_pic:       $('meta[property="og:image"]').attr('content') || '',
            vod_play_from: fromStr,
            vod_play_url:  urlStr,
        }],
    };
}

async function play(inReq, _outResp) {
    const url  = inReq.body.id;
    const data = await fetch(url);
    const $    = load(data);

    // 提取 player_aaaa 配置
    const scriptHtml = $('script:contains(player_aaaa)').html();
    if (!scriptHtml) throw new Error('player_aaaa not found');
    const config = JSON.parse(scriptHtml.replace('var player_aaaa=', ''));

    if (config.encrypt === 2) {
        const videoUrl = decodeURIComponent(base64Decode(config.url));
        const from     = config.from;
        const id       = config.link.split('/').pop().split('-')[0];
        const jxUrl    = PLAYER_CONFIG[from]?.parse || '';
        
        if (!jxUrl) {
            // 走 index.php → art.php 流程
            const indexUrl  = `${site}/addons/dp/player/index.php?key=0&id=${id}&uid=0&from=${from}&url=${videoUrl}}`;
            const indexData = await fetch(indexUrl);
            const playerUrl = site + indexData.match(/href="(.+)";/)[1];

            if (playerUrl.includes('art.php')) {
                const artData = await fetch(playerUrl);
                const cfg     = new Function('return ' + artData.match(/config\s*=\s*({[\s\S]*?})\s*if\s*\(/)[1])();
                return { parse: 0, url: cfg.url, header: { 'User-Agent': UA } };
            }
        } else if (jxUrl.includes('ec.php')) {
            // 走 ec.php → ConFig 解密流程
            const jxData  = await fetch(jxUrl + videoUrl);
            
            const conFig  = JSON.parse(jxData.match(/ConFig\s*=\s*({[\s\S]*?})\s*,\s*box/)[1]);
            console.log(conFig)
            const playUrl = decrypt(conFig.url, conFig.config.uid);
            return { parse: 0, url: playUrl, header: { 'User-Agent': UA } };
        } else {
            // 其他有 jxUrl 的线路，直接走解析地址
            return { parse: 1, url: jxUrl + videoUrl, header: { 'User-Agent': UA } };
        }
    } else if (config.url?.endsWith('.m3u8')) {
        return { parse: 0, url: config.url, header: { 'User-Agent': UA } };
    }

    return { parse: 0, url: config.url, header: { 'User-Agent': UA } };
}

async function search(inReq, _outResp) {
    const text = encodeURIComponent(inReq.body.wd || '');
    const pg   = parseInt(inReq.body.pg || inReq.body.page || '1');
    const url  = `${site}/vodsearch/${text}----------${pg}---.html`;

    const data = await fetch(url);
    const $    = load(data);
    const videos = [];

    $('div.video').each((_, element) => {
        const href     = $(element).find('a.video-wrapper').attr('href');
        const title    = $(element).find('img.videoimg').attr('alt');
        const cover    = $(element).find('img.videoimg').attr('src');
        const subTitle = $(element).find('.video-time').text().trim();
        videos.push({
            vod_id:      href,
            vod_name:    title,
            vod_pic:     cover,
            vod_remarks: subTitle || '',
        });
    });

    return { list: videos };
}

// ─── 导出 ──────────────────────────────────────────────────────────────────

export default {
    meta: {
        key:  '7sefun',
        name: '🎌七色番',
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