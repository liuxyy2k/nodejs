import * as esbuild from "esbuild";
import fs from "fs";
import less from "less";
import * as ExternalGlobalPlugin from "esbuild-plugin-external-global";

const {default: {externalGlobalPlugin}} = ExternalGlobalPlugin

const commonConfig = {
    bundle: true,
    minify: true,
    write: false,
    metafile: true,
    format: 'cjs',
    target: ['chrome58', 'firefox57', 'safari11'],
    loader: {
      '.jsx': 'jsx',
      '.png': 'dataurl',
      '.jpg': 'dataurl',
      '.jpeg': 'dataurl',
      '.gif': 'dataurl',
      '.svg': 'dataurl',
      '.webp': 'dataurl',
    },
    plugins: [
      {
        name: 'less-to-js',
        setup(build) {
          build.onLoad({ filter: /\.less$/ }, async (args) => {
            const source = await fs.promises.readFile(args.path, 'utf8');
            const { css } = await less.render(source, {
              filename: args.path
            });
            const contents = `
                          if (typeof window !== 'undefined') {
                              const style = document.createElement('style');
                              style.textContent = ${JSON.stringify(css)};
                              document.head.appendChild(style);
                          }
                      `;
            return { contents, loader: 'js' };
          });
        }
      },
      externalGlobalPlugin({
        'react': 'window.React',
        'react-dom': 'window.ReactDOM',
        'antd': 'window.antd',
        'axios': 'window.axios',
      })
    ]
}

export const getWebsiteBundle = async () => {
  const clientResult = await esbuild.build({
    ...commonConfig,
    entryPoints: ['src/website/App.jsx'],
  });

  fs.writeFileSync('meta.website.json', JSON.stringify(clientResult.metafile))
  const clientBundle = clientResult.outputFiles[0].text;
  return `
globalThis.websiteBundle = function() {
  return \`
    (function() {
      const exports = {};
      const module = { exports };
      \${${JSON.stringify(clientBundle)}}
      module.exports.renderClient();
    })();
  \`;
}();
\n\n`;
}

export const getDanmuBundle = async () => {
    const clientResult = await esbuild.build({
        ...commonConfig,
        entryPoints: ['src/website/Danmu.jsx'],
    });

    fs.writeFileSync('meta.danmu.json', JSON.stringify(clientResult.metafile))
    const clientBundle = clientResult.outputFiles[0].text;
    return `
globalThis.danmuBundle = function() {
  return \`
    (function() {
      const exports = {};
      const module = { exports };
      \${${JSON.stringify(clientBundle)}}
      module.exports.renderDanmu();
    })();
  \`;
}();
\n\n`;
}