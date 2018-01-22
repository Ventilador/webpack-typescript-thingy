const waterfall = require('./../waterfall')
const { singleton } = require('./../../utils');
module.exports = singleton(function () {
    const process = waterfall({})
        .define('resolve', require('./resolve'))
        .define('tryFile', require('./tryFile'))
        .define('resolveTs', require('./resolveTs'))
        .define('resolved', require('./resolved'));
    return function (context, relativePath, onDone) {
        process.apply({
            context, relativePath
        }, 'resolve', onDone);
    };
});