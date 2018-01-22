const keys = ['CONTENT', 'SOURCE', 'DEPENDENCIES', 'DIAGNOSTICS', 'TYPE', 'SNAPSHOT', 'EMIT'];
module.exports = {
    NodeProperties: makeEnum(keys),
    NodePropertiesKeys: keys
};

function makeEnum(arr) {
    const toReturn = Object.create(null);
    for (let ii = 0, cur = arr[0]; ii < arr.length; cur = arr[++ii]) {
        toReturn[cur] = cur;
    }
    return toReturn;
}

