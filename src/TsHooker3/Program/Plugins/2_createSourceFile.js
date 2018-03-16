const ts = require('typescript');
module.exports = function createSourceFile(node, cb) {
    let sourceFile = node.readSourceFile();
    const path = node.getPath();
    const version = node.getVersion();
    if (!sourceFile) {
        const text = node.readFile();
        if (!text) {
            throw 'No content found for ' + path;
        }
        sourceFile = ts.createLanguageServiceSourceFile(path, node.readSnapshot(), ts.ScriptTarget.Latest, version, /*setNodeParents*/ false, ts.ScriptKind.TS);
        sourceFile.version = version;
    } else if (sourceFile.version !== version) {
        sourceFile = ts.updateLanguageServiceSourceFile(path, node.readSnapshot(), ts.ScriptTarget.Latest, version, /*setNodeParents*/ false, ts.ScriptKind.TS);
        sourceFile.version = version;
    }
    node.writeSourceFile(sourceFile);
    sourceFile.path = path;
    this.apply(node, 'collect', cb);
};

