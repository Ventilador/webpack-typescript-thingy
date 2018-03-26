import * as ts from './../../typescript';

const DefinitionReg = /\.d\.tsx?$/;
export function watch(myFs: any, watcher: IWatcher, files: string[], folders: string[], update: (file: string, content: string) => void) {
    watcher.watch(files.filter(RegExp.prototype.test.call, DefinitionReg), folders, -1);
    watcher.on('change', onChange);
    let changes = 0;
    let promise = [];
    return function (fn: any, arg: any) {
        if (changes) {
            promise.push([fn, arg]);
        } else {
            processItem(fn, arg);
        }
    };
    function processItem(fn: any, arg: any) {
        fn(arg);
    };
    function onChange(fileName: string) {
        if (DefinitionReg.test(fileName)) {
            changes++;
            myFs.readFile(fileName, function (err: Error, content: Buffer) {
                update(fileName, content.toString());
                changes--;
                if (!changes && promise.length) {
                    if (promise.length === 1) {
                        processItem(promise[0][0], promise[0][1]);
                    } else {
                        for (let i = 0; i < promise.length; i++) {
                            processItem.apply(null, promise[i]);
                        }
                    }
                    promise.length = 0;
                }
            });
        }
    }

}
