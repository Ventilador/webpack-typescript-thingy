export function getFileConfig(this: IWaterfall<void>) {
    return function (this: IWaterfall<IRequestContext>, request: IRequestContext) {
        const async = this.asyncNext();
        this.readFile(request.fileName, function (content: string) {
            request.data = content || '';
            async(null, request);
        });
    };
}
