import { createDocumentRegistry } from './DocumentRegistry';
import * as ts from './../../typescript';
import { transpile } from './Transpiler';
import { Parser } from './../utils/BufferConnector';
import { MESSAGE_TYPE } from './../utils/enums';
import { init } from './';
import { CallbackQueue } from './../utils/CallbacksQueue';
(function AsyncConnector() {
    // TODO send messages to parent process
    console.log = console.error = console.debug = console.info = console.warn = function () {
        throw 'Please do not log';
    };
    let emitFile: any;
    let compilerOptions: ts.ParsedCommandLine = null;
    const cbs = CallbackQueue();

    process.on('uncaughtException', function (err: Error) {
        send({
            method: MESSAGE_TYPE.ERROR,
            data: JSON.stringify({ stack: err.stack, name: err.name, message: err.message }),
            output: 'kill'
        });
    });

    process.stdin.on('readable', function () {
        Parser.fromBuffer(process.stdin.read() as any, processChunk);
    });
    process.stdout.write(Buffer.from('ready', 'utf-8'));
    function processChunk(request: IMessage) {
        switch (request.method) {
            case MESSAGE_TYPE.EMIT_FILE:
                emitFile(request.fileName, function (err: Error, response: IResponseContext) {
                    if (err) {
                        send({
                            method: MESSAGE_TYPE.ERROR,
                            data: JSON.stringify({ stack: err.stack, name: err.name, message: err.message })
                        });
                    } else {
                        send({
                            method: MESSAGE_TYPE.EMIT_FILE,
                            fileName: request.fileName,
                            output: response.output,
                            sourceMap: response.sourceMap,
                            id: request.id,
                            dependencies: JSON.stringify(response.dependencies)
                        });
                    }
                });
                break;
            case MESSAGE_TYPE.INIT:
                compilerOptions = JSON.parse(request.data);
                (ts as any).initFrom(compilerOptions.raw.typescriptPath);
                emitFile = init(compilerOptions, readFile, resolveFile) as any;
                break;
            case MESSAGE_TYPE.DIAGNOSTICS:
                emitFile.doCheck(function (result: any) {
                    send({
                        method: MESSAGE_TYPE.DIAGNOSTICS,
                        id: request.id,
                        data: JSON.stringify(result)
                    });
                });

                break;
            case MESSAGE_TYPE.READ_FILE:
                cbs.take(request.id)(request.data);
                break;
            case MESSAGE_TYPE.RESOLVE_FILE:
                cbs.take(request.id)(null, request.data);
                break;
            default:
                throw 'Invalid message "' + request.method + '"';
        }
    }

    function resolveFile(dir: string, file: string, cb: Function) {
        send({
            method: MESSAGE_TYPE.RESOLVE_FILE,
            id: cbs.put(cb),
            fileName: file,
            data: dir
        });
    }

    function readFile(fileName: string, cb: Function) {
        send({
            method: MESSAGE_TYPE.READ_FILE,
            id: cbs.put(cb),
            fileName: fileName
        });
    }

    function send(message: IMessage) {
        process.stdout.write(Parser.toBuffer(message));
    }
})();
// export default (function () {
//     class Connector {
//         private queue: any[] = [];
//         public emitFile: ((fileName: string, fileContent: string, onEmit?: (err: Error, response: IResponseContext) => void) => void) & { doCheck: Function };
//         constructor(_receive: Function, _send: Function) {
//             const self = this;
//             this.emitFile = <any>((fileName: string, fileContent: string, onEmit: (err: Error, response: IResponseContext) => void) => {
//                 this.queue.push([fileName, fileContent, onEmit]);
//             });
//             _receive(function (buf: Buffer) {
//                 Parser.fromBuffer(buf, async);
//             });

//             function async(request: IMessage) {
//                 switch (request.method) {
//                     case MESSAGE_TYPE.EMIT_FILE:
//                         self.emitFile(request.fileName, request.data, function (err: Error, response: IResponseContext) {
//                             if (err) {

//                             } else {
//                                 _send(Parser.toBuffer({
//                                     fileName: request.fileName,
//                                     output: response.output,
//                                     sourceMap: response.sourceMap,
//                                     id: request.id
//                                 }));
//                             }
//                         });
//                         break;
//                     case MESSAGE_TYPE.INIT:
//                         self.emitFile = init(JSON.parse(request.data)) as any;
//                         self.queue.forEach(function (args: any[]) {
//                             self.emitFile.apply(self, args);
//                         });
//                         self.queue = null;
//                         break;
//                     case MESSAGE_TYPE.DIAGNOSTICS:
//                         _send(Parser.toBuffer({
//                             id: request.id,
//                             data: JSON.stringify(self.emitFile.doCheck())
//                         }));
//                         break;
//                     default:
//                         throw 'Invalid message "' + request.method + '"';
//                 }
//             }


//         }

//     }
//     if (!module.parent) {
//         process.on('uncaughtException', function (err: any) {
//             err = err;
//             // console.log('UNCAUGHT EXCEPTION in awesome-typescript-loader');
//             // console.log('[Inside "uncaughtException" event] ', err.message, err.stack);
//         });

//         process.on('disconnect', function () {
//             process.exit();
//         });

//         process.on('exit', () => {
//             // console.log('EXIT RUNTIME');
//         });
//         return new Connector(function (cb: any) {
//             process.stdin.on('data', cb);
//         }, function (buffer: Buffer) {
//             process.stdout.write(buffer);
//         });

//     } else {
//         throw 'Cannot work single thread';
//     }


// })();
