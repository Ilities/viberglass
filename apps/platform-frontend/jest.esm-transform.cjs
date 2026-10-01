// Jest runs these tests as CommonJS, and the markdown parser ships only ES
// modules, so its files are compiled to CommonJS on the way in.
const { transformSync } = require('esbuild')

module.exports = {
  process(source, filename) {
    const { code, map } = transformSync(source, { format: 'cjs', loader: 'js', sourcefile: filename, sourcemap: true, target: 'node18' })
    return { code, map }
  },
}
