const ts = require('typescript');
const fs = require('fs');
const k = ts.SyntaxKind;
// const instance = require('./TsHooker')({
//     'target': 'es5',
//     'module': 'commonjs',
//     'moduleResolution': 'node',
//     'noImplicitAny': false,
//     'preserveConstEnums': true,
//     'removeComments': false,
//     'sourceMap': true,
//     'experimentalDecorators': true,
//     'noEmitOnError': true,
//     'declaration': false,
//     'typeRoots': [
//         './customTypings'
//     ],
//     'forceConsistentCasingInFileNames': true
// });



require('./TsHooks/Host');
fs.readFile('./samples/currentActives.directive.ts', function (err, content) {
    const result = ts.createSourceFile('who cares.ts', content.toString(), ts.ScriptKind.TS);
    let queued = 0;
    const imports = [];
    ts.forEachChild(result, queueVisit);
    // getImports(result, imports);
    // console.log(imports);
    function queueVisit(node) {
        queued++;
        // visit(node, queueVisit, done, imports);
        setImmediate(visit, node, queueVisit, done, imports);
    }
    function done() {
        console.log(imports);
    }

    function visit(node, next, done, importedModules) {
        console.log(k[node.kind]);
        if (isIn(node.kind, k.ImportDeclaration, k.ImportEqualsDeclaration, k.RequireKeyword, k.CallExpression)) {
            let moduleNameExpr = getExternalModuleName(node);
            if (moduleNameExpr && moduleNameExpr.kind === ts.SyntaxKind.StringLiteral) {
                importedModules.push((moduleNameExpr).text);
            }
        }

        ts.forEachChild(node, next);
        if (!--queued) {
            done();
        }
    }
});

function isIn(kind) {
    for (let ii = 1; ii < arguments.length; ii++) {
        if (kind === arguments[ii]) {
            return true;
        }
    }
    return false;
}


// function getImports(searchNode, importedModules) {
//     ts.forEachChild(searchNode, node => {
//         // Vist top-level import nodes
//         if (node.kind === ts.SyntaxKind.ImportDeclaration ||
//             node.kind === ts.SyntaxKind.ImportEqualsDeclaration ||
//             node.kind === ts.SyntaxKind.ExportDeclaration ||
//             node.kind === ts.SyntaxKind.ExportDeclaration) {
//             let moduleNameExpr = getExternalModuleName(node);
//             // if they have a name, that is a string, i.e. not alias defition `import x = y`
//             if (moduleNameExpr && moduleNameExpr.kind === ts.SyntaxKind.StringLiteral) {
//                 importedModules.push((moduleNameExpr).text);
//             }
//         }
//         else if (node.kind === ts.SyntaxKind.ModuleDeclaration && (node).name.kind === ts.SyntaxKind.StringLiteral) {
//             // Ambient module declaration
//             getImports((node).body, importedModules);
//         }
//     });
// }

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