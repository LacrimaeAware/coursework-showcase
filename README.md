# Coursework

A browser collection of 33 courses, with projects and writing in separate sections.
The home page groups every course by subject. Each course opens to one contents
list of topics and short explanations; examples appear beneath the relevant topic.
Example readers use the whole course contents for navigation.

## Examples, projects and writing

| Course or work | Contents |
| --- | --- |
| Deep Learning · Spring 2026 | Examples of linear classifiers, backpropagation, convolution, image regression, segmentation, detection and airline forecasting |
| Dealing with Data II · Spring 2026 | R summaries, ANOVA, regression and predictor adjustment, plus the GSS happiness final project |
| Systems biology · Fall 2026 | Enzyme kinetics, inhibition, lac feedback, basins, reaction events and product variability |
| Introduction to Number Theory · Spring 2026 | Eight worked exercises on proof, induction, division, congruences, arithmetic functions and quadratic residues |
| Calculus III · Fall 2025 | Eight worked examples attached to a ten-topic course contents list |
| Programming Concepts · Summer 2025 | Six Python programs using loops, functions, files, dictionaries, inheritance and SQLite |
| Java Programming I · Fall 2025 | Programs using methods, arrays, composition, validation and file output |
| Bitcoin forecasting · Spring 2026 | Deep Learning mini-project comparing sequence models with a zero-return baseline |
| Math Seminar · Spring 2026 | Koch snowflake presentation: perimeter, area, geometric series and boundary dimension |
| Eastern Philosophy · Summer 2023 | Complete original essay body and references from *Limited Terms for Limitless Concepts: Eastern Insight Into Duality* |
| Fundamentals of Speech and Communication · Fall 2023 | *A Fool’s Guide to Tightrope Walking*: complete speech script and references, with a secondary presentation outline |

The all-courses directory lists 33 course records from 2022 through 2026. Every
course links to its own contents, including Anatomy and Physiology, its lab,
chemistry, Spanish, anthropology and philosophy. Topic scope follows retained
syllabi, module lists and course material. The underlying records retain scope and provenance notes.

Examples supplement the topic list. Original assignment and section labels
identify each problem without repeating them in the page header.
Figures and recorded model results come from saved coursework outputs. The
presentation does not rerun the Deep Learning training or the survey models.

## Local preview

Requires Node.js 22 or later. The build uses Node's standard library.

```sh
npm test
python -m http.server 4192 --bind 127.0.0.1 --directory dist
```

Open [the local collection](http://127.0.0.1:4192/).

`npm run build` copies `site/` into the ignored `dist/` folder, generates the
course overview and selected topic pages, and adds `.nojekyll`. `npm run check` checks the built pages' local links and anchors,
relative asset URLs, and source-file checksums. Browser layout and interaction
checks use `node tools/check_browser.mjs` while that server is running. Install
Playwright separately, or point `PLAYWRIGHT_MODULE` to an existing installation.
Browser screenshots and the report go in ignored `tmp/browser-expanded/`.

## Source layout

| Path | Contents |
| --- | --- |
| `site/index.html` | Selected coursework index |
| `content/catalog.json` | Courses, projects and selected writing |
| `content/history.json` | Public course-title and term snapshot, with source hash |
| `content/overviews/*.json` | Summaries, topic maps and source notes for all 33 courses |
| `content/*/course.json` | Course titles, chapter order and source labels |
| `content/<course>/*.html` | Complete chapter body sources |
| `content/projects/`, `content/essays/` | Selected work bodies |
| `site/styles.css`, `site/course-reader.js` | Shared reading layout and chapter controls |
| `site/exercises/enzyme-simulations/` | Earlier links redirected to their course chapters |
| `site/assets/enzyme/` | Original figures, numerical summary, Python sources, and provenance |
| `site/assets/systems-biology/` | Earlier course figures, code, results and source manifests |
| `site/assets/deep-learning/` | Saved notebook figures, code selections and recorded results |
| `site/assets/dealing-with-data/` | Saved analysis outputs, figures, R source and provenance |
| `site/assets/number-theory/` | Selected worked-exercise ledger and source provenance |
| `site/assets/calculus-3/` | Selected worked-note ledger and source provenance |
| `site/assets/programming-concepts/`, `site/assets/java/` | Complete programs, example runs and provenance |
| `site/assets/gss-happiness/`, `site/assets/koch-snowflake/` | Project figures, calculation or model excerpts and provenance |
| `site/assets/bitcoin-forecasting/` | Original Bitcoin model-comparison figure and provenance |
| `site/assets/eastern-philosophy/` | Complete essay text and provenance |
| `site/assets/holism-speech/` | Complete speech text and provenance |
| `site/vendor/mathjax/` | Bundled math renderer and Apache license |
| `site/vendor/fonts/` | Lora and IBM Plex Sans, with Open Font License files |
| `tools/build*.mjs`, `tools/check.mjs` | Static build, course overviews, selected readers, directory and file checks |

All site URLs are relative, so `dist/` can be served under a GitHub Pages
repository path. The source pages live in this repository; the simulation
project maintains the numerical implementations.

The simulation Python scripts use NumPy, SciPy, and Matplotlib. Keep
`compare_enzyme_ode.py` beside `gillespie_demo.py`, and `MM_Heatmap.py` beside
`MM_Surface.py`, when downloading or running them.
Deep Learning source downloads state their framework requirements. The GSS R
download contains model definitions for the prepared analysis data; the page
provides the sample counts and recorded fit statistics.
The selected Java programs compile with a JDK; their examples were run with
OpenJDK 24.0.2. Python foundation programs use Python 3 and the standard library;
their bundle preserves the original relative data-file layout.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` builds and checks the source,
then publishes `dist/` through GitHub Pages when `main` changes.
