const Emitter = require('./Emitter');
const { NodePropertiesKeys } = require('./../enums.js');
const k = NodePropertiesKeys.reduce(toObject, Object.create(null))
module.exports = new Function('k', 'p', // jshint ignore:line
    ['PropertyBag.prototype = Object.create(p);',
        'return PropertyBag;',
        'function PropertyBag(){',
        '   this._PROPERTY_BAG = {', makeKeys(NodePropertiesKeys), '};',
        '}'].join('\r\n')
)(k, Emitter.prototype);

module.exports.prototype.getProperty = function (prop, version) {
    if (k[prop]) {
        version = arguments.length === 2 ? version : this.version;
        const bag = this._PROPERTY_BAG[prop];
        if (bag && bag.version === version) {
            return bag.value;
        }
        return null;
    }
    throw "Invalid property " + prop;
};
module.exports.prototype.setProperty = function (prop, value, version) {
    if (k[prop]) {
        version = arguments.length === 3 ? version : this.version;
        const bag = this._PROPERTY_BAG[prop];
        if (bag) {
            bag.value = value;
            bag.version = version;
        } else {
            this._PROPERTY_BAG[prop] = { value, version };
        }
        this.emit(prop, value);
        return;
    }
    throw "Invalid property " + prop;
};


function toObject(prev, cur) {
    prev[cur] = true;
    return prev;
}

function makeKeys(keys) {
    return keys.map(toNullDefinition).join(', ');
}

function toNullDefinition(item) {
    return item + ': null';
}
