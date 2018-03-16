const fs = require('fs-extra');
const { resolve } = require('path');
const { ScriptTarget } = require('typescript');
const isDefinitionFile = /\.d\.tsx?$/;
module.exports = function (config) {
    return readDefinitions({
        raw: config,
        dir: process.cwd(),
        definitions: null
    })
        .catch(console.error);
};

function readDefinitions(config) {
    return Promise.all([getTypes(config.dir), tryGetRootTypes(config)])
        .then(flatReduceFilter)
        .then(function (files) {
            config.definitions = files;
            config.compilerOptions = parseCompilerOptions(config.raw.compilerOptions);
            return config;
        });
}

function parseCompilerOptions(config) {
    return {
        target: getTarget(config.target)
    };
}

function getTarget(target) {
    switch (target) {
        case 'es5':
            return ScriptTarget.ES5;
        default:
            break;
    }
}

function tryGetRootTypes(config) {
    const typeRoots = config.raw.compilerOptions && config.raw.compilerOptions.typeRoots;
    return typeRoots ?
        Promise.all(typeRoots.reduce(function (prev, cur) {
            prev.push(readAlldts(resolve(config.dir, cur)));
            return prev;
        }, []))
        : Promise.when();
}

function getTypes(dirName) {
    const atTypes = resolve(dirName, 'node_modules', '@types');
    const typings = resolve(dirName, 'node_modules', 'typings');
    return Promise.all([readAlldts(atTypes), readAlldts(typings)]);
}

function flatReduceFilter(items) {
    return items.reduce(reducer, []);
}

function reducer(prev, cur) {
    if (cur) {
        if (Array.isArray(cur)) {
            cur.reduce(reducer, prev);
        } else {
            prev.push(cur);
        }
    }
    return prev;

}

function readAlldts(fromPath) {
    return fs.exists(fromPath)
        .then(function (exists) {
            return exists ? fs.readdir(fromPath) : undefined;
        })
        .then(function (items) {
            return Promise.all(items.reduce(function (prev, cur) {
                const myPath = resolve(fromPath, cur);
                prev.push(fs
                    .stat(myPath)
                    .then(function (stat) {
                        if (stat.isDirectory()) {
                            return readAlldts(myPath);
                        }
                        return isDefinitionFile.test(myPath) ? myPath : undefined;
                    })
                );
                return prev;
            }, []));
        });
}
