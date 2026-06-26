let selectedSuggestionIndex = -1;

function pageUrl(slug) {
  if (WIKI_URL_STYLE === 'dir') {
    return WIKI_BASE_URL + '/' + (slug ? slug + '/' : '');
  }
  return WIKI_BASE_URL + '/' + (slug ? slug + '.html' : 'index.html');
}

function switchTab(viewName) {
  document.querySelectorAll('.vector-tabs li').forEach(function(li) {
    li.classList.remove('selected');
  });
  var tabId = 'ca-read';
  if (viewName === 'talk') tabId = 'ca-talk';
  else if (viewName === 'source') tabId = 'ca-source';
  else if (viewName === 'metadata') tabId = 'ca-metadata';
  var tabEl = document.getElementById(tabId);
  if (tabEl) tabEl.classList.add('selected');
  document.querySelectorAll('.wiki-view-pane').forEach(function(pane) {
    pane.style.display = 'none';
  });
  var paneEl = document.getElementById('view-' + viewName + '-content');
  if (paneEl) paneEl.style.display = 'block';
  if (viewName === 'talk') loadTalkNotes();
}

function loadTalkNotes() {
  var area = document.getElementById('talkNotesArea');
  if (!area) return;
  var saved = localStorage.getItem('wiki_notes_' + CURRENT_SLUG);
  area.value = saved || '';
  updateCharCount();
}

function saveTalkNotes() {
  var area = document.getElementById('talkNotesArea');
  if (!area) return;
  localStorage.setItem('wiki_notes_' + CURRENT_SLUG, area.value);
  updateCharCount();
}

function clearTalkNotes() {
  if (confirm('Are you sure you want to clear your local notes for this article?')) {
    var area = document.getElementById('talkNotesArea');
    if (area) {
      area.value = '';
      localStorage.removeItem('wiki_notes_' + CURRENT_SLUG);
      updateCharCount();
    }
  }
}

function updateCharCount() {
  var area = document.getElementById('talkNotesArea');
  var countEl = document.getElementById('charCountDisplay');
  if (!area || !countEl) return;
  countEl.textContent = area.value.length + ' character' + (area.value.length === 1 ? '' : 's');
}

function copyTextWithFeedback(text, button) {
  var write = navigator.clipboard && navigator.clipboard.writeText
    ? navigator.clipboard.writeText(text)
    : new Promise(function(resolve, reject) {
        var area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.left = '-9999px';
        document.body.appendChild(area);
        area.select();
        try { document.execCommand('copy') ? resolve() : reject(); }
        catch (err) { reject(); }
        finally { document.body.removeChild(area); }
      });
  write.then(function() {
    var t = button.textContent;
    button.textContent = 'Copied!';
    button.classList.add('code-copy-btn-copied');
    setTimeout(function() {
      button.textContent = t;
      button.classList.remove('code-copy-btn-copied');
    }, 2000);
  });
}

function copySourceCode() {
  var area = document.getElementById('markdownSourceArea');
  if (!area) return;
  var btn = document.getElementById('copySourceBtn');
  copyTextWithFeedback(area.value, btn);
}

function copyPreContent(pre, button) {
  var text = pre.getAttribute('data-copy') || '';
  copyTextWithFeedback(text, button);
}

function initCodeCopyButtons() {
  document.querySelectorAll('pre[data-copy]:not([data-copy-ready])').forEach(function(pre) {
    pre.setAttribute('data-copy-ready', '');
    var wrapper = document.createElement('div');
    wrapper.className = 'code-block';
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'code-copy-btn';
    btn.setAttribute('aria-label', 'Copy code');
    btn.textContent = 'Copy';
    btn.addEventListener('click', function() { copyPreContent(pre, btn); });
    wrapper.appendChild(btn);
  });
}

function toggleToc() {
  var list = document.getElementById('toc-list');
  var toggleBtn = document.getElementById('toggleTocBtn');
  if (!list || !toggleBtn) return;
  if (list.style.display === 'none') {
    list.style.display = 'block';
    toggleBtn.textContent = '[hide]';
    localStorage.setItem('wiki_toc_visible', 'true');
  } else {
    list.style.display = 'none';
    toggleBtn.textContent = '[show]';
    localStorage.setItem('wiki_toc_visible', 'false');
  }
}

function goToRandomArticle() {
  if (ALL_PAGES.length === 0) return;
  var randomPage = ALL_PAGES[Math.floor(Math.random() * ALL_PAGES.length)];
  window.location.href = pageUrl(randomPage.slug);
}

function triggerSearch() {
  var query = document.getElementById('searchInput').value.toLowerCase().trim();
  if (!query) return;
  var matches = ALL_PAGES.filter(function(page) {
    return page.title.toLowerCase().includes(query) || page.slug.toLowerCase().includes(query);
  });
  if (matches.length > 0) {
    navigateSearch(matches[0].slug);
  }
}

function renderSearchSuggestions(matches) {
  var suggestionsBox = document.getElementById('search-suggestions');
  var suggestionTemplate = document.getElementById('search-suggestion-template');
  var emptyTemplate = document.getElementById('search-empty-template');
  if (!suggestionsBox || !suggestionTemplate || !emptyTemplate) return;
  suggestionsBox.replaceChildren();
  if (matches.length === 0) {
    suggestionsBox.appendChild(emptyTemplate.content.cloneNode(true));
    suggestionsBox.style.display = 'block';
    selectedSuggestionIndex = -1;
    return;
  }
  var fragment = document.createDocumentFragment();
  matches.forEach(function(page, idx) {
    var item = suggestionTemplate.content.firstElementChild.cloneNode(true);
    item.dataset.slug = page.slug;
    item.dataset.idx = String(idx);
    item.querySelector('.suggestion-title').textContent = page.title;
    item.querySelector('.suggestion-type').textContent = page.slug;
    fragment.appendChild(item);
  });
  suggestionsBox.appendChild(fragment);
  suggestionsBox.style.display = 'block';
  selectedSuggestionIndex = -1;
}

function onSearchInput(e) {
  var query = e.target.value.toLowerCase().trim();
  var suggestionsBox = document.getElementById('search-suggestions');
  if (!suggestionsBox) return;
  if (!query) {
    suggestionsBox.style.display = 'none';
    suggestionsBox.replaceChildren();
    selectedSuggestionIndex = -1;
    return;
  }
  var matches = ALL_PAGES.filter(function(page) {
    return page.title.toLowerCase().includes(query) || page.slug.toLowerCase().includes(query);
  }).slice(0, 8);
  renderSearchSuggestions(matches);
}

function handleSearchKey(e) {
  var suggestionsBox = document.getElementById('search-suggestions');
  if (!suggestionsBox || suggestionsBox.style.display === 'none') return;
  var items = suggestionsBox.querySelectorAll('.suggestion-item:not(.suggestion-item-empty)');
  if (items.length === 0) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedSuggestionIndex = (selectedSuggestionIndex + 1) % items.length;
    highlightSuggestion(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedSuggestionIndex = (selectedSuggestionIndex - 1 + items.length) % items.length;
    highlightSuggestion(items);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    var index = selectedSuggestionIndex >= 0 ? selectedSuggestionIndex : 0;
    navigateSearch(items[index].dataset.slug);
  } else if (e.key === 'Escape') {
    suggestionsBox.style.display = 'none';
  }
}

function highlightSuggestion(items) {
  items.forEach(function(item, idx) {
    if (idx === selectedSuggestionIndex) {
      item.classList.add('selected');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('selected');
    }
  });
}

function navigateSearch(slug) {
  window.location.href = pageUrl(slug);
}

function applyCategoryFilterFromUrl() {
  var params = new URLSearchParams(window.location.search);
  var cat = params.get('category');
  if (!cat) return;
  var mainHeading = document.querySelector('main h1');
  if (mainHeading) {
    mainHeading.replaceChildren();
    mainHeading.append('Pages in Category: ');
    var catLabel = document.createElement('span');
    catLabel.textContent = cat;
    catLabel.style.color = '#54595d';
    catLabel.style.fontFamily = 'sans-serif';
    catLabel.style.fontSize = '0.85em';
    mainHeading.append(catLabel);
    var clearLink = document.createElement('a');
    clearLink.href = WIKI_BASE_URL + '/';
    clearLink.textContent = ' [show all pages]';
    clearLink.style.fontSize = '0.5em';
    clearLink.style.marginLeft = '12px';
    clearLink.style.fontWeight = 'normal';
    mainHeading.append(clearLink);
  }
  document.querySelectorAll('.pages-list li').forEach(function(li) {
    var catsAttr = li.getAttribute('data-categories') || '';
    var cats = catsAttr.split(',').map(function(v) { return v.trim().toLowerCase(); });
    li.style.display = cats.indexOf(cat.toLowerCase()) !== -1 ? '' : 'none';
  });
}

document.addEventListener('click', function(e) {
  var searchBox = document.getElementById('searchInput');
  var suggestionsBox = document.getElementById('search-suggestions');
  if (suggestionsBox && e.target !== searchBox && !suggestionsBox.contains(e.target)) {
    suggestionsBox.style.display = 'none';
  }
});

document.getElementById('search-suggestions').addEventListener('click', function(e) {
  var item = e.target.closest('.suggestion-item:not(.suggestion-item-empty)');
  if (item && item.dataset.slug) {
    navigateSearch(item.dataset.slug);
  }
});

document.addEventListener('DOMContentLoaded', function() {
  var savedState = localStorage.getItem('wiki_toc_visible');
  var list = document.getElementById('toc-list');
  var toggleBtn = document.getElementById('toggleTocBtn');
  if (savedState === 'false' && list && toggleBtn) {
    list.style.display = 'none';
    toggleBtn.textContent = '[show]';
  }
  if (CURRENT_SLUG === '' || CURRENT_SLUG === '"__index__"') {
    applyCategoryFilterFromUrl();
  }
  initCodeCopyButtons();
});
