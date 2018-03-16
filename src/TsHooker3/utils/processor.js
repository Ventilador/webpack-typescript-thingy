const makeQueue = require('./queue');
// const makePile = require('./pile');
const programQueue = makeQueue();
// let pile = makePile();
let queued = false;
module.exports = function (cb) {
    if (!queued) {
        queue();
    }
    programQueue.put(cb);
};

// module.exports.shortPile = function (cb) {
//     if (!queued) {
//         queue();
//     }
//     pile.put(cb);
// };

function flushAFew() {
    queued = false;
    // const pileSize = pile.all(release).size();
    // const queueSize = programQueue.for(100, release);
    if (programQueue.for(100, release)) {
        queue();
    }
}

function queue() {
    queued = true;
    setImmediate(flushAFew);
}

function release(cb) {
    try {
        cb();
    } catch (err) {
        console.log(err);
    }
}