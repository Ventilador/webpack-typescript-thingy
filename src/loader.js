const instance = require('./TsHooker')({
  'target': 'es5',
  'module': 'commonjs',
  'noImplicitAny': false,
  'preserveConstEnums': true,
  'removeComments': false,
  'sourceMap': true,
  'experimentalDecorators': true,
  'noEmitOnError': true,
  'declaration': false,
  'typeRoots': [
    './customTypings'
  ],
  'forceConsistentCasingInFileNames': true
});
const { dirname } = require('path');
let resolve, compilation;
module.exports = function (source) {
  const cb = this.async();
  if (compilation !== this._compilation) {
    compilation = this._compilation;
    resolve = makeResolver(this.loadModule, this.resolve);
  }

  instance.processFile(this.resourcePath, source, resolve, function () {
    cb(null, source);
  });
};

function makeResolver(loadModule, resolver) {
  return resolve;
  function resolve(file, context, cb) {
    let count = 0;
    resolver(dirname(context), file, function load(err, path) {
      if (count) {
        console.log(count);
      }
      count++;
      loadModule(path, noop);
      cb(null, path);
    });
  }
}

function noop() { }
