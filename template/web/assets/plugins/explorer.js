// explorer.js
// Dynamic Drag-and-Drop File Explorer for Docsify (VSCode Git Directory Manager Style)

(function() {

    class HiExplorer extends HTMLElement {
        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
            this.treeData = [];
            this.gitStatusData = {};
            this.draggedItem = null;
            this.contextMenu = null;
            
            this.hideContextMenu = this.hideContextMenu.bind(this);
            this.onHashChange = this.onHashChange.bind(this);
        }

        connectedCallback() {
            this.renderHost();
            this.loadTree();
            window.addEventListener('hashchange', this.onHashChange);
            document.addEventListener('click', this.hideContextMenu);
        }

        disconnectedCallback() {
            window.removeEventListener('hashchange', this.onHashChange);
            document.removeEventListener('click', this.hideContextMenu);
        }

        onHashChange() {
             let current = decodeURIComponent(window.location.hash.replace('#/', ''));
             if (!current) current = 'README';
             
             this.shadowRoot.querySelectorAll('.explorer-item.active').forEach(el => {
                 el.style.backgroundColor = 'transparent';
                 el.classList.remove('active');
             });
             
             let match = this.shadowRoot.querySelector(`.explorer-item[data-path="${current}.md"]`) || this.shadowRoot.querySelector(`.explorer-item[data-path="${current}"]`);
             
             if (match) {
                 match.style.backgroundColor = 'rgba(66, 185, 131, 0.1)';
                 match.classList.add('active');
                 
                 let parent = match.parentElement;
                 while(parent && parent !== this.shadowRoot) {
                     if (parent.tagName === 'DETAILS') {
                         parent.open = true;
                     }
                     parent = parent.parentElement;
                 }
             }
        }

        loadTree() {
            Promise.all([
                fetch((window.HIBOOK_ROOT || '/') + '_api/tree').then(res => res.json()),
                fetch((window.HIBOOK_ROOT || '/') + '_api/status').then(res => res.json()).catch(() => ({}))
            ]).then(([tree, status]) => {
                this.treeData = tree;
                this.gitStatusData = status.files || {};
                this.render();
                setTimeout(() => this.onHashChange(), 50);
            }).catch(err => {
                if (this.shadowRoot) {
                     this.shadowRoot.innerHTML = `<div style="padding: 20px; color: #e74c3c; font-size: 13px; font-weight: bold; background: #fdf2f2; border: 1px solid #f5c6cb; border-radius: 4px; margin: 10px;">📉 File Explorer Crash:<br><br>${err.message}<br><br>Please check Developer Console.</div>`;
                }
                console.error("HiExplorer loadTree failed:", err);
            });
        }

        renderHost() {
            this.shadowRoot.innerHTML = `
                <style>
                    :host { display: block; height: 100%; display: flex; flex-direction: column; }
                    .global-controls { display: flex; padding: 10px 15px; gap: 8px; border-bottom: 1px solid #eaecef; flex-shrink: 0; }
                    .global-controls button { flex: 1; border: 1px solid #dfe2e5; background: #f8f9fa; padding: 6px; border-radius: 4px; cursor: pointer; font-size: 12px; }
                    .tree-container { padding: 10px 15px; flex-grow: 1; overflow-y: auto; }
                    .explorer-item { display: flex; align-items: center; padding: 4px 8px; cursor: pointer; border-radius: 4px; user-select: none; font-size: 14px; transition: background 0.2s; }
                    .explorer-item:hover { background-color: rgba(66, 185, 131, 0.1); }
                    .explorer-drop-target { background-color: rgba(66, 185, 131, 0.2) !important; }
                    details > summary { list-style: none; }
                    details > summary::-webkit-details-marker { display: none; }
                </style>
                <div class="global-controls" id="controls"></div>
                <div class="tree-container" id="tree"></div>
            `;
            
            const treeContainer = this.shadowRoot.getElementById('tree');
            treeContainer.addEventListener('contextmenu', (e) => {
                if (e.target.closest('.explorer-item')) return;
                e.preventDefault();
                this.showContextMenu(e.clientX, e.clientY, {type: 'root'});
            });
        }

        render() {
            const controls = this.shadowRoot.getElementById('controls');
            controls.innerHTML = '';
            
            const btnSave = document.createElement('button');
            btnSave.innerHTML = '✅ 保存外部更改';
            const btnDiscard = document.createElement('button');
            btnDiscard.innerHTML = '🗑️ 抹掉外部更改';
            const btnHistory = document.createElement('button');
            btnHistory.innerHTML = '🕰️ 全局历史';
            
            const hasUncommitted = Object.keys(this.gitStatusData || {}).length > 0;
            
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
                 let msg = prompt("确认要将所有外部文件改动提交入库吗？\\n请输入 Submit Message:", "Save external changes");
                 if (msg === null) return;
                 btnSave.style.display = 'none';
                 btnDiscard.style.display = 'none';
                 btnSave.innerText = '⏳ 正在保存...';
                 fetch((window.HIBOOK_ROOT || '/') + '_api/save_all', { method: 'POST', body: JSON.stringify({ message: msg }), headers: {'Content-Type':'application/json'}})
                 .then(res => res.json()).then(data => {
                      if(data.success) { this.loadTree(); }
                      else alert("Save failed: " + data.error);
                 });
            };
            
            btnDiscard.onclick = () => {
                 if (!confirm("⚠️ 危险警告！\\n\\n所有没有登记进版本库的新文件、通过外部软件修改的内容，都将彻底丢失，不可恢复！\\n确定要抹掉它们吗？")) return;
                 btnSave.style.display = 'none';
                 btnDiscard.style.display = 'none';
                 fetch((window.HIBOOK_ROOT || '/') + '_api/discard_all', { method: 'POST' })
                 .then(res => res.json()).then(data => {
                      if(data.success) { window.location.reload(); } 
                      else { alert("Discard failed: " + data.error); }
                 });
            };
            
            btnHistory.onclick = () => {
                if (window.loadGlobalHistory) window.loadGlobalHistory(); 
                else alert("Timeline 插件未加载或版本过老。");
            };
            
            controls.appendChild(btnSave);
            controls.appendChild(btnDiscard);
            controls.appendChild(btnHistory);
            
            const treeContainer = this.shadowRoot.getElementById('tree');
            treeContainer.innerHTML = '';
            
            const treeDom = this.buildTreeDOM(this.treeData, 0);
            treeContainer.appendChild(treeDom);
        }

        buildTreeDOM(items, depth) {
            const ul = document.createElement('ul');
            ul.style.listStyleType = 'none';
            ul.style.paddingLeft = depth === 0 ? '0' : '15px';
            ul.style.margin = '0';

            items.forEach(item => {
                const li = document.createElement('li');
                li.style.margin = '2px 0';
                li.style.position = 'relative';

                const status = this.gitStatusData[item.path];
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
                    el.style.color = itemColor;
                    
                    el.onmouseleave = () => {
                        if (!el.classList.contains('active')) el.style.backgroundColor = 'transparent';
                    };
                    
                    el.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.showContextMenu(e.clientX, e.clientY, item);
                    });
                };

                if (item.type === 'folder') {
                    const details = document.createElement('details');
                    
                    let currentPath = decodeURIComponent(window.location.hash.replace('#/', ''));
                    if (currentPath && typeof currentPath === 'string' && currentPath.startsWith(item.path + '/')) {
                        details.open = true;
                    }

                    const summary = document.createElement('summary');
                    setupItemDiv(summary);
                    
                    summary.innerHTML = `<span class="folder-icon" style="margin-right:6px; display:inline-flex; align-items:center; transition:transform 0.2s; font-size:12px; transform-origin: center;"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>` + 
                                        `<span style="flex-grow:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--theme-color-text, #34495e);">${item.name}</span>`;

                    // Rotate arrow
                    setTimeout(() => {
                        const icon = summary.querySelector('.folder-icon');
                        if (icon) {
                            icon.style.transform = details.open ? 'rotate(90deg)' : 'rotate(0deg)';
                            details.addEventListener('toggle', () => {
                                icon.style.transform = details.open ? 'rotate(90deg)' : 'rotate(0deg)';
                            });
                        }
                    }, 0);

                    // Drag logic
                    summary.draggable = true;
                    summary.addEventListener('dragstart', (e) => {
                        this.draggedItem = item; e.dataTransfer.effectAllowed = 'move'; summary.style.opacity = '0.5';
                    });
                    summary.addEventListener('dragend', () => {
                        this.draggedItem = null; summary.style.opacity = '1';
                        this.shadowRoot.querySelectorAll('.explorer-drop-target').forEach(el => el.classList.remove('explorer-drop-target'));
                    });
                    summary.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        if (this.draggedItem && this.draggedItem.path !== item.path && !item.path.startsWith(this.draggedItem.path + '/')) {
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
                        if (this.draggedItem && this.draggedItem.path !== item.path) {
                            this.moveItem(this.draggedItem.path, item.path + '/' + this.draggedItem.name);
                        }
                    });

                    details.appendChild(summary);
                    
                    const childrenContainer = document.createElement('div');
                    childrenContainer.appendChild(this.buildTreeDOM(item.children || [], depth + 1));
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
                                        
                    itemDiv.draggable = true;
                    itemDiv.addEventListener('dragstart', (e) => {
                        this.draggedItem = item; e.dataTransfer.effectAllowed = 'move'; itemDiv.style.opacity = '0.5';
                    });
                    itemDiv.addEventListener('dragend', () => {
                        this.draggedItem = null; itemDiv.style.opacity = '1';
                    });

                    itemDiv.onclick = (e) => {
                        e.stopPropagation();
                        let routePath = item.path;
                        if (routePath.endsWith('.md')) routePath = routePath.slice(0, -3);
                        window.location.hash = '#/' + routePath;
                    };

                    li.appendChild(itemDiv);
                }
                ul.appendChild(li);
            });

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
                    if (this.draggedItem && this.draggedItem.path.includes('/')) {
                        this.moveItem(this.draggedItem.path, this.draggedItem.name);
                    }
                });
                ul.appendChild(rootDrop);
            }
            return ul;
        }

        moveItem(oldPath, newPath) {
            if (oldPath === newPath) return;
            fetch((window.HIBOOK_ROOT || '/') + '_api/fs/rename', {
                method: 'POST',
                body: JSON.stringify({ old_path: oldPath, new_path: newPath }),
                headers: { 'Content-Type': 'application/json' }
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    this.loadTree();
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

        createNode(parentPath, type) {
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
                    this.loadTree();
                    if (type === 'file') window.location.hash = '#/' + targetPath.slice(0, -3);
                } else {
                    alert('Create failed: ' + data.error);
                }
            });
        }

        renameNode(item) {
            let newName = prompt('Enter new name:', item.name);
            if (!newName || newName === item.name) return;
            let basePath = item.path.split('/').slice(0, -1).join('/');
            let newPath = basePath ? basePath + '/' + newName : newName;
            this.moveItem(item.path, newPath);
        }

        deleteNode(item) {
            if (!confirm(`Are you sure you want to delete ${item.name}? This cannot be undone in the UI (but is in Git).`)) return;
            fetch((window.HIBOOK_ROOT || '/') + '_api/fs/delete', {
                method: 'POST',
                body: JSON.stringify({ path: item.path }),
                headers: { 'Content-Type': 'application/json' }
            })
            .then(res => res.json())
            .then(data => {
                 if (data.success) this.loadTree();
                 else alert('Delete failed: ' + data.error);
            });
        }

        hideContextMenu() {
            if (this.contextMenu) {
                this.contextMenu.style.display = 'none';
            }
        }

        showContextMenu(x, y, item) {
            if (!this.contextMenu) {
                this.contextMenu = document.createElement('div');
                this.contextMenu.style.position = 'fixed';
                this.contextMenu.style.backgroundColor = 'var(--theme-bg, #fff)';
                this.contextMenu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                this.contextMenu.style.border = '1px solid #eee';
                this.contextMenu.style.borderRadius = '6px';
                this.contextMenu.style.padding = '4px 0';
                this.contextMenu.style.zIndex = '3000';
                this.contextMenu.style.minWidth = '150px';
                this.shadowRoot.appendChild(this.contextMenu);
            }

            this.contextMenu.innerHTML = '';

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
                    this.hideContextMenu();
                    onClick();
                };
                this.contextMenu.appendChild(btn);
            };

            if (item.type === 'folder' || item.type === 'root') {
                let p = item.type === 'root' ? '' : item.path;
                addOption('New Note', '📄', () => this.createNode(p, 'file'));
                addOption('New Folder', '📁', () => this.createNode(p, 'folder'));
                if (item.type !== 'root') {
                    const sep = document.createElement('div');
                    sep.style.height = '1px'; sep.style.backgroundColor = '#eee'; sep.style.margin = '4px 0';
                    this.contextMenu.appendChild(sep);
                }
            }

            if (item.type !== 'root') {
                addOption('Rename', '✏️', () => this.renameNode(item));
                addOption('Delete', '🗑️', () => this.deleteNode(item));
            }

            this.contextMenu.style.left = x + 'px';
            this.contextMenu.style.top = y + 'px';
            this.contextMenu.style.display = 'block';
        }
    }

    customElements.define('hi-explorer', HiExplorer);

    // Backward compatibility shim for sidebar-tabs.js which expects to call renderExplorerTo
    window.renderExplorerTo = function(container) {
        try {
            if (!container.querySelector('hi-explorer')) {
                container.innerHTML = '<hi-explorer></hi-explorer>';
            } else {
                const explorer = container.querySelector('hi-explorer');
                if (explorer.loadTree) explorer.loadTree();
            }
        } catch(e) {
            container.innerHTML = `<div style="color:red; margin:20px;">renderExplorerTo Crash: ${e.message}</div>`;
        }
    };

    // Docsify Plugin Shim to remove old tight coupling
    // Nothing needs to happen here since HiExplorer is autonomous!
    window.$docsify = window.$docsify || {};
    window.$docsify.plugins = [].concat(window.$docsify.plugins || [], function(hook, vm) {});

})();
