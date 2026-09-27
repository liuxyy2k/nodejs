import axios from 'axios';
import fs from 'fs';
import { config } from './src/spider/video/config.js';

const FLARE = config.FLARE_URL;
const r = await axios.post(FLARE, { cmd: 'request.get', url: 'https://www.av01.media/assets/index-DmQK3kIV.js', maxTimeout: 120000 });
fs.writeFileSync('temp_av01_bundle.js.txt', r.data.solution.response);
console.log('saved', r.data.solution.response.length);
