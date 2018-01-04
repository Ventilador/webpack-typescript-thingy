const ts = require('typescript');
const onNextTick = require('../utils/processor');
const fs = require('./fs')();
const k = ts.SyntaxKind;
const getCanonicalFileName = ts.createGetCanonicalFileName(false);
const createTypeChecker = require('./createTypeChecker');
// const onNextTick = require('./../utils').onNextTick;
const ignoreDiagnosticCommentRegEx = /(^\s*$)|(^\s*\/\/\/?\s*(@ts-ignore)?)/;
const currentDirectory = process.cwd();
var SeenPackageName;
(function (SeenPackageName) {
    SeenPackageName[SeenPackageName.Exists = 0] = "Exists";
    SeenPackageName[SeenPackageName.Modified = 1] = "Modified";
})(SeenPackageName || (SeenPackageName = {}));
module.exports = asyncProgram;
const missingFilePaths = [];
const useCaseSensitiveFileNames = function () { return false; };
let program;
function asyncProgram(options) {
    if (program) {
        return program;
    }
    // globals?
    const defaultLibraryPath = ts.getDirectoryPath(getDefaultLibFileName());
    const supportedExtensions = ts.getSupportedExtensions(options);
    const sourceFileToPackageName = ts.createMap();
    const redirectTargetsSet = ts.createMap();
    const knownFiles = Object.create(null);
    let rootNames,
        diagnosticsProducingTypeChecker,
        files,
        noDiagnosticsTypeChecker,
        classifiableNames,
        commonSourceDirectory;
    const cancellationToken = new CancellationTokenObject();

    // reseteable?
    let fileProcessingDiagnostics,
        programDiagnostics,
        cachedSemanticDiagnosticsForFile,
        cachedDeclarationDiagnosticsForFile,
        sourceFilesFoundSearchingNodeModules,
        resolvedTypeReferenceDirectives,
        hasEmitBlockingDiagnostics;
    program = {
        reset: function () {
            fileProcessingDiagnostics = ts.createDiagnosticCollection();
            programDiagnostics = ts.createDiagnosticCollection();
            cachedSemanticDiagnosticsForFile = {};
            cachedDeclarationDiagnosticsForFile = {};
            sourceFilesFoundSearchingNodeModules = ts.createMap();
            resolvedTypeReferenceDirectives = ts.createMap();
            hasEmitBlockingDiagnostics = ts.createMap();
            return program;
        },
        getRootFileNames: function () { return rootNames; },
        getSourceFile: getSourceFile,
        getSourceFileByPath: fs.readSourceFile,
        getSourceFiles: getSourceFiles,
        getMissingFilePaths: function () { return missingFilePaths; },
        getCompilerOptions: getCompilerOptions,
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
        redirectTargetsSet: redirectTargetsSet,
        getDependencies: getDependencies,
        getEmitOutput: getEmitOutput,
        updateFile: function (path, content) {

            fs.writeFile(path, content);

        },
        loadRootFiles: loadRootFiles
    };

    return program.reset();
    function loadRootFiles(files_) {
        (rootNames = files_).reduce(function (prev, cur) {
            prev[fs.normalize(cur).toLowerCase()] = undefined;
            return prev;
        }, knownFiles);
        files = [];
    }
    function getEmitOutput(path) {
        return ts.getFileEmitOutput(program, fs.readSourceFile(path), false, cancellationToken, null);
    }
    function getSourceFileFromReferenceWorker(fileName, getSourceFile, fail, refFile) {
        if (ts.hasExtension(fileName)) {
            if (!options.allowNonTsExtensions && !ts.forEach(supportedExtensions, function (extension) { return ts.fileExtensionIs(getCanonicalFileName(fileName), extension); })) {
                if (fail) fail(ts.Diagnostics.File_0_has_unsupported_extension_The_only_supported_extensions_are_1, fileName, "'" + supportedExtensions.join("', '") + "'"); // jshint ignore:line
                return undefined;
            }
            var sourceFile = getSourceFile(fileName);
            if (fail) {
                if (!sourceFile) {
                    fail(ts.Diagnostics.File_0_not_found, fileName);
                }
                else if (refFile && getCanonicalFileName(fileName) === getCanonicalFileName(refFile.fileName)) {
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
    function resolveTripleslashReference(moduleName, containingFile) {
        var basePath = ts.getDirectoryPath(containingFile);
        var referencedFileName = ts.isRootedDiskPath(moduleName) ? moduleName : ts.combinePaths(basePath, moduleName);
        return ts.normalizePath(referencedFileName);
    }
    function getSourceFileFromReference(referencingFile, ref) {
        return getSourceFileFromReferenceWorker(resolveTripleslashReference(ref.fileName, referencingFile.fileName), function (fileName) { return fs.readSourceFile(toPath(fileName)); });
    }
    function dropDiagnosticsProducingTypeChecker() {
        diagnosticsProducingTypeChecker = undefined;
    }
    function getDefaultLibFileName() {
        return ts.getDefaultLibFilePath(options);
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
            return ts.compareStrings(file.fileName, getDefaultLibFileName(), /*ignoreCase*/ !useCaseSensitiveFileNames()) === 0 /* EqualTo */;
        }
        else {
            return ts.forEach(options.lib, function (libFileName) { return ts.compareStrings(file.fileName, ts.combinePaths(defaultLibraryPath, libFileName), /*ignoreCase*/ !useCaseSensitiveFileNames()) === 0 /* EqualTo */; });
        }
    }
    function isSourceFileFromExternalLibrary(file) {
        return sourceFilesFoundSearchingNodeModules.get(file.path);
    }
    function getCompilerOptions() { return options; }
    function emit(sourceFile, writeFileCallback, cancellationToken, emitOnlyDtsFiles, customTransformers) {
        var declarationDiagnostics = [];
        if (options.noEmit) {
            return { diagnostics: declarationDiagnostics, sourceMaps: undefined, emittedFiles: undefined, emitSkipped: true };
        }
        // If the noEmitOnError flag is set, then check if we have any errors so far.  If so,
        // immediately bail out.  Note that we pass 'undefined' for 'sourceFile' so that we
        // get any preEmit diagnostics, not just the ones
        if (options.noEmitOnError) {
            var diagnostics = getOptionsDiagnostics(cancellationToken).concat(getSyntacticDiagnostics(sourceFile, cancellationToken), getGlobalDiagnostics(cancellationToken), getSemanticDiagnostics(sourceFile, cancellationToken));
            if (diagnostics.length === 0 && getCompilerOptions().declaration) {
                declarationDiagnostics = getDeclarationDiagnostics(/*sourceFile*/ undefined, cancellationToken);
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
    function getEmitHost(writeFileCallback) {
        return {
            getCanonicalFileName: getCanonicalFileName,
            getCommonSourceDirectory: program.getCommonSourceDirectory,
            getCompilerOptions: program.getCompilerOptions,
            getCurrentDirectory: function () { return currentDirectory; },
            getNewLine: getNewLine,
            getSourceFile: program.getSourceFile,
            getSourceFileByPath: program.getSourceFileByPath,
            getSourceFiles: program.getSourceFiles,
            isSourceFileFromExternalLibrary: isSourceFileFromExternalLibrary,
            writeFile: writeFileCallback || (function (fileName, data, writeByteOrderMark, onError, sourceFiles) { return toPath(fileName, data, writeByteOrderMark, onError, sourceFiles); }),
            isEmitBlocked: isEmitBlocked
        };
    }
    function isEmitBlocked(emitFileName) {
        return hasEmitBlockingDiagnostics.has(toPath(emitFileName));
    }
    function toPath(fileName) {
        return ts.toPath(fileName, currentDirectory, getCanonicalFileName);
    }


    function checkSourceFilesBelongToPath(sourceFiles, rootDirectory) {
        var allFilesBelongToPath = true;
        if (sourceFiles) {
            var absoluteRootDirectoryPath = getCanonicalFileName(ts.getNormalizedAbsolutePath(rootDirectory, currentDirectory));
            for (var _i = 0, sourceFiles_3 = sourceFiles; _i < sourceFiles_3.length; _i++) {
                var sourceFile = sourceFiles_3[_i];
                if (!sourceFile.isDeclarationFile) {
                    var absoluteSourceFilePath = getCanonicalFileName(ts.getNormalizedAbsolutePath(sourceFile.fileName, currentDirectory));
                    if (absoluteSourceFilePath.indexOf(absoluteRootDirectoryPath) !== 0) {
                        programDiagnostics.add(ts.createCompilerDiagnostic(ts.Diagnostics.File_0_is_not_under_rootDir_1_rootDir_is_expected_to_contain_all_source_files, sourceFile.fileName, options.rootDir));
                        allFilesBelongToPath = false;
                    }
                }
            }
        }
        return allFilesBelongToPath;
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
    function getDeclarationDiagnosticsWorker(sourceFile, cancellationToken) {
        return getAndCacheDiagnostics(sourceFile, cancellationToken, cachedDeclarationDiagnosticsForFile, getDeclarationDiagnosticsForFileNoCache);
    }
    function getDeclarationDiagnosticsForFileNoCache(sourceFile, cancellationToken) {
        var resolver = getDiagnosticsProducingTypeChecker().getEmitResolver(sourceFile, cancellationToken);
        // Don't actually write any files since we're just getting diagnostics.
        return ts.getDeclarationDiagnostics(getEmitHost(ts.noop), resolver, sourceFile);
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
    function getDeclarationDiagnosticsForFile(sourceFile, cancellationToken) {
        return sourceFile.isDeclarationFile ? [] : getDeclarationDiagnosticsWorker(sourceFile, cancellationToken);
    }
    function getGlobalDiagnostics() {
        return ts.sortAndDeduplicateDiagnostics(getDiagnosticsProducingTypeChecker().getGlobalDiagnostics().slice());
    }
    function getOptionsDiagnostics() {
        return ts.sortAndDeduplicateDiagnostics(ts.concatenate(fileProcessingDiagnostics.getGlobalDiagnostics(), ts.concatenate(programDiagnostics.getGlobalDiagnostics(), options.configFile ? programDiagnostics.getDiagnostics(options.configFile.fileName) : [])));
    }
    function getSourceFile(path) {
        return fs.readSourceFile(toPath(path, currentDirectory, getCanonicalFileName));
    }
    function getSyntacticDiagnostics(sourceFile, cancellationToken) {
        return getDiagnosticsHelper(sourceFile, getSyntacticDiagnosticsForFile, cancellationToken);
    }
    function getDiagnosticsHelper(sourceFile, getDiagnostics, cancellationToken) {
        if (sourceFile) {
            return getDiagnostics(sourceFile, cancellationToken);
        }
        return ts.sortAndDeduplicateDiagnostics(ts.flatMap(getSourceFiles(), function (sourceFile) {
            if (cancellationToken) {
                cancellationToken.throwIfCancellationRequested();
            }
            return getDiagnostics(sourceFile, cancellationToken);
        }));
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
    function getSourceFiles() {
        return files;
    }
    function getJavaScriptSyntacticDiagnosticsForFile(sourceFile) {
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
    }
    function getDiagnosticsProducingTypeChecker() {
        return diagnosticsProducingTypeChecker || (diagnosticsProducingTypeChecker = createTypeChecker(program, /*produceDiagnostics:*/ true));
    }
    function getSemanticDiagnostics(sourceFile, cancellationToken) {
        return getDiagnosticsHelper(sourceFile, getSemanticDiagnosticsForFile, cancellationToken);
    }
    function getSemanticDiagnosticsForFile(sourceFile, cancellationToken) {
        return getAndCacheDiagnostics(sourceFile, cancellationToken, cachedSemanticDiagnosticsForFile, getSemanticDiagnosticsForFileNoCache);
    }
    function getSemanticDiagnosticsForFileNoCache(sourceFile, cancellationToken) {
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
    }
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
    function getTypeChecker() {
        return noDiagnosticsTypeChecker || (noDiagnosticsTypeChecker = createTypeChecker(program, /*produceDiagnostics:*/ false));
    }
    function getDependencies(file, options, done) {
        var path = ts.toPath(file, currentDirectory, getCanonicalFileName);
        let queued = 0;
        const imports = [];
        const args = [queueVisit, done, imports];

        let sourceFile = fs.readSourceFile(path);
        if (sourceFile) {
            sourceFile = ts.updateLanguageServiceSourceFile(path, fs.getSnapshot(path), options.target, fs.getVersion(path), /*setNodeParents*/ false, ts.ScriptKind.TS);
        } else {
            const text = fs.readFile(path);
            if (!text) {
                throw 'No content found for ' + path;
            }
            sourceFile = ts.createLanguageServiceSourceFile(path, fs.getSnapshot(path), options.target, fs.getVersion(path), /*setNodeParents*/ false, ts.ScriptKind.TS);
        }
        fs.writeSourceFile(path, sourceFile);

        let deps = fs.getFileDependencies(path);
        if (deps) {
            onNextTick(done, null, [deps, sourceFile]);
            return;
        }
        ts.forEachChild(sourceFile, queueVisit);
        path = fs.normalize(path).toLowerCase();
        if (!knownFiles[path]) {
            knownFiles[path] = true;
            files.push(sourceFile);
        }
        function queueVisit(node) {
            queued++;
            onNextTick.shortPile(visit, node, args);
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
                const deps = unique(importedModules);
                fs.setFileDependencies(path, deps);
                done(deps, sourceFile);
            }
        }
    }
}
function getNewLine() { return '\r\n'; }

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


function CancellationTokenObject(cancellationToken) {
    this.cancellationToken = cancellationToken;
}
CancellationTokenObject.prototype.isCancellationRequested = function () {
    return this.cancellationToken && this.cancellationToken.isCancellationRequested();
};
CancellationTokenObject.prototype.throwIfCancellationRequested = function () {
    if (this.isCancellationRequested()) {
        throw new ts.OperationCanceledException();
    }
};