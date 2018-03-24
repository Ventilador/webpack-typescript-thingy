
export function UpdateHostFile(this: IWaterfall, request: IRequestContext) {
    this.host.writeFile(request.fileName, request.data);
    this.next(null, request);
}
