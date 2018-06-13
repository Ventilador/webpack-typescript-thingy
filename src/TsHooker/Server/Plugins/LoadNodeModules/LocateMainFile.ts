import { readdir, stat } from 'fs';
import { resolve } from 'path';
export function LocateMainFile() {
    return function LocateMainFile(this: IWaterfall<IResolveContext>, request: IResolveContext) {
        const async = this.asyncNext();
        readdir(request.modulePath, function (err: Error, list: string[]) {
            for (let ii = 0; ii < list.length; ii++) {
                const cur = list[ii];
                if (cur === 'index.d.ts') {
                    request.mainFile = resolve(request.modulePath, cur);
                    async(null, request);
                    return;
                } else if (cur === 'package.json') {
                    const obj = require(resolve(request.modulePath, cur));
                    if (obj) {
                        if (obj.typings) {
                            request.mainFile = resolve(request.modulePath, obj.typings);
                            async(null, request);
                            return;
                        } else if (obj.main) {
                            const path = resolve(request.modulePath, obj.main).replace(/\.js$/, '.d.ts');
                            stat(path, function (err: Error, stats: any) {
                                if (!err && stats.isFile()) {
                                    request.mainFile = path;
                                    async(null, request);
                                } else {
                                    bailer(async, request.module);
                                }
                            });
                            return;
                        }
                    }
                    bailer(async, request.module);
                    return;
                }
            }
            bailer(async, request.module);
        });
    };

    function bailer(asyncFn: Function, moduleName: string) {
        asyncFn(new Error('Could not resolve: "' + moduleName + '"'), null);
    }
}
