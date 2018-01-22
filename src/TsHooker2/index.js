// const ts = require('typescript');
const { onNextTick } = require('./../utils');
// const DocumentRegistry = require('./DocumentRegistry');
const fs = require('./fs');
const waterFall = require('./../utils/waterfall');
const makeProgram = require('./createAsymmetricProgram');
let instance = null;
// const times = {
//   processFileArgs: {},
//   updateContent: {},
//   getDependencies: {},
//   requireContext: {},
//   waitTillLoaded: {},
//   joinFiles: {}

// };
var makeInstance = function (options) {
  const fileSystem = fs();
  const fileFilter = options.fileFilter || filterFile;
  const lService = makeProgram(options);
  return {
    processFile: waterFall()
      .then('processFileArgs', processFileArgs)
      .then('updateContent', updateContent)
      .then('getDependencies', getDependencies)
      .then('requireContext', requireContext, joinFiles)
      .then('waitTillLoaded', waitTillLoaded)
      .then('emit', emit)
      .done(),
    loadRootFiles: lService.loadRootFiles
  };

  function emit(request) {
    request.current++;
    let result = lService.getEmitOutput(request.fileName);
    if (!result.outputFiles[0].text) {
      result = lService.getEmitOutput(request.fileName);
      console.log('-------FAILURE-------');
      const asd = lService.getEmitOutput(request.fileName);
      if (result.outputFiles[0].name === 'C:/Users/admin/Documents/Projects/Proteus/Proteus-GUI/src/UAT/route.js') {
        console.log(asd);
      }
    }
    this.callback(null, result.outputFiles[0].text);
  }


  function waitTillLoaded(request) {
    request.current++;
    if (request.files.length) {
      fileSystem.ensure(request.files, this.async(), [null, request]);
    } else {
      fileSystem.ensure(null, this.async(), [null, request]);
    }
  }

  function requireContext(request) {
    request.current++;
    if (request.files.length) {
      const arr = request.files;
      let length = arr.length;
      while (length--) {
        if (fileFilter(arr[length])) {
          this.resolve(arr[length], request.fileName, this.asyncMultiple());
        }
      }
    }
  }

  function joinFiles(request, cb) {
    let counter = 0;
    this.asyncMultiple = asyncMultiple;
    let after = false;
    const oldVersion = this.version;
    cb.call(this, request);
    after = true;
    let async, arr;
    if (counter) {
      async = this.async();
      arr = new Array(counter);
    } else if (oldVersion === this.version) {
      request.current++;
      this.callback(null, request);
    } else {
      request.current++;
    }
    function asyncMultiple() {
      if (after) {
        throw 'async call';
      }
      counter++;
      return done;
    }

    function done(err, result) {
      if (after) {
        counter--;
        if (counter < 0) {
          counter = counter;
        }
        arr[counter] = result;
        if (!counter) {
          request.files = arr;
          request.current++;
          async(null, request);
        }
      } else {
        onNextTick(done, null, [err, result]);
      }
    }
  }

  function getDependencies(request) {
    request.current++;
    const async = this.async();
    lService.getDependencies(request.fileName, options, function (deps, sourceFile) {
      request.files = deps || [];
      fileSystem.writeSourceFile(request.fileName, sourceFile);
      async(null, request);
    });
  }

  function updateContent(request) {
    request.current++;
    fileSystem.writeFile(request.fileName, request.fileContent);
    this.callback(null, request);
  }


  function processFileArgs(result) {
    const [fileName, fileContent, requestFile, onDone] = result;
    this.__onDone = onDone;
    this.resolve = requestFile;
    this.callback(null, {
      fileContent: fileContent,
      fileName: fileName,
      current: 0
    });
  }
};

function filterFile(path) {
  return path[0] === '.' || path[0] === '/';
}


module.exports = function (options) {
  if (instance) {
    return instance;
  }
  console.log(options);
  instance = makeInstance(options);
  makeInstance = null;
  return instance;
};
