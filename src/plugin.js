const tsImpl = require('typescript');
const { resolve, dirname } = require('path');
const { readFile } = require('./utils/fsPromisified');
const intermediateHost = require('./TsHooker/Host');
const Watchpack = require('C:/Users/admin/Documents/Projects/Proteus/Proteus-GUI/node_modules/watchpack/lib/watchpack');

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
        const myFs = this.resolvers.normal.fileSystem;
        const watcher = new Watchpack(this.watchFileSystem.watcherOptions);
        readFile(configFilePath).then(function (content) {
            let existingOptions = tsImpl.convertCompilerOptionsFromJson({}, context, 'atl.query');
            let jsonConfigFile = tsImpl.parseConfigFileTextToJson(configFilePath, content.toString());
            let compilerConfig = tsImpl.parseJsonConfigFileContent(
                jsonConfigFile.config,
                tsImpl.sys,
                dirname(configFilePath),
                existingOptions,
                configFilePath
            );
            intermediateHost(compilerConfig, myFs, watcher);
            cb();

        });
    }

};

