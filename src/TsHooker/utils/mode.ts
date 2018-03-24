const PRIVATE = module.exports as { MODE: any };
Object.defineProperty(PRIVATE, 'MODE', {
    get: function () { },
    set: function (val: any) {
        Object.defineProperty(PRIVATE, 'MODE', {
            value: val,
            writable: false,
            enumerable: true
        });
    }
}) as { MODE: any };
export = PRIVATE;
