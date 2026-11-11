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
const history = JSON.parse(await readFile(path.join(root, 'content/history.json'), 'utf8'));
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
    try {
      if (/(?:^|\.)chatgpt\.site$/i.test(new URL(href.startsWith('//') ? 'https:' + href : href).hostname)) failures.push(`Retired archive URL in public site: ${label}`);
    } catch { failures.push(`Invalid external URL: ${label}`); }
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
  const forbiddenClasses = new Set(['overview-source', 'history-source', 'course-archive-link', 'history-archive', 'course-coverage', 'course-jump', 'contents-list', 'course-entry-chapters', 'course-selected-work']);
  for (const attribute of stripped.matchAll(/\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    for (const className of (attribute[1] ?? attribute[2]).split(/\s+/)) {
      if (forbiddenClasses.has(className)) failures.push(`Retired public source/archive UI: ${path.relative(directory, filename)} .${className}`);
    }
  }
  if (anchors.get(filename)?.has('selected-work')) failures.push(`Retired separate selected-work section: ${path.relative(directory, filename)}`);
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
    attributes: match[1], text: plainText(match[2]), html: match[2],
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
if (![...homeHTML.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].some(match => plainText(match[1]) === 'Courses')) failures.push('Home needs the Courses heading.');
const homeCourses = classBlocks(homeHTML, 'course-entry');
if (homeCourses.length !== history.courses.length) failures.push('Home course count differs from history.');
for (const course of history.courses) {
  const matches = homeCourses.filter(entry => {
    const heading = entry.match(/<h[34]\b[^>]*>([\s\S]*?)<\/h[34]>/i)?.[1] || '';
    const links = anchorTags(heading);
    return links.length === 1 && links[0].text === course.title && targetPath(links[0].href, 'index.html') === '/courses/' + course.id + '/index.html';
  });
  if (matches.length !== 1) failures.push('Home needs one course contents link: ' + course.id);
}
for (const id of catalog.courses) {
  const course = JSON.parse(await readFile(path.join(root, 'content', id, 'course.json'), 'utf8'));
  const overview = overviews.get(id);
  if (!overview) { failures.push('Missing reader course contents: ' + id); continue; }
  const coursePrefix = 'courses/' + id + '/';
  const contentsPath = path.join(directory, coursePrefix, 'index.html');
  const contentsHTML = texts.get(contentsPath) || '';
  const examples = overview.topics.flatMap(topic => topic.examples || []);
  const exampleSlugs = new Set(examples.map(example => example.slug));
  const chapterSlugs = new Set(course.chapters.map(chapter => chapter.slug));
  if (exampleSlugs.size !== chapterSlugs.size || [...chapterSlugs].some(slug => !exampleSlugs.has(slug))) failures.push('Every reader chapter must be reachable from its course contents: ' + id);
  for (const example of examples) if (!chapterSlugs.has(example.slug)) failures.push('Course contents link unknown example: ' + id + '/' + example.slug);
  if (!rootLinks.some(link => targetPath(link.href, 'index.html') === '/' + coursePrefix + 'index.html')) failures.push('Collection missing course: ' + id);
  for (const [index, chapter] of course.chapters.entries()) {
    const relative = coursePrefix + chapter.slug + '.html';
    const html = texts.get(path.join(directory, relative));
    if (!html) { failures.push('Missing chapter: ' + relative); continue; }
    const chapterSource = await readFile(path.join(root, 'content', id, chapter.slug + '.html'), 'utf8');
    if (!html.includes(chapterSource)) failures.push('Changed or missing body fragment: ' + relative);
    const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '';
    if (plainText(h1) !== chapter.title) failures.push('Wrong unnumbered example title: ' + relative);
    const titleBlock = classBlocks(html, 'book-title')[0] || '';
    if (chapter.format === 'proof' && (classBlocks(titleBlock, 'chapter-record').length || classBlocks(titleBlock, 'chapter-summary').length)) failures.push('Proof header repeats per-problem context: ' + relative);
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
      if (links.length !== overview.topics.length) failures.push('Incomplete course-topic navigation: ' + relative);
      for (const [navIndex, link] of links.entries()) {
        const expected = overview.topics[navIndex];
        if (!expected) { failures.push('Unexpected course-topic link: ' + relative); continue; }
        const currentTopic = (expected.examples || []).some(example => example.slug === chapter.slug);
        const slug = currentTopic ? chapter.slug : expected.examples?.[0]?.slug;
        const expectedPath = '/' + coursePrefix + (slug ? slug + '.html' : 'index.html');
        const expectedHash = slug ? '' : '#topic-' + (navIndex + 1);
        const number = classBlocks(link.html, 'chapter-number');
        if (number.length !== 1 || plainText(number[0]) !== String(navIndex + 1)) failures.push('Wrong course-topic number: ' + relative);
        if (targetPath(link.href, relative) !== expectedPath || targetHash(link.href, relative) !== expectedHash || link.text.replace(/^\d+\s*/, '') !== expected.title) failures.push('Wrong course-topic link or order: ' + relative);
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
  if (![...body.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].some(match => plainText(match[1]) === 'Contents')) failures.push('Missing Contents heading: ' + course.id);
  if (elementBlocks(body, 'ol', 'course-topics').length !== 1) failures.push('Course needs one topic contents list: ' + course.id);
  const topicRows = classBlocks(body, 'topic-row');
  if (topicRows.length !== overview.topics.length) failures.push('Contents row count differs from topics: ' + course.id);
  const pageText = plainText(html);
  if (!pageText.includes(plainText(overview.summary))) failures.push('Missing overview summary: ' + course.id);
  for (const [index, topic] of overview.topics.entries()) {
    const topicRow = topicRows[index] || '';
    if (!classBlocks(topicRow, 'topic-description').some(block => plainText(block) === plainText(topic.description))) failures.push('Missing topic description: ' + course.id + ' / ' + topic.title);
    if (!anchors.get(path.join(directory, relative))?.has('topic-' + (index + 1))) failures.push('Missing topic anchor: ' + course.id + ' / ' + topic.title);
    const exampleLinks = anchorTags(topicRow).filter(link => /\bdata-example(?:\s|=|$)/.test(link.attributes));
    if (exampleLinks.length !== (topic.examples || []).length) failures.push('Wrong example count under topic: ' + course.id + ' / ' + topic.title);
    for (const [exampleIndex, example] of (topic.examples || []).entries()) {
      const link = exampleLinks[exampleIndex];
      if (!link || link.text !== example.label || targetPath(link.href, relative) !== '/courses/' + course.id + '/' + example.slug + '.html') failures.push('Wrong topic example: ' + course.id + ' / ' + example.slug);
    }
    const projectLinks = anchorTags(topicRow).filter(link => /\bdata-project(?:\s|=|$)/.test(link.attributes));
    if (projectLinks.length !== (topic.projects || []).length) failures.push('Wrong project count under topic: ' + course.id + ' / ' + topic.title);
    for (const [projectIndex, slug] of (topic.projects || []).entries()) {
      const project = catalog.items.find(item => item.slug === slug);
      const link = projectLinks[projectIndex];
      if (!project || !link || targetPath(link.href, relative) !== '/' + project.section + '/' + slug + '/index.html') failures.push('Wrong topic project: ' + course.id + ' / ' + slug);
    }
  }
  const row = [...historyHTML.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)].find(match => match[1].includes('data-history-course="' + course.id + '"'))?.[2] || '';
  const title = classBlocks(row, 'history-course-title');
  const links = title.length === 1 ? anchorTags(title[0]) : [];
  if (links.length !== 1 || links[0].text !== course.title || targetPath(links[0].href, 'history/index.html') !== '/' + relative) failures.push('History title must link to its course overview: ' + course.id);
  if (catalog.courses.includes(course.id)) {
    const selected = anchorTags(row).filter(link => /\bclass=["'][^"']*\bhistory-work\b/.test(link.attributes));
    if (selected.length) failures.push('History repeats a course contents link as selected work: ' + course.id);
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
