import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { load } from 'cheerio';
import fs from 'fs';

const req = axios;
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36';
const site = 'https://jable.tv';

const agent = new HttpsProxyAgent('http://127.0.0.1:7897');

async function request(reqUrl) {
    const resp = await req.get(reqUrl, {
        headers: {
            'User-Agent': ua,
            'Accept': '*/*'
        },
        httpsAgent: agent,
    });
    return resp.data;
}

async function testCategory() {
    const url = `${site}`;
    const html = await request(url);
    
    fs.writeFileSync('debug.html', html);
    console.log('HTML 已保存到 debug.html');
    
    const $ = load(html);
    
    console.log('col-md-3 数量:', $('.post-list .col-md-3').length);
    console.log('所有 a 标签数量:', $('a').length);
    console.log(html.substring(0, 500));
}

testCategory().catch(console.error);