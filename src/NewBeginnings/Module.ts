import { Watcheable, Watch } from './Watcheable';
export abstract class Module extends Watcheable {
    private _dependencies: Module[];
    private _dependants: Module[];
    private _fileName: string;
    private _content: string;
    private _hash: string;
    private _dirty: boolean;
    constructor(fileName: string, content: string) {
        super();
        this._dirty = !content;
        this._fileName = fileName;
        this._dependencies = [];
        this._dependants = [];
        this._content = content;
    }
    protected abstract process(): Promise<Module>;
    protected abstract read(): Promise<string>;
    protected abstract moduleToFilePath(mod: Module): string;

    @Watch
    getHash(): Promise<string> {
        if (this._dirty) {
            return this.read()
        }
    };
    getDependencies(): string[] {
        return this._dependencies.map(this.moduleToFilePath, this);
    };
    getDependants(): string[] {
        return this._dependants.map(this.moduleToFilePath, this);
    };
    getText(): Promise<string> {
        if (this._dirty) {
            return Promise.resolve(this._content);
        }
        return this.read()
            .then((val) => {
                return this._content = val;
            });
    };
    private read_() {
        if (this._dirty) {
            return this.read().then(val => this._content = val);
        }
        return Promise.resolve(this._content);
    }

    abstract getAsDefinition(): Promise<string>;


}