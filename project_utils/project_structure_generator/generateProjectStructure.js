const fs = require('fs').promises;
const path = require('path');

const CURRENT_FOLDER = 'source';
const IGNORED_FOLDERS = new Set(['.pytest_cache', 'assets']);

async function buildDirectoryStructure(rootDirectory) {
    const structure = [];
    const items = await fs.readdir(rootDirectory, { withFileTypes: true });

    for (const item of items.sort((a, b) => a.name.localeCompare(b.name))) {
        if (IGNORED_FOLDERS.has(item.name) || item.name.startsWith('.')) {
            continue;
        }
        const itemPath = path.join(rootDirectory, item.name);
        if (item.isDirectory()) {
            // Recursively build structure for directories
            const subStructure = await buildDirectoryStructure(itemPath);
            const obj = {};
            obj[item.name] = subStructure;
            structure.push(obj);
        } else {
            // Add files directly into the structure list
            structure.push(item.name);
        }
    }

    return structure;
}

async function main() {
    const rootFolderDir = path.join(__dirname, '..', '..');
    const sourceDir = path.join(rootFolderDir, CURRENT_FOLDER);
    const directoryStructure = await buildDirectoryStructure(sourceDir);
    await fs.writeFile('directory_structure.json', JSON.stringify(directoryStructure, null, 4));
    console.log('Directory structure has been output to directory_structure.json');
}

main().catch(console.error);
