const onNextTick = require('./processor');
module.exports = function (cb) {
    let amount = 0;
    let sync = true;
    return {
        ready: function () {
            sync = false;
            if (!amount) {
                onNextTick(cb);
            }
        },
        add: function () {
            amount++;
        },
        remove: remove
    };
    function remove() {
        if (sync) {
            return onNextTick(remove);
        }
        amount--;
        if (!amount) {
            onNextTick(cb);
        }
    }
};