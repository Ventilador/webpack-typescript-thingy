const ts = require('typescript');
const makeRoot = require('./InMemoryDirectory');
const { valueFn, noop, onNextTick } = require('./../utils');
var _fs = require("fs");
var _path = require("path");
var _os = require("os");
var _crypto = require("crypto");
var FileWatcherEventKind;
(function (FileWatcherEventKind) {
    FileWatcherEventKind[FileWatcherEventKind.Created = 0] = "Created";
    FileWatcherEventKind[FileWatcherEventKind.Changed = 1] = "Changed";
    FileWatcherEventKind[FileWatcherEventKind.Deleted = 2] = "Deleted";
})(FileWatcherEventKind = ts.FileWatcherEventKind || (ts.FileWatcherEventKind = {}));

const useCaseSensitiveFileNames = false;


function matchFiles(path, extensions, excludes, includes, useCaseSensitiveFileNames, currentDirectory, depth, getFileSystemEntries) {
    path = ts.normalizePath(path);
    currentDirectory = ts.normalizePath(currentDirectory);
    var patterns = ts.getFileMatcherPatterns(path, excludes, includes, useCaseSensitiveFileNames, currentDirectory);
    var regexFlag = useCaseSensitiveFileNames ? "" : "i";
    var includeFileRegexes = patterns.includeFilePatterns && patterns.includeFilePatterns.map(function (pattern) { return new RegExp(pattern, regexFlag); });
    var includeDirectoryRegex = patterns.includeDirectoryPattern && new RegExp(patterns.includeDirectoryPattern, regexFlag);
    var excludeRegex = patterns.excludePattern && new RegExp(patterns.excludePattern, regexFlag);
    // Associate an array of results with each include regex. This keeps results in order of the "include" order.
    // If there are no "includes", then just put everything in results[0].
    var results = includeFileRegexes ? includeFileRegexes.map(function () { return []; }) : [[]];
    var comparer = useCaseSensitiveFileNames ? ts.compareStrings : ts.compareStringsCaseInsensitive;
    for (var _i = 0, _a = patterns.basePaths; _i < _a.length; _i++) {
        var basePath = _a[_i];
        visitDirectory(basePath, ts.combinePaths(currentDirectory, basePath), depth);
    }
    return ts.flatten(results);
    function visitDirectory(path, absolutePath, depth) {
        let { files, directories } = getFileSystemEntries(path);
        files = files.slice().sort(comparer);
        for (let i = 0, cur = files[i]; i < files.length; cur = files[++i]) {
            const name = ts.combinePaths(path, cur);
            const absoluteName = ts.combinePaths(absolutePath, cur);
            if (!(extensions && !ts.fileExtensionIsOneOf(name, extensions) && excludeRegex && excludeRegex.test(absoluteName))) {
                if (!includeFileRegexes) {
                    results[0].push(name);
                }
                else {
                    var includeIndex = includeFileRegexes.findIndex(testReg, absoluteName);
                    if (includeIndex !== -1) {
                        results[includeIndex].push(name);
                    }
                }
            }
        }
        if (depth !== undefined) {
            depth--;
            if (depth === 0) {
                return;
            }
        }
        directories = directories.slice().sort(comparer);
        for (var _b = 0, directories_1 = directories; _b < directories_1.length; _b++) {
            let current = directories_1[_b];
            var name = ts.combinePaths(path, current);
            var absoluteName = ts.combinePaths(absolutePath, current);
            if ((!includeDirectoryRegex || includeDirectoryRegex.test(absoluteName)) &&
                (!excludeRegex || !excludeRegex.test(absoluteName))) {
                visitDirectory(name, absoluteName, depth);
            }
        }
    }
}

function testReg(reg) {
    return reg.test(this);
}



var FileSystemEntryKind;
(function (FileSystemEntryKind) {
    FileSystemEntryKind[FileSystemEntryKind.File = 0] = "File";
    FileSystemEntryKind[FileSystemEntryKind.Directory = 1] = "Directory";
})(FileSystemEntryKind || (FileSystemEntryKind = {}));




let instance, onExit;

module.exports = function makeMemFs(cb) {
    if (instance) {
        if (cb) {
            onExit.push(cb);
        }
        return instance;
    }
    onExit = cb ? [cb] : [];
    const root = makeRoot();
    instance = {
        args: process.argv.slice(2),
        newLine: _os.EOL,
        useCaseSensitiveFileNames: useCaseSensitiveFileNames,
        write: function (s) {
            process.stdout.write(s);
        },
        readFile: readFile,
        readSourceFile: readSourceFile,
        writeFile: writeFile,
        writeSourceFile: writeSourceFile,
        getFileDependencies: getFileDependencies,
        getSnapshot: getSnapshot,
        setFileDependencies: setFileDependencies,
        watchFile: function () { return { close: noop }; }, // skip
        watchDirectory: function () { return { close: noop }; }, // skip
        resolvePath: _path.resolve,
        fileExists: fileExists,
        directoryExists: directoryExists,
        createDirectory: root.makeDir,
        getExecutingFilePath: valueFn(__filename),
        getCurrentDirectory: function () { return process.cwd(); },
        getDirectories: getDirectories,
        getEnvironmentVariable: function (name) {
            return process.env[name] || "";
        },
        readDirectory: readDirectory,
        getModifiedTime: getModifiedTime,
        getVersion: getVersion,
        createHash: createHash,
        getMemoryUsage: getMemoryUsage,
        getFileSize: getFileSize,
        exit: function (code) {
            onExit.forEach(function (cb) {
                cb(code);
            });
        },
        realpath: function (path) {
            const result = _fs.realpathSync(path);
            console.log('\r\n---------------------------------------------------------');
            console.log('"' + path + '"', 'to', '"' + result + '"');
            console.log('---------------------------------------------------------\r\n');
            console.log('-----------IF YOU SEE THIS PLEASE LET ME KNOW------------');
            console.log('\r\n---------------------------------------------------------');
            return result;
        },
        debugMode: ts.some(process.execArgv, function (arg) { return /^--(inspect|debug)(-brk)?(=\d+)?$/i.test(arg); }),
        tryEnableSourceMapsForHost: function () {
            try {
                require("source-map-support").install();
            }
            catch (e) {
                // Could not enable source maps.
            }
        },
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        ensure: ensure,
        placeholder: root.placeholder,
        normalize:_path.normalize

    };
    return instance;
    function readFile(fileName) {
        return root.getProperty(fileName, 'content');
    }

    function writeFile(fileName, content) {
        const file = root.makeFile(fileName);
        file.setNodeContent(content);
    }
    function readSourceFile(fileName) {
        return root.getProperty(fileName, 'sourceFile');
    }
    function writeSourceFile(fileName, sourceFile) {
        root.setProperty(fileName, 'sourceFile', sourceFile);
    }
    function getSnapshot(fileName) {
        return root.getProperty(fileName, 'snapshot');
    }
    function getFileDependencies(fileName) {
        return root.getProperty(fileName, 'dependencies');
    }
    function setFileDependencies(fileName, deps) {
        return root.setProperty(fileName, 'dependencies', deps);
    }



    function fileExists(path) {
        return path.endsWith('.html') || path.endsWith('.less') || root.getProperty(path, 'isFile') === true;
    }
    function directoryExists(path) {
        return root.getProperty(path, 'isFile') === false;
    }
    function getDirectories(path) {
        let node = root.getChild(path);
        if (node && (node = node.first)) {
            const arr = [];
            do {
                if (!node.isFile) {
                    arr.push(node.getFullName());
                }
            } while ((node = node.next));
            return arr;
        }
        return [];
    }
    function getFileSize(path) {
        const node = root.getChild(path);
        if (node) {
            return node.size();
        }
        return 0;
    }
    function getModifiedTime(path) {
        return root.getProperty(path, 'mtime');
    }
    function getVersion(path) {
        return root.getProperty(path, 'version');
    }


    function getAccessibleFileSystemEntries(path) {
        const node = root.getChild(path);
        if (!node) {
            return { files: [], directories: [] };
        }
        const files = [];
        const directories = [];
        for (let i = 0, a = node.getChildren(), entry = a[i], l = a.length; i < l; entry = a[++i]) {
            if (entry.isFile) {
                files.push(entry.getFullName());
            } else {
                directories.push(entry.getFullName());
            }
        }
        return { files: files, directories: directories };
    }
    function readDirectory(path, extensions, excludes, includes, depth) {
        return matchFiles(path, extensions, excludes, includes, useCaseSensitiveFileNames, process.cwd(), depth, getAccessibleFileSystemEntries);
    }



    function ensure(files, cb, args) {
        if (!files) {
            return;
        }
        let length = files.length;

        let queue;
        while (length--) {
            const cur = files[length];
            if (cur) {
                const shouldWait = root.wait(cur);
                if (shouldWait) {
                    if (!queue) {
                        queue = later(cb, args);
                    }
                    shouldWait.then(queue());
                }
            }
        }
        if (queue) {
            queue.release();
        } else {
            onNextTick(cb, null, args);
        }
    }



    function later(cb, args) {
        let ticks = 0;
        let sync = true;
        add.release = release;
        return add;
        function release() {
            sync = false;
        }
        function add() {
            ticks++;
            return done;
        }
        function done() {
            if (sync) {
                onNextTick(done);
                return;
            }
            ticks--;
            if (ticks < 0) {
                ticks = ticks;
            }
            if (!ticks) {
                onNextTick(cb, null, args);
            }
        }
    }

};

function createHash(data) {
    return _crypto.createHash("md5").update(data).digest("hex");
}
function getMemoryUsage() {
    if (global.gc) {
        global.gc();
    }
    return process.memoryUsage().heapUsed;
}