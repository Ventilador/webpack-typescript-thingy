const intermediateHost = require('./TsHooker/Host');
module.exports = function (source) {
  const path = this.resourcePath;
  const cb = this.async();
  intermediateHost().emit(path, source).then(function (result) {
    cb(null, result.text, result.sourceMap);
  });
};
