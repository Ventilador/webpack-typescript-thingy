const ts = require('typescript');
const { onNextTick } = require('./../../utils');
module.exports = function collectExternalModuleReferences(node, cb) {
    const async = this.async();
    const source = node.readSourceFile();
    getDependencies(source, function (deps) {
        source.imports = deps || ts.emptyArray;
        source.moduleAugmentations = ts.emptyArray;
        source.ambientModuleNames = ts.emptyArray;
        async(node, 'resolve', cb);
    });

};


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



function getDependencies(sourceFile, done) {
    let importedModules = [];
    let queued = 0;
    ts.forEachChild(sourceFile, queueVisit);
    function queueVisit(node) {
        queued++;
        onNextTick(function () {
            if (isIn(node.kind, ts.SyntaxKind.ImportDeclaration, ts.SyntaxKind.ImportEqualsDeclaration, ts.SyntaxKind.RequireKeyword, ts.SyntaxKind.CallExpression)) {
                let moduleNameExpr = getExternalModuleName(node);
                if (moduleNameExpr && moduleNameExpr.kind === ts.SyntaxKind.StringLiteral) {
                    importedModules.push((moduleNameExpr).text);
                }
            }
            ts.forEachChild(node, queueVisit);
            if (!--queued) {
                done(unique(importedModules));
            }
        });
    }

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



// function collectExternalModuleReferences(file, options) {
//     if (file.imports) {
//         return;
//     }
//     var isJavaScriptFile = ts.isSourceFileJavaScript(file);
//     var isExternalModuleFile = ts.isExternalModule(file);
//     // file.imports may not be undefined if there exists dynamic import
//     var imports;
//     var moduleAugmentations;
//     var ambientModules;
//     // If we are importing helpers, we need to add a synthetic reference to resolve the
//     // helpers library.
//     if (options.importHelpers
//         && (options.isolatedModules || isExternalModuleFile) // jshint ignore:line
//         && !file.isDeclarationFile) { // jshint ignore:line
//         // synthesize 'import "tslib"' declaration
//         var externalHelpersModuleReference = ts.createLiteral(ts.externalHelpersModuleNameText);
//         var importDecl = ts.createImportDeclaration(/*decorators*/ undefined, /*modifiers*/ undefined, /*importClause*/ undefined);
//         externalHelpersModuleReference.parent = importDecl;
//         importDecl.parent = file;
//         imports = [externalHelpersModuleReference];
//     }
//     for (var _i = 0, _a = file.statements; _i < _a.length; _i++) {
//         var node = _a[_i];
//         collectModuleReferences(node, /*inAmbientModule*/ false);
//         if ((file.flags & 524288 /* PossiblyContainsDynamicImport */) || isJavaScriptFile) { // jshint ignore:line
//             collectDynamicImportOrRequireCalls(node);
//         }
//     }
//     file.imports = imports || ts.emptyArray;
//     file.moduleAugmentations = moduleAugmentations || ts.emptyArray;
//     file.ambientModuleNames = ambientModules || ts.emptyArray;
//     return;
//     function collectModuleReferences(node, inAmbientModule) {
//         switch (node.kind) {
//             case 238 /* ImportDeclaration */:
//             case 237 /* ImportEqualsDeclaration */:
//             case 244 /* ExportDeclaration */:
//                 var moduleNameExpr = ts.getExternalModuleName(node);
//                 if (!moduleNameExpr || !ts.isStringLiteral(moduleNameExpr)) {
//                     break;
//                 }
//                 if (!moduleNameExpr.text) {
//                     break;
//                 }
//                 // TypeScript 1.0 spec (April 2014): 12.1.6
//                 // An ExternalImportDeclaration in an AmbientExternalModuleDeclaration may reference other external modules
//                 // only through top - level external module names. Relative external module names are not permitted.
//                 if (!inAmbientModule || !ts.isExternalModuleNameRelative(moduleNameExpr.text)) {
//                     (imports || (imports = [])).push(moduleNameExpr);
//                 }
//                 break;
//             case 233 /* ModuleDeclaration */:
//                 if (ts.isAmbientModule(node) && (inAmbientModule || ts.hasModifier(node, 2 /* Ambient */) || file.isDeclarationFile)) {
//                     var moduleName = node.name;
//                     var nameText = ts.getTextOfIdentifierOrLiteral(moduleName);
//                     // Ambient module declarations can be interpreted as augmentations for some existing external modules.
//                     // This will happen in two cases:
//                     // - if current file is external module then module augmentation is a ambient module declaration defined in the top level scope
//                     // - if current file is not external module then module augmentation is an ambient module declaration with non-relative module name
//                     //   immediately nested in top level ambient module declaration .
//                     if (isExternalModuleFile || (inAmbientModule && !ts.isExternalModuleNameRelative(nameText))) {
//                         (moduleAugmentations || (moduleAugmentations = [])).push(moduleName);
//                     }
//                     else if (!inAmbientModule) {
//                         if (file.isDeclarationFile) {
//                             // for global .d.ts files record name of ambient module
//                             (ambientModules || (ambientModules = [])).push(nameText);
//                         }
//                         // An AmbientExternalModuleDeclaration declares an external module.
//                         // This type of declaration is permitted only in the global module.
//                         // The StringLiteral must specify a top - level external module name.
//                         // Relative external module names are not permitted
//                         // NOTE: body of ambient module is always a module block, if it exists
//                         var body = node.body;
//                         if (body) {
//                             for (var _i = 0, _a = body.statements; _i < _a.length; _i++) {
//                                 var statement = _a[_i];
//                                 collectModuleReferences(statement, /*inAmbientModule*/ true);
//                             }
//                         }
//                     }
//                 }

//             // case ts.SyntaxKind.ExpressionStatement:
//             //     if (node.expression.kind === ts.SyntaxKind.CallExpression && node.expression.expression.escapedText === 'require') {
//             //         (imports || (imports = [])).push(node.arguments[0]);
//             //     }
//             //     break;
//         }
//     }
//     function collectDynamicImportOrRequireCalls(node) {
//         if (ts.isRequireCall(node, /*checkArgumentIsStringLiteral*/ true)) {
//             (imports || (imports = [])).push(node.arguments[0]);
//         }
//         else if (ts.isImportCall(node) && node.arguments.length === 1 && node.arguments[0].kind === 9 /* StringLiteral */) {
//             (imports || (imports = [])).push(node.arguments[0]);
//         }
//         else {
//             ts.forEachChild(node, collectDynamicImportOrRequireCalls);
//         }
//     }
// }