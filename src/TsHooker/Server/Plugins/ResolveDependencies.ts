import { dirname } from 'path';
export function ResolveDependencies(this: IWaterfall, request: IRequestContext) {
    let amount = request.dependencies && request.dependencies.length;
    if (amount) {
        const dir = dirname(request.fileName);
        const resolve = this.resolveFile;
        let async = this.asyncNext();
        request.dependencies.forEach(function (fileName: string, index: number) {
            resolve(dir, fileName, function (err: Error, result: string) {
                if (err) {
                    if (async) {
                        async(err, null);
                        async = null;
                    }
                    return;
                }
                request.dependencies[index] = result;
                amount--;
                if (!amount) {
                    async(null, request);
                }
            });
        });
    } else {
        this.next(null, request);
    }
}
