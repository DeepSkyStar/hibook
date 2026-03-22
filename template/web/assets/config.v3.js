window.$docsify = {
  name: 'Hibook',
  repo: '',
  homepage: 'README.md',
  loadSidebar: 'SUMMARY.md',
  loadNavbar: false,
  relativePath: true,
  subMaxLevel: 1, 
  sidebarDisplayLevel: 2, 
  auto2top: true,
  alias: {
    '/.*/_sidebar.md': '/_sidebar.md',
    '/.*/_navbar.md': '/_navbar.md',
    '/.*/SUMMARY\\.md.*': '/SUMMARY.md'
  },
  autoHeader: false,
  markdown: {
    renderer: {
      code: function(code, lang) {
        if (lang === "mermaid") {
          // marked.js escapes HTML inside code blocks, so we must unescape it for mermaid to parse
          var unescaped = code.replace(/&lt;/g, "<")
                              .replace(/&gt;/g, ">")
                              .replace(/&quot;/g, '"')
                              .replace(/&amp;/g, "&")
                              .replace(/&#39;/g, "'");
          return '<div class="mermaid">' + unescaped + "</div>";
        }
        return this.origin.code.apply(this, arguments);
      }
    }
  },
  plugins: [
    // Dynamic Title Bootstrapper: Fetches Root README.md to define the KB Identity
    function(hook, vm) {
        hook.ready(function() {
            fetch('README.md')
                .then(r => r.text())
                .then(text => {
                    const match = text.match(/^#\s+(.+)$/m);
                    if (match && match[1]) {
                        const title = match[1].trim();
                        
                        // Update Browser Tab
                        document.title = title;
                        
                        // Update Docsify sidebar identity
                        const appNameEl = document.querySelector('.app-name-link');
                        if (appNameEl) {
                            appNameEl.innerText = title;
                        }
                    }
                })
                .catch(err => console.error("Failed to sync title from README:", err));
        });
    },
    // Sidebar Resizer & Scroll Memory
    function(hook, vm) {
      hook.mounted(function() {
        var resizer = document.createElement('div');
        resizer.classList.add('sidebar-resizer');
        document.body.appendChild(resizer);

        var storedWidth = localStorage.getItem('sidebar-width');
        if (storedWidth && !isNaN(parseInt(storedWidth))) {
            document.documentElement.style.setProperty('--sidebar-width', parseInt(storedWidth) + 'px');
        } else {
            document.documentElement.style.setProperty('--sidebar-width', '300px');
        }

        var isResizing = false;
        
        function disableSelect() {
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';
        }
        function enableSelect() {
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        }

        resizer.addEventListener('mousedown', function(e) {
            isResizing = true;
            resizer.classList.add('active');
            disableSelect();
            e.preventDefault();
        });

        document.addEventListener('mousemove', function(e) {
            if (!isResizing) return;
            var newWidth = e.clientX;
            if (newWidth < 200) newWidth = 200;
            if (newWidth > 800) newWidth = 800;
            document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
        });

        document.addEventListener('mouseup', function(e) {
            if (isResizing) {
                isResizing = false;
                resizer.classList.remove('active');
                enableSelect();
                var currentWidth = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width').trim();
                localStorage.setItem('sidebar-width', parseInt(currentWidth));
            }
        });
      });

      hook.doneEach(function() {
        if (window.mermaid) {
          window.mermaid.init(undefined, document.querySelectorAll('.mermaid'));
        }
      });

      hook.doneEach(function() {
        var sidebar = document.querySelector('.sidebar');
        var scrollPosition = sessionStorage.getItem('sidebar-scroll');
        
        if (sidebar && scrollPosition) {
           setTimeout(function() {
               sidebar.scrollTop = scrollPosition;
           }, 100); 
        }
        
        if (sidebar) {
             setTimeout(function() {
                sidebar.onscroll = function(e) {
                     sessionStorage.setItem('sidebar-scroll', e.target.scrollTop);
                };
             }, 300);
        }
      });
    }
  ]
};
