import { readdir, stat } from 'fs';
import { resolve } from 'path';
import { makeWaterfall } from './../../../utils/waterfall';
import { TryGetFromMemory } from './TryGetFromMemory';
import { FindDirectory } from './FindDirectory';
import { LocateMainFile } from './LocateMainFile';
import { parallel } from '../../../utils/concurrent';

export function LoadNodeModulesCreator(this: IWaterfall<void>, applyParent: (startingRequest: IRequestContext, next?: ICallback<IRequestContext>) => void) {
    const host = this.host;
    const options = this.options;
    const resolverWaterfall = makeWaterfall<IResolveContext>([
        TryGetFromMemory,
        FindDirectory,
        LocateMainFile,
        _ => applyNext
    ]);
    return function LoadNodeModules(this: IWaterfall<IRequestContext>, request: IRequestContext) {
        const nodeModules: string[] = request.dependencies.filter(isNodeModule, true);
        request.dependencies = request.dependencies.filter(isNodeModule, false);
        if (nodeModules.length) {
            nodeModules.forEach(resolveNodeModule);
        }
        this.next(null, request);
    };

    function applyNext(this: IWaterfall<IResolveContext>, request: IResolveContext) {
        if (request.mainFile) {
            const async = this.asyncNext()
            callParentWith(request.mainFile);
        }
        this.next(null, request);
    }
    function callParentWith(item: string) {
        applyParent({
            fileName: item,
            data: '',
            output: '',
            sourceFile: null,
            sourceMap: '',
            dependencies: null
        }, function (err: Error, result: IRequestContext) {
            if (err) {
                return;
            }
            if (result.dependencies.length) {
                result.dependencies.map(toDts).filter(Boolean).forEach(callParentWith);
            }
        });
    }
    function toDts(item: string) {
        if (item.endsWith('.d.ts')) {
            return item;
        }
        if (item.endsWith('.js')) {
            return item.replace('.js', '.d.ts');
        }
        if (item.endsWith('.ts')) {
            return item.replace('.ts', '.d.ts');
        }
        return false;
    }
    function resolveNodeModule(module: string) {
        resolverWaterfall({
            module: module,
            mainFile: '',
            resolved: false,
            resolving: null,
            modulePath: '',
            $$reject: null,
            $$resolve: null,
            dependencies: []
        });
    }
}


function findAllReferences(this: IWaterfall<IRequestContext>, item: string): Promise<any> {
    this.host.writeModule(item, {});
    return new Promise((res: Function) => {

    });
}

function tryAsFile(this: IWaterfall<IRequestContext>, item: string) {

}

function tryAsFolder(this: IWaterfall<IRequestContext>, item: string) {

}

function isNodeModule(item: string) {
    return this === (item[0] !== '.' && item[0] !== '/');
}
