const makeQueue = require('./queue');
const makePile = require('./pile');
const programQueue = makeQueue();
const emptyArgs = [];
let pile = makePile();
let queued = false;
module.exports = function (cb, context, args) {
    if (!queued) {
        queue();
    }
    programQueue.put({
        fn: cb,
        context: context || null,
        args: arguments.length === 3 ? (args && Array.isArray(args) ? args : [args]) : emptyArgs
    });
};

module.exports.shortPile = function (cb, context, args) {
    if (!queued) {
        queue();
    }
    pile.put({
        fn: cb,
        context: context || null,
        args: arguments.length === 3 ? (args && Array.isArray(args) ? args : [args]) : emptyArgs
    });
};

function flushAFew() {
    queued = false;
    const pileSize = pile.all(release).size();
    const queueSize = programQueue.for(100, release)
    if (pileSize || queueSize) {
        queue();
    }
}

function queue() {
    queued = true;
    setImmediate(flushAFew);
}

function release(item) {
    try {
        item.fn.apply(item.context, item.args);
    } catch (err) {
        console.log(err);
    }
}