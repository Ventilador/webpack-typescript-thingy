import { } from 'fs';
export function LoadNodeModules(this: IWaterfall, request: IRequestContext) {
    const nodeModules = request.dependencies.filter(isNodeModule, true).filter(this.host.readModule);
    if (nodeModules.length) {

    }
    request.dependencies = request.dependencies.filter(isNodeModule, false);
    this.next(null, request);
}

function isNodeModule(item: string) {
    return this === (item[0] !== '.' && item[0] !== '/');
}
