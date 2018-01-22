let instance;
require('./TsHooker/Program')()
  .then(function (val) { instance = val; });
const { dirname } = require('path');
let compilation;
const { NodeProperties } = require('./TsHooker/utils');
let files = 0;
const requested = {};
module.exports = function (source) {
  if (compilation !== this._compilation) {
    compilation = this._compilation;
    instance.updateResolver(makeResolver(this.resolve));
    instance.updateReader(makeReader(this.loadModule, requested));
  }
  if (requested[this.resourcePath]) {
    console.log(this.resourcePath);
  }
  const self = this;
  self.clearDependencies();
  instance.update(this.resourcePath, source, function (err) {
    if (err) {
      console.log(err);
    }

    console.log('processed:', ++files);
  });
  // .once(NodeProperties.DEPENDENCIES, function (deps) {
  //   deps.forEach(addDep, self);
  // });
  this.callback(null, source);
};

function addDep(file) {
  this.dependency(file);
}

function makeResolver(resolver) {
  return resolve;
  function resolve(context, file, cb) {
    if (/\.(less|html|png|jpg|css|json)$/.test(file)) {
      setImmediate(cb);
      return;
    }
    resolver(dirname(context), file, cb);
  }
}

function makeReader(resolver, map) {
  return function (file) {
    map[file] = true;
    resolver(file, noop);
  };
}

function noop(err) {
  if (err) {
    console.log(err);
  }

}
