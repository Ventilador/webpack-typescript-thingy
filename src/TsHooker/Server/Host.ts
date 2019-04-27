import * as ts from './../../typescript';
import { normalize } from 'path';
import { singleton } from './../utils/singleTon';
import { Directory } from './../utils/Directory';
import Folder from './../utils/Folder';
interface IFileInternal extends IFile {
    snapshot: ts.IScriptSnapshot;
}
const context = process.cwd();

class FileDeps {
    files: { [fileName: string]: string[] } = {};

    add(containingFile: string, ...dep: string[]) {
        if (!this.files[containingFile]) {
            this.files[containingFile] = Array.from(dep);
        } else {
            const deps = this.files[containingFile];
            deps.push.apply(deps, dep);
        }
    }

    getDeps(containingFile: string): string[] {
        return this.files[containingFile] || [];
    }

    getAllDeps(containingFile: string, allDeps: { [key: string]: boolean } = {}, initial: boolean = true): string[] {
        const deps = this.getDeps(containingFile);
        deps.forEach(dep => {
            if (!allDeps[dep]) {
                allDeps[dep] = true;
                this.getAllDeps(dep, allDeps, false);
            }
        });

        if (initial) {
            return Object.keys(allDeps);
        } else {
            return [];
        }
    }
}

const fileDeps = new FileDeps();
export const makeHost = singleton(function makeHost(parsed: ts.ParsedCommandLine, caseInsensitive?: boolean): ts.LanguageServiceHost & IShortHost {
    const compilerOptions: CompilerOptions = parsed.options;
    Directory.resolveFrom(parsed.raw.$$extensions);
    Directory.knowExtensions(parsed.raw.$$matchers.map(i => new RegExp(i)));
    let projectVersion = 0;
    let files = Directory;
    const modules = Object.create(null);
    class Host {
        filesRegex: RegExp;
        getCustomTransformers: any;
        getFile: (fileName: string) => IFileInternal;
        async: { readFile: Function };
        constructor(filesRegex: RegExp) {
            this.filesRegex = filesRegex;
            this.getFile = Directory.get;
        }
        getNodeModules() { return parsed.raw.nodeModules; }

        getProjectVersion() { return projectVersion.toString(); }

        getScriptFileNames() {
            const names = files.map(file => file ? file.fileName : '')
                .filter(fileName => this.filesRegex.test(fileName));
            return names;
        }

        getScriptVersion(fileName: string) {
            const file = files.get(fileName);
            if (file) {
                return file.version.toString();
            }
            fileName = fileName;
        }

        getScriptSnapshot(fileName: string) {
            const file = files.get(fileName);
            if (file) {
                return file.snapshot;
            }
            fileName = fileName;
        }

        getCurrentDirectory() {
            return context;
        }

        getScriptIsOpen() {
            return true;
        }

        getCompilationSettings() {
            return compilerOptions;
        }

        readModule(name: string) {
            return modules[name];
        }

        writeModule(name: string, files: string[]) {
            modules[name] = files;
        }

        resolveTypeReferenceDirectives(typeDirectiveNames: string[], containingFile: string) {
            return typeDirectiveNames.map(directive =>
                ts.resolveTypeReferenceDirective(directive, containingFile, compilerOptions, this as any)
                    .resolvedTypeReferenceDirective);
        }

        resolveModuleNames(moduleNames: string[], containingFile: string) {

            return moduleNames.map(module => Directory.resolve(module, containingFile, compilerOptions))
                .map(item => {
                    if (item && item.resolvedFileName && item.resolvedFileName.startsWith(Directory.NODE_MODULES)) {
                        const request = Directory.get<IResolveContext>(item.resolvedFileName);
                        if (request) {
                            item.resolvedFileName = request.mainFile || item.resolvedFileName;
                        }
                    }
                    return item;
                });
        }

        log(message: string) {
            console.log(message);
        }

        fileExists(fileName: string) {
            return files.has(fileName);
        }

        readFile(fileName: string) {
            return files.get(fileName).text;
        }

        readDirectory(path: string) {
            return Directory.getDir(path);
        }

        getDefaultLibFileName(options: ts.CompilerOptions) {
            return ts.getDefaultLibFilePath(options);
        }

        useCaseSensitiveFileNames() {
            return caseInsensitive;
        }

        readFolder(path: string) {
            return Directory.walker(path);
        }

        directoryExists(path: string) {
            return Directory.has(path);
        }

        writeFile(fileName: string, fileContent?: string) {
            const text = fileContent || '';
            const file = files.get(fileName);
            if (file) {
                let updated = false;
                if (file.fileName !== fileName) {
                    if (caseInsensitive) {
                        file.fileName = fileName; // use most recent name for case-sensitive file systems
                        updated = true;
                    } else {
                        projectVersion++;
                        files.set(fileName, {
                            fileName,
                            text: text,
                            version: 0,
                            snapshot: ts.ScriptSnapshot.fromString(text)
                        });
                        return;
                    }
                }
                if (file.text !== text) { updated = updated || true; }
                if (!updated) {
                    return;
                }
                projectVersion++;
                file.version++;
                file.text = text;
                file.snapshot = ts.ScriptSnapshot.fromString(text);
            } else {
                projectVersion++;
                files.set(fileName, {
                    fileName,
                    text,
                    version: 0,
                    snapshot: ts.ScriptSnapshot.fromString(text)
                });
            }
        }
        directory() {
            return Directory;
        }
    }
    return new Host(/\.ts$/);
}) as (compilerOptions: ts.ParsedCommandLine, useCaseSensitiveFileNames: boolean) => ts.LanguageServiceHost & IShortHost;

function toPath(item: IChild) {
    return item.fullName();
}
