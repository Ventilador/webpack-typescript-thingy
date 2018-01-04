module.exports = function () {
    let node = null, size = 0;
    const pile = {
        size: function () { return size; },
        put: function (val) {
            if (size) {
                node = {
                    prev: node,
                    val: val
                };
            } else {
                node = {
                    prev: null,
                    val: val
                };
            }
            size++;
        },
        take: function () {
            if (size) {
                const toReturn = node;
                node = node.prev;
                size--;
                return toReturn;
            }
        },
        all: function (cb) {
            if (size) {
                size = 0;
                let cur = node;
                node = null;
                do {
                    cb(cur.val);
                } while ((cur = cur.prev));
            }
            return pile;
        }
    };
    return pile;
};