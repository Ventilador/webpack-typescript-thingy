export class Watcheable {
    private listeners: Function[];
    constructor() {
        this.listeners = [];
    }
    private onChange_(cb: Function): void {
        this.listeners.push(cb);
    }
    private change_(): void {
        this.listeners.forEach(call);
    }
}

interface IWatcheable {
    onChange_(cb: Function): void;
    change_(): void;
}

function call(cb: Function) {
    try {
        cb();
    } finally { }
}

export function Watch<T extends Watcheable>(proto: T, name: string, descriptor: PropertyDescriptor) {
    const original: Function = descriptor.value;
    descriptor.value = function () {
        return makeListener(this, name, original);
    }
}

function makeListener(instance: IWatcheable, methodName: string, original: Function) {
    let defered = true ? null : defer();
    let promise: Promise<any>;
    let resolve: Function;
    let reject: Function;
    instance.onChange_(function () {
        defered.resolve = defered.reject = noop;
        reject = resolve = promise = defered = null;
    });
    return instance[methodName] = function () {
        if (promise) {
            return promise;
        }
        const self = defered = defer();
        original.apply(this, arguments)
            .then(function (res) {
                self.resolve(res);
            });
        return promise;
    }
}

function defer() {
    const toReturn = {
        resolve: null,
        reject: null,
        promise: null
    } as {
            resolve: Function,
            reject: Function,
            promise: Promise<any>
        }
    toReturn.promise = new Promise(function (res, rej) {
        toReturn.resolve = res;
        toReturn.reject = rej;
    });
    return toReturn;
}

function noop() { }