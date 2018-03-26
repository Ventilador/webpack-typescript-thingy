import * as ts from './../../typescript';
const {
    fixupCompilerOptions,
    getDefaultCompilerOptions,
    createMapFromTemplate,
    getNewLineCharacter,
    normalizePath,
    fileExtensionIs,
    Debug
 } = (ts as any);

const array = [];
class CompilerHost {
    public static Instance(options: any) {
        if (CompilerHost._instance) {
            return CompilerHost._instance;
        }
        return CompilerHost._instance = new CompilerHost(getNewLineCharacter(options), ts.getDefaultLibFileName(options));
    }
    private static _instance: CompilerHost;
    private sourceMapText: string;
    private outputText: string;
    private inputFileName: string;
    private sourceFile: ts.SourceFile;
    private constructor(private readonly newLine: string, private readonly libName: string) {
        this.flush();
    }
    change(fileName: string, source: ts.SourceFile) {
        this.inputFileName = fileName;
        this.sourceFile = source;
        return this;
    }
    flush(err?: any) {
        const toReturn = err ?
            { outputText: null, diagnostics: null, sourceMapText: null } :
            { outputText: this.outputText, diagnostics: null, sourceMapText: this.sourceMapText };
        this.sourceMapText = this.outputText = this.inputFileName = this.sourceFile = null;
        return toReturn;
    }
    getSourceFile() {
        return this.sourceFile;
    }
    writeFile(name: string, text: string) {
        if (fileExtensionIs(name, '.map')) {
            this.sourceMapText = text;
        } else {
            this.outputText = text;
        }
    }
    getDefaultLibFileName() {
        return this.libName;
    }
    useCaseSensitiveFileNames() {
        return false;
    }
    getCanonicalFileName(fileName: string) {
        return '';
    }
    getCurrentDirectory() {
        return '';
    }
    getNewLine() {
        return this.newLine;
    }
    fileExists(fileName: string) {
        return fileName === this.inputFileName;
    }
    readFile() {
        return '';
    }
    directoryExists() {
        return true;
    }
    getDirectories() {
        return array;
    }
}


export function transpile(input: SourceFile, transpileOptions: ts.TranspileOptions) {
    const diagnostics: ts.Diagnostic[] = [];

    const options: ts.CompilerOptions = transpileOptions.compilerOptions ? fixupCompilerOptions(transpileOptions.compilerOptions, diagnostics) : getDefaultCompilerOptions();

    options.isolatedModules = true;

    // transpileModule does not write anything to disk so there is no need to verify that there are no conflicts between input and output paths.
    options.suppressOutputPathCheck = true;

    // Filename can be non-ts file.
    options.allowNonTsExtensions = true;

    // We are not returning a sourceFile for lib file when asked by the program,
    // so pass --noLib to avoid reporting a file not found error.
    options.noLib = true;

    // Clear out other settings that would not be used in transpiling this module
    options.lib = undefined;
    options.types = undefined;
    options.noEmit = undefined;
    options.noEmitOnError = undefined;
    options.paths = undefined;
    options.rootDirs = undefined;
    options.declaration = undefined;
    options.declarationDir = undefined;
    options.out = undefined;
    options.outFile = undefined;

    // We are not doing a full typecheck, we are not resolving the whole context,
    // so pass --noResolve to avoid reporting missing file errors.
    options.noResolve = true;

    // if jsx is specified then treat file as .tsx
    const inputFileName = transpileOptions.fileName || (options.jsx ? 'module.tsx' : 'module.ts');
    if (transpileOptions.moduleName) {
        input.moduleName = transpileOptions.moduleName;
    }

    if (transpileOptions.renamedDependencies) {
        (input as any).renamedDependencies = createMapFromTemplate(transpileOptions.renamedDependencies);
    }

    // Output
    let outputText: string;
    let sourceMapText: string;

    // Create a compilerHost object to allow the compiler to read and write files
    const compilerHost = CompilerHost.Instance(options);
    const program = ts.createProgram([inputFileName], options, compilerHost.change(inputFileName, input as any));

    return _transpile(program, compilerHost, transpileOptions.transformers || null);
}

function _transpile(program: ts.Program, compilerHost: CompilerHost, transformers: ts.CustomTransformers) {
    let threw = null;
    try {
        program.emit(/*targetSourceFile*/ undefined, /*writeFile*/ undefined, /*cancellationToken*/ undefined, /*emitOnlyDtsFiles*/ undefined);
    } catch (err) {
        threw = err;
    }
    finally {
        return compilerHost.flush(threw);
    }
}
