import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadOverviews, renderOverview, renderRelatedWork, relatedWork, topicAnchor, renderSectionNav, escape } from './build_overviews.mjs';

const safeId = value => {
  if (!/^[a-z0-9-]+$/.test(value)) throw new Error('Invalid content identifier');
  return value;
};
const head = (title, math = true) => '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + escape(title) + ' | Coursework</title><link rel="stylesheet" href="../../styles.css">' + (math ? '<script defer src="../../vendor/mathjax/tex-svg.js"></script>' : '') + '<script defer src="../../course-reader.js"></script></head>';
const footer = context => '<footer class="site-footer"><a href="../../index.html">All coursework</a><p>' + escape(context) + '</p></footer></body></html>';

function navigation(overview, chapter) {
  const current = overview.topics.findIndex(topic => (topic.examples || []).some(example => example.slug === chapter.slug));
  return '<nav class="book-chapters" aria-label="Course contents">' + overview.topics.map((topic, index) => {
    const target = current === index ? chapter.slug + '.html' : topic.examples?.[0] ? topic.examples[0].slug + '.html' : 'index.html#' + topicAnchor(index);
    return '<a href="' + target + '"' + (current === index ? ' aria-current="page"' : '') + '><span class="chapter-number">' + (index + 1) + '</span><span>' + escape(topic.title) + '</span></a>';
  }).join('') + '</nav>';
}

export async function buildCourse(root, output) {
  const catalog = JSON.parse(await readFile(path.join(root, 'content/catalog.json'), 'utf8'));
  const history = JSON.parse(await readFile(path.join(root, 'content/history.json'), 'utf8'));
  const overviews = await loadOverviews(root);
  let count = 0;
  for (const rawId of catalog.courses) {
    const id = safeId(rawId);
    const content = path.join(root, 'content', id);
    const course = JSON.parse(await readFile(path.join(content, 'course.json'), 'utf8'));
    const overview = overviews.get(id);
    const chapterIds = new Set(course.chapters.map(chapter => chapter.slug));
    const linked = new Set(overview.topics.flatMap(topic => (topic.examples || []).map(example => example.slug)));
    for (const slug of linked) if (!chapterIds.has(slug)) throw new Error('Unknown course example: ' + id + '/' + slug);
    for (const slug of chapterIds) if (!linked.has(slug)) throw new Error('Example missing from course contents: ' + id + '/' + slug);
    const destination = path.join(output, 'courses', id);
    await mkdir(destination, { recursive: true });
    const context = course.shortTitle + ' · ' + course.term;
    const attached = new Set(overview.topics.flatMap(topic => topic.projects || []));
    const remaining = relatedWork(catalog, id).filter(item => !attached.has(item.slug));
    await writeFile(path.join(destination, 'index.html'), head(course.title, false) + '<body class="course-contents-page"><a class="skip-link" href="#content">Skip to course contents</a><header class="site-header collection-header">' + renderSectionNav('../../', 'courses') + '</header><main id="content" class="course-contents"><h1>' + escape(course.title) + '</h1><p class="study-context">' + escape(course.term) + '</p><p class="course-intro">' + escape(overview.summary) + '</p>' + renderOverview(overview, catalog) + renderRelatedWork(remaining) + '</main>' + footer(context));
    count++;
    for (const [index, chapter] of course.chapters.entries()) {
      const body = await readFile(path.join(content, safeId(chapter.slug) + '.html'), 'utf8');
      const previous = course.chapters[index - 1], next = course.chapters[index + 1];
      const contentsLink = '<a href="index.html"><small>Course</small><span>Contents</span></a>';
      const paging = '<nav class="book-paging" aria-label="Example navigation">' + (previous ? '<a rel="prev" data-reader-prev href="' + previous.slug + '.html"><small>Previous example</small><span>' + escape(previous.shortTitle) + '</span></a>' : contentsLink) + (next ? '<a rel="next" data-reader-next href="' + next.slug + '.html"><small>Next example</small><span>' + escape(next.shortTitle) + '</span></a>' : contentsLink) + '</nav>';
      const nav = navigation(overview, chapter);
      const introduction = chapter.format === 'proof' ? '' : '<p class="chapter-record">' + escape(chapter.record) + '</p><p class="chapter-summary">' + escape(chapter.summary) + '</p>';
      const shell = head(chapter.title) + '<body class="book-page"><a class="skip-link" href="#content">Skip to example</a><aside class="book-sidebar"><a class="wordmark" href="../../index.html">Coursework</a><a class="book-course" href="index.html">' + escape(course.shortTitle) + '</a>' + nav + '<a class="book-contents-link" href="index.html">Course contents</a></aside><div class="book-mobile-bar"><a href="index.html">' + escape(course.shortTitle) + '</a><details><summary>Contents</summary>' + nav + '</details></div><main class="book-main" id="content"><header class="book-title"><h1>' + escape(chapter.title) + '</h1>' + introduction + '</header><article class="chapter-body">' + body + '</article>' + paging + '</main>' + footer(context);
      await writeFile(path.join(destination, chapter.slug + '.html'), shell);
      count++;
    }
  }
  for (const item of catalog.items) {
    const section = safeId(item.section), slug = safeId(item.slug);
    const body = await readFile(path.join(root, 'content', section, slug + '.html'), 'utf8');
    const destination = path.join(output, section, slug);
    await mkdir(destination, { recursive: true });
    const label = item.kind === 'speech' ? 'Speech' : section === 'essays' ? 'Essay' : 'Project';
    const html = head(item.title, body.includes('\\(') || body.includes('\\[')) + '<body class="work-page"><a class="skip-link" href="#content">Skip to ' + label.toLowerCase() + '</a><header class="site-header collection-header">' + renderSectionNav('../../', section) + '</header><main id="content" class="work-main"><header class="work-title"><h1>' + escape(item.title) + '</h1><p class="study-context">' + escape(item.context) + '</p></header><article class="chapter-body work-prose">' + body + '</article></main>' + footer(item.context);
    await writeFile(path.join(destination, 'index.html'), html);
    count++;
  }
  const groups = [
    ['computing-and-models.json', 'Computing and modeling'],
    ['mathematics.json', 'Mathematics'],
    ['sciences.json', 'Sciences'],
    ['humanities.json', 'Humanities and languages'],
  ];
  const records = new Map(history.courses.map(course => [course.id, course]));
  const directory = [];
  for (const [groupIndex, [filename, title]] of groups.entries()) {
    const entries = JSON.parse(await readFile(path.join(root, 'content/overviews', filename), 'utf8'));
    directory.push('<section class="course-group" id="subject-' + groupIndex + '" role="tabpanel" aria-labelledby="subject-tab-' + groupIndex + '"' + (groupIndex ? ' hidden' : '') + '><h3 class="sr-only">' + escape(title) + '</h3><ul class="course-group-list">' + entries.map(entry => {
      const course = records.get(entry.id);
      return '<li><article class="course-entry"><h4><a class="course-name" href="courses/' + course.id + '/index.html">' + escape(course.title) + '</a></h4><p class="entry-context">' + escape(course.term + ' ' + course.year) + '</p></article></li>';
    }).join('') + '</ul></section>');
  }
  const entries = section => catalog.items.filter(item => item.section === section).map(item => '<li><a class="work-list-link" href="' + section + '/' + item.slug + '/index.html"><h3>' + escape(item.title) + '</h3><p class="entry-context">' + escape(item.context) + '</p><p>' + escape(item.summary) + '</p><span class="text-link">' + escape(item.readLabel || ('Read ' + (section === 'essays' ? 'essay' : 'project'))) + '</span></a></li>').join('\n');
  const homePath = path.join(output, 'index.html');
  let home = await readFile(homePath, 'utf8');
  home = home.replace('<!-- COURSE_ENTRIES -->', '<div class="course-directory">' + directory.join('') + '</div>').replace('<!-- PROJECT_ENTRIES -->', entries('projects')).replace('<!-- ESSAY_ENTRIES -->', entries('essays'));
  await writeFile(homePath, home);
  return count;
}
