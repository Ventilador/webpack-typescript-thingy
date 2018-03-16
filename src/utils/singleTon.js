module.exports = function (constructor) {
    return function () {
        if (constructor.instance) {
            return constructor.instance;
        }
        return (constructor.instance = constructor.apply(this, arguments));
    };
};
module.exports.promisify = function (constructor) {
    return function () {
        if (constructor.instance) {
            return Promise.resolve(constructor.instance);
        }
        if (constructor.promise) {
            return constructor.promise;
        }
        const self = this;
        let length = arguments.length;
        const args = new Array(arguments.length);
        while (length--) {
            args[length] = arguments[length];
        }
        return (constructor.promise = new Promise(function (resolve) {
            resolve((constructor.instance = constructor.apply(self, args)));
            constructor.promise = null;
        }));
    };
};