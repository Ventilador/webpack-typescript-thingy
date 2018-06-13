import * as tsImpl from 'typescript';
import * as colors from 'colors';
import { resolve, dirname, normalize, basename } from 'path';
import { readFile } from 'fs';
import { init } from './TsHooker/Client';
import prettyHrtime = require('./TsHooker/utils/prettyHrtime');
import * as Watchpack from 'C:/Projects/Proteus/Proteus-GUI/node_modules/watchpack/lib/watchpack';
const self = this;
export = function makePlugin(options: any) {

    options = options || {};
    const context = options.context || process.cwd();
    const configFilePath = options.tsconfig || resolve(context, 'tsconfig.json');
    let diagPromise: Promise<any>;
    return {
        apply: function (compiler: any) {
            compiler.plugin('run', startTsServer);
            compiler.plugin('watch-run', startTsServer);
            compiler.plugin('done', printDiags);
            compiler.plugin('after-compile', checkDiagnostics);
        }
    };
    function checkDiagnostics(_: any, cb: any) {
        if (_.compiler.isChild()) {
            cb();
            return;
        }
        diagPromise = new Promise(function (res: Function) {
            const host = init();
            const start = process.hrtime();
            host.diagnostics(function (err: any, result: IMessage) {
                const diags = JSON.parse(result.data);
                let errors = [];
                if (diags.length) {
                    errors.push(colors.red(`\n[TS] Checking finished with ${diags.length} errors`));
                    if (diags.length > 100) {
                        errors.push(colors.red('\n[TS] Too many errors. Printing first 100\n\n'));
                        errors.push(colors.red(diags.slice(0, 99).map(toPretty).join('\r\n')));
                    } else {
                        errors.push(colors.red(diags.map(toPretty).join('\r\n')));
                    }
                } else {
                    errors.push(colors.green('\n[TS] Saul Goodman.'));
                }
                errors.push(colors.yellow('Took: ' + prettyHrtime(process.hrtime(start))));
                setTimeout(res, 2000, errors.join('\r\n'));
            });
        });
        cb();
    }

    function cleanProm() {
        diagPromise = null;
    }
    function printDiags() {
        diagPromise
            .then(console.log)
            .then(cleanProm);
    }

    function toPretty(diag: any) {
        return diag.pretty;
    };


    function startTsServer(_: any, cb: any) {
        const nodeModulePath = nodeModulesFolder(module.parent);
        const mainModule = findMainModule(require, 0);
        const resolvePath = resolver(this.resolvers.normal);
        const myFs = this.resolvers.normal.fileSystem;
        const watcher = new Watchpack(this.watchFileSystem.watcherOptions);
        const context = this.context;
        const exts = this.options.resolve.extensions.slice();
        const i = this.options.entry;
        const entries = Object.keys(this.options.entry)
            .reduce(function (prev: string[], name: string) {
                const items = i[name].filter(RegExp.prototype.test, /\.(j|t)sx?$/);
                if (items.length) {
                    return prev.concat(items);
                }
                return prev;
            }, [])
            .map(function (item: string) { return resolve(this, item); }, this.context);

        const matchers = this.options.module.rules.map(i => i.test || i.include).map(toSource);
        readFile(configFilePath, 'utf8', function (err: any, content: string) {
            if (err) {
                cb(err);
            } else {
                let existingOptions = tsImpl.convertCompilerOptionsFromJson({}, context, 'atl.query');
                let jsonConfigFile = tsImpl.parseConfigFileTextToJson(configFilePath, content);
                let compilerConfig = tsImpl.parseJsonConfigFileContent(
                    jsonConfigFile.config,
                    tsImpl.sys,
                    dirname(configFilePath),
                    existingOptions as any,
                    configFilePath
                );
                // reduce raw version, unnecesary
                compilerConfig.raw = {
                    $$extensions: exts,
                    $$matchers: matchers,
                    webpackThingy: compilerConfig.raw.webpackThingy,
                    typescriptPath: mainModule,
                    nodeModules: nodeModulePath,
                    entries: entries
                };
                compilerConfig.fileNames = compilerConfig.fileNames.map(normalize);
                init(compilerConfig, {
                    readdir: _readdir(myFs),
                    readFile: _readFile(myFs),
                    resolveFile: resolvePath
                }, watcher, context);
                cb();
            }
        });
    }

    function nodeModulesFolder(module: NodeModule) {
        if (!module) {
            throw 'Cannot find node_modules folder';
        }
        let nodeModulesIndex = module.filename.indexOf('node_modules');
        if (nodeModulesIndex !== -1 && module.filename.indexOf('webpack', nodeModulesIndex) !== -1) {
            let path = dirname(module.filename);
            while (basename(path) !== 'node_modules') {
                path = dirname(path);
            }
            return path;
        } else {
            return nodeModulesFolder(module.parent);
        }
    }

    function findMainModule(req: any, index: number) {
        try {
            return require.resolve(req.main.paths[index] + '\\typescript');
        } catch (err) {
            if (index < req.main.paths.length) {
                return findMainModule(req, index + 1);
            }
            return require.resolve('typescript');
        }
    }

    function _readFile(myFs: any) {
        return function () {
            myFs.readFile.apply(myFs, arguments);
        };
    }
    function _readdir(myFs: any) {
        return function () {
            myFs.readdir.apply(myFs, arguments);
        };
    }
    function resolver(obj: any) {
        const method = obj.resolve;
        return function (fromDir: string, relPath: string, cb: (err: Error, fullPath: string) => void) {
            method.call(obj, null, fromDir, relPath, cb);
        };
    }

    function toSource(reg: RegExp) {
        return reg.source;
    }
};

