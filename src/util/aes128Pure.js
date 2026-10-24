/**
 * 纯 JS AES-128-CBC + PKCS7（同 7mmtv 内联思路，无 node:crypto / crypto-js）
 * key / iv：UTF-8 字符串，不足 16 字节右侧补 0（与 Node createCipheriv 短 key 行为一致）
 */

const AES_SBOX = [];
const AES_INV = [];
const AES_LOG = new Uint8Array(256);
const AES_EXP = new Uint8Array(256);

(function aesInitTables() {
    let x = 1;
    for (let i = 0; i < 256; i++) {
        AES_EXP[i] = x;
        AES_LOG[x] = i;
        x ^= ((x << 1) & 0xff) ^ ((x & 0x80) ? 0x1b : 0);
    }
    for (let i = 0; i < 256; i++) {
        let s = i ? AES_EXP[(255 - AES_LOG[i]) % 255] : 0;
        let y = s;
        y = ((y << 1) | (y >> 7)) & 0xff;
        s ^= y;
        y = ((y << 1) | (y >> 7)) & 0xff;
        s ^= y;
        y = ((y << 1) | (y >> 7)) & 0xff;
        s ^= y;
        y = ((y << 1) | (y >> 7)) & 0xff;
        s ^= y;
        s ^= 0x63;
        AES_SBOX[i] = s & 0xff;
        AES_INV[s & 0xff] = i;
    }
})();

const AES_RCON = [1, 2, 4, 8, 16, 32, 64, 128, 27, 54];

function aesMul(a, b) {
    return a && b ? AES_EXP[(AES_LOG[a] + AES_LOG[b]) % 255] : 0;
}

function utf8Bytes(s) {
    return new TextEncoder().encode(String(s));
}

function utf8Text(bytes) {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function padKey16(str) {
    const u = utf8Bytes(str);
    const out = new Uint8Array(16);
    out.set(u.subarray(0, 16));
    return out;
}

function aesExpandKey(key) {
    const w = new Uint8Array(176);
    w.set(key.subarray(0, 16));
    for (let i = 4; i < 44; i++) {
        let t0 = w[4 * i - 4];
        let t1 = w[4 * i - 3];
        let t2 = w[4 * i - 2];
        let t3 = w[4 * i - 1];
        if (i % 4 === 0) {
            const n0 = AES_SBOX[t1] ^ AES_RCON[i / 4 - 1];
            const n1 = AES_SBOX[t2];
            const n2 = AES_SBOX[t3];
            const n3 = AES_SBOX[t0];
            t0 = n0;
            t1 = n1;
            t2 = n2;
            t3 = n3;
        }
        w[4 * i] = w[4 * i - 16] ^ t0;
        w[4 * i + 1] = w[4 * i - 15] ^ t1;
        w[4 * i + 2] = w[4 * i - 14] ^ t2;
        w[4 * i + 3] = w[4 * i - 13] ^ t3;
    }
    return w;
}

function mixColumnsEnc(s) {
    for (let c = 0; c < 4; c++) {
        const a0 = s[4 * c];
        const a1 = s[4 * c + 1];
        const a2 = s[4 * c + 2];
        const a3 = s[4 * c + 3];
        s[4 * c] = aesMul(a0, 2) ^ aesMul(a1, 3) ^ a2 ^ a3;
        s[4 * c + 1] = a0 ^ aesMul(a1, 2) ^ aesMul(a2, 3) ^ a3;
        s[4 * c + 2] = a0 ^ a1 ^ aesMul(a2, 2) ^ aesMul(a3, 3);
        s[4 * c + 3] = aesMul(a0, 3) ^ a1 ^ a2 ^ aesMul(a3, 2);
    }
}

function aesEncryptBlock(w, block, out, off) {
    const s = new Uint8Array(16);
    for (let i = 0; i < 16; i++) s[i] = block[i] ^ w[i];
    for (let round = 1; round <= 9; round++) {
        for (let i = 0; i < 16; i++) s[i] = AES_SBOX[s[i]];
        const u = new Uint8Array(16);
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                u[4 * c + r] = s[4 * ((c + r) % 4) + r];
            }
        }
        s.set(u);
        mixColumnsEnc(s);
        for (let i = 0; i < 16; i++) s[i] ^= w[16 * round + i];
    }
    for (let i = 0; i < 16; i++) s[i] = AES_SBOX[s[i]];
    const u = new Uint8Array(16);
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            u[4 * c + r] = s[4 * ((c + r) % 4) + r];
        }
    }
    for (let i = 0; i < 16; i++) out[off + i] = u[i] ^ w[160 + i];
}

/** 与 7mmtv.js 逐行一致 */
function aesDecryptBlock(w, block, out, off) {
    const s = new Uint8Array(16);
    for (let i = 0; i < 16; i++) s[i] = block[i] ^ w[160 + i];
    for (let round = 9; round >= 1; round--) {
        for (let i = 0; i < 16; i++) s[i] = AES_INV[s[i]];
        const u = new Uint8Array(16);
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                u[4 * c + r] = s[4 * ((c - r + 4) % 4) + r];
            }
        }
        s.set(u);
        for (let i = 0; i < 16; i++) s[i] ^= w[16 * round + i];
        for (let c = 0; c < 4; c++) {
            const a0 = s[4 * c];
            const a1 = s[4 * c + 1];
            const a2 = s[4 * c + 2];
            const a3 = s[4 * c + 3];
            s[4 * c] = aesMul(a0, 14) ^ aesMul(a1, 11) ^ aesMul(a2, 13) ^ aesMul(a3, 9);
            s[4 * c + 1] = aesMul(a0, 9) ^ aesMul(a1, 14) ^ aesMul(a2, 11) ^ aesMul(a3, 13);
            s[4 * c + 2] = aesMul(a0, 13) ^ aesMul(a1, 9) ^ aesMul(a2, 14) ^ aesMul(a3, 11);
            s[4 * c + 3] = aesMul(a0, 11) ^ aesMul(a1, 13) ^ aesMul(a2, 9) ^ aesMul(a3, 14);
        }
    }
    for (let i = 0; i < 16; i++) s[i] = AES_INV[s[i]];
    const u = new Uint8Array(16);
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            u[4 * c + r] = s[4 * ((c - r + 4) % 4) + r];
        }
    }
    for (let i = 0; i < 16; i++) out[off + i] = u[i] ^ w[i];
}

function pkcs7Pad(data) {
    const pad = 16 - (data.length % 16);
    const out = new Uint8Array(data.length + pad);
    out.set(data);
    for (let i = data.length; i < out.length; i++) out[i] = pad;
    return out;
}

export function aes128CbcEncryptBytes(plainBytes, keyStr, ivStr) {
    const key = padKey16(keyStr);
    const iv = padKey16(ivStr);
    const padded = pkcs7Pad(plainBytes);
    const w = aesExpandKey(key);
    const out = new Uint8Array(padded.length);
    let prev = iv;
    for (let off = 0; off < padded.length; off += 16) {
        const x = new Uint8Array(16);
        for (let i = 0; i < 16; i++) x[i] = padded[off + i] ^ prev[i];
        aesEncryptBlock(w, x, out, off);
        prev = out.subarray(off, off + 16);
    }
    return out;
}

export function aes128CbcDecryptBytes(cipherBytes, keyStr, ivStr) {
    if (!cipherBytes.length || cipherBytes.length % 16 !== 0) return new Uint8Array(0);
    const key = padKey16(keyStr);
    const iv = padKey16(ivStr);
    const w = aesExpandKey(key);
    const out = new Uint8Array(cipherBytes.length);
    let prev = iv;
    for (let off = 0; off < cipherBytes.length; off += 16) {
        const block = cipherBytes.subarray(off, off + 16);
        aesDecryptBlock(w, block, out, off);
        for (let i = 0; i < 16; i++) out[off + i] ^= prev[i];
        prev = block;
    }
    const pad = out[out.length - 1];
    if (pad >= 1 && pad <= 16) return out.subarray(0, out.length - pad);
    return out;
}

export function b64ToBytes(b64) {
    const clean = String(b64 || '').replace(/[^A-Za-z0-9+/=]/g, '');
    if (typeof atob === 'function') {
        const bin = atob(clean);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }
    const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
    const len = (clean.length * 3) / 4 - pad;
    const out = new Uint8Array(len);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let p = 0;
    for (let i = 0; i < clean.length; i += 4) {
        const n =
            (chars.indexOf(clean[i]) << 18) |
            (chars.indexOf(clean[i + 1]) << 12) |
            ((chars.indexOf(clean[i + 2]) & 63) << 6) |
            (chars.indexOf(clean[i + 3]) & 63);
        if (p < len) out[p++] = (n >> 16) & 255;
        if (p < len) out[p++] = (n >> 8) & 255;
        if (p < len) out[p++] = n & 255;
    }
    return out;
}

export function bytesToB64(bytes) {
    if (typeof btoa === 'function') {
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    }
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i];
        const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
        const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
        const n = (b0 << 16) | (b1 << 8) | b2;
        out += chars[(n >> 18) & 63];
        out += chars[(n >> 12) & 63];
        out += i + 1 < bytes.length ? chars[(n >> 6) & 63] : '=';
        out += i + 2 < bytes.length ? chars[n & 63] : '=';
    }
    return out;
}

/** 密文 base64（仅 raw cipher，无 Salted__ 头） */
export function aes128CbcEncryptB64(plaintext, keyStr, ivStr) {
    return bytesToB64(aes128CbcEncryptBytes(utf8Bytes(plaintext), keyStr, ivStr));
}

export function aes128CbcDecryptB64(b64Cipher, keyStr, ivStr) {
    return utf8Text(aes128CbcDecryptBytes(b64ToBytes(b64Cipher), keyStr, ivStr));
}
