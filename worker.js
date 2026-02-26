export default {
  async fetch(request, env) {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) {
      return new Response('Authentication required', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic'
        },
      });
    }
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = atob(base64Credentials);
    console.log('credentials', credentials)
    const [username, password] = credentials.split(':');
    if (username !== 'a' || password !== 'b') {
      return new Response('Invalid credentials', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic'
        },
      });
    }
    return env.ASSETS.fetch(request);
  },
};