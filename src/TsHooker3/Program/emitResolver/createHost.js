const { cachedGetter } = require('./../../../utils');
const ts = require('typescript');
const fs = require('./../../../fileSystem')
module.exports = function (options) {
    const host = {
        getCompilerOptions,
        getSourceFiles: cachedGetter(getSourceFiles),
        getSourceFile,
        getResolvedTypeReferenceDirectives,
        getTransformers: cachedGetter(getTransformers),
        addResolvedTypeReferenceDirectives
    };
    const resolverTypeReferenceDirectives = new Map();
    const files = Object.create(null);
    return host;
    function getCompilerOptions() {
        return options;
    }
    function getSourceFile(path) {
        return fs.readSourceFile(path);
    }
    function getSourceFiles() {
        return Object.keys(files).map(getSourceFile);
    }
    function getResolvedTypeReferenceDirectives() {
        return resolverTypeReferenceDirectives;
    }
    function getTransformers() {
        return ts.getTransformers(options);
    }
    function addResolvedTypeReferenceDirectives(node) {
        resolverTypeReferenceDirectives.set(node.getPath(), {
            primary: true,
            resolvedFileName: node.getPath()
        });
    }
};