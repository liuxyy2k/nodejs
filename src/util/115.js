import {conversion, formatPlayUrl} from "./misc.js";
import axios from "axios";
import {getCache} from "../website/115.js";
import {request} from "http";
import {videosHandle} from "./utils.js";

export function getShareData(shareUrl) {
  let regex = /https:\/\/(?:115|anxia|115cdn)\.com\/s\/([a-zA-Z0-9]+)\?password=([a-zA-Z0-9]+)/;
  let matches = regex.exec(shareUrl);
  return matches ? {shareCode: matches[1], receiveCode: matches[2]} : null
}

function isMediaFile(filename) {
  return ['mp4', 'webm', 'avi', 'wmv', 'flv', 'mov', 'mkv', 'mpeg', '3gp', 'ts', 'm2ts', 'mp3', 'wav', 'aac', 'iso'].includes(filename?.slice(filename?.lastIndexOf(".") + 1))
}

async function request115(url, method="GET", headers=null, data=null) {
  const urlp = new URL(url);
  return new Promise((resolve, reject) => {
    const options = {
      hostname: urlp.hostname,
      path: `${urlp.pathname}${urlp.search}`,
      method: method,
      headers,
    };
    const req = request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(data);
        }
      });
    });
    req.on("error", (e) => {
      reject(e);
    });
    if (data)
      req.write(data);
    req.end();
  });
}

const G_kts = new Uint8Array([
  0xf0, 0xe5, 0x69, 0xae, 0xbf, 0xdc, 0xbf, 0x8a,
  0x1a, 0x45, 0xe8, 0xbe, 0x7d, 0xa6, 0x73, 0xb8,
  0xde, 0x8f, 0xe7, 0xc4, 0x45, 0xda, 0x86, 0xc4,
  0x9b, 0x64, 0x8b, 0x14, 0x6a, 0xb4, 0xf1, 0xaa,
  0x38, 0x01, 0x35, 0x9e, 0x26, 0x69, 0x2c, 0x86,
  0x00, 0x6b, 0x4f, 0xa5, 0x36, 0x34, 0x62, 0xa6,
  0x2a, 0x96, 0x68, 0x18, 0xf2, 0x4a, 0xfd, 0xbd,
  0x6b, 0x97, 0x8f, 0x4d, 0x8f, 0x89, 0x13, 0xb7,
  0x6c, 0x8e, 0x93, 0xed, 0x0e, 0x0d, 0x48, 0x3e,
  0xd7, 0x2f, 0x88, 0xd8, 0xfe, 0xfe, 0x7e, 0x86,
  0x50, 0x95, 0x4f, 0xd1, 0xeb, 0x83, 0x26, 0x34,
  0xdb, 0x66, 0x7b, 0x9c, 0x7e, 0x9d, 0x7a, 0x81,
  0x32, 0xea, 0xb6, 0x33, 0xde, 0x3a, 0xa9, 0x59,
  0x34, 0x66, 0x3b, 0xaa, 0xba, 0x81, 0x60, 0x48,
  0xb9, 0xd5, 0x81, 0x9c, 0xf8, 0x6c, 0x84, 0x77,
  0xff, 0x54, 0x78, 0x26, 0x5f, 0xbe, 0xe8, 0x1e,
  0x36, 0x9f, 0x34, 0x80, 0x5c, 0x45, 0x2c, 0x9b,
  0x76, 0xd5, 0x1b, 0x8f, 0xcc, 0xc3, 0xb8, 0xf5,
]);
const RSA_e = 0x8686980c0f5a24c4b9d43020cd2c22703ff3f450756529058b1cf88f09b8602136477198a6e2683149659bd122c33592fdb5ad47944ad1ea4d36c6b172aad6338c3bb6ac6227502d010993ac967d1aef00f0c8e038de2e4d3bc2ec368af2e9f10a6f1eda4f7262f136420c07c331b871bf139f74f3010e3c4fe57df3afb71683n;
const RSA_n = 0x10001n;

function toBytes(value, length) {
  if (length == undefined)
    length = Math.ceil(value.toString(16).length / 2);
  const buffer = new Uint8Array(length);
  for (let i = length - 1; i >= 0; i--) {
    buffer[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return buffer;
}

function fromBytes(bytes) {
  let intVal = 0n;
  for (const b of bytes)
    intVal = (intVal << 8n) | BigInt(b);
  return intVal;
}

function* accStep(start, stop, step = 1) {
  for (let i = start + step; i < stop; i += step) {
    yield [start, i, step];
    start = i;
  }
  if (start !== stop)
    yield [start, stop, stop - start];
}

function bytesXor(v1, v2) {
  const result = new Uint8Array(v1.length);
  for (let i = 0; i < v1.length; i++)
    result[i] = v1[i] ^ v2[i];
  return result;
}

function genKey(randKey, skLen) {
  const xorKey = new Uint8Array(skLen);
  let length = skLen * (skLen - 1);
  let index = 0;
  for (let i = 0; i < skLen; i++) {
    const x = (randKey[i] + G_kts[index]) & 0xff;
    xorKey[i] = G_kts[length] ^ x;
    length -= skLen;
    index += skLen;
  }
  return xorKey;
}

function padPkcs1V1_5(message) {
  const msg_len = message.length
  const buffer = new Uint8Array(128);
  buffer.fill(0x02, 1, 127 - msg_len);
  buffer.set(message, 128 - msg_len);
  return fromBytes(buffer);
}

function xor(src, key) {
  const buffer = new Uint8Array(src.length);
  const i = src.length & 0b11;
  if (i)
    buffer.set(bytesXor(src.subarray(0, i), key.subarray(0, i)));
  for (const [j, k] of accStep(i, src.length, key.length))
    buffer.set(bytesXor(src.subarray(j, k), key), j);
  return buffer;
}

function pow(base, exponent, modulus) {
  if (modulus === 1n)
    return 0n;
  let result = 1n;
  base %= modulus;
  while (exponent) {
    if (exponent & 1n)
      result = (result * base) % modulus;
    exponent = exponent >> 1n;
    base = (base * base) % modulus;
  }
  return result;
}

function encrypt(data) {
  if (typeof data === "string" || data instanceof String)
    data = (new TextEncoder()).encode(data);
  const xorText = new Uint8Array(16 + data.length);
  xorText.set(xor(
    xor(data, new Uint8Array([0x8d, 0xa5, 0xa5, 0x8d])).reverse(),
    new Uint8Array([0x78, 0x06, 0xad, 0x4c, 0x33, 0x86, 0x5d, 0x18, 0x4c, 0x01, 0x3f, 0x46])
  ), 16);
  const cipherData = new Uint8Array(Math.ceil(xorText.length / 117) * 128);
  let start = 0;
  for (const [l, r] of accStep(0, xorText.length, 117))
    cipherData.set(toBytes(pow(padPkcs1V1_5(xorText.subarray(l, r)), RSA_n, RSA_e), 128), start, start += 128);
  return Buffer.from(cipherData).toString("base64");
}

function decrypt(cipherData) {
  const cipher_data = new Uint8Array(Buffer.from(cipherData, "base64"));
  let data = [];
  for (const [l, r] of accStep(0, cipher_data.length, 128)) {
    const p = pow(fromBytes(cipher_data.subarray(l, r)), RSA_n, RSA_e);
    const b = toBytes(p);
    data.push(...b.subarray(b.indexOf(0) + 1));
  }
  data = new Uint8Array(data);
  const keyL = genKey(data.subarray(0, 16), 12);
  const tmp = xor(data.subarray(16), keyL).reverse();
  return (new TextDecoder("utf-8")).decode(xor(tmp, new Uint8Array([0x8d, 0xa5, 0xa5, 0x8d])));
}

async function getFilesByShareUrl({shareCode, receiveCode, dirID = ""}) {
  const videos = []
  const listFile = async (dirID) => {
    const dirInfo = await axios.get(`https://webapi.115.com/share/snap`, {
      params: {
        "share_code":   shareCode,
        "receive_code": receiveCode,
        "cid":          dirID,
        "limit":        "9999",
        "offset":       "0",
      }
    });
    if (!dirInfo.data.data) return [];
    const files = dirInfo.data.data.list.filter(item => item.fc === 1);
    let folders = dirInfo.data.data.list.filter(o => o.fc === 0);
    for (let file of files) {
      if (isMediaFile(file.n)) {
        videos.push({
          ...file,
          shareCode,
          receiveCode,
        })
      }
    }
    for (let folder of folders) {
      await listFile(folder.cid)
    }
  }
  await listFile(shareCode, receiveCode, dirID)
  return videos;
}

export async function detail(shareUrl) {
  const shareData = getShareData(shareUrl);
  if (shareData) {
    let videos = await getFilesByShareUrl(shareData);
    videos = videos.map(v => {
      const ids = [shareData.shareCode, shareData.receiveCode, v.fid];
      return {
        vod_id: ids.join('*'),
        vod_name: v.n,
        vod_size: v.s,
      }
    })
    return videosHandle(getPanName('115') + '-' + shareData.shareCode, videos)
  } else {
    return {}
  }
}

export async function play(inReq) {
  const id = inReq.body.id;
  const cookie = await getCache(inReq.server)
  const [share_code, receive_code, file_id] = id.split('*');
  const data = `data=${encodeURIComponent(encrypt(`{"share_code":"${share_code}","receive_code":"${receive_code}","file_id":"${file_id}"}`))}`;
  const response = await request115(
    "http://pro.api.115.com/app/share/downurl",
    "POST",
    {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(data),
      "Cookie": cookie
    },
    data,
  );
  if (response?.error?.includes?.("登录")) {
    messageToDart({
        action: 'toast',
        opt: {
            message: '115盘登录失败，请前往【配置】站源进行配置',
            duration: 5
        }
    })
  }
  const resData = JSON.parse(decrypt(response.data));
  return {
    parse: 0,
    url: ['原画', resData.url.url],
  };
}
