import * as fs from 'fs';
import { Directory } from './Directory';
export default class Folder implements IFolder {
    public static CreateFolder(folderName: string) {
        return Directory.get(folderName) || Directory.set(folderName, new Folder(folderName));
    }
    private _items: IChild[];
    public constructor(public folderName: string) {
        this._items = [];
    }
    public addFolder(name: string, stats: IFolder) {
        this._items.push(stats);
        return this;
    }
    public addFile(name: string, stats: IFile) {
        this._items.push(stats);
        return this;
    }
    public isFile() {
        return false;
    }
    public isFolder() {
        return true;
    }
    public toFile(): IFile {
        throw new Error('"' + this.folderName + '" is not a file');
    }
    public toFolder() {
        return this;
    }
    public getContent() {
        return this._items;
    }
    public fullName() {
        return this.folderName;
    }
}

function isTrue() {
    return true;
}

function isFalse() {
    return false;
}

interface IItem extends fs.Stats {

}
