import { AsyncConnector } from './Connector';
import { singleton } from '../utils/singleTon';
import * as ts from './../../typescript';
import * as Watchpack from 'C:/Projects/Proteus/Proteus-GUI/node_modules/watchpack/lib/watchpack';
import { resolve, dirname } from 'path';
import * as fs from 'fs';
import { watch } from './Watcher';

export const init = singleton(function init(compilerConfig?: ts.ParsedCommandLine, myFs?: IFsAccessor, watcher?: IWatcher, context?: string) {
    const connector = AsyncConnector(compilerConfig, myFs);
    const options = compilerConfig.raw.webpackThingy && compilerConfig.raw.webpackThingy.Ts;
    const folders = options.definitions ? (typeof options.definitions === 'string' ? [options.definitions] : options.definitions.slice()) : [];
    const defaultLibPath = dirname(ts.getDefaultLibFilePath(compilerConfig.options));
    return { emitFile, diagnostics };
    function emitFile(fileName: string, onEmit: (err: Error, response: IResponseContext) => void) {
        connector.emit(fileName, onEmit);
    }
    function diagnostics(onEmit: (err: Error, response: IResponseContext) => void) {
        connector.diagnose(onEmit);
    }
});
