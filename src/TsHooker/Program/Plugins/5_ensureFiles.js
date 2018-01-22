const fs = require('./../../fileSystem');
const { NodeProperties, counter } = require('./../../utils');
module.exports = function (require) {
    return function ensureFiles(node, cb) {
        const source = node.readSourceFile();
        const files = source.resolvedModules;
        if (files && files.size) {
            const async = this.async();
            const myCounter = counter(function () {
                async(node, 'emit', cb);
            });
            const deps = new Array(files.size);
            let ii = 0;
            files.forEach(function (module) {
                deps[ii++] = module.resolvedFileName;
                if (!fs.readSourceFile(module.resolvedFileName)) {
                    myCounter.add();
                    if (fs.readFile(module.resolvedFileName) === null) {
                        require(module.resolvedFileName);
                    }
                    fs.once(module.resolvedFileName, NodeProperties.SOURCE, myCounter.remove);
                }
            });
            node.writeDependencies(deps);
            myCounter.ready();
        } else {
            this.apply(node, 'emit', cb);
        }

    };
};
