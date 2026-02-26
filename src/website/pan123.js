export const getCache = async (server, key) => {
  const obj = await server.db.getObjectDefault(`/pan123`, {})
  return obj?.[key] || ''
}

export const setCache = async (server, key, value) => {
  await server.db.push(`/pan123/${key}`, value);
}

export default async function pan123(fastify) {
  fastify.get('/account', async (req, res) => {
    const username = await getCache(req.server, 'pan_passport')
    const password = await getCache(req.server, 'pan_password')
    res.send({
      code: 0,
      data: {
        username,
        password,
      }
    })
  })

  fastify.put('/account', async (req, res) => {
    await setCache(req.server, 'pan_passport', req.body.username)
    await setCache(req.server, 'pan_password', req.body.password)
    res.send({
      code: 0,
    })
  })
}