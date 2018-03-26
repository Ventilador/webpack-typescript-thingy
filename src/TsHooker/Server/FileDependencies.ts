export function fileDeps() {
    const allFiles = {};
    const missingFiles = {};
    const processedFiles = {};
    const fileDeps = {
        addFileDep,
        processFile,
        getMissingFiles: function () {
            const all = Object.keys(missingFiles).map(getFrom, missingFiles);
            const filtered = all.filter(fileDeps.isMissing);
            return filtered;
        },
        isMissing: function (fileName: string) {
            const low = fileName && fileName.toLowerCase();
            return low && !processedFiles[low];
        }
    };
    return fileDeps;
    function addFileDep(fileName: string) {
        const low = fileName.toLowerCase();
        addFile(low, fileName);
        if (processedFiles[low]) {
            return fileName;
        }
        return missingFiles[low] = fileName;
    }
    function addFile(low: string, fileName: string) {
        if (allFiles[low]) {
            return;
        }
        allFiles[low] = fileName;
    }
    function processFile(fileName: string) {
        const low = fileName.toLowerCase();
        addFile(low, fileName);
        if (processedFiles[low]) {
            return fileName;
        }
        return processedFiles[low] = fileName;
    }
    function getFrom(item: string) {
        return this[item];
    }
}
