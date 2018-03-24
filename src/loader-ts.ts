import { init } from './TsHooker/Client';
const intermediateHost = init();
module.exports = function (source: string) {
  this.cacheable(true);
  const cb = this.async();
  const addDependency = this.addDependency;
  const context = this.context;
  const resolve = this.resolve;
  intermediateHost.emitFile(this.resourcePath, function (err: Error, result: IResponseContext) {
    if (err) {
      cb(err);
    } else {
      Promise.all(result.dependencies.map(toPromise))
        .then(function () {
          cb(null, result.output, result.sourceMap);
        });
      // result.dependencies.forEach(addDependency);
      // cb(null, result.output, result.sourceMap);
    }
  });

  function toPromise(dep: string) {
    return new Promise(function (res: Function) {
      resolve(context, dep, function (err: string, path: string) {
        if (err) {
          res();
          return;
        }
        if (path.endsWith('.ts')) {
          addDependency(path);
        }
        res();
      });
    });
  }
};


