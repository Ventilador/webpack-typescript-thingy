const tsImpl = require('typescript');
const { resolve, dirname } = require('path');
const { readFile } = require('fs');
const fileSystem = require('./TsHooker/fs')(function (code) {
    console.log('exiting');
    process.exit(code);
});
const hostMaker = require('./TsHooker/HostService');
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
        let files = 0;
        readFile(configFilePath, function (err, content) {
            if (err) {
                throw 'tsconfig.json not found';
            }
            let existingOptions = tsImpl.convertCompilerOptionsFromJson({}, context, 'atl.query');
            let jsonConfigFile = tsImpl.parseConfigFileTextToJson(configFilePath, content.toString());
            let compilerConfig = tsImpl.parseJsonConfigFileContent(
                jsonConfigFile.config,
                tsImpl.sys,
                dirname(configFilePath),
                existingOptions,
                configFilePath
            );
            compilerConfig.fileNames.forEach(fileName => {
                if (isDefinitionFile.test(fileName)) {
                    files++;
                    readFile(fileName, 'utf8', makeReadFileCb(fileName));
                } else {
                    fileSystem.placeholder(fileName);
                }
                
            });
            hostMaker({
                context: process.cwd(),
                compilerOptions: compilerConfig,
                filesRegex: /\.tsx?$/,
                files: compilerConfig.fileNames
            }, fileSystem);
        });
        function makeReadFileCb(fileName) {
            return function loadDefinitionFile(err, content) {
                files--;
                if (err) {
                    console.error('file not found', fileName);
                }
                fileSystem.writeFile(fileName, content);
                if (!files) {
                    cb();
                }
            };
        }

    }
};

