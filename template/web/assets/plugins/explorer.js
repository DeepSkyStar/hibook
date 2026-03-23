// explorer.js
// Dynamic Drag-and-Drop File Explorer for Docsify (VSCode Git Directory Manager Style)

(function() {
    let treeData = [];
    let gitStatusData = {};
    let draggedItem = null;

    function renderTree(container, items, depth = 0) {
        const ul = document.createElement('ul');
        ul.style.listStyleType = 'none';
        ul.style.paddingLeft = depth === 0 ? '0' : '15px';
        ul.style.margin = '0';

        items.forEach(item => {
            const li = document.createElement('li');
            li.style.margin = '2px 0';
            li.style.position = 'relative';

            const status = gitStatusData[item.path];
            let badgeHtml = '';
            let itemColor = 'var(--theme-color-text, #34495e)';
            if (status) {
                let color = status === 'M' ? '#e67e22' : (status === 'U' ? '#2ecc71' : '#e74c3c');
                itemColor = color;
                badgeHtml = `<span style="color:${color}; font-size:11px; font-weight:bold; margin-left:auto; font-family:monospace; padding-left:10px;">${status}</span>`;
            }

            const setupItemDiv = (el) => {
                el.className = 'explorer-item';
                el.dataset.path = item.path;
                el.dataset.type = item.type;
                el.style.display = 'flex';
                el.style.alignItems = 'center';
                el.style.padding = '4px 8px';
                el.style.cursor = 'pointer';
                el.style.borderRadius = '4px';
                el.style.userSelect = 'none';
                el.style.color = itemColor;
                el.style.fontSize = '14px';
                el.style.transition = 'background 0.2s';
                el.onmouseenter = () => el.style.backgroundColor = 'rgba(66, 185, 131, 0.1)';
                el.onmouseleave = () => {
                    if (!el.classList.contains('active')) el.style.backgroundColor = 'transparent';
                };
                
                // Context Menu
                el.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    showContextMenu(e.pageX, e.pageY, item);
                });
            };

            if (item.type === 'folder') {
                const details = document.createElement('details');
                
                // Check if active file is inside this folder to auto-expand
                let currentPath = decodeURIComponent(window.location.hash.replace('#/', ''));
                if (currentPath && typeof currentPath === 'string' && currentPath.startsWith(item.path + '/')) {
                    details.open = true;
                }

                const summary = document.createElement('summary');
                setupItemDiv(summary);
                summary.style.listStyle = 'none'; // hide default arrow
                
                summary.innerHTML = `<span class="folder-icon" style="margin-right:6px; display:inline-flex; align-items:center; transition:transform 0.2s; font-size:12px; transform-origin: center;"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>` + 
                                    `<span style="flex-grow:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--theme-color-text, #34495e);">${item.name}</span>`;

                // Rotate arrow on toggle
                setTimeout(() => {
                    const icon = summary.querySelector('.folder-icon');
                    if (icon) {
                        icon.style.transform = details.open ? 'rotate(90deg)' : 'rotate(0deg)';
                        details.addEventListener('toggle', () => {
                            icon.style.transform = details.open ? 'rotate(90deg)' : 'rotate(0deg)';
                        });
                    }
                }, 0);

                // Drag logic for folder
                summary.draggable = true;
                summary.addEventListener('dragstart', (e) => {
                    draggedItem = item; e.dataTransfer.effectAllowed = 'move'; summary.style.opacity = '0.5';
                });
                summary.addEventListener('dragend', () => {
                    draggedItem = null; summary.style.opacity = '1';
                    document.querySelectorAll('.explorer-drop-target').forEach(el => el.classList.remove('explorer-drop-target'));
                });
                summary.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    if (draggedItem && draggedItem.path !== item.path && !item.path.startsWith(draggedItem.path + '/')) {
                        summary.style.backgroundColor = 'rgba(66, 185, 131, 0.2)';
                        summary.classList.add('explorer-drop-target');
                    }
                });
                summary.addEventListener('dragleave', () => {
                    if (!summary.classList.contains('active')) summary.style.backgroundColor = 'transparent';
                    summary.classList.remove('explorer-drop-target');
                });
                summary.addEventListener('drop', (e) => {
                    e.preventDefault();
                    summary.classList.remove('explorer-drop-target');
                    if (!summary.classList.contains('active')) summary.style.backgroundColor = 'transparent';
                    if (draggedItem && draggedItem.path !== item.path) {
                        moveItem(draggedItem.path, item.path + '/' + draggedItem.name);
                    }
                });

                details.appendChild(summary);
                
                const childrenContainer = document.createElement('div');
                // recursive call
                childrenContainer.appendChild(renderTree(childrenContainer, item.children || [], depth + 1));
                details.appendChild(childrenContainer);
                
                li.appendChild(details);
            } else {
                const itemDiv = document.createElement('div');
                setupItemDiv(itemDiv);
                
                let cleanName = item.name;
                if (cleanName.endsWith('.md')) cleanName = cleanName.slice(0, -3);
                
                itemDiv.innerHTML = `<span style="margin-right:6px; font-size:12px; color:#888;">📄</span>` + 
                                    `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${cleanName}</span>` + 
                                    badgeHtml;
                                    
                // Drag logic for file
                itemDiv.draggable = true;
                itemDiv.addEventListener('dragstart', (e) => {
                    draggedItem = item; e.dataTransfer.effectAllowed = 'move'; itemDiv.style.opacity = '0.5';
                });
                itemDiv.addEventListener('dragend', () => {
                    draggedItem = null; itemDiv.style.opacity = '1';
                });

                itemDiv.onclick = (e) => {
                    e.stopPropagation();
                    let routePath = item.path;
                    if (routePath.endsWith('.md')) routePath = routePath.slice(0, -3);
                    window.location.hash = '#/' + routePath;
                    
                    document.querySelectorAll('.explorer-item.active').forEach(el => {
                        el.style.backgroundColor = 'transparent';
                        el.classList.remove('active');
                    });
                    itemDiv.style.backgroundColor = 'rgba(66, 185, 131, 0.1)';
                    itemDiv.classList.add('active');
                };

                li.appendChild(itemDiv);
            }

            ul.appendChild(li);
        });

        // Add root drop target if depth is 0
        if (depth === 0) {
            const rootDrop = document.createElement('div');
            rootDrop.style.height = '40px';
            rootDrop.style.marginTop = '10px';
            rootDrop.style.border = '1px dashed #ccc';
            rootDrop.style.borderRadius = '4px';
            rootDrop.style.display = 'flex';
            rootDrop.style.alignItems = 'center';
            rootDrop.style.justifyContent = 'center';
            rootDrop.style.color = '#999';
            rootDrop.style.fontSize = '12px';
            rootDrop.innerText = 'Drop here to move to root';
            
            rootDrop.addEventListener('dragover', (e) => {
                e.preventDefault();
                rootDrop.style.backgroundColor = 'rgba(66, 185, 131, 0.1)';
            });
            rootDrop.addEventListener('dragleave', () => {
                rootDrop.style.backgroundColor = 'transparent';
            });
            rootDrop.addEventListener('drop', (e) => {
                e.preventDefault();
                rootDrop.style.backgroundColor = 'transparent';
                if (draggedItem && draggedItem.path.includes('/')) {
                    moveItem(draggedItem.path, draggedItem.name); // move to root
                }
            });
            ul.appendChild(rootDrop);
        }

        return ul;
    }

    // --- Actions ---

    function moveItem(oldPath, newPath) {
        if (oldPath === newPath) return;
        fetch((window.HIBOOK_ROOT || '/') + '_api/fs/rename', {
            method: 'POST',
            body: JSON.stringify({ old_path: oldPath, new_path: newPath }),
            headers: { 'Content-Type': 'application/json' }
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                if (data.updated_links > 0) {
                    console.log(`Updated ${data.updated_links} backlinks automatically.`);
                }
                loadTree(); // Reload tree
                
                // If the moved item is the currently viewed file, update URL
                let currentHash = decodeURIComponent(window.location.hash.replace('#/', ''));
                let oldNoExt = oldPath.endsWith('.md') ? oldPath.slice(0, -3) : oldPath;
                if (currentHash === oldNoExt) {
                    let newNoExt = newPath.endsWith('.md') ? newPath.slice(0, -3) : newPath;
                    window.location.hash = '#/' + newNoExt;
                }
            } else {
                alert('Move failed: ' + data.error);
            }
        });
    }

    function createNode(parentPath, type) {
        let name = prompt(`Enter name for new ${type}:`);
        if (!name) return;
        
        if (type === 'file' && !name.endsWith('.md')) name += '.md';
        
        let targetPath = parentPath ? parentPath + '/' + name : name;
        
        fetch((window.HIBOOK_ROOT || '/') + '_api/fs/create', {
            method: 'POST',
            body: JSON.stringify({ path: targetPath, is_dir: type === 'folder' }),
            headers: { 'Content-Type': 'application/json' }
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                loadTree();
                if (type === 'file') {
                    window.location.hash = '#/' + targetPath.slice(0, -3);
                }
            } else {
                alert('Create failed: ' + data.error);
            }
        });
    }

    function renameNode(item) {
        let newName = prompt('Enter new name:', item.name);
        if (!newName || newName === item.name) return;
        
        let basePath = item.path.split('/').slice(0, -1).join('/');
        let newPath = basePath ? basePath + '/' + newName : newName;
        
        moveItem(item.path, newPath);
    }

    function deleteNode(item) {
        if (!confirm(`Are you sure you want to delete ${item.name}? This cannot be undone in the UI (but is in Git).`)) return;
        
        fetch((window.HIBOOK_ROOT || '/') + '_api/fs/delete', {
            method: 'POST',
            body: JSON.stringify({ path: item.path }),
            headers: { 'Content-Type': 'application/json' }
        })
        .then(res => res.json())
        .then(data => {
             if (data.success) loadTree();
             else alert('Delete failed: ' + data.error);
        });
    }

    // --- Context Menu UI ---

    let contextMenu = null;

    function hideContextMenu() {
        if (contextMenu) {
            contextMenu.style.display = 'none';
        }
    }

    function showContextMenu(x, y, item) {
        if (!contextMenu) {
            contextMenu = document.createElement('div');
            contextMenu.style.position = 'absolute';
            contextMenu.style.backgroundColor = 'var(--theme-bg, #fff)';
            contextMenu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            contextMenu.style.border = '1px solid #eee';
            contextMenu.style.borderRadius = '6px';
            contextMenu.style.padding = '4px 0';
            contextMenu.style.zIndex = '3000';
            contextMenu.style.minWidth = '150px';
            document.body.appendChild(contextMenu);
            
            document.addEventListener('click', hideContextMenu);
        }

        contextMenu.innerHTML = ''; // clear

        const addOption = (label, icon, onClick) => {
            const btn = document.createElement('div');
            btn.innerHTML = `<span style="margin-right:8px">${icon}</span> ${label}`;
            btn.style.padding = '8px 16px';
            btn.style.cursor = 'pointer';
            btn.style.fontSize = '13px';
            btn.style.color = 'var(--theme-color-text, #333)';
            btn.onmouseover = () => btn.style.backgroundColor = 'rgba(66, 185, 131, 0.1)';
            btn.onmouseout = () => btn.style.backgroundColor = 'transparent';
            btn.onclick = (e) => {
                e.stopPropagation();
                hideContextMenu();
                onClick();
            };
            contextMenu.appendChild(btn);
        };

        if (item.type === 'folder' || item.type === 'root') {
            let p = item.type === 'root' ? '' : item.path;
            addOption('New Note', '📄', () => createNode(p, 'file'));
            addOption('New Folder', '📁', () => createNode(p, 'folder'));
            if (item.type !== 'root') {
                const sep = document.createElement('div');
                sep.style.height = '1px'; sep.style.backgroundColor = '#eee'; sep.style.margin = '4px 0';
                contextMenu.appendChild(sep);
            }
        }

        if (item.type !== 'root') {
            addOption('Rename', '✏️', () => renameNode(item));
            addOption('Delete', '🗑️', () => deleteNode(item));
        }

        contextMenu.style.left = x + 'px';
        contextMenu.style.top = y + 'px';
        contextMenu.style.display = 'block';
    }


    function loadTree() {
        Promise.all([
            fetch((window.HIBOOK_ROOT || '/') + '_api/tree').then(res => res.json()),
            fetch((window.HIBOOK_ROOT || '/') + '_api/status').then(res => res.json()).catch(() => ({}))
        ]).then(([tree, status]) => {
            treeData = tree;
            gitStatusData = status.files || {};
            
            const panel = document.getElementById('hibook-explorer-panel');
            if (panel && window.renderExplorerTo && panel.style.display !== 'none') {
                window.renderExplorerTo(panel);
            }
        });
    }

    window.renderExplorerTo = function(container) {
        container.innerHTML = '';
        
        // Add Global Controls
        const globalRow = document.createElement('div');
        globalRow.style.display = 'flex';
        globalRow.style.padding = '10px 15px';
        globalRow.style.gap = '8px';
        globalRow.style.borderBottom = '1px solid #eaecef';
        
        const btnSave = document.createElement('button');
        btnSave.innerHTML = '✅ 保存外部更改';
        
        const btnDiscard = document.createElement('button');
        btnDiscard.innerHTML = '🗑️ 抹掉外部更改';
        
        const btnHistory = document.createElement('button');
        btnHistory.innerHTML = '🕰️ 全局历史';
        
        const hasUncommitted = Object.keys(gitStatusData || {}).length > 0;
        
        [btnSave, btnDiscard, btnHistory].forEach(btn => {
             btn.style.flex = '1';
             btn.style.border = '1px solid #dfe2e5';
             btn.style.background = '#f8f9fa';
             btn.style.padding = '6px';
             btn.style.borderRadius = '4px';
             btn.style.cursor = 'pointer';
             btn.style.fontSize = '12px';
        });
        
        if (!hasUncommitted) {
             btnSave.style.display = 'none';
             btnDiscard.style.display = 'none';
        } else {
             btnSave.style.backgroundColor = '#d4edda';
             btnSave.style.borderColor = '#c3e6cb';
             btnSave.style.color = '#155724';
             
             btnDiscard.style.backgroundColor = '#f8d7da';
             btnDiscard.style.borderColor = '#f5c6cb';
             btnDiscard.style.color = '#721c24';
        }
        
        btnSave.onclick = () => {
             let msg = prompt("确认要将所有外部文件改动提交入库吗？\n请输入 Submit Message:", "Save external changes");
             if (msg === null) return;
             
             btnSave.style.display = 'none';
             btnDiscard.style.display = 'none';
             btnSave.innerText = '⏳ 正在保存...';
             fetch((window.HIBOOK_ROOT || '/') + '_api/save_all', { method: 'POST', body: JSON.stringify({ message: msg }), headers: {'Content-Type':'application/json'}})
             .then(res => res.json()).then(data => {
                  btnSave.innerText = '✅ 保存外部更改';
                  if(data.success) {
                      loadTree(); // Refresh git status visually
                  }
                  else alert("Save failed: " + data.error);
             });
        };
        
        btnDiscard.onclick = () => {
             if (!confirm("⚠️ 危险警告！\n\n所有没有登记进版本库的新文件、通过外部软件修改的内容，都将彻底丢失，不可恢复！\n确定要抹掉它们吗？")) return;
             
             btnSave.style.display = 'none';
             btnDiscard.style.display = 'none';
             fetch((window.HIBOOK_ROOT || '/') + '_api/discard_all', { method: 'POST' })
             .then(res => res.json()).then(data => {
                  if(data.success) {
                      // Reload the entire window to ensure the current markdown file view is refreshed with the clean git state
                      window.location.reload();
                  } else {
                      alert("Discard failed: " + data.error);
                  }
             });
        };
        
        btnHistory.onclick = () => {
            // Leverage git-timeline.js global modal logic
            if (window.loadGlobalHistory) window.loadGlobalHistory(); 
            else alert("Timeline 插件未加载或版本过老。");
        };
        globalRow.appendChild(btnSave);
        globalRow.appendChild(btnDiscard);
        globalRow.appendChild(btnHistory);
        container.appendChild(globalRow);
        
        const treeContainer = document.createElement('div');
        treeContainer.style.padding = '10px 15px';
        
        // Add root drop target logic
        treeContainer.addEventListener('contextmenu', (e) => {
            if (e.target.closest('.explorer-item')) return;
            e.preventDefault();
            showContextMenu(e.pageX, e.pageY, {type: 'root'});
        });
        
        const treeDom = renderTree(treeContainer, treeData, 0);
        treeContainer.appendChild(treeDom);
        container.appendChild(treeContainer);
    };

    window.$docsify.plugins = [].concat(window.$docsify.plugins || [], function(hook, vm) {
        hook.ready(function() {
            loadTree();
        });
        
        hook.doneEach(function() {
             // Highlight current active file in tree
             let current = decodeURIComponent(window.location.hash.replace('#/', ''));
             if (!current) current = 'README';
             
             document.querySelectorAll('.explorer-item.active').forEach(el => {
                 el.style.backgroundColor = 'transparent';
                 el.classList.remove('active');
             });
             
             let match = document.querySelector(`.explorer-item[data-path="${current}.md"]`);
             if (match) {
                 match.style.backgroundColor = 'rgba(66, 185, 131, 0.1)';
                 match.classList.add('active');
                 
                 // Expand parents for the new details element logic
                 let parent = match.parentElement;
                 while(parent) {
                     if (parent.tagName === 'DETAILS') {
                         parent.open = true;
                     }
                     if (parent.id === 'hibook-explorer-panel' || (parent.classList && parent.classList.contains('sidebar-nav'))) break;
                     parent = parent.parentElement;
                 }
             }
        });
    });

})();
