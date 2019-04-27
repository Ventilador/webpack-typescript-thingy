import { onNextTick } from './waterfallProcessor';
let pending = 0;
const pending_ = {};
export function makeWaterfall<T>(methods: Function[]) {
    methods = methods.map(prepareMethod, apply);
    return apply;
    function apply(startingRequest: T, next?: ICallback<T>) {
        pending++;
        const waterfall = new Waterfall(methods, startingRequest, function () {
            pending--;
            if (!pending) {
                setImmediate(notify);
            }
            delete pending_[waterfall.id];
            next && next.apply(null, arguments);
        });
        pending_[waterfall.id] = waterfall;
    };
}
const toNotify = [];
function notify() {
    toNotify.forEach(call);
}
function call(cb) {
    try {
        cb();
    } catch (err) {

    }
}
(Function('return this')()).pendingRequests = pendingRequests;
(Function('return this')()).pending_ = pending_;
export function pendingRequests() {
    return pending;
}
export function onDone(cb) {
    toNotify.push(cb);
}
function prepareMethod(method: Function) {
    return method.call(Waterfall.prototype, this);
}
export function configWaterfall(compilerOptions: any, host: IShortHost, docs: IShortDocReg, readFile: Function, resolveFile: Function) {
    Waterfall.prototype.host = host;
    Waterfall.prototype.docReg = docs;
    Waterfall.prototype.options = compilerOptions.options;
    Waterfall.prototype.node_modules = compilerOptions.raw.nodeModules;
    Waterfall.prototype.typeFolders = compilerOptions.options.typeRoots;
    Waterfall.prototype.readFile = readFile;
    Waterfall.prototype.resolveFile = resolveFile;
}
let id = 0;
class Waterfall<T> implements IWaterfall<T> {
    public _apply: Function;
    public node_modules: string;
    public typeFolders: string[];
    public readFile: any;
    public resolveFile: any;
    public options: CompilerOptions;
    public host: IShortHost;
    public docReg: IShortDocReg;
    public id = id++;
    private _index: number;
    private _current: T;
    private _error: Error;
    private _finished: boolean;
    private _methods: Function[];
    constructor(methods: Function[], startingRequest: T, done?: ICallback<T>) {
        const self = this;
        this._index = 0;
        this._current = startingRequest;
        this._finished = false;
        this._error = null;
        this._methods = methods;
        this._apply = function () {
            if (self._finished) {
                done(self._error, self._current);
                clean(self);
                return;
            }
            try {
                self._methods[self._index].call(self, self._current);
            } catch (err) {
                self.next(err);
            }
        };
        onNextTick(this._apply);
    }
    asyncBail() {
        const self = this;
        return Object.assign(function () {
            self.bail.apply(self, arguments);
        }, ext);
    }
    asyncNext() {
        const self = this;
        return Object.assign(function () {
            self.next.apply(self, arguments);
        }, ext);
    }
    bail(err: Error, result: T) {
        this.next(err, result);
        this._finished = true;
    }
    next(err: Error, result?: T) {
        if (this._finished) {
            return;
        }
        if (err) {
            this._finished = true;
            this._error = err;
        } else {
            this._current = result;
            if ((++this._index) === this._methods.length) {
                this._finished = true;
            }
        }
        onNextTick(this._apply);
    }
}
const ext = {
    resolver: function () {
        const self = this;
        return function (result: any) {
            self(null, result);
        };
    }
};

function clean(waterfall: any) {
    return (
        waterfall._error =
        waterfall._apply =
        waterfall._current =
        waterfall._done =
        waterfall._index =
        waterfall.async = null
    );
}
function noop() {

}