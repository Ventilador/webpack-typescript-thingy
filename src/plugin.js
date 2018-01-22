const tsImpl = require('typescript');
const { resolve, dirname } = require('path');
const { readFile } = require('./utils/fsPromisified');
const fs = require('./tsHooker/fileSystem');
const makeProgram = require('./TsHooker/Program');
const isDefinitionFile = /\.d\.tsx?$/;

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
        makeProgram(configFilePath).then(function () {
            cb();
        });
        // let files = 0;
        // readFile(configFilePath).then(function (content) {
        //     let existingOptions = tsImpl.convertCompilerOptionsFromJson({}, context, 'atl.query');
        //     let jsonConfigFile = tsImpl.parseConfigFileTextToJson(configFilePath, content.toString());
        //     let compilerConfig = tsImpl.parseJsonConfigFileContent(
        //         jsonConfigFile.config,
        //         tsImpl.sys,
        //         dirname(configFilePath),
        //         existingOptions,
        //         configFilePath
        //     );
        //     compilerConfig.fileNames.forEach(fileName => {
        //         if (isDefinitionFile.test(fileName)) {
        //             files++;
        //             readFile(fileName, 'utf8').then(makeReadFileCb(fileName));
        //         } else {
        //             fs.create(fileName);
        //         }
        //     });

        //     function makeReadFileCb(fileName) {
        //         return function loadDefinitionFile(content) {
        //             files--;
        //             fs.writeFile(fileName, content);
        //             if (!files) {
        //                 makeProgram(compilerConfig);
        //                 cb();
        //             }
        //         };
        //     }
        // });


    }
    // function pushTo(prev, item) {
    //     prev.push(item);
    //     return prev;
    // }
};

