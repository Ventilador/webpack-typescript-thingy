module.exports = function (request, cb) {
    if (request.filePath.endsWith('.ts')) {
        this.apply('File not found', 'error', cb);
    } else {
        const async = this.async();

        this.apply(
            Object.assign({}, request, {
                filePath: request.filePath + '.ts'
            }),
            'tryFile',
            function (err, result) {
                if (err) {
                    async(request, 'resolveJs', cb);
                } else {
                    async(result, 'resolved', cb);
                }
            });
    }
};
