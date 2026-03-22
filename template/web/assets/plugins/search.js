// search.js
// Command Palette for instant global search in Hibook
(function() {
    let searchModal = null;
    let searchInput = null;
    let searchResults = null;
    let searchTimeout = null;
    let currentResults = [];
    let selectedIndex = -1;

    function initSearchUI() {
        if (document.getElementById('hibook-search-modal')) return;

        searchModal = document.createElement('div');
        searchModal.id = 'hibook-search-modal';
        // Style as a centered floating palette
        searchModal.style.position = 'fixed';
        searchModal.style.top = '10vh';
        searchModal.style.left = '50%';
        searchModal.style.transform = 'translateX(-50%)';
        searchModal.style.width = '90%';
        searchModal.style.maxWidth = '600px';
        searchModal.style.backgroundColor = 'var(--theme-bg, #ffffff)';
        searchModal.style.borderRadius = '8px';
        searchModal.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)';
        searchModal.style.zIndex = 'var(--z-layer-modal, 2000)';
        searchModal.style.display = 'none';
        searchModal.style.flexDirection = 'column';
        searchModal.style.overflow = 'hidden';

        searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search knowledge base... (Ctrl+P / Cmd+P)';
        searchInput.style.width = '100%';
        searchInput.style.padding = '15px 20px';
        searchInput.style.fontSize = '18px';
        searchInput.style.border = 'none';
        searchInput.style.outline = 'none';
        searchInput.style.borderBottom = '1px solid #eee';
        searchInput.style.boxSizing = 'border-box';
        searchInput.style.backgroundColor = 'transparent';
        searchInput.style.color = 'var(--theme-color-text, #333)';

        searchResults = document.createElement('div');
        searchResults.id = 'hibook-search-results';
        searchResults.style.maxHeight = '50vh';
        searchResults.style.overflowY = 'auto';
        searchResults.style.padding = '0';
        searchResults.style.margin = '0';

        searchModal.appendChild(searchInput);
        searchModal.appendChild(searchResults);

        // Backdrop to close modal
        const backdrop = document.createElement('div');
        backdrop.id = 'hibook-search-backdrop';
        backdrop.style.position = 'fixed';
        backdrop.style.top = '0';
        backdrop.style.left = '0';
        backdrop.style.width = '100vw';
        backdrop.style.height = '100vh';
        backdrop.style.backgroundColor = 'rgba(0,0,0,0.4)';
        backdrop.style.zIndex = 'calc(var(--z-layer-modal, 2000) - 1)';
        backdrop.style.display = 'none';

        document.body.appendChild(backdrop);
        document.body.appendChild(searchModal);

        backdrop.onclick = hideSearch;

        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            clearTimeout(searchTimeout);
            
            if (!query) {
                renderResults([]);
                return;
            }

            searchTimeout = setTimeout(() => {
                performSearch(query);
            }, 300); // 300ms debounce
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(selectedIndex + 1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(selectedIndex - 1);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (selectedIndex >= 0 && selectedIndex < currentResults.length) {
                    openResult(currentResults[selectedIndex]);
                }
            } else if (e.key === 'Escape') {
                hideSearch();
            }
        });
    }

    function setSelectedIndex(index) {
        if (!currentResults.length) return;
        selectedIndex = Math.max(0, Math.min(index, currentResults.length - 1));
        
        const items = searchResults.childNodes;
        items.forEach((item, i) => {
            if (i === selectedIndex) {
                item.style.backgroundColor = 'var(--theme-color-highlight, rgba(66, 185, 131, 0.1))';
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.style.backgroundColor = 'transparent';
            }
        });
    }

    function performSearch(query) {
        fetch(`/_api/search?q=${encodeURIComponent(query)}`)
            .then(res => res.json())
            .then(data => {
                renderResults(data);
            })
            .catch(err => console.error("Search failed:", err));
    }

    function renderResults(results) {
        currentResults = results;
        searchResults.innerHTML = '';
        selectedIndex = -1;

        if (results.length === 0 && searchInput.value.trim() !== '') {
            const noRes = document.createElement('div');
            noRes.style.padding = '15px 20px';
            noRes.style.color = '#999';
            noRes.innerText = 'No results found.';
            searchResults.appendChild(noRes);
            return;
        }

        results.forEach((item, index) => {
            const div = document.createElement('div');
            div.style.padding = '10px 20px';
            div.style.cursor = 'pointer';
            div.style.borderBottom = '1px solid #f5f5f5';
            
            // Clean up paths for display mapping
            let cleanPath = item.path;
            if (cleanPath.endsWith('.md')) cleanPath = cleanPath.slice(0, -3);

            div.innerHTML = `
                <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px; color: var(--theme-color, #42b983);">${item.title}</div>
                <div style="font-size: 12px; color: #888; margin-bottom: 4px;">📂 ${cleanPath}</div>
                <div style="font-size: 14px; color: #555; line-height: 1.4;">${item.snippet || ''}</div>
            `;

            div.onmouseenter = () => setSelectedIndex(index);
            div.onclick = () => openResult(item);
            searchResults.appendChild(div);
        });
    }

    function openResult(item) {
        let cleanPath = item.path;
        if (cleanPath.endsWith('.md')) cleanPath = cleanPath.slice(0, -3);
        window.location.hash = '#/' + cleanPath;
        hideSearch();
    }

    function showSearch() {
        if (!searchModal) initSearchUI();
        searchModal.style.display = 'flex';
        document.getElementById('hibook-search-backdrop').style.display = 'block';
        searchInput.value = '';
        renderResults([]);
        setTimeout(() => searchInput.focus(), 50);
    }

    function hideSearch() {
        if (searchModal) {
            searchModal.style.display = 'none';
            document.getElementById('hibook-search-backdrop').style.display = 'none';
            searchInput.blur();
        }
    }

    // Bind Ctrl+P / Cmd+P
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
            e.preventDefault();
            
            const isVisible = searchModal && searchModal.style.display === 'flex';
            if (isVisible) {
                hideSearch();
            } else {
                showSearch();
            }
        }
    });

    // Also mount a button in toolbar
    function mountToolbarButton() {
        if (window.addToolbarButton) {
            window.addToolbarButton('btn-search', '🔍', 'Search', showSearch, 10);
        } else {
            setTimeout(mountToolbarButton, 100);
        }
    }
    
    // Auto init
    window.addEventListener('load', () => {
        initSearchUI();
        mountToolbarButton();
    });

})();
