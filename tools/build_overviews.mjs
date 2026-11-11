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

export const topicAnchor = index => 'topic-' + (index + 1);
export const renderOverview = (overview, catalog) => '<section class="course-overview" aria-labelledby="overview-title"><h2 id="overview-title">Contents</h2><ol class="course-topics">' + overview.topics.map((topic, index) => {
  const examples = (topic.examples || []).map(example => '<a data-example href="' + escape(example.slug) + '.html">' + escape(example.label) + '</a>');
  const projects = (topic.projects || []).map(slug => {
    const item = catalog.items.find(item => item.slug === slug);
    if (!item) throw new Error('Missing topic project: ' + slug);
    return '<a data-project href="../../' + item.section + '/' + item.slug + '/index.html">' + (item.kind === 'mini-project' ? 'Mini-project: ' : 'Project: ') + escape(item.title) + '</a>';
  });
  return '<li class="topic-row" id="' + topicAnchor(index) + '"><div><h3>' + escape(topic.title) + '</h3><p class="topic-description">' + escape(topic.description) + '</p>' + (examples.length || projects.length ? '<div class="topic-examples">' + examples.concat(projects).join('') + '</div>' : '') + '</div></li>';
}).join('\n') + '</ol></section>';
export const relatedWork = (catalog, id) => catalog.items.filter(item => item.courseId === id);
export const renderRelatedWork = items => ['projects', 'essays'].map(section => {
  const group = items.filter(item => item.section === section);
  return group.length ? '<section class="course-related-work"><h2>' + (section === 'projects' ? 'Projects' : 'Writing') + '</h2><ul>' + group.map(item => '<li><a href="../../' + item.section + '/' + item.slug + '/index.html">' + escape(item.title) + '</a></li>').join('') + '</ul></section>' : '';
}).join('');

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
    const html = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + escape(course.title) + ' | Coursework</title><link rel="stylesheet" href="../../styles.css"></head><body class="course-contents-page"><a class="skip-link" href="#content">Skip to course contents</a><header class="site-header collection-header"><a class="wordmark" href="../../index.html">Coursework</a><a href="../../history/index.html">All courses</a></header><main id="content" class="course-contents"><h1>' + escape(course.title) + '</h1><p class="study-context">' + escape(course.term + ' ' + course.year + ' · ' + course.code + ' · ' + course.school) + '</p><p class="course-intro">' + escape(overview.summary) + '</p>' + renderOverview(overview, catalog) + renderRelatedWork(relatedWork(catalog, course.id)) + '</main><footer class="site-footer"><a href="../../index.html">All coursework</a><a href="../../history/index.html">All courses</a></footer></body></html>';
    await writeFile(path.join(destination, 'index.html'), html);
    count++;
  }
  return count;
}
