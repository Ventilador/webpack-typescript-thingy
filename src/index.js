const { resolve } = require('path');
const makeProgram = require('./TsHooker/Program');
const configFilePath = resolve(process.cwd(), 'tsconfig.json');
const { readFile, writeFile } = require('fs');
const entry = 'C:/Users/admin/Documents/Projects/Proteus/Proteus-GUI/src/app/index.pml';
readFile(entry, function (err, source) {
    if (err) {
        console.log(err);
        process.exit(1);
    }
    makeProgram(configFilePath)
        .then(function (instance) {
            const result = require('C:/Users/admin/Documents/Projects/Proteus/Proteus-GUI/compilation/loaders/proteus-module-loader.js')(source);
            instance.updateReader(readFileContent);
            instance.update(entry, result, noop);



            function readFileContent(filePath) {
                readFile(filePath, function (err, content) {
                    if (err) {
                        console.log(err);
                        process.exit(1);
                    }
                    instance.update(filePath, content.toString(), noop);
                });
            }
        });
});




function noop(err, node) {
    if (err) {
        console.log(err);
    } else {
        writeFile(node.getPath() + '.js', node.readEmit(), logError);
    }
}
function logError(err) {
    if (err) {
        console.log(err);
    }
}