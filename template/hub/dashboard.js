document.addEventListener("DOMContentLoaded", () => {
    // API Bridge binding testing placeholder
    // Wait for DOM
    loadWorkspaces();
    loadSettings();

    // Navigation logic
    const tabs = document.querySelectorAll('.nav-item');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const target = tab.getAttribute('data-tab');
            document.getElementById('workspaces-view').style.display = target === 'workspaces' ? 'block' : 'none';
            document.getElementById('settings-view').style.display = target === 'settings' ? 'block' : 'none';
        });
    });

    // Search filter
    document.getElementById('workspace-search').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll('.ws-card').forEach(card => {
            const name = card.querySelector('h3').innerText.toLowerCase();
            card.style.display = name.includes(query) ? 'block' : 'none';
        });
    });
});

// Modals
function openCreateModal() { document.getElementById('create-modal').style.display = 'flex'; }
function openCloneModal() { document.getElementById('clone-modal').style.display = 'flex'; }
function openImportModal() { document.getElementById('import-modal').style.display = 'flex'; }
function closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
    document.getElementById('create-name').value = '';
    document.getElementById('clone-url').value = '';
    document.getElementById('clone-name').value = '';
    document.getElementById('import-path').value = '';
    document.getElementById('import-name').value = '';
    
    // Export Modal resets
    const exportName = document.getElementById('export-name');
    if(exportName) exportName.value = '';
    const exportPath = document.getElementById('export-path');
    if(exportPath) exportPath.value = '';
}

async function fetchJSON(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
}

async function loadWorkspaces() {
    try {
        const kbs = await fetchJSON('/_api/workspaces');
        renderWorkspaces(kbs);
    } catch (e) {
        console.error("Failed fetching KBs", e);
    }
}

function renderWorkspaces(kbs) {
    const list = document.getElementById('kb-list');
    const empty = document.getElementById('no-kbs');
    
    list.innerHTML = '';
    if (!kbs || kbs.length === 0) {
        empty.style.display = 'block';
        return;
    }
    
    empty.style.display = 'none';
    kbs.forEach(kb => {
        const div = document.createElement('div');
        div.className = 'ws-card';
        div.style.position = 'relative'; // Ensure absolute children anchor correctly
        
        let launchBtnHtml = '';
        if (kb.active) {
            launchBtnHtml = `
                <button class="btn btn-primary" onclick="enterWorkspace('${kb.name}')">Enter</button>
                <button class="btn btn-secondary" onclick="stopWorkspace('${kb.name}')" style="margin-left: 5px; background: #e02424; border-color: #e02424; color: white;">Stop</button>
            `;
        } else {
            launchBtnHtml = `<button class="btn btn-primary btn-open" onclick="openWorkspace('${kb.name}', '${kb.path.replace(/\\/g, '\\\\')}')">Launch</button>`;
        }
        
        div.innerHTML = `
            <h3>${kb.name}</h3>
            <div class="ws-path">${kb.path}</div>
            <div class="ws-actions">
                ${kb.active ? `<span style="font-size: 11px; color:#42b983; margin-right:8px">● Active</span>` : ''}
                ${launchBtnHtml}
                <button class="btn-export" onclick="exportWorkspace('${kb.name}', '${kb.path.replace(/\\/g, '\\\\')}')" title="Export" style="margin-left: 8px;">
                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                </button>
            </div>
            <button class="btn-delete" onclick="promptDelete('${kb.name}', '${kb.path.replace(/\\/g, '\\\\')}')" title="Delete Workspace" style="position: absolute; top: 12px; right: 12px; background: none; border: none; cursor: pointer; color: #a0aec0; padding: 4px; border-radius: 4px; transition: all 0.2s;">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
        `;
        list.appendChild(div);
    });
}

function promptDelete(name, path) {
    // Create Modal Overlay dynamically
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0'; overlay.style.left = '0';
    overlay.style.width = '100%'; overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '9999';

    const modal = document.createElement('div');
    modal.style.backgroundColor = 'white';
    modal.style.padding = '24px';
    modal.style.borderRadius = '8px';
    modal.style.maxWidth = '400px';
    modal.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    
    // Stage 1 Content
    modal.innerHTML = `
        <h3 style="margin-top:0; color:#333;">移除知识库</h3>
        <p style="color:#666; font-size:14px;">只从 Hub 列表中移除该知识库？</p>
        <div style="display:flex; flex-direction:column; gap:10px; margin-top:20px;">
            <button id="btn-soft" class="btn btn-primary" style="width:100%; text-align:center;">确定 (仅移除列表)</button>
            <button id="btn-hard" class="btn" style="width:100%; text-align:center; background:#fee2e2; color:#ef4444; border:1px solid #fca5a5;">我想彻底删除本地文件</button>
            <button id="btn-cancel" class="btn btn-secondary" style="width:100%; text-align:center;">取消</button>
        </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const cleanup = () => { if (document.body.contains(overlay)) document.body.removeChild(overlay); };

    document.getElementById('btn-cancel').onclick = cleanup;

    document.getElementById('btn-soft').onclick = () => {
        fetchJSON('/_api/desktop/remove_from_hub', {
            method: 'POST', body: JSON.stringify({ name: name })
        }).then(res => {
            if (res.success) { loadWorkspaces(); cleanup(); }
        });
    };

    // Stage 2 Content
    document.getElementById('btn-hard').onclick = () => {
        modal.innerHTML = `
            <h3 style="margin-top:0; color:#dc2626;">🔴 严重警告</h3>
            <p style="color:#666; font-size:14px;">是否彻底删除本地文件夹及其所有内容？<br><br><span style="font-family:monospace; background:#f3f4f6; padding:2px 4px; border-radius:4px;">${path}</span><br><br><b>此操作不可逆！</b></p>
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
                <button id="btn-cancel-2" class="btn btn-secondary">取消</button>
                <button id="btn-confirm-hard" class="btn" style="background:#dc2626; color:white; border:none;">永久删除</button>
            </div>
        `;
        document.getElementById('btn-cancel-2').onclick = cleanup;
        document.getElementById('btn-confirm-hard').onclick = () => {
            document.getElementById('btn-confirm-hard').innerText = '删除中...';
            document.getElementById('btn-confirm-hard').disabled = true;
            fetchJSON('/_api/desktop/delete', {
                method: 'POST', body: JSON.stringify({ name: name })
            }).then(res => {
                if (res.success) { loadWorkspaces(); cleanup(); }
                else { alert('删除失败: ' + res.error); cleanup(); }
            }).catch(err => { alert('删除异常: ' + err.message); cleanup(); });
        };
    };
}

async function openWorkspace(name, path) {
    try {
        const res = await fetchJSON('/_api/desktop/launch', {
            method: 'POST', body: JSON.stringify({name})
        });
        if (res.success && res.url) {
            console.log(`Workspace ${name} silently launched. Ready for Enter action.`);
        }
        loadWorkspaces();
    } catch (err) {
        alert("Error launching: " + err);
    }
}

function enterWorkspace(name) {
    window.open(`/${name}/`, '_blank');
}

async function stopWorkspace(name) {
    try {
        await fetchJSON('/_api/desktop/unregister', { method: 'POST', body: JSON.stringify({name}) });
        loadWorkspaces();
    } catch (err) {
        alert("Error stopping: " + err);
    }
}

function exportWorkspace(name) {
    const modal = document.getElementById('export-modal');
    if(modal) {
        modal.style.display = 'flex';
        document.getElementById('export-alias').value = name;
    }
}

async function submitExport() {
    const name = document.getElementById('export-alias').value;
    const exportName = document.getElementById('export-name').value.trim();
    const exportPath = document.getElementById('export-path').value.trim();
    
    const btn = document.querySelector('#export-modal .btn-primary');
    try {
        btn.innerText = "Exporting Workspace..."; 
        btn.disabled = true;
        
        const res = await fetchJSON('/_api/desktop/export', {
            method: 'POST', 
            body: JSON.stringify({
                name: name,
                exportName: exportName,
                exportPath: exportPath
            })
        });
        
        closeModals();
        if (res.success) {
            alert("Export Completed to: " + res.path);
        }
    } catch (err) {
        alert("Export failed: " + err.message);
    } finally {
        btn.innerText = "Start Export"; 
        btn.disabled = false;
    }
}

let currentDirPickerInputId = null;
let currentDirPickerPath = "";

async function pickFolder(targetId) {
    currentDirPickerInputId = targetId;
    document.getElementById('dir-picker-modal').style.display = 'flex';
    document.getElementById('dir-picker-list').innerHTML = '<div style="padding:20px;text-align:center;color:#888;">Loading...</div>';
    
    // Start at current value or home
    let startPath = document.getElementById(targetId).value.trim();
    await loadDir(startPath || '~');
}

function closeDirPicker() {
    document.getElementById('dir-picker-modal').style.display = 'none';
    currentDirPickerInputId = null;
}

async function loadDir(path) {
    try {
        const res = await fetchJSON('/_api/desktop/list_dirs', { method: 'POST', body: JSON.stringify({path: path}) });
        if (res.success) {
            currentDirPickerPath = res.current_path;
            document.getElementById('dir-picker-path').innerText = res.current_path;
            
            let html = '';
            if (res.parent_path) {
                html += `<div class="dir-item" onclick="loadDir('${res.parent_path.replace(/\\/g, '\\\\').replace(/'/g, '\\\'')}')">
                    <span class="dir-item-icon"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></span> ... (Go Up)
                </div>`;
            }
            
            for (const d of res.dirs) {
                html += `<div class="dir-item" onclick="loadDir('${d.path.replace(/\\/g, '\\\\').replace(/'/g, '\\\'')}')">
                    <span class="dir-item-icon"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2-2H5a2 2 0 0 0-2 2z"></path></svg></span> ${d.name}
                </div>`;
            }
            
            if (res.dirs.length === 0) {
                html += '<div style="padding:20px;text-align:center;color:#888;">Empty directory</div>';
            }
            
            document.getElementById('dir-picker-list').innerHTML = html;
        } else {
            alert("Failed to list directory: " + res.error);
        }
    } catch (err) {
        console.error("Dir load error:", err);
    }
}

function confirmDirSelection() {
    if (currentDirPickerInputId && currentDirPickerPath) {
        document.getElementById(currentDirPickerInputId).value = currentDirPickerPath;
    }
    closeDirPicker();
}

async function submitCreate() {
    const name = document.getElementById('create-name').value.trim();
    const parentPath = document.getElementById('create-path').value.trim();
    if (!name) return alert("Please enter a name");
    try {
        await fetchJSON('/_api/desktop/create', { method: 'POST', body: JSON.stringify({name: name, parent_path: parentPath}) });
        closeModals();
        loadWorkspaces();
    } catch (err) {
        alert("Error: " + err);
    }
}

async function submitClone() {
    const url = document.getElementById('clone-url').value.trim();
    const name = document.getElementById('clone-name').value.trim();
    const parentPath = document.getElementById('clone-path').value.trim();
    if (!url) return alert("Please enter Git URI");
    const btn = document.querySelector('#clone-modal .btn-primary');
    try {
        btn.innerText = "Cloning Repository..."; btn.disabled = true;
        await fetchJSON('/_api/desktop/clone', { method: 'POST', body: JSON.stringify({url: url, name: name, parent_path: parentPath}) });
        closeModals();
        loadWorkspaces();
    } catch (err) {
        alert("Error: " + err);
    } finally {
        btn.innerText = "Clone Repository"; btn.disabled = false;
    }
}

async function submitImport() {
    const path = document.getElementById('import-path').value.trim();
    let name = document.getElementById('import-name').value.trim();
    if (!path) return alert("Please enter the Absolute Local Path");
    
    if (!name) {
        // Auto-infer name from the last segment of the path exactly like hibook web does
        name = path.split('/').filter(Boolean).pop() || 'imported-kb';
    }
    
    try {
        await fetchJSON('/_api/desktop/register', { method: 'POST', body: JSON.stringify({name: name, path: path}) });
        closeModals();
        loadWorkspaces();
    } catch (err) {
        alert("Error importing: " + err);
    }
}

// Settings
async function loadSettings() {
    // Deprecated. Port settings managed via HiConfig global config explicitly or command-line args. 
    // This frontend has no knowledge of port overriding natively since it is running ON the port.
    document.getElementById('setting-port').value = window.location.port || '3000';
}

async function saveSettings() {
    const port = parseInt(document.getElementById('setting-port').value) || 3000;
    // Notify user to restart manually since we can't reliably hot-swap the root listening port safely from the browser
    alert("Port saved logic is restricted in the Hub. Please restart the daemon using 'hibook stop' then 'hibook start -p " + port + "'.");
}

// Sidebar Toggle Logic
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        sidebar.classList.toggle('sidebar-closed');
    }
}
window.toggleSidebar = toggleSidebar;
