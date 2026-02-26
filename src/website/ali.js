import axios from "axios";
import qrcode from "qrcode";
import CryptoJS from "crypto-js";
import qs from "qs";

const UA = "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.81 Safari/537.36 SE 2.X MetaSr 1.0"

let qrData = {}

export const getTokenCache = async (server) => {
  const key = CryptoJS.enc.Hex.stringify(CryptoJS.MD5(server.config.ali.token)).toString()
  const obj = await server.db.getObjectDefault(`/ali`, {})
  return obj[key] ?? ''
}

export const setTokenCache = async (server, value) => {
  const key = CryptoJS.enc.Hex.stringify(CryptoJS.MD5(server.config.ali.token)).toString()
  await server.db.push(`/ali/${key}`, value);
}

export const getToken280Cache = async (server) => {
  const key = CryptoJS.enc.Hex.stringify(CryptoJS.MD5(server.config.ali.token280)).toString()
  const obj = await server.db.getObjectDefault(`/ali`, {})
  return obj[key] ?? ''
}

export const setToken280Cache = async (server, value) => {
  const key = CryptoJS.enc.Hex.stringify(CryptoJS.MD5(server.config.ali.token280)).toString()
  await server.db.push(`/ali/${key}`, value);
}

export default async function ali(fastify) {
  fastify.get('/qrcode', async (req, res) => {
    const response = await axios.get("https://passport.aliyundrive.com/newlogin/qrcode/generate.do?appName=aliyun_drive&fromSite=52&appName=aliyun_drive&appEntrance=web&isMobile=false&lang=zh_CN&returnUrl=&bizParams=&_bx-v=2.2.3", {
      "User-Agent": UA,
    });
    qrData = response.data.content.data;

    const qrcodeImageBuffer = await qrcode.toBuffer(qrData.codeContent, {width: 300, height: 300})
    res.send(qrcodeImageBuffer)
  })

  fastify.post('/token', (req, res) => {
    let token = ''
    axios.post('https://passport.aliyundrive.com/newlogin/qrcode/query.do?appName=aliyun_drive&fromSite=52&_bx-v=2.2.3', qs.stringify({
      t: qrData.t,
      appName: "aliyun_drive",
      ck: qrData.ck,
      appEntrance: "web",
      isMobile: "false",
      lang: "zh_CN",
      returnUrl: "",
      navlanguage: "zh-CN",
      navPlatform: "MacIntel",
      fromSite: "52",
      bizParams: ""
    }), {
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      }
    })
      .then(async (response) => {
        const data = response.data.content.data
        if (data.qrCodeStatus === 'CONFIRMED') {
          const bizData = decodeURI(atob(data.bizExt))
          const refreshToken = JSON.parse(bizData).pds_login_result.refreshToken;
          if (refreshToken) {
            token = refreshToken
            return Promise.resolve(refreshToken)
          } else {
            return Promise.reject(new Error(`获取refreshToken失败: ${response.data.message}`));
          }
        } else {
          return Promise.reject(new Error(`扫码状态检测失败: ${response.data.message}`));
        }
      })
      .then(async (refreshToken) => {
        const response = await axios.post('https://auth.aliyundrive.com/v2/account/token', {
          refresh_token: refreshToken,
          grant_type: "refresh_token"
        }, {
          headers: {
            "User-Agent": UA,
            "Content-Type": "application/json",
            referer: "https://www.aliyundrive.com/"
          }
        })
        const {token_type, access_token} = response.data
        const authorization = `${token_type} ${access_token}`
        return Promise.resolve(authorization)
      })
      .then(async (authorization) => {
        const response = await axios.post('https://open.aliyundrive.com/oauth/users/authorize?client_id=76917ccccd4441c39457a04f6084fb2f&redirect_uri=https%3A%2F%2Falist.nn.ci%2Ftool%2Faliyundrive%2Fcallback&scope=user%3Abase%2Cfile%3Aall%3Aread%2Cfile%3Aall%3Awrite&state=', {
          authorize: 1,
          scope: "user:base,file:all:read,file:all:write"
        }, {
          headers: {
            "User-Agent": UA,
            "Content-Type": "application/json",
            referer: "https://www.aliyundrive.com/",
            authorization
          }
        })
        return response.data.redirectUri.match(/code=([a-zA-Z0-9]+)/)[1]
      })
      .then(async (code) => {
        const response = await axios.post('https://api.nn.ci/alist/ali_open/code', {
          code,
          grant_type: "authorization_code"
        }, {
          headers: {
            "User-Agent": UA,
            "Content-Type": "application/json",
            referer: "https://www.aliyundrive.com/"
          }
        })
        if (response.data.refresh_token) {
          res.send({
            code: 0,
            data: {
              token,
              token280: response.data.refresh_token
            }
          })
        } else {
          return Promise.reject(new Error(`获取openToken失败: ${response.data.message}`));
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

  fastify.get('/token', async (req, res) => {
    res.send({
      code: 0,
      data: {
        token: await getTokenCache(req.server),
        token280: await getToken280Cache(req.server)
      }
    })
  })

  fastify.put('/token', async (req, res) => {
    await setTokenCache(req.server, req.body.data.token)
    await setToken280Cache(req.server, req.body.data.token280)
    res.send({
      code: 0,
    })
  })
}