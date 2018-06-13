/// <reference path="../../node_modules/@types/node/index.d.ts"/>
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
interface IShortDocReg {
    toPath(fileName: string): any;
    updateDocumentWithKey(fileName: string, path: any, compilationSettings: CompilerOptions, key: any, scriptSnapshot: IScriptSnapshot, version: string, scriptKind?: any): SourceFile
    updateDocument(fileName: string, compilationSettings: CompilerOptions, scriptSnapshot: IScriptSnapshot, version: string, scriptKind?: any): SourceFile;
    getKeyForCompilationSettings(...args: any[])
}
declare class IWalker {
    constructor(path: string);
    isValid(): boolean;
    getChildrenNames(): string[]
    getChild(name: string): IWalker;
    setChild(name: string, val: any): IWalker
    getParent(): IWalker;
    getValue<T>(): T;
    getValue(): any;
}
interface IDirectory {
    NODE_MODULES: string;
    walker: (path: string) => IWalker;
    set<T>(path: string, content: T): T;
    get(path: string): any;
    get<T>(path: string): T;
    has: (path: string) => boolean;
    getDir: (path: string) => any[];
    map: (cb: Function) => any[];
    resolve: (module: string, containingFile: string, compilerOptions: any) => {
        extension: string;
        isExternalLibraryImport: boolean;
        packageId: any;
        resolvedFileName: string;
    };
    delete: (path: string) => void;
    resolveFrom: (extensions: string[]) => void;
    knowExtensions: (exts: RegExp[]) => void;
}
interface IShortHost {
    directory(): IDirectory;
    directoryExists(path: string): boolean;
    getNodeModules(): string;
    readModule(name: string): string[];
    writeModule(name: string, files: any): void;
    getFile(fileName: string): IFile;
    readFile(path: string): string;
    getCompilationSettings(): CompilerOptions;
    getScriptSnapshot(fileName: IScriptSnapshot): IScriptSnapshot;
    getScriptVersion(fileName: IScriptSnapshot): string;
    writeFile(fileName: string, fileContent: string): void;
    readDirectory(dirName: string): string[];
}
declare class IFolder extends IChild {
    static CreateFolder(folderName: string): IFolder;
    folderName: string
    addFolder(name: string, stats?: any): IFolder;
    addFile(name: string, stats?: any): IFolder;
    getContent(): any[];
}

interface IFile extends IChild {
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
declare class IChild {
    isFile(): boolean;
    isFolder(): boolean;
    toFile(): IFile;
    toFolder(): IFolder;
    fullName(): string;
}
interface IWaterfallPlugin<T> {
    (context: IWaterfall<T>, request: T): void;
}
interface IWaterfall<T> {
    node_modules: string;
    typeFolders: string[];
    options: CompilerOptions;
    host: IShortHost;
    docReg: IShortDocReg;
    next: ICallback<T>;
    bail: ICallback<T>;
    resolveFile(fromDir: string, relPath: string, cb: (err: Error, fullPath: string) => void): void;
    readFile(fileName: string, cb: (content: string) => void): void;
    asyncBail: () => IBoundCommonCallback<T>;
    asyncNext: () => IBoundCommonCallback<T>;
}
interface IBoundCommonCallback<T> extends ICallback<T> {
    resolver(): IResolverCallback<T>;
}


interface IResolverCallback<T> {
    (result?: T): void;
}

interface ICallback<T> {
    (error: Error, result?: T): void;
}


interface Dictionary<T> {
    [key: string]: T;
}



