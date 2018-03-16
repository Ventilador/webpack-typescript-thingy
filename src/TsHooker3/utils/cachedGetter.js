const unique = {};
module.exports = function (factory) {
    let instance = unique;
    get.$reset = update;
    return get;
    function get() {
        return instance === unique ? factory() : instance;
    }

    function update() {
        instance = unique;
    }
};