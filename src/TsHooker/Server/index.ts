import { makeWaterfall, configWaterfall, pendingRequests, onDone } from '../utils/waterfall';
import { singleton } from '../utils/singleTon';
import {
    TranspileFile,
    UpdateHostFile,
    GenerateSourceFile,
    CollectExternalModuleReferences,
    getFileConfig,
    ResolveDependencies,
    LoadNodeModulesCreator
} from './Plugins';
import { makeHost } from './Host';
import { createDocumentRegistry } from './DocumentRegistry';
import { createChecker } from './../Checker';
import { dirname, resolve } from 'path';
import { fileDeps } from './FileDependencies';
import { readdir, stat } from 'fs';
import * as ts from './../../typescript';
export const init = singleton(function init(compilerOptions: ts.ParsedCommandLine, readFile: Function, resolveFile: Function): (((fileName: string, onEmit: (err: Error, response: IResponseContext) => void) => void) & { doCheck: Function; }) {
    const myFileDeps = fileDeps();
    const hostInstance = makeHost(compilerOptions, true);
    const docReg = createDocumentRegistry(true);
    configWaterfall(compilerOptions, hostInstance, docReg as any, readFile, resolveFile);
    const applyWaterfall = makeWaterfall<IRequestContext>([
        getFileConfig,
        UpdateHostFile,
        GenerateSourceFile,
        CollectExternalModuleReferences,
        LoadNodeModulesCreator,
        ResolveDependencies,
        TranspileFile
    ]);
    const lib = ts.getDefaultLibFilePath(compilerOptions.options);
    compilerOptions.options.typeRoots.forEach(loadTypeRoots);
    compilerOptions.fileNames.concat([lib]).forEach(processFile);
    const typeChecker = createChecker(hostInstance, docReg);
    const doDiag = [];
    return Object.defineProperty(compile, 'doCheck', {
        value: doCheck
    });

    function doCheck(cb: Function) {
        if (pendingRequests()) {
            onDone(doCheck.bind(null, cb));
            return;
        }
        const missingFiles = myFileDeps.getMissingFiles();
        if (missingFiles.length) {
            let amount = missingFiles.length;
            missingFiles.forEach(processFile);
            function resolver(err: Error, response: IResponseContext) {
                amount--;
                if (response.dependencies && response.dependencies.length) {
                    amount += response.dependencies.length;
                    response.dependencies.forEach(processFile);
                }
                if (!amount) {
                    cb(tryTypeChecked());
                }
            }
            function processFile(fileName: string) {
                if (myFileDeps.isMissing(fileName)) {
                    compile(fileName, resolver);
                } else {
                    amount--;
                }
            }
        } else {
            cb(tryTypeChecked());
        }
    }
    function tryTypeChecked() {
        try {
            return typeChecker();
        } catch (err) {
            throw err;
        }
    }

    function loadTypeRoots(folder: string) {
        readdir(folder, function (err: Error, files: string[]) {
            files.forEach(tryFile, folder);
        });
    }

    function tryFile(this: string, file: string) {
        const fullPath = resolve(this, file);
        stat(fullPath, function (err: Error, stats: any) {
            if (stats.isDirectory()) {
                loadTypeRoots(fullPath);
            } else if (fullPath.endsWith('.d.ts')) {
                compile(fullPath, doAllFiles);
            }
        });
    }

    function compile(fileName: string, onEmit: (err: Error, response: IResponseContext) => void) {
        applyWaterfall({
            fileName: fileName,
            data: '',
            output: '',
            sourceFile: null,
            sourceMap: '',
            dependencies: null
        }, function (err: Error, result: IRequestContext) {
            if (err) {
                onEmit(err, null);
            } else {
                myFileDeps.processFile(result.fileName);
                onEmit(null, {
                    output: result.output,
                    sourceMap: result.sourceMap,
                    dependencies: result.dependencies.map(myFileDeps.addFileDep)
                });
            }
        });
    }

    function doAllFiles(err: Error, response: IMessage) {
        if (err) {
            return;
        }
        if (response.dependencies && response.dependencies.length) {
            response.dependencies.forEach(processFile, dirname(response.fileName));
        }
    }
    function processFile(fileName: string) {
        if (fileName.endsWith('.d.ts')) {
            compile(resolve(this, fileName), doAllFiles);
        }
    }
});
