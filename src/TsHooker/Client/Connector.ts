import * as childProcess from 'child_process';
import { Parser } from './../utils/BufferConnector';
import { join } from 'path';
import { MESSAGE_TYPE } from './../utils/enums';
import { CallbackQueue } from './../utils/CallbacksQueue';
import { MODE } from './../utils/mode';
import * as ts from './../../typescript';
let id = 0;


export function AsyncConnector(this: void, compilerOptions: ts.ParsedCommandLine, fs: IFsAccessor) {
    let connected = false;
    let send = function send(content: IMessage) {
        if (connected) {
            child.stdin.write(Parser.toBuffer(content));
        } else {
            setTimeout(send, 200, content);
        }
    };
    let answer = function answerReadFile(request: IMessage) {
        return function (err: Error, content: any) {
            if (err) {
                err = err;
            }
            send({
                method: request.method,
                id: request.id,
                data: typeof content === 'string' ? content : content.toString('utf8')
            });
        };
    };
    process.on('uncaughtException', function (err) {
        console.log(err);
    });
    const cbs = CallbackQueue();
    const child = childProcess.fork(join(__dirname, './../Server/Connector.js'), [], { execArgv: getExecArgv(), silent: true });
    child.stdout.on('readable', function () {
        const text = child.stdout.read();
        if (connected) {
            Parser.fromBuffer(text as any, processChunk);
            return;
        }
        connected = true;
        send({
            method: MESSAGE_TYPE.INIT,
            data: JSON.stringify(compilerOptions)
        });
    });
    

    const service = {
        emit: function (fileName: string, cb: Function) {
            send({
                method: MESSAGE_TYPE.EMIT_FILE,
                fileName: fileName,
                id: cbs.put(cb)
            });
        },
        updateFile: function (fileName: string, content: string) {
            send({
                method: MESSAGE_TYPE.CHANGED,
                data: content,
                fileName: fileName
            });
        },
        diagnose: function (cb: Function) {
            send({
                method: MESSAGE_TYPE.DIAGNOSTICS,
                id: cbs.put(cb)
            });
        }
    };

    return service;


    function bail(err: any) {
        send = answer = service.diagnose = service.emit = service.updateFile = exit(err) as any; // tslint:disable-line
        return err;
    }
    function exit(err: any) {
        return function () {
            console.error('Sorry something went wrong, uncaught error was:\r\n');
            console.error(err);
            child.kill('SIGINT');
            process.exit(1);
        };
    }
    function processChunk(request: IMessage) {
        switch (request.method) {
            case MESSAGE_TYPE.RESOLVE_FILE:
                fs.resolveFile(request.data, request.fileName, answer(request));
                break;
            case MESSAGE_TYPE.READ_FILE:
                fs.readFile(request.fileName, answer(request));
                if (request.data === 'watch') {
                    console.log('watching');
                }
                break;
            case MESSAGE_TYPE.ERROR:
                const err = JSON.parse(request.data);
                console.error(err);
                if (request.output === 'kill') {
                    throw bail(err);
                }
                break;
            case MESSAGE_TYPE.EMIT_FILE:
                request.dependencies = request.dependencies && JSON.parse(request.dependencies);
                cbs.take(request.id)(null, request);
                break;
            case MESSAGE_TYPE.DIAGNOSTICS:
                request.dependencies = request.dependencies && JSON.parse(request.dependencies);
                cbs.take(request.id)(null, request);
                break;
            default:
                throw 'Invalid Message: \n' + JSON.stringify(request);
        }
    }
}

function getExecArgv() {
    let execArgv = [];
    for (let _i = 0, _a = process.execArgv; _i < _a.length; _i++) {
        let arg = _a[_i];
        let match = /^--(inspect(?:-brk)?)(=(\d+))?$/.exec(arg);
        if (match) {
            let currentPort = match[3] !== undefined ? +match[3] : 9229;
            execArgv.push('--' + match[1] + '=' + (currentPort + 1));
        } else {
            execArgv.push(arg);
        }
    }

    return execArgv;
}
