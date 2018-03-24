import * as path from 'path';
import * as ts from 'typescript';
export function createChecker(host: ts.LanguageServiceHost & IShortHost, registry: ts.DocumentRegistry) {
    const languageService = ts.createLanguageService(host, registry);
    const instanceName = 'Typescript thingy';
    const context = host.getCurrentDirectory();
    const compilerConfig = { options: host.getCompilationSettings() };
    return processDiagnostics;
    function processDiagnostics() {
        let program;
        try {
            program = languageService.getProgram();
        } catch (err) {
            throw err;
        }
        const allDiagnostics = program
            .getOptionsDiagnostics()
            .concat((program.getGlobalDiagnostics as any)());

        const filters: Filter[] = [];

        if (compilerConfig.options.skipLibCheck) {
            filters.push(file => {
                return !file.isDeclarationFile;
            });
        }

        let nativeGetter: Function;
        if (filters.length > 0) {
            nativeGetter = program.getSourceFiles;
            program.getSourceFiles = () => nativeGetter().filter(file => {
                return filters.every(f => f(file));
            });
        }

        allDiagnostics.push(...program.getSyntacticDiagnostics());
        allDiagnostics.push(...program.getSemanticDiagnostics());


        if (nativeGetter) {
            program.getSourceFiles = nativeGetter;
        }

        const processedDiagnostics = allDiagnostics
            // .filter(diag => !ignoreDiagnostics[diag.code])
            .map(diagnostic => {
                const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
                let fileName = diagnostic.file && path.relative(context, diagnostic.file.fileName);

                if (fileName && fileName[0] !== '.') {
                    fileName = './' + toUnix(fileName);
                }

                let pretty = '';
                let line = 0;
                let character = 0;
                let code = diagnostic.code;

                if (diagnostic.file) {
                    const pos = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
                    line = pos.line;
                    character = pos.character;
                    pretty = (`[${instanceName}] ${fileName}:${line + 1}:${character + 1} \n    TS${code}: ${message}`);
                } else {
                    pretty = (`[${instanceName}] TS${code}: ${message}`);
                }

                return {
                    category: diagnostic.category,
                    code: diagnostic.code,
                    fileName,
                    start: diagnostic.start,
                    message,
                    pretty,
                    line,
                    character
                };
            });

        return processedDiagnostics;
    }
};
const double = /\/\//;
function toUnix(fileName: string): string {
    let res: string = fileName.replace(/\\/g, '/');
    while (res.match(double)) {
        res = res.replace(double, '/');
    }

    return res;
}
