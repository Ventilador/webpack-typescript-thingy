import { transpile } from './../Transpiler';
const DefinitionReg = /\.d\.tsx?$/;
export function TranspileFile() {
    return function TranspileFile(this: IWaterfall < IRequestContext >, request: IRequestContext) {
        if (DefinitionReg.test(request.fileName)) {
            return this.next(null, request);
        }
        const result = transpile(request.sourceFile, {
            fileName: request.fileName,
            reportDiagnostics: false,
            compilerOptions: this.options
        });
        request.output = result.outputText;
        request.sourceMap = result.sourceMapText;
        this.next(null, request);
    };
}
