import * as ts from 'typescript';
import { normalize } from 'path';
import { singleton } from './../utils/singleTon';
import { Directory } from './../utils/Directory';
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
    class Host {
        filesRegex: RegExp;
        getCustomTransformers: any;
        getFile: (fileName: string) => IFileInternal;
        constructor(filesRegex: RegExp) {
            this.filesRegex = filesRegex;
            this.getFile = Directory.get;
        }

        getProjectVersion() { return projectVersion.toString(); }

        getScriptFileNames() {
            const names = files.map(file => file.fileName)
                .filter(fileName => this.filesRegex.test(fileName));
            return names;
        }

        getScriptVersion(fileName: string) {
            const file = files.get(fileName);
            if (file) {
                return file.version.toString();
            }
        }

        getScriptSnapshot(fileName: string) {
            const file = files.get(fileName);
            if (file) {
                return file.snapshot;
            } else {
                console.log(fileName);
            }
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

        resolveTypeReferenceDirectives(typeDirectiveNames: string[], containingFile: string) {
            const resolved = typeDirectiveNames.map(directive =>
                ts.resolveTypeReferenceDirective(directive, containingFile, compilerOptions, this as any)
                    .resolvedTypeReferenceDirective);

            resolved.forEach(res => {
                if (res && res.resolvedFileName) {
                    fileDeps.add(containingFile, res.resolvedFileName);
                }
            });

            return resolved;
        }

        resolveModuleNames(moduleNames: string[], containingFile: string) {
            const resolved = moduleNames.map(module => Directory.resolve(module, containingFile, compilerOptions) || ts.resolveModuleName(module, containingFile, compilerOptions, ts.sys).resolvedModule);

            resolved.forEach(res => {
                if (res && res.resolvedFileName) {
                    fileDeps.add(containingFile, res.resolvedFileName = normalize(res.resolvedFileName));
                }
            });

            return resolved;
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
            return [];
        }

        getDefaultLibFileName(options: ts.CompilerOptions) {
            return ts.getDefaultLibFilePath(options);
        }

        useCaseSensitiveFileNames() {
            return caseInsensitive;
        }

        getDirectories(path: string) {
            return Directory.getDir(path);
        }

        directoryExists(path: string) {
            return Directory.has(path);
        }
        writeFile(fileName: string, text: string) {
            if (!text) {
                text = '';
            }
            const file = files.get(fileName);
            if (file) {
                let updated = false;
                if (file.fileName !== fileName) {
                    if (caseInsensitive) {
                        file.fileName = fileName; // use most recent name for case-sensitive file systems
                        updated = true;
                    } else {
                        files.delete(file.fileName);
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
    }
    return new Host(/./);
}) as (compilerOptions: ts.ParsedCommandLine, useCaseSensitiveFileNames: boolean) => ts.LanguageServiceHost & IShortHost;

