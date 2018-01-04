const { readFile, exists, readdir, lstat } = require('fs');
const { resolve } = require('path');
module.exports = {
    readFile: _readFile,
    exists: _exists,
    find: _find,
    readdir: _readdir,
    lstat: _lstat
};
function _readFile(file, encoding) {
    return new Promise(function (res, rej) {
        readFile(file, encoding || 'utf8', function (err, result) {
            if (err) {
                rej(err);
            } else {
                res(result);
            }
        });
    });
}
function _find(path, filter) {
    return _readdir(path).then(function (files) {
        return Promise.all(files.map(checkFile, path));
    })
        .then(function (result) {
            return result.reduce(toPlainArray, []).filter(byString, filter);
        });
}

function toPlainArray(prev, cur) {
    if (Array.isArray(cur)) {
        return cur.reduce(toPlainArray, prev);
    }
    prev.push(cur);
    return prev;
}

function byString(item) {
    return item && (!this || item.indexOf(this) !== -1);
}

function _lstat(path) {
    return new Promise(function (res, rej) {
        lstat(path, function (err, result) {
            if (err) {
                rej(err);
            } else {
                res(result);
            }
        });
    });
}



function checkFile(path_) {
    const path = resolve(this.toString(), path_);
    return _lstat(path)
        .then(function recurseReadDir(stat) {
            if (stat.isDirectory()) {
                return _readdir(path)
                    .then(function (files) {
                        return Promise.all(files.map(checkFile, path));
                    });
            } else {
                return path;
            }
        });
}



function _exists(path) {
    return new Promise(function (res) {
        exists(path, res);
    });
}
function _readdir(path) {
    return new Promise(function (res, rej) {
        readdir(path, function (err, result) {
            if (err) {
                rej(err);
            } else {
                res(result);
            }
        });
    });
}
