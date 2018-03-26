interface IMessageType {
    INIT: string;
    READ_FILE: string;
    EMIT_FILE: string;
    RESOLVE_FILE: string;
    DIAGNOSTICS: string;
    ERROR: string;
    CHANGED: string;
}
interface IConnector {
    emit(fileName: string, fileContent: string, onDone: ICallback<IResponseContext>): void;
    emit(fileName: string, fileContent: string): Promise<IResponseContext>;
}
interface Filter {
    (file: SourceFile): boolean;
}
interface IConnection { }

interface IScriptSnapshot { }
interface SourceFile {
    isDeclarationFile: boolean;
    moduleName: string;
}
interface IResponseContext {
    dependencies?: string[];
    output?: string;
    sourceMap?: string;
}
interface IFsAccessor {
    readFile(fileName: string, cb: (err: Error, content: Buffer) => void): void;
    resolveFile(fromDir: string, relPath: string, cb: (err: Error, fullPath: string) => void): void;
    readdir(dir: string, cb: (err: Error, files: string[]) => void): void;
}
interface IWatcher {
    watch: Function;
    on: Function;
}
interface IMessage extends IRequestContext {
    id?: string;
    method?: string;
}

interface IRequestContext {
    fileName?: string;
    data?: string;
    sourceFile?: SourceFile;
    sourceMap?: string;
    output?: string;
    dependencies?: any;
}
interface IFile {
    working: boolean;
    listeners: Function[];
    fileName: string;
    text: string;
    version: number;
    snapshot: any;
    output: string;
    sourceMap: string
    dependencies: string[];
}
interface IShortDocReg {
    toPath(fileName: string): any;
    updateDocumentWithKey(fileName: string, path: any, compilationSettings: CompilerOptions, key: any, scriptSnapshot: IScriptSnapshot, version: string, scriptKind?: any): SourceFile
    updateDocument(fileName: string, compilationSettings: CompilerOptions, scriptSnapshot: IScriptSnapshot, version: string, scriptKind?: any): SourceFile;
    getKeyForCompilationSettings(...args: any[])
}
interface IShortHost {
    readModule(name: string): string[];
    writeModule(name: string, files: string[]): void;
    getFile(fileName: string): IFile;
    readFile(path: string): string;
    getCompilationSettings(): CompilerOptions;
    getScriptSnapshot(fileName: IScriptSnapshot): IScriptSnapshot;
    getScriptVersion(fileName: IScriptSnapshot): string;
    writeFile(fileName: string, fileContent: string): void;
}
interface IWaterfallPlugin {
    (context: IWaterfall, request: IRequestContext): void;
}
interface IWaterfall {
    options: CompilerOptions;
    host: IShortHost;
    docReg: IShortDocReg;
    next: ICommonCallback;
    bail: ICommonCallback;
    applyWaterfall(startingRequest: IRequestContext, next: ICommonCallback): void;
    resolveFile(fromDir: string, relPath: string, cb: (err: Error, fullPath: string) => void): void;
    readFile(fileName: string, cb: (content: string) => void): void;
    asyncBail: () => IBoundCommonCallback;
    asyncNext: () => IBoundCommonCallback;
}
interface IBoundCommonCallback extends ICommonCallback {
    resolver(): IResolverCallback;
}


interface IResolverCallback {
    (result: IRequestContext): void;
}

interface ICallback<T> {
    (error: Error, result: T): void;
}

interface ICommonCallback extends ICallback<IRequestContext> { }

interface Dictionary<T> {
    [key: string]: T;
}



