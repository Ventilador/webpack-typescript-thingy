const { normalize, sep } = require('path');
const { makeQueue, onNextTick } = require('./../utils');
const driverSep = ':';
let emittingCreate = false;
const emitCreateQueue = [];
module.exports = function makeMemoryRoot() {
  const root = new Node({ name: 'root' }, null);
  return Object.assign(root, {
    getProperty: function (path, property) {
      const node = getNode(path, '');
      if (node) {
        return node[property];
      }
    },
    setProperty: function (path_, property, val) {
      const node = getNode(path_, '');
      if (node) {
        node[property] = val;
      }
    },
    exists: function (path) {
      return !!getNode(path, '');
    },
    makeDir: function (path) {
      return getNode(path, 'dir');
    },
    makeFile: function (path) {
      return getNode(path, 'file');
    },
    unlink: function (path) {
      let node = getNode(path, '');
      if (node) {
        return node.unlink();
      }
    },
    placeholder: function (path) {
      getNode(path, 'unknown');
    },
    wait: function (path) {
      const node = getNode(path, 'unknown');
      if (node.isFile) {
        return false;
      }
      if (node.promise) {
        return node.promise;
      }
      const array = [];
      const done = node.on('created', function (cur) {
        cur.promise = null;
        array.forEach(callFn);
        done();
        return true;
      });
      emitCreateQueue.push(node);
      return (node.promise = {
        then: function (cb, args) {
          array.push({
            cb: cb,
            args: args || []
          });
        }
      });
    }
  });

  function callFn(item) {
    item.cb.apply(null, item.args);
  }

  function getNode(path_, create) {
    let p = normalize(path_);
    let node = root, collected = [], name;
    for (let i = 0, cur = p[i], l = p.length; i < l; cur = p[++i]) {
      if (cur === sep) {
        if (node.isFile) {
          throw 'Invalid path "' + p + '"';
        }
        name = collected.join('');
        let temp = node.children[name];
        if (temp) {
          node = temp;
        } else {
          if (create) {
            node = node.createChild({
              isFile: false,
              name: name,
              content: null
            });
          } else {
            return null;
          }
        }
        collected.length = 0;
      } else if (cur !== driverSep) {
        collected.push(cur);
      }
    }
    let temp = node.children[name = collected.join('')];
    if (temp) {
      node = temp;
      if (create && create !== 'unknown') {
        node.reset();
      }
    } else {
      if (create) {
        node = node.createChild({
          isFile: create === 'file',
          name: name,
          content: null
        });
      } else {
        return null;
      }
    }
    return node;
  }
};

emmiter.prototype = {
  on: function (ev, cb) {
    let map = this.listeners;
    if (!map) {
      map = this.listeners = Object.create(null);
    }
    let array = map[ev];
    if (!array) {
      array = map[ev] = [];
    }
    array.push(cb);
    return function () {
      const index = array.indexOf(cb);
      if (index !== -1) {
        array.splice(index, 1);
      }
    };
  },
  once: function (ev, cb) {
    const clean = this.on(ev, function () {
      clean();
      cb.apply(this, arguments);
    });
    return clean;
  },
  emit: function (ev) {
    let cur = this;
    do {
      let map = this.listeners;
      if (map && map[ev] && map[ev].length) {
        let array = map[ev];
        let length = array.length;
        while (length--) {
          if (array[length](this, cur)) {
            return;
          }
        }
      }
    } while ((cur = cur.parent));
  }
};


function Node(data, parent) {
  emmiter.call(this, parent || null);
  this.name = data.name;
  this.isFile = data.isFile;
  this.fileName = '';
  if (parent) {
    if (parent.fileName) {
      this.fileName = parent.fileName + sep + this.name;
    } else {
      this.fileName = this.name + driverSep;
    }
  }
  this.content = data.content;
  this.depth = parent ? parent.depth + 1 : -1;
  this.isEmpty = this.isFile ? !this.content : true;
  this.version = 0;
  this.children = this.isFile ? null : Object.create(null);
  let queued = false, that = this;
  this.emitAsync = function () {
    if (queued) {
      return;
    }
    queued = true;
    onNextTick(doEmit);
  };
  function doEmit() {
    queued = false;
    that.emit();
  }
}

Node.prototype = Object.create(emmiter.prototype);

Node.prototype.createChild = function (data) {
  if (this.isFile) {
    throw 'Cannot create dir into file';
  }
  const child = this.children[data.name] = new Node(data, this);
  if (this.first) {
    child.next = this.first;
    this.first = child;
  } else {
    this.first = this.last = child;
  }


  return child;
};

Node.prototype.getChildren = function () {
  const arr = [];
  if (this.first) {
    let cur = this.first;
    do {
      arr.push(cur);
    } while ((cur = cur.next));
  }
  return arr;
};

Node.prototype.getFullName = function () {
  return this.fullName;
};

Node.prototype.reset = function () {
  if (this.isFile) {
    this.content = null;
  } else {
    this.children = Object.create(null);
  }
  this.version++;
  this.mtime = process.hrtime();
  this.emitAsync();
};

Node.prototype.setNodeContent = function (content) {
  if (!this.isFile) {
    if (!emittingCreate) {
      emittingCreate = true;
      onNextTick(emitCreate);
    }
    this.isFile = true;
  }
  this.content = content;
  this.version++;
  this.mtime = process.hrtime();
  this.emitAsync();
};

Node.prototype.getChild = function (name) {
  return this.children[name];
};

Node.prototype.size = function () {
  if (this.isFile) {
    return (this.content && this.content.length) || 0;
  } else {
    let size = 0;
    transverse(this, function (node) {
      if (node.isFile) {
        size += node.size();
      }
    });
    return size;
  }
};


function transverse(node, cb) {
  const queue = makeQueue.queueSync;
  queue.put(node);
  while (queue.size()) {
    const cur = queue.take();
    cb(cur);
    let child = cur.first;
    if (child) {
      do {
        queue.push(child);
      } while ((child = child.next));
    }
  }
}

Node.prototype.unlink = function () {
  if (!this.parent) {
    return;
  }
  const parent = this.parent;
  delete parent.children[this.name];
  const next = this.next;
  const prev = this.prev;
  if (next) {
    if (prev) {
      prev.next = next;
      next.prev = prev;
    } else {
      parent.first = next;
      next.prev = null;
    }
  } else {
    if (prev) {
      parent.last = prev;
      prev.next = null;
    } else {
      parent.last = parent.next = null;
      parent.isEmpty = true;

    }
  }
  cleanNode(this);
  return parent;
};

function cleanNode(node) {
  node.parent =
    node.mtime =
    node.name =
    node.isFile =
    node.version =
    node.content =
    node.listeners =
    node.children =
    node.first =
    node.last =
    node.prev =
    node.next = null;
}


function emmiter(parent) {
  this.parent = parent;
  this.first = this.last = this.next = this.prev = null;
  this.listeners = null;
}


function emitCreate() {
  emittingCreate = false;
  for (let ii = 0; ii < emitCreateQueue.length; ii++) {
    emitCreateQueue[ii].emit('created');
  }
  emitCreateQueue.length = 0;
}


