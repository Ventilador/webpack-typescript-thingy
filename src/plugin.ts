import * as tsImpl from 'typescript';
import * as colors from 'colors';
import { resolve, dirname, normalize } from 'path';
import { readFile } from 'fs';
import { init } from './TsHooker/Client';
import prettyHrtime = require('./TsHooker/utils/prettyHrtime');
import * as Watchpack from 'C:/Users/admin/Documents/Projects/Proteus/Proteus-GUI/node_modules/watchpack/lib/watchpack';

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
        return function () {
            method.apply(obj, arguments);
        };
    }

    function toSource(reg: RegExp) {
        return reg.source;
    }
};

