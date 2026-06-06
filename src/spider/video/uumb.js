import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
const site = 'https://gac.hpyt73xa.com:52000';

import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

const AES_CBC_KEY = Buffer.from(
  new TextEncoder().encode("H0Z%7n#k$H8*M7xSE^N@8xXZPG*RZ&wY")
);

const PORT   = process.env.DEV_HTTP_PORT || 9988;

const SALT_LEN = 16;  // K，常见值 16 或 32
const IV_LEN = 12;    // ie，AES-GCM 标准值
const PBKDF2_ITERATIONS = 1000;
const AES_KEY_LENGTH    = 256;

async function request(reqUrl) {
    const resp = await axios.get(reqUrl, {
        headers: { 'User-Agent': UA },
        httpsAgent: agent
    });
    return resp.data;
}

async function deriveKey(masterKey, salt) {
  const subtle = crypto.webcrypto.subtle;

  const rawKey = new TextEncoder().encode(masterKey);

  const keyMaterial = await subtle.importKey(
    "raw",
    rawKey,
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const saltBuffer = salt.buffer.slice(
    salt.byteOffset,
    salt.byteOffset + salt.byteLength
  );

  return subtle.deriveKey(
    {
      name:       "PBKDF2",
      salt:       saltBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash:       "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

function sn(e, t) {
  let n = [];
  for (const r of e) {
    const o = r.codePointAt(0) ?? 0;
    n.push(String.fromCodePoint(o + t));
  }
  return n.join("");
}
async function decrypt(ciphertextEncoded, masterKey) {
  // 先做字符偏移解码，再 base64 解码
  const decoded = sn(ciphertextEncoded, -3);
  const raw = new Uint8Array(Buffer.from(decoded, "base64"));

  console.log("raw total bytes:", raw.length);

  if (raw.length < SALT_LEN + IV_LEN + 16) {
    throw new Error("ciphertext too short");
  }

  const salt       = raw.slice(0, SALT_LEN);
  const iv         = raw.slice(SALT_LEN, SALT_LEN + IV_LEN);
  const ciphertext = raw.slice(SALT_LEN + IV_LEN);

  console.log("salt hex:    ", Buffer.from(salt).toString("hex"));
  console.log("iv hex:      ", Buffer.from(iv).toString("hex"));
  console.log("cipher bytes:", ciphertext.length);

  const subtle = crypto.webcrypto.subtle;

  const keyMaterial = await subtle.importKey(
    "raw",
    new TextEncoder().encode(masterKey),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const aesKey = await subtle.deriveKey(
    {
      name:       "PBKDF2",
      salt:       salt,
      iterations: PBKDF2_ITERATIONS,
      hash:       "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    false,
    ["decrypt"]
  );

  const plainBuffer = await subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    aesKey,
    ciphertext
  );

  const plainText = Buffer.from(plainBuffer).toString("utf8");
  try { return JSON.parse(plainText); } catch { return plainText; }
}

function e64(s) {
    try { return Buffer.from(s || '').toString('base64'); } catch { return ''; }
}

function d64(s) {
    try { return Buffer.from(s || '', 'base64').toString('utf-8'); } catch { return ''; }
}

function aesDecrypt(buf) {
  const iv  = buf.slice(0, 16);
  const ct  = buf.slice(16);
  const dec = crypto.createDecipheriv("aes-256-cbc", AES_CBC_KEY, iv);
  return Buffer.concat([dec.update(ct), dec.final()]);
}

function proxyImgUrl(raw) {
    return `http://127.0.0.1:${PORT}/spider/uumb/3/img?url=${encodeURIComponent(e64(raw))}`;
}

async function parseVods($) {
    const items = [];

    $('article').each((_, element) => {
        const rawPic = $(element).find('script').text().trim();
        const url = $(element).find('a').attr('href') || '';
        const name = $(element).find('.post-card-title').text().trim();
        const date  = $(element).find('span[itemprop="datePublished"]').text().trim();
        const parts = url.split('/');
        const id = parts[2] || '';
        if (name && url) {
            items.push(
                { 
                    vod_id: id, 
                    vod_name: name, 
                    vod_pic: rawPic ? proxyImgUrl(rawPic) : '',
                    vod_remarks: date.replace(/\s*年\s*|\s*月\s*/g, '-').replace(/\s*日/, '')
                }
            );
        }
    });

    return items
}

async function init(_inReq, _outResp) {
    return {};
}

async function home(_inReq, _outResp) {
    let classes = [];
    let url = 'https://sfa.r87xx5s.com:51111/api/video/home?channel=sjb'
    const data = await request(url);
    const result = await decrypt(data.data, data.key);
    console.log(result[3]);
    result.forEach(item => {
        classes.push({
            type_id: `${item.id}`,
            type_name: item.title,
        });
    });
    return { class: classes, filters: {} };
}

async function category(inReq, _outResp) {
    const tid = inReq.body.id;
    const page = parseInt(inReq.body.page) || 1;
    let url = `https://sfa.r87xx5s.com:51111/api/video/getList?channel=sjb&id=${tid}&type=label&page=${page}&size=24`
    const data = await request(url);
    const result = await decrypt(data.data, data.key);
    let list = [];
    result.list.forEach(item => {
        list.push(
            { 
                vod_id: item.id, 
                vod_name: item.title, 
                vod_pic: proxyImgUrl(item.upload_thumb),
                vod_remarks: item.check_date
            }
        );
    });

    return { page, pagecount: page + 1, list };
}

async function detail(inReq, _outResp) {
    const id = inReq.body.id;
    let url = `https://ypv.mfx1vpy.com:51888/api/v2/home/public/video/long/detail?id=${id}&channel=sjb`
    const data = await request(url);
    const result = await decrypt(data.data, data.key);

    return {
        list: [{
            vod_id: result.id,
            vod_name: result.title,
            vod_pic: result.upload_thumb,
            vod_play_from: 'uu秒播',
            vod_play_url: '播放$' + result.play_hls_url,
            vod_content: result.desc,
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
    const html = await request(`${site}/search?keywords=${text}`);
    const $ = load(html);
    const list = await parseVods($);

    return { list };
}

async function imgProxy(inReq, reply) {
  try {
    let raw = d64(inReq.query.url);
    const match = raw.match(/loadBannerDirect\('([^']*)'/);
    if (match) raw = match[1];
    if (!raw) return reply.code(404).send("");

    const resp = await axios.get(raw, {
      headers: {
        "User-Agent": UA,
        "Referer":    `${site}/`,
        "Origin":     site,
      },
      responseType: "arraybuffer",
      timeout:      10000,
    });

    const decrypted = aesDecrypt(Buffer.from(resp.data));
    let   ct        = "image/jpeg";
    if (decrypted[0] === 0x89 && decrypted[1] === 0x50) ct = "image/png";
    else if (decrypted.slice(0, 4).toString() === "GIF8") ct = "image/gif";

    reply.header("Content-Type", ct).send(decrypted);
  } catch (e) {
    console.error("imgProxy error:", e.message);
    reply.code(500).send("");
  }
}

export default {
    meta: {
        key: 'uumb',
        name: '🔥UU秒播',
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