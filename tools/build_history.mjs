import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadOverviews } from './build_overviews.mjs';

const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export async function buildHistory(root, output) {
  const history = JSON.parse(await readFile(path.join(root, 'content/history.json'), 'utf8'));
  const catalog = JSON.parse(await readFile(path.join(root, 'content/catalog.json'), 'utf8'));
  const overviews = await loadOverviews(root);
  const work = new Map(catalog.courses.map(id => [id, { href: '../courses/' + id + '/index.html#selected-work', label: 'Selected coursework' }]));
  const individual = {
    'math-seminar': ['projects', 'koch-snowflake', 'Seminar presentation'],
    'eastern-philosophy': ['essays', 'eastern-philosophy', 'Complete essay'],
    'speech': ['essays', 'holism-speech', 'Speech script'],
  };
  for (const [id, [section, slug, label]] of Object.entries(individual)) {
    if (catalog.items.some(item => item.section === section && item.slug === slug)) work.set(id, { href: '../' + section + '/' + slug + '/index.html', label });
  }
  const years = [...new Set(history.courses.map(course => course.year))].sort((a, b) => a - b);
  const sections = years.map(year => {
    const rows = history.courses.filter(course => course.year === year).map(course => {
      const selected = work.get(course.id);
      const overview = overviews.get(course.id);
      return '<tr data-history-course="' + escape(course.id) + '"><th scope="row">' + escape(course.term) + '</th><td><p class="history-course-title"><a href="../courses/' + escape(course.id) + '/index.html">' + escape(course.title) + '</a></p><small>' + escape(course.code + ' · ' + course.school) + '</small><p class="history-topics">' + overview.topics.map(topic => escape(topic.title)).join(' · ') + '</p>' + (selected ? '<a class="history-work" href="' + selected.href + '">' + escape(selected.label) + '</a>' : '') + '</td></tr>';
    }).join('\n');
    return '<section id="year-' + year + '"><h2>' + year + '</h2><table class="history-table"><thead><tr><th>Term</th><th>Course and topics</th></tr></thead><tbody>' + rows + '</tbody></table></section>';
  }).join('\n');
  const jumpLinks = years.map(year => '<a href="#year-' + year + '">' + year + '</a>').join('');
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>All courses | Coursework</title><link rel="stylesheet" href="../styles.css"></head><body><a class="skip-link" href="#content">Skip to all courses</a><header class="site-header collection-header"><a class="wordmark" href="../index.html">Coursework</a><a href="../index.html">Selected work</a></header><main id="content" class="history-main"><h1>All courses</h1><p>33 courses from 2022 through 2026. Each course opens to a topic overview, with selected examples, projects or writing where available.</p><nav class="history-years" aria-label="Years">' + jumpLinks + '</nav>' + sections + '</main><footer class="site-footer"><a href="../index.html">All coursework</a></footer></body></html>';
  const destination = path.join(output, 'history');
  await mkdir(destination, { recursive: true });
  await writeFile(path.join(destination, 'index.html'), html);
  return 1;
}
