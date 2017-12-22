const { onNextTick } = require('./../utils');

module.exports = function makeWaterfall() {
  const cbs = [];
  const semiPromise = {
    then: then,
    done: done
  };
  return semiPromise;
  function done() {
    return function () {
      let length = arguments.length;
      const arr = new Array(length);
      while (length--) {
        arr[length] = arguments[length];
      }
      apply(cbs, arr);
    };
  }
  function then(ev, cb, wrapper) {
    cbs.push({
      ev: ev,
      cb: wrapper ? wrap(cb, wrapper) : cb
    });
    return semiPromise;
  }

};

function wrap(cb, wrapper) {
  return function () {
    let length = arguments.length;
    const arr = new Array(length + 1);
    arr[length] = cb;
    while (length--) {
      arr[length] = arguments[length];
    }
    wrapper.apply(this, arr);
  };
}

function async() {
  this.__async = true;
  const context = this;
  return function (err, result) {
    context.callback(err, err ? null : result);
  };
}

function applyCurrent(err, result) {
  this.version++;
  this.__async = false;
  this.error = err;
  this.result = result;
  onNextTick(next, this);
}

function _then() {
  this.__async = true;
  const context = this;
  return function (result) {
    context.callback(null, result);
  };
}

function _catch() {
  this.__async = true;
  const context = this;
  return function (err) {
    context.callback(err, null);
  };
}

function apply(cbs, args) {
  if (!Array.isArray(cbs) || !Array.isArray(args)) {
    throw 'Invalid arguments';
  }
  onNextTick(next, {
    async: async,
    then: _then,
    catch: _catch,
    __async: false,
    result: args,
    error: null,
    cbs: cbs,
    currentIndex: -1,
    destroyed: false,
    onDone: function (context) {
      if (!context.__onDone) {
        throw 'No callback provided';
      }
      onNextTick(context.__onDone, null, [context.error, context.result]);
      context.async =
        context.then =
        context.catch =
        context.__async =
        context.result =
        context.error =
        context.cbs =
        context.currentIndex =
        context.onDone =
        context.max =
        context.callback =
        context.version = null;
      context.destroyed = true;
    },
    max: cbs.length,
    callback: applyCurrent,
    version: 0
  });
}

function next() {
  if (this.destroyed) {
    return;
  }
  if ((++this.currentIndex) === this.max) {
    onNextTick(this.onDone, this);
    return;
  }
  if (this.error) {
    onNextTick(this.onDone, this);
    return;
  }
  const version = this.version;
  const currentCb = this.cbs[this.currentIndex].cb;
  let res;
  try {
    res = currentCb.call(this, this.result);
  } catch (err) {
    this.error = err;
    this.result = null;
    onNextTick(this.onDone, this);
    return;
  }
  if (this.__async) {
    return;
  }
  if (res) {
    if (version !== this.version) {
      throw 'Cannot return and call the callback';
    }
    if (res.then) {
      res.then(this.then()).catch(this.catch());
    } else {
      this.error = null;
      this.result = res;
      onNextTick(next, this);
    }
  } else if (version === this.version) {
    throw 'You HAVE to do something';
  }

}
