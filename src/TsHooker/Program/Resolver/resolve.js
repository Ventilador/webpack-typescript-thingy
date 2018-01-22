const { dirname, resolve } = require('path');
module.exports = function (request, cb) {
    request.filePath = resolve(dirname(request.context), request.relativePath);
    this.apply(request, 'tryFile', cb);
};
