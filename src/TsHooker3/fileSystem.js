const { getNode, NodeProperties } = require('./utils');
module.exports = {
    create: getNode,
    readFile: makeGetter(NodeProperties.CONTENT),
    writeFile: makeSetter(NodeProperties.CONTENT),
    readSourceFile: makeGetter(NodeProperties.SOURCE),
    writeSourceFile: makeSetter(NodeProperties.SOURCE),
    readSnapshot: makeGetter(NodeProperties.SNAPSHOT),
    writeSnapshot: makeSetter(NodeProperties.SNAPSHOT),
    readVersion: makeGetter(NodeProperties.VERSION),
    writeVersion: makeSetter(NodeProperties.VERSION),
    readType: makeGetter(NodeProperties.TYPE),
    writeType: makeSetter(NodeProperties.TYPE),
    readDependencies: makeGetter(NodeProperties.DEPENDENCIES),
    writeDependencies: makeSetter(NodeProperties.DEPENDENCIES),
    readDiagnostics: makeGetter(NodeProperties.DIAGNOSTICS),
    writeDiagnostics: makeSetter(NodeProperties.DIAGNOSTICS),
    readEmit: makeGetter(NodeProperties.EMIT),
    writeEmit: makeSetter(NodeProperties.EMIT),
    once: once,
    multiple: function (path) {
        const node = getNode(path);
        return {
            readFile: makeNodeGetter(node, NodeProperties.CONTENT),
            writeFile: makeNodeSetter(node, NodeProperties.CONTENT),
            readSourceFile: makeNodeGetter(node, NodeProperties.SOURCE),
            writeSourceFile: makeNodeSetter(node, NodeProperties.SOURCE),
            readSnapshot: makeNodeGetter(node, NodeProperties.SNAPSHOT),
            writeSnapshot: makeNodeSetter(node, NodeProperties.SNAPSHOT),
            readVersion: makeNodeGetter(node, NodeProperties.VERSION),
            writeVersion: makeNodeSetter(node, NodeProperties.VERSION),
            readType: makeNodeGetter(node, NodeProperties.TYPE),
            writeType: makeNodeSetter(node, NodeProperties.TYPE),
            readDependencies: makeNodeGetter(node, NodeProperties.DEPENDENCIES),
            writeDependencies: makeNodeSetter(node, NodeProperties.DEPENDENCIES),
            readDiagnostics: makeNodeGetter(node, NodeProperties.DIAGNOSTICS),
            writeDiagnostics: makeNodeSetter(node, NodeProperties.DIAGNOSTICS),
            readEmit: makeNodeGetter(node, NodeProperties.EMIT),
            writeEmit: makeNodeSetter(node, NodeProperties.EMIT),
            getPath: getNodePath(node),
            update: update(node),
            getVersion: getVersion(node),
            $node: node
        };
    }
};

function getVersion(node) {
    return function () {
        return node.versioN;
    };
}

function update(node) {
    return function () {
        node.update();
        return this;
    };
}


function getNodePath(node) {
    return function () {
        return node.path;
    };
}

function once(path, prop, cb) {
    getNode(path).once(prop, cb);
    return this;
}

function makeNodeGetter(node, prop) {
    return function () {
        return node.getProperty(prop);
    };
}


function makeNodeSetter(node, attr) {
    return function (val) {
        node.setProperty(attr, val);
        return this;
    };
}


function makeGetter(attr) {
    return function (path) {
        return getNode(path).getProperty(attr);
    };
}

function makeSetter(attr) {
    return function (path, val) {
        getNode(path).setProperty(attr, val);
        return this;
    };
}

