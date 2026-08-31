import express from 'express';
import { load } from 'cheerio';
import mysql from 'mysql2/promise';
import axios from 'axios';
import crypto from 'crypto';
import { HttpsProxyAgent } from 'https-proxy-agent';


const app = express();
app.use(express.json());

const APP_KEY = '111';
const APP_SECRET = '222222';

const PORT = 3001;
//代理
const PROXY_URL = 'http://127.0.0.1:7897';


// 改成你本地代理的端口
const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

//orphanet
const HPO_URL = 'https://ontology.jax.org/api/network/';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36';

async function request(url) {
    const resp = await axios.get(url, {
        headers: { 'User-Agent': UA },
        // httpsAgent: agent
    });
    return resp.data;
}

// ── 数据库连接池 ──────────────────────────────────────────────
const db = mysql.createPool({
    host: '127.0.0.1',
    port: 3306, 
    user: 'root',
    password: 'vP3f9%i3',
    database: 'ruoyi',
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
async function saveGeneInfoEntry(item) {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        //保存
        await conn.query(
            `INSERT INTO orphanet_gene_info (synonym, location, gencc, previous, omim, ensembl, type, hgnc, reactome, uniprotkb, lovd, genatlas)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [item.Synonym, item.Chromosomal_location, item.GenCC, item.Previous_symbol_and_name, item.OMIM, item.Ensembl, item.Type, item.HGNC, item.Reactome, item.UniProtKB, item.LOVD, item.Genatlas]
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

async function saveDiseaseInfoEntry(item) {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [rows] = await conn.query(
            'SELECT id FROM orphanet_disease_info WHERE orpha_id = ?',
            [item.orphaCode]
        );
        if (rows.length === 0) {
            //保存
            await conn.query(
                `INSERT INTO orphanet_disease_info (disease_name, definition, orpha_id, classification, icd10, icd11, omim, umls, mesh, grad, synonym, prevalence, inheritance, onset, meddra, update_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                [item.diseaseName, item.definition, item.orphaCode, item.classification, item.icd10, item.icd11, item.omim, item.umls, item.mesh, item.gard, item.synonyms, item.prevalence, item.inheritance, item.ageOfOnset, item.meddra]
            );
            await conn.commit();
            console.log(`[入库] 完成`);
        } else {
            await conn.query(
                `UPDATE orphanet_disease_info
                    SET disease_name = ?,
                        definition = ?,
                        classification = ?,
                        icd10 = ?,
                        icd11 = ?,
                        omim = ?,
                        umls = ?,
                        mesh = ?,
                        grad = ?,
                        synonym = ?,
                        prevalence = ?,
                        inheritance = ?,
                        onset = ?,
                        meddra = ?,
                        update_time=NOW()
                    WHERE orpha_id = ?`,
                [
                    item.diseaseName,
                    item.definition,
                    item.classification,
                    item.icd10,
                    item.icd11,
                    item.omim,
                    item.umls,
                    item.mesh,
                    item.gard,
                    item.synonyms,
                    item.prevalence,
                    item.inheritance,
                    item.ageOfOnset,
                    item.meddra,
                    item.orphaCode
                ]
            );
            await conn.commit();
            console.log(`[更新] 完成`);
        }
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

async function saveOrphentGene(item) {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        await conn.query(
            `INSERT INTO orphanet_gene_orpha (symbol, orpha_id) VALUES (?, ?)`,
            [item.symbol, item.orpha_id]
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

// ── 从数据库读取待爬取的 orphanet 基因 ───────────────────────────────
async function getOrphentGene() {
    const [rows] = await db.query(
        `select DISTINCT symbol from orphanet_gene where symbol not in  (select gencc from orphanet_gene_info where gencc is not null) `
    );
    //  const [rows] = await db.query(
    //     `select DISTINCT symbol from orphanet_gene where symbol = 'MEIS2'`
    // );
    return rows.map(r => r.symbol);
}

function getText($, label) {
    return $(`strong:contains("${label}")`)
        .parent()
        .text()
        .replace(label + ':', '')
        .trim();
}


function parseDiseaseEntry(html) {
    const obj = {};
    const $ = load(html);
    const diseaseName = $('.d-flex.justify-content-between.mb-4.mx-4 h2').text().trim();
    const definition = $('.mx-4.mb-4.p-4.service-color-box p').text().trim();
    obj.orphaCode = $('.fs-5.d-block.mb-2.fw-bold').text().trim();
    obj.diseaseName = diseaseName;
    obj.definition = definition;
    const text = $('p a[href*="/classification/"]').text().trim();
    obj.classification = text.match(/Classification level:\s*(.*)/)?.[1] || '';
    obj.synonyms = $('strong:contains("Synonym")').parent().find('li').text();
    obj.prevalence = getText($, 'Prevalence');
    obj.inheritance = getText($, 'Inheritance');
    obj.ageOfOnset = getText($, 'Age of onset');
    obj.icd10 = getText($, 'ICD-10');
    obj.icd11 = getText($, 'ICD-11');
    obj.omim = getText($, 'OMIM');
    obj.omim = obj.omim ?.split('\n').map(v => v.trim()).filter(v => v).join(',');
    obj.umls = getText($, 'UMLS');
    obj.mesh = getText($, 'MeSH');
    const gardA = $('strong:contains("GARD")').next('a');
    obj.gard = gardA.length ? gardA.text().trim() : '';
    obj.meddra = getText($, 'MedDRA');
    return obj;
}

/**
 * GET /hpo/entry
 * 获取 hpo 数据
 * 返回解析后的结构化 Entry 数据
 */
app.get('/hpo/entry', async (req, res) => {
    try {
        //根据查询NCBI基因
        let url = HPO_URL + 'search/gene?q=ABCC8&limit=10'
        const geneNcbi = await request(url)
        if (!geneNcbi || geneNcbi.results.length === 0) {
            return res.json([]);
        }
        const geneNcbiId = geneNcbi.results[0].id;
        const symbol = geneNcbi.results[0].name;
        //根据ncbiId 查询关联的疾病 表型
        let ncbiUrl = HPO_URL + 'annotation/' + geneNcbiId
        const diseaseList = await request(ncbiUrl)
        if (!diseaseList || !Array.isArray(diseaseList.diseases)) {
            return res.json([]);
        }
        const result = [];
        for (const disease of diseaseList.diseases) {
            let phenotypeUrl = HPO_URL + 'annotation/' + disease.id
            const phenotypeList = await request(phenotypeUrl)
            if (!phenotypeList || !phenotypeList.categories) {
                continue;
            }
            let categories =  phenotypeList.categories;
            // 遍历分类
            for (const [category, items] of Object.entries(categories)) {
                if (!Array.isArray(items)) {
                    continue;
                }
                for (const item of items) {
                    result.push({
                        ncbiId: geneNcbiId,
                        geneSymbol: symbol,
                        hpoId: item.id,
                        hpoName: item.name,
                        diseaseId: disease.id,
                        frequency: item.metadata?.frequency || '',
                        category: item.category || category
                    });
                }
            }
        }
        return res.status(200).json(result);
    } catch (error) {
        console.error('HPO 查询失败:', error);
        return res.status(500).json({
            message: 'HPO 查询失败',
            error: error.message
        });
    }
});

/**
 * 名称翻译
 */
app.get('/cnv/fanyi', async (req, res) => {
     const [rows] = await db.query(
        `SELECT id,region_name FROM cnv_clingen`
    );
    for(const row of rows) {
        const fanyi = await youDaoTranslation(row.region_name);
        await db.query(
            `UPDATE cnv_clingen SET region_fanyi = ? WHERE id = ?`,
            [fanyi, row.id]
        );
    }   
});


app.listen(PORT, '0.0.0.0', () => {
    console.log(`Node 爬虫服务运行中: http://0.0.0.0:${PORT}`);
    console.log('GET /hpo/entry ');
    console.log('GET /hpo/fanyi ');
});