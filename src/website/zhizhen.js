const defaultUrls = ['https://mihdr.top', 'http://xiaomi666.fun', 'http://www.miqk.cc', 'https://xiaomiai.site']

export const getCache = async (server) => {
  const obj = await server.db.getObjectDefault(`/zhizhen`, {})
  // 优先级：缓存->配置文件->兜底域名
  return obj?.urls || server.config.zhizhen?.urls || defaultUrls
}

export const setCache = async (server, value) => {
  await server.db.push(`/zhizhen/urls`, value);
}

export const removeCache = async (server) => {
  await server.db.delete(`/zhizhen/urls`);
}

export default async function zhizhen(fastify) {
  fastify.get('/urls', async (req, res) => {
    res.send({
      code: 0,
      data: await getCache(req.server)
    })
  })

  fastify.put('/urls', async (req, res) => {
    await setCache(req.server, req.body)
    res.send({
      code: 0,
    })
  })

  fastify.delete('/urls', async (req, res) => {
    await removeCache(req.server)
    res.send({
      code: 0,
    })
  })
}
