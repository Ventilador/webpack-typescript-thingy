const waterfall = require('./../waterfall');
const { counter } = require('./../../utils');
const { resolve } = require('path');
const fs = require('fs-extra');
module.exports = function () {
    const program = waterfall();
    program
        .define('readdir', readdir)
        .define('getStats', getStats)
        .define('readFiles', readFiles)
        .define('generateTypeDirectives', generateTypeDirectives);
    return function (path, cb) {
        program.apply(path, 'readdir', cb);
    }
};



function readdir(path, cb) {
    const async = this.async();
    fs.readdir(path)
        .then(function (files) {
            async({
                typeRootPath: path,
                toResolve: files.map(function (cur) {
                    return resolve(path, cur);
                }),
                folders: [],
                declarations: [],
                resolvedTypeDirectives: []
            }, 'getStats', cb);
        })
        .catch(cb.catch);
}

function readFiles(request, cb) {
    const async = this.async();
    Promise.all(request.declarations.map(readEachFile))
        .then(function (results) {
            request.declarations = results;
            async(request, 'done', cb);
        });
}

function readEachFile(path) {
    return fs.readFile(path)
        .then(function (content) {
            return {
                path: path,
                content: content.toString()
            };
        });
}

function getStats(request, cb) {
    const async = this.async();
    Promise.all(request.toResolve.map(readStat))
        .then(function (folders) {
            for (let i = 0, cur = folders[i]; i < folders.length; cur = folders[++i]) {
                request[cur.isDirectory() ? 'folders' : 'declarations'].push(request.toResolve[i]);
            }
            const myCounter = counter(function () {
                async(request, 'generateTypeDirectives', cb);
            });
            return myCounter.add(), async(request, 'readFiles', myCounter.remove),
                myCounter.add(), async(request, 'readDirectories', myCounter.remove);

        })
        .catch(cb.catch);

}

function readStat(path) {
    return fs.stat(path);
}

