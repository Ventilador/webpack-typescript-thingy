const { stat } = require('fs');
module.exports = function (request, cb) {
    const async = this.async();
    stat(request.filePath, function (err, stats) {
        if (err) {
            async(request, 'resolveTs', cb);
            return;
        }
        if (stats.isFile()) {
            async(request, 'resolved', cb);
        } else {
            request.filePath += '/index';
            async(request, 'resolveTs', cb);
        }
    });
};
