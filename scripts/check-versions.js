const fs = require('fs');
const path = require('path');

const packagePath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

const treeSitterVersion = pkg.treeSitterIdlVersion;
const webTreeSitterVersion = pkg.dependencies && pkg.dependencies['web-tree-sitter'];

const errors = [];

if (!treeSitterVersion) {
  errors.push('Missing package.json field "treeSitterIdlVersion".');
}

if (!webTreeSitterVersion) {
  errors.push('Missing dependency "web-tree-sitter" in package.json.');
}

if (treeSitterVersion && !/^v?\d+\.\d+\.\d+$/.test(treeSitterVersion)) {
  errors.push(`treeSitterIdlVersion must be a semver tag like v3.17.0. Got: ${treeSitterVersion}`);
}

if (webTreeSitterVersion && webTreeSitterVersion !== '0.26.7') {
  errors.push(`web-tree-sitter must be pinned to 0.26.7. Got: ${webTreeSitterVersion}`);
}

if (errors.length) {
  console.error('Version alignment check failed:');
  for (const err of errors) {
    console.error(`- ${err}`);
  }
  process.exit(1);
}

console.log('Version alignment check passed.');
