const shifting = +!module.parent;
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
        const fn = list[id];
        list[id] = null;
        last = new NodeItem(id, last);
        return fn;
    }

    function put(cb: Function): string {
        if (first) {
            const toReturn = first.val;
            first = first.next;
            if (!first) {
                last = null;
            }
            list[toReturn] = cb;
            return toReturn.toString();
        } else {
            return grow(), put(cb);
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
