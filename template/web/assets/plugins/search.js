// search.js
// Command Palette for instant global search in Hibook
(function() {

    class HiSearchModal extends HTMLElement {
        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
            this.currentResults = [];
            this.selectedIndex = -1;
            this.searchTimeout = null;
            
            this.onKeydownGlobal = this.onKeydownGlobal.bind(this);
            this.hideSearch = this.hideSearch.bind(this);
            this.showSearch = this.showSearch.bind(this);
            this.onInput = this.onInput.bind(this);
            this.onKeydownInput = this.onKeydownInput.bind(this);
        }

        connectedCallback() {
            this.render();
            window.addEventListener('keydown', this.onKeydownGlobal);
            
            // Mount a button in toolbar
            const mountToolbarButton = () => {
                if (window.addToolbarButton) {
                    window.addToolbarButton('btn-search', '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>', 'Search', this.showSearch, 10);
                } else {
                    setTimeout(mountToolbarButton, 100);
                }
            };
            mountToolbarButton();

            this.shadowRoot.getElementById('backdrop').addEventListener('click', this.hideSearch);
            const input = this.shadowRoot.getElementById('searchInput');
            input.addEventListener('input', this.onInput);
            input.addEventListener('keydown', this.onKeydownInput);
        }

        disconnectedCallback() {
            window.removeEventListener('keydown', this.onKeydownGlobal);
            const backdrop = this.shadowRoot.getElementById('backdrop');
            if (backdrop) backdrop.removeEventListener('click', this.hideSearch);
            const input = this.shadowRoot.getElementById('searchInput');
            if (input) {
                input.removeEventListener('input', this.onInput);
                input.removeEventListener('keydown', this.onKeydownInput);
            }
        }

        onKeydownGlobal(e) {
            if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
                e.preventDefault();
                const modal = this.shadowRoot.getElementById('modal');
                const isVisible = modal && modal.style.display === 'flex';
                if (isVisible) {
                    this.hideSearch();
                } else {
                    this.showSearch();
                }
            }
        }

        onInput(e) {
            const query = e.target.value.trim();
            clearTimeout(this.searchTimeout);
            
            if (!query) {
                this.renderResults([]);
                return;
            }

            this.searchTimeout = setTimeout(() => {
                this.performSearch(query);
            }, 300); // 300ms debounce
        }

        onKeydownInput(e) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.setSelectedIndex(this.selectedIndex + 1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.setSelectedIndex(this.selectedIndex - 1);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (this.selectedIndex >= 0 && this.selectedIndex < this.currentResults.length) {
                    this.openResult(this.currentResults[this.selectedIndex]);
                }
            } else if (e.key === 'Escape') {
                this.hideSearch();
            }
        }

        setSelectedIndex(index) {
            if (!this.currentResults.length) return;
            this.selectedIndex = Math.max(0, Math.min(index, this.currentResults.length - 1));
            
            const resultsDiv = this.shadowRoot.getElementById('searchResults');
            let itemIndex = 0;
            resultsDiv.childNodes.forEach((item) => {
                if (!item.classList || !item.classList.contains('result-item')) return;

                if (itemIndex === this.selectedIndex) {
                    item.style.backgroundColor = 'var(--theme-color-highlight, rgba(66, 185, 131, 0.1))';
                    item.scrollIntoView({ block: 'nearest' });
                } else {
                    item.style.backgroundColor = 'transparent';
                }
                itemIndex++;
            });
        }

        performSearch(query) {
            fetch((window.HIBOOK_ROOT || '/') + `_api/search?q=${encodeURIComponent(query)}`)
                .then(res => res.json())
                .then(data => {
                    this.renderResults(data);
                })
                .catch(err => console.error("Search failed:", err));
        }

        renderResults(results) {
            this.currentResults = results;
            const resultsDiv = this.shadowRoot.getElementById('searchResults');
            const input = this.shadowRoot.getElementById('searchInput');
            resultsDiv.innerHTML = '';
            this.selectedIndex = -1;

            if (results.length === 0 && input.value.trim() !== '') {
                const noRes = document.createElement('div');
                noRes.style.padding = '15px 20px';
                noRes.style.color = '#999';
                noRes.innerText = 'No results found.';
                resultsDiv.appendChild(noRes);
                return;
            }

            results.forEach((item, index) => {
                const div = document.createElement('div');
                div.className = 'result-item';
                div.style.padding = '10px 20px';
                div.style.cursor = 'pointer';
                div.style.borderBottom = '1px solid #f5f5f5';
                
                // Clean up paths for display mapping
                let cleanPath = item.path;
                if (cleanPath.endsWith('.md')) cleanPath = cleanPath.slice(0, -3);

                div.innerHTML = `
                    <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px; color: var(--theme-color, #42b983);">${item.title}</div>
                    <div style="font-size: 12px; color: #888; margin-bottom: 4px; display:flex; align-items:center; gap:4px;"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg> ${cleanPath}</div>
                    <div style="font-size: 14px; color: #555; line-height: 1.4;">${item.snippet || ''}</div>
                `;

                div.onmouseenter = () => this.setSelectedIndex(index);
                div.onclick = () => this.openResult(item);
                resultsDiv.appendChild(div);
            });
        }

        openResult(item) {
            let cleanPath = item.path;
            if (cleanPath.endsWith('.md')) cleanPath = cleanPath.slice(0, -3);
            window.location.hash = '#/' + cleanPath;
            this.hideSearch();
        }

        showSearch() {
            const modal = this.shadowRoot.getElementById('modal');
            const backdrop = this.shadowRoot.getElementById('backdrop');
            const input = this.shadowRoot.getElementById('searchInput');
            if (modal && backdrop && input) {
                modal.style.display = 'flex';
                backdrop.style.display = 'block';
                input.value = '';
                this.renderResults([]);
                setTimeout(() => input.focus(), 50);
            }
        }

        hideSearch() {
            const modal = this.shadowRoot.getElementById('modal');
            const backdrop = this.shadowRoot.getElementById('backdrop');
            const input = this.shadowRoot.getElementById('searchInput');
            if (modal) {
                modal.style.display = 'none';
                backdrop.style.display = 'none';
                input.blur();
            }
        }

        render() {
            this.shadowRoot.innerHTML = `
                <style>
                    :host {
                        display: block;
                    }
                    .backdrop {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100vw;
                        height: 100vh;
                        background-color: rgba(0,0,0,0.4);
                        z-index: calc(var(--z-layer-modal, 2000) - 1);
                        display: none;
                    }
                    .modal {
                        position: fixed;
                        top: 10vh;
                        left: 50%;
                        transform: translateX(-50%);
                        width: 90%;
                        max-width: 600px;
                        background-color: var(--theme-bg, #ffffff);
                        border-radius: 8px;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                        z-index: var(--z-layer-modal, 2000);
                        display: none;
                        flex-direction: column;
                        overflow: hidden;
                    }
                    .search-input {
                        width: 100%;
                        padding: 15px 20px;
                        font-size: 18px;
                        border: none;
                        outline: none;
                        border-bottom: 1px solid #eee;
                        box-sizing: border-box;
                        background-color: transparent;
                        color: var(--theme-color-text, #333);
                    }
                    .search-results {
                        max-height: 50vh;
                        overflow-y: auto;
                        padding: 0;
                        margin: 0;
                    }
                </style>
                <div class="backdrop" id="backdrop"></div>
                <div class="modal" id="modal">
                    <input class="search-input" id="searchInput" type="text" placeholder="Search knowledge base... (Ctrl+P / Cmd+P)">
                    <div class="search-results" id="searchResults"></div>
                </div>
            `;
        }
    }

    customElements.define('hi-search-modal', HiSearchModal);

    window.addEventListener('load', () => {
        if (!document.querySelector('hi-search-modal')) {
            const t = document.createElement('hi-search-modal');
            document.body.appendChild(t);
        }
    });

})();
