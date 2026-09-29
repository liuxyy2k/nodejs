import './httpRecord.js';
import _axios from 'axios';
import https from 'https';
import http from 'http';
import cookieStore from './cookieStore.js';

const req = _axios.create({
    httpsAgent: new https.Agent({ keepAlive: false, rejectUnauthorized: false }),
    httpAgent: new http.Agent({ keepAlive: false }),
    timeout: 10000,
});

req.interceptors.request.use(async (config) => {
    await cookieStore.load();
    if (config.url) {
        const cookies = await cookieStore.getCookies(config.url);
        if (cookies && !config.headers.Cookie) config.headers.Cookie = cookies;
    }
    return config;
});

req.interceptors.response.use(async (response) => {
    const setCookies = response.headers['set-cookie'];
    if (setCookies?.length && response.config.url) {
        await cookieStore.setCookies(response.config.url, setCookies);
        cookieStore.save();
    }
    return response;
}, async (error) => {
    const setCookies = error.response?.headers?.['set-cookie'];
    if (setCookies?.length && error.config?.url) {
        await cookieStore.setCookies(error.config.url, setCookies);
        cookieStore.save();
    }
    return Promise.reject(error);
});

req.saveCookies = (immediate = false) => cookieStore.save(immediate);
req.loadCookies = () => cookieStore.load();
req.clearCookies = (domain) => cookieStore.clearCookies(domain);
req.clearAllCookies = () => cookieStore.clearAllCookies();
req.getCookieJar = () => cookieStore.getJar();
req.setAutoSave = (enabled) => cookieStore.setAutoSave(enabled);

export default req;
