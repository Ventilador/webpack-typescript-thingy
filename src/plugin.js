const tsImpl = require('typescript');
const { resolve, dirname } = require('path');
const { readFile, find } = require('./utils/fsPromisified');
const fileSystem = require('./TsHooker/fs')(function (code) {
    console.log('exiting');
    process.exit(code);
});
// const hostMaker = require('./TsHooker/HostService');
const isDefinitionFile = /\.d\.tsx?$/;
const instance = require('./TsHooker')({
    'target': 'es5',
    'module': 'commonjs',
    'noImplicitAny': false,
    'preserveConstEnums': true,
    'removeComments': false,
    'sourceMap': true,
    'experimentalDecorators': true,
    'noEmitOnError': true,
    'declaration': false,
    'typeRoots': [
      './customTypings'
    ],
    'forceConsistentCasingInFileNames': true
  });
module.exports = function makePlugin(options) {

    options = options || {};
    const context = options.context || process.cwd();
    const configFilePath = options.tsconfig || resolve(context, 'tsconfig.json');
    return {
        apply: function (compiler) {
            compiler.plugin('run', startTsServer);
            compiler.plugin('watch-run', startTsServer);
        }
    };
    function startTsServer(_, cb) {
        let files = 0;
        readFile(configFilePath).then(function (content) {
            const asd = tsImpl.getDefaultCompilerOptions();
            console.log(asd);
            let existingOptions = tsImpl.convertCompilerOptionsFromJson({}, context, 'atl.query');
            let jsonConfigFile = tsImpl.parseConfigFileTextToJson(configFilePath, content.toString());
            let compilerConfig = tsImpl.parseJsonConfigFileContent(
                jsonConfigFile.config,
                tsImpl.sys,
                dirname(configFilePath),
                existingOptions,
                configFilePath
            );
            if (!compilerConfig.fileNames) {
                compilerConfig.fileNames.forEach(fileName => {
                    if (isDefinitionFile.test(fileName)) {
                        files++;
                        readFile(fileName, 'utf8').then(makeReadFileCb(fileName));
                    } else {
                        fileSystem.placeholder(fileName);
                    }
                });
            } else {

                find(resolve(process.cwd(), 'node_modules', '@types'), '.d.ts')
                    .then(function (resolvedFiles) {
                        resolvedFiles
                            .reduce(pushTo, compilerConfig.fileNames)
                            .forEach(fileName => {
                                if (isDefinitionFile.test(fileName)) {
                                    files++;
                                    readFile(fileName, 'utf8').then(makeReadFileCb(fileName));
                                } else {
                                    fileSystem.placeholder(fileName);
                                }

                            });
                    })
                    .catch(function (err) {
                        console.log(err);
                    });
            }

            function makeReadFileCb(fileName) {
                return function loadDefinitionFile(content) {
                    files--;
                    fileSystem.writeFile(fileName, content);
                    if (!files) {
                        instance.loadRootFiles(compilerConfig.fileNames);
                        cb();
                    }
                };
            }
        });


    }
    function pushTo(prev, item) {
        prev.push(item);
        return prev;
    }
};

