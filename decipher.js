import express from 'express';
import { load } from 'cheerio';
import mysql from 'mysql2/promise';
import axios from 'axios';
import crypto from 'crypto';


const app = express();
app.use(express.json());

const APP_KEY = '';
const APP_SECRET = '';

const PORT = 3001;
//代理
const PROXY_URL = 'http://127.0.0.1:7897';
//CNV Discipher 数据源
const BASE_URL = 'https://www.deciphergenomics.org/data/syndromes';
const BASE_URL_CLINGEN = 'https://search.clinicalgenome.org/api/dosage/cnv?queryParams';


const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36';

async function request(url) {
    const resp = await axios.get(url, {
        headers: { 'User-Agent': UA }
    });
    return resp.data;
}

// ── 数据库连接池 ──────────────────────────────────────────────
const db = mysql.createPool({
    host: 'xxxxx',
    port: xxx,    
    user: 'xxx',
    password: `xxxxx`,
    database: 'xxxx',
    waitForConnections: true,
    connectionLimit: 10,
});

// ── 翻译 ──────────────────────────────────────────────────────
async function youDaoTranslation(chineseQuery) {
    try {
        // 超过5000截断
        if (chineseQuery.length > 5000) {
            chineseQuery = chineseQuery.substring(0, 5000);
        }
        const from = 'auto';
        const to = 'zh-CHS';
        const domain = 'medicine';

        const salt = Date.now().toString();
        const curtime = Math.round(Date.now() / 1000).toString();

        // 签名
        const signStr = APP_KEY + truncate(chineseQuery) + salt + curtime + APP_SECRET;
        const sign = encrypt(signStr);

        // 请求参数
        const params = new URLSearchParams();
        params.append('q', chineseQuery);
        params.append('from', from);
        params.append('to', to);
        params.append('domain', domain);

        // 鉴权参数
        params.append('appKey', APP_KEY);
        params.append('salt', salt);
        params.append('sign', sign);
        params.append('signType', 'v3');
        params.append('curtime', curtime);

        // 请求
        const response = await axios.post(
            'https://openapi.youdao.com/api',
            params,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        const data = response.data;
        // 成功
        if (data.errorCode === '0') {
            let text = null;
            if (Array.isArray(data.translation) && data.translation.length > 0) {
                text = data.translation[0];
            }
            console.log(text);
            return text;
        }
        // 欠费
        if (data.errorCode === '401') {
            console.log('errorCode:', data.errorCode);
            process.exit(0);
        }
        console.log('翻译失败:', data);
        return null;
    } catch (e) {
        console.error('请求异常:', e);
        return null;
    }
}

function truncate(q) {
    if (!q) return null;
    const len = q.length;
    return len <= 20 ? q : q.substring(0, 10) + len + q.substring(len - 10, len);
}

function encrypt(str) {
    return crypto.createHash('sha256').update(str).digest('hex');
}



// ── 入库 ──────────────────────────────────────────────────────
async function saveCnvEntry(list) {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        //保存
        if(list?.length) {
            for (const item of list) {
                await conn.query(
                    `INSERT INTO cnv_decipher1 (syndrome_name, chrom, chr_start, chr_end, genotype, variant_class, size, grade, description, fanyi, create_time)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                    [item.syndrome_name, item.chrom, item.chr_start, item.chr_end, item.genotype, item.variant_class, item.size, item.grade, item.description || '', item.fanyi || '']
                );
            } 
        }
        await conn.commit();
        console.log(`[入库] 完成`);
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

async function saveCnvClingenEntry(item) {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        //保存
        // if(list?.length) {
        //     for (const item of list) {
        //         await conn.query(
        //             `INSERT INTO cnv_clingen
        //                 (region_name, location, hs, ts, \`key\`, hi_comments, ts_comments, create_time)
        //             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        //             [item.name, item.location, item.hs, item.ts, item.key, item.hi_comments, item.ts_comments]
        //         );
        //     } 
        // }
        await conn.query(
            `INSERT INTO cnv_clingen1
                (region_name, location, hs, ts, \`key\`, hi_comments, ts_comments, hi_comments_fanyi, ts_comments_fanyi, create_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [item.name, item.location, item.hs, item.ts, item.key, item.hi_comments, item.ts_comments, item.hi_comments_fanyi || '', item.ts_comments_fanyi || '']
        );
        await conn.commit();
        console.log(`[入库] 完成`);
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}


// ════════════════════════════════════════════════════════════════
//  路由
// ════════════════════════════════════════════════════════════════

/**
 * GET /cnv/decipher/entry
 * 获取 CNV Discipher 数据
 * 返回解析后的结构化 Entry 数据
 */
app.get('/cnv/decipher/entry', async (req, res) => {
    const data =await request(BASE_URL);
    let list = [];
    for (const syndrome of Object.values(data.content)) {
        const result = {
            syndrome_name: syndrome.name,
            syndrome_id: syndrome.syndrome_id,
            grade: syndrome.grade,
        };
        for (const variant of Object.values(syndrome.Variants)) {
            result.genotype = variant.genotype;
            result.variant_class = variant.variant_class;
            result.chrom38 = variant.chr;
            result.chr38_start = variant.start;
            result.chr38_end = variant.end;
            result.chrom= variant.alternative_positions?.[0]?.chr;
            result.chr_start = variant.alternative_positions?.[0]?.start;
            result.chr_end = variant.alternative_positions?.[0]?.end;
            //计算size
            if (result.chr38_start && result.chr38_end) {
                result.size = formatSize(result.chr38_start, result.chr38_end);
            }
        }
        //获取详情描述
        const detail_url = `https://www.deciphergenomics.org/syndrome/${syndrome.syndrome_id}/overview`;
        const html =await request(detail_url);
        const match = html.match(/return\s+({[\s\S]*?})\s*\}\([\s\S]*?\);/);
        if(match) {
            const text = match[1];
            const matchDes = text.match(/description:\s*"([\s\S]*?)",\s*grade:/);
            let description = matchDes?.[1];
            // 还原 unicode
            description = description.replace(
                /\\u([0-9a-fA-F]{4})/g,
                (match, grp) => String.fromCharCode(parseInt(grp, 16))
            );
            // 解析 html
            const $ = load(description);
            // 第一个 p
            const firstP = $('p').first().text().trim();
            result.description = firstP;
            result.fanyi = await youDaoTranslation(result.description);
        }
        list.push(result);
    }
    await saveCnvEntry(list);
    return res.json(list);
});

/**
 * GET /cnv/clingen/entry
 * 获取 CNV ClinGen 数据
 * 返回解析后的结构化 Entry 数据
 */
app.get('/cnv/clingen/entry', async (req, res) => {
    const resp = await axios.get(BASE_URL_CLINGEN, {
        headers: { 'User-Agent': UA,
            'Referer': 'https://search.clinicalgenome.org/kb/gene-dosage/cnv?page=1&size=All&search=',
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'application/json'
        },
    });
    let list = [];
    let i = 0;
    console.log(resp.data.rows.length, '条数据');
    for (const row of resp.data.rows) {
        const delay = 1000 + Math.floor(Math.random() * 3000);
        await new Promise(resolve =>
            setTimeout(resolve, delay)
        );
        let detail_url = `https://search.clinicalgenome.org/kb/gene-dosage/region/${row.key}`
        console.log(i + 1, detail_url);
        let result = {}
        try {
            const detailResp = await getHtml(detail_url);
            const $ = load(detailResp.data);
            const hi_evidence_comments = $('#report_details_haploinsufficiency .data_pre').text().trim();
            const ts_evidence_comments = $('#report_details_triplosensitivity .data_pre').text().trim()
            result = {
                name: row.name,
                location: row.location,
                hs: dosageMap[row.haplo_assertion] || row.haplo_assertion,
                ts: dosageMap[row.triplo_assertion] || row.triplo_assertion,
                key: row.key,
                hi_comments: extractSummary(hi_evidence_comments),
                ts_comments: extractSummary(ts_evidence_comments),
                hi_comments_fanyi: await youDaoTranslation(extractSummary(hi_evidence_comments)),
                ts_comments_fanyi: await youDaoTranslation(extractSummary(ts_evidence_comments))
            }
            i ++;
        } catch (e) {
            console.log('失败URL=', detail_url);
            console.log('code=', e.code);
            console.log('message=', e.message);
            console.log('status=', e.response?.status);
            continue;
        }
        //入库
        await saveCnvClingenEntry(result);
    }
    return res.json(list);
});



/**
 * 名称翻译
 */
app.get('/cnv/fanyi', async (req, res) => {
     const [rows] = await db.query(
        `SELECT id,syndrome_name FROM cnv_decipher1`
    );
    for(const row of rows) {
        const fanyi = await youDaoTranslation(row.syndrome_name);
        await db.query(
            `UPDATE cnv_decipher1 SET syndrome_fanyi = ? WHERE id = ?`,
            [fanyi, row.id]
        );
    }   
});

function extractSummary(text) {
    return text
        .split(
            /Additional(?: relevant)? (?:literature|evidence) is summarized below:/i
        )[0]
        .trim();
}

const dosageMap = {
    '0': 'No Evidence',
    '1': 'Little Evidence',
    '2': 'Emerging Evidence',
    '3': 'Sufficient Evidence',
    '30': 'Autosomal Recessive',
    '40': 'Dosage Sensitivity Unlikely',
    '-5': 'Not Yet Evaluated'
};

async function getHtml(url) {
    for (let i = 0; i < 5; i++) {
        try {
            return await axios.get(url, {
                timeout: 120000,
                headers: {
                    'User-Agent': UA,
                    'Referer': 'https://search.clinicalgenome.org/kb/gene-dosage/cnv?page=1&size=All&search='
                }
            });
        } catch (e) {
            if (e.code !== 'ECONNRESET') {
                throw e;
            }
            console.log(`重试 ${i + 1}: ${url}`);
            await new Promise(r => setTimeout(r, 5000));
        }
    }
    throw new Error(`失败: ${url}`);
}

function formatSize(start, end) {
    if (start == null || end == null) {
        return '';
    }
    const bp = Math.abs(end - start);
    if (bp >= 1000000) {
        return `${(bp / 1000000).toFixed(2)} Mb`;
    }
    if (bp >= 1000) {
        return `${(bp / 1000).toFixed(2)} kb`;
    }
    return `${bp} bp`;
}


app.listen(PORT, '0.0.0.0', () => {
    console.log(`CNV 爬虫服务运行中: http://0.0.0.0:${PORT}`);
    console.log('GET /cnv/decipher/entry ');
    console.log('GET /cnv/clingen/entry ');
    console.log('GET /cnv/fanyi ');
});
