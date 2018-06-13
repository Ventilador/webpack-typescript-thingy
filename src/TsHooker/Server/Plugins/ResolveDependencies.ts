import { dirname } from 'path';

export function ResolveDependencies() {
    return function ResolveDependencies(this: IWaterfall<IRequestContext>, request: IRequestContext) {
        let amount = request.dependencies && request.dependencies.length;
        if (amount) {
            const dir = dirname(request.fileName);
            const resolve = this.resolveFile;
            let async = this.asyncNext();
            request.dependencies.forEach(function (fileName: string, index: number) {
                resolve(dir, fileName, function (err: Error, result: string) {
                    if (async) {
                        if (err) {
                            async(err, null);
                            async = null;
                        }
                        request.dependencies[index] = result;
                        amount--;
                        if (!amount) {
                            async(null, request);
                        }
                    }

                });
            });
        } else {
            this.next(null, request);
        }
    };
}
