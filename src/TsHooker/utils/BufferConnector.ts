const VALUES = [
    ['fileName', 'n'],
    ['data', 'c'],
    ['sourceMap', 's'],
    ['output', 'o'],
    ['sourceFile', ''],
    ['id', 'i'],
    ['method', 'm'],
    ['dependencies', 'd']
];
const REVERSE_VALUES = VALUES.reduce(function (prev: any, cur: string[]) {
    prev[cur[1]] = cur[0];
    return prev;
}, Object.create(null));
/**
 * interface IMessage extends IRequestContext {
 *     id: string;
 * }
 * 
 * interface IRequestContext {
 *     fileName?: string;
 *     fileContent?: string;
 *     sourceFile?: SourceFile;
 *     sourceMap?: string;
 *     output?: string;
 * }
 */
export const Parser = {
    toBuffer: function (message: IMessage): Buffer {
        let prebuf = [];
        const properties = [];
        for (var i = 0; i < VALUES.length; i++) {
            const cur = VALUES[i];
            const name = cur[0], code = cur[1];
            if (name in message) {
                if (code) {
                    prebuf.push(message[name]);
                    properties.push([code, message[name].length]);
                } else {
                    throw 'Invalid property ' + name;
                }
            }
        }
        prebuf.unshift('|');
        for (var i = 0; i < properties.length; i++) {
            const cur = properties[i];
            prebuf.unshift(cur[1], cur[0]);
        }
        return Buffer.from(prebuf.join(''), 'utf8');
    },
    fromBuffer: function (buffer: Buffer, cb: Function): void {
        const str = buffer.toString('utf8');
        let length;
        const collected = [];
        let collecting = '';

        for (let i = 0; i < str.length; i++) {
            const curItem = str[i];
            if (isNumber(curItem)) {
                collecting += curItem;
            } else if (curItem === '|') {
                let carry = i + 1;
                length = collected.length;
                const response = Object.create(null) as IMessage;
                while (length--) {
                    const cur = collected[length];
                    const prop = cur[0], upTo = cur[1];
                    response[prop] = str.slice(carry, upTo + carry);
                    carry += upTo;
                    if (str.length < carry) {
                        carry = carry;
                    }
                }
                i = carry - 1;
                cb(response);
                collecting = '';
                collected.length = 0;
            } else {
                collected.push([REVERSE_VALUES[curItem], +collecting]);
                collecting = '';
            }
        }

    }
};
function isNumber(str: string) {
    return str === '1' ||
        str === '2' ||
        str === '3' ||
        str === '4' ||
        str === '5' ||
        str === '6' ||
        str === '7' ||
        str === '8' ||
        str === '9' ||
        str === '0'
        ;
}
