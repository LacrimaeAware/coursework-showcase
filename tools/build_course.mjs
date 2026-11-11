import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadOverviews, renderOverview } from './build_overviews.mjs';
const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const coverageLine = value => value ? '<p class="course-coverage">' + escape(value) + '</p>' : '';
const safeId = value => {
  if (!/^[a-z0-9-]+$/.test(value)) throw new Error("Invalid content identifier");
  return value;
};
const head = (title, math = true) => '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + escape(title) + ' | Coursework</title><link rel="stylesheet" href="../../styles.css">' + (math ? '<script defer src="../../vendor/mathjax/tex-svg.js"></script>' : '') + '<script defer src="../../course-reader.js"></script></head>';
const footer = context => '<footer class="site-footer"><a href="../../index.html">All coursework</a><p>' + escape(context) + '</p></footer></body></html>';

export async function buildCourse(root, output) {
  const catalog = JSON.parse(await readFile(path.join(root, "content/catalog.json"), "utf8"));
  const overviews = await loadOverviews(root);
  let count = 0;
  const courses = [];
  for (const rawId of catalog.courses) {
    const id = safeId(rawId);
    const content = path.join(root, "content", id);
    const course = JSON.parse(await readFile(path.join(content, "course.json"), "utf8"));
    const chapterCount = course.chapters.length;
    if (!chapterCount) throw new Error("Course has no chapters: " + id);
    courses.push({ id, ...course });
    const destination = path.join(output, "courses", id);
    await mkdir(destination, { recursive: true });
    const chapterLink = chapter => safeId(chapter.slug) + ".html";
    const navigation = current => '<nav class="book-chapters" aria-label="Course topics">' + course.chapters.map((chapter, index) => '<a href="' + chapterLink(chapter) + '"' + (current === index ? ' aria-current="page"' : '') + '><span class="chapter-number">' + (index + 1) + '</span><span>' + escape(chapter.shortTitle) + '</span></a>').join("") + '</nav>';
    const context = course.shortTitle + " · " + course.term;
    const overview = overviews.get(id);
    const finalProject = course.finalProject ? '<h2>Final project</h2><p><a href="' + escape(course.finalProject.href) + '">' + escape(course.finalProject.title) + '</a></p>' : '';
    const rows = course.chapters.map((chapter, index) => '<li><a class="contents-row" href="' + chapterLink(chapter) + '"><span class="contents-number">' + (index + 1) + '</span><div><h3>' + escape(chapter.title) + '</h3><p>' + escape(chapter.summary) + '</p><small>' + escape(chapter.record) + '</small></div><svg aria-hidden="true" viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m7 4 6 6-6 6"/></svg></a></li>').join("\n");
    await writeFile(path.join(destination, "index.html"), head(course.title, false) + '<body class="course-contents-page"><a class="skip-link" href="#content">Skip to course overview</a><header class="site-header collection-header"><a class="wordmark" href="../../index.html">Coursework</a><a href="../../history/index.html">All courses</a></header><main id="content" class="course-contents"><h1>' + escape(course.title) + '</h1><p class="study-context">' + escape(course.term) + '</p><p class="course-intro">' + escape(overview.summary) + '</p><p class="course-jump"><a href="#selected-work">' + chapterCount + ' selected topic groups with worked examples</a></p>' + renderOverview(overview) + '<section id="selected-work" class="course-selected-work"><h2>Selected coursework</h2>' + coverageLine(course.coverage) + '<p>' + escape(course.intro) + '</p><ol class="contents-list">' + rows + '</ol>' + finalProject + '</section>' + '</main>' + footer(context));
    count++;
    for (const [index, chapter] of course.chapters.entries()) {
      const body = await readFile(path.join(content, safeId(chapter.slug) + ".html"), "utf8");
      const previous = course.chapters[index - 1], next = course.chapters[index + 1];
      const contentsLink = '<a href="index.html"><small>Course contents</small><span>All ' + chapterCount + ' topics</span></a>';
      const paging = '<nav class="book-paging" aria-label="Topic navigation">' + (previous ? '<a rel="prev" data-reader-prev href="' + chapterLink(previous) + '"><small>Previous topic</small><span>' + escape(previous.shortTitle) + '</span></a>' : contentsLink) + (next ? '<a rel="next" data-reader-next href="' + chapterLink(next) + '"><small>Next topic</small><span>' + escape(next.shortTitle) + '</span></a>' : contentsLink) + '</nav>';
      const shell = head(chapter.title) + '<body class="book-page"><a class="skip-link" href="#content">Skip to topic</a><aside class="book-sidebar"><a class="wordmark" href="../../index.html">Coursework</a><a class="book-course" href="index.html">' + escape(course.shortTitle) + '</a>' + navigation(index) + '<a class="book-contents-link" href="index.html">Course contents</a></aside><div class="book-mobile-bar"><a href="index.html">' + escape(course.shortTitle) + '</a><details><summary>Topics</summary>' + navigation(index) + '</details></div><main class="book-main" id="content"><header class="book-title"><h1><span class="title-number">' + (index + 1) + '.</span> ' + escape(chapter.title) + '</h1><p class="chapter-record">' + escape(chapter.record) + '</p><p class="chapter-summary">' + escape(chapter.summary) + '</p></header><article class="chapter-body">' + body + '</article>' + paging + '</main>' + footer(context);
      await writeFile(path.join(destination, chapterLink(chapter)), shell);
      count++;
    }
  }
  for (const item of catalog.items) {
    const section = safeId(item.section), slug = safeId(item.slug);
    const body = await readFile(path.join(root, "content", section, slug + ".html"), "utf8");
    const destination = path.join(output, section, slug);
    await mkdir(destination, { recursive: true });
    const label = item.kind === "speech" ? "Speech" : section === "essays" ? "Essay" : "Project";
    const html = head(item.title, body.includes("\\(") || body.includes("\\[")) + '<body class="work-page"><a class="skip-link" href="#content">Skip to ' + label.toLowerCase() + '</a><header class="site-header collection-header"><a class="wordmark" href="../../index.html">Coursework</a><a href="../../index.html#' + section + '">' + (section === "essays" ? "Writing" : "Projects") + '</a></header><main id="content" class="work-main"><header class="work-title"><h1>' + escape(item.title) + '</h1><p class="study-context">' + escape(item.context) + '</p></header><article class="chapter-body work-prose">' + body + '</article></main>' + footer(item.context);
    await writeFile(path.join(destination, "index.html"), html);
    count++;
  }
  const homePath = path.join(output, "index.html");
  let home = await readFile(homePath, "utf8");
  const courseEntries = courses.map(course => '<article class="course-entry"><div class="course-entry-heading"><h3><a href="courses/' + course.id + '/index.html">' + escape(course.title) + '</a></h3><p class="entry-context">' + escape(course.term) + ' · ' + course.chapters.length + ' selected topics</p>' + coverageLine(course.coverage) + '<a class="text-link" href="courses/' + course.id + '/index.html">Open course contents</a></div><ol class="course-entry-chapters">' + course.chapters.map(chapter => '<li><a href="courses/' + course.id + '/' + chapter.slug + '.html">' + escape(chapter.shortTitle) + '</a></li>').join("") + '</ol></article>').join("\n");
  const entries = section => catalog.items.filter(item => item.section === section).map(item => '<li><a class="work-list-link" href="' + section + '/' + item.slug + '/index.html"><h3>' + escape(item.title) + '</h3><p class="entry-context">' + escape(item.context) + '</p><p>' + escape(item.summary) + '</p><span class="text-link">' + escape(item.readLabel || ('Read ' + (section === "essays" ? "essay" : "project"))) + '</span></a></li>').join("\n");
  home = home.replace("<!-- COURSE_ENTRIES -->", courseEntries).replace("<!-- PROJECT_ENTRIES -->", entries("projects")).replace("<!-- ESSAY_ENTRIES -->", entries("essays"));
  await writeFile(homePath, home);
  return count;
}
