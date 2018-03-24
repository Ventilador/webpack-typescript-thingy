let i = 0;
export const MESSAGE_TYPE = [
    'INIT',
    'READ_FILE',
    'EMIT_FILE',
    'ERROR',
    'CHANGED',
    'RESOLVE_FILE',
    'DIAGNOSTICS'
].reduce(function (prev: any, cur: string, index: number) {
    prev[cur] = index + '';
    return prev;
}, Object.create(null)) as IMessageType;

