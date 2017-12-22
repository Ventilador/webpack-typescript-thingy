const ts = require('typescript');
const { onNextTick } = require('./../utils');
const DocumentRegistry = require('./DocumentRegistry');
const fs = require('./fs');
const getHost = require('./HostService');
const waterFall = require('./../utils/waterfall');
let instance = null;
const times = {
  processFileArgs: {},
  updateContent: {},
  getDependencies: {},
  requireContext: {},
  waitTillLoaded: {},
  joinFiles: {}

};
var makeInstance = function (options) {
  const fileSystem = fs();
  const fileFilter = options.fileFilter || filterFile;
  const host = getHost();
  const docRegistry = DocumentRegistry(fileSystem.useCaseSensitiveFileNames, fileSystem.getCurrentDirectory());
  const lService = ts.createLanguageService(host, docRegistry);
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
    request.current++;
    if (request.current !== 6) {
      console.log('what');
    }
    let missing = request.files.filter(function (path) {
      return !host.fileExists(path);
    });
    if (missing.length) {
      missing = missing;
    }
    const result = lService.getEmitOutput(request.fileName);
    if (result.outputFiles[0].text) {
      console.log('-------SUCCESS-------');
    } else {
      console.log('-------FAILURE-------');
      const asd = lService.getSemanticDiagnostics(request.fileName);
      if (result.outputFiles[0].name === 'C:/Users/admin/Documents/Projects/Proteus/Proteus-GUI/src/UAT/route.js') {
        console.log(asd);
      }
      // const res = lService.getEmitOutput(request.fileName);
      // console.log(res);
      // missing = request.files.filter(function (path) {
      //   return !host.fileExists(path);
      // });

    }

    this.callback(result);
  }

  function waitTillLoaded(request) {
    request.current++;
    if (request.current !== 5) {
      console.log('what');
    }
    if (times.waitTillLoaded[request.fileName]) {
      times.waitTillLoaded[request.fileName]++;
    } else {
      times.waitTillLoaded[request.fileName] = 1;
    }
    if (request.files.length) {
      fileSystem.ensure(request.files, this.async(), [null, request]);
    } else {
      fileSystem.ensure(null, this.async(), [null, request]);
    }
  }

  function requireContext(request) {
    request.current++;
    if (request.current !== 3) {
      console.log('what');
    }
    if (times.requireContext[request.fileName]) {
      times.requireContext[request.fileName]++;
    } else {
      times.requireContext[request.fileName] = 1;
    }
    try {
      if (request.files.length) {
        const arr = request.files;
        let length = arr.length;
        while (length--) {
          if (fileFilter(arr[length])) {
            this.resolve(arr[length], request.fileName, this.asyncMultiple());
          }
        }
      }
    } catch (err) {
      console.log(err);
    }
  }

  function joinFiles(request, cb) {
    if (times.joinFiles[request.fileName]) {
      times.joinFiles[request.fileName]++;
    } else {
      times.joinFiles[request.fileName] = 1;
    }
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
      if (request.current !== 4) {
        console.log('what');
      }
      this.callback(null, request);
    } else {
      request.current++;
      if (request.current !== 4) {
        console.log('what');
      }
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
          if (request.current !== 4) {
            console.log('what');
          }
          async(null, request);
        }
      } else {
        onNextTick(done, null, [err, result]);
      }
    }
  }

  function getDependencies(request) {
    request.current++;
    if (request.current !== 2) {
      console.log('what');
    }
    if (times.getDependencies[request.fileName]) {
      times.getDependencies[request.fileName]++;
    } else {
      times.getDependencies[request.fileName] = 1;
    }
    const async = this.async();
    docRegistry.getDependencies(request.fileName, options, function (deps) {
      request.files = deps || [];
      async(null, request);
    });
  }

  function updateContent(request) {
    request.current++;
    if (request.current !== 1) {
      console.log('what');
    }
    const path = request.fileName;
    if (times.updateContent[request.fileName]) {
      times.updateContent[request.fileName]++;
    } else {
      times.updateContent[request.fileName] = 1;
    }
    if (path === 'C:\\Users\\admin\\Documents\\Projects\\Proteus\\Proteus-GUI\\src\\app\\help\\help.component.ts') {
      request = request;
    }
    host.writeFile(path, request.fileContent);

    docRegistry.updateDocument(request.fileName, options, host.getScriptSnapshot(path), host.getScriptVersion(path), ts.ScriptKind.TS);
    this.callback(null, request);
  }


  function processFileArgs(result) {

    const [fileName, fileContent, requestFile, onDone] = result;
    if (times.processFileArgs[fileName]) {
      times.processFileArgs[fileName]++;
    } else {
      times.processFileArgs[fileName] = 1;
    }
    if (fileName === 'C:\\Users\\admin\\Documents\\Projects\\Proteus\\Proteus-GUI\\src\\app\\main\\activities\\window\\categories\\stressTesting\\index.ts') {
      console.log('found');
    }
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
