const waterfall = require('./waterfall');
const fs = require('./../fileSystem');
const { NodeProperties, noop, makeQueue, singleton } = require('./../utils');
const makeResolver = require('./Resolver');
const loadConfig = require('./config');
const { createTypeChecker, createHost } = require('./emitResolver');
module.exports = singleton.promisify(makeProgram);
function makeProgram(path) {
    return loadConfig(path).then(function (config) {
        let processing = 0;
        let processed = 0;
        const requiredFileQueue = makeQueue();
        const instance = {
            update: update,
            updateResolver: updateResolver,
            getEmit: getEmit,
            forEachRequiredFile: requiredFileQueue.all,
            updateReader: updateReader
        };
        const pending = Object.create(null);
        const program = waterfall({});
        let resolver_ = null;
        let reader_ = null;
        const host = createHost(config);
        const checker = createTypeChecker(host, true);
        program
            .define('error', function (err, cb) {
                cb(err);
            })
            .define('snapshot', require('./Plugins/1_createSnapshot'))
            .define('source', require('./Plugins/2_createSourceFile'))
            .define('collect', require('./Plugins/3_collectExternalModuleReferences'))
            .define('resolve', require('./Plugins/4_resolveDirectives')(resolver))
            .define('ensure', require('./Plugins/5_ensureFiles')(fileRequired))
            .define('emit', require('./Plugins/6_emit')(config.compilerOptions));

        config.definitions.forEach(function (item) {
            update(item.path, item.content, noop);
            fs.once(item.path, NodeProperties.SOURCE, host.addResolvedTypeReferenceDirectives);
        });
        const interval = setInterval(function () {
            console.log('processed:', processed);
            console.log('processing:', processing);
            console.log('---------------');
            if (processed === processing) {
                clearInterval(interval);
            }
        }, 100);
        return instance;
        function fileRequired(path) {
            if (pending[path]) {
                return;
            }
            pending[path] = true;
            if (reader_) {
                reader_(path);
            } else {
                requiredFileQueue.put(path);
            }
        }
        function updateReader(reader) {
            reader_ = reader;
        }
        function getEmit(path, cb) {
            fs.once(path, NodeProperties.EMIT, cb);
        }
        function updateResolver(newResolver) {
            resolver_ = newResolver;
        }
        function resolver() {
            return (resolver_ || (resolver_ = makeResolver())).apply(null, arguments);
        }
        function update(path, content, cb) {
            if (pending[path]) {
                delete pending[path];
            }
            const node = fs.multiple(path);
            if (node.readFile() === content) {
                //  program.apply(node, 'emit',  cb);
                return;
            }
            processing++;
            return program.apply(
                node
                    .update()
                    .writeFile(content),
                'snapshot',
                function () {
                    processed++;
                    cb.apply(this, arguments);
                }).node;
        }

    });
}
