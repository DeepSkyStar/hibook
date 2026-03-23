// editor.js
// Provides Git-centric Distributed Editing Capabilities for Hibook
(function() {

  class HiEditor extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.easyMdeInstance = null;
      this.isEditing = false;
      this.saveTimeout = null;

      this.toggleEditMode = this.toggleEditMode.bind(this);
      this.syncRepository = this.syncRepository.bind(this);
      this.checkStatus = this.checkStatus.bind(this);
    }

    connectedCallback() {
      this.render();
      this.setupDocsifyIntegration();
    }

    render() {
      const rootPath = window.HIBOOK_ROOT || '/';
      
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background-color: var(--theme-bg, #fff);
            z-index: var(--z-layer-modal, 9999);
            display: none;
            flex-direction: column;
          }
          .header {
            padding: 10px 20px;
            border-bottom: 1px solid #eaecef;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background-color: #f6f8fa;
          }
          .title {
            font-weight: bold;
            color: #24292e;
          }
          .actions button {
            padding: 4px 10px;
            margin-right: 10px;
            cursor: pointer;
          }
          .actions button:last-child {
            margin-right: 0;
          }
        </style>
        <link rel="stylesheet" href="${rootPath}.hibook_web/vendor/easymde/easymde.min.css">
        <link rel="stylesheet" href="${rootPath}.hibook_web/custom.css">
        <link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/font-awesome/latest/css/font-awesome.min.css">
        <div class="header">
          <span class="title" id="editor-title">Editing...</span>
          <div class="actions">
            <button id="save-btn">💾 Save</button>
            <button id="exit-btn">X Exit Editor</button>
          </div>
        </div>
        <textarea id="editor-textarea"></textarea>
      `;

      this.shadowRoot.getElementById('save-btn').onclick = () => {
        const decodedFile = decodeURIComponent(window.$docsify.route.file);
        const msg = prompt("Enter commit message:", "Update " + decodedFile);
        if (msg !== null) {
          this.saveContent(this.easyMdeInstance.value(), decodedFile, msg);
        }
      };

      this.shadowRoot.getElementById('exit-btn').onclick = this.toggleEditMode;
    }

    setupDocsifyIntegration() {
      if (window.addToolbarButton) {
        window.addToolbarButton('btn-edit', '✏️', 'Edit', this.toggleEditMode, 20);
        window.addToolbarButton('btn-sync', '🔄', 'Sync', this.syncRepository, 30);
      }
      
      this.checkStatus();
      this.statusInterval = setInterval(this.checkStatus, 30000);
    }

    disconnectedCallback() {
      if (this.statusInterval) clearInterval(this.statusInterval);
    }

    saveContent(content, filepath, commitMessage = "") {
      if (!filepath) return;
      const titleEl = this.shadowRoot.getElementById('editor-title');
      titleEl.innerHTML = `Saving ${filepath}...`;
      
      fetch((window.HIBOOK_ROOT || '/') + '_api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: filepath, content: content, message: commitMessage })
      })
      .then(res => res.json())
      .then(res => {
        if (res.success) {
          titleEl.innerHTML = `Saved <span style="font-weight:normal;color:#888;">(${res.hash})</span>`;
        } else {
          titleEl.innerHTML = `<span style="color:red">Save Failed: ${res.error}</span>`;
        }
      })
      .catch(err => {
        titleEl.innerHTML = `<span style="color:red">Network Error on Save</span>`;
      });
    }

    toggleEditMode() {
      const article = document.querySelector('article.markdown-section') || document.querySelector('.markdown-section');
      const filepath = decodeURIComponent(window.$docsify.route.file);
      
      this.isEditing = !this.isEditing;
      
      if (this.isEditing) {
        // Switch to Edit Mode
        if (article) article.style.display = 'none';
        const tb = document.getElementById('hibook-toolbar');
        if (tb) tb.style.display = 'none';
        
        this.style.display = 'flex';
        this.shadowRoot.getElementById('editor-title').innerHTML = `Editing: ${filepath}`;
        
        // Fetch raw markdown
        fetch((window.HIBOOK_ROOT || '/') + encodeURI(filepath))
          .then(res => res.text())
          .then(text => {
            if (!this.easyMdeInstance) {
              // Wait for DOM to paint so EasyMDE can measure it properly
              setTimeout(() => {
                  this.easyMdeInstance = new EasyMDE({ 
                    element: this.shadowRoot.getElementById('editor-textarea'),
                    initialValue: text,
                    spellChecker: false,
                    maxHeight: 'calc(100vh - 150px)',
                    status: ['lines', 'words', 'cursor']
                  });
              }, 50);
            } else {
              this.easyMdeInstance.value(text);
            }
          });
      } else {
        // Exit Edit Mode
        if (article) article.style.display = 'block';
        const tb = document.getElementById('hibook-toolbar');
        if (tb) tb.style.display = 'flex';
        
        this.style.display = 'none';
        // Force docsify to reload the page to render latest markdown
        window.location.reload();
      }
    }

    syncRepository() {
      // Find the toggle button in the toolbar shadow dom if possible, or use global
      const tbWrap = document.querySelector('hi-toolbar') || document.getElementById('hibook-toolbar-wrap');
      let btn = null;
      if (tbWrap && tbWrap.shadowRoot) {
          btn = tbWrap.shadowRoot.getElementById('btn-sync');
      } else {
          btn = document.getElementById('btn-sync');
      }
      
      if (!btn) return;
      
      const originalHTML = btn.innerHTML;
      const originalTitle = btn.title;
      
      btn.innerHTML = '<span style="font-size: 1.2em;">⏳</span>';
      btn.title = 'Syncing...';
      
      const restoreBtn = () => {
        btn.innerHTML = originalHTML;
        btn.title = originalTitle;
      };
      
      fetch((window.HIBOOK_ROOT || '/') + '_api/sync', { method: 'POST' })
        .then(res => res.json())
        .then(res => {
          if (res.success) {
            alert('Sync Successful!');
            window.location.reload();
          } else if (res.no_remote) {
            let remoteUrl = prompt("未检测到远程仓库配置。\\n请输入完整的 Git 远程仓库地址 (例如 git@github.com:user/repo.git)\\n若配置成功将自动重试合并与推送：");
            if (remoteUrl && remoteUrl.trim()) {
              fetch((window.HIBOOK_ROOT || '/') + '_api/set_remote', {
                method: 'POST',
                body: JSON.stringify({ remote: remoteUrl.trim() }),
                headers: { 'Content-Type': 'application/json' }
              })
              .then(r => r.json())
              .then(d => {
                if (d.success) {
                  alert("配置成功！并且已完成初始化推送和上游追踪。\\n以后的改动可以直接点击 Sync 同步！");
                  window.location.reload();
                } else {
                  alert("配置远程仓库或推送失败: " + d.error);
                  restoreBtn();
                }
              });
            } else {
              restoreBtn();
            }
          } else if (res.conflict) {
            const resolution = confirm('Sync Conflict Detected!\\nYour local changes conflict with remote.\\n\\nClick OK/Yes to Keep Local Changes (Force Push)\\nClick Cancel/No to Keep Remote Changes (Overwrite Local)');
            this.resolveConflict(resolution ? 'local' : 'remote', btn, originalHTML, originalTitle);
          } else {
            alert('Sync Failed: ' + res.error);
            restoreBtn();
          }
        })
        .catch(err => {
          alert('Network Error during Sync');
          restoreBtn();
        });
    }

    resolveConflict(strategy, btn, originalHTML, originalTitle) {
      btn.innerHTML = '<span style="font-size: 1.2em;">⏳</span>';
      btn.title = 'Resolving...';
      fetch((window.HIBOOK_ROOT || '/') + '_api/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy: strategy })
      })
      .then(res => res.json())
      .then(res => {
        if (res.success) {
          alert('Conflict Resolved & Synced!');
          window.location.reload();
        } else {
          alert('Resolution Failed: ' + res.error);
          btn.innerHTML = originalHTML; /* span was removed here to properly restore */
          btn.title = originalTitle;
        }
      });
    }

    checkStatus() {
      fetch((window.HIBOOK_ROOT || '/') + '_api/status')
        .then(res => res.json())
        .then(res => {
          const tbWrap = document.querySelector('hi-toolbar') || document.getElementById('hibook-toolbar-wrap');
          let btn = null;
          if (tbWrap && tbWrap.shadowRoot) {
              btn = tbWrap.shadowRoot.getElementById('btn-sync');
          } else {
              btn = document.getElementById('btn-sync');
          }
          if (!btn) return;
          
          if (res.dirty || res.ahead > 0) {
            btn.style.boxShadow = '0 0 10px rgba(255,165,0,0.8)';
          }
          if (res.behind > 0) {
            btn.innerHTML = `<span style="font-size: 1.2em;">⬇️</span>`;
            btn.title = `Pull (${res.behind} behind)`;
          }
        });
    }
  }

  customElements.define('hi-editor', HiEditor);

  function editorDocsifyPlugin(hook, vm) {
    hook.mounted(function() {
      // Ensure element exists
      if (!document.querySelector('hi-editor')) {
        const editorEl = document.createElement('hi-editor');
        document.body.appendChild(editorEl);
      }
      
      // Attach routing state so we can access file path
      window.$docsify.route = vm.route;
    });
    
    hook.doneEach(function() {
      // Update routing file on navigate
      window.$docsify.route = vm.route;
    });
  }

  window.$docsify = window.$docsify || {};
  window.$docsify.plugins = (window.$docsify.plugins || []).concat(editorDocsifyPlugin);
})();
