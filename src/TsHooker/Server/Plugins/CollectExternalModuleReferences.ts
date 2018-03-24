import * as ts_ from 'typescript';
const ts = ts_ as any;
const commentExp = /^\/\/\s?thingy-dive/;
const commentExp2 = /^\/\*\s?thingy-dive\s?\*\//;
export function CollectExternalModuleReferences(this: IWaterfall, request: IRequestContext) {
    const options = this.options;
    const deepDive = commentExp.test(request.data) || commentExp2.test(request.data);
    const file = request.sourceFile as any;
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
    let ticks = 0;
    for (var _i = 0, _a = file.statements; _i < _a.length; _i++) {
        var node = _a[_i];
        collectModuleReferences(node, /*inAmbientModule*/ false);
        if ((file.flags & 524288 /* PossiblyContainsDynamicImport */) || isJavaScriptFile || deepDive) { // tslint:disable-line
            collectDynamicImportOrRequireCalls(node);
        }
    }
    file.imports = imports || ts.emptyArray;
    file.moduleAugmentations = moduleAugmentations || ts.emptyArray;
    file.ambientModuleNames = ambientModules || ts.emptyArray;
    request.dependencies = file.imports.concat(file.moduleAugmentations, file.ambientModuleNames).map(getText).filter(nodeModules);
    if (request.fileName.endsWith('.d.ts')) {
        return this.bail(null, request);
    }
    return this.next(null, request);
    function collectModuleReferences(node: any, inAmbientModule: any) {
        switch (node.kind) {

            case ts_.SyntaxKind.ImportDeclaration:
            case ts_.SyntaxKind.ImportEqualsDeclaration:
            case ts_.SyntaxKind.ExportDeclaration:
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
            case ts_.SyntaxKind.ModuleDeclaration:
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
                    } else if (!inAmbientModule) {
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
    function collectDynamicImportOrRequireCalls(node: any) {
        ticks++;
        if (ts.isRequireCall(node, /*checkArgumentIsStringLiteral*/ true)) {
            (imports || (imports = [])).push(node.arguments[0]);
        } else if (ts.isImportCall(node) && node.arguments.length === 1 && node.arguments[0].kind === 9 /* StringLiteral */) {
            (imports || (imports = [])).push(node.arguments[0]);
        } else {
            if (node.kind === ts_.SyntaxKind.ExpressionStatement) {
                if (node.expression.kind === ts_.SyntaxKind.CallExpression) {
                    const posiblyRequire = node.expression;
                    if (posiblyRequire.expression.kind === ts_.SyntaxKind.PropertyAccessExpression) {
                        const maybe = posiblyRequire.expression;
                        if (maybe.expression.text === 'require' && maybe.name.text === 'ensure') {
                            node.expression.arguments[0].elements.forEach(pushTo, (imports || (imports = [])));
                            return;
                        }
                    }
                }
            }
            ts.forEachChild(node, collectDynamicImportOrRequireCalls);
        }
    }
}
function pushTo(item: any) {
    this.push(item);
}
function nodeModules(item: string) {
    return item[0] === '.' || item[0] === '/';
}
function isRequireEnsure(node: any) {
    if (node.king === 210) {
        if (node.expression.king === 181) {
            const posiblyRequire = node.expression;
            if (posiblyRequire.expression.king === 179) {
                const maybe = posiblyRequire.expression;
                if (maybe.expression.text === 'require' && maybe.name.text === 'ensure') {

                }
            }
        }
    }
    return false;
}
function getText(item: any) {
    return typeof item === 'string' ? item : item.text;
}
