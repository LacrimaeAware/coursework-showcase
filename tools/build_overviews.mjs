import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export async function loadOverviews(root) {
  const folder = path.join(root, 'content/overviews');
  const entries = [];
  for (const filename of (await readdir(folder)).filter(name => name.endsWith('.json')).sort()) {
    entries.push(...JSON.parse(await readFile(path.join(folder, filename), 'utf8')));
  }
  const history = JSON.parse(await readFile(path.join(root, 'content/history.json'), 'utf8'));
  const expected = new Set(history.courses.map(course => course.id));
  const overviews = new Map();
  for (const entry of entries) {
    if (!expected.has(entry.id) || overviews.has(entry.id)) throw new Error('Unexpected or repeated course overview: ' + entry.id);
    if (!entry.summary || !entry.sourceNote || !Array.isArray(entry.topics) || !entry.topics.length || entry.topics.some(topic => !topic.title || !topic.description)) throw new Error('Incomplete overview: ' + entry.id);
    overviews.set(entry.id, entry);
  }
  for (const id of expected) if (!overviews.has(id)) throw new Error('Missing overview: ' + id);
  return overviews;
}

export const renderOverview = overview => '<section class="course-overview" aria-labelledby="overview-title"><h2 id="overview-title">Course overview</h2>' + overview.topics.map(topic => '<section><h3>' + escape(topic.title) + '</h3><p>' + escape(topic.description) + '</p></section>').join('\n') + '</section>';
export const renderSource = overview => '<p class="overview-source"><span>Sources:</span> ' + escape(overview.sourceNote) + '</p>';
export const relatedWork = (catalog, id) => catalog.items.filter(item => item.courseId === id);
export const renderRelatedWork = items => items.length ? '<section class="course-related-work"><h2>Projects and writing</h2><ul>' + items.map(item => '<li><a href="../../' + item.section + '/' + item.slug + '/index.html">' + escape(item.title) + '</a></li>').join('') + '</ul></section>' : '';

export async function buildOverviews(root, output) {
  const overviews = await loadOverviews(root);
  const history = JSON.parse(await readFile(path.join(root, 'content/history.json'), 'utf8'));
  const catalog = JSON.parse(await readFile(path.join(root, 'content/catalog.json'), 'utf8'));
  let count = 0;
  for (const course of history.courses) {
    if (catalog.courses.includes(course.id)) continue;
    const overview = overviews.get(course.id);
    const destination = path.join(output, 'courses', course.id);
    await mkdir(destination, { recursive: true });
    const html = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + escape(course.title) + ' | Coursework</title><link rel="stylesheet" href="../../styles.css"></head><body class="course-contents-page"><a class="skip-link" href="#content">Skip to course overview</a><header class="site-header collection-header"><a class="wordmark" href="../../index.html">Coursework</a><a href="../../history/index.html">All courses</a></header><main id="content" class="course-contents"><h1>' + escape(course.title) + '</h1><p class="study-context">' + escape(course.term + ' ' + course.year + ' · ' + course.code + ' · ' + course.school) + '</p><p class="course-intro">' + escape(overview.summary) + '</p>' + renderOverview(overview) + renderRelatedWork(relatedWork(catalog, course.id)) + renderSource(overview) + '<p class="course-archive-link"><a href="' + escape(history.archive_base + '?course=' + course.id) + '" target="_blank" rel="noreferrer">Original course archive (sign-in)</a></p></main><footer class="site-footer"><a href="../../index.html">All coursework</a><a href="../../history/index.html">All courses</a></footer></body></html>';
    await writeFile(path.join(destination, 'index.html'), html);
    count++;
  }
  return count;
}
