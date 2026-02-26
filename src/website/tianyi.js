export const getCache = async (server, key) => {
  const obj = await server.db.getObjectDefault(`/tyi`, {})
  return obj?.[key] || ''
}

export const setCache = async (server, key, value) => {
  await server.db.push(`/tyi/${key}`, value);
}

export default async function tianyi(fastify) {
  fastify.get('/account', async (req, res) => {
    const username = await getCache(req.server, 'cloud_account')
    const password = await getCache(req.server, 'cloud_password')
    res.send({
      code: 0,
      data: {
        username,
        password,
      }
    })
  })

  fastify.put('/account', async (req, res) => {
    await setCache(req.server, 'cloud_account', req.body.username)
    await setCache(req.server, 'cloud_password', req.body.password)
    res.send({
      code: 0,
    })
  })
}