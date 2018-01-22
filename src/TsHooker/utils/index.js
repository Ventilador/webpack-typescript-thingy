const { NodeProperties, NodePropertiesKeys } = require('./enums');
module.exports = {
    noop: require('./noop'),
    valueFn: require('./valueFn'),
    makeQueue: require('./queue'),
    onNextTick: require('./processor'),
    NodeProperties: NodeProperties,
    getNode: require('./InMemoryDirectory')(),
    counter: require('./counter'),
    singleton: require('./singleTon'),
    cachedGetter: require('./cachedGetter')
};

Object.defineProperty(module.exports, 'NodePropertiesKeys', {
    get: function () {
        return NodePropertiesKeys.slice();
    }
});
