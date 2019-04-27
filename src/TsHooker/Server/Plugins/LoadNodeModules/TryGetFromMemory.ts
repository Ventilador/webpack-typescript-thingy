import { resolve, dirname } from 'path';
const keys = ['$$resolve', 'resolving'];
export function TryGetFromMemory() {
    return function TryGetFromMemory(this: IWaterfall<IResolveContext>, request: IResolveContext) {
        const dir = this.host.directory();
        const moduleResolution = dir.resolve(request.module, '', this.host.getCompilationSettings());
        const node = dir.get<IResolveContext>(moduleResolution.resolvedFileName);
        if (node) {
            return this.bail(null);
        }
        dir.set(moduleResolution.resolvedFileName, request);
        request.modulePath = dirname(moduleResolution.resolvedFileName);
        this.next(null, request);
    };

    function cleanKey(key: string) {
        this[key] = null;
    }
}
