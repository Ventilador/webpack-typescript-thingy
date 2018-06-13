interface IResolveContext extends INodeModule {
    modulePath: string;
    mainFile: string;
}


interface INodeModule {
    resolving: Promise<IResolveContext>;
    resolved: boolean;
    module: string;
    $$resolve: Function;
    $$reject: Function;
    dependencies: string[];
}