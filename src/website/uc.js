import axios from "axios";
import qrcode from "qrcode";
import CryptoJS from "crypto-js";
import {getCookieArray} from "../util/misc.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.81 Safari/537.36 SE 2.X MetaSr 1.0"

let cookies = []
let token = null

export const getCache = async (server) => {
  const key = CryptoJS.enc.Hex.stringify(CryptoJS.MD5(server.config.uc.cookie)).toString()
  const quarkObj = await server.db.getObjectDefault(`/uc`, {})
  return quarkObj[key] ?? ''
}

export const setCache = async (server, value) => {
  const key = CryptoJS.enc.Hex.stringify(CryptoJS.MD5(server.config.uc.cookie)).toString()
  await server.db.push(`/uc/${key}`, value);
}

export const getUtCache = async (server) => {
  const key = CryptoJS.enc.Hex.stringify(CryptoJS.MD5(server.config.uc.ut)).toString()
  const quarkObj = await server.db.getObjectDefault(`/uc`, {})
  return quarkObj[key] ?? ''
}

export const setUtCache = async (server, value) => {
  const key = CryptoJS.enc.Hex.stringify(CryptoJS.MD5(server.config.uc.ut)).toString()
  await server.db.push(`/uc/${key}`, value);
}

export default async function uc(fastify) {
  fastify.get('/qrcode', async (req, res) => {
    let qrcodeData = await axios.get(`https://api.open.uc.cn/cas/ajax/getTokenForQrcodeLogin?client_id=381&v=1.2&request_id=${Date.now()}`, {
      headers: {
        'User-Agent': UA,
        "referer": 'https://drive.uc.cn',
      }
    });
    cookies = getCookieArray(qrcodeData.headers["set-cookie"]);
    token = qrcodeData.data.data.members.token;

    const qrcodeUrl = `https://su.uc.cn/1_n0ZCv?uc_param_str=dsdnfrpfbivesscpgimibtbmnijblauputogpintnwktprchmt&token=${token}&client_id=381&uc_biz_str=S%3Acustom%7CC%3Atitlebar_fix`;
    const qrcodeImageBuffer = await qrcode.toBuffer(qrcodeUrl, {width: 300, height: 300})
    res.send(qrcodeImageBuffer)
  })

  fastify.post('/cookie', (req, res) => {
    axios.get(`https://api.open.uc.cn/cas/ajax/getServiceTicketByQrcodeToken?__t=${Date.now()}&token=${token}&client_id=381&v=1.2&request_id=${Date.now()}`)
      .then((response) => {
        if (response.data.status === 2000000) {
          return {
            data: response.data.data,
            cookies,
          }
        } else {
          return Promise.reject(new Error(`service_ticket获取失败: ${response.data.message}`));
        }
      })
      .then(async ({data, cookies}) => {
        const response = await axios.get(`https://drive.uc.cn/account/info?st=${data.members.service_ticket}&fr=pc&platform=pc`,{
          headers: {
            "User-Agent": UA,
            Cookie: cookies.join(''),
            "referer": 'https://drive.uc.cn',
          }
        })
        if (response.headers["set-cookie"]) {
          return cookies.concat(getCookieArray(response.headers["set-cookie"]))
        } else {
          return Promise.reject(new Error(`个人Pus获取失败：${response.data.message}`))
        }
      })
      .then(async (cookies) => {
        const response = await axios.post("https://pc-api.uc.cn/1/clouddrive/transfer/upload/pdir?pr=UCBrowser&fr=pc", {}, {
          headers: {
            "User-Agent": UA,
            Cookie: cookies.join('')
          }
        })
        if (response.headers["set-cookie"]) {
          res.send({
            code: 0,
            data: cookies.concat(getCookieArray(response.headers["set-cookie"])).join(''),
          })
        } else {
          return Promise.reject(new Error(`个人Puus获取失败：${response.data.message}`))
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

  fastify.get('/ut', async (req, res) => {
    res.send({
      code: 0,
      data: await getUtCache(req.server)
    })
  })

  fastify.put('/ut', async (req, res) => {
    await setUtCache(req.server, req.body.ut)
    res.send({
      code: 0,
    })
  })
}
