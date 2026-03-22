// editor.js
// Provides Git-centric Distributed Editing Capabilities for Hibook
(function() {
  let easyMdeInstance = null;
  let isEditing = false;
  let saveTimeout = null;

  function initEditorUI() {
    if (document.getElementById('hibook-editor-container')) return;
    
    const container = document.createElement('div');
    container.id = 'hibook-editor-container';
    container.style.position = 'fixed';
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100vw';
    container.style.height = '100vh';
    container.style.backgroundColor = 'var(--theme-bg, #fff)';
    // Appends to the generalized modal layer from custom.css
    container.style.zIndex = 'var(--z-layer-modal)';
    container.style.display = 'none';
    container.style.flexDirection = 'column';
    
    // Header for editor
    const header = document.createElement('div');
    header.style.padding = '10px 20px';
    header.style.borderBottom = '1px solid #eaecef';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.backgroundColor = '#f6f8fa';
    
    const title = document.createElement('span');
    title.id = 'hibook-editor-title';
    title.style.fontWeight = 'bold';
    title.style.color = '#24292e';
    header.appendChild(title);
    
    const actions = document.createElement('div');
    const saveBtn = document.createElement('button');
    saveBtn.innerHTML = '💾 Save';
    saveBtn.style.padding = '4px 10px';
    saveBtn.style.marginRight = '10px';
    saveBtn.style.cursor = 'pointer';
    saveBtn.onclick = () => {
        const decodedFile = decodeURIComponent(window.$docsify.route.file);
        const msg = prompt("Enter commit message:", "Update " + decodedFile);
        if (msg !== null) {
            saveContent(easyMdeInstance.value(), decodedFile, msg);
        }
    };
    actions.appendChild(saveBtn);
    
    const exitBtn = document.createElement('button');
    exitBtn.innerHTML = 'X Exit Editor';
    exitBtn.style.padding = '4px 10px';
    exitBtn.style.cursor = 'pointer';
    exitBtn.onclick = toggleEditMode;
    actions.appendChild(exitBtn);
    header.appendChild(actions);
    
    container.appendChild(header);

    const textarea = document.createElement('textarea');
    textarea.id = 'hibook-editor-textarea';
    container.appendChild(textarea);
    
    
    // Mount it into the body to ensure it covers everything
    document.body.appendChild(container);
  }

  function saveContent(content, filepath, commitMessage = "") {
     if (!filepath) return;
     document.getElementById('hibook-editor-title').innerHTML = `Saving ${filepath}...`;
     fetch('/_api/save', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ file: filepath, content: content, message: commitMessage })
     })
     .then(res => res.json())
     .then(res => {
         if (res.success) {
            document.getElementById('hibook-editor-title').innerHTML = `Saved <span style="font-weight:normal;color:#888;">(${res.hash})</span>`;
         } else {
            document.getElementById('hibook-editor-title').innerHTML = `<span style="color:red">Save Failed: ${res.error}</span>`;
         }
     })
     .catch(err => {
         document.getElementById('hibook-editor-title').innerHTML = `<span style="color:red">Network Error on Save</span>`;
     });
  }

  function toggleEditMode() {
    const container = document.getElementById('hibook-editor-container');
    const article = document.querySelector('article.markdown-section') || document.querySelector('.markdown-section');
    const filepath = decodeURIComponent(window.$docsify.route.file);
    
    if (!container) initEditorUI();
    
    isEditing = !isEditing;
    
    if (isEditing) {
        // Switch to Edit Mode
        if (article) article.style.display = 'none';
        const tb = document.getElementById('hibook-toolbar');
        if (tb) tb.style.display = 'none';
        container.style.display = 'flex';
        document.getElementById('hibook-editor-title').innerHTML = `Editing: ${filepath}`;
        
        // Fetch raw markdown
        fetch('/' + encodeURI(filepath))
            .then(res => res.text())
            .then(text => {
                if (!easyMdeInstance) {
                    easyMdeInstance = new EasyMDE({ 
                        element: document.getElementById('hibook-editor-textarea'),
                        initialValue: text,
                        spellChecker: false,
                        maxHeight: 'calc(100vh - 150px)',
                        status: ['lines', 'words', 'cursor']
                    });
                } else {
                    easyMdeInstance.value(text);
                }
            });
    } else {
        // Exit Edit Mode
        if (article) article.style.display = 'block';
        const tb = document.getElementById('hibook-toolbar');
        if (tb) tb.style.display = 'flex';
        container.style.display = 'none';
        // Force docsify to reload the page to render latest markdown
        window.location.reload();
    }
  }

  function syncRepository() {
      const originalText = document.getElementById('btn-sync').innerHTML;
      document.getElementById('btn-sync').innerHTML = '⏳ Syncing...';
      
      fetch('/_api/sync', { method: 'POST' })
        .then(res => res.json())
        .then(res => {
            if (res.success) {
                alert('Sync Successful!');
                window.location.reload();
            } else if (res.no_remote) {
                let remoteUrl = prompt("未检测到远程仓库配置。\n请输入完整的 Git 远程仓库地址 (例如 git@github.com:user/repo.git)\n若配置成功将自动重试合并与推送：");
                if (remoteUrl && remoteUrl.trim()) {
                    fetch('/_api/set_remote', {
                        method: 'POST',
                        body: JSON.stringify({ remote: remoteUrl.trim() }),
                        headers: { 'Content-Type': 'application/json' }
                    })
                    .then(r => r.json())
                    .then(d => {
                        if (d.success) {
                            alert("配置成功！并且已完成初始化推送和上游追踪。\n以后的改动可以直接点击 Sync 同步！");
                            window.location.reload();
                        } else {
                            alert("配置远程仓库或推送失败: " + d.error);
                            document.getElementById('btn-sync').innerHTML = originalText;
                        }
                    });
                } else {
                    document.getElementById('btn-sync').innerHTML = originalText;
                }
            } else if (res.conflict) {
                const resolution = confirm('Sync Conflict Detected!\nYour local changes conflict with remote.\n\nClick OK/Yes to Keep Local Changes (Force Push)\nClick Cancel/No to Keep Remote Changes (Overwrite Local)');
                resolveConflict(resolution ? 'local' : 'remote');
            } else {
                alert('Sync Failed: ' + res.error);
                document.getElementById('btn-sync').innerHTML = originalText;
            }
        })
        .catch(err => {
            alert('Network Error during Sync');
            document.getElementById('btn-sync').innerHTML = originalText;
        });
  }

  function resolveConflict(strategy) {
      document.getElementById('btn-sync').innerHTML = '⏳ Resolving...';
      fetch('/_api/resolve', {
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
              document.getElementById('btn-sync').innerHTML = '🔄 Sync';
          }
      });
  }
  
  function checkStatus() {
      fetch('/_api/status')
        .then(res => res.json())
        .then(res => {
            const btn = document.getElementById('btn-sync');
            if (!btn) return;
            if (res.dirty || res.ahead > 0) {
                btn.style.boxShadow = '0 0 10px rgba(255,165,0,0.8)';
            }
            if (res.behind > 0) {
                btn.innerHTML = `<span style="margin-right: 4px; font-size: 1.1em;">🔄</span><span style="font-size: 0.9em; font-weight: 500;">Pulll (${res.behind})</span>`;
            }
        });
  }

  function editorDocsifyPlugin(hook, vm) {
      hook.mounted(function() {
          if (window.addToolbarButton) {
              window.addToolbarButton('btn-edit', '✏️', 'Edit', toggleEditMode);
              window.addToolbarButton('btn-sync', '🔄', 'Sync', syncRepository);
          }
          
          // Attach routing state so we can access file path
          window.$docsify.route = vm.route;
          
          initEditorUI();
          
          // Poll git status every 30 seconds
          checkStatus();
          setInterval(checkStatus, 30000);
      });
      
      hook.doneEach(function() {
          // Update routing file on navigate
          window.$docsify.route = vm.route;
      });
  }

  window.$docsify = window.$docsify || {};
  window.$docsify.plugins = (window.$docsify.plugins || []).concat(editorDocsifyPlugin);
})();
