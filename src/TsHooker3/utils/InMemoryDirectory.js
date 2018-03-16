const Node = require('./Tree');
const { normalize, sep } = require('path');
const valueFn = require('./valueFn');
const driverSep = ':';
module.exports = function () {
    return makeMemoryRoot();
};
let makeMemoryRoot = function () {
    const root = new Node('root', null, -1);
    makeMemoryRoot = valueFn(getNode);
    return getNode;
    function getNode(path_) {
        let p = normalize(path_);
        let length = p.length;
        let ii = 0;
        let collected = '', name, node = root;
        do {
            const cur = ii === length ? null : p[ii];
            if (!cur || cur === sep) {
                name = collected;
                let temp = node.getChild(name);
                if (temp) {
                    node = temp;
                } else {
                    node = node.createChild(name);
                }
                if (!cur) {
                    return node;
                }
                collected = '';
            } else if (cur !== driverSep) {
                collected += cur;
            }
        } while (++ii);
    }
};









