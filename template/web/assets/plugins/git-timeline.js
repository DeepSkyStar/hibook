// git-timeline.js
(function () {
  class HiGitTimeline extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.currentVmRouteFile = null;

      this.openTimelineDrawer = this.openTimelineDrawer.bind(this);
      this.closeTimelineDrawer = this.closeTimelineDrawer.bind(this);
      this.closeHistoryModal = this.closeHistoryModal.bind(this);
      this.loadGlobalHistory = this.loadGlobalHistory.bind(this);
      this.loadPageHistory = this.loadPageHistory.bind(this);
      this.viewHistoricalCommit = this.viewHistoricalCommit.bind(this);
    }

    connectedCallback() {
      this.render();
      if (window.addToolbarButton) {
        window.addToolbarButton('btn-git-timeline', '⏱️', 'History', this.openTimelineDrawer, 40);
      }
      
      // Expose globally for things like explorer.js and sidebar-tabs.js
      window.openTimelineDrawer = this.openTimelineDrawer;
      window.loadGlobalHistory = this.loadGlobalHistory;
      window.loadPageHistory = this.loadPageHistory;
    }

    render() {
      const isMobile = window.innerWidth <= 768;
      this.shadowRoot.innerHTML = `
        <style>
          #git-timeline-drawer {
            position: fixed;
            top: 0;
            right: 0;
            width: 350px;
            height: 100vh;
            background-color: #fff;
            box-shadow: -5px 0 15px rgba(0,0,0,0.1);
            z-index: var(--z-layer-drawer, 1000);
            transform: translateX(100%);
            transition: transform 0.3s ease-in-out;
            overflow-y: auto;
            padding: 20px;
            box-sizing: border-box;
            font-family: var(--baseFontFamily, sans-serif);
          }
          @media (prefers-color-scheme: dark) {
            #git-timeline-drawer { background-color: #1e1e1e; color: #fff; }
          }
          
          #drawer-close {
            position: absolute;
            top: 15px;
            right: 20px;
            cursor: pointer;
            font-size: 20px;
          }
          
          #drawer-title {
            margin-top: 0;
            border-bottom: 1px solid #eaecef;
            padding-bottom: 10px;
          }
          
          #history-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background-color: rgba(0,0,0,0.85);
            z-index: var(--z-layer-modal, 2000);
            display: none;
            justify-content: center;
            align-items: center;
          }
          
          #history-container {
            width: ${isMobile ? '95vw' : '80vw'};
            height: ${isMobile ? '90vh' : '85vh'};
            background-color: #ffffff;
            color: #333333;
            border-radius: 8px;
            padding: ${isMobile ? '40px 15px 15px 15px' : '30px'};
            overflow-y: auto;
            box-sizing: border-box;
            position: relative;
          }
          
          #history-close {
            position: absolute;
            top: ${isMobile ? '10px' : '15px'};
            right: ${isMobile ? '15px' : '20px'};
            color: #999;
            font-size: 24px;
            cursor: pointer;
            z-index: 9999;
          }
          #history-close:hover { color: #333; }
          
          .timeline-node {
            position: relative;
            margin-bottom: 20px;
            padding-left: 20px;
            cursor: pointer;
          }
          .timeline-node:hover {
            background-color: rgba(66, 185, 131, 0.1);
          }
          .timeline-dot {
            position: absolute;
            left: -7px;
            top: 6px;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #42b983;
            border: 2px solid #fff;
            box-shadow: 0 0 0 1px #eaecef;
          }
          
          .markdown-section pre {
             white-space: pre-wrap; word-wrap: break-word; background: transparent;
             font-family: monospace;
             background: #f8f9fa;
             padding: 15px;
             border-radius: 6px;
             font-size: 13px;
             border: 1px solid #ddd;
             overflow-x: auto;
          }
        </style>
        
        <link rel="stylesheet" href="${window.HIBOOK_ROOT || '/'}.hibook_web/vue.css">
        <link rel="stylesheet" href="${window.HIBOOK_ROOT || '/'}.hibook_web/custom.css">
        <link rel="stylesheet" href="${window.HIBOOK_ROOT || '/'}.hibook_web/katex.min.css">

        <div id="git-timeline-drawer">
          <div id="drawer-close">✕</div>
          <h3 id="drawer-title">⏱️ 变更时间线</h3>
          <div id="git-timeline-content"><span style="color:#999">请打开或刷新页面加载历史...</span></div>
        </div>

        <div id="history-modal">
          <div id="history-container">
            <div id="history-close">✕</div>
            <div id="history-content" class="markdown-section"></div>
          </div>
        </div>
      `;

      this.shadowRoot.getElementById('drawer-close').addEventListener('click', this.closeTimelineDrawer);
      this.shadowRoot.getElementById('history-close').addEventListener('click', this.closeHistoryModal);
    }

    openTimelineDrawer() {
      const title = this.shadowRoot.getElementById('drawer-title');
      if (title && title.innerHTML.includes('全局')) {
          this.loadPageHistory();
      }
      this.shadowRoot.getElementById('git-timeline-drawer').style.transform = 'translateX(0)';
    }

    closeTimelineDrawer() {
      this.shadowRoot.getElementById('git-timeline-drawer').style.transform = 'translateX(100%)';
    }

    closeHistoryModal() {
      this.shadowRoot.getElementById('history-modal').style.display = 'none';
      this.shadowRoot.getElementById('history-content').innerHTML = '';
    }

    viewHistoricalCommit(hash, filePath, isSynced) {
      const modal = this.shadowRoot.getElementById('history-modal');
      const content = this.shadowRoot.getElementById('history-content');
      
      modal.style.display = 'flex';
      content.innerHTML = '<h2 style="text-align:center;color:#999;margin-top:20vh;">加载历史版本 ' + hash + '...</h2>';
      
      fetch((window.HIBOOK_ROOT || '/') + '_api/file_at_commit?file=' + encodeURIComponent(filePath) + '&hash=' + hash)
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
               rendered = '<pre>' + text.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>';
           }
           
           content.innerHTML = 
              '<div style="background:#fffae6; color:#856404; padding:10px; margin-bottom:20px; border-radius:4px; border:1px solid #ffeeba;">' +
              '<strong>⚠️ 历史版本 (只读)</strong> - 您正在查看 <code>' + hash + '</code> 时刻的文件状态。' + actionsHtml +
              '</div>' + rendered;
              
           // Shadow DOM compatible Mermaid rendering using explicit SVG generation APIs
           if (window.mermaid) {
               const mermaidBlocks = content.querySelectorAll('.mermaid');
               mermaidBlocks.forEach((div, index) => {
                   const graphDefinition = div.textContent;
                   const uniqueId = 'mermaid-history-' + Date.now() + '-' + index;
                   
                   div.className = 'mermaid-history-container';
                   div.innerHTML = '';
                   div.style.textAlign = 'center';
                   div.style.margin = '20px 0';
                   
                   try {
                       // Mermaid v9 explicit render to SVG string bypassing global DOM queries
                       window.mermaid.render(uniqueId, graphDefinition, (svgCode) => {
                           div.innerHTML = svgCode;
                       });
                   } catch (e) {
                       console.error("Mermaid History Render Error:", e);
                       div.innerHTML = `<pre style="color:red; border:1px solid red; background:#ffeeee; text-align:left; padding:10px;">Error rendering diagram:\\n${e.message}</pre><pre style="text-align:left;">${graphDefinition}</pre>`;
                   }
               });
           }
              
           let restoreBtn = this.shadowRoot.getElementById('btn-restore-version');
           if (restoreBtn) {
              restoreBtn.onclick = () => {
                 if (confirm("确定要回滚文件内容吗？")) {
                     fetch((window.HIBOOK_ROOT || '/') + '_api/save', {
                         method: 'POST',
                         headers: { 'Content-Type': 'application/json' },
                         body: JSON.stringify({ file: filePath, content: text, message: `回滚 ${filePath} 至历史状态 ${hash}` })
                     }).then(r => r.json()).then(res => {
                         if (res.success) { alert("回滚成功！"); window.location.reload(); }
                         else { alert("操作失败: " + res.error); }
                     });
                 }
              };
           }
           
           let undoBtn = this.shadowRoot.getElementById('btn-undo-commit');
           if (undoBtn) {
               undoBtn.onclick = () => {
                   if (confirm("确定要彻底抹掉该条历史记录吗？\\n（危险操作：此操作类似 Reset，将从本地历史记录中彻底删除该节点，若与其他历史存在依赖冲突将自动终止该操作。）")) {
                       fetch((window.HIBOOK_ROOT || '/') + '_api/drop_commit', {
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
           content.innerHTML = '<h2 style="text-align:center;color:red;margin-top:20vh;">无法加载该历史版本</h2><p style="text-align:center;">' + err.message + '</p>';
        });
    }

    loadPageHistory() {
      if (!this.currentVmRouteFile) return;
      const container = this.shadowRoot.getElementById('git-timeline-content');
      if (!container) return;
      
      const title = this.shadowRoot.getElementById('drawer-title');
      if(title) title.innerHTML = '📄 页面变更时间线';
      
      const currentFile = decodeURIComponent(this.currentVmRouteFile);
      container.innerHTML = '<span style="color:#999">加载中...</span>';

      fetch((window.HIBOOK_ROOT || '/') + '_api/history?file=' + encodeURIComponent(currentFile))
      .then(response => {
        if (!response.ok) throw new Error('API off or file not tracked');
        return response.json();
      })
      .then(history => {
        if (!history || history.length === 0) {
          container.innerHTML = '<span style="color:#999; font-size: 0.9em;">暂无 Git 变更记录。</span>';
          return;
        }

        let listHtml = '<ul style="list-style:none; padding-left:0; border-left: 2px solid #eaecef; margin-left: 10px; margin-bottom: 0;">';
        history.forEach(commit => {
          let unsyncedTag = !commit.is_synced ? '<span style="color:#e67e22; font-weight:bold; margin-left:5px;">(Unsynced)</span>' : '';
          listHtml += '<li class="timeline-node" data-hash="' + commit.hash + '" data-synced="' + commit.is_synced + '">' +
                      '<div class="timeline-dot"></div>' +
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
            node.onclick = () => this.viewHistoricalCommit(node.getAttribute('data-hash'), currentFile, node.getAttribute('data-synced'));
        });
      })
      .catch(err => {
        container.innerHTML = '<span style="color:#999; font-size: 0.9em;">无法获取时间线或无记录。</span>';
      });
    }

    loadGlobalHistory() {
      this.shadowRoot.getElementById('git-timeline-drawer').style.transform = 'translateX(0)';
      
      const title = this.shadowRoot.getElementById('drawer-title');
      if(title) title.innerHTML = '🌍 全局时间线';
      
      const container = this.shadowRoot.getElementById('git-timeline-content');
      if (!container) return;
      
      container.innerHTML = '<span style="color:#999">抓取全局日志中...</span>';
      
      fetch((window.HIBOOK_ROOT || '/') + '_api/history?file=')
        .then(res => res.json())
        .then(history => {
            if (!history || history.length === 0) {
              container.innerHTML = '<span style="color:#999; font-size: 0.9em;">暂无 Git 变更记录。</span>';
              return;
            }
            
            let listHtml = '<ul style="list-style:none; padding-left:0; border-left: 2px solid #eaecef; margin-left: 10px; margin-bottom: 0;">';
            history.forEach(commit => {
              let unsyncedTag = !commit.is_synced ? '<span style="color:#e67e22; font-weight:bold; margin-left:5px;">(Unsynced)</span>' : '';
              listHtml += '<li class="timeline-node" data-hash="' + commit.hash + '" data-synced="' + commit.is_synced + '">' +
                          '<div class="timeline-dot"></div>' +
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
                node.onclick = () => {
                   const hash = node.getAttribute('data-hash');
                   const modal = this.shadowRoot.getElementById('history-modal');
                   const content = this.shadowRoot.getElementById('history-content');
                   
                   modal.style.display = 'flex';
                   content.innerHTML = '<h2 style="text-align:center;color:#999;margin-top:20vh;">获取 '+hash+' 全局改动中...</h2>';
                   
                   fetch((window.HIBOOK_ROOT || '/') + '_api/commit_info?hash=' + hash)
                     .then(r => r.json())
                     .then(data => {
                         let diffHtml = '<pre>' + data.diff.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>';
                         
                         let actionsHtml = `<div style="margin-top: 10px; margin-bottom: 15px;">`;
                         actionsHtml += `<button id="btn-revert-global" style="padding: 6px 12px; cursor: pointer; background: #f39c12; color: white; border: none; border-radius: 4px; margin-right: 10px;">回滚全库至此时刻</button>`;
                         if (node.getAttribute('data-synced') === 'false') {
                             actionsHtml += `<button id="btn-undo-global-commit" style="padding: 6px 12px; cursor: pointer; background: #e74c3c; color: white; border: none; border-radius: 4px;">抹掉该记录</button>`;
                         }
                         actionsHtml += `</div>`;
                         
                         content.innerHTML = 
                            '<div style="background:#eaf2ff; color:#0e5a97; padding:10px; margin-bottom:10px; border-radius:4px; border:1px solid #b8daff;">' +
                            '<strong>🌍 全局 Commit (只读)</strong> - <code>' + hash + '</code> 时刻的详细变动。' + actionsHtml +
                            '</div>' + diffHtml;
                            
                         let revertBtn = this.shadowRoot.getElementById('btn-revert-global');
                         if (revertBtn) {
                             revertBtn.onclick = () => {
                                 if (confirm(`超级警告：确定要将【整个知识库】强制回滚至 ${hash} 的状态吗？\\n所有未提交的更改将被丢弃。`)) {
                                     fetch((window.HIBOOK_ROOT || '/') + '_api/revert_global', {
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

                         let undoBtn = this.shadowRoot.getElementById('btn-undo-global-commit');
                         if (undoBtn) {
                             undoBtn.onclick = () => {
                                 if (confirm("确定要彻底抹掉这条全局历史记录吗？\\n这是高危操作，将放弃本次提价！")) {
                                     fetch((window.HIBOOK_ROOT || '/') + '_api/drop_commit', {
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
                         content.innerHTML = '<h2 style="text-align:center;color:red;margin-top:20vh;">无法加载全局 Diff</h2><p>'+e.message+'</p>';
                     });
                };
            });
        })
        .catch(err => {
            container.innerHTML = '<span style="color:#999; font-size: 0.9em;">获取全局历史失败。</span>';
        });
    }
  }

  customElements.define('hi-git-timeline', HiGitTimeline);

  // Docsify Plugin Hooking
  function gitTimelinePlugin(hook, vm) {
    hook.mounted(() => {
        let el = document.querySelector('hi-git-timeline');
        if (!el) {
            el = document.createElement('hi-git-timeline');
            document.body.appendChild(el);
        }
    });

    hook.doneEach(() => {
        let el = document.querySelector('hi-git-timeline');
        if (el && vm.route.file) {
            el.currentVmRouteFile = vm.route.file;
            el.loadPageHistory(); // sync timeline for the new page
        }
    });
  }

  window.$docsify = window.$docsify || {};
  window.$docsify.plugins = (window.$docsify.plugins || []).concat(gitTimelinePlugin);

})();
