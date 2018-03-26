export function getFileConfig(host: IShortHost) {
    return function (this: IWaterfall, request: IRequestContext) {
        const async = this.asyncNext();
        this.readFile(request.fileName, function (content: string) {
            request.data = content || '';
            async(null, request);
        });
    };
}
