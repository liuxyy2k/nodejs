import Fastify from 'fastify';
import jable from "./src/spider/video/porncvd.js"; // 你的文件名

const fastify = Fastify({
    logger: true
});
// import { HttpsProxyAgent } from 'https-proxy-agent';
// 改成你本地代理的端口
// const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
await jable.api(fastify);

fastify.listen({ port: 3000 }, (err, address) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(`Server running at ${address}`);
});