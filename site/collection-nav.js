(() => {
  const mainTabs = [...document.querySelectorAll('.section-tabs [role="tab"]')];
  const subjectTabs = [...document.querySelectorAll('.subject-tab')];
  const panels = mainTabs.map(tab => document.getElementById(tab.getAttribute('aria-controls')));
  const groups = subjectTabs.map(tab => document.getElementById(tab.getAttribute('aria-controls')));

  function selectMain(id, updateHistory = false) {
    const index = mainTabs.findIndex(tab => tab.getAttribute('aria-controls') === id);
    const selected = index < 0 ? 0 : index;
    mainTabs.forEach((tab, position) => {
      tab.setAttribute('aria-selected', String(position === selected));
      tab.tabIndex = position === selected ? 0 : -1;
      panels[position].hidden = position !== selected;
    });
    panels[selected].scrollTop = 0;
    if (updateHistory && location.hash !== '#' + panels[selected].id) {
      history.pushState(null, '', '#' + panels[selected].id);
    }
  }

  function selectSubject(index, remember = false) {
    const selected = Number.isInteger(index) && index >= 0 && index < subjectTabs.length ? index : 0;
    subjectTabs.forEach((tab, position) => {
      tab.setAttribute('aria-selected', String(position === selected));
      tab.tabIndex = position === selected ? 0 : -1;
      groups[position].hidden = position !== selected;
    });
    document.getElementById('courses').scrollTop = 0;
    if (remember) {
      try { sessionStorage.setItem('coursework-subject', String(selected)); } catch { /* Browsing still works without storage. */ }
    }
  }

  function arrowKeys(event, tabs) {
    const index = tabs.indexOf(event.target);
    if (index < 0) return;
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    tabs[next].click();
    tabs[next].focus();
  }

  mainTabs.forEach(tab => {
    tab.addEventListener('click', event => {
      event.preventDefault();
      selectMain(tab.getAttribute('aria-controls'), true);
    });
    tab.addEventListener('keydown', event => {
      if (event.key === ' ') { event.preventDefault(); tab.click(); }
      else arrowKeys(event, mainTabs);
    });
  });
  subjectTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectSubject(index, true));
    tab.addEventListener('keydown', event => arrowKeys(event, subjectTabs));
  });
  const fromLocation = () => {
    const id = location.hash.slice(1);
    if (mainTabs.some(tab => tab.getAttribute('aria-controls') === id)) selectMain(id);
  };
  window.addEventListener('popstate', fromLocation);
  window.addEventListener('hashchange', fromLocation);
  let remembered = 0;
  try { remembered = Number(sessionStorage.getItem('coursework-subject')); } catch { /* Use the first subject. */ }
  selectSubject(remembered);
  selectMain('courses');
  fromLocation();
})();
