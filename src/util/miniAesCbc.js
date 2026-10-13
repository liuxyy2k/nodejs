import crypto from 'crypto';

/** AES-128-CBC PKCS7，与 QuickJS miniAES 一致：key/iv 为 UTF-8 字符串，密文为 hex */
export function aesCbcEncryptHex(plaintext, keyStr, ivStr) {
    const key = Buffer.from(keyStr, 'utf8');
    const iv = Buffer.from(ivStr, 'utf8');
    const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
    return Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]).toString('hex');
}

export function aesCbcDecryptHex(hexCipher, keyStr, ivStr) {
    if (!hexCipher) return '';
    const key = Buffer.from(keyStr, 'utf8');
    const iv = Buffer.from(ivStr, 'utf8');
    const buf = Buffer.from(String(hexCipher).replace(/[^0-9a-fA-F]/g, ''), 'hex');
    if (!buf.length || buf.length % 16 !== 0) return '';
    try {
        const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
        return Buffer.concat([decipher.update(buf), decipher.final()]).toString('utf8');
    } catch {
        return '';
    }
}
