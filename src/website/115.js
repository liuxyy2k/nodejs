import axios from "axios";
import qrcode from "qrcode";
import CryptoJS from "crypto-js";
import {getCookieArray} from "../util/misc.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.81 Safari/537.36 SE 2.X MetaSr 1.0"

let qrData = {}

export const getCache = async (server) => {
  const key = CryptoJS.enc.Hex.stringify(CryptoJS.MD5(server.config.y115.cookie)).toString()
  const obj = await server.db.getObjectDefault(`/y115`, {})
  return obj[key] ?? ''
}

export const setCache = async (server, value) => {
  const key = CryptoJS.enc.Hex.stringify(CryptoJS.MD5(server.config.y115.cookie)).toString()
  await server.db.push(`/y115/${key}`, value);
}

export default async function y115(fastify) {
  fastify.get('/qrcode', async (req, res) => {
    const response = await axios.get(`https://qrcodeapi.115.com/api/1.0/web/1.0/token`, {
      "User-Agent": UA,
      "referer": 'https://115.com/',
    });
    qrData = response.data.data;

    const qrcodeImageBuffer = await qrcode.toBuffer(qrData.qrcode, {width: 300, height: 300})
    res.send(qrcodeImageBuffer)
  })

  fastify.post('/cookie', (req, res) => {
    axios.get(`https://qrcodeapi.115.com/get/status/?_=${parseInt(Date.now() / 1000)}&sign=${qrData.sign}&time=${qrData.time}&uid=${qrData.uid}`, {
      "User-Agent": UA,
      "referer": 'https://115.com/'
    })
      .then((response) => {
        if (response.data.data.status === 2) {
          return Promise.resolve()
        } else {
          return Promise.reject(new Error(`扫码状态检测失败: ${response.data.message}`));
        }
      })
      .then(async () => {
        const params = new URLSearchParams({
          account: qrData.uid,
          app: 'android'
        });
        const response = await axios.post(`https://passportapi.115.com/app/1.0/android/1.0/login/qrcode`, params, {
          headers: {
            "User-Agent": UA,
            "referer": 'https://115.com/',
          }
        })
        if (response.data.state === 1) {
          res.send({
            code: 0,
            data: getCookieArray(response.headers["set-cookie"]).join('')
          })
        } else {
          return Promise.reject(new Error(`登录失败：${response.data.message}`))
        }
      })
      .catch(e => {
        console.error(e)
        res.send({
          code: -1,
          message: e?.message || '扫码登录失败'
        })
      })
  })

  fastify.get('/cookie', async (req, res) => {
    res.send({
      code: 0,
      data: await getCache(req.server)
    })
  })

  fastify.put('/cookie', async (req, res) => {
    await setCache(req.server, req.body.cookie)
    res.send({
      code: 0,
    })
  })
}