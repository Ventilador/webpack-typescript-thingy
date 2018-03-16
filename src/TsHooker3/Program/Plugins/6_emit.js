const ts = require('typescript');
const { valueFn } = require('./../../utils');
const createResolver = require('./emitResolver');
module.exports = function (host) {
    return function emit(node, cb) {
        // const sourceFile = node.readSourceFile();
        // let emitResult;
        // if (node.getPath().endsWith('.d.ts')) {
        //     cb(null, node.writeEmit(''));
        //     return;
        // }
        // try {
        //     emitResult = emitFiles(resolver, host, sourceFile, false, host.getTransformers());
        // } catch (err) {
        //     console.log('je');
        // }

        // node.writeEmit(ts.transpile(node.readFile()));
        cb(null, node);
    };
};