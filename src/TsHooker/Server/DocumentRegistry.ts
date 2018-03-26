import * as ts from './../../typescript';

interface DocumentRegistryEntry {
    sourceFile: ts.SourceFile;

    // The number of language services that this source file is referenced in.   When no more
    // language services are referencing the file, then the file can be removed from the
    // registry.
    languageServiceRefCount: number;
    owners: string[];
}
interface Map<T> extends ts.ReadonlyMap<T> {
    set(key: string, value: T): this;
    delete(key: string): boolean;
    clear(): void;
}

const {
    createMap,
    createGetCanonicalFileName,
    arrayFrom,
    toPath,
    Debug
 } = (ts as any);

export function createDocumentRegistry(useCaseSensitiveFileNames?: boolean, currentDirectory: string = ''): ts.DocumentRegistry {
    // Maps from compiler setting target (ES3, ES5, etc.) to all the cached documents we have
    // for those settings.
    const buckets = createMap() as Map<Map<DocumentRegistryEntry>>;
    const getCanonicalFileName = createGetCanonicalFileName(!!useCaseSensitiveFileNames);

    function getKeyForCompilationSettings(settings: ts.CompilerOptions): ts.DocumentRegistryBucketKey {
        return <ts.DocumentRegistryBucketKey>`_${settings.target}|${settings.module}|${settings.noResolve}|${settings.jsx}|${settings.allowJs}|${settings.baseUrl}|${JSON.stringify(settings.typeRoots)}|${JSON.stringify(settings.rootDirs)}|${JSON.stringify(settings.paths)}`;
    }

    function getBucketForCompilationSettings(key: ts.DocumentRegistryBucketKey, createIfMissing: boolean): Map<DocumentRegistryEntry> {
        let bucket = buckets.get(key);
        if (!bucket && createIfMissing) {
            buckets.set(key, bucket = (createMap() as Map<DocumentRegistryEntry>));
        }
        return bucket;
    }

    function reportStats() {
        const bucketInfoArray = arrayFrom(buckets.keys()).filter(name => name && name.charAt(0) === '_').map(name => {
            const entries = buckets.get(name);
            const sourceFiles: { name: string; refCount: number; references: string[]; }[] = [];
            entries.forEach((entry, name) => {
                sourceFiles.push({
                    name,
                    refCount: entry.languageServiceRefCount,
                    references: entry.owners.slice(0)
                });
            });
            sourceFiles.sort((x, y) => y.refCount - x.refCount);
            return {
                bucket: name,
                sourceFiles
            };
        });
        return JSON.stringify(bucketInfoArray, undefined, 2);
    }

    function acquireDocument(fileName: string, compilationSettings: ts.CompilerOptions, scriptSnapshot: ts.IScriptSnapshot, version: string, scriptKind?: ts.ScriptKind): ts.SourceFile {
        const path = toPath(fileName, currentDirectory, getCanonicalFileName);
        const key = getKeyForCompilationSettings(compilationSettings);
        return acquireDocumentWithKey(fileName, path, compilationSettings, key, scriptSnapshot, version, scriptKind);
    }

    function acquireDocumentWithKey(fileName: string, path: ts.Path, compilationSettings: ts.CompilerOptions, key: ts.DocumentRegistryBucketKey, scriptSnapshot: ts.IScriptSnapshot, version: string, scriptKind?: ts.ScriptKind): ts.SourceFile {
        return acquireOrUpdateDocument(fileName, path, compilationSettings, key, scriptSnapshot, version, /*acquiring*/ true, scriptKind);
    }

    function updateDocument(fileName: string, compilationSettings: ts.CompilerOptions, scriptSnapshot: ts.IScriptSnapshot, version: string, scriptKind?: ts.ScriptKind): ts.SourceFile {
        const path = toPath(fileName, currentDirectory, getCanonicalFileName);
        const key = getKeyForCompilationSettings(compilationSettings);
        return updateDocumentWithKey(fileName, path, compilationSettings, key, scriptSnapshot, version, scriptKind);
    }

    function updateDocumentWithKey(fileName: string, path: ts.Path, compilationSettings: ts.CompilerOptions, key: ts.DocumentRegistryBucketKey, scriptSnapshot: ts.IScriptSnapshot, version: string, scriptKind?: ts.ScriptKind): ts.SourceFile {
        return acquireOrUpdateDocument(fileName, path, compilationSettings, key, scriptSnapshot, version, /*acquiring*/ false, scriptKind);
    }

    function acquireOrUpdateDocument(
        fileName: string,
        path: ts.Path,
        compilationSettings: ts.CompilerOptions,
        key: ts.DocumentRegistryBucketKey,
        scriptSnapshot: ts.IScriptSnapshot,
        version: string,
        acquiring: boolean,
        scriptKind?: ts.ScriptKind): ts.SourceFile {

        const bucket = getBucketForCompilationSettings(key, /*createIfMissing*/ true);
        let entry = bucket.get(path);
        if (!entry) {
            // Have never seen this file with these settings.  Create a new source file for it.
            const sourceFile = ts.createLanguageServiceSourceFile(fileName, scriptSnapshot, compilationSettings.target, version, /*setNodeParents*/ false, scriptKind);

            entry = {
                sourceFile,
                languageServiceRefCount: 1,
                owners: []
            };
            bucket.set(path, entry);
        } else {
            // We have an entry for this file.  However, it may be for a different version of
            // the script snapshot.  If so, update it appropriately.  Otherwise, we can just
            // return it as is.
            if ((entry.sourceFile as any).version !== version) {
                entry.sourceFile = ts.updateLanguageServiceSourceFile(entry.sourceFile, scriptSnapshot, version,
                    scriptSnapshot.getChangeRange((entry.sourceFile as any).scriptSnapshot));
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

    function releaseDocument(fileName: string, compilationSettings: ts.CompilerOptions): void {
        const path = _toPath(fileName);
        const key = getKeyForCompilationSettings(compilationSettings);
        return releaseDocumentWithKey(path, key);
    }

    function _toPath(fileName: string) {
        return toPath(fileName, currentDirectory, getCanonicalFileName);
    }

    function releaseDocumentWithKey(path: ts.Path, key: ts.DocumentRegistryBucketKey): void {
        const bucket = getBucketForCompilationSettings(key, /*createIfMissing*/ false);
        Debug.assert(bucket !== undefined);

        const entry = bucket.get(path);
        entry.languageServiceRefCount--;

        Debug.assert(entry.languageServiceRefCount >= 0);
        if (entry.languageServiceRefCount === 0) {
            bucket.delete(path);
        }
    }

    return {
        acquireDocument,
        acquireDocumentWithKey,
        updateDocument,
        updateDocumentWithKey,
        releaseDocument,
        releaseDocumentWithKey,
        reportStats,
        getKeyForCompilationSettings,
        toPath: _toPath
    } as any;
}
