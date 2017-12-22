const ts = require('typescript');
const { onNextTick } = require('./../utils');
const DocumentRegistry = require('./DocumentRegistry');
const fs = require('./fs');
const HostService = require('./HostService');
const waterFall = require('./../utils/waterfall');
let instance = null;
var makeInstance = function (options) {
  const fileSystem = fs();
  const fileFilter = options.fileFilter || filterFile;
  const host = HostService({
    context: process.cwd(),
    compilerOptions: options,
    filesRegex: /\.tsx?$/
  }, fileSystem);
  const docRegistry = DocumentRegistry(fileSystem.useCaseSensitiveFileNames, fileSystem.getCurrentDirectory());
  const lService = ts.createLanguageService(host, docRegistry);
  const program = lService.getProgram();
  program.getRootFileNames().forEach(console.log);
  return {
    processFile: waterFall()
      .then('processFileArgs', processFileArgs)
      .then('updateContent', updateContent)
      .then('getDependencies', getDependencies)
      .then('requireContext', requireContext, joinFiles)
      .then('waitTillLoaded', waitTillLoaded)
      .then('emit', emit)
      .done()
  };

  function emit(request) {
    const result = lService.getEmitOutput(request.fileName);
    console.log(result.outputFiles.length ? '-------SUCCESS-------' : '-------FAILURE-------');
    this.callback(result);
  }

  function waitTillLoaded(request) {
    if (request.files.length) {
      fileSystem.ensure(request.files, options, this.async(), [null, request]);
    } else {
      fileSystem.ensure(null, options, this.async(), [null, request]);
    }
  }

  function requireContext(request) {
    try {
      if (request.files.length) {
        const arr = request.files;
        let length = arr.length;
        while (length--) {
          if (fileFilter(arr[length])) {
            this.resolve(arr[length], request.fileName, this.asyncMultiple());
          }
        }
      } else {
        this.callback(null, request);
      }
    } catch (err) {
      console.log(err);
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
      this.callback(null, request);
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
        arr[counter] = result;
        if (!counter) {
          request.files = arr;
          async(null, request);
        }
      } {
        onNextTick(done, null, [err, result]);
        return;
      }
    }
  }

  function getDependencies(request) {
    const async = this.async();
    docRegistry.getDependencies(request.fileName, options, function (deps) {
      request.files = deps || [];
      async(null, request);
    });
  }

  function updateContent(request) {
    const path = request.fileName;
    host.writeFile(path, request.fileContent);
    docRegistry.updateDocument(request.fileName, options, host.getScriptSnapshot(path), host.getScriptVersion(path), ts.ScriptKind.TS);
    this.callback(null, request);
  }


  function processFileArgs(result) {
    const [fileName, fileContent, requestFile, onDone] = result;

    this.__onDone = onDone;
    this.resolve = requestFile;
    this.callback(null, {
      fileContent: fileContent,
      fileName: fileName
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
