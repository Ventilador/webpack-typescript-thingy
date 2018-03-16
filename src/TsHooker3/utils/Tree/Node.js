const ts = require('typescript');
const makeSnapshot = ts.ScriptSnapshot.fromString;
const PropertyBag = require('./PropertyBag');
const { sep } = require('path');
const { onNextTick, makeQueue } = require('./../index.js');
const driverSep = ':';
module.exports = Node;
function Node(name, parent, depth) {
    PropertyBag.call(this);
    this.parent = parent;
    this.first = this.last = this.next = this.prev = null;
    this.name = name;
    if (parent) {
        if (parent.path) {
            this.path = parent.path + sep + this.name;
        } else {
            this.path = this.name + driverSep;
        }
    } else {
        this.path = undefined;
    }
    this.children = null;
    this.depth = depth + 1;
    this.version = 0;
}

Node.prototype = Object.create(PropertyBag.prototype);
Node.prototype.update = function () {
    this.version++;
    return this;
};
Node.prototype.createChild = function (name) {
    let children = this.children;
    if (!children) {
        children = this.children = Object.create(null);
    }
    const child = children[name.toLowerCase()] = new Node(name, this, this.depth);
    if (this.first) {
        this.first.prev = child;
        child.next = this.first;
        this.first = child;
    } else {
        this.first = this.last = child;
    }


    return child;
};


Node.prototype.getChild = function (name) {
    return this.children && this.children[name.toLowerCase()];
};
