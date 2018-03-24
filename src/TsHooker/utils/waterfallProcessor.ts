interface QueueItem {
  next: QueueItem;
  val: Function;
}
/*
 * this change its so, even though waterfalls work async between themselves, this way multiples (different) waterfalls can perform their action at the same time,
 * basically synchronously between each other, but only one action per waterfall per event loop (setImmediate)
 * more so, for one single request made to mw, the logic stays the same, but doing 20, would mean that 20 actions are done synchronously
 * one for each request
 * furthermore, lets say we say we have 3 waterfalls, A, B & C, and then A1 is the first step in A, A2 the second one and so on
 * now each one starts after the first action is completed from the previous one, at some point we will have
 *
 * A5-B4-C3, those three actions will execute synchronously, then it will go async and execute
 * A6-B5-C4, those three actions will execute synchronously, then it will go async and execute
 * A7-B6-C5, and so on
 *
 *
 * also have in mind, those actions can be async, so this symmetry could be lost, but the logic behind will stay the same,
 * for example, B6 could be the one that reads the body of the stream, so next action would be
 *
 * A8-C6 (notice B7 is not executed, because its waiting for the body to be resolved before resolving itself)
 */

function call(cb: Function) {
  cb();
}

export class Queue {
  public flush: any;
  private _first: QueueItem;
  private _last: QueueItem;
  constructor() {
    this._first = this._last = null;
    this.flush = () => {
      this.forEach(call);
    };
  }
  forEach(cb: Function) {
    if (this._first) {
      let cur = this._first;
      // clearing the queue, before starting flushing,. so any sync operation will be pushed to the next setImmediate
      // hence being applied async
      this._first = this._last = null;
      do {
        cb(cur.val);
      } while (cur = cur.next);
    }
  }
  put(cb: Function) {
    if (this._last) {
      this._last = (this._last.next = {
        val: cb,
        next: null
      });
    } else {
      this._first = this._last = {
        next: null, val: cb
      };
    }
  }
  empty() {
    return !this._first;
  }
}

const myQueue = new Queue();
export function onNextTick(cb: Function) {
  if (myQueue.empty()) {
    setImmediate(myQueue.flush);
  }
  myQueue.put(cb);
}
