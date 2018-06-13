
export function UpdateHostFile() {
    return function UpdateHostFile(this: IWaterfall<IRequestContext>, request: IRequestContext) {
        this.host.writeFile(request.fileName, request.data);
        this.next(null, request);
    };
}
