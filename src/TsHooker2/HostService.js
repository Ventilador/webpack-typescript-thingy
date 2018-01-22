const ts = require('typescript');
let instance;
module.exports = function Host(options, sys) {
    if (instance) {
        return instance;
    }
    const context = options.context;
    const compilerOptions = options.compilerOptions;
    const filesRegex = options.filesRegex;
    const files = Object.create(null);
    return (instance = {
        getScriptFileNames: getScriptFileNames,
        getScriptVersion: getScriptVersion,
        getScriptSnapshot: getScriptSnapshot,
        getCurrentDirectory: getCurrentDirectory,
        getCompilationSettings: getCompilationSettings,
        resolveTypeReferenceDirectives: resolveTypeReferenceDirectives,
        resolveModuleNames: resolveModuleNames,
        log: console.log,
        fileExists: sys.fileExists,
        readFile: sys.readFile,
        readDirectory: sys.readDirectory,
        getDefaultLibFileName: getDefaultLibFileName,
        useCaseSensitiveFileNames: useCaseSensitiveFileNames,
        getDirectories: sys.getDirectories,
        directoryExists: sys.directoryExists,
        writeFile: writeFile
    });
    function getScriptFileNames() {
        const result = Object.keys(files).filter(RegExp.prototype.test, filesRegex);
        this.getScriptFileNames = function () {
            return result;
        };
        return result;
    }
    function getScriptVersion(fileName) {
        return ensure(fileName).version;
    }
    function getScriptSnapshot(fileName) {
        return ensure(fileName).snapshot;
    }
    function getCurrentDirectory() {
        return context;
    }
    function getCompilationSettings() {
        return compilerOptions;
    }
    function resolveTypeReferenceDirectives(typeDirectiveNames, containingFile) {
        return typeDirectiveNames.map(refMap, containingFile);
    }
    function resolveModuleNames(moduleNames, containingFile) {
        return moduleNames.map(moduleMap, containingFile);
    }
    function getDefaultLibFileName(options) {
        return ts.getDefaultLibFilePath(options);
    }
    function useCaseSensitiveFileNames() {
        return sys.useCaseSensitiveFileNames;
    }
    function moduleMap(module) {
        return ts.resolveModuleName(module, this, compilerOptions, sys).resolvedModule;
    }
    function refMap(directive) {
        return ts.resolveTypeReferenceDirective(directive, this, compilerOptions, sys)
            .resolvedTypeReferenceDirective;
    }
    function writeFile(path, content) {
        sys.writeFile(path, content);

        if (files[path]) {
            files[path].text = content;
            files[path].snapshot.dispose();
            files[path].snapshot = ts.ScriptSnapshot.fromString(content);
            files[path].version++;
        } else {
            ensure(path);
        }
    }
    function ensure(fileName) {
        if (!files[fileName]) {
            const text = sys.readFile(fileName) || '';
            files[fileName] = {
                text,
                version: 1,
                snapshot: ts.ScriptSnapshot.fromString(text)
            };
            this.getScriptFileNames = getScriptFileNames;
        }
        return files[fileName];
    }
};
