module.exports = function () {
    let resolve, reject;
    let promise = new Promise(function (res, rej) {
        resolve = res;
        reject = rej;
    });
    return {
        resolve, reject, promise
    };
};