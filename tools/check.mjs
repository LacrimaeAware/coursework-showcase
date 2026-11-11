import { createHash } from 'node:crypto';
import { readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOverviews } from './build_overviews.mjs';

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const directory = path.resolve(root, process.argv[2] || 'dist');
const failures = [];
const notes = { pages: 0, links: 0, sourceFiles: 0, vendorFiles: 0, courseChapters: 0, pythonSources: 0, historyRecords: 0, courseOverviews: 0, overviewTopics: 0 };
const catalog = JSON.parse(await readFile(path.join(root, 'content/catalog.json'), 'utf8'));
const overviews = await loadOverviews(root);

async function filesIn(folder) {
  const files = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const filename = path.join(folder, entry.name);
    if (entry.isSymbolicLink()) failures.push(`Linked file in built site: ${path.relative(directory, filename)}`);
    else if (entry.isDirectory()) files.push(...await filesIn(filename));
    else if (entry.isFile()) files.push(filename);
  }
  return files;
}

const files = await filesIn(directory).catch(error => {
  if (error.code === 'ENOENT') throw new Error('Build the site first with npm run build.');
  throw error;
});
const fileSet = new Set(files);
const htmlFiles = files.filter(filename => filename.endsWith('.html'));
const texts = new Map();
const anchors = new Map();

function decodeEntities(value) {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([\da-f]+);/gi, (_, number) => String.fromCodePoint(parseInt(number, 16)));
}

for (const filename of htmlFiles) {
  const text = await readFile(filename, 'utf8');
  texts.set(filename, text);
  const names = [...text.matchAll(/\bid\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map(match => decodeEntities(match[1] ?? match[2]));
  for (const anchor of text.matchAll(/<a\b[^>]*\bname\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) names.push(decodeEntities(anchor[1] ?? anchor[2]));
  anchors.set(filename, new Set(names));
  const ids = [...text.matchAll(/\bid\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map(match => match[1] ?? match[2]);
  if (new Set(ids).size !== ids.length) failures.push(`Duplicate HTML IDs: ${path.relative(directory, filename)}`);
  if (!/<title>[^<]+<\/title>/i.test(text)) failures.push(`Missing page title: ${path.relative(directory, filename)}`);
  if (!/<html\b[^>]*\blang\s*=/.test(text)) failures.push(`Missing document language: ${path.relative(directory, filename)}`);
}

async function checkReference(from, raw, kind = 'link') {
  const href = decodeEntities(raw.trim());
  if (!href || /^(?:data:|mailto:|tel:|blob:)/i.test(href)) return;
  const label = `${path.relative(directory, from)} -> ${href}`;
  if (/^(?:https?:)?\/\//i.test(href)) {
    if (kind === 'script') failures.push(`External runtime script: ${label}`);
    return;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(href)) {
    failures.push(`Unsupported URL scheme: ${label}`);
    return;
  }
  if (href.startsWith('/')) failures.push(`Root-absolute local URL breaks repository-path hosting: ${label}`);
  let url;
  try {
    const relative = path.relative(directory, from).split(path.sep).join('/');
    url = new URL(href, `https://coursework.invalid/${relative}`);
  } catch {
    failures.push(`Invalid URL: ${label}`);
    return;
  }
  let decoded;
  try { decoded = decodeURIComponent(url.pathname); }
  catch { failures.push(`Invalid URL escape: ${label}`); return; }
  let target = path.resolve(directory, '.' + decoded);
  if (path.relative(directory, target).startsWith('..' + path.sep)) {
    failures.push(`URL leaves the built site: ${label}`);
    return;
  }
  if (!fileSet.has(target)) {
    const index = path.join(target, 'index.html');
    if (fileSet.has(index)) target = index;
    else { failures.push(`Missing local target: ${label}`); return; }
  }
  notes.links++;
  if (url.hash && target.endsWith('.html')) {
    let fragment;
    try { fragment = decodeURIComponent(url.hash.slice(1)); }
    catch { failures.push(`Invalid anchor escape: ${label}`); return; }
    if (!anchors.get(target)?.has(fragment)) failures.push(`Missing anchor: ${label}`);
  }
}

for (const [filename, html] of texts) {
  notes.pages++;
  const stripped = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const element of stripped.matchAll(/<([a-z][\w:-]*)\b[^>]*>/gi)) {
    for (const attribute of element[0].matchAll(/\b(href|src|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi)) {
      const kind = element[1].toLowerCase() === 'script' && attribute[1].toLowerCase() === 'src' ? 'script' : 'link';
      await checkReference(filename, attribute[2] ?? attribute[3] ?? attribute[4], kind);
    }
    for (const srcset of element[0].matchAll(/\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      for (const candidate of (srcset[1] ?? srcset[2]).split(',')) await checkReference(filename, candidate.trim().split(/\s+/)[0]);
    }
  }
}

for (const filename of files.filter(file => file.endsWith('.css'))) {
  const css = await readFile(filename, 'utf8');
  for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi)) {
    await checkReference(filename, match[1] ?? match[2] ?? match[3]);
  }
  for (const match of css.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)) await checkReference(filename, match[1] ?? match[2]);
}

async function verifyManifest(relative, counter) {
  const filename = path.join(directory, relative);
  const manifest = JSON.parse(await readFile(filename, 'utf8'));
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) throw new Error(`Empty source manifest: ${relative}`);
  const seen = new Set();
  for (const entry of manifest.files) {
    if (seen.has(entry.file)) failures.push(`Repeated manifest entry: ${entry.file}`);
    seen.add(entry.file);
    if (typeof entry.file !== 'string' || path.basename(entry.file) !== entry.file) throw new Error(`Manifest file must be a basename: ${relative}`);
    const target = path.join(path.dirname(filename), entry.file);
    if (!fileSet.has(target)) { failures.push(`Missing manifested file: ${entry.file}`); continue; }
    const bytes = await readFile(target);
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (hash !== entry.sha256) failures.push(`Source checksum mismatch: ${entry.file}`);
    notes[counter]++;
  }
  return manifest;
}

const enzymeManifest = await verifyManifest('assets/enzyme/provenance.json', 'sourceFiles');
const enzymeOriginals = ['enzyme_deterministic_stochastic.png', 'enzyme_comparison.json', 'MM_Heatmap.png', 'compare_enzyme_ode.py', 'gillespie_demo.py', 'MM_Heatmap.py', 'MM_Surface.py'];
if (enzymeManifest.files.length !== enzymeOriginals.length || enzymeOriginals.some(file => !enzymeManifest.files.some(entry => entry.file === file))) failures.push('The seven original enzyme exports are incomplete.');
for (const name of ['early', 'lac', 'observations']) await verifyManifest(`assets/systems-biology/${name}-provenance.json`, 'sourceFiles');
for (const folder of [...catalog.courses.filter(id => id !== 'systems-biology'), ...catalog.items.map(item => item.slug)]) {
  await verifyManifest('assets/' + folder + '/provenance.json', 'sourceFiles');
}
await verifyManifest('vendor/mathjax/provenance.json', 'vendorFiles');
await verifyManifest('vendor/fonts/provenance.json', 'vendorFiles');

const pythonLibraries = new Set(['__future__', 'argparse', 'collections', 'csv', 'dataclasses', 'functools', 'hashlib', 'itertools', 'json', 'math', 'os', 'pathlib', 're', 'sqlite3', 'statistics', 'sys', 'time', 'typing', 'numpy', 'scipy', 'matplotlib', 'mpl_toolkits', 'pandas', 'sklearn', 'tensorflow', 'keras', 'torch', 'torchvision', 'PIL', 'cv2', 'segment_anything']);
for (const filename of files.filter(file => file.endsWith('.py'))) {
  const source = await readFile(filename, 'utf8');
  for (const match of source.matchAll(/^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm)) {
    const moduleName = (match[1] ?? match[2]).split('.')[0];
    if (pythonLibraries.has(moduleName)) continue;
    if (!fileSet.has(path.join(path.dirname(filename), moduleName + '.py'))) failures.push(`Missing local Python dependency: ${path.relative(directory, filename)} imports ${moduleName}`);
  }
  notes.pythonSources++;
}

function elementBlocks(html, tag, className) {
  return [...html.matchAll(new RegExp('<' + tag + '\\b([^>]*)>([\\s\\S]*?)<\\/' + tag + '>', 'gi'))]
    .filter(match => new RegExp('\\bclass=["\'][^"\']*\\b' + className + '\\b').test(match[1]))
    .map(match => match[2]);
}
function plainText(html) { return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(); }
function classBlocks(html, className) {
  const blocks = [];
  for (const match of html.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)) {
    const classes = match[2].match(/\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i)?.slice(1).find(value => value !== undefined)?.split(/\s+/) || [];
    if (!classes.includes(className)) continue;
    const tags = new RegExp('<(\\/?)' + match[1] + '\\b[^>]*>', 'gi');
    tags.lastIndex = match.index + match[0].length;
    let depth = 1;
    for (let closing; (closing = tags.exec(html));) {
      depth += closing[1] ? -1 : 1;
      if (!depth) { blocks.push(html.slice(match.index + match[0].length, closing.index)); break; }
    }
  }
  return blocks;
}
function anchorTags(html) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map(match => ({
    attributes: match[1], text: plainText(match[2]),
    href: match[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i)?.slice(1).find(value => value !== undefined),
  }));
}
function targetPath(href, from) {
  if (!href) return '';
  try { return decodeURIComponent(new URL(decodeEntities(href), 'https://coursework.invalid/' + from).pathname); }
  catch { return ''; }
}
function targetHash(href, from) {
  if (!href) return '';
  try { return new URL(decodeEntities(href), 'https://coursework.invalid/' + from).hash; }
  catch { return ''; }
}

const homeHTML = texts.get(path.join(directory, 'index.html')) || '';
const rootLinks = anchorTags(homeHTML);
if (!rootLinks.some(link => link.text === 'Coursework' && targetPath(link.href, 'index.html') === '/history/index.html')) failures.push('Home Coursework navigation must open all courses.');
if (![...homeHTML.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].some(match => plainText(match[1]) === 'Selected coursework')) failures.push('Home needs the Selected coursework heading.');
if (elementBlocks(homeHTML, 'article', 'course-entry').length !== catalog.courses.length) failures.push('Home selected-course count differs from catalog.');
for (const id of catalog.courses) {
  const course = JSON.parse(await readFile(path.join(root, 'content', id, 'course.json'), 'utf8'));
  const coursePrefix = 'courses/' + id + '/';
  const contentsPath = path.join(directory, coursePrefix, 'index.html');
  const contentsHTML = texts.get(contentsPath) || '';
  const rows = elementBlocks(contentsHTML, 'ol', 'contents-list');
  const contentsLinks = rows.length === 1 ? anchorTags(rows[0]) : [];
  if (contentsLinks.length !== course.chapters.length) failures.push('Incomplete course contents: ' + id);
  if (!rootLinks.some(link => targetPath(link.href, 'index.html') === '/' + coursePrefix + 'index.html')) failures.push('Collection missing course: ' + id);
  for (const [index, chapter] of course.chapters.entries()) {
    const relative = coursePrefix + chapter.slug + '.html';
    const html = texts.get(path.join(directory, relative));
    if (!html) { failures.push('Missing chapter: ' + relative); continue; }
    const chapterSource = await readFile(path.join(root, 'content', id, chapter.slug + '.html'), 'utf8');
    if (!html.includes(chapterSource)) failures.push('Changed or missing body fragment: ' + relative);
    const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '';
    if (plainText(h1).replace(/^\d+\.\s*/, '') !== chapter.title) failures.push('Wrong chapter title: ' + relative);
    const headings = [...(rows[0] || '').matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)];
    if (plainText(headings[index]?.[1] || '') !== chapter.title || targetPath(contentsLinks[index]?.href, coursePrefix + 'index.html') !== '/' + relative) failures.push('Wrong contents order: ' + relative);
    const bodies = elementBlocks(html, 'article', 'chapter-body'), body = bodies[0] || '';
    if (bodies.length !== 1) failures.push('Chapter needs one body: ' + relative);
    if (!chapter.format && (!/<figure\b/.test(body) || !/<(?:img|svg)\b/.test(body))) failures.push('Chapter needs figure: ' + relative);
    if (chapter.format === 'code' && !/<pre\b/.test(body)) failures.push('Code chapter needs readable code: ' + relative);
    if (chapter.format === 'proof' && !body.includes('\\[')) failures.push('Proof chapter needs mathematical work: ' + relative);
    if (chapter.format === 'analysis' && !/<(?:pre|table|figure)\b/.test(body)) failures.push('Analysis chapter needs work or results: ' + relative);
    if (!chapter.format && !anchorTags(body).some(link => /\.(?:py|m|R|json|csv|txt)(?:[?#]|$)/i.test(link.href || ''))) failures.push('Chapter needs source link: ' + relative);
    const navs = elementBlocks(html, 'nav', 'book-chapters');
    if (navs.length !== 2) failures.push('Missing wide/mobile navigation: ' + relative);
    for (const navigation of navs) {
      const links = anchorTags(navigation);
      if (links.length !== course.chapters.length) failures.push('Incomplete chapter list: ' + relative);
      for (const [navIndex, link] of links.entries()) {
        const expected = course.chapters[navIndex];
        if (!expected || targetPath(link.href, relative) !== '/' + coursePrefix + expected.slug + '.html' || link.text.replace(/^\d+\s*/, '') !== expected.shortTitle) failures.push('Wrong chapter list order: ' + relative);
      }
      const current = links.filter(link => /\baria-current=["']page["']/.test(link.attributes));
      if (current.length !== 1 || targetPath(current[0]?.href, relative) !== '/' + relative) failures.push('Wrong current marker: ' + relative);
    }
    for (const [direction, expected] of [['prev', course.chapters[index - 1]], ['next', course.chapters[index + 1]]]) {
      const paging = anchorTags(html).filter(link => new RegExp('\\bdata-reader-' + direction + '\\b').test(link.attributes));
      if (paging.length !== (expected ? 1 : 0) || (expected && targetPath(paging[0]?.href, relative) !== '/' + coursePrefix + expected.slug + '.html')) failures.push('Wrong ' + direction + ' link: ' + relative);
    }
    notes.courseChapters++;
  }
}
for (const item of catalog.items) {
  const relative = item.section + '/' + item.slug + '/index.html';
  const html = texts.get(path.join(directory, relative)) || '';
  if (!html.includes(await readFile(path.join(root, 'content', item.section, item.slug + '.html'), 'utf8'))) failures.push('Missing selected-work body: ' + relative);
  if (!rootLinks.some(link => targetPath(link.href, 'index.html') === '/' + relative)) failures.push('Collection missing work: ' + relative);
  if (plainText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '') !== item.title) failures.push('Wrong selected-work title: ' + relative);
  if (item.section === 'projects' && !/<figure\b/.test(html)) failures.push('Project needs representative figure: ' + relative);
  if (item.section === 'projects' && !anchorTags(html).some(link => /\.(?:py|R|json|csv|txt)(?:[?#]|$)/i.test(link.href || ''))) failures.push('Project needs source: ' + relative);
}
if (!htmlFiles.length) failures.push('No HTML pages found.');
const history = JSON.parse(await readFile(path.join(root, 'content/history.json'), 'utf8'));
const historyHTML = texts.get(path.join(directory, 'history/index.html')) || '';
if (plainText(historyHTML.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '') !== 'All courses') failures.push('History title must be All courses.');
const historyIds = [...historyHTML.matchAll(/data-history-course="([^"]+)"/g)].map(match => match[1]);
if (JSON.stringify(historyIds) !== JSON.stringify(history.courses.map(course => course.id))) failures.push('Course-history records differ from the source snapshot.');
if (new Set(historyIds).size !== historyIds.length) failures.push('Repeated course-history record.');
if (!rootLinks.some(link => targetPath(link.href, 'index.html') === '/history/index.html')) failures.push('Collection missing course-history link.');
for (const id of catalog.courses) if (!historyIds.includes(id)) failures.push('Course history missing featured course: ' + id);
if (overviews.size !== history.courses.length) failures.push('Overview count differs from course history.');
for (const course of history.courses) {
  const overview = overviews.get(course.id);
  if (!overview) { failures.push('Missing course overview source: ' + course.id); continue; }
  const relative = 'courses/' + course.id + '/index.html';
  const html = texts.get(path.join(directory, relative)) || '';
  if (!html) { failures.push('Missing course overview page: ' + relative); continue; }
  const blocks = classBlocks(html, 'course-overview');
  if (blocks.length !== 1) failures.push('Course needs one overview section: ' + course.id);
  const body = blocks[0] || '';
  const headings = [...body.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)].map(match => plainText(match[1]));
  if (JSON.stringify(headings) !== JSON.stringify(overview.topics.map(topic => topic.title))) failures.push('Overview topic headings differ from source: ' + course.id);
  if (![...body.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].some(match => plainText(match[1]) === 'Course overview')) failures.push('Missing Course overview heading: ' + course.id);
  const pageText = plainText(html), bodyText = plainText(body);
  if (!pageText.includes(plainText(overview.summary))) failures.push('Missing overview summary: ' + course.id);
  if (!pageText.includes(plainText(overview.sourceNote))) failures.push('Missing overview source note: ' + course.id);
  for (const topic of overview.topics) if (!bodyText.includes(plainText(topic.description))) failures.push('Missing overview topic description: ' + course.id + ' / ' + topic.title);
  const row = [...historyHTML.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)].find(match => match[1].includes('data-history-course="' + course.id + '"'))?.[2] || '';
  const title = classBlocks(row, 'history-course-title');
  const links = title.length === 1 ? anchorTags(title[0]) : [];
  if (links.length !== 1 || links[0].text !== course.title || targetPath(links[0].href, 'history/index.html') !== '/' + relative) failures.push('History title must link to its course overview: ' + course.id);
  if (catalog.courses.includes(course.id)) {
    if (!anchors.get(path.join(directory, relative))?.has('selected-work')) failures.push('Missing selected-work section: ' + course.id);
    const selected = anchorTags(row).filter(link => /\bclass=["'][^"']*\bhistory-work\b/.test(link.attributes));
    if (selected.length !== 1 || targetPath(selected[0].href, 'history/index.html') !== '/' + relative || targetHash(selected[0].href, 'history/index.html') !== '#selected-work') failures.push('History selected work must link to its deeper section: ' + course.id);
  }
  notes.courseOverviews++;
  notes.overviewTopics += overview.topics.length;
}
notes.historyRecords = historyIds.length;
for (const relative of ['index.html', 'courses/systems-biology/index.html', 'exercises/enzyme-simulations/index.html', '.nojekyll']) {
  if (!fileSet.has(path.join(directory, relative))) failures.push(`Missing built entry: ${relative}`);
}
if (!/Apache License/.test(await readFile(path.join(directory, 'vendor/mathjax/LICENSE'), 'utf8'))) failures.push('MathJax Apache license is missing.');

if (failures.length) {
  console.error(failures.map(message => `FAIL: ${message}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`PASS: ${notes.pages} HTML pages, ${notes.courseOverviews} course overviews with ${notes.overviewTopics} topic headers, ${notes.courseChapters} ordered course chapters, ${notes.historyRecords} course-history records, ${notes.links} local references, ${notes.sourceFiles} source checksums, ${notes.vendorFiles} vendor checksums, ${notes.pythonSources} Python source dependency sets; relative URLs, all-course links and chapter navigation.`);
}
