import { onNextTick } from './waterfallProcessor';
export function makeWaterfall(host: IShortHost, docs: IShortDocReg, readFile: Function, resolveFile: Function, methods: Function[]) {
    Waterfall.prototype.host = host;
    Waterfall.prototype.docReg = docs;
    Waterfall.prototype.options = host.getCompilationSettings();
    Waterfall.prototype.readFile = readFile;
    Waterfall.prototype.resolveFile = resolveFile;
    Waterfall.prototype.applyWaterfall = apply;
    return apply;
    function apply(startingRequest: IRequestContext, next: ICommonCallback) {
        new Waterfall(methods, startingRequest, next); // tslint:disable-line
    };
}
class Waterfall implements IWaterfall {
    public _apply: Function;
    public applyWaterfall: (startingRequest: IRequestContext, next: ICommonCallback) => void;
    public readFile: any;
    public resolveFile: any;
    public options: CompilerOptions;
    public host: IShortHost;
    public docReg: IShortDocReg;
    private _index: number;
    private _current: IRequestContext;
    private _error: Error;
    private _finished: boolean;
    private _methods: Function[];
    constructor(methods: Function[], startingRequest: IRequestContext, done: ICommonCallback) {
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
    bail(err: Error, result: any) {
        this.next(err, result);
        this._finished = true;
    }
    next(err: Error, result?: IRequestContext) {
        if (this._finished) {
            return;
        }
        if (err) {
            this._finished = true;
            this._error = err;
            this._current = null;
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
        waterfall._apply =
        waterfall._current =
        waterfall._done =
        waterfall._index =
        waterfall.async = null
    );
}
