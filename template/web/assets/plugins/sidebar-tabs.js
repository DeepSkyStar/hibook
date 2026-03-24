// sidebar-tabs.js
// Dual-Tab Navigation System for Hibook

(function() {
    function injectTabs() {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) {
            setTimeout(injectTabs, 100);
            return;
        }
        
        const nativeNav = sidebar.querySelector('.sidebar-nav');
        if (!nativeNav) {
            setTimeout(injectTabs, 100);
            return;
        }

        function transformDocsifyTOC() {
            // Docsify over-writes nativeNav.innerHTML on each navigation.
            // When it does, it drops a fresh <ul>. 
            const rootUL = nativeNav.querySelector(':scope > ul') || nativeNav.querySelector('ul');
            if (!rootUL) return;

            function convertUL(ul, depth) {
                ul.style.listStyleType = 'none';
                ul.style.paddingLeft = depth === 0 ? '0' : '15px';
                ul.style.margin = '0';
                
                let anyActive = false;
                
                // Clone array to safely modify DOM while iterating
                Array.from(ul.children).forEach(li => {
                    if (li.tagName !== 'LI') return;
                    
                    const isDirectlyActive = li.classList.contains('active');
                    
                    let link = li.querySelector(':scope > a') || li.querySelector(':scope > p > a') || li.querySelector(':scope > p') || li.querySelector(':scope > span');
                    let subUL = li.querySelector(':scope > ul');
                    
                    let name = link ? link.innerText : (li.childNodes[0] ? li.childNodes[0].textContent.trim() : '');
                    let href = link && link.tagName === 'A' ? link.getAttribute('href') : null;
                    
                    li.style.margin = '2px 0';
                    li.style.position = 'relative';
                    
                    // Remove old Docsify tags but keep the subUL
                    const oldElements = Array.from(li.children).filter(el => el.tagName !== 'UL');
                    oldElements.forEach(el => li.removeChild(el));
                    
                    if (subUL) {
                        const details = document.createElement('details');
                        
                        const summary = document.createElement('summary');
                        summary.className = 'explorer-item';
                        if (isDirectlyActive) {
                            summary.classList.add('active');
                            anyActive = true;
                        }
                        
                        summary.style.display = 'flex';
                        summary.style.alignItems = 'center';
                        summary.style.padding = '4px 8px';
                        summary.style.cursor = 'pointer';
                        summary.style.borderRadius = '4px';
                        summary.style.listStyle = 'none';
                        summary.style.color = 'var(--theme-color-text, #34495e)';
                        summary.style.fontSize = '14px';
                        
                        if (href) summary.setAttribute('data-href', href);

                        let svgArrow = `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style="transition: transform 0.2s;"><path d="M8 5v14l11-7z"/></svg>`;
                        summary.innerHTML = `<span class="folder-icon" style="margin-right:6px; display:inline-flex; align-items:center; font-size:12px; transform-origin: center;">${svgArrow}</span>` + 
                                            `<a href="${href || '#'}" style="flex-grow:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:inherit;text-decoration:none;">${name}</a>`;
                        
                        const icon = summary.querySelector('.folder-icon svg');
                        
                        const childActive = convertUL(subUL, depth + 1);
                        
                        details.appendChild(summary);
                        details.appendChild(subUL); // Move UL inside details
                        li.appendChild(details);    // Put details in LI
                        
                        if (isDirectlyActive || childActive) {
                            details.open = true;
                            anyActive = true;
                        } else {
                            details.open = (depth === 0);
                        }
                        
                        icon.style.transform = details.open ? 'rotate(90deg)' : 'rotate(0deg)';
                        
                        if (isDirectlyActive) {
                            summary.style.backgroundColor = 'rgba(66, 185, 131, 0.1)';
                            summary.style.color = 'var(--theme-color, #42b983)';
                        }

                        summary.onmouseover = () => { if(!summary.classList.contains('active')) summary.style.backgroundColor = 'rgba(66, 185, 131, 0.1)'; };
                        summary.onmouseout = () => { if(!summary.classList.contains('active')) summary.style.backgroundColor = 'transparent'; };
                        
                        summary.onclick = (e) => {
                            if (e.target.closest('.folder-icon') || !href) {
                                e.preventDefault();
                                details.open = !details.open;
                            } else {
                                // Let Docsify route the click on the <a>
                                details.open = true;
                            }
                            icon.style.transform = details.open ? 'rotate(90deg)' : 'rotate(0deg)';
                        };
                    } else {
                        const itemDiv = document.createElement('a');
                        itemDiv.className = 'explorer-item';
                        if (isDirectlyActive) {
                            itemDiv.classList.add('active');
                            anyActive = true;
                        }
                        
                        itemDiv.style.display = 'flex';
                        itemDiv.style.alignItems = 'center';
                        itemDiv.style.padding = '4px 8px'; 
                        itemDiv.style.cursor = 'pointer';
                        itemDiv.style.borderRadius = '4px';
                        itemDiv.style.fontSize = '14px';
                        itemDiv.style.color = 'var(--theme-color-text, #34495e)';
                        itemDiv.style.textDecoration = 'none';
                        itemDiv.href = href || '#';
                        
                        if (href) itemDiv.setAttribute('data-href', href);
                        // Files don't have an icon as per user request, but we add an 18px spacer (12 icon + 6 margin) to perfectly align file text with folder text
                        itemDiv.innerHTML = `<span style="width:18px; display:inline-block; flex-shrink:0;"></span><span style="flex-grow:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:inherit;">${name}</span>`;
                        
                        if (isDirectlyActive) {
                            itemDiv.style.backgroundColor = 'rgba(66, 185, 131, 0.1)';
                            itemDiv.style.color = 'var(--theme-color, #42b983)';
                        }
                        
                        itemDiv.onmouseover = () => { if(!itemDiv.classList.contains('active')) itemDiv.style.backgroundColor = 'rgba(66, 185, 131, 0.1)'; };
                        itemDiv.onmouseout = () => { if(!itemDiv.classList.contains('active')) itemDiv.style.backgroundColor = 'transparent'; };
                        
                        li.appendChild(itemDiv);
                    }
                });
                return anyActive;
            }
            
            convertUL(rootUL, 0);
            nativeNav.style.paddingLeft = '0'; // Clean outer pad
        }

        transformDocsifyTOC();
        
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
        tabTOC.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg> 目 录';
        const tabExplorer = document.createElement('div');
        tabExplorer.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg> 文 件';
        
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
        btnEdit.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg> 编辑目录';
        const btnNew = document.createElement('button');
        btnNew.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg> 新建文章';
        
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
             title.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg> 新建挂载文章';
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
             fetch((window.HIBOOK_ROOT || '/') + '_api/tree').then(res => res.json()).then(data => {
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
                 
                 fetch((window.HIBOOK_ROOT || '/') + '_api/fs/create', {
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
            injectTabs(); // Synchronous to eliminate FOUC!
        });
    });
})();
