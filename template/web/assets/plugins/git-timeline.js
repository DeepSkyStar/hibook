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
    drawer.style.zIndex = '10000';
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
    historyModal.style.zIndex = '10001';
    historyModal.style.display = 'none';
    historyModal.style.justifyContent = 'center';
    historyModal.style.alignItems = 'center';
    
    const hCloseBtn = document.createElement('div');
    hCloseBtn.innerHTML = '✕';
    hCloseBtn.style.position = 'absolute';
    hCloseBtn.style.top = '20px';
    hCloseBtn.style.right = '30px';
    hCloseBtn.style.color = '#fff';
    hCloseBtn.style.fontSize = '30px';
    hCloseBtn.style.cursor = 'pointer';
    hCloseBtn.onclick = () => historyModal.style.display = 'none';
    historyModal.appendChild(hCloseBtn);
    
    const hContainer = document.createElement('div');
    hContainer.style.width = '80vw';
    hContainer.style.height = '85vh';
    hContainer.style.backgroundColor = '#fff';
    hContainer.style.borderRadius = '8px';
    hContainer.style.padding = '30px';
    hContainer.style.overflowY = 'auto';
    hContainer.style.boxSizing = 'border-box';
    hContainer.style.position = 'relative';
    
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
       hContainer.style.backgroundColor = '#1e1e1e';
       hContainer.style.color = '#ccc';
    }
    
    historyModalContent = document.createElement('div');
    historyModalContent.className = 'markdown-section'; // Inherit Docsify styles
    hContainer.appendChild(historyModalContent);
    historyModal.appendChild(hContainer);
    
    document.body.appendChild(historyModal);
  }

  function openTimelineDrawer() {
    if (!drawer) initTimelineUI();
    drawer.style.transform = 'translateX(0)';
  }

  function viewHistoricalCommit(hash, filePath) {
    historyModal.style.display = 'flex';
    historyModalContent.innerHTML = '<h2 style="text-align:center;color:#999;margin-top:20vh;">加载历史版本 ' + hash + '...</h2>';
    
    fetch('/_api/file_at_commit?file=' + encodeURIComponent(filePath) + '&hash=' + hash)
      .then(res => {
         if (!res.ok) throw new Error('File not found in this commit');
         return res.text();
      })
      .then(text => {
         // Try to use Marked if available, else fallback to pre tag
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
            '<strong>⚠️ 历史版本 (只读)</strong> - 您正在查看 <code>' + hash + '</code> 时刻的文件状态。' +
            '</div>' + rendered;
      })
      .catch(err => {
         historyModalContent.innerHTML = '<h2 style="text-align:center;color:red;margin-top:20vh;">无法加载该历史版本</h2><p style="text-align:center;">' + err.message + '</p>';
      });
  }

  hook.mounted(function() {
      initTimelineUI();
      if (window.addToolbarButton) {
          window.addToolbarButton('btn-git-timeline', '⏱️', 'History', openTimelineDrawer);
      }
  });

  hook.doneEach(function() {
    var container = document.getElementById('git-timeline-content');
    if (!container || !vm.route.file) return;
    
    const currentFile = vm.route.file;
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
          listHtml += '<li class="timeline-node" data-hash="' + commit.hash + '" style="position: relative; margin-bottom: 20px; padding-left: 20px; cursor: pointer;">' +
                      '<div style="position: absolute; left: -7px; top: 6px; width: 12px; height: 12px; border-radius: 50%; background: #42b983; border: 2px solid #fff; box-shadow: 0 0 0 1px #eaecef;"></div>' +
                      '<div style="font-size: 0.85em; color: #888; margin-bottom: 6px;">' +
                      '<strong style="color: #555;">' + commit.date + '</strong> • ' + commit.author + ' ' +
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
            node.onclick = () => viewHistoricalCommit(node.getAttribute('data-hash'), currentFile);
        });
      })
      .catch(function(err) {
        container.innerHTML = '<span style="color:#999; font-size: 0.9em;">无法获取时间线或无记录。</span>';
      });
  });
}

window.$docsify = window.$docsify || {};
window.$docsify.plugins = (window.$docsify.plugins || []).concat(gitTimelinePlugin);
