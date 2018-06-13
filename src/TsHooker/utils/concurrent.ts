export function parallel(arr: any[], cb: Function): Promise<void> {
    return new Promise(function (res, rej) {
        let amount = arr.length;
        arr.forEach(callAll);
        function nextTick(err?) {
            if (err) {
                rej(err);
            }
            amount--;
            if (!amount) {
                res();
            }
        }
        function callAll(this: Function, item: Function, index: number, arr: any[]) {
            if (cb.length === 1) {
                cb(item);
                nextTick();
            } else if (cb.length === 2) {
                cb(item, nextTick);
            } else if (cb.length === 3) {
                cb(item, index, nextTick);
            } else {
                cb(item, index, arr, nextTick);
            }
        }
    });



}