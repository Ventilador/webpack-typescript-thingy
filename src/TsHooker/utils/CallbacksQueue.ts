const growSize = 10;

export function CallbackQueue() {
    let first: NodeItem, last: NodeItem;
    const list: Function[] = [];
    return {
        put: put,
        take: take
    };

    function take(id: string): Function
    function take(id: any): Function {
        id = parseInt(id, 10);
        if (id > -1 && id < list.length) {
            const fn = list[id];
            list[id] = null;
            append(id);
            return fn;
        }
        throw new Error('Out of bound');
    }

    function put(cb: Function, recursive?: boolean): string {
        if (first) {
            const toReturn = first.val;
            first = first.next;
            if (!first) {
                last = null;
            }
            list[toReturn] = cb;
            return toReturn.toString();
        } else {
            return grow(), put(cb, true);
        }
    }

    function append(id: number) {
        if (last) {
            last = new NodeItem(id, last);
        } else {
            first = last = new NodeItem(id, null);
        }
    }

    function grow() {
        for (let id = list.length, j = list.length + growSize; id < j; id++) {
            list.push(null);
            append(id);
        }
        return true;
    }
}

class NodeItem {
    next: NodeItem;
    val: number;
    constructor(val: number, prev: NodeItem) {
        if (prev) {
            prev.next = this;
        }
        this.val = val;
        this.next = null;
    }
}
