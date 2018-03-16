const { onNextTick } = require('./../utils');
module.exports = function (options, resolver, require) {
    const items = Object.create(null);
    items.done = function (_, cb) {
        cb(null, _);
    };
    items.error = function (err, cb) {
        cb(err);
    };
    const service = {
        define: function (from, cb) {
            items[from] = cb;
            return service;
        },
        apply: apply,
        resolver: resolver,
        require: require,
        options: options || {},
        async: async
    };
    return service;
    function async() {
        return apply;
    }
    function apply(node, method, cb) {
        if (!items[method]) {
            throw 'Unkown definition ' + method;
        }
        const fn = items[method];
        onNextTick(function () {
            try {
                fn.call(service, node, cb);
            } catch (err) {
                cb(err);
            }
        });
        return node;
    }
};

