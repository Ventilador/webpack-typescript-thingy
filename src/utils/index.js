module.exports = {
    noop: function () { },
    valueFn: function (val) { return function () { return val; }; },
    makeQueue: require('./queue'),
    onNextTick: require('./processor')
};
