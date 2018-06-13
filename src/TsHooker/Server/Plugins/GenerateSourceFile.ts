import * as ts from './../../../typescript';

let key = null;
export function GenerateSourceFile() {
    return function GenerateSourceFile(this: IWaterfall<IRequestContext>, request: IRequestContext) {
        key = key || this.docReg.getKeyForCompilationSettings(this.options);
        request.sourceFile = this.docReg.updateDocumentWithKey(request.fileName, this.docReg.toPath(request.fileName), this.options, key, this.host.getScriptSnapshot(request.fileName), this.host.getScriptVersion(request.fileName), ts.ScriptKind.TS);
        this.next(null, request);
    };
}