const ts = require('typescript');
const createTypeChecker = require('./createTypeChecker');
// const onNextTick = require('./../utils').onNextTick;
const ignoreDiagnosticCommentRegEx = /(^\s*$)|(^\s*\/\/\/?\s*(@ts-ignore)?)/;
var SeenPackageName;
(function (SeenPackageName) {
    SeenPackageName[SeenPackageName.Exists = 0] = "Exists";
    SeenPackageName[SeenPackageName.Modified = 1] = "Modified";
})(SeenPackageName || (SeenPackageName = {}));
module.exports = function createProgram(rootNames, options, host, oldProgram) {
    var program;
    var files = [];
    var commonSourceDirectory;
    var diagnosticsProducingTypeChecker;
    var noDiagnosticsTypeChecker;
    var classifiableNames;
    var modifiedFilePaths;
    var cachedSemanticDiagnosticsForFile = {};
    var cachedDeclarationDiagnosticsForFile = {};
    var resolvedTypeReferenceDirectives = ts.createMap();
    var fileProcessingDiagnostics = ts.createDiagnosticCollection();
    // The below settings are to track if a .js file should be add to the program if loaded via searching under node_modules.
    // This works as imported modules are discovered recursively in a depth first manner, specifically:
    // - For each root file, findSourceFile is called.
    // - This calls processImportedModules for each module imported in the source file.
    // - This calls resolveModuleNames, and then calls findSourceFile for each resolved module.
    // As all these operations happen - and are nested - within the createProgram call, they close over the below variables.
    // The current resolution depth is tracked by incrementing/decrementing as the depth first search progresses.
    var maxNodeModuleJsDepth = typeof options.maxNodeModuleJsDepth === "number" ? options.maxNodeModuleJsDepth : 0;
    var currentNodeModulesDepth = 0;
    // If a module has some of its imports skipped due to being at the depth limit under node_modules, then track
    // this, as it may be imported at a shallower depth later, and then it will need its skipped imports processed.
    var modulesWithElidedImports = ts.createMap();
    // Track source files that are source files found by searching under node_modules, as these shouldn't be compiled.
    var sourceFilesFoundSearchingNodeModules = ts.createMap();
    ts.performance.mark("beforeProgram");
    host = host || ts.createCompilerHost(options);
    var skipDefaultLib = options.noLib;
    var getDefaultLibraryFileName = ts.memoize(function () { return host.getDefaultLibFileName(options); });
    var defaultLibraryPath = host.getDefaultLibLocation ? host.getDefaultLibLocation() : ts.getDirectoryPath(getDefaultLibraryFileName());
    var programDiagnostics = ts.createDiagnosticCollection();
    var currentDirectory = host.getCurrentDirectory();
    var supportedExtensions = ts.getSupportedExtensions(options);
    // Map storing if there is emit blocking diagnostics for given input
    var hasEmitBlockingDiagnostics = ts.createMap();
    var _compilerOptionsObjectLiteralSyntax;
    var moduleResolutionCache;
    var resolveModuleNamesWorker;
    var hasInvalidatedResolution = host.hasInvalidatedResolution || ts.returnFalse;
    if (host.resolveModuleNames) {
        resolveModuleNamesWorker = function (moduleNames, containingFile, reusedNames) {
            return host.resolveModuleNames(checkAllDefined(moduleNames), containingFile, reusedNames).map(function (resolved) {
                // An older host may have omitted extension, in which case we should infer it from the file extension of resolvedFileName.
                if (!resolved || resolved.extension !== undefined) {
                    return resolved;
                }
                var withExtension = ts.clone(resolved);
                withExtension.extension = ts.extensionFromPath(resolved.resolvedFileName);
                return withExtension;
            });
        };
    }
    else {
        moduleResolutionCache = ts.createModuleResolutionCache(currentDirectory, function (x) { return host.getCanonicalFileName(x); });
        var loader_1 = function (moduleName, containingFile) { return ts.resolveModuleName(moduleName, containingFile, options, host, moduleResolutionCache).resolvedModule; };
        resolveModuleNamesWorker = function (moduleNames, containingFile) { return loadWithLocalCache(checkAllDefined(moduleNames), containingFile, loader_1); };
    }
    var resolveTypeReferenceDirectiveNamesWorker;
    if (host.resolveTypeReferenceDirectives) {
        resolveTypeReferenceDirectiveNamesWorker = function (typeDirectiveNames, containingFile) { return host.resolveTypeReferenceDirectives(checkAllDefined(typeDirectiveNames), containingFile); };
    }
    else {
        var loader_2 = function (typesRef, containingFile) { return ts.resolveTypeReferenceDirective(typesRef, containingFile, options, host).resolvedTypeReferenceDirective; };
        resolveTypeReferenceDirectiveNamesWorker = function (typeReferenceDirectiveNames, containingFile) { return loadWithLocalCache(checkAllDefined(typeReferenceDirectiveNames), containingFile, loader_2); };
    }
    // Map from a stringified PackageId to the source file with that id.
    // Only one source file may have a given packageId. Others become redirects (see createRedirectSourceFile).
    // `packageIdToSourceFile` is only used while building the program, while `sourceFileToPackageName` and `isSourceFileTargetOfRedirect` are kept around.
    var packageIdToSourceFile = ts.createMap();
    // Maps from a SourceFile's `.path` to the name of the package it was imported with.
    var sourceFileToPackageName = ts.createMap();
    // See `sourceFileIsRedirectedTo`.
    var redirectTargetsSet = ts.createMap();
    var filesByName = ts.createMap();
    var missingFilePaths;
    // stores 'filename -> file association' ignoring case
    // used to track cases when two file names differ only in casing
    var filesByNameIgnoreCase = host.useCaseSensitiveFileNames() ? ts.createMap() : undefined;
    var shouldCreateNewSourceFile = shouldProgramCreateNewSourceFiles(oldProgram, options);
    var structuralIsReused = tryReuseStructureFromOldProgram();
    ts.forEach(rootNames, function (name) { return processRootFile(name, /*isDefaultLib*/ false); });
    if (structuralIsReused !== 2 /* Completely */) {
        // load type declarations specified via 'types' argument or implicitly from types/ and node_modules/@types folders
        var typeReferences = ts.getAutomaticTypeDirectiveNames(options, host);
        if (typeReferences.length) {
            // This containingFilename needs to match with the one used in managed-side
            var containingDirectory = options.configFilePath ? ts.getDirectoryPath(options.configFilePath) : host.getCurrentDirectory();
            var containingFilename = ts.combinePaths(containingDirectory, "__inferred type names__.ts");
            var resolutions = resolveTypeReferenceDirectiveNamesWorker(typeReferences, containingFilename);
            for (var i = 0; i < typeReferences.length; i++) {
                processTypeReferenceDirective(typeReferences[i], resolutions[i]);
            }
        }
        // Do not process the default library if:
        //  - The '--noLib' flag is used.
        //  - A 'no-default-lib' reference comment is encountered in
        //      processing the root files.
        if (!skipDefaultLib) {
            // If '--lib' is not specified, include default library file according to '--target'
            // otherwise, using options specified in '--lib' instead of '--target' default library file
            if (!options.lib) {
                processRootFile(getDefaultLibraryFileName(), /*isDefaultLib*/ true);
            }
            else {
                ts.forEach(options.lib, function (libFileName) {
                    processRootFile(ts.combinePaths(defaultLibraryPath, libFileName), /*isDefaultLib*/ true);
                });
            }
        }
        missingFilePaths = ts.arrayFrom(filesByName.keys(), function (p) { return p; }).filter(function (p) { return !filesByName.get(p); });
    }
    ts.Debug.assert(!!missingFilePaths);
    // unconditionally set moduleResolutionCache to undefined to avoid unnecessary leaks
    moduleResolutionCache = undefined;
    // Release any files we have acquired in the old program but are
    // not part of the new program.
    if (oldProgram && host.onReleaseOldSourceFile) {
        var oldSourceFiles = oldProgram.getSourceFiles();
        for (var _i = 0, oldSourceFiles_1 = oldSourceFiles; _i < oldSourceFiles_1.length; _i++) {
            var oldSourceFile = oldSourceFiles_1[_i];
            if (!getSourceFile(oldSourceFile.path) || shouldCreateNewSourceFile) {
                host.onReleaseOldSourceFile(oldSourceFile, oldProgram.getCompilerOptions());
            }
        }
    }
    // unconditionally set oldProgram to undefined to prevent it from being captured in closure
    oldProgram = undefined;
    program = {
        getFilesReference: function () { return filesByName; },
        getRootFileNames: function () { return rootNames; },
        getSourceFile: getSourceFile,
        getSourceFileByPath: getSourceFileByPath,
        getSourceFiles: function () { return files; },
        getMissingFilePaths: function () { return missingFilePaths; },
        getCompilerOptions: function () { return options; },
        getSyntacticDiagnostics: getSyntacticDiagnostics,
        getOptionsDiagnostics: getOptionsDiagnostics,
        getGlobalDiagnostics: getGlobalDiagnostics,
        getSemanticDiagnostics: getSemanticDiagnostics,
        getDeclarationDiagnostics: getDeclarationDiagnostics,
        getTypeChecker: getTypeChecker,
        getClassifiableNames: getClassifiableNames,
        getDiagnosticsProducingTypeChecker: getDiagnosticsProducingTypeChecker,
        getCommonSourceDirectory: getCommonSourceDirectory,
        emit: emit,
        getCurrentDirectory: function () { return currentDirectory; },
        getNodeCount: function () { return getDiagnosticsProducingTypeChecker().getNodeCount(); },
        getIdentifierCount: function () { return getDiagnosticsProducingTypeChecker().getIdentifierCount(); },
        getSymbolCount: function () { return getDiagnosticsProducingTypeChecker().getSymbolCount(); },
        getTypeCount: function () { return getDiagnosticsProducingTypeChecker().getTypeCount(); },
        getFileProcessingDiagnostics: function () { return fileProcessingDiagnostics; },
        getResolvedTypeReferenceDirectives: function () { return resolvedTypeReferenceDirectives; },
        isSourceFileFromExternalLibrary: isSourceFileFromExternalLibrary,
        isSourceFileDefaultLibrary: isSourceFileDefaultLibrary,
        dropDiagnosticsProducingTypeChecker: dropDiagnosticsProducingTypeChecker,
        getSourceFileFromReference: getSourceFileFromReference,
        sourceFileToPackageName: sourceFileToPackageName,
        redirectTargetsSet: redirectTargetsSet
    };
    verifyCompilerOptions();
    ts.performance.mark("afterProgram");
    ts.performance.measure("Program", "beforeProgram", "afterProgram");
    return program;
    function toPath(fileName) {
        return ts.toPath(fileName, currentDirectory, getCanonicalFileName);
    }
    function getCommonSourceDirectory() {
        if (commonSourceDirectory === undefined) {
            var emittedFiles = ts.filter(files, function (file) { return ts.sourceFileMayBeEmitted(file, options, isSourceFileFromExternalLibrary); });
            if (options.rootDir && checkSourceFilesBelongToPath(emittedFiles, options.rootDir)) {
                // If a rootDir is specified and is valid use it as the commonSourceDirectory
                commonSourceDirectory = ts.getNormalizedAbsolutePath(options.rootDir, currentDirectory);
            }
            else {
                commonSourceDirectory = computeCommonSourceDirectory(emittedFiles);
            }
            if (commonSourceDirectory && commonSourceDirectory[commonSourceDirectory.length - 1] !== ts.directorySeparator) {
                // Make sure directory path ends with directory separator so this string can directly
                // used to replace with "" to get the relative path of the source file and the relative path doesn't
                // start with / making it rooted path
                commonSourceDirectory += ts.directorySeparator;
            }
        }
        return commonSourceDirectory;
    }
    function getClassifiableNames() {
        if (!classifiableNames) {
            // Initialize a checker so that all our files are bound.
            getTypeChecker();
            classifiableNames = ts.createUnderscoreEscapedMap();
            for (var _i = 0, files_2 = files; _i < files_2.length; _i++) {
                var sourceFile = files_2[_i];
                ts.copyEntries(sourceFile.classifiableNames, classifiableNames);
            }
        }
        return classifiableNames;
    }
    function resolveModuleNamesReusingOldState(moduleNames, containingFile, file, oldProgramState) {
        if (structuralIsReused === 0 /* Not */ && !file.ambientModuleNames.length) {
            // If the old program state does not permit reusing resolutions and `file` does not contain locally defined ambient modules,
            // the best we can do is fallback to the default logic.
            return resolveModuleNamesWorker(moduleNames, containingFile);
        }
        var oldSourceFile = oldProgramState.program && oldProgramState.program.getSourceFile(containingFile);
        if (oldSourceFile !== file && file.resolvedModules) {
            // `file` was created for the new program.
            //
            // We only set `file.resolvedModules` via work from the current function,
            // so it is defined iff we already called the current function on `file`.
            // That call happened no later than the creation of the `file` object,
            // which per above occured during the current program creation.
            // Since we assume the filesystem does not change during program creation,
            // it is safe to reuse resolutions from the earlier call.
            var result_4 = [];
            for (var _i = 0, moduleNames_1 = moduleNames; _i < moduleNames_1.length; _i++) {
                var moduleName = moduleNames_1[_i];
                var resolvedModule = file.resolvedModules.get(moduleName);
                result_4.push(resolvedModule);
            }
            return result_4;
        }
        // At this point, we know at least one of the following hold:
        // - file has local declarations for ambient modules
        // - old program state is available
        // With this information, we can infer some module resolutions without performing resolution.
        /** An ordered list of module names for which we cannot recover the resolution. */
        var unknownModuleNames;
        /**
         * The indexing of elements in this list matches that of `moduleNames`.
         *
         * Before combining results, result[i] is in one of the following states:
         * * undefined: needs to be recomputed,
         * * predictedToResolveToAmbientModuleMarker: known to be an ambient module.
         * Needs to be reset to undefined before returning,
         * * ResolvedModuleFull instance: can be reused.
         */
        var result;
        var reusedNames;
        /** A transient placeholder used to mark predicted resolution in the result list. */
        var predictedToResolveToAmbientModuleMarker = {};
        for (let i = 0; i < moduleNames.length; i++) {
            let moduleName = moduleNames[i];
            // If the source file is unchanged and doesnt have invalidated resolution, reuse the module resolutions
            if (file === oldSourceFile && !hasInvalidatedResolution(oldSourceFile.path)) {
                var oldResolvedModule = oldSourceFile && oldSourceFile.resolvedModules.get(moduleName);
                if (oldResolvedModule) {
                    if (ts.isTraceEnabled(options, host)) {
                        ts.trace(host, ts.Diagnostics.Reusing_resolution_of_module_0_to_file_1_from_old_program, moduleName, containingFile);
                    }
                    (result || (result = new Array(moduleNames.length)))[i] = oldResolvedModule;
                    (reusedNames || (reusedNames = [])).push(moduleName);
                    continue;
                }
            }
            // We know moduleName resolves to an ambient module provided that moduleName:
            // - is in the list of ambient modules locally declared in the current source file.
            // - resolved to an ambient module in the old program whose declaration is in an unmodified file
            //   (so the same module declaration will land in the new program)
            var resolvesToAmbientModuleInNonModifiedFile = false;
            if (ts.contains(file.ambientModuleNames, moduleName)) {
                resolvesToAmbientModuleInNonModifiedFile = true;
                if (ts.isTraceEnabled(options, host)) {
                    ts.trace(host, ts.Diagnostics.Module_0_was_resolved_as_locally_declared_ambient_module_in_file_1, moduleName, containingFile);
                }
            }
            else {
                resolvesToAmbientModuleInNonModifiedFile = moduleNameResolvesToAmbientModuleInNonModifiedFile(moduleName, oldProgramState);
            }
            if (resolvesToAmbientModuleInNonModifiedFile) {
                (result || (result = new Array(moduleNames.length)))[i] = predictedToResolveToAmbientModuleMarker;
            }
            else {
                // Resolution failed in the old program, or resolved to an ambient module for which we can't reuse the result.
                (unknownModuleNames || (unknownModuleNames = [])).push(moduleName);
            }
        }
        var resolutions = unknownModuleNames && unknownModuleNames.length ? resolveModuleNamesWorker(unknownModuleNames, containingFile, reusedNames) : ts.emptyArray;
        // Combine results of resolutions and predicted results
        if (!result) {
            // There were no unresolved/ambient resolutions.
            ts.Debug.assert(resolutions.length === moduleNames.length);
            return resolutions;
        }
        var j = 0;
        for (let i = 0; i < result.length; i++) {
            if (result[i]) {
                // `result[i]` is either a `ResolvedModuleFull` or a marker.
                // If it is the former, we can leave it as is.
                if (result[i] === predictedToResolveToAmbientModuleMarker) {
                    result[i] = undefined;
                }
            }
            else {
                result[i] = resolutions[j];
                j++;
            }
        }
        ts.Debug.assert(j === resolutions.length);
        return result;
        // If we change our policy of rechecking failed lookups on each program create,
        // we should adjust the value returned here.
        function moduleNameResolvesToAmbientModuleInNonModifiedFile(moduleName, oldProgramState) {
            var resolutionToFile = ts.getResolvedModule(oldProgramState.file, moduleName);
            if (resolutionToFile) {
                // module used to be resolved to file - ignore it
                return false;
            }
            var ambientModule = oldProgramState.program && oldProgramState.program.getTypeChecker().tryFindAmbientModuleWithoutAugmentations(moduleName);
            if (!(ambientModule && ambientModule.declarations)) {
                return false;
            }
            // at least one of declarations should come from non-modified source file
            var firstUnmodifiedFile = ts.forEach(ambientModule.declarations, function (d) {
                var f = ts.getSourceFileOfNode(d);
                return !ts.contains(oldProgramState.modifiedFilePaths, f.path) && f;
            });
            if (!firstUnmodifiedFile) {
                return false;
            }
            if (ts.isTraceEnabled(options, host)) {
                ts.trace(host, ts.Diagnostics.Module_0_was_resolved_as_ambient_module_declared_in_1_since_this_file_was_not_modified, moduleName, firstUnmodifiedFile.fileName);
            }
            return true;
        }
    }
    function tryReuseStructureFromOldProgram() {
        if (!oldProgram) {
            return 0 /* Not */;
        }
        // check properties that can affect structure of the program or module resolution strategy
        // if any of these properties has changed - structure cannot be reused
        var oldOptions = oldProgram.getCompilerOptions();
        if (ts.changesAffectModuleResolution(oldOptions, options)) {
            return (oldProgram.structureIsReused = 0) /* Not */;
        }
        ts.Debug.assert(!(oldProgram.structureIsReused & (2 /* Completely */ | 1 /* SafeModules */))); // jshint ignore:line
        // there is an old program, check if we can reuse its structure
        var oldRootNames = oldProgram.getRootFileNames();
        if (!ts.arrayIsEqualTo(oldRootNames, rootNames)) {
            return oldProgram.structureIsReused = 0 /* Not */; // jshint ignore:line
        }
        if (!ts.arrayIsEqualTo(options.types, oldOptions.types)) {
            return oldProgram.structureIsReused = 0 /* Not */; // jshint ignore:line
        }
        // check if program source files has changed in the way that can affect structure of the program
        var newSourceFiles = [];
        var filePaths = [];
        var modifiedSourceFiles = [];
        oldProgram.structureIsReused = 2 /* Completely */;
        // If the missing file paths are now present, it can change the progam structure,
        // and hence cant reuse the structure.
        // This is same as how we dont reuse the structure if one of the file from old program is now missing
        if (oldProgram.getMissingFilePaths().some(function (missingFilePath) { return host.fileExists(missingFilePath); })) {
            return oldProgram.structureIsReused = 0 /* Not */;// jshint ignore:line
        }
        var oldSourceFiles = oldProgram.getSourceFiles();

        var seenPackageNames = ts.createMap();
        for (var _i = 0, oldSourceFiles_2 = oldSourceFiles; _i < oldSourceFiles_2.length; _i++) {
            var oldSourceFile = oldSourceFiles_2[_i];
            var newSourceFile = host.getSourceFileByPath
                ? host.getSourceFileByPath(oldSourceFile.fileName, oldSourceFile.path, options.target, /*onError*/ undefined, shouldCreateNewSourceFile)// jshint ignore:line
                : host.getSourceFile(oldSourceFile.fileName, options.target, /*onError*/ undefined, shouldCreateNewSourceFile);
            if (!newSourceFile) {
                return oldProgram.structureIsReused = 0 /* Not */;// jshint ignore:line
            }
            ts.Debug.assert(!newSourceFile.redirectInfo, "Host should not return a redirect source file from `getSourceFile`");
            var fileChanged = void 0;
            if (oldSourceFile.redirectInfo) {
                // We got `newSourceFile` by path, so it is actually for the unredirected file.
                // This lets us know if the unredirected file has changed. If it has we should break the redirect.
                if (newSourceFile !== oldSourceFile.redirectInfo.unredirected) {
                    // Underlying file has changed. Might not redirect anymore. Must rebuild program.
                    return oldProgram.structureIsReused = 0 /* Not */;// jshint ignore:line
                }
                fileChanged = false;
                newSourceFile = oldSourceFile; // Use the redirect.
            }
            else if (oldProgram.redirectTargetsSet.has(oldSourceFile.path)) {
                // If a redirected-to source file changes, the redirect may be broken.
                if (newSourceFile !== oldSourceFile) {
                    return oldProgram.structureIsReused = 0 /* Not */;// jshint ignore:line
                }
                fileChanged = false;
            }
            else {
                fileChanged = newSourceFile !== oldSourceFile;
            }
            newSourceFile.path = oldSourceFile.path;
            filePaths.push(newSourceFile.path);
            var packageName = oldProgram.sourceFileToPackageName.get(oldSourceFile.path);
            if (packageName !== undefined) {
                // If there are 2 different source files for the same package name and at least one of them changes,
                // they might become redirects. So we must rebuild the program.
                var prevKind = seenPackageNames.get(packageName);
                var newKind = fileChanged ? 1 /* Modified */ : 0 /* Exists */;
                if ((prevKind !== undefined && newKind === 1 /* Modified */) || prevKind === 1 /* Modified */) {
                    return oldProgram.structureIsReused = 0 /* Not */; // jshint ignore:line
                }
                seenPackageNames.set(packageName, newKind);
            }
            if (fileChanged) {
                // The `newSourceFile` object was created for the new program.
                if (oldSourceFile.hasNoDefaultLib !== newSourceFile.hasNoDefaultLib) {
                    // value of no-default-lib has changed
                    // this will affect if default library is injected into the list of files
                    oldProgram.structureIsReused = 1 /* SafeModules */;
                }
                // check tripleslash references
                if (!ts.arrayIsEqualTo(oldSourceFile.referencedFiles, newSourceFile.referencedFiles, fileReferenceIsEqualTo)) {
                    // tripleslash references has changed
                    oldProgram.structureIsReused = 1 /* SafeModules */;
                }
                // check imports and module augmentations
                collectExternalModuleReferences(newSourceFile);
                if (!ts.arrayIsEqualTo(oldSourceFile.imports, newSourceFile.imports, moduleNameIsEqualTo)) {
                    // imports has changed
                    oldProgram.structureIsReused = 1 /* SafeModules */;
                }
                if (!ts.arrayIsEqualTo(oldSourceFile.moduleAugmentations, newSourceFile.moduleAugmentations, moduleNameIsEqualTo)) {
                    // moduleAugmentations has changed
                    oldProgram.structureIsReused = 1 /* SafeModules */;
                }
                if ((oldSourceFile.flags & 524288 /* PossiblyContainsDynamicImport */) !== (newSourceFile.flags & 524288 /* PossiblyContainsDynamicImport */)) { // jshint ignore:line
                    // dynamicImport has changed
                    oldProgram.structureIsReused = 1 /* SafeModules */;
                }
                if (!ts.arrayIsEqualTo(oldSourceFile.typeReferenceDirectives, newSourceFile.typeReferenceDirectives, fileReferenceIsEqualTo)) {
                    // 'types' references has changed
                    oldProgram.structureIsReused = 1 /* SafeModules */;
                }
                // tentatively approve the file
                modifiedSourceFiles.push({ oldFile: oldSourceFile, newFile: newSourceFile });
            }
            else if (hasInvalidatedResolution(oldSourceFile.path)) {
                // 'module/types' references could have changed
                oldProgram.structureIsReused = 1 /* SafeModules */;
                // add file to the modified list so that we will resolve it later
                modifiedSourceFiles.push({ oldFile: oldSourceFile, newFile: newSourceFile });
            }
            // if file has passed all checks it should be safe to reuse it
            newSourceFiles.push(newSourceFile);
        }
        if (oldProgram.structureIsReused !== 2 /* Completely */) {
            return oldProgram.structureIsReused;
        }
        modifiedFilePaths = modifiedSourceFiles.map(function (f) { return f.newFile.path; });
        // try to verify results of module resolution
        for (var _a = 0, modifiedSourceFiles_1 = modifiedSourceFiles; _a < modifiedSourceFiles_1.length; _a++) {
            let _b = modifiedSourceFiles_1[_a], oldSourceFile = _b.oldFile, newSourceFile = _b.newFile;
            var newSourceFilePath = ts.getNormalizedAbsolutePath(newSourceFile.fileName, currentDirectory);
            if (resolveModuleNamesWorker) {
                var moduleNames = getModuleNames(newSourceFile);
                var oldProgramState = { program: oldProgram, file: oldSourceFile, modifiedFilePaths: modifiedFilePaths };
                var resolutions = resolveModuleNamesReusingOldState(moduleNames, newSourceFilePath, newSourceFile, oldProgramState);
                // ensure that module resolution results are still correct
                var resolutionsChanged = ts.hasChangesInResolutions(moduleNames, resolutions, oldSourceFile.resolvedModules, ts.moduleResolutionIsEqualTo);
                if (resolutionsChanged) {
                    oldProgram.structureIsReused = 1 /* SafeModules */;
                    newSourceFile.resolvedModules = ts.zipToMap(moduleNames, resolutions);
                }
                else {
                    newSourceFile.resolvedModules = oldSourceFile.resolvedModules;
                }
            }
            if (resolveTypeReferenceDirectiveNamesWorker) {
                var typesReferenceDirectives = ts.map(newSourceFile.typeReferenceDirectives, function (x) { return x.fileName; });
                let resolutions = resolveTypeReferenceDirectiveNamesWorker(typesReferenceDirectives, newSourceFilePath);
                // ensure that types resolutions are still correct
                let resolutionsChanged = ts.hasChangesInResolutions(typesReferenceDirectives, resolutions, oldSourceFile.resolvedTypeReferenceDirectiveNames, ts.typeDirectiveIsEqualTo);
                if (resolutionsChanged) {
                    oldProgram.structureIsReused = 1 /* SafeModules */;
                    newSourceFile.resolvedTypeReferenceDirectiveNames = ts.zipToMap(typesReferenceDirectives, resolutions);
                }
                else {
                    newSourceFile.resolvedTypeReferenceDirectiveNames = oldSourceFile.resolvedTypeReferenceDirectiveNames;
                }
            }
        }
        if (oldProgram.structureIsReused !== 2 /* Completely */) {
            return oldProgram.structureIsReused;
        }
        if (host.hasChangedAutomaticTypeDirectiveNames) {
            return oldProgram.structureIsReused = 1 /* SafeModules */; // jshint ignore:line
        }
        missingFilePaths = oldProgram.getMissingFilePaths();
        // update fileName -> file mapping
        for (var i = 0; i < newSourceFiles.length; i++) {
            filesByName.set(filePaths[i], newSourceFiles[i]);
            // Set the file as found during node modules search if it was found that way in old progra,
            if (oldProgram.isSourceFileFromExternalLibrary(oldProgram.getSourceFileByPath(filePaths[i]))) {
                sourceFilesFoundSearchingNodeModules.set(filePaths[i], true);
            }
        }
        files = newSourceFiles;
        fileProcessingDiagnostics = oldProgram.getFileProcessingDiagnostics();
        for (var _c = 0, modifiedSourceFiles_2 = modifiedSourceFiles; _c < modifiedSourceFiles_2.length; _c++) {
            var modifiedFile = modifiedSourceFiles_2[_c];
            fileProcessingDiagnostics.reattachFileDiagnostics(modifiedFile.newFile);
        }
        resolvedTypeReferenceDirectives = oldProgram.getResolvedTypeReferenceDirectives();
        sourceFileToPackageName = oldProgram.sourceFileToPackageName;
        redirectTargetsSet = oldProgram.redirectTargetsSet;
        return oldProgram.structureIsReused = 2 /* Completely */; // jshint ignore:line
    }
    function getEmitHost(writeFileCallback) {
        return {
            getCanonicalFileName: getCanonicalFileName,
            getCommonSourceDirectory: program.getCommonSourceDirectory,
            getCompilerOptions: program.getCompilerOptions,
            getCurrentDirectory: function () { return currentDirectory; },
            getNewLine: function () { return host.getNewLine(); },
            getSourceFile: program.getSourceFile,
            getSourceFileByPath: program.getSourceFileByPath,
            getSourceFiles: program.getSourceFiles,
            isSourceFileFromExternalLibrary: isSourceFileFromExternalLibrary,
            writeFile: writeFileCallback || (function (fileName, data, writeByteOrderMark, onError, sourceFiles) { return host.writeFile(fileName, data, writeByteOrderMark, onError, sourceFiles); }),
            isEmitBlocked: isEmitBlocked,
        };
    }
    function isSourceFileFromExternalLibrary(file) {
        return sourceFilesFoundSearchingNodeModules.get(file.path);
    }
    function isSourceFileDefaultLibrary(file) {
        if (file.hasNoDefaultLib) {
            return true;
        }
        if (!options.noLib) {
            return false;
        }
        // If '--lib' is not specified, include default library file according to '--target'
        // otherwise, using options specified in '--lib' instead of '--target' default library file
        if (!options.lib) {
            return ts.compareStrings(file.fileName, getDefaultLibraryFileName(), /*ignoreCase*/ !host.useCaseSensitiveFileNames()) === 0 /* EqualTo */;
        }
        else {
            return ts.forEach(options.lib, function (libFileName) { return ts.compareStrings(file.fileName, ts.combinePaths(defaultLibraryPath, libFileName), /*ignoreCase*/ !host.useCaseSensitiveFileNames()) === 0 /* EqualTo */; });
        }
    }
    function getDiagnosticsProducingTypeChecker() {
        return diagnosticsProducingTypeChecker || (diagnosticsProducingTypeChecker = createTypeChecker(program, /*produceDiagnostics:*/ true));
    }
    function dropDiagnosticsProducingTypeChecker() {
        diagnosticsProducingTypeChecker = undefined;
    }
    function getTypeChecker() {
        return noDiagnosticsTypeChecker || (noDiagnosticsTypeChecker = createTypeChecker(program, /*produceDiagnostics:*/ false));
    }
    function emit(sourceFile, writeFileCallback, cancellationToken, emitOnlyDtsFiles, transformers) {
        return runWithCancellationToken(function () { return emitWorker(program, sourceFile, writeFileCallback, cancellationToken, emitOnlyDtsFiles, transformers); });
    }
    function isEmitBlocked(emitFileName) {
        return hasEmitBlockingDiagnostics.has(toPath(emitFileName));
    }
    function emitWorker(program, sourceFile, writeFileCallback, cancellationToken, emitOnlyDtsFiles, customTransformers) {
        var declarationDiagnostics = [];
        if (options.noEmit) {
            return { diagnostics: declarationDiagnostics, sourceMaps: undefined, emittedFiles: undefined, emitSkipped: true };
        }
        // If the noEmitOnError flag is set, then check if we have any errors so far.  If so,
        // immediately bail out.  Note that we pass 'undefined' for 'sourceFile' so that we
        // get any preEmit diagnostics, not just the ones
        if (options.noEmitOnError) {
            var diagnostics = program.getOptionsDiagnostics(cancellationToken).concat(program.getSyntacticDiagnostics(sourceFile, cancellationToken), program.getGlobalDiagnostics(cancellationToken), program.getSemanticDiagnostics(sourceFile, cancellationToken));
            if (diagnostics.length === 0 && program.getCompilerOptions().declaration) {
                declarationDiagnostics = program.getDeclarationDiagnostics(/*sourceFile*/ undefined, cancellationToken);
            }
            if (diagnostics.length > 0 || declarationDiagnostics.length > 0) {
                return {
                    diagnostics: ts.concatenate(diagnostics, declarationDiagnostics),
                    sourceMaps: undefined,
                    emittedFiles: undefined,
                    emitSkipped: true
                };
            }
        }
        // Create the emit resolver outside of the "emitTime" tracking code below.  That way
        // any cost associated with it (like type checking) are appropriate associated with
        // the type-checking counter.
        //
        // If the -out option is specified, we should not pass the source file to getEmitResolver.
        // This is because in the -out scenario all files need to be emitted, and therefore all
        // files need to be type checked. And the way to specify that all files need to be type
        // checked is to not pass the file to getEmitResolver.
        var emitResolver = getDiagnosticsProducingTypeChecker().getEmitResolver((options.outFile || options.out) ? undefined : sourceFile);
        ts.performance.mark("beforeEmit");
        var transformers = emitOnlyDtsFiles ? [] : ts.getTransformers(options, customTransformers);
        var emitResult = ts.emitFiles(emitResolver, getEmitHost(writeFileCallback), sourceFile, emitOnlyDtsFiles, transformers);
        ts.performance.mark("afterEmit");
        ts.performance.measure("Emit", "beforeEmit", "afterEmit");
        return emitResult;
    }
    function getSourceFile(fileName) {
        return getSourceFileByPath(toPath(fileName));
    }
    function getSourceFileByPath(path) {
        return filesByName.get(path);
    }
    function getDiagnosticsHelper(sourceFile, getDiagnostics, cancellationToken) {
        if (sourceFile) {
            return getDiagnostics(sourceFile, cancellationToken);
        }
        return ts.sortAndDeduplicateDiagnostics(ts.flatMap(program.getSourceFiles(), function (sourceFile) {
            if (cancellationToken) {
                cancellationToken.throwIfCancellationRequested();
            }
            return getDiagnostics(sourceFile, cancellationToken);
        }));
    }
    function getSyntacticDiagnostics(sourceFile, cancellationToken) {
        return getDiagnosticsHelper(sourceFile, getSyntacticDiagnosticsForFile, cancellationToken);
    }
    function getSemanticDiagnostics(sourceFile, cancellationToken) {
        return getDiagnosticsHelper(sourceFile, getSemanticDiagnosticsForFile, cancellationToken);
    }
    function getDeclarationDiagnostics(sourceFile, cancellationToken) {
        var options = program.getCompilerOptions();
        // collect diagnostics from the program only once if either no source file was specified or out/outFile is set (bundled emit)
        if (!sourceFile || options.out || options.outFile) {
            return getDeclarationDiagnosticsWorker(sourceFile, cancellationToken);
        }
        else {
            return getDiagnosticsHelper(sourceFile, getDeclarationDiagnosticsForFile, cancellationToken);
        }
    }
    function getSyntacticDiagnosticsForFile(sourceFile) {
        // For JavaScript files, we report semantic errors for using TypeScript-only
        // constructs from within a JavaScript file as syntactic errors.
        if (ts.isSourceFileJavaScript(sourceFile)) {
            if (!sourceFile.additionalSyntacticDiagnostics) {
                sourceFile.additionalSyntacticDiagnostics = getJavaScriptSyntacticDiagnosticsForFile(sourceFile);
                if (ts.isCheckJsEnabledForFile(sourceFile, options)) {
                    sourceFile.additionalSyntacticDiagnostics = ts.concatenate(sourceFile.additionalSyntacticDiagnostics, sourceFile.jsDocDiagnostics);
                }
            }
            return ts.concatenate(sourceFile.additionalSyntacticDiagnostics, sourceFile.parseDiagnostics);
        }
        return sourceFile.parseDiagnostics;
    }
    function runWithCancellationToken(func) {
        try {
            return func();
        }
        catch (e) {
            if (e instanceof ts.OperationCanceledException) {
                // We were canceled while performing the operation.  Because our type checker
                // might be a bad state, we need to throw it away.
                //
                // Note: we are overly aggressive here.  We do not actually *have* to throw away
                // the "noDiagnosticsTypeChecker".  However, for simplicity, i'd like to keep
                // the lifetimes of these two TypeCheckers the same.  Also, we generally only
                // cancel when the user has made a change anyways.  And, in that case, we (the
                // program instance) will get thrown away anyways.  So trying to keep one of
                // these type checkers alive doesn't serve much purpose.
                noDiagnosticsTypeChecker = undefined;
                diagnosticsProducingTypeChecker = undefined;
            }
            throw e;
        }
    }
    function getSemanticDiagnosticsForFile(sourceFile, cancellationToken) {
        return getAndCacheDiagnostics(sourceFile, cancellationToken, cachedSemanticDiagnosticsForFile, getSemanticDiagnosticsForFileNoCache);
    }
    function getSemanticDiagnosticsForFileNoCache(sourceFile, cancellationToken) {
        return runWithCancellationToken(function () {
            // If skipLibCheck is enabled, skip reporting errors if file is a declaration file.
            // If skipDefaultLibCheck is enabled, skip reporting errors if file contains a
            // '/// <reference no-default-lib="true"/>' directive.
            if (options.skipLibCheck && sourceFile.isDeclarationFile || options.skipDefaultLibCheck && sourceFile.hasNoDefaultLib) {
                return ts.emptyArray;
            }
            var typeChecker = getDiagnosticsProducingTypeChecker();
            ts.Debug.assert(!!sourceFile.bindDiagnostics);
            // By default, only type-check .ts, .tsx, and 'External' files (external files are added by plugins)
            var includeBindAndCheckDiagnostics = sourceFile.scriptKind === 3 /* TS */ || sourceFile.scriptKind === 4 /* TSX */ ||
                sourceFile.scriptKind === 5 /* External */ || ts.isCheckJsEnabledForFile(sourceFile, options);
            var bindDiagnostics = includeBindAndCheckDiagnostics ? sourceFile.bindDiagnostics : ts.emptyArray;
            var checkDiagnostics = includeBindAndCheckDiagnostics ? typeChecker.getDiagnostics(sourceFile, cancellationToken) : ts.emptyArray;
            var fileProcessingDiagnosticsInFile = fileProcessingDiagnostics.getDiagnostics(sourceFile.fileName);
            var programDiagnosticsInFile = programDiagnostics.getDiagnostics(sourceFile.fileName);
            var diagnostics = bindDiagnostics.concat(checkDiagnostics, fileProcessingDiagnosticsInFile, programDiagnosticsInFile);
            return ts.filter(diagnostics, shouldReportDiagnostic);
        });
    }
    /**
     * Skip errors if previous line start with '// @ts-ignore' comment, not counting non-empty non-comment lines
     */
    function shouldReportDiagnostic(diagnostic) {
        var file = diagnostic.file, start = diagnostic.start;
        if (file) {
            var lineStarts = ts.getLineStarts(file);
            var line = ts.computeLineAndCharacterOfPosition(lineStarts, start).line;
            while (line > 0) {
                var previousLineText = file.text.slice(lineStarts[line - 1], lineStarts[line]);
                var result = ignoreDiagnosticCommentRegEx.exec(previousLineText);
                if (!result) {
                    // non-empty line
                    return true;
                }
                if (result[3]) {
                    // @ts-ignore
                    return false;
                }
                line--;
            }
        }
        return true;
    }
    function getJavaScriptSyntacticDiagnosticsForFile(sourceFile) {
        return runWithCancellationToken(function () {
            var diagnostics = [];
            var parent = sourceFile;
            walk(sourceFile);
            return diagnostics;
            function walk(node) {
                // Return directly from the case if the given node doesnt want to visit each child
                // Otherwise break to visit each child
                switch (parent.kind) {
                    case 146 /* Parameter */:
                    case 149 /* PropertyDeclaration */:
                        if (parent.questionToken === node) {
                            diagnostics.push(createDiagnosticForNode(node, ts.Diagnostics._0_can_only_be_used_in_a_ts_file, "?"));
                            return;
                        } // jshint ignore:line
                    // falls through
                    case 151 /* MethodDeclaration */:
                    case 150 /* MethodSignature */:
                    case 152 /* Constructor */:
                    case 153 /* GetAccessor */:
                    case 154 /* SetAccessor */:
                    case 186 /* FunctionExpression */:
                    case 228 /* FunctionDeclaration */:
                    case 187 /* ArrowFunction */:
                    case 226 /* VariableDeclaration */:
                        // type annotation
                        if (parent.type === node) {
                            diagnostics.push(createDiagnosticForNode(node, ts.Diagnostics.types_can_only_be_used_in_a_ts_file));
                            return;
                        }
                }
                switch (node.kind) {
                    case 237 /* ImportEqualsDeclaration */:
                        diagnostics.push(createDiagnosticForNode(node, ts.Diagnostics.import_can_only_be_used_in_a_ts_file));
                        return;
                    case 243 /* ExportAssignment */:
                        if (node.isExportEquals) {
                            diagnostics.push(createDiagnosticForNode(node, ts.Diagnostics.export_can_only_be_used_in_a_ts_file));
                            return;
                        }
                        break;
                    case 262 /* HeritageClause */:
                        var heritageClause = node;
                        if (heritageClause.token === 108 /* ImplementsKeyword */) {
                            diagnostics.push(createDiagnosticForNode(node, ts.Diagnostics.implements_clauses_can_only_be_used_in_a_ts_file));
                            return;
                        }
                        break;
                    case 230 /* InterfaceDeclaration */:
                        diagnostics.push(createDiagnosticForNode(node, ts.Diagnostics.interface_declarations_can_only_be_used_in_a_ts_file));
                        return;
                    case 233 /* ModuleDeclaration */:
                        diagnostics.push(createDiagnosticForNode(node, ts.Diagnostics.module_declarations_can_only_be_used_in_a_ts_file));
                        return;
                    case 231 /* TypeAliasDeclaration */:
                        diagnostics.push(createDiagnosticForNode(node, ts.Diagnostics.type_aliases_can_only_be_used_in_a_ts_file));
                        return;
                    case 232 /* EnumDeclaration */:
                        diagnostics.push(createDiagnosticForNode(node, ts.Diagnostics.enum_declarations_can_only_be_used_in_a_ts_file));
                        return;
                    case 203 /* NonNullExpression */:
                        diagnostics.push(createDiagnosticForNode(node, ts.Diagnostics.non_null_assertions_can_only_be_used_in_a_ts_file));
                        return;
                    case 202 /* AsExpression */:
                        diagnostics.push(createDiagnosticForNode(node.type, ts.Diagnostics.type_assertion_expressions_can_only_be_used_in_a_ts_file));
                        return;
                    case 184 /* TypeAssertionExpression */:
                        ts.Debug.fail(); // Won't parse these in a JS file anyway, as they are interpreted as JSX.
                }
                var prevParent = parent;
                parent = node;
                ts.forEachChild(node, walk, walkArray);
                parent = prevParent;
            }
            function walkArray(nodes) {
                if (parent.decorators === nodes && !options.experimentalDecorators) {
                    diagnostics.push(createDiagnosticForNode(parent, ts.Diagnostics.Experimental_support_for_decorators_is_a_feature_that_is_subject_to_change_in_a_future_release_Set_the_experimentalDecorators_option_to_remove_this_warning));
                }
                switch (parent.kind) {
                    case 229 /* ClassDeclaration */:
                    case 151 /* MethodDeclaration */:
                    case 150 /* MethodSignature */:
                    case 152 /* Constructor */:
                    case 153 /* GetAccessor */:
                    case 154 /* SetAccessor */:
                    case 186 /* FunctionExpression */:
                    case 228 /* FunctionDeclaration */:
                    case 187 /* ArrowFunction */:
                        // Check type parameters
                        if (nodes === parent.typeParameters) {
                            diagnostics.push(createDiagnosticForNodeArray(nodes, ts.Diagnostics.type_parameter_declarations_can_only_be_used_in_a_ts_file));
                            return;
                        } // jshint ignore:line
                    // falls through
                    case 208 /* VariableStatement */:
                        // Check modifiers
                        if (nodes === parent.modifiers) {
                            return checkModifiers(nodes, parent.kind === 208 /* VariableStatement */);
                        }
                        break;
                    case 149 /* PropertyDeclaration */:
                        // Check modifiers of property declaration
                        if (nodes === parent.modifiers) {
                            for (var _i = 0, _a = nodes; _i < _a.length; _i++) {
                                var modifier = _a[_i];
                                if (modifier.kind !== 115 /* StaticKeyword */) {
                                    diagnostics.push(createDiagnosticForNode(modifier, ts.Diagnostics._0_can_only_be_used_in_a_ts_file, ts.tokenToString(modifier.kind)));
                                }
                            }
                            return;
                        }
                        break;
                    case 146 /* Parameter */:
                        // Check modifiers of parameter declaration
                        if (nodes === parent.modifiers) {
                            diagnostics.push(createDiagnosticForNodeArray(nodes, ts.Diagnostics.parameter_modifiers_can_only_be_used_in_a_ts_file));
                            return;
                        }
                        break;
                    case 181 /* CallExpression */:
                    case 182 /* NewExpression */:
                    case 201 /* ExpressionWithTypeArguments */:
                        // Check type arguments
                        if (nodes === parent.typeArguments) {
                            diagnostics.push(createDiagnosticForNodeArray(nodes, ts.Diagnostics.type_arguments_can_only_be_used_in_a_ts_file));
                            return;
                        }
                        break;
                }
                for (var _b = 0, nodes_8 = nodes; _b < nodes_8.length; _b++) {
                    var node = nodes_8[_b];
                    walk(node);
                }
            }
            function checkModifiers(modifiers, isConstValid) {
                for (var _i = 0, modifiers_1 = modifiers; _i < modifiers_1.length; _i++) {
                    var modifier = modifiers_1[_i];
                    switch (modifier.kind) {
                        case 76 /* ConstKeyword */:
                            if (isConstValid) {
                                continue;
                            } // jshint ignore:line
                        // to report error,
                        // falls through
                        case 114 /* PublicKeyword */:
                        case 112 /* PrivateKeyword */:
                        case 113 /* ProtectedKeyword */:
                        case 131 /* ReadonlyKeyword */:
                        case 124 /* DeclareKeyword */:
                        case 117 /* AbstractKeyword */:
                            diagnostics.push(createDiagnosticForNode(modifier, ts.Diagnostics._0_can_only_be_used_in_a_ts_file, ts.tokenToString(modifier.kind)));
                            break;
                        // These are all legal modifiers.
                        case 115 /* StaticKeyword */:
                        case 84 /* ExportKeyword */:
                        case 79 /* DefaultKeyword */:
                    }
                }
            }
            function createDiagnosticForNodeArray(nodes, message, arg0, arg1, arg2) {
                var start = nodes.pos;
                return ts.createFileDiagnostic(sourceFile, start, nodes.end - start, message, arg0, arg1, arg2);
            }
            // Since these are syntactic diagnostics, parent might not have been set
            // this means the sourceFile cannot be infered from the node
            function createDiagnosticForNode(node, message, arg0, arg1, arg2) {
                return ts.createDiagnosticForNodeInSourceFile(sourceFile, node, message, arg0, arg1, arg2);
            }
        });
    }
    function getDeclarationDiagnosticsWorker(sourceFile, cancellationToken) {
        return getAndCacheDiagnostics(sourceFile, cancellationToken, cachedDeclarationDiagnosticsForFile, getDeclarationDiagnosticsForFileNoCache);
    }
    function getDeclarationDiagnosticsForFileNoCache(sourceFile, cancellationToken) {
        return runWithCancellationToken(function () {
            var resolver = getDiagnosticsProducingTypeChecker().getEmitResolver(sourceFile, cancellationToken);
            // Don't actually write any files since we're just getting diagnostics.
            return ts.getDeclarationDiagnostics(getEmitHost(ts.noop), resolver, sourceFile);
        });
    }
    function getAndCacheDiagnostics(sourceFile, cancellationToken, cache, getDiagnostics) {
        var cachedResult = sourceFile
            ? cache.perFile && cache.perFile.get(sourceFile.path) // jshint ignore:line
            : cache.allDiagnostics;
        if (cachedResult) {
            return cachedResult;
        }
        var result = getDiagnostics(sourceFile, cancellationToken) || ts.emptyArray;
        if (sourceFile) {
            if (!cache.perFile) {
                cache.perFile = ts.createMap();
            }
            cache.perFile.set(sourceFile.path, result);
        }
        else {
            cache.allDiagnostics = result;
        }
        return result;
    }
    function getDeclarationDiagnosticsForFile(sourceFile, cancellationToken) {
        return sourceFile.isDeclarationFile ? [] : getDeclarationDiagnosticsWorker(sourceFile, cancellationToken);
    }
    function getOptionsDiagnostics() {
        return ts.sortAndDeduplicateDiagnostics(ts.concatenate(fileProcessingDiagnostics.getGlobalDiagnostics(), ts.concatenate(programDiagnostics.getGlobalDiagnostics(), options.configFile ? programDiagnostics.getDiagnostics(options.configFile.fileName) : [])));
    }
    function getGlobalDiagnostics() {
        return ts.sortAndDeduplicateDiagnostics(getDiagnosticsProducingTypeChecker().getGlobalDiagnostics().slice());
    }
    function processRootFile(fileName, isDefaultLib) {
        processSourceFile(ts.normalizePath(fileName), isDefaultLib, /*packageId*/ undefined);
    }
    function fileReferenceIsEqualTo(a, b) {
        return a.fileName === b.fileName;
    }
    function moduleNameIsEqualTo(a, b) {
        return a.kind === 9 /* StringLiteral */
            ? b.kind === 9 /* StringLiteral */ && a.text === b.text // jshint ignore:line
            : b.kind === 71 /* Identifier */ && a.escapedText === b.escapedText;
    }
    function collectExternalModuleReferences(file) {
        if (file.imports) {
            return;
        }
        var isJavaScriptFile = ts.isSourceFileJavaScript(file);
        var isExternalModuleFile = ts.isExternalModule(file);
        // file.imports may not be undefined if there exists dynamic import
        var imports;
        var moduleAugmentations;
        var ambientModules;
        // If we are importing helpers, we need to add a synthetic reference to resolve the
        // helpers library.
        if (options.importHelpers
            && (options.isolatedModules || isExternalModuleFile) // jshint ignore:line
            && !file.isDeclarationFile) { // jshint ignore:line
            // synthesize 'import "tslib"' declaration
            var externalHelpersModuleReference = ts.createLiteral(ts.externalHelpersModuleNameText);
            var importDecl = ts.createImportDeclaration(/*decorators*/ undefined, /*modifiers*/ undefined, /*importClause*/ undefined);
            externalHelpersModuleReference.parent = importDecl;
            importDecl.parent = file;
            imports = [externalHelpersModuleReference];
        }
        for (var _i = 0, _a = file.statements; _i < _a.length; _i++) {
            var node = _a[_i];
            collectModuleReferences(node, /*inAmbientModule*/ false);
            if ((file.flags & 524288 /* PossiblyContainsDynamicImport */) || isJavaScriptFile) { // jshint ignore:line
                collectDynamicImportOrRequireCalls(node);
            }
        }
        file.imports = imports || ts.emptyArray;
        file.moduleAugmentations = moduleAugmentations || ts.emptyArray;
        file.ambientModuleNames = ambientModules || ts.emptyArray;
        return;
        function collectModuleReferences(node, inAmbientModule) {
            switch (node.kind) {
                case 238 /* ImportDeclaration */:
                case 237 /* ImportEqualsDeclaration */:
                case 244 /* ExportDeclaration */:
                    var moduleNameExpr = ts.getExternalModuleName(node);
                    if (!moduleNameExpr || !ts.isStringLiteral(moduleNameExpr)) {
                        break;
                    }
                    if (!moduleNameExpr.text) {
                        break;
                    }
                    // TypeScript 1.0 spec (April 2014): 12.1.6
                    // An ExternalImportDeclaration in an AmbientExternalModuleDeclaration may reference other external modules
                    // only through top - level external module names. Relative external module names are not permitted.
                    if (!inAmbientModule || !ts.isExternalModuleNameRelative(moduleNameExpr.text)) {
                        (imports || (imports = [])).push(moduleNameExpr);
                    }
                    break;
                case 233 /* ModuleDeclaration */:
                    if (ts.isAmbientModule(node) && (inAmbientModule || ts.hasModifier(node, 2 /* Ambient */) || file.isDeclarationFile)) {
                        var moduleName = node.name;
                        var nameText = ts.getTextOfIdentifierOrLiteral(moduleName);
                        // Ambient module declarations can be interpreted as augmentations for some existing external modules.
                        // This will happen in two cases:
                        // - if current file is external module then module augmentation is a ambient module declaration defined in the top level scope
                        // - if current file is not external module then module augmentation is an ambient module declaration with non-relative module name
                        //   immediately nested in top level ambient module declaration .
                        if (isExternalModuleFile || (inAmbientModule && !ts.isExternalModuleNameRelative(nameText))) {
                            (moduleAugmentations || (moduleAugmentations = [])).push(moduleName);
                        }
                        else if (!inAmbientModule) {
                            if (file.isDeclarationFile) {
                                // for global .d.ts files record name of ambient module
                                (ambientModules || (ambientModules = [])).push(nameText);
                            }
                            // An AmbientExternalModuleDeclaration declares an external module.
                            // This type of declaration is permitted only in the global module.
                            // The StringLiteral must specify a top - level external module name.
                            // Relative external module names are not permitted
                            // NOTE: body of ambient module is always a module block, if it exists
                            var body = node.body;
                            if (body) {
                                for (var _i = 0, _a = body.statements; _i < _a.length; _i++) {
                                    var statement = _a[_i];
                                    collectModuleReferences(statement, /*inAmbientModule*/ true);
                                }
                            }
                        }
                    }
            }
        }
        function collectDynamicImportOrRequireCalls(node) {
            if (ts.isRequireCall(node, /*checkArgumentIsStringLiteral*/ true)) {
                (imports || (imports = [])).push(node.arguments[0]);
            }
            else if (ts.isImportCall(node) && node.arguments.length === 1 && node.arguments[0].kind === 9 /* StringLiteral */) {
                (imports || (imports = [])).push(node.arguments[0]);
            }
            else {
                ts.forEachChild(node, collectDynamicImportOrRequireCalls);
            }
        }
    }
    /** This should have similar behavior to 'processSourceFile' without diagnostics or mutation. */
    function getSourceFileFromReference(referencingFile, ref) {
        return getSourceFileFromReferenceWorker(resolveTripleslashReference(ref.fileName, referencingFile.fileName), function (fileName) { return filesByName.get(toPath(fileName)); });
    }
    function getSourceFileFromReferenceWorker(fileName, getSourceFile, fail, refFile) {
        if (ts.hasExtension(fileName)) {
            if (!options.allowNonTsExtensions && !ts.forEach(supportedExtensions, function (extension) { return ts.fileExtensionIs(host.getCanonicalFileName(fileName), extension); })) {
                if (fail) fail(ts.Diagnostics.File_0_has_unsupported_extension_The_only_supported_extensions_are_1, fileName, "'" + supportedExtensions.join("', '") + "'"); // jshint ignore:line
                return undefined;
            }
            var sourceFile = getSourceFile(fileName);
            if (fail) {
                if (!sourceFile) {
                    fail(ts.Diagnostics.File_0_not_found, fileName);
                }
                else if (refFile && host.getCanonicalFileName(fileName) === host.getCanonicalFileName(refFile.fileName)) {
                    fail(ts.Diagnostics.A_file_cannot_have_a_reference_to_itself);
                }
            }
            return sourceFile;
        }
        else {
            var sourceFileNoExtension = options.allowNonTsExtensions && getSourceFile(fileName);
            if (sourceFileNoExtension)
                return sourceFileNoExtension; // jshint ignore:line
            if (fail && options.allowNonTsExtensions) {
                fail(ts.Diagnostics.File_0_not_found, fileName);
                return undefined;
            }
            var sourceFileWithAddedExtension = ts.forEach(supportedExtensions, function (extension) { return getSourceFile(fileName + extension); });
            if (fail && !sourceFileWithAddedExtension)
                fail(ts.Diagnostics.File_0_not_found, fileName + ".ts" /* Ts */); // jshint ignore:line
            return sourceFileWithAddedExtension;
        }
    }
    /** This has side effects through `findSourceFile`. */
    function processSourceFile(fileName, isDefaultLib, packageId, refFile, refPos, refEnd) {
        getSourceFileFromReferenceWorker(fileName, function (fileName) { return findSourceFile(fileName, toPath(fileName), isDefaultLib, refFile, refPos, refEnd, packageId); }, function (diagnostic) {
            var args = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                args[_i - 1] = arguments[_i];
            }
            fileProcessingDiagnostics.add(refFile !== undefined && refEnd !== undefined && refPos !== undefined
                ? ts.createFileDiagnostic.apply(void 0, [refFile, refPos, refEnd - refPos, diagnostic].concat(args)) : ts.createCompilerDiagnostic.apply(void 0, [diagnostic].concat(args))); // jshint ignore:line
        }, refFile);
    }
    function reportFileNamesDifferOnlyInCasingError(fileName, existingFileName, refFile, refPos, refEnd) {
        if (refFile !== undefined && refPos !== undefined && refEnd !== undefined) {
            fileProcessingDiagnostics.add(ts.createFileDiagnostic(refFile, refPos, refEnd - refPos, ts.Diagnostics.File_name_0_differs_from_already_included_file_name_1_only_in_casing, fileName, existingFileName));
        }
        else {
            fileProcessingDiagnostics.add(ts.createCompilerDiagnostic(ts.Diagnostics.File_name_0_differs_from_already_included_file_name_1_only_in_casing, fileName, existingFileName));
        }
    }
    function createRedirectSourceFile(redirectTarget, unredirected, fileName, path) {
        var redirect = Object.create(redirectTarget);
        redirect.fileName = fileName;
        redirect.path = path;
        redirect.redirectInfo = { redirectTarget: redirectTarget, unredirected: unredirected };
        Object.defineProperties(redirect, {
            id: {
                get: function () { return this.redirectInfo.redirectTarget.id; },
                set: function (value) { this.redirectInfo.redirectTarget.id = value; },
            },
            symbol: {
                get: function () { return this.redirectInfo.redirectTarget.symbol; },
                set: function (value) { this.redirectInfo.redirectTarget.symbol = value; },
            },
        });
        return redirect;
    }
    // Get source file from normalized fileName
    function findSourceFile(fileName, path, isDefaultLib, refFile, refPos, refEnd, packageId) {
        if (filesByName.has(path)) {
            var file_1 = filesByName.get(path);
            // try to check if we've already seen this file but with a different casing in path
            // NOTE: this only makes sense for case-insensitive file systems
            if (file_1 && options.forceConsistentCasingInFileNames && ts.getNormalizedAbsolutePath(file_1.fileName, currentDirectory) !== ts.getNormalizedAbsolutePath(fileName, currentDirectory)) {
                reportFileNamesDifferOnlyInCasingError(fileName, file_1.fileName, refFile, refPos, refEnd);
            }
            // If the file was previously found via a node_modules search, but is now being processed as a root file,
            // then everything it sucks in may also be marked incorrectly, and needs to be checked again.
            if (file_1 && sourceFilesFoundSearchingNodeModules.get(file_1.path) && currentNodeModulesDepth === 0) {
                sourceFilesFoundSearchingNodeModules.set(file_1.path, false);
                if (!options.noResolve) {
                    processReferencedFiles(file_1, isDefaultLib);
                    processTypeReferenceDirectives(file_1);
                }
                modulesWithElidedImports.set(file_1.path, false);
                processImportedModules(file_1);
            }
            else if (file_1 && modulesWithElidedImports.get(file_1.path)) {
                if (currentNodeModulesDepth < maxNodeModuleJsDepth) {
                    modulesWithElidedImports.set(file_1.path, false);
                    processImportedModules(file_1);
                }
            }
            return file_1;
        }
        // We haven't looked for this file, do so now and cache result
        var file = host.getSourceFile(fileName, options.target, function (hostErrorMessage) {
            if (refFile !== undefined && refPos !== undefined && refEnd !== undefined) {
                fileProcessingDiagnostics.add(ts.createFileDiagnostic(refFile, refPos, refEnd - refPos, ts.Diagnostics.Cannot_read_file_0_Colon_1, fileName, hostErrorMessage));
            }
            else {
                fileProcessingDiagnostics.add(ts.createCompilerDiagnostic(ts.Diagnostics.Cannot_read_file_0_Colon_1, fileName, hostErrorMessage));
            }
        }, shouldCreateNewSourceFile);
        if (packageId) {
            var packageIdKey = packageId.name + "/" + packageId.subModuleName + "@" + packageId.version;
            var fileFromPackageId = packageIdToSourceFile.get(packageIdKey);
            if (fileFromPackageId) {
                // Some other SourceFile already exists with this package name and version.
                // Instead of creating a duplicate, just redirect to the existing one.
                var dupFile = createRedirectSourceFile(fileFromPackageId, file, fileName, path);
                redirectTargetsSet.set(fileFromPackageId.path, true);
                filesByName.set(path, dupFile);
                sourceFileToPackageName.set(path, packageId.name);
                files.push(dupFile);
                return dupFile;
            }
            else if (file) {
                // This is the first source file to have this packageId.
                packageIdToSourceFile.set(packageIdKey, file);
                sourceFileToPackageName.set(path, packageId.name);
            }
        }
        filesByName.set(path, file);
        if (file) {
            sourceFilesFoundSearchingNodeModules.set(path, currentNodeModulesDepth > 0);
            file.path = path;
            if (host.useCaseSensitiveFileNames()) {
                var pathLowerCase = path.toLowerCase();
                // for case-sensitive file systems check if we've already seen some file with similar filename ignoring case
                var existingFile = filesByNameIgnoreCase.get(pathLowerCase);
                if (existingFile) {
                    reportFileNamesDifferOnlyInCasingError(fileName, existingFile.fileName, refFile, refPos, refEnd);
                }
                else {
                    filesByNameIgnoreCase.set(pathLowerCase, file);
                }
            }
            skipDefaultLib = skipDefaultLib || file.hasNoDefaultLib;
            if (!options.noResolve) {
                processReferencedFiles(file, isDefaultLib);
                processTypeReferenceDirectives(file);
            }
            // always process imported modules to record module name resolutions
            processImportedModules(file);
            if (isDefaultLib) {
                files.unshift(file);
            }
            else {
                files.push(file);
            }
        }
        return file;
    }
    function processReferencedFiles(file, isDefaultLib) {
        ts.forEach(file.referencedFiles, function (ref) {
            var referencedFileName = resolveTripleslashReference(ref.fileName, file.fileName);
            processSourceFile(referencedFileName, isDefaultLib, /*packageId*/ undefined, file, ref.pos, ref.end);
        });
    }
    function processTypeReferenceDirectives(file) {
        // We lower-case all type references because npm automatically lowercases all packages. See GH#9824.
        var typeDirectives = ts.map(file.typeReferenceDirectives, function (ref) { return ref.fileName.toLocaleLowerCase(); });
        var resolutions = resolveTypeReferenceDirectiveNamesWorker(typeDirectives, file.fileName);
        for (var i = 0; i < typeDirectives.length; i++) {
            var ref = file.typeReferenceDirectives[i];
            var resolvedTypeReferenceDirective = resolutions[i];
            // store resolved type directive on the file
            var fileName = ref.fileName.toLocaleLowerCase();
            ts.setResolvedTypeReferenceDirective(file, fileName, resolvedTypeReferenceDirective);
            processTypeReferenceDirective(fileName, resolvedTypeReferenceDirective, file, ref.pos, ref.end);
        }
    }
    function processTypeReferenceDirective(typeReferenceDirective, resolvedTypeReferenceDirective, refFile, refPos, refEnd) {
        // If we already found this library as a primary reference - nothing to do
        var previousResolution = resolvedTypeReferenceDirectives.get(typeReferenceDirective);
        if (previousResolution && previousResolution.primary) {
            return;
        }
        var saveResolution = true;
        if (resolvedTypeReferenceDirective) {
            if (resolvedTypeReferenceDirective.primary) {
                // resolved from the primary path
                processSourceFile(resolvedTypeReferenceDirective.resolvedFileName, /*isDefaultLib*/ false, resolvedTypeReferenceDirective.packageId, refFile, refPos, refEnd);
            }
            else {
                // If we already resolved to this file, it must have been a secondary reference. Check file contents
                // for sameness and possibly issue an error
                if (previousResolution) {
                    // Don't bother reading the file again if it's the same file.
                    if (resolvedTypeReferenceDirective.resolvedFileName !== previousResolution.resolvedFileName) {
                        var otherFileText = host.readFile(resolvedTypeReferenceDirective.resolvedFileName);
                        if (otherFileText !== getSourceFile(previousResolution.resolvedFileName).text) {
                            fileProcessingDiagnostics.add(createDiagnostic(refFile, refPos, refEnd, ts.Diagnostics.Conflicting_definitions_for_0_found_at_1_and_2_Consider_installing_a_specific_version_of_this_library_to_resolve_the_conflict, typeReferenceDirective, resolvedTypeReferenceDirective.resolvedFileName, previousResolution.resolvedFileName));
                        }
                    }
                    // don't overwrite previous resolution result
                    saveResolution = false;
                }
                else {
                    // First resolution of this library
                    processSourceFile(resolvedTypeReferenceDirective.resolvedFileName, /*isDefaultLib*/ false, resolvedTypeReferenceDirective.packageId, refFile, refPos, refEnd);
                }
            }
        }
        else {
            fileProcessingDiagnostics.add(createDiagnostic(refFile, refPos, refEnd, ts.Diagnostics.Cannot_find_type_definition_file_for_0, typeReferenceDirective));
        }
        if (saveResolution) {
            resolvedTypeReferenceDirectives.set(typeReferenceDirective, resolvedTypeReferenceDirective);
        }
    }
    function createDiagnostic(refFile, refPos, refEnd, message) {
        var args = [];
        for (var _i = 4; _i < arguments.length; _i++) {
            args[_i - 4] = arguments[_i];
        }
        if (refFile === undefined || refPos === undefined || refEnd === undefined) {
            return ts.createCompilerDiagnostic.apply(void 0, [message].concat(args));
        }
        else {
            return ts.createFileDiagnostic.apply(void 0, [refFile, refPos, refEnd - refPos, message].concat(args));
        }
    }
    function getCanonicalFileName(fileName) {
        return host.getCanonicalFileName(fileName);
    }
    function processImportedModules(file) {
        collectExternalModuleReferences(file);
        if (file.imports.length || file.moduleAugmentations.length) {
            // Because global augmentation doesn't have string literal name, we can check for global augmentation as such.
            var moduleNames = getModuleNames(file);
            var oldProgramState = { program: oldProgram, file: file, modifiedFilePaths: modifiedFilePaths };
            var resolutions = resolveModuleNamesReusingOldState(moduleNames, ts.getNormalizedAbsolutePath(file.fileName, currentDirectory), file, oldProgramState);
            ts.Debug.assert(resolutions.length === moduleNames.length);
            for (var i = 0; i < moduleNames.length; i++) {
                var resolution = resolutions[i];
                ts.setResolvedModule(file, moduleNames[i], resolution);
                if (!resolution) {
                    continue;
                }
                var isFromNodeModulesSearch = resolution.isExternalLibraryImport;
                var isJsFile = !ts.extensionIsTypeScript(resolution.extension);
                var isJsFileFromNodeModules = isFromNodeModulesSearch && isJsFile;
                var resolvedFileName = resolution.resolvedFileName;
                if (isFromNodeModulesSearch) {
                    currentNodeModulesDepth++;
                }
                // add file to program only if:
                // - resolution was successful
                // - noResolve is falsy
                // - module name comes from the list of imports
                // - it's not a top level JavaScript module that exceeded the search max
                var elideImport = isJsFileFromNodeModules && currentNodeModulesDepth > maxNodeModuleJsDepth;
                // Don't add the file if it has a bad extension (e.g. 'tsx' if we don't have '--allowJs')
                // This may still end up being an untyped module -- the file won't be included but imports will be allowed.
                var shouldAddFile = resolvedFileName
                    && !ts.getResolutionDiagnostic(options, resolution) // jshint ignore:line
                    && !options.noResolve // jshint ignore:line
                    && i < file.imports.length // jshint ignore:line
                    && !elideImport // jshint ignore:line
                    && !(isJsFile && !options.allowJs); // jshint ignore:line
                if (elideImport) {
                    modulesWithElidedImports.set(file.path, true);
                }
                else if (shouldAddFile) {
                    var path = toPath(resolvedFileName);
                    var pos = ts.skipTrivia(file.text, file.imports[i].pos);
                    findSourceFile(resolvedFileName, path, /*isDefaultLib*/ false, file, pos, file.imports[i].end, resolution.packageId);
                }
                if (isFromNodeModulesSearch) {
                    currentNodeModulesDepth--;
                }
            }
        }
        else {
            // no imports - drop cached module resolutions
            file.resolvedModules = undefined;
        }
    }
    function computeCommonSourceDirectory(sourceFiles) {
        var fileNames = [];
        for (var _i = 0, sourceFiles_2 = sourceFiles; _i < sourceFiles_2.length; _i++) {
            var file = sourceFiles_2[_i];
            if (!file.isDeclarationFile) {
                fileNames.push(file.fileName);
            }
        }
        return computeCommonSourceDirectoryOfFilenames(fileNames, currentDirectory, getCanonicalFileName);
    }
    function checkSourceFilesBelongToPath(sourceFiles, rootDirectory) {
        var allFilesBelongToPath = true;
        if (sourceFiles) {
            var absoluteRootDirectoryPath = host.getCanonicalFileName(ts.getNormalizedAbsolutePath(rootDirectory, currentDirectory));
            for (var _i = 0, sourceFiles_3 = sourceFiles; _i < sourceFiles_3.length; _i++) {
                var sourceFile = sourceFiles_3[_i];
                if (!sourceFile.isDeclarationFile) {
                    var absoluteSourceFilePath = host.getCanonicalFileName(ts.getNormalizedAbsolutePath(sourceFile.fileName, currentDirectory));
                    if (absoluteSourceFilePath.indexOf(absoluteRootDirectoryPath) !== 0) {
                        programDiagnostics.add(ts.createCompilerDiagnostic(ts.Diagnostics.File_0_is_not_under_rootDir_1_rootDir_is_expected_to_contain_all_source_files, sourceFile.fileName, options.rootDir));
                        allFilesBelongToPath = false;
                    }
                }
            }
        }
        return allFilesBelongToPath;
    }
    function verifyCompilerOptions() {
        if (options.isolatedModules) {
            if (options.declaration) {
                createDiagnosticForOptionName(ts.Diagnostics.Option_0_cannot_be_specified_with_option_1, "declaration", "isolatedModules");
            }
            if (options.noEmitOnError) {
                createDiagnosticForOptionName(ts.Diagnostics.Option_0_cannot_be_specified_with_option_1, "noEmitOnError", "isolatedModules");
            }
            if (options.out) {
                createDiagnosticForOptionName(ts.Diagnostics.Option_0_cannot_be_specified_with_option_1, "out", "isolatedModules");
            }
            if (options.outFile) {
                createDiagnosticForOptionName(ts.Diagnostics.Option_0_cannot_be_specified_with_option_1, "outFile", "isolatedModules");
            }
        }
        if (options.inlineSourceMap) {
            if (options.sourceMap) {
                createDiagnosticForOptionName(ts.Diagnostics.Option_0_cannot_be_specified_with_option_1, "sourceMap", "inlineSourceMap");
            }
            if (options.mapRoot) {
                createDiagnosticForOptionName(ts.Diagnostics.Option_0_cannot_be_specified_with_option_1, "mapRoot", "inlineSourceMap");
            }
        }
        if (options.paths && options.baseUrl === undefined) {
            createDiagnosticForOptionName(ts.Diagnostics.Option_paths_cannot_be_used_without_specifying_baseUrl_option, "paths");
        }
        if (options.paths) {
            for (var key in options.paths) {
                if (!ts.hasProperty(options.paths, key)) {
                    continue;
                }
                if (!ts.hasZeroOrOneAsteriskCharacter(key)) {
                    createDiagnosticForOptionPaths(/*onKey*/ true, key, ts.Diagnostics.Pattern_0_can_have_at_most_one_Asterisk_character, key);
                }
                if (ts.isArray(options.paths[key])) {
                    var len = options.paths[key].length;
                    if (len === 0) {
                        createDiagnosticForOptionPaths(/*onKey*/ false, key, ts.Diagnostics.Substitutions_for_pattern_0_shouldn_t_be_an_empty_array, key);
                    }
                    for (var i = 0; i < len; i++) {
                        var subst = options.paths[key][i];
                        var typeOfSubst = typeof subst;
                        if (typeOfSubst === "string") {
                            if (!ts.hasZeroOrOneAsteriskCharacter(subst)) {
                                createDiagnosticForOptionPathKeyValue(key, i, ts.Diagnostics.Substitution_0_in_pattern_1_in_can_have_at_most_one_Asterisk_character, subst, key);
                            }
                        }
                        else {
                            createDiagnosticForOptionPathKeyValue(key, i, ts.Diagnostics.Substitution_0_for_pattern_1_has_incorrect_type_expected_string_got_2, subst, key, typeOfSubst);
                        }
                    }
                }
                else {
                    createDiagnosticForOptionPaths(/*onKey*/ false, key, ts.Diagnostics.Substitutions_for_pattern_0_should_be_an_array, key);
                }
            }
        }
        if (!options.sourceMap && !options.inlineSourceMap) {
            if (options.inlineSources) {
                createDiagnosticForOptionName(ts.Diagnostics.Option_0_can_only_be_used_when_either_option_inlineSourceMap_or_option_sourceMap_is_provided, "inlineSources");
            }
            if (options.sourceRoot) {
                createDiagnosticForOptionName(ts.Diagnostics.Option_0_can_only_be_used_when_either_option_inlineSourceMap_or_option_sourceMap_is_provided, "sourceRoot");
            }
        }
        if (options.out && options.outFile) {
            createDiagnosticForOptionName(ts.Diagnostics.Option_0_cannot_be_specified_with_option_1, "out", "outFile");
        }
        if (options.mapRoot && !options.sourceMap) {
            // Error to specify --mapRoot without --sourcemap
            createDiagnosticForOptionName(ts.Diagnostics.Option_0_cannot_be_specified_without_specifying_option_1, "mapRoot", "sourceMap");
        }
        if (options.declarationDir) {
            if (!options.declaration) {
                createDiagnosticForOptionName(ts.Diagnostics.Option_0_cannot_be_specified_without_specifying_option_1, "declarationDir", "declaration");
            }
            if (options.out || options.outFile) {
                createDiagnosticForOptionName(ts.Diagnostics.Option_0_cannot_be_specified_with_option_1, "declarationDir", options.out ? "out" : "outFile");
            }
        }
        if (options.lib && options.noLib) {
            createDiagnosticForOptionName(ts.Diagnostics.Option_0_cannot_be_specified_with_option_1, "lib", "noLib");
        }
        if (options.noImplicitUseStrict && (options.alwaysStrict === undefined ? options.strict : options.alwaysStrict)) {
            createDiagnosticForOptionName(ts.Diagnostics.Option_0_cannot_be_specified_with_option_1, "noImplicitUseStrict", "alwaysStrict");
        }
        var languageVersion = options.target || 0 /* ES3 */;
        var outFile = options.outFile || options.out;
        var firstNonAmbientExternalModuleSourceFile = ts.forEach(files, function (f) { return ts.isExternalModule(f) && !f.isDeclarationFile ? f : undefined; });
        if (options.isolatedModules) {
            if (options.module === ts.ModuleKind.None && languageVersion < 2 /* ES2015 */) {
                createDiagnosticForOptionName(ts.Diagnostics.Option_isolatedModules_can_only_be_used_when_either_option_module_is_provided_or_option_target_is_ES2015_or_higher, "isolatedModules", "target");
            }
            var firstNonExternalModuleSourceFile = ts.forEach(files, function (f) { return !ts.isExternalModule(f) && !f.isDeclarationFile ? f : undefined; });
            if (firstNonExternalModuleSourceFile) {
                var span_7 = ts.getErrorSpanForNode(firstNonExternalModuleSourceFile, firstNonExternalModuleSourceFile);
                programDiagnostics.add(ts.createFileDiagnostic(firstNonExternalModuleSourceFile, span_7.start, span_7.length, ts.Diagnostics.Cannot_compile_namespaces_when_the_isolatedModules_flag_is_provided));
            }
        }
        else if (firstNonAmbientExternalModuleSourceFile && languageVersion < 2 /* ES2015 */ && options.module === ts.ModuleKind.None) {
            // We cannot use createDiagnosticFromNode because nodes do not have parents yet
            var span_8 = ts.getErrorSpanForNode(firstNonAmbientExternalModuleSourceFile, firstNonAmbientExternalModuleSourceFile.externalModuleIndicator);
            programDiagnostics.add(ts.createFileDiagnostic(firstNonAmbientExternalModuleSourceFile, span_8.start, span_8.length, ts.Diagnostics.Cannot_use_imports_exports_or_module_augmentations_when_module_is_none));
        }
        // Cannot specify module gen that isn't amd or system with --out
        if (outFile) {
            if (options.module && !(options.module === ts.ModuleKind.AMD || options.module === ts.ModuleKind.System)) {
                createDiagnosticForOptionName(ts.Diagnostics.Only_amd_and_system_modules_are_supported_alongside_0, options.out ? "out" : "outFile", "module");
            }
            else if (options.module === undefined && firstNonAmbientExternalModuleSourceFile) {
                var span_9 = ts.getErrorSpanForNode(firstNonAmbientExternalModuleSourceFile, firstNonAmbientExternalModuleSourceFile.externalModuleIndicator);
                programDiagnostics.add(ts.createFileDiagnostic(firstNonAmbientExternalModuleSourceFile, span_9.start, span_9.length, ts.Diagnostics.Cannot_compile_modules_using_option_0_unless_the_module_flag_is_amd_or_system, options.out ? "out" : "outFile"));
            }
        }
        // there has to be common source directory if user specified --outdir || --sourceRoot
        // if user specified --mapRoot, there needs to be common source directory if there would be multiple files being emitted
        if (options.outDir || // there is --outDir specified
            options.sourceRoot || // there is --sourceRoot specified
            options.mapRoot) {
            // Precalculate and cache the common source directory
            var dir = getCommonSourceDirectory();
            // If we failed to find a good common directory, but outDir is specified and at least one of our files is on a windows drive/URL/other resource, add a failure
            if (options.outDir && dir === "" && ts.forEach(files, function (file) { return ts.getRootLength(file.fileName) > 1; })) {
                createDiagnosticForOptionName(ts.Diagnostics.Cannot_find_the_common_subdirectory_path_for_the_input_files, "outDir");
            }
        }
        if (!options.noEmit && options.allowJs && options.declaration) {
            createDiagnosticForOptionName(ts.Diagnostics.Option_0_cannot_be_specified_with_option_1, "allowJs", "declaration");
        }
        if (options.checkJs && !options.allowJs) {
            programDiagnostics.add(ts.createCompilerDiagnostic(ts.Diagnostics.Option_0_cannot_be_specified_without_specifying_option_1, "checkJs", "allowJs"));
        }
        if (options.emitDecoratorMetadata &&
            !options.experimentalDecorators) {
            createDiagnosticForOptionName(ts.Diagnostics.Option_0_cannot_be_specified_without_specifying_option_1, "emitDecoratorMetadata", "experimentalDecorators");
        }
        if (options.jsxFactory) {
            if (options.reactNamespace) {
                createDiagnosticForOptionName(ts.Diagnostics.Option_0_cannot_be_specified_with_option_1, "reactNamespace", "jsxFactory");
            }
            if (!ts.parseIsolatedEntityName(options.jsxFactory, languageVersion)) {
                createOptionValueDiagnostic("jsxFactory", ts.Diagnostics.Invalid_value_for_jsxFactory_0_is_not_a_valid_identifier_or_qualified_name, options.jsxFactory);
            }
        }
        else if (options.reactNamespace && !ts.isIdentifierText(options.reactNamespace, languageVersion)) {
            createOptionValueDiagnostic("reactNamespace", ts.Diagnostics.Invalid_value_for_reactNamespace_0_is_not_a_valid_identifier, options.reactNamespace);
        }
        // If the emit is enabled make sure that every output file is unique and not overwriting any of the input files
        if (!options.noEmit && !options.suppressOutputPathCheck) {
            var emitHost = getEmitHost();
            var emitFilesSeen_1 = ts.createMap();
            ts.forEachEmittedFile(emitHost, function (emitFileNames) {
                verifyEmitFilePath(emitFileNames.jsFilePath, emitFilesSeen_1);
                verifyEmitFilePath(emitFileNames.declarationFilePath, emitFilesSeen_1);
            });
        }
        // Verify that all the emit files are unique and don't overwrite input files
        function verifyEmitFilePath(emitFileName, emitFilesSeen) {
            if (emitFileName) {
                var emitFilePath = toPath(emitFileName);
                // Report error if the output overwrites input file
                if (filesByName.has(emitFilePath)) {
                    var chain_1;
                    if (!options.configFilePath) {
                        // The program is from either an inferred project or an external project
                        chain_1 = ts.chainDiagnosticMessages(/*details*/ undefined, ts.Diagnostics.Adding_a_tsconfig_json_file_will_help_organize_projects_that_contain_both_TypeScript_and_JavaScript_files_Learn_more_at_https_Colon_Slash_Slashaka_ms_Slashtsconfig);
                    }
                    chain_1 = ts.chainDiagnosticMessages(chain_1, ts.Diagnostics.Cannot_write_file_0_because_it_would_overwrite_input_file, emitFileName);
                    blockEmittingOfFile(emitFileName, ts.createCompilerDiagnosticFromMessageChain(chain_1));
                }
                var emitFileKey = !host.useCaseSensitiveFileNames() ? emitFilePath.toLocaleLowerCase() : emitFilePath;
                // Report error if multiple files write into same file
                if (emitFilesSeen.has(emitFileKey)) {
                    // Already seen the same emit file - report error
                    blockEmittingOfFile(emitFileName, ts.createCompilerDiagnostic(ts.Diagnostics.Cannot_write_file_0_because_it_would_be_overwritten_by_multiple_input_files, emitFileName));
                }
                else {
                    emitFilesSeen.set(emitFileKey, true);
                }
            }
        }
    }
    function createDiagnosticForOptionPathKeyValue(key, valueIndex, message, arg0, arg1, arg2) {
        var needCompilerDiagnostic = true;
        var pathsSyntax = getOptionPathsSyntax();
        for (var _i = 0, pathsSyntax_1 = pathsSyntax; _i < pathsSyntax_1.length; _i++) {
            var pathProp = pathsSyntax_1[_i];
            if (ts.isObjectLiteralExpression(pathProp.initializer)) {
                for (var _a = 0, _b = ts.getPropertyAssignment(pathProp.initializer, key); _a < _b.length; _a++) {
                    var keyProps = _b[_a];
                    if (ts.isArrayLiteralExpression(keyProps.initializer) &&
                        keyProps.initializer.elements.length > valueIndex) {
                        programDiagnostics.add(ts.createDiagnosticForNodeInSourceFile(options.configFile, keyProps.initializer.elements[valueIndex], message, arg0, arg1, arg2));
                        needCompilerDiagnostic = false;
                    }
                }
            }
        }
        if (needCompilerDiagnostic) {
            programDiagnostics.add(ts.createCompilerDiagnostic(message, arg0, arg1, arg2));
        }
    }
    function createDiagnosticForOptionPaths(onKey, key, message, arg0) {
        var needCompilerDiagnostic = true;
        var pathsSyntax = getOptionPathsSyntax();
        for (var _i = 0, pathsSyntax_2 = pathsSyntax; _i < pathsSyntax_2.length; _i++) {
            var pathProp = pathsSyntax_2[_i];
            if (ts.isObjectLiteralExpression(pathProp.initializer) &&
                createOptionDiagnosticInObjectLiteralSyntax(pathProp.initializer, onKey, key, /*key2*/ undefined, message, arg0)) {
                needCompilerDiagnostic = false;
            }
        }
        if (needCompilerDiagnostic) {
            programDiagnostics.add(ts.createCompilerDiagnostic(message, arg0));
        }
    }
    function getOptionPathsSyntax() {
        var compilerOptionsObjectLiteralSyntax = getCompilerOptionsObjectLiteralSyntax();
        if (compilerOptionsObjectLiteralSyntax) {
            return ts.getPropertyAssignment(compilerOptionsObjectLiteralSyntax, "paths");
        }
        return ts.emptyArray;
    }
    function createDiagnosticForOptionName(message, option1, option2) {
        createDiagnosticForOption(/*onKey*/ true, option1, option2, message, option1, option2);
    }
    function createOptionValueDiagnostic(option1, message, arg0) {
        createDiagnosticForOption(/*onKey*/ false, option1, /*option2*/ undefined, message, arg0);
    }
    function createDiagnosticForOption(onKey, option1, option2, message, arg0, arg1) {
        var compilerOptionsObjectLiteralSyntax = getCompilerOptionsObjectLiteralSyntax();
        var needCompilerDiagnostic = !compilerOptionsObjectLiteralSyntax ||
            !createOptionDiagnosticInObjectLiteralSyntax(compilerOptionsObjectLiteralSyntax, onKey, option1, option2, message, arg0, arg1);
        if (needCompilerDiagnostic) {
            programDiagnostics.add(ts.createCompilerDiagnostic(message, arg0, arg1));
        }
    }
    function getCompilerOptionsObjectLiteralSyntax() {
        if (_compilerOptionsObjectLiteralSyntax === undefined) {
            _compilerOptionsObjectLiteralSyntax = null; // tslint:disable-line:no-null-keyword
            if (options.configFile && options.configFile.jsonObject) {
                for (var _i = 0, _a = ts.getPropertyAssignment(options.configFile.jsonObject, "compilerOptions"); _i < _a.length; _i++) {
                    var prop = _a[_i];
                    if (ts.isObjectLiteralExpression(prop.initializer)) {
                        _compilerOptionsObjectLiteralSyntax = prop.initializer;
                        break;
                    }
                }
            }
        }
        return _compilerOptionsObjectLiteralSyntax;
    }
    function createOptionDiagnosticInObjectLiteralSyntax(objectLiteral, onKey, key1, key2, message, arg0, arg1) {
        var props = ts.getPropertyAssignment(objectLiteral, key1, key2);
        for (var _i = 0, props_2 = props; _i < props_2.length; _i++) {
            var prop = props_2[_i];
            programDiagnostics.add(ts.createDiagnosticForNodeInSourceFile(options.configFile, onKey ? prop.name : prop.initializer, message, arg0, arg1));
        }
        return !!props.length;
    }
    function blockEmittingOfFile(emitFileName, diag) {
        hasEmitBlockingDiagnostics.set(toPath(emitFileName), true);
        programDiagnostics.add(diag);
    }
};
function checkAllDefined(names) {
    ts.Debug.assert(names.every(function (name) { return name !== undefined; }), "A name is undefined.", function () { return JSON.stringify(names); });
    return names;
}
function loadWithLocalCache(names, containingFile, loader) {
    if (names.length === 0) {
        return [];
    }
    var resolutions = [];
    var cache = ts.createMap();
    for (var _i = 0, names_1 = names; _i < names_1.length; _i++) {
        var name = names_1[_i];
        var result = void 0;
        if (cache.has(name)) {
            result = cache.get(name);
        }
        else {
            cache.set(name, result = loader(name, containingFile));
        }
        resolutions.push(result);
    }
    return resolutions;
}
function shouldProgramCreateNewSourceFiles(program, newOptions) {
    // If any of these options change, we cant reuse old source file even if version match
    // The change in options like these could result in change in syntax tree change
    var oldOptions = program && program.getCompilerOptions();
    return oldOptions && (oldOptions.target !== newOptions.target ||
        oldOptions.module !== newOptions.module ||
        oldOptions.moduleResolution !== newOptions.moduleResolution ||
        oldOptions.noResolve !== newOptions.noResolve ||
        oldOptions.jsx !== newOptions.jsx ||
        oldOptions.allowJs !== newOptions.allowJs ||
        oldOptions.disableSizeLimit !== newOptions.disableSizeLimit ||
        oldOptions.baseUrl !== newOptions.baseUrl ||
        !ts.equalOwnProperties(oldOptions.paths, newOptions.paths));
}
function getModuleNames(_a) {
    var imports = _a.imports, moduleAugmentations = _a.moduleAugmentations;
    var res = imports.map(function (i) { return i.text; });
    for (var _i = 0, moduleAugmentations_1 = moduleAugmentations; _i < moduleAugmentations_1.length; _i++) {
        var aug = moduleAugmentations_1[_i];
        if (aug.kind === 9 /* StringLiteral */) {
            res.push(aug.text);
        }
        // Do nothing if it's an Identifier; we don't need to do module resolution for `declare global`.
    }
    return res;
}
function resolveTripleslashReference(moduleName, containingFile) {
    var basePath = ts.getDirectoryPath(containingFile);
    var referencedFileName = ts.isRootedDiskPath(moduleName) ? moduleName : ts.combinePaths(basePath, moduleName);
    return ts.normalizePath(referencedFileName);
}
function computeCommonSourceDirectoryOfFilenames(fileNames, currentDirectory, getCanonicalFileName) {
    var commonPathComponents;
    var failed = ts.forEach(fileNames, function (sourceFile) {
        // Each file contributes into common source file path
        var sourcePathComponents = ts.getNormalizedPathComponents(sourceFile, currentDirectory);
        sourcePathComponents.pop(); // The base file name is not part of the common directory path
        if (!commonPathComponents) {
            // first file
            commonPathComponents = sourcePathComponents;
            return;
        }
        var n = Math.min(commonPathComponents.length, sourcePathComponents.length);
        for (var i = 0; i < n; i++) {
            if (getCanonicalFileName(commonPathComponents[i]) !== getCanonicalFileName(sourcePathComponents[i])) {
                if (i === 0) {
                    // Failed to find any common path component
                    return true;
                }
                // New common path found that is 0 -> i-1
                commonPathComponents.length = i;
                break;
            }
        }
        // If the sourcePathComponents was shorter than the commonPathComponents, truncate to the sourcePathComponents
        if (sourcePathComponents.length < commonPathComponents.length) {
            commonPathComponents.length = sourcePathComponents.length;
        }
    });
    // A common path can not be found when paths span multiple drives on windows, for example
    if (failed) {
        return "";
    }
    if (!commonPathComponents) {
        return currentDirectory;
    }
    return ts.getNormalizedPathFromPathComponents(commonPathComponents);
}