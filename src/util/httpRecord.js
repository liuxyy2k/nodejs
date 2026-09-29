import { AsyncLocalStorage } from 'node:async_hooks';
import axios from 'axios';

/** 调试请求期间收集 axios 调用。store 里是 recordings 数组。 */
export const httpRecordStore = new AsyncLocalStorage();

const PREVIEW = 2000;

function headerObj(headers) {
    if (!headers) return {};
    try {
        if (typeof headers.toJSON === 'function') return headers.toJSON();
    } catch { /* ignore */ }
    const out = {};
    for (const [k, v] of Object.entries(headers)) {
        if (v == null || typeof v === 'function') continue;
        out[k] = Array.isArray(v) ? v.join(', ') : String(v);
    }
    return out;
}

function sizeOf(data) {
    if (data == null) return 0;
    if (typeof data === 'string') return Buffer.byteLength(data);
    if (Buffer.isBuffer(data)) return data.length;
    try { return Buffer.byteLength(JSON.stringify(data)); } catch { return 0; }
}

function previewData(data) {
    if (data == null) return '';
    if (typeof data === 'string') return data.slice(0, PREVIEW);
    if (Buffer.isBuffer(data)) return data.toString('utf8').slice(0, PREVIEW);
    try { return JSON.stringify(data).slice(0, PREVIEW); } catch { return String(data).slice(0, PREVIEW); }
}

function requestUrl(config) {
    try {
        return axios.getUri(config);
    } catch {
        return config?.url || '';
    }
}

function pushRecord(config, status, data, error, contentType) {
    const bag = httpRecordStore.getStore();
    if (!bag || !config) return;
    bag.push({
        method: String(config.method || 'GET').toUpperCase(),
        url: requestUrl(config),
        status: status || 0,
        duration: Date.now() - (config._recStart || Date.now()),
        dataLength: sizeOf(data),
        contentType: contentType || '',
        requestHeaders: headerObj(config.headers),
        responsePreview: previewData(data),
        error: error || '',
    });
}

export function attachRecorder(instance) {
    if (!instance?.interceptors || instance._httpRecord) return;
    instance._httpRecord = true;
    instance.interceptors.request.use((config) => {
        if (httpRecordStore.getStore()) config._recStart = Date.now();
        return config;
    });
    instance.interceptors.response.use((response) => {
        if (httpRecordStore.getStore()) {
            pushRecord(
                response.config,
                response.status,
                response.data,
                '',
                response.headers?.['content-type'] || '',
            );
        }
        return response;
    }, (error) => {
        if (httpRecordStore.getStore()) {
            pushRecord(
                error.config,
                error.response?.status || 0,
                error.response?.data,
                error.message || '',
                error.response?.headers?.['content-type'] || '',
            );
        }
        return Promise.reject(error);
    });
}

const origCreate = axios.create.bind(axios);
axios.create = function patchedCreate(config) {
    const instance = origCreate(config);
    attachRecorder(instance);
    return instance;
};
attachRecorder(axios);
