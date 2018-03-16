const ts = require('typescript');
module.exports = function createSnapshot(node, cb) {
    node.writeSnapshot(ts.ScriptSnapshot.fromString(node.readFile()));
    this.apply(node, 'source', cb);
};

