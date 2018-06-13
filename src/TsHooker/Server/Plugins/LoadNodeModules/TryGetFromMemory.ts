import { resolve, dirname } from 'path';
const keys = ['$$resolve', 'resolving'];
export function TryGetFromMemory() {
    return function TryGetFromMemory(this: IWaterfall<IResolveContext>, request: IResolveContext) {
        const dir = this.host.directory();
        const moduleResolution = dir.resolve(request.module, '', this.host.getCompilationSettings());
        const modulePath = dirname(moduleResolution.resolvedFileName);
        const node = dir.get<IResolveContext>(modulePath);
        if (node) {
            if (node.resolving) {
                const bail = this.asyncBail();
                return node.resolving.then(bail.resolver(), bail as any);
            } else if (node.resolved) {
                return this.bail(null, node);
            }
            return this.bail(new Error('Something went wrong'), null);
        }
        dir.set(modulePath, request);
        request.modulePath = modulePath;
        request.resolving = new Promise((res: Function, rej: Function) => {
            request.$$resolve = function (err) {
                keys.forEach(cleanKey, request);
                if (err) {
                    rej(err);
                } else {
                    res(request);
                }
            };
        });
        this.next(null, request);
    };

    function cleanKey(key: string) {
        this[key] = null;
    }
}
