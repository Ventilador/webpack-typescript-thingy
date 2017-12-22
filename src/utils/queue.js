module.exports = function makeQueue() {
    let last, first = (last = null), size = 0;
    return {
        put: function (val) {
            if (!size) {
                last = first = {
                    prev: null,
                    val: val
                };
            } else {
                first = (first.prev = {
                    prev: null,
                    val: val
                });
            }
            size++;
        },
        take: function () {
            if (!size) {
                return;
            }
            let l = last;
            if (--size) {
                last = l.prev;
            } else {
                first = last = null;
            }
            return l.val;
        },
        'for': function (amount, cb) {
            let times = amount;
            while (times--) {
                if (last) {
                    try {
                        cb(last.val);
                    } catch (err) {
                        console.log(err);
                    }
                    last = last.prev;
                } else {
                    times = 0;
                }
            }
            size = Math.max(size - amount, 0);
            if (!size) {
                first = last = null;
            }
            return size;
        },
        size: function () { return size; },
        clear: function () {
            first = last = null;
            size = 0;
        }
    };
};
const queue = module.exports();
module.exports.queueSync = function () {
    if (queue.size()) {
        console.warning('Sync queue was left with items, carefull');
        queue.clear();
    }
    return queue;
};
