import { cp, lstat, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCourse } from './build_course.mjs';
import { buildHistory } from './build_history.mjs';
import { buildOverviews } from './build_overviews.mjs';

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const source = path.join(root, 'site');
const output = path.resolve(root, 'dist');

// The only recursive replacement target is this repository's literal dist folder.
if (path.relative(root, output) !== 'dist' || path.dirname(output) !== root) {
  throw new Error('The build output must be this repository\'s dist folder.');
}
const currentOutput = await lstat(output).catch(error => {
  if (error.code !== 'ENOENT') throw error;
  return null;
});
if (currentOutput?.isSymbolicLink()) throw new Error('Refusing to replace a linked dist folder.');

async function inspect(directory) {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Linked source file: ${path.relative(root, filename)}`);
    if (entry.isDirectory()) count += await inspect(filename);
    else if (entry.isFile()) count++;
  }
  return count;
}

const count = await inspect(source);
if (!count) throw new Error('The site folder is empty.');
await rm(output, { recursive: true, force: true });
await cp(source, output, { recursive: true, force: false, errorOnExist: true });
const contentPages = await buildCourse(root, output) + await buildOverviews(root, output) + await buildHistory(root, output);
await writeFile(path.join(output, '.nojekyll'), '');
console.log(`Built ${count} site files and ${contentPages} content pages into dist/.`);
