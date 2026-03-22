// sidebar-tabs.js
// Dual-Tab Navigation System for Hibook

(function() {
    function injectTabs() {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) {
            setTimeout(injectTabs, 100);
            return;
        }

        // Wait for native sidebar-nav to spin up
        const nativeNav = sidebar.querySelector('.sidebar-nav');
        if (!nativeNav) {
            setTimeout(injectTabs, 100);
            return;
        }
        
        // Prevent double injection
        if (document.getElementById('hibook-sidebar-tabs')) return;

        // Container
        const tabsContainer = document.createElement('div');
        tabsContainer.id = 'hibook-sidebar-tabs';
        tabsContainer.style.display = 'flex';
        tabsContainer.style.margin = '10px 15px 0';
        tabsContainer.style.borderBottom = '1px solid #eaecef';
        
        // Style variables
        const activeColor = 'var(--theme-color, #42b983)';
        const inactiveColor = 'var(--theme-color-text, #333)';
        
        const tabTOC = document.createElement('div');
        tabTOC.innerText = '📖 目 录';
        const tabExplorer = document.createElement('div');
        tabExplorer.innerText = '📁 文 件';
        
        [tabTOC, tabExplorer].forEach(tab => {
            tab.style.flex = '1';
            tab.style.textAlign = 'center';
            tab.style.padding = '8px 0';
            tab.style.cursor = 'pointer';
            tab.style.fontSize = '14px';
            tab.style.fontWeight = 'bold';
            tabsContainer.appendChild(tab);
        });

        // The panels
        const explorerPanel = document.createElement('div');
        explorerPanel.id = 'hibook-explorer-panel';
        explorerPanel.style.display = 'none'; // Hidden by default
        explorerPanel.style.height = 'calc(100% - 100px)'; // rough calculation
        explorerPanel.style.overflowY = 'auto';

        // Wait, Docsify wraps scroll in sidebars. We will hide/show the native nav
        // and put our explorer panel right next to it.
        nativeNav.parentNode.insertBefore(tabsContainer, nativeNav);
        nativeNav.parentNode.insertBefore(explorerPanel, nativeNav.nextSibling);

        // Control buttons for Native TOC
        const tocControls = document.createElement('div');
        tocControls.style.display = 'flex';
        tocControls.style.padding = '10px 15px';
        tocControls.style.gap = '8px';
        
        const btnEdit = document.createElement('button');
        btnEdit.innerHTML = '✏️ 编辑目录';
        const btnNew = document.createElement('button');
        btnNew.innerHTML = '🆕 新建文章';
        
        [btnEdit, btnNew].forEach(btn => {
             btn.style.flex = '1';
             btn.style.border = '1px solid #dfe2e5';
             btn.style.background = '#f8f9fa';
             btn.style.padding = '6px';
             btn.style.borderRadius = '4px';
             btn.style.cursor = 'pointer';
             btn.style.fontSize = '13px';
        });
        
        btnEdit.onclick = () => {
             window.location.hash = '#/SUMMARY';
             // small delay to let page load, then click edit
             setTimeout(() => {
                 const editBtn = document.getElementById('edit-btn');
                 if (editBtn) editBtn.click();
             }, 500);
        };
        
        btnNew.onclick = () => {
             // Create custom modal for new article
             const modal = document.createElement('div');
             modal.style.position = 'fixed';
             modal.style.top = '0'; modal.style.left = '0'; modal.style.width = '100vw'; modal.style.height = '100vh';
             modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
             modal.style.zIndex = '9999';
             modal.style.display = 'flex';
             modal.style.alignItems = 'center';
             modal.style.justifyContent = 'center';
             
             const box = document.createElement('div');
             box.style.backgroundColor = 'var(--theme-bg, #fff)';
             box.style.padding = '20px';
             box.style.borderRadius = '8px';
             box.style.width = '300px';
             box.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
             
             const title = document.createElement('h3');
             title.innerText = '🆕 新建挂载文章';
             title.style.marginTop = '0';
             
             const lblName = document.createElement('label');
             lblName.innerText = '文章名 (Title)';
             lblName.style.display = 'block'; lblName.style.fontSize = '12px'; lblName.style.color = '#666';
             const inputName = document.createElement('input');
             inputName.type = 'text'; inputName.style.width = '100%'; inputName.style.marginBottom = '12px'; inputName.style.padding = '6px';
             
             const lblFolder = document.createElement('label');
             lblFolder.innerText = '保存位置 (Folder)';
             lblFolder.style.display = 'block'; lblFolder.style.fontSize = '12px'; lblFolder.style.color = '#666';
             const selectFolder = document.createElement('select');
             selectFolder.style.width = '100%'; selectFolder.style.marginBottom = '20px'; selectFolder.style.padding = '6px';
             
             // Fetch tree
             fetch('/_api/tree').then(res => res.json()).then(data => {
                 const folders = ['']; // root
                 function extractFolders(items, prefix) {
                     items.forEach(item => {
                         if (item.type === 'folder') {
                             folders.push(item.path);
                             extractFolders(item.children || [], item.path);
                         }
                     });
                 }
                 extractFolders(data, '');
                 folders.forEach(f => {
                     const opt = document.createElement('option');
                     opt.value = f;
                     opt.innerHTML = f === '' ? '/ (根目录)' : '/' + f;
                     selectFolder.appendChild(opt);
                 });
             });
             
             const btnRow = document.createElement('div');
             btnRow.style.display = 'flex'; btnRow.style.justifyContent = 'flex-end'; btnRow.style.gap = '10px';
             const btnCancel = document.createElement('button');
             btnCancel.innerText = '取消'; btnCancel.onclick = () => document.body.removeChild(modal);
             const btnSubmit = document.createElement('button');
             btnSubmit.innerText = '创建并挂载'; btnSubmit.style.backgroundColor = '#42b983'; btnSubmit.style.color = '#fff'; btnSubmit.style.border = 'none'; btnSubmit.style.padding = '6px 12px'; btnSubmit.style.borderRadius = '4px';
             
             btnSubmit.onclick = () => {
                 const name = inputName.value.trim();
                 if (!name) return alert("文章名不能为空");
                 let folderPath = selectFolder.value;
                 let targetPath = folderPath ? folderPath + '/' + name : name;
                 if (!targetPath.endsWith('.md')) targetPath += '.md';
                 
                 btnSubmit.innerText = '正在创建...';
                 btnSubmit.disabled = true;
                 
                 fetch('/_api/fs/create', {
                     method: 'POST',
                     body: JSON.stringify({ path: targetPath, is_dir: false, append_summary: true, title: name }),
                     headers: { 'Content-Type': 'application/json' }
                 }).then(res => res.json()).then(data => {
                     if (data.success) {
                         document.body.removeChild(modal);
                         window.location.hash = '#/' + targetPath.slice(0,-3);
                         setTimeout(() => location.reload(), 300);
                     } else {
                         alert('文件创建失败: ' + data.error);
                         document.body.removeChild(modal);
                     }
                 });
             };
             
             btnRow.appendChild(btnCancel); btnRow.appendChild(btnSubmit);
             box.appendChild(title); box.appendChild(lblName); box.appendChild(inputName); box.appendChild(lblFolder); box.appendChild(selectFolder); box.appendChild(btnRow);
             modal.appendChild(box);
             document.body.appendChild(modal);
             inputName.focus();
        };
        
        tocControls.appendChild(btnEdit);
        tocControls.appendChild(btnNew);
        nativeNav.parentNode.insertBefore(tocControls, nativeNav); // insert before nav list

        function switchTab(isExplorer) {
            if (isExplorer) {
                tabExplorer.style.color = activeColor;
                tabExplorer.style.borderBottom = `2px solid ${activeColor}`;
                tabTOC.style.color = inactiveColor;
                tabTOC.style.borderBottom = 'none';
                
                nativeNav.style.display = 'none';
                tocControls.style.display = 'none';
                explorerPanel.style.display = 'block';
                
                // trigger load tree if explorer logic exports a global function
                if (window.renderExplorerTo) {
                    window.renderExplorerTo(explorerPanel);
                }
            } else {
                tabTOC.style.color = activeColor;
                tabTOC.style.borderBottom = `2px solid ${activeColor}`;
                tabExplorer.style.color = inactiveColor;
                tabExplorer.style.borderBottom = 'none';
                
                nativeNav.style.display = 'block';
                tocControls.style.display = 'flex';
                explorerPanel.style.display = 'none';
            }
        }
        
        tabTOC.onclick = () => switchTab(false);
        tabExplorer.onclick = () => switchTab(true);
        
        // Init state
        switchTab(false);
    }

    window.$docsify.plugins = [].concat(window.$docsify.plugins || [], function(hook, vm) {
        hook.doneEach(function() {
            setTimeout(injectTabs, 50);
        });
    });
})();
