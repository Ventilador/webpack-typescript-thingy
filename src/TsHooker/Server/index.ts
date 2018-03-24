import { makeWaterfall } from '../utils/waterfall';
import { singleton } from '../utils/singleTon';
import { TranspileFile, UpdateHostFile, GenerateSourceFile, CollectExternalModuleReferences, getFileConfig } from './Plugins';
import { makeHost } from './Host';
import { createDocumentRegistry } from './DocumentRegistry';
import { createChecker } from './../Checker';
import { dirname, resolve } from 'path';
import ts = require('typescript');
export const init = singleton(function init(compilerOptions: ts.ParsedCommandLine, readFile: Function): (((fileName: string, onEmit: (err: Error, response: IResponseContext) => void) => void) & { doCheck: Function; }) {
    const hostInstance = makeHost(compilerOptions, true);
    const docReg = createDocumentRegistry(true);
    const applyWaterfall = makeWaterfall(hostInstance, docReg as any, readFile, [
        getFileConfig(hostInstance),
        UpdateHostFile,
        GenerateSourceFile,
        CollectExternalModuleReferences,
        TranspileFile
    ]);
    const lib = ts.getDefaultLibFilePath(compilerOptions.options);
    compilerOptions.fileNames.concat([lib]).forEach(processFile);
    const typeChecker = createChecker(hostInstance, docReg);
    return Object.defineProperty(compile, 'doCheck', {
        value: createChecker(hostInstance, docReg)
    });

    function compile(fileName: string, onEmit: (err: Error, response: IResponseContext) => void) {
        applyWaterfall({
            fileName: fileName,
            data: '',
            output: '',
            sourceFile: null,
            sourceMap: '',
            dependencies: null
        }, function (err: Error, result: IRequestContext) {
            return onEmit && onEmit(err, err ? null : {
                output: result.output,
                sourceMap: result.sourceMap,
                dependencies: result.dependencies
            });
        });
    }

    function doAllFiles(err: Error, response: IMessage) {
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
