const ts = require('typescript');
const { onNextTick } = require('./../utils');

const k = ts.SyntaxKind;
module.exports = function createDocumentRegistry(useCaseSensitiveFileNames, currentDirectory) {
    if (currentDirectory === void 0) { currentDirectory = ""; }
    // Maps from compiler setting target (ES3, ES5, etc.) to all the cached documents we have
    // for those settings.
    var buckets = ts.createMap();
    var getCanonicalFileName = ts.createGetCanonicalFileName(!!useCaseSensitiveFileNames);
    function getKeyForCompilationSettings(settings) {
        return "_" + settings.target + "|" + settings.module + "|" + settings.noResolve + "|" + settings.jsx + "|" + settings.allowJs + "|" + settings.baseUrl + "|" + JSON.stringify(settings.typeRoots) + "|" + JSON.stringify(settings.rootDirs) + "|" + JSON.stringify(settings.paths);
    }
    function getBucketForCompilationSettings(key, createIfMissing) {
        var bucket = buckets.get(key);
        if (!bucket && createIfMissing) {
            buckets.set(key, bucket = ts.createMap());
        }
        return bucket;
    }
    function reportStats() {
        var bucketInfoArray = ts.arrayFrom(buckets.keys()).filter(function (name) { return name && name.charAt(0) === "_"; }).map(function (name) {
            var entries = buckets.get(name);
            var sourceFiles = [];
            entries.forEach(function (entry, name) {
                sourceFiles.push({
                    name: name,
                    refCount: entry.languageServiceRefCount,
                    references: entry.owners.slice(0)
                });
            });
            sourceFiles.sort(function (x, y) { return y.refCount - x.refCount; });
            return {
                bucket: name,
                sourceFiles: sourceFiles
            };
        });
        return JSON.stringify(bucketInfoArray, undefined, 2);
    }
    function acquireDocument(fileName, compilationSettings, scriptSnapshot, version, scriptKind) {
        var path = ts.toPath(fileName, currentDirectory, getCanonicalFileName);
        var key = getKeyForCompilationSettings(compilationSettings);
        return acquireDocumentWithKey(fileName, path, compilationSettings, key, scriptSnapshot, version, scriptKind);
    }
    function acquireDocumentWithKey(fileName, path, compilationSettings, key, scriptSnapshot, version, scriptKind) {
        return acquireOrUpdateDocument(fileName, path, compilationSettings, key, scriptSnapshot, version, /*acquiring*/ true, scriptKind);
    }
    function updateDocument(fileName, compilationSettings, scriptSnapshot, version, scriptKind) {
        var path = ts.toPath(fileName, currentDirectory, getCanonicalFileName);
        var key = getKeyForCompilationSettings(compilationSettings);
        return updateDocumentWithKey(fileName, path, compilationSettings, key, scriptSnapshot, version, scriptKind);
    }
    function updateDocumentWithKey(fileName, path, compilationSettings, key, scriptSnapshot, version, scriptKind) {
        return acquireOrUpdateDocument(fileName, path, compilationSettings, key, scriptSnapshot, version, /*acquiring*/ false, scriptKind);
    }
    function acquireOrUpdateDocument(fileName, path, compilationSettings, key, scriptSnapshot, version, acquiring, scriptKind) {
        var bucket = getBucketForCompilationSettings(key, /*createIfMissing*/ true);
        var entry = bucket.get(path);
        if (!entry) {
            // Have never seen this file with these settings.  Create a new source file for it.
            var sourceFile = ts.createLanguageServiceSourceFile(fileName, scriptSnapshot, compilationSettings.target, version, /*setNodeParents*/ false, scriptKind);
            entry = {
                sourceFile: sourceFile,
                languageServiceRefCount: 1,
                owners: []
            };
            if (!entry.sourceFile.text) {
                entry = entry;
            }
            bucket.set(path, entry);
        }
        else {
            // We have an entry for this file.  However, it may be for a different version of
            // the script snapshot.  If so, update it appropriately.  Otherwise, we can just
            // return it as is.
            if (entry.sourceFile.version !== version) {
                entry.sourceFile = ts.updateLanguageServiceSourceFile(entry.sourceFile, scriptSnapshot, version, scriptSnapshot.getChangeRange(entry.sourceFile.scriptSnapshot));
                if (!entry.sourceFile.text) {
                    entry = entry;
                }
            }
            // If we're acquiring, then this is the first time this LS is asking for this document.
            // Increase our ref count so we know there's another LS using the document.  If we're
            // not acquiring, then that means the LS is 'updating' the file instead, and that means
            // it has already acquired the document previously.  As such, we do not need to increase
            // the ref count.
            if (acquiring) {
                entry.languageServiceRefCount++;
            }
        }

        
        return entry.sourceFile;
    }
    function releaseDocument(fileName, compilationSettings) {
        var path = ts.toPath(fileName, currentDirectory, getCanonicalFileName);
        var key = getKeyForCompilationSettings(compilationSettings);
        return releaseDocumentWithKey(path, key);
    }
    function releaseDocumentWithKey(path, key) {
        var bucket = getBucketForCompilationSettings(key, /*createIfMissing*/ false);
        ts.Debug.assert(bucket !== undefined);
        var entry = bucket.get(path);
        entry.languageServiceRefCount--;
        ts.Debug.assert(entry.languageServiceRefCount >= 0);
        if (entry.languageServiceRefCount === 0) {
            bucket.delete(path);
        }
    }

    return {
        acquireDocument: acquireDocument,
        acquireDocumentWithKey: acquireDocumentWithKey,
        updateDocument: updateDocument,
        updateDocumentWithKey: updateDocumentWithKey,
        releaseDocument: releaseDocument,
        releaseDocumentWithKey: releaseDocumentWithKey,
        reportStats: reportStats,
        getKeyForCompilationSettings: getKeyForCompilationSettings,
        getDependencies: getDependencies
    };






    function getDependencies(file, options, done) {
        var path = ts.toPath(file, currentDirectory, getCanonicalFileName);
        var key = getKeyForCompilationSettings(options);
        var bucket = getBucketForCompilationSettings(key, /*createIfMissing*/ true);
        var entry = bucket.get(path);
        let queued = 0;
        const imports = [];
        const args = [queueVisit, done, imports];
        ts.forEachChild(entry.sourceFile, queueVisit);
        function queueVisit(node) {
            queued++;
            onNextTick(visit, node, args);
        }


        function visit(next, done, importedModules) {
            if (isIn(this.kind, k.ImportDeclaration, k.ImportEqualsDeclaration, k.RequireKeyword, k.CallExpression)) {
                let moduleNameExpr = getExternalModuleName(this);
                if (moduleNameExpr && moduleNameExpr.kind === ts.SyntaxKind.StringLiteral) {
                    importedModules.push((moduleNameExpr).text);
                }
            }

            ts.forEachChild(this, next);
            if (!--queued) {
                done(unique(importedModules));
            }
        }
    }


};

function unique(arr) {
    let length = arr.length;
    const result = [];
    const map = Object.create(null);
    while (length--) {
        const cur = arr[length];
        if (!map[cur]) {
            map[cur] = true;
            result.push(cur);
        }
    }
    return result;
}


function getExternalModuleName(node) {
    if (node.kind === ts.SyntaxKind.ImportDeclaration) {
        return (node).moduleSpecifier;
    }
    if (node.kind === ts.SyntaxKind.ImportEqualsDeclaration) {
        let reference = (node).moduleReference;
        if (reference.kind === ts.SyntaxKind.ExternalModuleReference) {
            return (reference).expression;
        }
    }
    if (node.kind === ts.SyntaxKind.ExportDeclaration) {
        return (node).moduleSpecifier;
    }
    if (node.kind === ts.SyntaxKind.CallExpression && node.expression.escapedText === 'require') {
        return node.arguments[0];
    }
}


function isIn(kind) {
    for (let ii = 1; ii < arguments.length; ii++) {
        if (kind === arguments[ii]) {
            return true;
        }
    }
    return false;
}
