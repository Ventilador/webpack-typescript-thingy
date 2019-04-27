import { sep, normalize, basename } from 'path';
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
    private _fullPath: string;
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
    getParent() {
        return this.parent;
    }
    fullPath() {
        if (this._fullPath) {
            return this._fullPath;
        }
        let cur = this as NodeItem;
        let path = cur.name;
        while ((cur = cur.parent)) {
            path = cur.name ? cur.name + sep + path : path;
        };

        return this._fullPath = normalize(path);
    }
}
function childrenName(child: any) {
    return this[child].name;
}


export const Directory: IDirectory = (function () {
    const root = NodeItem.MakeRoot();
    let exts: string[];
    let matchers: RegExp[];
    const service = {
        set: function <T>(path: string, content: T) {
            return getNode(path, true).val = content;
        },
        walker: function (path: string) {
            return new Walker(path);
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
            let nodeItem = getNode(folder, false);
            if (!nodeItem) {
                throw new Error('Could not find path ' + containingFile);
            }
            const arr = module.split('/');
            for (let i = 0; i < arr.length; i++) {
                const cur = arr[i];
                if (cur === '..') {
                    nodeItem = nodeItem.getParent();
                } else if (!cur) {
                    let tempNode = nodeItem.getChild('index.ts');
                    if (!tempNode) {
                        tempNode = nodeItem.getChild('index.d.ts');
                    }
                    if (!tempNode) {
                        throw new Error('Could not resolve: "' + module + '" from "' + containingFile + '".');
                    }
                    nodeItem = tempNode;
                } else if (cur !== '.') {
                    let tempNode = nodeItem.getChild(cur);
                    if (!tempNode) {
                        tempNode = nodeItem.getChild(cur + '.ts');
                    }
                    if (!tempNode) {
                        tempNode = nodeItem.getChild(cur + '.d.ts');
                    }
                    if (!tempNode) {
                        throw new Error('Could not resolve: "' + module + '" from "' + containingFile + '".');
                    }
                    nodeItem = tempNode;
                }
            }
            return {
                extension: '.ts',
                isExternalLibraryImport: false,
                packageId: undefined,
                resolvedFileName: nodeItem.isLeaf() ? nodeItem.fullPath() : nodeItem.getChild('index.ts').fullPath()
            };



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
    // KEEP IN SYNC!!
    const fakeNodeModules = 'C:/fake/node_modules/';
    Object.defineProperty(service, 'NODE_MODULES', {
        get: function () {
            // KEEP IN SYNC!!
            // const fakeNodeModules = 'C:/fake/node_modules/';
            return 'C:/fake/node_modules/';
        }
    });
    class Walker implements IWalker {
        private _node: NodeItem;
        constructor(path: string) {
            this._node = getNode(path, false);
        }
        isValid() {
            return !!this._node;
        }
        getChildrenNames() {
            return this._node.getChildren() || [];
        }
        getChild(name: string) {
            this._node = this._node.getChild(name);
            return this;
        }
        setChild(name: string, val: any) {
            const child = this._node.getChild(name) || this._node.createChild(name);
            child.val = val;
            return this;
        }
        getParent() {
            if (this._node) {
                this._node = this._node.getParent();
            }
            return this;
        }
        getValue() {
            return this._node.val;
        }
    }
    return service as any;
    function nodeModule(module: string) {
        return {
            extension: '.js',
            isExternalLibraryImport: true,
            packageId: {} as any,
            resolvedFileName: fakeNodeModules + module + '/index.js'
        };
    }
    function match(this: string, reg: RegExp) {
        return reg.test(this);
    }
    function resolves(name1: string, name2: string, internal?: boolean) {
        const low1 = name1.toLowerCase(), low2 = name2.toLowerCase();
        if (low1 === low2) {
            return name2;
        }
        if (exts && exts.length) {
            if (exts.length === 1) {
                return (low1 + exts[0] === low2) && name2;
            }
            for (let i = 0; i < exts.length; i++) {
                if (low1 + exts[i] === low2) {
                    return name2;
                }
            }
        }
        if (internal) {
            return false;
        }
        if (name1.endsWith('/')) {
            return resolves(name1 + 'index', name2, true) && (name2 + '/index.ts');
        }
        return resolves(name1 + sep + 'index', name2, true) && (name2 + '/index.ts');
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
            } else {
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
