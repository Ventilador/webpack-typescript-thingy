const makeQueue = require('./queue');
const programQueue = makeQueue();
const emptyArgs = [];
module.exports = function (cb, context, args) {
    if (!programQueue.size()) {
        setImmediate(flushAFew);
    }
    programQueue.put({
        fn: cb,
        context: context || null,
        args: arguments.length === 3 ? (args && Array.isArray(args) ? args : [args]) : emptyArgs
    });
};

function flushAFew() {
    if (programQueue.for(100, release)) {
        setImmediate(flushAFew);
    }
}

function release(item) {
    item.fn.apply(item.context, item.args);
}