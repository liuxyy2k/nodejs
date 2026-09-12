import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import {getWebsiteBundle, getDanmuBundle} from "./esbuild-website.js";
import JavaScriptObfuscator from 'javascript-obfuscator';

const isDev = process.env.NODE_ENV === 'development'

let result = await esbuild.build({
    entryPoints: ['src/index.js'],
    outfile: 'dist/index.js',
    bundle: true,
    minify: true,
    write: true,
    metafile: true,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    sourcemap: isDev ? 'inline' : false,
    plugins: isDev
        ? [embedAdminPages(), genMd5()]
        : [embedAdminPages(), obfuscator(), addWebsite(), genMd5()],
    define: {
        DB_NAME: JSON.stringify(process.env.DB || 'default'),
    },
});

fs.writeFileSync('meta.server.json', JSON.stringify(result.metafile))

/** 生产部署为单文件 index.js，admin HTML 必须内嵌，不能运行时读盘 */
function embedAdminPages() {
    return {
        name: 'embed-admin-pages',
        setup(build) {
            build.onLoad({ filter: /[/\\]admin[/\\]pages\.js$/ }, (args) => {
                const pagesDir = path.join(path.dirname(args.path), 'pages');
                const pages = {};
                for (const name of fs.readdirSync(pagesDir)) {
                    if (!name.endsWith('.html')) continue;
                    pages[name.slice(0, -5)] = fs.readFileSync(path.join(pagesDir, name), 'utf8');
                }
                const contents = `export function loadPage(name) {
  const PAGES = ${JSON.stringify(pages)};
  const html = PAGES[name];
  if (html === undefined) throw new Error('Page not found: ' + name);
  return html;
}

export function wantsHtml(req) {
  return (req.headers.accept || '').includes('text/html');
}
`;
                return { contents, loader: 'js' };
            });
        },
    };
}

function addWebsite() {
    return {
        name: 'add-website',
        setup(build) {
            build.onEnd(async (_) => {
                const filePath = 'dist/index.js';
                const serverContent = fs.readFileSync(filePath, 'utf8');
                const websiteContent = await getWebsiteBundle();
                const danmuContent = await getDanmuBundle();

                fs.writeFileSync(filePath, websiteContent + danmuContent + serverContent);
            });
        },
    };
}

function genMd5() {
    return {
        name: 'gen-output-file-md5',
        setup(build) {
            build.onEnd(async (_) => {
                const md5 = createHash('md5').update(fs.readFileSync('dist/index.js')).digest('hex');
                fs.writeFileSync('dist/index.js.md5', md5);
            });
        },
    };
}

function obfuscator() {
    return {
        name: 'obfuscator',
        setup(build) {
            build.onLoad({ filter: /\.js$/ }, async (args) => {
                const contents = fs.readFileSync(args.path, 'utf8');
                if (contents.startsWith('//jiami-mark')) {
                    const obfuscationResult = JavaScriptObfuscator.obfuscate(contents,
                      {
                          compact: false,
                          controlFlowFlattening: true,
                          controlFlowFlatteningThreshold: 1,
                          numbersToExpressions: true,
                          simplify: true,
                          stringArrayShuffle: true,
                          splitStrings: true,
                          stringArrayThreshold: 1
                      }
                    );
                    return {
                        contents: obfuscationResult.getObfuscatedCode(),
                        loader: 'js'
                    };
                }
                return {
                    contents,
                    loader: 'js'
                };
            });
        }
    }
};