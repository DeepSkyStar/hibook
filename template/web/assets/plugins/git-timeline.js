function gitTimelinePlugin(hook, vm) {
  let drawer = null;
  let historyModal = null;
  let historyModalContent = null;

  function initTimelineUI() {
    if (document.getElementById('git-timeline-drawer')) return;
    
    // Create Drawer
    drawer = document.createElement('div');
    drawer.id = 'git-timeline-drawer';
    drawer.style.position = 'fixed';
    drawer.style.top = '0';
    drawer.style.right = '0';
    drawer.style.width = '350px';
    drawer.style.height = '100vh';
    drawer.style.backgroundColor = '#fff';
    drawer.style.boxShadow = '-5px 0 15px rgba(0,0,0,0.1)';
    // Applies to the structured drawer layer from custom.css
    drawer.style.zIndex = 'var(--z-layer-drawer)';
    drawer.style.transform = 'translateX(100%)';
    drawer.style.transition = 'transform 0.3s ease-in-out';
    drawer.style.overflowY = 'auto';
    drawer.style.padding = '20px';
    drawer.style.boxSizing = 'border-box';
    drawer.style.fontFamily = 'var(--baseFontFamily, sans-serif)';
    
    // Dark mode support
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
       drawer.style.backgroundColor = '#1e1e1e';
       drawer.style.color = '#fff';
    }

    const closeBtn = document.createElement('div');
    closeBtn.innerHTML = '✕';
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '15px';
    closeBtn.style.right = '20px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.fontSize = '20px';
    closeBtn.onclick = () => drawer.style.transform = 'translateX(100%)';
    drawer.appendChild(closeBtn);

    const title = document.createElement('h3');
    title.innerHTML = '⏱️ 变更时间线';
    title.style.marginTop = '0';
    title.style.borderBottom = '1px solid #eaecef';
    title.style.paddingBottom = '10px';
    drawer.appendChild(title);

    const content = document.createElement('div');
    content.id = 'git-timeline-content';
    content.innerHTML = '<span style="color:#999">请打开或刷新页面加载历史...</span>';
    drawer.appendChild(content);

    document.body.appendChild(drawer);
    
    // Create Historical Viewer Modal
    historyModal = document.createElement('div');
    historyModal.style.position = 'fixed';
    historyModal.style.top = '0';
    historyModal.style.left = '0';
    historyModal.style.width = '100vw';
    historyModal.style.height = '100vh';
    historyModal.style.backgroundColor = 'rgba(0,0,0,0.85)';
    historyModal.style.zIndex = 'var(--z-layer-modal)';
    historyModal.style.display = 'none';
    historyModal.style.justifyContent = 'center';
    historyModal.style.alignItems = 'center';
    
    const hContainer = document.createElement('div');
    const isMobile = window.innerWidth <= 768;
    hContainer.style.width = isMobile ? '95vw' : '80vw';
    hContainer.style.height = isMobile ? '90vh' : '85vh';
    hContainer.style.backgroundColor = '#ffffff';
    hContainer.style.color = '#333333';
    hContainer.style.borderRadius = '8px';
    hContainer.style.padding = isMobile ? '40px 15px 15px 15px' : '30px'; 
    hContainer.style.overflowY = 'auto';
    hContainer.style.boxSizing = 'border-box';
    hContainer.style.position = 'relative';
    
    // Create close button INSIDE the container so it never overlaps invisibly
    const hCloseBtn = document.createElement('div');
    hCloseBtn.innerHTML = '✕';
    hCloseBtn.style.position = 'absolute';
    hCloseBtn.style.top = isMobile ? '10px' : '15px';
    hCloseBtn.style.right = isMobile ? '15px' : '20px';
    hCloseBtn.style.color = '#999';
    hCloseBtn.style.fontSize = '24px';
    hCloseBtn.style.cursor = 'pointer';
    hCloseBtn.style.zIndex = '9999';
    hCloseBtn.onclick = () => {
        historyModal.style.display = 'none';
    };
    
    // Ensure mouse hover feedback
    hCloseBtn.onmouseenter = () => hCloseBtn.style.color = '#333';
    hCloseBtn.onmouseleave = () => hCloseBtn.style.color = '#999';
    
    hContainer.appendChild(hCloseBtn);
    
    historyModalContent = document.createElement('div');
    historyModalContent.className = 'markdown-section'; // Inherit Docsify styles
    hContainer.appendChild(historyModalContent);
    historyModal.appendChild(hContainer);
    
    document.body.appendChild(historyModal);
  }

  function openTimelineDrawer() {
    if (!drawer) initTimelineUI();
    const title = drawer.querySelector('h3');
    if (title && title.innerHTML.includes('全局')) {
        if (window.loadPageHistory) window.loadPageHistory();
    }
    drawer.style.transform = 'translateX(0)';
  }

  function viewHistoricalCommit(hash, filePath, isSynced) {
    historyModal.style.display = 'flex';
    historyModalContent.innerHTML = '<h2 style="text-align:center;color:#999;margin-top:20vh;">加载历史版本 ' + hash + '...</h2>';
    
    fetch('/_api/file_at_commit?file=' + encodeURIComponent(filePath) + '&hash=' + hash)
      .then(res => {
         if (!res.ok) throw new Error('File not found in this commit');
         return res.text();
      })
      .then(text => {
         let actionsHtml = `<div style="margin-top: 10px; margin-bottom: 10px;">
            <button id="btn-restore-version" style="padding: 6px 12px; cursor: pointer; background: #f39c12; color: white; border: none; border-radius: 4px; margin-right: 10px;">回滚到该次改动之前</button>`;
         if (isSynced === 'false') {
             actionsHtml += `<button id="btn-undo-commit" style="padding: 6px 12px; cursor: pointer; background: #e74c3c; color: white; border: none; border-radius: 4px;">抹掉该记录</button>`;
         }
         actionsHtml += `</div>`;
         
         let rendered = '';
         if (window.marked && typeof window.marked === 'function') {
             rendered = window.marked(text);
         } else if (window.marked && typeof window.marked.parse === 'function') {
             rendered = window.marked.parse(text);
         } else {
             rendered = '<pre style="white-space:pre-wrap; word-wrap:break-word; background:transparent;">' + 
                        text.replace(/</g, '&lt;').replace(/>/g, '&gt;') + 
                        '</pre>';
         }
         
         historyModalContent.innerHTML = 
            '<div style="background:#fffae6; color:#856404; padding:10px; margin-bottom:20px; border-radius:4px; border:1px solid #ffeeba;">' +
            '<strong>⚠️ 历史版本 (只读)</strong> - 您正在查看 <code>' + hash + '</code> 时刻的文件状态。' + actionsHtml +
            '</div>' + rendered;
            
         document.getElementById('btn-restore-version').onclick = () => {
             if (confirm("确定要回滚文件内容吗？")) {
                 fetch('/_api/save', {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({ file: filePath, content: text, message: `回滚 ${filePath} 至历史状态 ${hash}` })
                 }).then(r => r.json()).then(res => {
                     if (res.success) { alert("回滚成功！"); window.location.reload(); }
                     else { alert("操作失败: " + res.error); }
                 });
             }
         };
         
         let undoBtn = document.getElementById('btn-undo-commit');
         if (undoBtn) {
             undoBtn.onclick = () => {
                 if (confirm("确定要彻底抹掉该条历史记录吗？\n（危险操作：此操作类似 Reset，将从本地历史记录中彻底删除该节点，若与其他历史存在依赖冲突将自动终止该操作。）")) {
                     fetch('/_api/drop_commit', {
                         method: 'POST',
                         headers: { 'Content-Type': 'application/json' },
                         body: JSON.stringify({ hash: hash })
                     }).then(r => r.json()).then(res => {
                         if (res.success) { alert("抹除该记录成功！"); window.location.reload(); }
                         else { alert("操作失败: " + res.error); }
                     });
                 }
             };
         }
      })
      .catch(err => {
         historyModalContent.innerHTML = '<h2 style="text-align:center;color:red;margin-top:20vh;">无法加载该历史版本</h2><p style="text-align:center;">' + err.message + '</p>';
      });
  }

  hook.mounted(function() {
      initTimelineUI();
      if (window.addToolbarButton) {
          window.addToolbarButton('btn-git-timeline', '⏱️', 'History', openTimelineDrawer, 40);
      }
  });

  let currentVmRouteFile = null;

  function loadPageHistory() {
      if (!currentVmRouteFile) return;
      var container = document.getElementById('git-timeline-content');
      if (!container) return;
      
      const title = drawer.querySelector('h3');
      if(title) title.innerHTML = '📄 页面变更时间线';
      
      const currentFile = decodeURIComponent(currentVmRouteFile);
      container.innerHTML = '<span style="color:#999">加载中...</span>';

      fetch('/_api/history?file=' + encodeURIComponent(currentFile))
      .then(function(response) {
        if (!response.ok) throw new Error('API off or file not tracked');
        return response.json();
      })
      .then(function(history) {
        if (!history || history.length === 0) {
          container.innerHTML = '<span style="color:#999; font-size: 0.9em;">暂无 Git 变更记录。</span>';
          return;
        }

        var listHtml = '<ul style="list-style:none; padding-left:0; border-left: 2px solid #eaecef; margin-left: 10px; margin-bottom: 0;">';
        history.forEach(function(commit) {
          let unsyncedTag = !commit.is_synced ? '<span style="color:#e67e22; font-weight:bold; margin-left:5px;">(Unsynced)</span>' : '';
          listHtml += '<li class="timeline-node" data-hash="' + commit.hash + '" data-synced="' + commit.is_synced + '" style="position: relative; margin-bottom: 20px; padding-left: 20px; cursor: pointer;">' +
                      '<div style="position: absolute; left: -7px; top: 6px; width: 12px; height: 12px; border-radius: 50%; background: #42b983; border: 2px solid #fff; box-shadow: 0 0 0 1px #eaecef;"></div>' +
                      '<div style="font-size: 0.85em; color: #888; margin-bottom: 6px;">' +
                      '<strong style="color: #555;">' + commit.date + '</strong> • ' + commit.author + unsyncedTag + ' ' +
                      '<code style="background: #f1f1f1; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; margin-left: 5px; color:#333;">' + commit.hash + '</code>' +
                      '</div>' +
                      '<div style="color: #444; font-size: 0.95em; line-height: 1.5;">' + commit.message + '</div>' +
                      '</li>';
        });
        listHtml += '</ul>';
        container.innerHTML = listHtml;
        
        // Add hover effects and click listeners
        const nodes = container.querySelectorAll('.timeline-node');
        nodes.forEach(node => {
            node.onmouseenter = () => node.style.backgroundColor = 'rgba(66, 185, 131, 0.1)';
            node.onmouseleave = () => node.style.backgroundColor = 'transparent';
            node.onclick = () => viewHistoricalCommit(node.getAttribute('data-hash'), currentFile, node.getAttribute('data-synced'));
        });
      })
      .catch(function(err) {
        container.innerHTML = '<span style="color:#999; font-size: 0.9em;">无法获取时间线或无记录。</span>';
      });
  }

  hook.doneEach(function() {
      if (vm.route.file) {
          currentVmRouteFile = vm.route.file;
          // Pre-load if drawer is open to keep it synced, but we can just always pre-load
          loadPageHistory();
      }
  });

  function loadGlobalHistory() {
      if (!drawer) initTimelineUI();
      drawer.style.transform = 'translateX(0)';
      
      const title = drawer.querySelector('h3');
      if(title) title.innerHTML = '🌍 全局时间线';
      
      const container = document.getElementById('git-timeline-content');
      if (!container) return;
      
      container.innerHTML = '<span style="color:#999">抓取全局日志中...</span>';
      
      fetch('/_api/history?file=')
        .then(res => res.json())
        .then(history => {
            if (!history || history.length === 0) {
              container.innerHTML = '<span style="color:#999; font-size: 0.9em;">暂无 Git 变更记录。</span>';
              return;
            }
            
            var listHtml = '<ul style="list-style:none; padding-left:0; border-left: 2px solid #eaecef; margin-left: 10px; margin-bottom: 0;">';
            history.forEach(function(commit) {
              let unsyncedTag = !commit.is_synced ? '<span style="color:#e67e22; font-weight:bold; margin-left:5px;">(Unsynced)</span>' : '';
              listHtml += '<li class="timeline-node" data-hash="' + commit.hash + '" data-synced="' + commit.is_synced + '" style="position: relative; margin-bottom: 20px; padding-left: 20px; cursor: pointer;">' +
                          '<div style="position: absolute; left: -7px; top: 6px; width: 12px; height: 12px; border-radius: 50%; background: #42b983; border: 2px solid #fff; box-shadow: 0 0 0 1px #eaecef;"></div>' +
                          '<div style="font-size: 0.85em; color: #888; margin-bottom: 6px;">' +
                          '<strong style="color: #555;">' + commit.date + '</strong> • ' + commit.author + unsyncedTag + ' ' +
                          '<code style="background: #f1f1f1; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; margin-left: 5px; color:#333;">' + commit.hash + '</code>' +
                          '</div>' +
                          '<div style="color: #444; font-size: 0.95em; line-height: 1.5;">' + commit.message + '</div>' +
                          '</li>';
            });
            listHtml += '</ul>';
            container.innerHTML = listHtml;
            
            const nodes = container.querySelectorAll('.timeline-node');
            nodes.forEach(node => {
                node.onmouseenter = () => node.style.backgroundColor = 'rgba(66, 185, 131, 0.1)';
                node.onmouseleave = () => node.style.backgroundColor = 'transparent';
                node.onclick = () => {
                   const hash = node.getAttribute('data-hash');
                   historyModal.style.display = 'flex';
                   historyModalContent.innerHTML = '<h2 style="text-align:center;color:#999;margin-top:20vh;">获取 '+hash+' 全局改动中...</h2>';
                   fetch('/_api/commit_info?hash=' + hash)
                     .then(r => r.json())
                     .then(data => {
                         let diffHtml = '<pre style="white-space:pre-wrap; background:#f8f9fa; padding:15px; border-radius:6px; font-size:12px; font-family:monospace; border:1px solid #ddd; overflow-x:auto;">' + 
                                        data.diff.replace(/</g, '&lt;').replace(/>/g, '&gt;') + 
                                        '</pre>';
                         
                         let actionsHtml = `<div style="margin-top: 10px; margin-bottom: 15px;">`;
                         actionsHtml += `<button id="btn-revert-global" style="padding: 6px 12px; cursor: pointer; background: #f39c12; color: white; border: none; border-radius: 4px; margin-right: 10px;">回滚全库至此时刻</button>`;
                         if (node.getAttribute('data-synced') === 'false') {
                             actionsHtml += `<button id="btn-undo-global-commit" style="padding: 6px 12px; cursor: pointer; background: #e74c3c; color: white; border: none; border-radius: 4px;">抹掉该记录</button>`;
                         }
                         actionsHtml += `</div>`;
                         
                         historyModalContent.innerHTML = 
                            '<div style="background:#eaf2ff; color:#0e5a97; padding:10px; margin-bottom:10px; border-radius:4px; border:1px solid #b8daff;">' +
                            '<strong>🌍 全局 Commit (只读)</strong> - <code>' + hash + '</code> 时刻的详细变动。' + actionsHtml +
                            '</div>' + diffHtml;
                            
                         let revertBtn = document.getElementById('btn-revert-global');
                         if (revertBtn) {
                             revertBtn.onclick = () => {
                                 if (confirm(`超级警告：确定要将【整个知识库】强制回滚至 ${hash} 的状态吗？\n所有未提交的更改将被丢弃。`)) {
                                     fetch('/_api/revert_global', {
                                         method: 'POST',
                                         headers: { 'Content-Type': 'application/json' },
                                         body: JSON.stringify({ hash: hash })
                                     }).then(r => r.json()).then(res => {
                                         if (res.success) { alert("全库回滚成功！"); window.location.reload(); }
                                         else { alert("回滚失败: " + res.error); }
                                     });
                                 }
                             };
                         }

                         let undoBtn = document.getElementById('btn-undo-global-commit');
                         if (undoBtn) {
                             undoBtn.onclick = () => {
                                 if (confirm("确定要彻底抹掉这条全局历史记录吗？\n这是高危操作，将放弃本次提价！")) {
                                     fetch('/_api/drop_commit', {
                                         method: 'POST',
                                         headers: { 'Content-Type': 'application/json' },
                                         body: JSON.stringify({ hash: hash })
                                     }).then(r => r.json()).then(res => {
                                         if (res.success) { alert("抹除记录成功！"); window.location.reload(); }
                                         else { alert("操作失败: " + res.error); }
                                     });
                                 }
                             };
                         }
                     })
                     .catch(e => {
                         historyModalContent.innerHTML = '<h2 style="text-align:center;color:red;margin-top:20vh;">无法加载全局 Diff</h2><p>'+e.message+'</p>';
                     });
                };
            });
        })
        .catch(err => {
            container.innerHTML = '<span style="color:#999; font-size: 0.9em;">获取全局历史失败。</span>';
        });
  }

  // Expose methods globally
  window.openTimelineDrawer = openTimelineDrawer;
  window.loadGlobalHistory = loadGlobalHistory;
  window.loadPageHistory = loadPageHistory;
}

window.$docsify = window.$docsify || {};
window.$docsify.plugins = (window.$docsify.plugins || []).concat(gitTimelinePlugin);
