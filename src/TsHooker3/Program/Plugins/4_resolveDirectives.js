const ts = require('typescript');
const isTs = /\.tsx?$/;
module.exports = function resolveDirectives(resolver) {
    return function (node, cb) {
        const source = node.readSourceFile();
        const moduleNames = getModuleNames(source);
        const map = source.resolvedModules || (source.resolvedModules = ts.createMap());
        const containingFile = node.getPath();
        if (moduleNames.length) {
            const onDone = this.async();

            let modulesToResolve = moduleNames.length;
            let bail = false;
            moduleNames.forEach(function (moduleName_) {
                const moduleName = moduleName_;
                if ((moduleName[0] === '.' || moduleName[0] === '/')) {
                    resolver(containingFile, moduleName, function (err, result) {
                        if (bail) {
                            return;
                        }
                        if (err) {
                            bail = true;
                            onDone(err, 'error', cb);
                            return;
                        }
                        modulesToResolve--;
                        if (result && isTs.test(result.filePath)) {
                            map.set(moduleName, { resolvedFileName: result.filePath, extension: ts.Extension.Ts, isExternalLibraryImport: false });
                        }
                        if (!modulesToResolve) {
                            onDone(node, 'ensure', cb);
                        }
                    });
                } else {
                    modulesToResolve--;
                    if (bail) {
                        return;
                    }
                    if (!modulesToResolve) {
                        onDone(node, 'ensure', cb);
                    }
                }
            });
        } else {
            this.apply(node, 'ensure', cb);
        }
    };
};

function getModuleNames(_a) {
    var imports = _a.imports, moduleAugmentations = _a.moduleAugmentations;
    return imports.concat(moduleAugmentations);
    // var res = imports.map(toText);
    // for (var _i = 0, moduleAugmentations_1 = moduleAugmentations; _i < moduleAugmentations_1.length; _i++) {
    //     var aug = moduleAugmentations_1[_i];
    //     if (aug.kind === ts.SyntaxKind.StringLiteral) {
    //         res.push(aug.text);
    //     }
    //     // Do nothing if it's an Identifier; we don't need to do module resolution for `declare global`.
    // }
    // return res;
}
function toText(i) {
    return i.text;
}