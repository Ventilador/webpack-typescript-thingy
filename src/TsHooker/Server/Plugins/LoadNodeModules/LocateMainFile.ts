import { readdir, stat } from 'fs';
import { resolve } from 'path';
export function LocateMainFile(this: IWaterfall<IResolveContext>) {
    const host = this.host;
    return function LocateMainFile(this: IWaterfall<IResolveContext>, request: IResolveContext) {
        if (!request.modulePath) {
            this.next(null, request);
            return;
        }
        const async = this.asyncNext();
        readdir(request.modulePath, function (err: Error, list: string[]) {
            for (let ii = 0; ii < list.length; ii++) {
                const cur = list[ii];
                if (cur === 'index.d.ts') {
                    request.mainFile = resolve(request.modulePath, cur);
                    async(null, request);
                    return;
                } else if (cur === 'package.json') {
                    const path = resolve(request.modulePath, cur)
                    const obj = require(path);
                    host.writeFile(path, JSON.stringify(obj))
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
                                    request.mainFile = null;
                                    async(null, request);
                                }
                            });
                            return;
                        }
                    }
                }
            }
            async(null, request);
        });
    };

    function bailer(asyncFn: Function, moduleName: string) {
        asyncFn(new Error('Could not resolve: "' + moduleName + '"'), null);
    }
}
