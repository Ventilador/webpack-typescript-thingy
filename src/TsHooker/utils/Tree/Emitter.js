const queue = require('./../queue');
const onNextTick = require('./../processor');
module.exports = Emitter;
Emitter.prototype = Object.create(null);
function Emitter() {
    this.listeners = null;
}

Emitter.prototype.on = function (ev, cb) {
    let map = this.listeners;
    if (!map) {
        map = this.listeners = Object.create(null);
    }
    let array = map[ev];
    if (!array) {
        array = map[ev] = [];
    }
    array.push(cb);
    return function () {
        const index = array.indexOf(cb);
        if (index !== -1) {
            array.splice(index, 1);
        }
    };
};
Emitter.prototype.once = function (ev, cb) {
    let map = this.listeners;
    if (!map) {
        map = this.listeners = Object.create(null);
    }
    let myQueue = map[ev];
    if (!myQueue) {
        myQueue = map[ev] = queue();
    }
    return myQueue.put(cb);
};
Emitter.prototype.emit = function (ev, val) {
    let map = this.listeners;
    if (map) {
        let myQueue = map[ev];
        if (myQueue && myQueue.size()) {
            onNextTick(function () {
                myQueue.all(function (cb) {
                    try {
                        cb(val);
                    } catch (err) {
                        console.error(err);
                    }
                });
            });
        }
    }
};
