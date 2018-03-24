import { sep, normalize, basename } from 'path';
const driverSep = ':';
import { resolve, dirname, extname } from 'path';
// [.ttf(\?v=\d+\.\d+\.\d+)?$/, /\.eot(\?v=\d+\.\d+\.\d+)?$/, /\.svg(\?v=\d+\.\d+\.\d+)?$/]
const fastExtensions = {
    '.ts': true,
    '.html': true,
    '.css': true,
    '.less': true,
    '.js': true,
    '.json': true,
    '.png': true,
    '.woff': true,
    '.ttf': true,
    '.eot': true,
    '.svg': true,
    '.jpeg': true,
    '.jpg': true,
    '.gif': true
};
class NodeItem {
    public val;
    public static MakeRoot() {
        return new NodeItem('', null);
    }
    private _lowname: string;
    private children: Dictionary<NodeItem>;
    private constructor(private name: string, private parent: NodeItem) {
        this.val = null;
        this._lowname = name.toLowerCase();
    }
    nameIs(name: string) {
        return this._lowname === name.toLowerCase();
    }
    isLeaf() {
        return !this.children;
    }
    createChild(name: string) {
        if (!this.children) {
            this.children = Object.create(null);
        }
        return this.children[name.toLowerCase()] = new NodeItem(name, this);
    }
    getChild(name: string) {
        return this.children && this.children[name.toLowerCase()];
    }
    hasChild(name: string) {
        return !!(this.children && this.children[name.toLowerCase()]);
    }
    getChildren() {
        return this.children && Object.keys(this.children).map(childrenName, this.children) || [];
    }
    remove() {
        if (this.parent) {
            delete this.parent.children[this.name.toLowerCase()];
            this.name = this._lowname = this.val = this.children = null;
        }
    }
    get fullPath() {
        let cur = this as NodeItem;
        let path = '';
        do {
            path = cur.name + sep + path;
        } while (cur = cur.parent);
        return path;
    }
}
function childrenName(child: any) {
    return this[child].name;
}


export const Directory = (function () {
    const root = NodeItem.MakeRoot();
    let exts: string[];
    let matchers: RegExp[];
    return {
        set: function (path: string, content: any) {
            getNode(path, true).val = content;
        },
        get: function (path: string) {
            const node = getNode(path, false);
            return node && node.val;
        },
        has: function (path: string) {
            return !!getNode(path, false);
        },
        getDir: function (path: string) {
            const dir = getNode(path, false);
            if (dir) {
                return dir.getChildren();
            }
            return [];
        },
        map: function (cb: Function) {
            const result = [];
            root.getChildren().forEach(recurse, root);
            return result;
            function recurse(this: NodeItem, name: string) {
                const node = this.getChild(name);
                if (node.isLeaf()) {
                    result.push(cb(node.val));
                } else {
                    node.getChildren().forEach(recurse, node);
                }
            }
        },
        resolve: function (module: string, containingFile: string, compilerOptions: any) {
            if (module[0] !== '.' && module[0] !== '/') {
                return nodeModule(module);
            }
            const fileName = basename(module);
            const extension = extname(fileName);
            const folder = dirname(containingFile);
            if (fastExtensions[extension] || (matchers && matchers.find(match, extension))) {
                return {
                    extension: extension,
                    isExternalLibraryImport: false,
                    packageId: undefined,
                    resolvedFileName: resolve(folder, module)
                };
            }
            const path = dirname(resolve(folder, module));
            const node = getNode(path, false);
            if (node) {
                for (let i = 0, ar = node.getChildren(), cur = ar[i]; i < ar.length; cur = ar[++i]) {
                    if (resolves(fileName, cur)) {
                        return {
                            extension: extname(cur),
                            isExternalLibraryImport: false,
                            packageId: undefined,
                            resolvedFileName: resolve(path, cur)
                        };
                    }
                }
            }
            return null;
        },
        delete: function (path: string) {
            const node = getNode(path, false);
            return node && node.remove();
        },
        resolveFrom: function (extensions: string[]) {
            exts = exts ? exts.concat(extensions) : extensions.slice();
        },
        knowExtensions: function (exts: RegExp[]) {
            matchers = matchers ? matchers.concat(exts) : exts.slice();
        }
    };
    function nodeModule(module: string) {
        return {
            extension: '.js',
            isExternalLibraryImport: true,
            packageId: {} as any,
            resolvedFileName: 'C:/fake/node_modules/' + module + '.js'
        };
    }
    function match(this: string, reg: RegExp) {
        return reg.test(this);
    }
    function resolves(name1: string, name2: string, internal?: boolean) {
        const low1 = name1.toLowerCase(), low2 = name2.toLowerCase();
        if (low1 === low2) {
            return true;
        }
        if (exts && exts.length) {
            if (exts.length === 1) {
                return (low1 + exts[0] === low2);
            }
            for (let i = 0; i < exts.length; i++) {
                if (low1 + exts[i] === low2) {
                    return true;
                }
            }
        }
        if (internal) {
            return false;
        }
        if (name1.endsWith('/')) {
            return resolves(name1 + 'index', name2, true);
        }
        return resolves(name1 + sep + 'index', name2, true);
    }

    function getNode(path_: string, create: boolean) {
        let p = normalize(path_);
        let node = root, collected = [], name;
        for (let i = 0, cur = p[i], l = p.length; i < l; cur = p[++i]) {
            if (cur === sep) {
                name = collected.join('');
                let temp = node.getChild(name);
                if (temp) {
                    node = temp;
                } else {
                    if (create) {
                        node = node.createChild(name);
                    } else {
                        return null;
                    }
                }
                collected.length = 0;
            } else if (cur !== driverSep) {
                collected.push(cur);
            }
        }
        let temp = node.getChild(name = collected.join(''));
        if (temp) {
            node = temp;
        } else {
            if (create) {
                node = node.createChild(name);
            } else {
                return null;
            }
        }
        return node;
    }
})();
