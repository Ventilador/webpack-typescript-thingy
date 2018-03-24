export function singleton<T extends Function>(constructor: T, ...args: any[]): T {
    let instance = null;
    return function () {
        if (instance) {
            return instance;
        }
        instance = constructor.apply(this, arguments);
        constructor = null;
        return instance;
    } as any;
}
