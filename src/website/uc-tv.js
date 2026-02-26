import axios from "axios";
import CryptoJS from "crypto-js";
import {Addition, conf, generateReqId, generateXPanToken} from "../util/uc.js";

let query_token = null
let req_id = null

export const getCache = async (server) => {
  const key = CryptoJS.enc.Hex.stringify(CryptoJS.MD5(server.config.uc.token)).toString()
  const quarkObj = await server.db.getObjectDefault(`/uc`, {})
  return quarkObj[key] ?? ''
}

export const setCache = async (server, value) => {
  const key = CryptoJS.enc.Hex.stringify(CryptoJS.MD5(server.config.uc.token)).toString()
  await server.db.push(`/uc/${key}`, value);
}

export default async function ucTv(fastify) {
  fastify.get('/qrcode', async (req, res) => {
    const pathname = '/oauth/authorize'
    const timestamp = Math.floor(Date.now() / 1000).toString()+'000'; // 13位时间戳需调整
    const deviceID = Addition.DeviceID;
    const reqId = generateReqId(deviceID, timestamp);
    const token = generateXPanToken('GET', pathname, timestamp, conf.signKey);
    const headers = {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Linux; U; Android 13; zh-cn; M2004J7AC Build/UKQ1.231108.001) AppleWebKit/533.1 (KHTML, like Gecko) Mobile Safari/533.1',
      'x-pan-tm': timestamp,
      'x-pan-token': token,
      'x-pan-client-id': conf.clientID,
      ...(Addition.AccessToken ? { 'Authorization': `Bearer ${Addition.AccessToken}` } : {})
    };
    let qrcodeData = await axios.get(`${conf.api}${pathname}`, {
      params: {
        req_id: reqId,
        access_token: Addition.AccessToken,
        app_ver: conf.appVer,
        device_id: deviceID,
        device_brand: 'Xiaomi',
        platform: 'tv',
        device_name: 'M2004J7AC',
        device_model: 'M2004J7AC',
        build_device: 'M2004J7AC',
        build_product: 'M2004J7AC',
        device_gpu: 'Adreno (TM) 550',
        activity_rect: '{}',
        channel: conf.channel,
        auth_type : 'code',
        client_id : conf.clientID,
        scope : 'netdisk',
        qrcode : '1',
        qr_width : '460',
        qr_height : '460',
      },
      headers,
    });
    query_token = qrcodeData.data.query_token;
    req_id = reqId;

    res.send(Buffer.from(qrcodeData.data.qr_data, 'base64'))
  })

  fastify.post('/token', async (req, res) => {
    const pathname = '/oauth/code';
    const timestamp = Math.floor(Date.now() / 1000).toString()+'000'; // 13位时间戳需调整
    const deviceID = Addition.DeviceID;
    const reqId = generateReqId(deviceID, timestamp);
    const x_pan_token = generateXPanToken("GET", pathname, timestamp, conf.signKey);
    const headers = {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Linux; U; Android 13; zh-cn; M2004J7AC Build/UKQ1.231108.001) AppleWebKit/533.1 (KHTML, like Gecko) Mobile Safari/533.1',
      'x-pan-tm': timestamp,
      'x-pan-token': x_pan_token,
      'x-pan-client-id': conf.clientID,
      ...(Addition.AccessToken ? { 'Authorization': `Bearer ${Addition.AccessToken}` } : {})
    };
    let queryResponse = await axios.get(`${conf.api}${pathname}`, {
      params: {
        req_id: reqId,
        access_token: Addition.AccessToken,
        app_ver: conf.appVer,
        device_id: deviceID,
        device_brand: 'Xiaomi',
        platform: 'tv',
        device_name: 'M2004J7AC',
        device_model: 'M2004J7AC',
        build_device: 'M2004J7AC',
        build_product: 'M2004J7AC',
        device_gpu: 'Adreno (TM) 550',
        activity_rect: '{}',
        channel: conf.channel,
        client_id: conf.clientID,
        scope: 'netdisk',
        query_token
      },
      headers,
    });
    if (queryResponse.data.status === 0) {
      const pathname = '/token';
      const timestamp = Math.floor(Date.now() / 1000).toString()+'000';
      const reqId = generateReqId(Addition.DeviceID, timestamp);
      const data = JSON.stringify({
        req_id: reqId,
        app_ver: conf.appVer,
        device_id: Addition.DeviceID,
        device_brand: 'Xiaomi',
        platform: 'tv',
        device_name: 'M2004J7AC',
        device_model: 'M2004J7AC',
        build_device: 'M2004J7AC',
        build_product: 'M2004J7AC',
        device_gpu: 'Adreno (TM) 550',
        activity_rect: '{}',
        channel: conf.channel,
        code: queryResponse.data.code
      });
      const response = await axios.post(`${conf.codeApi}${pathname}`, data, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Content-Type': 'application/json',
        },
      });
      const resp = response.data;
      if (resp.code === 200) {
        res.send({
          code: 0,
          data: resp.data.access_token
        })
      } else {
        res.send({
          code: -1,
          message: resp.message ?? '获取token失败'
        })
      }
    } else {
      res.send({
        code: -1,
        message: queryResponse.data.message ?? '查询扫码状态失败'
      })
    }
  })

  fastify.get('/token', async (req, res) => {
    res.send({
      code: 0,
      data: await getCache(req.server)
    })
  })

  fastify.put('/token', async (req, res) => {
    await setCache(req.server, req.body.cookie)
    res.send({
      code: 0,
    })
  })
}