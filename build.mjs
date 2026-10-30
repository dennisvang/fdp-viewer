// https://esbuild.github.io/getting-started/#build-scripts
// this build script should be used via `npm run build` (see package.json scripts)

import * as esbuild from 'esbuild'

await esbuild.build({
    entryPoints: ['src/main.js', 'src/main.css'],
    bundle: true,
    outdir: 'dist',
    minify: true,
    sourcemap: true,
    target: 'esnext',
})