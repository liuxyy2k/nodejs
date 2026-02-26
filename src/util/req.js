import _axios from 'axios';
import https from 'https';
import http from 'http';

const req = _axios.create({
    httpsAgent: new https.Agent({ keepAlive: false, rejectUnauthorized: false }),
    httpAgent: new http.Agent({ keepAlive: false })
});

export default req;
