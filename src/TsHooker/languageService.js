const ts = require('typescript');
const createProgram = require('./createAsymmetricProgram');
module.exports = function createLanguageService(host, documentRegistry) {
    if (documentRegistry === void 0) { documentRegistry = ts.createDocumentRegistry(host.useCaseSensitiveFileNames && host.useCaseSensitiveFileNames(), host.getCurrentDirectory()); }
    var syntaxTreeCache = new SyntaxTreeCache(host);
    var ruleProvider = new ts.formatting.RulesProvider();
    var program;
    var lastProjectVersion;
    var lastTypesRootVersion = 0;
    var useCaseSensitivefileNames = host.useCaseSensitiveFileNames && host.useCaseSensitiveFileNames();
    var cancellationToken = new CancellationTokenObject(host.getCancellationToken && host.getCancellationToken());
    var currentDirectory = host.getCurrentDirectory();
    // Check if the localized messages json is set, otherwise query the host for it
    if (!ts.localizedDiagnosticMessages && host.getLocalizedDiagnosticMessages) {
        ts.localizedDiagnosticMessages = host.getLocalizedDiagnosticMessages();
    }
    function log(message) {
        if (host.log) {
            host.log(message);
        }
    }
    var getCanonicalFileName = ts.createGetCanonicalFileName(useCaseSensitivefileNames);
    function getValidSourceFile(fileName) {
        var sourceFile = program.getSourceFile(fileName);
        if (!sourceFile) {
            throw new Error("Could not find file: '" + fileName + "'.");
        }
        return sourceFile;
    }
    function getRuleProvider(options) {
        ruleProvider.ensureUpToDate(options);
        return ruleProvider;
    }
    function synchronizeHostData() {
        // perform fast check if host supports it
        if (host.getProjectVersion) {
            var hostProjectVersion = host.getProjectVersion();
            if (hostProjectVersion) {
                if (lastProjectVersion === hostProjectVersion && !host.hasChangedAutomaticTypeDirectiveNames) {
                    return;
                }
                lastProjectVersion = hostProjectVersion;
            }
        }
        var typeRootsVersion = host.getTypeRootsVersion ? host.getTypeRootsVersion() : 0;
        if (lastTypesRootVersion !== typeRootsVersion) {
            log("TypeRoots version has changed; provide new program");
            program = undefined;
            lastTypesRootVersion = typeRootsVersion;
        }
        // Get a fresh cache of the host information
        var hostCache = new HostCache(host, getCanonicalFileName);
        var rootFileNames = hostCache.getRootFileNames();
        var hasInvalidatedResolution = host.hasInvalidatedResolution || ts.returnFalse;
        // If the program is already up-to-date, we can reuse it
        if (ts.isProgramUptoDate(program, rootFileNames, hostCache.compilationSettings(), function (path) { return hostCache.getVersion(path); }, fileExists, hasInvalidatedResolution, host.hasChangedAutomaticTypeDirectiveNames)) {
            return;
        }
        // IMPORTANT - It is critical from this moment onward that we do not check
        // cancellation tokens.  We are about to mutate source files from a previous program
        // instance.  If we cancel midway through, we may end up in an inconsistent state where
        // the program points to old source files that have been invalidated because of
        // incremental parsing.
        var newSettings = hostCache.compilationSettings();
        // Now create a new compiler
        var compilerHost = {
            getSourceFile: getOrCreateSourceFile,
            getSourceFileByPath: getOrCreateSourceFileByPath,
            getCancellationToken: function () { return cancellationToken; },
            getCanonicalFileName: getCanonicalFileName,
            useCaseSensitiveFileNames: function () { return useCaseSensitivefileNames; },
            getNewLine: function () { return ts.getNewLineCharacter(newSettings, { newLine: ts.getNewLineOrDefaultFromHost(host) }); },
            getDefaultLibFileName: function (options) { return host.getDefaultLibFileName(options); },
            writeFile: ts.noop,
            getCurrentDirectory: function () { return currentDirectory; },
            fileExists: fileExists,
            readFile: function (fileName) {
                // stub missing host functionality
                var path = ts.toPath(fileName, currentDirectory, getCanonicalFileName);
                var entry = hostCache.getEntryByPath(path);
                if (entry) {
                    return ts.isString(entry) ? undefined : entry.scriptSnapshot.getText(0, entry.scriptSnapshot.getLength());
                }
                return host.readFile && host.readFile(fileName);
            },
            directoryExists: function (directoryName) {
                return ts.directoryProbablyExists(directoryName, host);
            },
            getDirectories: function (path) {
                return host.getDirectories ? host.getDirectories(path) : [];
            },
            onReleaseOldSourceFile: onReleaseOldSourceFile,
            hasInvalidatedResolution: hasInvalidatedResolution,
            hasChangedAutomaticTypeDirectiveNames: host.hasChangedAutomaticTypeDirectiveNames
        };
        if (host.trace) {
            compilerHost.trace = function (message) { return host.trace(message); };
        }
        if (host.resolveModuleNames) {
            compilerHost.resolveModuleNames = function (moduleNames, containingFile, reusedNames) { return host.resolveModuleNames(moduleNames, containingFile, reusedNames); };
        }
        if (host.resolveTypeReferenceDirectives) {
            compilerHost.resolveTypeReferenceDirectives = function (typeReferenceDirectiveNames, containingFile) {
                return host.resolveTypeReferenceDirectives(typeReferenceDirectiveNames, containingFile);
            };
        }
        var documentRegistryBucketKey = documentRegistry.getKeyForCompilationSettings(newSettings);
        program = createProgram(rootFileNames, newSettings, compilerHost, program);
        // hostCache is captured in the closure for 'getOrCreateSourceFile' but it should not be used past this point.
        // It needs to be cleared to allow all collected snapshots to be released
        hostCache = undefined;
        // Make sure all the nodes in the program are both bound, and have their parent
        // pointers set property.
        program.getTypeChecker();
        return;
        function fileExists(fileName) {
            var path = ts.toPath(fileName, currentDirectory, getCanonicalFileName);
            var entry = hostCache.getEntryByPath(path);
            return entry ?
                !ts.isString(entry) :
                (host.fileExists && host.fileExists(fileName));
        }
        // Release any files we have acquired in the old program but are
        // not part of the new program.
        function onReleaseOldSourceFile(oldSourceFile, oldOptions) {
            var oldSettingsKey = documentRegistry.getKeyForCompilationSettings(oldOptions);
            documentRegistry.releaseDocumentWithKey(oldSourceFile.path, oldSettingsKey);
        }
        function getOrCreateSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile) {
            return getOrCreateSourceFileByPath(fileName, ts.toPath(fileName, currentDirectory, getCanonicalFileName), languageVersion, onError, shouldCreateNewSourceFile);
        }
        function getOrCreateSourceFileByPath(fileName, path, _languageVersion, _onError, shouldCreateNewSourceFile) {
            ts.Debug.assert(hostCache !== undefined);
            // The program is asking for this file, check first if the host can locate it.
            // If the host can not locate the file, then it does not exist. return undefined
            // to the program to allow reporting of errors for missing files.
            var hostFileInformation = hostCache.getOrCreateEntryByPath(fileName, path);
            if (!hostFileInformation) {
                return undefined;
            }
            // Check if the language version has changed since we last created a program; if they are the same,
            // it is safe to reuse the sourceFiles; if not, then the shape of the AST can change, and the oldSourceFile
            // can not be reused. we have to dump all syntax trees and create new ones.
            if (!shouldCreateNewSourceFile) {
                // Check if the old program had this file already
                var oldSourceFile = program && program.getSourceFileByPath(path);
                if (oldSourceFile) {
                    // We already had a source file for this file name.  Go to the registry to
                    // ensure that we get the right up to date version of it.  We need this to
                    // address the following race-condition.  Specifically, say we have the following:
                    //
                    //      LS1
                    //          \
                    //           DocumentRegistry
                    //          /
                    //      LS2
                    //
                    // Each LS has a reference to file 'foo.ts' at version 1.  LS2 then updates
                    // it's version of 'foo.ts' to version 2.  This will cause LS2 and the
                    // DocumentRegistry to have version 2 of the document.  HOwever, LS1 will
                    // have version 1.  And *importantly* this source file will be *corrupt*.
                    // The act of creating version 2 of the file irrevocably damages the version
                    // 1 file.
                    //
                    // So, later when we call into LS1, we need to make sure that it doesn't use
                    // it's source file any more, and instead defers to DocumentRegistry to get
                    // either version 1, version 2 (or some other version) depending on what the
                    // host says should be used.
                    // We do not support the scenario where a host can modify a registered
                    // file's script kind, i.e. in one project some file is treated as ".ts"
                    // and in another as ".js"
                    ts.Debug.assertEqual(hostFileInformation.scriptKind, oldSourceFile.scriptKind, "Registered script kind should match new script kind.", path);
                    return documentRegistry.updateDocumentWithKey(fileName, path, newSettings, documentRegistryBucketKey, hostFileInformation.scriptSnapshot, hostFileInformation.version, hostFileInformation.scriptKind);
                }
                // We didn't already have the file.  Fall through and acquire it from the registry.
            }
            // Could not find this file in the old program, create a new SourceFile for it.
            return documentRegistry.acquireDocumentWithKey(fileName, path, newSettings, documentRegistryBucketKey, hostFileInformation.scriptSnapshot, hostFileInformation.version, hostFileInformation.scriptKind);
        }
    }
    function getProgram() {
        synchronizeHostData();
        return program;
    }
    function cleanupSemanticCache() {
        program = undefined;
    }
    function dispose() {
        if (program) {
            ts.forEach(program.getSourceFiles(), function (f) {
                return documentRegistry.releaseDocument(f.fileName, program.getCompilerOptions());
            });
            program = undefined;
        }
        host = undefined;
    }
    /// Diagnostics
    function getSyntacticDiagnostics(fileName) {
        synchronizeHostData();
        return program.getSyntacticDiagnostics(getValidSourceFile(fileName), cancellationToken).slice();
    }
    /**
     * getSemanticDiagnostics return array of Diagnostics. If '-d' is not enabled, only report semantic errors
     * If '-d' enabled, report both semantic and emitter errors
     */
    function getSemanticDiagnostics(fileName) {
        synchronizeHostData();
        var targetSourceFile = getValidSourceFile(fileName);
        // Only perform the action per file regardless of '-out' flag as LanguageServiceHost is expected to call this function per file.
        // Therefore only get diagnostics for given file.
        var semanticDiagnostics = program.getSemanticDiagnostics(targetSourceFile, cancellationToken);
        if (!program.getCompilerOptions().declaration) {
            return semanticDiagnostics.slice();
        }
        // If '-d' is enabled, check for emitter error. One example of emitter error is export class implements non-export interface
        var declarationDiagnostics = program.getDeclarationDiagnostics(targetSourceFile, cancellationToken);
        return semanticDiagnostics.concat(declarationDiagnostics);
    }
    function getCompilerOptionsDiagnostics() {
        synchronizeHostData();
        return program.getOptionsDiagnostics(cancellationToken).concat(program.getGlobalDiagnostics(cancellationToken));
    }
    function getCompletionsAtPosition(fileName, position, options) {
        if (options === void 0) { options = { includeExternalModuleExports: false }; }
        synchronizeHostData();
        return ts.Completions.getCompletionsAtPosition(host, program.getTypeChecker(), log, program.getCompilerOptions(), getValidSourceFile(fileName), position, program.getSourceFiles(), options);
    }
    function getCompletionEntryDetails(fileName, position, name, formattingOptions, source) {
        synchronizeHostData();
        var ruleProvider = formattingOptions ? getRuleProvider(formattingOptions) : undefined;
        return ts.Completions.getCompletionEntryDetails(program.getTypeChecker(), log, program.getCompilerOptions(), getValidSourceFile(fileName), position, { name: name, source: source }, program.getSourceFiles(), host, ruleProvider, getCanonicalFileName);
    }
    function getCompletionEntrySymbol(fileName, position, name, source) {
        synchronizeHostData();
        return ts.Completions.getCompletionEntrySymbol(program.getTypeChecker(), log, program.getCompilerOptions(), getValidSourceFile(fileName), position, { name: name, source: source }, program.getSourceFiles());
    }
    function getQuickInfoAtPosition(fileName, position) {
        synchronizeHostData();
        var sourceFile = getValidSourceFile(fileName);
        var node = ts.getTouchingPropertyName(sourceFile, position, /*includeJsDocComment*/ true);
        if (node === sourceFile) {
            return undefined;
        }
        if (ts.isLabelName(node)) {
            return undefined;
        }
        var typeChecker = program.getTypeChecker();
        var symbol = getSymbolAtLocationForQuickInfo(node, typeChecker);
        if (!symbol || typeChecker.isUnknownSymbol(symbol)) {
            // Try getting just type at this position and show
            switch (node.kind) {
                case 71 /* Identifier */:
                case 179 /* PropertyAccessExpression */:
                case 143 /* QualifiedName */:
                case 99 /* ThisKeyword */:
                case 169 /* ThisType */:
                case 97 /* SuperKeyword */:
                    // For the identifiers/this/super etc get the type at position
                    var type = typeChecker.getTypeAtLocation(node);
                    if (type) {
                        return {
                            kind: "" /* unknown */,
                            kindModifiers: "" /* none */,
                            textSpan: ts.createTextSpan(node.getStart(), node.getWidth()),
                            displayParts: ts.typeToDisplayParts(typeChecker, type, ts.getContainerNode(node)),
                            documentation: type.symbol ? type.symbol.getDocumentationComment() : undefined,
                            tags: type.symbol ? type.symbol.getJsDocTags() : undefined
                        };
                    }
            }
            return undefined;
        }
        var displayPartsDocumentationsAndKind = ts.SymbolDisplay.getSymbolDisplayPartsDocumentationAndSymbolKind(typeChecker, symbol, sourceFile, ts.getContainerNode(node), node);
        return {
            kind: displayPartsDocumentationsAndKind.symbolKind,
            kindModifiers: ts.SymbolDisplay.getSymbolModifiers(symbol),
            textSpan: ts.createTextSpan(node.getStart(), node.getWidth()),
            displayParts: displayPartsDocumentationsAndKind.displayParts,
            documentation: displayPartsDocumentationsAndKind.documentation,
            tags: displayPartsDocumentationsAndKind.tags
        };
    }
    function getSymbolAtLocationForQuickInfo(node, checker) {
        if ((ts.isIdentifier(node) || ts.isStringLiteral(node))
            && ts.isPropertyAssignment(node.parent) // jshint ignore:line
            && node.parent.name === node) { // jshint ignore:line
            var type = checker.getContextualType(node.parent.parent);
            if (type) {
                var property = checker.getPropertyOfType(type, ts.getTextOfIdentifierOrLiteral(node));
                if (property) {
                    return property;
                }
            }
        }
        return checker.getSymbolAtLocation(node);
    }
    /// Goto definition
    function getDefinitionAtPosition(fileName, position) {
        synchronizeHostData();
        return ts.GoToDefinition.getDefinitionAtPosition(program, getValidSourceFile(fileName), position);
    }
    function getTypeDefinitionAtPosition(fileName, position) {
        synchronizeHostData();
        return ts.GoToDefinition.getTypeDefinitionAtPosition(program.getTypeChecker(), getValidSourceFile(fileName), position);
    }
    /// Goto implementation
    function getImplementationAtPosition(fileName, position) {
        synchronizeHostData();
        return ts.FindAllReferences.getImplementationsAtPosition(program, cancellationToken, program.getSourceFiles(), getValidSourceFile(fileName), position);
    }
    /// References and Occurrences
    function getOccurrencesAtPosition(fileName, position) {
        var results = getOccurrencesAtPositionCore(fileName, position);
        if (results) {
            var sourceFile_1 = getCanonicalFileName(ts.normalizeSlashes(fileName));
            // Get occurrences only supports reporting occurrences for the file queried.  So
            // filter down to that list.
            results = ts.filter(results, function (r) { return getCanonicalFileName(ts.normalizeSlashes(r.fileName)) === sourceFile_1; });
        }
        return results;
    }
    function getDocumentHighlights(fileName, position, filesToSearch) {
        synchronizeHostData();
        var sourceFilesToSearch = ts.map(filesToSearch, function (f) { return program.getSourceFile(f); });
        var sourceFile = getValidSourceFile(fileName);
        return ts.DocumentHighlights.getDocumentHighlights(program, cancellationToken, sourceFile, position, sourceFilesToSearch);
    }
    function getOccurrencesAtPositionCore(fileName, position) {
        return convertDocumentHighlights(getDocumentHighlights(fileName, position, [fileName]));
        function convertDocumentHighlights(documentHighlights) {
            if (!documentHighlights) {
                return undefined;
            }
            var result = [];
            for (var _i = 0, documentHighlights_1 = documentHighlights; _i < documentHighlights_1.length; _i++) {
                var entry = documentHighlights_1[_i];
                for (var _a = 0, _b = entry.highlightSpans; _a < _b.length; _a++) {
                    var highlightSpan = _b[_a];
                    result.push({
                        fileName: entry.fileName,
                        textSpan: highlightSpan.textSpan,
                        isWriteAccess: highlightSpan.kind === "writtenReference" /* writtenReference */,
                        isDefinition: false,
                        isInString: highlightSpan.isInString,
                    });
                }
            }
            return result;
        }
    }
    function findRenameLocations(fileName, position, findInStrings, findInComments) {
        return getReferences(fileName, position, { findInStrings: findInStrings, findInComments: findInComments, isForRename: true });
    }
    function getReferencesAtPosition(fileName, position) {
        return getReferences(fileName, position);
    }
    function getReferences(fileName, position, options) {
        synchronizeHostData();
        // Exclude default library when renaming as commonly user don't want to change that file.
        var sourceFiles = [];
        if (options && options.isForRename) {
            for (var _i = 0, _a = program.getSourceFiles(); _i < _a.length; _i++) {
                var sourceFile = _a[_i];
                if (!program.isSourceFileDefaultLibrary(sourceFile)) {
                    sourceFiles.push(sourceFile);
                }
            }
        }
        else {
            sourceFiles = program.getSourceFiles().slice();
        }
        return ts.FindAllReferences.findReferencedEntries(program, cancellationToken, sourceFiles, getValidSourceFile(fileName), position, options);
    }
    function findReferences(fileName, position) {
        synchronizeHostData();
        return ts.FindAllReferences.findReferencedSymbols(program, cancellationToken, program.getSourceFiles(), getValidSourceFile(fileName), position);
    }
    /// NavigateTo
    function getNavigateToItems(searchValue, maxResultCount, fileName, excludeDtsFiles) {
        synchronizeHostData();
        var sourceFiles = fileName ? [getValidSourceFile(fileName)] : program.getSourceFiles();
        return ts.NavigateTo.getNavigateToItems(sourceFiles, program.getTypeChecker(), cancellationToken, searchValue, maxResultCount, excludeDtsFiles);
    }
    function getEmitOutput(fileName, emitOnlyDtsFiles) {
        synchronizeHostData();
        var sourceFile = getValidSourceFile(fileName);
        var customTransformers = host.getCustomTransformers && host.getCustomTransformers();
        return ts.getFileEmitOutput(program, sourceFile, emitOnlyDtsFiles, cancellationToken, customTransformers);
    }
    // Signature help
    /**
     * This is a semantic operation.
     */
    function getSignatureHelpItems(fileName, position) {
        synchronizeHostData();
        var sourceFile = getValidSourceFile(fileName);
        return ts.SignatureHelp.getSignatureHelpItems(program, sourceFile, position, cancellationToken);
    }
    /// Syntactic features
    function getNonBoundSourceFile(fileName) {
        return syntaxTreeCache.getCurrentSourceFile(fileName);
    }
    function getSourceFile(fileName) {
        return getNonBoundSourceFile(fileName);
    }
    function getNameOrDottedNameSpan(fileName, startPos/*, _endPos*/) {
        var sourceFile = syntaxTreeCache.getCurrentSourceFile(fileName);
        // Get node at the location
        var node = ts.getTouchingPropertyName(sourceFile, startPos, /*includeJsDocComment*/ false);
        if (node === sourceFile) {
            return;
        }
        switch (node.kind) {
            case 179 /* PropertyAccessExpression */:
            case 143 /* QualifiedName */:
            case 9 /* StringLiteral */:
            case 86 /* FalseKeyword */:
            case 101 /* TrueKeyword */:
            case 95 /* NullKeyword */:
            case 97 /* SuperKeyword */:
            case 99 /* ThisKeyword */:
            case 169 /* ThisType */:
            case 71 /* Identifier */:
                break;
            // Cant create the text span
            default:
                return;
        }
        var nodeForStartPos = node;
        while (true) {
            if (ts.isRightSideOfPropertyAccess(nodeForStartPos) || ts.isRightSideOfQualifiedName(nodeForStartPos)) {
                // If on the span is in right side of the the property or qualified name, return the span from the qualified name pos to end of this node
                nodeForStartPos = nodeForStartPos.parent;
            }
            else if (ts.isNameOfModuleDeclaration(nodeForStartPos)) {
                // If this is name of a module declarations, check if this is right side of dotted module name
                // If parent of the module declaration which is parent of this node is module declaration and its body is the module declaration that this node is name of
                // Then this name is name from dotted module
                if (nodeForStartPos.parent.parent.kind === 233 /* ModuleDeclaration */ &&
                    nodeForStartPos.parent.parent.body === nodeForStartPos.parent) {
                    // Use parent module declarations name for start pos
                    nodeForStartPos = nodeForStartPos.parent.parent.name;
                }
                else {
                    // We have to use this name for start pos
                    break;
                }
            }
            else {
                // Is not a member expression so we have found the node for start pos
                break;
            }
        }
        return ts.createTextSpanFromBounds(nodeForStartPos.getStart(), node.getEnd());
    }
    function getBreakpointStatementAtPosition(fileName, position) {
        // doesn't use compiler - no need to synchronize with host
        var sourceFile = syntaxTreeCache.getCurrentSourceFile(fileName);
        return ts.BreakpointResolver.spanInSourceFileAtLocation(sourceFile, position);
    }
    function getNavigationBarItems(fileName) {
        return ts.NavigationBar.getNavigationBarItems(syntaxTreeCache.getCurrentSourceFile(fileName), cancellationToken);
    }
    function getNavigationTree(fileName) {
        return ts.NavigationBar.getNavigationTree(syntaxTreeCache.getCurrentSourceFile(fileName), cancellationToken);
    }
    function isTsOrTsxFile(fileName) {
        var kind = ts.getScriptKind(fileName, host);
        return kind === 3 /* TS */ || kind === 4 /* TSX */;
    }
    function getSemanticClassifications(fileName, span) {
        if (!isTsOrTsxFile(fileName)) {
            // do not run semantic classification on non-ts-or-tsx files
            return [];
        }
        synchronizeHostData();
        return ts.getSemanticClassifications(program.getTypeChecker(), cancellationToken, getValidSourceFile(fileName), program.getClassifiableNames(), span);
    }
    function getEncodedSemanticClassifications(fileName, span) {
        if (!isTsOrTsxFile(fileName)) {
            // do not run semantic classification on non-ts-or-tsx files
            return { spans: [], endOfLineState: 0 /* None */ };
        }
        synchronizeHostData();
        return ts.getEncodedSemanticClassifications(program.getTypeChecker(), cancellationToken, getValidSourceFile(fileName), program.getClassifiableNames(), span);
    }
    function getSyntacticClassifications(fileName, span) {
        // doesn't use compiler - no need to synchronize with host
        return ts.getSyntacticClassifications(cancellationToken, syntaxTreeCache.getCurrentSourceFile(fileName), span);
    }
    function getEncodedSyntacticClassifications(fileName, span) {
        // doesn't use compiler - no need to synchronize with host
        return ts.getEncodedSyntacticClassifications(cancellationToken, syntaxTreeCache.getCurrentSourceFile(fileName), span);
    }
    function getOutliningSpans(fileName) {
        // doesn't use compiler - no need to synchronize with host
        var sourceFile = syntaxTreeCache.getCurrentSourceFile(fileName);
        return ts.OutliningElementsCollector.collectElements(sourceFile, cancellationToken);
    }
    function getBraceMatchingAtPosition(fileName, position) {
        var sourceFile = syntaxTreeCache.getCurrentSourceFile(fileName);
        var result = [];
        var token = ts.getTouchingToken(sourceFile, position, /*includeJsDocComment*/ false);
        if (token.getStart(sourceFile) === position) {
            var matchKind = getMatchingTokenKind(token);
            // Ensure that there is a corresponding token to match ours.
            if (matchKind) {
                var parentElement = token.parent;
                var childNodes = parentElement.getChildren(sourceFile);
                for (var _i = 0, childNodes_1 = childNodes; _i < childNodes_1.length; _i++) {
                    var current = childNodes_1[_i];
                    if (current.kind === matchKind) {
                        var range1 = ts.createTextSpan(token.getStart(sourceFile), token.getWidth(sourceFile));
                        var range2 = ts.createTextSpan(current.getStart(sourceFile), current.getWidth(sourceFile));
                        // We want to order the braces when we return the result.
                        if (range1.start < range2.start) {
                            result.push(range1, range2);
                        }
                        else {
                            result.push(range2, range1);
                        }
                        break;
                    }
                }
            }
        }
        return result;
        function getMatchingTokenKind(token) {
            switch (token.kind) {
                case 17 /* OpenBraceToken */: return 18 /* CloseBraceToken */;
                case 19 /* OpenParenToken */: return 20 /* CloseParenToken */;
                case 21 /* OpenBracketToken */: return 22 /* CloseBracketToken */;
                case 27 /* LessThanToken */: return 29 /* GreaterThanToken */;
                case 18 /* CloseBraceToken */: return 17 /* OpenBraceToken */;
                case 20 /* CloseParenToken */: return 19 /* OpenParenToken */;
                case 22 /* CloseBracketToken */: return 21 /* OpenBracketToken */;
                case 29 /* GreaterThanToken */: return 27 /* LessThanToken */;
            }
            return undefined;
        }
    }
    function getIndentationAtPosition(fileName, position, editorOptions) {
        var start = ts.timestamp();
        var settings = ts.toEditorSettings(editorOptions);
        var sourceFile = syntaxTreeCache.getCurrentSourceFile(fileName);
        log("getIndentationAtPosition: getCurrentSourceFile: " + (ts.timestamp() - start));
        start = ts.timestamp();
        var result = ts.formatting.SmartIndenter.getIndentation(position, sourceFile, settings);
        log("getIndentationAtPosition: computeIndentation  : " + (ts.timestamp() - start));
        return result;
    }
    function getFormattingEditsForRange(fileName, start, end, options) {
        var sourceFile = syntaxTreeCache.getCurrentSourceFile(fileName);
        var settings = ts.toEditorSettings(options);
        return ts.formatting.formatSelection(start, end, sourceFile, getRuleProvider(settings), settings);
    }
    function getFormattingEditsForDocument(fileName, options) {
        var sourceFile = syntaxTreeCache.getCurrentSourceFile(fileName);
        var settings = ts.toEditorSettings(options);
        return ts.formatting.formatDocument(sourceFile, getRuleProvider(settings), settings);
    }
    function getFormattingEditsAfterKeystroke(fileName, position, key, options) {
        var sourceFile = syntaxTreeCache.getCurrentSourceFile(fileName);
        var settings = ts.toEditorSettings(options);
        if (!ts.isInComment(sourceFile, position)) {
            if (key === "{") {
                return ts.formatting.formatOnOpeningCurly(position, sourceFile, getRuleProvider(settings), settings);
            }
            else if (key === "}") {
                return ts.formatting.formatOnClosingCurly(position, sourceFile, getRuleProvider(settings), settings);
            }
            else if (key === ";") {
                return ts.formatting.formatOnSemicolon(position, sourceFile, getRuleProvider(settings), settings);
            }
            else if (key === "\n") {
                return ts.formatting.formatOnEnter(position, sourceFile, getRuleProvider(settings), settings);
            }
        }
        return [];
    }
    function getCodeFixesAtPosition(fileName, start, end, errorCodes, formatOptions) {
        synchronizeHostData();
        var sourceFile = getValidSourceFile(fileName);
        var span = ts.createTextSpanFromBounds(start, end);
        var newLineCharacter = ts.getNewLineOrDefaultFromHost(host);
        var rulesProvider = getRuleProvider(formatOptions);
        return ts.flatMap(ts.deduplicate(errorCodes), function (errorCode) {
            cancellationToken.throwIfCancellationRequested();
            return ts.codefix.getFixes({ errorCode: errorCode, sourceFile: sourceFile, span: span, program: program, newLineCharacter: newLineCharacter, host: host, cancellationToken: cancellationToken, rulesProvider: rulesProvider });
        });
    }
    function applyCodeActionCommand(fileName, actionOrUndefined) {
        var action = typeof fileName === "string" ? actionOrUndefined : fileName;
        return ts.isArray(action) ? Promise.all(action.map(applySingleCodeActionCommand)) : applySingleCodeActionCommand(action);
    }
    function applySingleCodeActionCommand(action) {
        switch (action.type) {
            case "install package":
                return host.installPackage
                    ? host.installPackage({ fileName: ts.toPath(action.file, currentDirectory, getCanonicalFileName), packageName: action.packageName }) // jshint ignore:line
                    : Promise.reject("Host does not implement `installPackage`");
            default:
                ts.Debug.fail();
        }
    }
    function getDocCommentTemplateAtPosition(fileName, position) {
        return ts.JsDoc.getDocCommentTemplateAtPosition(ts.getNewLineOrDefaultFromHost(host), syntaxTreeCache.getCurrentSourceFile(fileName), position);
    }
    function isValidBraceCompletionAtPosition(fileName, position, openingBrace) {
        // '<' is currently not supported, figuring out if we're in a Generic Type vs. a comparison is too
        // expensive to do during typing scenarios
        // i.e. whether we're dealing with:
        //      var x = new foo<| ( with class foo<T>{} )
        // or
        //      var y = 3 <|
        if (openingBrace === 60 /* lessThan */) {
            return false;
        }
        var sourceFile = syntaxTreeCache.getCurrentSourceFile(fileName);
        // Check if in a context where we don't want to perform any insertion
        if (ts.isInString(sourceFile, position)) {
            return false;
        }
        if (ts.isInsideJsxElementOrAttribute(sourceFile, position)) {
            return openingBrace === 123 /* openBrace */;
        }
        if (ts.isInTemplateString(sourceFile, position)) {
            return false;
        }
        switch (openingBrace) {
            case 39 /* singleQuote */:
            case 34 /* doubleQuote */:
            case 96 /* backtick */:
                return !ts.isInComment(sourceFile, position);
        }
        return true;
    }
    function getSpanOfEnclosingComment(fileName, position, onlyMultiLine) {
        var sourceFile = syntaxTreeCache.getCurrentSourceFile(fileName);
        var range = ts.formatting.getRangeOfEnclosingComment(sourceFile, position, onlyMultiLine);
        return range && ts.createTextSpanFromRange(range);
    }
    function getTodoComments(fileName, descriptors) {
        // Note: while getting todo comments seems like a syntactic operation, we actually
        // treat it as a semantic operation here.  This is because we expect our host to call
        // this on every single file.  If we treat this syntactically, then that will cause
        // us to populate and throw away the tree in our syntax tree cache for each file.  By
        // treating this as a semantic operation, we can access any tree without throwing
        // anything away.
        synchronizeHostData();
        var sourceFile = getValidSourceFile(fileName);
        cancellationToken.throwIfCancellationRequested();
        var fileContents = sourceFile.text;
        var result = [];
        // Exclude node_modules files as we don't want to show the todos of external libraries.
        if (descriptors.length > 0 && !isNodeModulesFile(sourceFile.fileName)) {
            var regExp = getTodoCommentsRegExp();
            var matchArray = void 0;
            while ((matchArray = regExp.exec(fileContents))) {
                cancellationToken.throwIfCancellationRequested();
                // If we got a match, here is what the match array will look like.  Say the source text is:
                //
                //      "    // hack   1"
                //
                // The result array with the regexp:    will be:
                //
                //      ["// hack   1", "// ", "hack   1", undefined, "hack"]
                //
                // Here are the relevant capture groups:
                //  0) The full match for the entire regexp.
                //  1) The preamble to the message portion.
                //  2) The message portion.
                //  3...N) The descriptor that was matched - by index.  'undefined' for each
                //         descriptor that didn't match.  an actual value if it did match.
                //
                //  i.e. 'undefined' in position 3 above means TODO(jason) didn't match.
                //       "hack"      in position 4 means HACK did match.
                var firstDescriptorCaptureIndex = 3;
                ts.Debug.assert(matchArray.length === descriptors.length + firstDescriptorCaptureIndex);
                var preamble = matchArray[1];
                var matchPosition = matchArray.index + preamble.length;
                // OK, we have found a match in the file.  This is only an acceptable match if
                // it is contained within a comment.
                if (!ts.isInComment(sourceFile, matchPosition)) {
                    continue;
                }
                var descriptor = undefined;
                for (var i = 0; i < descriptors.length; i++) {
                    if (matchArray[i + firstDescriptorCaptureIndex]) {
                        descriptor = descriptors[i];
                    }
                }
                ts.Debug.assert(descriptor !== undefined);
                // We don't want to match something like 'TODOBY', so we make sure a non
                // letter/digit follows the match.
                if (isLetterOrDigit(fileContents.charCodeAt(matchPosition + descriptor.text.length))) {
                    continue;
                }
                var message = matchArray[2];
                result.push({ descriptor: descriptor, message: message, position: matchPosition });
            }
        }
        return result;
        function escapeRegExp(str) {
            return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
        }
        function getTodoCommentsRegExp() {
            // NOTE: ?:  means 'non-capture group'.  It allows us to have groups without having to
            // filter them out later in the final result array.
            // TODO comments can appear in one of the following forms:
            //
            //  1)      // TODO     or  /////////// TODO
            //
            //  2)      /* TODO     or  /********** TODO
            //
            //  3)      /*
            //           *   TODO
            //           */
            //
            // The following three regexps are used to match the start of the text up to the TODO
            // comment portion.
            var singleLineCommentStart = /(?:\/\/+\s*)/.source;
            var multiLineCommentStart = /(?:\/\*+\s*)/.source;
            var anyNumberOfSpacesAndAsterisksAtStartOfLine = /(?:^(?:\s|\*)*)/.source;
            // Match any of the above three TODO comment start regexps.
            // Note that the outermost group *is* a capture group.  We want to capture the preamble
            // so that we can determine the starting position of the TODO comment match.
            var preamble = "(" + anyNumberOfSpacesAndAsterisksAtStartOfLine + "|" + singleLineCommentStart + "|" + multiLineCommentStart + ")";
            // Takes the descriptors and forms a regexp that matches them as if they were literals.
            // For example, if the descriptors are "TODO(jason)" and "HACK", then this will be:
            //
            //      (?:(TODO\(jason\))|(HACK))
            //
            // Note that the outermost group is *not* a capture group, but the innermost groups
            // *are* capture groups.  By capturing the inner literals we can determine after
            // matching which descriptor we are dealing with.
            var literals = "(?:" + ts.map(descriptors, function (d) { return "(" + escapeRegExp(d.text) + ")"; }).join("|") + ")";
            // After matching a descriptor literal, the following regexp matches the rest of the
            // text up to the end of the line (or */).
            var endOfLineOrEndOfComment = /(?:$|\*\/)/.source;
            var messageRemainder = /(?:.*?)/.source;
            // This is the portion of the match we'll return as part of the TODO comment result. We
            // match the literal portion up to the end of the line or end of comment.
            var messagePortion = "(" + literals + messageRemainder + ")";
            var regExpString = preamble + messagePortion + endOfLineOrEndOfComment;
            // The final regexp will look like this:
            // /((?:\/\/+\s*)|(?:\/\*+\s*)|(?:^(?:\s|\*)*))((?:(TODO\(jason\))|(HACK))(?:.*?))(?:$|\*\/)/gim
            // The flags of the regexp are important here.
            //  'g' is so that we are doing a global search and can find matches several times
            //  in the input.
            //
            //  'i' is for case insensitivity (We do this to match C# TODO comment code).
            //
            //  'm' is so we can find matches in a multi-line input.
            return new RegExp(regExpString, "gim");
        }
        function isLetterOrDigit(char) {
            return (char >= 97 /* a */ && char <= 122 /* z */) ||
                (char >= 65 /* A */ && char <= 90 /* Z */) ||
                (char >= 48 /* _0 */ && char <= 57 /* _9 */);
        }
        function isNodeModulesFile(path) {
            var node_modulesFolderName = "/node_modules/";
            return ts.stringContains(path, node_modulesFolderName);
        }
    }
    function getRenameInfo(fileName, position) {
        synchronizeHostData();
        var defaultLibFileName = host.getDefaultLibFileName(host.getCompilationSettings());
        return ts.Rename.getRenameInfo(program.getTypeChecker(), defaultLibFileName, getCanonicalFileName, getValidSourceFile(fileName), position);
    }
    function getRefactorContext(file, positionOrRange, formatOptions) {
        var _a = typeof positionOrRange === "number" ? [positionOrRange, undefined] : [positionOrRange.pos, positionOrRange.end], startPosition = _a[0], endPosition = _a[1];
        return {
            file: file,
            startPosition: startPosition,
            endPosition: endPosition,
            program: getProgram(),
            newLineCharacter: formatOptions ? formatOptions.newLineCharacter : host.getNewLine(),
            host: host,
            rulesProvider: getRuleProvider(formatOptions),
            cancellationToken: cancellationToken,
        };
    }
    function getApplicableRefactors(fileName, positionOrRange) {
        synchronizeHostData();
        var file = getValidSourceFile(fileName);
        return ts.refactor.getApplicableRefactors(getRefactorContext(file, positionOrRange));
    }
    function getEditsForRefactor(fileName, formatOptions, positionOrRange, refactorName, actionName) {
        synchronizeHostData();
        var file = getValidSourceFile(fileName);
        return ts.refactor.getEditsForRefactor(getRefactorContext(file, positionOrRange, formatOptions), refactorName, actionName);
    }
    return {
        dispose: dispose,
        cleanupSemanticCache: cleanupSemanticCache,
        getSyntacticDiagnostics: getSyntacticDiagnostics,
        getSemanticDiagnostics: getSemanticDiagnostics,
        getCompilerOptionsDiagnostics: getCompilerOptionsDiagnostics,
        getSyntacticClassifications: getSyntacticClassifications,
        getSemanticClassifications: getSemanticClassifications,
        getEncodedSyntacticClassifications: getEncodedSyntacticClassifications,
        getEncodedSemanticClassifications: getEncodedSemanticClassifications,
        getCompletionsAtPosition: getCompletionsAtPosition,
        getCompletionEntryDetails: getCompletionEntryDetails,
        getCompletionEntrySymbol: getCompletionEntrySymbol,
        getSignatureHelpItems: getSignatureHelpItems,
        getQuickInfoAtPosition: getQuickInfoAtPosition,
        getDefinitionAtPosition: getDefinitionAtPosition,
        getImplementationAtPosition: getImplementationAtPosition,
        getTypeDefinitionAtPosition: getTypeDefinitionAtPosition,
        getReferencesAtPosition: getReferencesAtPosition,
        findReferences: findReferences,
        getOccurrencesAtPosition: getOccurrencesAtPosition,
        getDocumentHighlights: getDocumentHighlights,
        getNameOrDottedNameSpan: getNameOrDottedNameSpan,
        getBreakpointStatementAtPosition: getBreakpointStatementAtPosition,
        getNavigateToItems: getNavigateToItems,
        getRenameInfo: getRenameInfo,
        findRenameLocations: findRenameLocations,
        getNavigationBarItems: getNavigationBarItems,
        getNavigationTree: getNavigationTree,
        getOutliningSpans: getOutliningSpans,
        getTodoComments: getTodoComments,
        getBraceMatchingAtPosition: getBraceMatchingAtPosition,
        getIndentationAtPosition: getIndentationAtPosition,
        getFormattingEditsForRange: getFormattingEditsForRange,
        getFormattingEditsForDocument: getFormattingEditsForDocument,
        getFormattingEditsAfterKeystroke: getFormattingEditsAfterKeystroke,
        getDocCommentTemplateAtPosition: getDocCommentTemplateAtPosition,
        isValidBraceCompletionAtPosition: isValidBraceCompletionAtPosition,
        getSpanOfEnclosingComment: getSpanOfEnclosingComment,
        getCodeFixesAtPosition: getCodeFixesAtPosition,
        applyCodeActionCommand: applyCodeActionCommand,
        getEmitOutput: getEmitOutput,
        getNonBoundSourceFile: getNonBoundSourceFile,
        getSourceFile: getSourceFile,
        getProgram: getProgram,
        getApplicableRefactors: getApplicableRefactors,
        getEditsForRefactor: getEditsForRefactor,
    };
};

function SyntaxTreeCache(host) {
    this.host = host;
}
SyntaxTreeCache.prototype.getCurrentSourceFile = function (fileName) {
    var scriptSnapshot = this.host.getScriptSnapshot(fileName);
    if (!scriptSnapshot) {
        // The host does not know about this file.
        throw new Error("Could not find file: '" + fileName + "'.");
    }
    var scriptKind = ts.getScriptKind(fileName, this.host);
    var version = this.host.getScriptVersion(fileName);
    var sourceFile;
    if (this.currentFileName !== fileName) {
        // This is a new file, just parse it
        sourceFile = ts.createLanguageServiceSourceFile(fileName, scriptSnapshot, 5 /* Latest */, version, /*setNodeParents*/ true, scriptKind);
    }
    else if (this.currentFileVersion !== version) {
        // This is the same file, just a newer version. Incrementally parse the file.
        var editRange = scriptSnapshot.getChangeRange(this.currentFileScriptSnapshot);
        sourceFile = ts.updateLanguageServiceSourceFile(this.currentSourceFile, scriptSnapshot, version, editRange);
    }
    if (sourceFile) {
        // All done, ensure state is up to date
        this.currentFileVersion = version;
        this.currentFileName = fileName;
        this.currentFileScriptSnapshot = scriptSnapshot;
        this.currentSourceFile = sourceFile;
    }
    return this.currentSourceFile;
};
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
function getDefaultCompilerOptions(configFileName) {
    var options = ts.getBaseFileName(configFileName) === "jsconfig.json" ? { allowJs: true, maxNodeModuleJsDepth: 2, allowSyntheticDefaultImports: true, skipLibCheck: true } : {};
    return options;
}
function HostCache(host, getCanonicalFileName) {
    this.host = host;
    // script id => script index
    this.currentDirectory = host.getCurrentDirectory();
    this.fileNameToEntry = ts.createMap();
    // Initialize the list with the root file names
    var rootFileNames = host.getScriptFileNames();
    for (var _i = 0, rootFileNames_1 = rootFileNames; _i < rootFileNames_1.length; _i++) {
        var fileName = rootFileNames_1[_i];
        this.createEntry(fileName, ts.toPath(fileName, this.currentDirectory, getCanonicalFileName));
    }
    // store the compilation settings
    this._compilationSettings = host.getCompilationSettings() || getDefaultCompilerOptions();
}
HostCache.prototype.compilationSettings = function () {
    return this._compilationSettings;
};
HostCache.prototype.createEntry = function (fileName, path) {
    var entry;
    var scriptSnapshot = this.host.getScriptSnapshot(fileName);
    if (scriptSnapshot) {
        entry = {
            hostFileName: fileName,
            version: this.host.getScriptVersion(fileName),
            scriptSnapshot: scriptSnapshot,
            scriptKind: ts.getScriptKind(fileName, this.host)
        };
    }
    else {
        entry = fileName;
    }
    this.fileNameToEntry.set(path, entry);
    return entry;
};
HostCache.prototype.getEntryByPath = function (path) {
    return this.fileNameToEntry.get(path);
};
HostCache.prototype.getHostFileInformation = function (path) {
    var entry = this.fileNameToEntry.get(path);
    return !ts.isString(entry) ? entry : undefined;
};
HostCache.prototype.getOrCreateEntryByPath = function (fileName, path) {
    var info = this.getEntryByPath(path) || this.createEntry(fileName, path);
    return ts.isString(info) ? undefined : info;
};
HostCache.prototype.getRootFileNames = function () {
    return ts.arrayFrom(this.fileNameToEntry.values(), function (entry) {
        return ts.isString(entry) ? entry : entry.hostFileName;
    });
};
HostCache.prototype.getVersion = function (path) {
    var file = this.getHostFileInformation(path);
    return file && file.version;
};
HostCache.prototype.getScriptSnapshot = function (path) {
    var file = this.getHostFileInformation(path);
    return file && file.scriptSnapshot;
};