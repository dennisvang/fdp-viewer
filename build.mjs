// https://esbuild.github.io/getting-started/#build-scripts

import * as esbuild from 'esbuild'

await esbuild.build({
    entryPoints: ['src/main.js', 'src/main.css'],
    bundle: true,
    outdir: 'dist',
    minify: true,
    sourcemap: true,
    target: 'esnext',
})