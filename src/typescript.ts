import * as ts from 'typescript';
import { resolve } from 'path';
(ts as any).initFrom = function (path: string) {
    let tsImp = ts;
    if (path) {
        tsImp = require(path);
    }
    Object.keys(tsImp).reduce(function (prev: any, cur: string) {
        prev[cur] = tsImp[cur];
        return prev;
    }, ts);
};
export = ts;


