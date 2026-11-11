import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { loadOverviews } from './build_overviews.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const base = (process.env.SHOWCASE_BASE || 'http://127.0.0.1:4192').replace(/\/$/, '');
const origin = new URL(base).origin;
const output = path.join(root, 'tmp/browser-expanded');
const catalog = JSON.parse(await readFile(path.join(root, 'content/catalog.json'), 'utf8'));
const history = JSON.parse(await readFile(path.join(root, 'content/history.json'), 'utf8'));
const overviewMap = await loadOverviews(root);
const captureList = (value, fallback) => new Set((value === undefined ? fallback : value).split(',').map(value => value.trim()).filter(Boolean));
const captureCourses = captureList(process.env.SHOWCASE_CAPTURE_COURSES, 'deep-learning');
const captureItems = captureList(process.env.SHOWCASE_CAPTURE_ITEMS, 'holism-speech');
const captures = (selection, id) => selection.has('*') || selection.has(id);
const slash = String.fromCharCode(92);
const allViewports = [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 720 }];
const requestedWidths = process.env.SHOWCASE_WIDTHS === undefined ? null : process.env.SHOWCASE_WIDTHS.split(',').map(value => Number(value.trim()));
assert.ok(requestedWidths === null || (requestedWidths.length > 0 && requestedWidths.every(width => allViewports.some(viewport => viewport.width === width))), 'SHOWCASE_WIDTHS must be a nonempty selection of 1440,768,390,320');
const viewports = allViewports.filter(viewport => requestedWidths === null || requestedWidths.includes(viewport.width));
const overviewWidths = viewports.filter(viewport => viewport.width === 1440 || viewport.width === 390).map(viewport => viewport.width);
const homeOnly = process.env.SHOWCASE_HOME_ONLY === '1';
const mainPanels = ['courses', 'projects', 'essays'];

function sourceCounts(html) {
  const source = html.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|textarea|pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const prose = source.replace(/<[^>]+>/g, ' ');
  return {
    mathExpressions: prose.split(slash + '(').length - 1 + prose.split(slash + '[').length - 1,
    headings: (source.match(/<h[2-6]\b/gi) || []).length,
    figures: (source.match(/<figure\b/gi) || []).length,
    images: (source.match(/<img\b/gi) || []).length,
    disclosures: (source.match(/<details\b/gi) || []).length,
    sourceLinks: 0,
    viewports: []
  };
}

const courses = [];
for (const id of catalog.courses) {
  const course = JSON.parse(await readFile(path.join(root, 'content', id, 'course.json'), 'utf8'));
  const chapters = [];
  for (const chapter of course.chapters) {
    const source = await readFile(path.join(root, 'content', id, chapter.slug + '.html'), 'utf8');
    chapters.push({ ...chapter, ...sourceCounts(source) });
  }
  assert.ok(chapters.length > 0, 'Course has no chapters: ' + id);
  courses.push({ ...course, id, chapters });
}
const overviews = history.courses.map(course => ({ ...course, ...overviewMap.get(course.id), viewports: [] }));
const items = [];
for (const item of catalog.items) {
  const source = await readFile(path.join(root, 'content', item.section, item.slug + '.html'), 'utf8');
  items.push({ ...item, ...sourceCounts(source) });
}
const courseURL = course => base + '/courses/' + course.id + '/index.html';
const chapterURL = (course, index) => base + '/courses/' + course.id + '/' + course.chapters[index].slug + '.html';
const itemURL = item => base + '/' + item.section + '/' + item.slug + '/index.html';
const historyURL = base + '/history/index.html';
const topicURL = (course, topic, index, currentSlug) => {
  const slug = (topic.examples || []).some(example => example.slug === currentSlug) ? currentSlug : topic.examples?.[0]?.slug;
  return slug ? base + '/courses/' + course.id + '/' + slug + '.html' : courseURL(course) + '#topic-' + (index + 1);
};
const shouldCapture = width => width === 1440 || width === 390;
const screenName = width => width === 1440 ? 'desktop' : 'phone';

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
for (const id of captureCourses) assert.ok(id === '*' || courses.some(course => course.id === id), 'Unknown screenshot course: ' + id);
for (const id of captureItems) assert.ok(id === '*' || items.some(item => item.slug === id), 'Unknown screenshot work: ' + id);
const errors = [], externalRequests = [], checkedAssets = new Set(), checkedHistoryLinks = new Set();
const report = {
  courses, items, overviews,
  mode: homeOnly ? 'home-only' : 'full', home: { viewports: [], subjects: {}, checkedWorkLinks: [] },
  history: { rows: history.courses.length, years: [...new Set(history.courses.map(course => course.year))].sort((a, b) => a - b), viewports: [], checkedWorkLinks: [] },
  capture: { courses: [...captureCourses], items: [...captureItems] },
  viewports: viewports.map(viewport => viewport.width), checks: [], screenshots: [], checkedAssets: []
};
const page = await browser.newPage({ viewport: viewports[0] });
page.setDefaultTimeout(15000);
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  const url = request.url();
  if (!url.startsWith('data:') && !url.startsWith('blob:') && new URL(url).origin !== origin) externalRequests.push(url);
});

async function finishRendering(math) {
  if (math > 0) {
    await page.waitForFunction(() => window.MathJax?.startup?.promise);
    await page.evaluate(async () => { await window.MathJax.startup.promise; });
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
  });
  assert.equal(await page.locator('mjx-container').count(), math, 'Rendered math count must match content source: ' + page.url());
  assert.equal(await page.locator('mjx-merror,[data-mjx-error]').count(), 0, 'MathJax errors: ' + page.url());
  assert.ok(await page.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), 'Broken or unloaded image: ' + page.url());
  assert.equal(await page.locator('.overview-source,.history-source,.course-archive-link,.history-archive,.course-coverage,.course-jump,.contents-list,.course-entry-chapters,.course-selected-work,#selected-work').count(), 0, 'Retired source/archive or separate example-list UI: ' + page.url());
}

async function noOverflow(label) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal page overflow: ' + label);
}

async function screenshot(filename) {
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: path.join(output, filename), fullPage: true });
  report.screenshots.push(filename);
}

async function checkHome(width) {
  await finishRendering(0);
  assert.equal(await page.locator('h1.sr-only').textContent(), 'Course collection');
  assert.equal(await page.locator('.section-tabs a[role="tab"]').count(), mainPanels.length);
  assert.equal(await page.locator('button.subject-tab[role="tab"]').count(), 4);
  assert.equal(await page.locator('.course-entry').count(), history.courses.length);
  for (const course of history.courses) {
    const entry = page.locator('.course-entry').filter({ has: page.locator('a.course-name[href="courses/' + course.id + '/index.html"]') });
    assert.equal(await entry.count(), 1, 'Home needs one entry for every course: ' + course.id);
    const name = entry.locator('a.course-name');
    assert.equal(await name.count(), 1);
    assert.equal((await name.textContent()).trim(), course.title);
    assert.equal((await entry.locator('.entry-context').textContent()).trim(), course.term + ' ' + course.year);
    assert.equal(new URL(await name.getAttribute('href'), page.url()).href, courseURL(course));
  }
  const workLinks = await page.locator('.work-list-link').evaluateAll(links => links.map(link => ({ title: link.querySelector('h3')?.textContent.trim(), href: link.href })));
  assert.equal(workLinks.length, items.length);
  for (const item of items) {
    assert.equal(workLinks.filter(link => link.title === item.title && link.href === itemURL(item)).length, 1, 'Home needs one work link: ' + item.slug);
  }
  const current = new URL(page.url()).hash.slice(1);
  const selected = await page.locator('.section-tabs [aria-selected="true"]').getAttribute('aria-controls');
  if (mainPanels.includes(current)) assert.equal(selected, current);
  await checkMainPanel(selected, width);
  await noOverflow('home at ' + width + 'px');
}

async function checkMainPanel(active, width) {
  for (const id of mainPanels) {
    const tab = page.locator('#tab-' + id), panel = page.locator('#' + id);
    assert.equal(await tab.getAttribute('role'), 'tab');
    assert.equal(await tab.getAttribute('href'), '#' + id);
    assert.equal(await tab.getAttribute('aria-controls'), id);
    assert.equal(await tab.getAttribute('aria-selected'), String(id === active));
    assert.equal(await tab.getAttribute('tabindex'), id === active ? '0' : '-1');
    assert.equal(await panel.getAttribute('role'), 'tabpanel');
    assert.equal(await panel.getAttribute('aria-labelledby'), 'tab-' + id);
    assert.equal(await panel.evaluate(element => element.hidden), id !== active);
    assert.equal(await panel.isVisible(), id === active);
  }
  for (const heading of await page.locator('h1,h2').all()) {
    const label = (await heading.textContent()).trim();
    if (['Coursework', 'Courses', 'Projects', 'Writing'].includes(label) && !((await heading.getAttribute('class')) || '').split(/\s+/).includes('sr-only')) assert.equal(await heading.isVisible(), false, 'Repeated visible tab heading: ' + label);
  }
  assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), 'Home must scroll its active panel, not the document: ' + width);
  await noOverflow('home ' + active + ' panel at ' + width + 'px');
}

async function checkSubject(active, width) {
  const tabs = page.locator('button.subject-tab[role="tab"]');
  assert.equal(await tabs.count(), 4);
  assert.equal(await page.locator('.course-group').count(), 4);
  for (let index = 0; index < 4; index++) {
    const tab = tabs.nth(index), group = page.locator('#subject-' + index);
    assert.equal(await tab.getAttribute('data-subject-index'), String(index));
    assert.equal(await tab.getAttribute('aria-controls'), 'subject-' + index);
    assert.equal(await tab.getAttribute('aria-selected'), String(index === active));
    assert.equal(await tab.getAttribute('tabindex'), index === active ? '0' : '-1');
    assert.equal(await group.evaluate(element => element.hidden), index !== active);
    assert.equal(await group.isVisible(), index === active);
  }
  await checkMainPanel('courses', width);
}

async function activateMain(id, width) {
  await page.locator('#tab-' + id).click();
  await page.waitForFunction(expected => location.hash === '#' + expected, id);
  await checkMainPanel(id, width);
  assert.equal(await page.locator('#' + id).evaluate(element => element.scrollTop), 0, 'Switching main panels must reset their scroll');
}

async function checkHomeTabs(width) {
  await checkHome(width);
  await checkSubject(0, width);
  const seenCourses = new Set();
  const subjects = page.locator('button.subject-tab[role="tab"]');
  const subjectCounts = [];
  for (let index = 0; index < 4; index++) {
    await subjects.nth(index).click();
    await checkSubject(index, width);
    assert.equal(await page.locator('#courses').evaluate(element => element.scrollTop), 0, 'Switching subjects must reset the Courses panel scroll');
    const links = await page.locator('#subject-' + index + ' .course-name').evaluateAll(anchors => anchors.map(anchor => anchor.href));
    assert.ok(links.length > 0, 'Every subject needs courses');
    assert.equal(await page.locator('.course-entry:visible').count(), links.length);
    for (const href of links) {
      assert.ok(!seenCourses.has(href), 'Course repeated across subject panels: ' + href);
      seenCourses.add(href);
    }
    subjectCounts.push(links.length);
    if (shouldCapture(width)) await screenshot('home-subject-' + index + '-' + screenName(width) + '.png');
    await page.locator('#courses').evaluate(element => { element.scrollTop = Math.min(120, element.scrollHeight - element.clientHeight); });
  }
  assert.deepEqual([...seenCourses].sort(), history.courses.map(courseURL).sort(), 'Switching subjects must expose every course');
  report.home.subjects[width] = subjectCounts;

  await subjects.first().focus();
  await page.keyboard.press('Home');
  await checkSubject(0, width);
  for (const [key, expected] of [['ArrowRight', 1], ['ArrowLeft', 0], ['End', 3], ['ArrowRight', 0], ['ArrowLeft', 3], ['Home', 0]]) {
    await page.keyboard.press(key);
    await checkSubject(expected, width);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-subject-index')), String(expected));
  }
  await subjects.nth(1).click();
  await page.reload({ waitUntil: 'networkidle' });
  await checkSubject(1, width);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('coursework-subject')), '1', 'Subject choice must survive a reload');
  await subjects.first().click();

  await page.locator('#tab-courses').focus();
  for (const [key, expected] of [['ArrowRight', 'projects'], ['ArrowRight', 'essays'], ['ArrowRight', 'courses'], ['ArrowLeft', 'essays'], ['Home', 'courses'], ['End', 'essays']]) {
    await page.keyboard.press(key);
    await checkMainPanel(expected, width);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'tab-' + expected);
  }
  await page.locator('#tab-projects').focus();
  await page.keyboard.press('Space');
  await checkMainPanel('projects', width);

  for (const id of ['projects', 'essays']) {
    await activateMain(id, width);
    const sectionItems = items.filter(item => item.section === id);
    const links = page.locator('#' + id + ' .work-list-link');
    assert.equal(await links.count(), sectionItems.length);
    for (const [index, item] of sectionItems.entries()) {
      const link = links.nth(index);
      assert.ok(await link.isVisible(), 'Work must be visible in its active panel: ' + item.slug);
      assert.equal(new URL(await link.getAttribute('href'), page.url()).href, itemURL(item));
      if (!report.home.checkedWorkLinks.includes(itemURL(item))) {
        const response = await page.request.get(itemURL(item));
        assert.equal(response.status(), 200, 'Work response: ' + item.slug);
        assert.ok((await response.body()).length > 0);
        report.home.checkedWorkLinks.push(itemURL(item));
      }
    }
    const skip = page.getByRole('link', { name: 'Skip to collection', exact: true });
    await skip.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.hash === '#content');
    await checkMainPanel(id, width);
    assert.equal(await page.locator('#content').getAttribute('tabindex'), '-1');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'content', 'Skip link must focus the active collection without changing its section');
    await activateMain(id, width);
    if (shouldCapture(width)) await screenshot('home-' + id + '-' + screenName(width) + '.png');
    await links.first().click();
    await page.waitForURL(itemURL(sectionItems[0]));
    await page.goBack({ waitUntil: 'networkidle' });
    await checkMainPanel(id, width);
  }

  for (const id of ['projects', 'essays']) {
    await page.goto(base + '/index.html#' + id, { waitUntil: 'networkidle' });
    await checkMainPanel(id, width);
    await page.reload({ waitUntil: 'networkidle' });
    await checkMainPanel(id, width);
  }
  await page.goto(base + '/index.html#courses', { waitUntil: 'networkidle' });
  await activateMain('projects', width);
  await activateMain('essays', width);
  await page.goBack();
  await page.waitForFunction(() => location.hash === '#projects');
  await checkMainPanel('projects', width);
  await page.goBack();
  await page.waitForFunction(() => location.hash === '#courses');
  await checkMainPanel('courses', width);
  await activateMain('projects', width);
  const firstProject = items.find(item => item.section === 'projects');
  await page.locator('#projects .work-list-link').first().click();
  await page.waitForURL(itemURL(firstProject));
  await page.locator('.site-header').getByRole('link', { name: 'Courses', exact: true }).click();
  await checkMainPanel('courses', width);
  await checkSubject(0, width);
  report.home.viewports.push(width);
}

async function checkHistory(width) {
  await finishRendering(0);
  assert.equal(await page.locator('h1').innerText(), 'All courses');
  const rows = page.locator('[data-history-course]');
  const expected = [...history.courses].sort((a, b) => a.year - b.year);
  assert.equal(await rows.count(), expected.length, 'History course count must match source catalog');
  assert.deepEqual(await rows.evaluateAll(elements => elements.map(element => element.dataset.historyCourse)), expected.map(course => course.id));
  for (const [index, course] of expected.entries()) {
    const row = rows.nth(index);
    assert.equal(await row.locator('.history-course-title').innerText(), course.title);
    const overviewLink = row.locator('.history-course-title a');
    assert.equal(await overviewLink.count(), 1, 'Every course title must open its overview: ' + course.id);
    assert.equal(new URL(await overviewLink.getAttribute('href'), page.url()).href, courseURL(course));
    assert.equal(await row.locator('th').innerText(), course.term);
    assert.equal(await row.locator('small').innerText(), course.code + ' · ' + course.school);
    if (catalog.courses.includes(course.id)) {
      assert.equal(await row.locator('.history-work').count(), 0, 'Course contents must not be repeated as selected work: ' + course.id);
    }
  }
  const workLinks = await page.locator('.history-work').evaluateAll(links => links.map(link => link.href));
  for (const url of workLinks) {
    assert.equal(new URL(url).origin, origin, 'History work must remain inside the collection');
    if (checkedHistoryLinks.has(url)) continue;
    const response = await page.request.get(url);
    assert.equal(response.status(), 200, 'History work response: ' + url);
    assert.ok((await response.body()).length > 0, 'Empty history work: ' + url);
    checkedHistoryLinks.add(url);
    report.history.checkedWorkLinks.push(new URL(url).pathname);
  }
  const years = report.history.years;
  const jumps = page.locator('.history-years a');
  assert.equal(await jumps.count(), years.length);
  for (const [index, year] of years.entries()) {
    const target = '#year-' + year;
    assert.equal(await jumps.nth(index).getAttribute('href'), target);
    assert.equal(await jumps.nth(index).innerText(), String(year));
    assert.equal(await page.locator(target).count(), 1);
    assert.equal(await page.locator(target + ' [data-history-course]').count(), history.courses.filter(course => course.year === year).length);
    await jumps.nth(index).click();
    await page.waitForURL(historyURL + target);
    await noOverflow('history year navigation at ' + width + 'px');
  }
  report.history.viewports.push(width);
  await noOverflow('course history at ' + width + 'px');
}

async function checkOverview(course, width) {
  await finishRendering(0);
  const featured = courses.find(selected => selected.id === course.id);
  assert.equal(await page.locator('h1').innerText(), featured?.title || course.title);
  const overview = page.locator('.course-overview');
  assert.equal(await overview.count(), 1, 'One course overview: ' + course.id);
  assert.ok(await overview.isVisible(), 'Course overview must be visible: ' + course.id);
  const heading = overview.getByRole('heading', { name: 'Contents', exact: true });
  assert.equal(await heading.count(), 1);
  assert.ok(await heading.isVisible(), 'Course overview heading must be visible: ' + course.id);
  assert.equal(await overview.locator('ol.course-topics').count(), 1);
  const rows = overview.locator('li.topic-row');
  assert.equal(await rows.count(), course.topics.length);
  assert.deepEqual(await rows.locator('h3').allTextContents(), course.topics.map(topic => topic.title));
  const normalize = text => text.replace(/\s+/g, ' ').trim();
  for (const [index, topic] of course.topics.entries()) {
    const row = rows.nth(index);
    assert.equal(await row.getAttribute('id'), 'topic-' + (index + 1));
    assert.ok(await row.locator('h3').isVisible(), 'Hidden topic heading: ' + course.id + ' / ' + topic.title);
    assert.equal(normalize(await row.locator('.topic-description').innerText()), normalize(topic.description));
    const examples = row.locator('.topic-examples a[data-example]');
    assert.equal(await examples.count(), (topic.examples || []).length);
    for (const [exampleIndex, example] of (topic.examples || []).entries()) {
      const link = examples.nth(exampleIndex);
      assert.equal(await link.innerText(), example.label);
      assert.equal(new URL(await link.getAttribute('href'), page.url()).href, base + '/courses/' + course.id + '/' + example.slug + '.html');
    }
    const projects = row.locator('a[data-project]');
    assert.equal(await projects.count(), (topic.projects || []).length);
    for (const [projectIndex, slug] of (topic.projects || []).entries()) {
      const item = items.find(item => item.slug === slug);
      assert.ok(item, 'Unknown topic project: ' + slug);
      assert.equal(new URL(await projects.nth(projectIndex).getAttribute('href'), page.url()).href, itemURL(item));
    }
  }
  assert.equal(await page.locator('.course-intro').count(), 1);
  assert.equal(normalize(await page.locator('.course-intro').innerText()), normalize(course.summary));
  if (!course.viewports.includes(width)) course.viewports.push(width);
  await noOverflow(course.id + ' overview at ' + width + 'px');
}

async function checkContents(course, width) {
  await checkOverview(overviews.find(overview => overview.id === course.id), width);
  const links = await page.locator('.topic-examples a[data-example]').evaluateAll(anchors => anchors.map(anchor => anchor.href));
  const expected = course.chapters.map((chapter, index) => chapterURL(course, index));
  assert.deepEqual([...new Set(links)].sort(), [...expected].sort(), 'Every example must be reachable from course contents: ' + course.id);
  assert.equal(await page.locator('details[open]').count(), 0);
  await noOverflow(course.id + ' contents at ' + width + 'px');
}

async function checkAssets(record) {
  const links = await page.locator('.chapter-body a[href]').evaluateAll(anchors => anchors
    .filter(anchor => anchor.hasAttribute('download') || /\.(py|m|r|java|zip|json|csv|txt|ipynb|pdf|rtf|html?)([?#]|$)/i.test(anchor.getAttribute('href')))
    .map(anchor => anchor.href));
  const local = [...new Set(links.filter(href => new URL(href).origin === origin && new URL(href).pathname.includes('/assets/')))];
  record.sourceLinks = local.length;
  if (record.section !== 'essays' && (!record.format || record.format === 'default')) {
    assert.ok(local.length > 0, 'Missing source/result asset: ' + record.slug);
  }
  for (const url of local) {
    if (checkedAssets.has(url)) continue;
    const response = await page.request.get(url);
    assert.equal(response.status(), 200, 'Source/download response: ' + url);
    assert.ok((await response.body()).length > 0, 'Empty source/download: ' + url);
    checkedAssets.add(url);
    report.checkedAssets.push(new URL(url).pathname);
  }
}

async function checkBody(record, width) {
  await finishRendering(record.mathExpressions);
  assert.equal(await page.locator('.chapter-body').count(), 1);
  assert.equal(await page.locator('.chapter-body :is(h2,h3,h4,h5,h6)').count(), record.headings, 'Heading count: ' + record.slug);
  assert.ok(await page.locator('.chapter-body :is(h2,h3,h4,h5,h6)').evaluateAll(headings => headings.every(heading => heading.textContent.trim().length > 0)), 'Empty heading: ' + record.slug);
  assert.equal(await page.locator('.chapter-body figure').count(), record.figures, 'Figure count: ' + record.slug);
  assert.equal(await page.locator('.chapter-body img').count(), record.images, 'Image count: ' + record.slug);
  assert.equal(await page.locator('.chapter-body details').count(), record.disclosures, 'Disclosure count: ' + record.slug);
  assert.equal(await page.locator('details[open]').count(), 0, 'Disclosures must start closed: ' + record.slug);
  if (width === 1440) await checkAssets(record);
  await noOverflow(width + 'px ' + record.slug);
  if (!record.viewports.includes(width)) record.viewports.push(width);
}

async function checkChapter(course, index, width) {
  const chapter = course.chapters[index];
  await checkBody(chapter, width);
  assert.equal(await page.locator('.book-title h1').innerText(), chapter.title);
  if (chapter.format === 'proof') {
    assert.equal(await page.locator('.book-title .chapter-record,.book-title .chapter-summary').count(), 0, 'Proof header must not repeat its problem context');
  }
  if (!chapter.format || chapter.format === 'default') assert.ok(chapter.figures > 0, 'Missing figure: ' + course.id + '/' + chapter.slug);
  const topics = overviewMap.get(course.id).topics;
  for (const navigation of ['.book-sidebar', '.book-mobile-bar']) {
    const links = page.locator(navigation + ' .book-chapters a');
    assert.equal(await links.count(), topics.length);
    for (const [navIndex, topic] of topics.entries()) {
      assert.equal(new URL(await links.nth(navIndex).getAttribute('href'), page.url()).href, topicURL(course, topic, navIndex, chapter.slug));
      assert.equal((await links.nth(navIndex).locator(':scope > span:not(.chapter-number)').textContent()).trim(), topic.title);
      assert.equal((await links.nth(navIndex).locator('.chapter-number').textContent()).trim(), String(navIndex + 1));
    }
    const current = page.locator(navigation + ' a[aria-current="page"]');
    assert.equal(await current.count(), 1);
    assert.equal(new URL(await current.getAttribute('href'), page.url()).href, chapterURL(course, index));
  }
  assert.equal(await page.locator('[data-reader-prev]').count(), index > 0 ? 1 : 0);
  assert.equal(await page.locator('[data-reader-next]').count(), index < course.chapters.length - 1 ? 1 : 0);
  if (index > 0) assert.equal(new URL(await page.locator('[data-reader-prev]').getAttribute('href'), page.url()).href, chapterURL(course, index - 1));
  if (index < course.chapters.length - 1) assert.equal(new URL(await page.locator('[data-reader-next]').getAttribute('href'), page.url()).href, chapterURL(course, index + 1));
  assert.equal(await page.locator('.book-sidebar').isVisible(), width > 720);
  assert.equal(await page.locator('.book-mobile-bar').isVisible(), width <= 720);
}

async function checkSpeech() {
  const script = page.locator('#speech-script');
  assert.equal(await script.count(), 1, 'Full speech must be present on the page');
  assert.ok(await script.isVisible(), 'Full speech must be readable without opening a disclosure');
  const paragraphs = script.locator('p[data-source-paragraph]');
  assert.deepEqual(await paragraphs.evaluateAll(elements => elements.map(element => Number(element.dataset.sourceParagraph))), [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12]);
  assert.equal(await script.locator('p[data-source-paragraph]:not(.essay-references)').count(), 6, 'Six delivered speech paragraphs');
  assert.equal(await script.locator('p.essay-references').count(), 5, 'Five complete references');
  assert.equal(await page.locator('a[href*="selected-passages-and-outline"]').count(), 0, 'Retired selected-passages download');
  const read = page.getByRole('link', { name: 'Read the full speech', exact: true });
  assert.equal(await read.count(), 1);
  assert.equal(await read.getAttribute('href'), '#speech-script');
  await read.click();
  await page.waitForURL(itemURL({ section: 'essays', slug: 'holism-speech' }) + '#speech-script');
}

async function checkDisclosures(record, width) {
  const details = page.locator('.chapter-body details');
  if (await details.count()) {
    const first = details.first();
    await first.locator(':scope > summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await first.getAttribute('open'), '');
    await page.keyboard.press('Enter');
    assert.equal(await first.getAttribute('open'), null);
  }
  await details.evaluateAll(elements => elements.forEach(detail => { detail.open = true; }));
  await noOverflow('expanded disclosures, ' + width + 'px ' + record.slug);
  assert.equal(await page.locator('mjx-merror,[data-mjx-error]').count(), 0);
  await details.evaluateAll(elements => elements.forEach(detail => { detail.open = false; }));
}

async function checkKeyboard(course) {
  if (course.chapters.length > 1) {
    let index = Math.min(2, course.chapters.length - 2);
    const topicIndex = overviewMap.get(course.id).topics.findIndex(topic => (topic.examples || []).some(example => example.slug === course.chapters[index].slug));
    assert.ok(topicIndex >= 0, 'Reader must have a parent topic: ' + course.id);
    const link = page.locator('.book-sidebar .book-chapters a').nth(topicIndex);
    const target = new URL(await link.getAttribute('href'), page.url()).href;
    index = course.chapters.findIndex((chapter, candidate) => chapterURL(course, candidate) === target);
    assert.ok(index >= 0, 'Topic sidebar must open an associated example: ' + course.id);
    await link.click();
    await page.waitForURL(chapterURL(course, index));
    await page.evaluate(() => document.activeElement?.blur());
    const forward = index < course.chapters.length - 1;
    const adjacent = index + (forward ? 1 : -1);
    await page.keyboard.press(forward ? 'ArrowRight' : 'ArrowLeft');
    await page.waitForURL(chapterURL(course, adjacent));
    await page.keyboard.press(forward ? 'ArrowLeft' : 'ArrowRight');
    await page.waitForURL(chapterURL(course, index));
    await page.locator(forward ? '[data-reader-next]' : '[data-reader-prev]').click();
    await page.waitForURL(chapterURL(course, adjacent));
    await page.locator(forward ? '[data-reader-prev]' : '[data-reader-next]').click();
    await page.waitForURL(chapterURL(course, index));
  }
  await page.goto(chapterURL(course, 0), { waitUntil: 'networkidle' });
  await page.keyboard.press('ArrowLeft');
  assert.equal(page.url(), chapterURL(course, 0));
  await page.goto(chapterURL(course, course.chapters.length - 1), { waitUntil: 'networkidle' });
  await page.keyboard.press('ArrowRight');
  assert.equal(page.url(), chapterURL(course, course.chapters.length - 1));
}

async function checkMobileMenu(course, width) {
  const menu = page.locator('.book-mobile-bar details');
  assert.equal(await menu.getAttribute('open'), null);
  await menu.locator(':scope > summary').focus();
  await page.keyboard.press('Enter');
  assert.equal(await menu.getAttribute('open'), '');
  const links = menu.locator('.book-chapters a');
  const topics = overviewMap.get(course.id).topics;
  const currentSlug = course.chapters.find((chapter, index) => new URL(page.url()).pathname === new URL(chapterURL(course, index)).pathname)?.slug;
  assert.ok(currentSlug, 'Mobile menu must be checked on a reader page');
  assert.equal(await links.count(), topics.length);
  for (const [index, topic] of topics.entries()) {
    assert.equal(new URL(await links.nth(index).getAttribute('href'), page.url()).href, topicURL(course, topic, index, currentSlug));
  }
  await noOverflow(course.id + ' open chapter menu at ' + width + 'px');
  const linkedTopic = topics.findIndex(topic => topic.examples?.length);
  assert.ok(linkedTopic >= 0, 'Reader course needs a linked example');
  const target = new URL(await links.nth(linkedTopic).getAttribute('href'), page.url()).href;
  await links.nth(linkedTopic).click();
  await page.waitForURL(target);
  assert.equal(await page.locator('.book-mobile-bar details').getAttribute('open'), null);
}

try {
  if (homeOnly) {
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto(base + '/index.html', { waitUntil: 'networkidle' });
      await page.evaluate(() => sessionStorage.removeItem('coursework-subject'));
      await page.reload({ waitUntil: 'networkidle' });
      await checkHomeTabs(viewport.width);
    }
    assert.deepEqual(errors, [], 'Browser errors');
    assert.deepEqual(externalRequests, [], 'External runtime requests');
    report.browserErrors = errors;
    report.externalRequests = externalRequests;
    report.checks.push('All three main tabs and all four subject tabs: visibility, aria controls and selection, roving tabindex, keyboard arrows/Home/End/Space, subject persistence and panel-only scrolling');
    report.checks.push('All course links exposed by subject switching; project/writing links and HTTP responses, hash deep links and reloads, browser Back, and return through a child-page Courses header');
    await writeFile(path.join(output, 'home-tabs-report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('PASS: home tabs at ' + report.home.viewports.join('/') + 'px; ' + history.courses.length + ' courses across four subjects, ' + items.length + ' project/writing links; keyboard, hashes, reloads, Back, child header returns, panel scrolling; ' + report.screenshots.length + ' screenshots; zero browser errors or external requests.');
  } else {
  for (const viewport of viewports) {
    const width = viewport.width;
    await page.setViewportSize(viewport);
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    await checkHome(width);
    if (shouldCapture(width)) await screenshot('home-' + screenName(width) + '.png');
    await page.goto(historyURL, { waitUntil: 'networkidle' });
    await checkHistory(width);
    if (shouldCapture(width)) await screenshot('history-' + screenName(width) + '.png');
    await page.getByRole('link', { name: 'All coursework', exact: true }).click();
    await checkHome(width);
    if (width === 1440 || width === 390) {
      for (const course of overviews) {
        const response = await page.goto(courseURL(course), { waitUntil: 'networkidle' });
        assert.equal(response.status(), 200, 'Course overview response: ' + course.id);
        await checkOverview(course, width);
        if (course.id === 'anatomy') await screenshot('anatomy-overview-' + screenName(width) + '.png');
      }
    }
    for (const course of courses) {
      if (width === 1440) {
        await page.goto(base + '/', { waitUntil: 'networkidle' });
        const link = page.locator('.course-entry a.course-name[href="courses/' + course.id + '/index.html"]');
        const group = await link.evaluate(anchor => anchor.closest('.course-group').id);
        await page.locator('.subject-tab[aria-controls="' + group + '"]').click();
        await link.click();
        await page.waitForURL(courseURL(course));
      } else await page.goto(courseURL(course), { waitUntil: 'networkidle' });
      await checkContents(course, width);
      if (captures(captureCourses, course.id) && shouldCapture(width)) await screenshot(course.id + '-contents-' + screenName(width) + '.png');
      await page.locator('.topic-examples a[data-example][href="' + course.chapters[0].slug + '.html"]').first().click();
      for (let index = 0; index < course.chapters.length; index++) {
        await page.waitForURL(chapterURL(course, index));
        await checkChapter(course, index, width);
        if (captures(captureCourses, course.id) && shouldCapture(width)) await screenshot(course.id + '-' + course.chapters[index].slug + '-' + screenName(width) + '.png');
        await checkDisclosures(course.chapters[index], width);
        if (index < course.chapters.length - 1) await page.locator('[data-reader-next]').click();
      }
      if (width === 1440) await checkKeyboard(course);
      if (width <= 720) await checkMobileMenu(course, width);
      if (width === 320) {
        const index = Math.min(3, course.chapters.length - 1);
        await page.goto(chapterURL(course, index), { waitUntil: 'networkidle' });
        await checkChapter(course, index, width);
        await page.reload({ waitUntil: 'networkidle' });
        await checkChapter(course, index, width);
        await page.getByRole('link', { name: 'All coursework', exact: true }).click();
        await checkHome(width);
      }
    }
    for (const item of items) {
      await page.goto(itemURL(item), { waitUntil: 'networkidle' });
      await checkBody(item, width);
      assert.equal(await page.locator('.work-title h1').innerText(), item.title);
      assert.equal(await page.locator('.work-title .study-context').innerText(), item.context);
      if (item.slug === 'holism-speech') await checkSpeech();
      if (captures(captureItems, item.slug) && shouldCapture(width)) await screenshot(item.slug + '-' + screenName(width) + '.png');
      await checkDisclosures(item, width);
      if (width === 1440) {
        await page.getByRole('link', { name: 'All coursework', exact: true }).click();
        await checkHome(width);
      }
    }
  }
  report.checks.push('Home lists every course with its own Contents link; every topic, associated example and project matches course data, and all example pages remain reachable');
  report.checks.push('Every reader sidebar and mobile menu follows the complete course topic list, including topics without examples; current markers, topic numbers, Previous/Next links, ArrowLeft/ArrowRight, boundaries, direct URLs and reloads');
  report.checks.push('All selected works: exact title/context, local source/download responses, return to coursework, default and expanded-disclosure overflow');
  if (overviewWidths.length) report.checks.push('Every course has source-matched Contents, visible topic headings and descriptions, and summary at ' + overviewWidths.join('/') + 'px, without horizontal overflow or retired source/archive UI');
  report.checks.push('Complete All courses index: source-matched rows, terms and course codes, every title linking its own Contents, individual work HTTP responses, every year anchor and return navigation at ' + report.viewports.join('/') + 'px');
  report.checks.push('Full Speech: six delivered paragraphs, five references, readable on-page script and working Read the full speech anchor; no selected-passages download');

  const biology = courses.find(course => course.id === 'systems-biology');
  assert.ok(biology, 'Legacy biology redirect requires its catalog course');
  for (const [fragment, slug] of [['trajectories', '05-stochastic-reactions'], ['model', '05-stochastic-reactions'], ['variability', '06-product-variability']]) {
    const index = biology.chapters.findIndex(chapter => chapter.slug === slug);
    assert.ok(index >= 0, 'Missing legacy redirect chapter: ' + slug);
    await page.goto(base + '/exercises/enzyme-simulations/index.html#' + fragment, { waitUntil: 'networkidle' });
    await page.waitForURL(chapterURL(biology, index) + (fragment === 'model' ? '#model' : ''));
    await checkChapter(biology, index, viewports.at(-1).width);
  }
  report.checks.push('Legacy enzyme trajectories, model and variability fragments resolve to the appropriate biology chapters');

  assert.deepEqual(errors, [], 'Browser errors');
  assert.deepEqual(externalRequests, [], 'External runtime requests');
  report.browserErrors = errors;
  report.externalRequests = externalRequests;
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  const chapters = courses.flatMap(course => course.chapters);
  const mathTotal = [...chapters, ...items].reduce((sum, record) => sum + record.mathExpressions, 0);
  console.log('PASS: ' + (overviewWidths.length ? overviews.length + ' course Contents at ' + overviewWidths.join('/') + 'px, ' : '') + courses.length + ' deeper course readers, ' + chapters.length + ' chapters, ' + items.length + ' selected works, ' + history.courses.length + ' history rows, ' + mathTotal + ' source-derived math expressions; ' + report.viewports.join('/') + 'px; navigation, applicable figures/downloads, full speech, all-course links, expanded disclosures and legacy redirects; ' + report.screenshots.length + ' screenshots; zero browser errors or external requests.');
  }
} finally { await browser.close(); }
