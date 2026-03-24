#!/usr/bin/env python3
# coding=utf-8

import os
import shutil
import http.server
import socketserver
import urllib.parse
import re
import subprocess
import json
from hi_basic import *
from hi_basic import HiLog
import time as _time
from hi_search import SearchManager
import hi_export
import threading

# Dynamic Webview Multiplexing Router
HUB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'template', 'hub')

ROUTE_MAP = {
    '': HUB_DIR # Default route always points to the native Hub UI
}

_route_context = threading.local()

def get_routing_context(url_path):
    parts = url_path.strip('/').split('/', 1)
    if parts and parts[0] in ROUTE_MAP and parts[0] != '':
        route_name = parts[0]
        remaining_path = '/' + (parts[1] if len(parts) > 1 else '')
        return route_name, remaining_path, ROUTE_MAP[route_name]
    return '', url_path, ROUTE_MAP.get('', os.getcwd())

# Thread-safe transparent process virtualization
_original_run = subprocess.run
_original_check_output = subprocess.check_output
_original_check_call = subprocess.check_call

def _wrapped_run(*args, **kwargs):
    if 'cwd' not in kwargs and hasattr(_route_context, 'cwd'): kwargs['cwd'] = _route_context.cwd
    return _original_run(*args, **kwargs)

def _wrapped_check_output(*args, **kwargs):
    if 'cwd' not in kwargs and hasattr(_route_context, 'cwd'): kwargs['cwd'] = _route_context.cwd
    return _original_check_output(*args, **kwargs)

def _wrapped_check_call(*args, **kwargs):
    if 'cwd' not in kwargs and hasattr(_route_context, 'cwd'): kwargs['cwd'] = _route_context.cwd
    return _original_check_call(*args, **kwargs)

subprocess.run = _wrapped_run
subprocess.check_output = _wrapped_check_output
subprocess.check_call = _wrapped_check_call

def get_cwd():
    return getattr(_route_context, 'cwd', os.getcwd())

_graph_cache = None
_graph_cache_time = 0

def _is_sync_required():
    try:
        # Check if local is behind remote. Fast timeout.
        subprocess.run(['git', 'fetch'], capture_output=True, timeout=3)
        res = subprocess.run(['git', 'status', '-sb'], capture_output=True, text=True)
        if '[behind' in res.stdout:
            return True
        return False
    except Exception:
        return False


def get_knowledge_graph(root_dir):
    global _graph_cache, _graph_cache_time
    # Cache for 2 seconds to avoid storm of rebuilds
    if _graph_cache and (_time.time() - _graph_cache_time) < 2.0:
        return _graph_cache
        
    nodes = []
    edges = []
    file_contents = {}
    
    for root, dirs, files in os.walk(root_dir):
        dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ['template']]
        for f in files:
            if f.endswith('.md'):
                path = os.path.relpath(os.path.join(root, f), root_dir)
                if path in ['SUMMARY.md', 'RULE.md']:
                    continue
                file_contents[path] = os.path.join(root, f)
                
    nodes = []
    
    basename_to_path = {}
    for path in file_contents.keys():
        basename = os.path.basename(path)[:-3]
        basename_to_path[basename] = path
        
    backlinks = {path: [] for path in file_contents.keys()}
    
    for path, full_path in file_contents.items():
        try:
            with open(full_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Extract metadata using centralized parser
            search_mgr = SearchManager.get_instance(root_dir)
            title, tags, aliases, body = search_mgr.parse_frontmatter(content)
            label = title if title else os.path.basename(path)[:-3]
            nodes.append({"id": path, "label": label, "tags": tags, "aliases": aliases})
                
            for match in re.finditer(r'\[\[(.*?)\]\]', body):
                wl = match.group(1)
                target = basename_to_path.get(wl)
                if not target and wl + ".md" in file_contents: 
                    target = wl + ".md"
                if target:
                    start = max(0, match.start() - 30)
                    end = min(len(body), match.end() + 30)
                    snippet = body[start:end].replace('\n', ' ')
                    edges.append({"source": path, "target": target})
                    backlinks[target].append({"source": path, "type": "wikilink", "text": wl, "snippet": snippet})
                    
            for match in re.finditer(r'\[([^\]]+)\]\(([^\)]+)\)', body):
                text = match.group(1).strip()
                link = match.group(2).split('#')[0].strip() # Trim hash fragments
                
                if not link or link.startswith('http'):
                    continue
                    
                # Auto-resolve directory links natively to Docsify's README.md
                if not link.endswith('.md'):
                    if link.endswith('/'):
                        link += "README.md"
                    elif not "." in link.split('/')[-1]:
                        link += "/README.md"
                    else:
                        continue # Ignore .png, .jpg files, etc.
                        
                # Fix routing resolving absolute / prefixes dynamically
                if link.startswith('/'):
                    target_path = os.path.normpath(link.lstrip('/'))
                else:
                    target_path = os.path.normpath(os.path.join(os.path.dirname(path), link))
                    
                if target_path in file_contents:
                     start = max(0, match.start() - 30)
                     end = min(len(body), match.end() + 30)
                     snippet = body[start:end].replace('\n', ' ')
                     edges.append({"source": path, "target": target_path})
                     backlinks[target_path].append({"source": path, "type": "link", "text": text, "snippet": snippet})
        except Exception:
            # Fallback for unreadable files
            nodes.append({"id": path, "label": os.path.basename(path)[:-3]})
            pass
            
    _graph_cache = {"nodes": nodes, "edges": edges, "backlinks": backlinks}
    _graph_cache_time = _time.time()
    return _graph_cache

class HibookHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    timeout = 10  # Drop idle speculative connections after 10s
    
    def translate_path(self, path):
        route_name, remaining, physical_dir = get_routing_context(path)
        path = remaining.split('?',1)[0]
        path = path.split('#',1)[0]
        import posixpath
        path = posixpath.normpath(urllib.parse.unquote(path))
        words = filter(None, path.split('/'))
        
        res = physical_dir
        for word in words:
            if os.path.dirname(word) or word in (os.curdir, os.pardir):
                continue
            res = os.path.join(res, word)
        return res

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        route_name, path, physical_dir = get_routing_context(parsed_url.path)
        print(f"DEBUG GET: {self.path} -> {route_name}, '{path}'")
        
        # Bind the thread-safe routing context so all subprocesses and get_cwd() operate transparently within this specific KB.
        _route_context.cwd = physical_dir
        
        if path == '/_api/desktop/ping':
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')
            return
        
        if path.startswith('/_api/history'):
            query = urllib.parse.parse_qs(parsed_url.query)
            file_path = query.get('file', [''])[0]
            
            # Remove leading slash from file_path if present so git can find it correctly relative to cwd
            # Remove leading slash from file_path if present so git can find it correctly relative to cwd
            file_path = file_path.lstrip('/')
            
            # Bind evaluation cleanly to the multiplexed workspace routing origin
            abs_file_path = os.path.join(physical_dir, file_path) if file_path else physical_dir
            
            # If file_path is empty, we do a global repo history fetch
            if file_path and not os.path.exists(abs_file_path):
                self.send_error(404, "File not found")
                return
                
            try:
                if not file_path:
                    cmd = ['git', 'log', '--pretty=format:%h|%an|%ad|%s', '--date=short', '-n', '50']
                else:
                    cmd = ['git', 'log', '--pretty=format:%h|%an|%ad|%s', '--date=short', '--', file_path]
                output = subprocess.check_output(cmd, stderr=subprocess.STDOUT, text=True, cwd=physical_dir)
                
                # Fetch unsynced hashes safely
                unsynced = set()
                try:
                    unsynced_out = subprocess.check_output(['git', 'log', '@{u}..HEAD', '--format=%h'], stderr=subprocess.DEVNULL, text=True, cwd=physical_dir)
                    unsynced = set(unsynced_out.strip().split('\n'))
                except Exception:
                    pass
                    
                history = []
                for line in output.strip().split('\n'):
                    if line:
                        parts = line.split('|', 3)
                        if len(parts) == 4:
                            history.append({
                                'hash': parts[0],
                                'author': parts[1],
                                'date': parts[2],
                                'message': parts[3],
                                'is_synced': parts[0] not in unsynced
                            })
                
                encoded = json.dumps(history).encode('utf-8')
                self.send_response(200)
                self.send_header("Content-type", "application/json; charset=utf-8")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)
            except Exception as e:
                self.send_error(500, f"Git error: {str(e)}")
            return

        if path.startswith('/_api/file_at_commit'):
            query = urllib.parse.parse_qs(parsed_url.query)
            file_path = query.get('file', [''])[0].lstrip('/')
            commit_hash = query.get('hash', [''])[0]
            
            abs_file_path = os.path.join(physical_dir, file_path) if file_path else physical_dir
            if not file_path or not commit_hash or not os.path.exists(abs_file_path):
                self.send_error(404, "File not found or missing parameters")
                return
                
            try:
                cmd = ['git', 'show', f'{commit_hash}:{file_path}']
                output = subprocess.check_output(cmd, stderr=subprocess.STDOUT, cwd=physical_dir)
                
                self.send_response(200)
                self.send_header("Content-type", "text/markdown; charset=utf-8")
                self.send_header("Cache-Control", "public, max-age=31536000") # Immutable commit data
                self.send_header("Content-Length", str(len(output)))
                self.end_headers()
                self.wfile.write(output)
            except Exception as e:
                # E.g. file didn't exist at that commit
                msg = f"Failed to retrieve {file_path} at commit {commit_hash}".encode('utf-8')
                self.send_response(404)
                self.send_header("Content-type", "text/plain; charset=utf-8")
                self.send_header("Content-Length", str(len(msg)))
                self.end_headers()
                self.wfile.write(msg)
            return

        if path == '/_api/tree':
            def build_tree(dir_path):
                tree = []
                try:
                    entries = sorted(os.listdir(dir_path))
                except:
                    return tree
                for entry in entries:
                    if entry.startswith('.') or entry == 'template': continue
                    full_p = os.path.join(dir_path, entry)
                    rel_p = os.path.relpath(full_p, physical_dir)
                    if os.path.isdir(full_p):
                        children = build_tree(full_p)
                        tree.append({"type": "folder", "name": entry, "path": rel_p, "children": children})
                    elif entry.endswith('.md'):
                         tree.append({"type": "file", "name": entry, "path": rel_p})
                return tree
                
            tree_data = build_tree(physical_dir)
            encoded = json.dumps(tree_data).encode('utf-8')
            self.send_response(200)
            self.send_header("Content-type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)
            return

        if path == '/_api/workspaces':
            from hi_config import HiConfig
            kbs = HiConfig.get_workspaces()
            # Annotate active state
            for kb in kbs:
                kb['active'] = (kb['name'] in ROUTE_MAP and ROUTE_MAP[kb['name']] == kb['path'])
            
            encoded = json.dumps(kbs).encode('utf-8')
            self.send_response(200)
            self.send_header("Content-type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)
            return

        if path == '/_api/graph':
            root_dir = physical_dir
            graph = get_knowledge_graph(root_dir)
            encoded = json.dumps({"nodes": graph["nodes"], "edges": graph["edges"]}).encode('utf-8')
            self.send_response(200)
            self.send_header("Content-type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)
            return
            
        if path == '/_api/backlinks':
            query = urllib.parse.parse_qs(parsed_url.query)
            file_path = query.get('file', [''])[0]
            file_path = file_path.lstrip('/')
            
            root_dir = physical_dir
            graph = get_knowledge_graph(root_dir)
            
            links = graph["backlinks"].get(file_path, [])
            encoded = json.dumps(links).encode('utf-8')
            
            self.send_response(200)
            self.send_header("Content-type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)
            return

        if path == '/_api/search':
            query = urllib.parse.parse_qs(parsed_url.query).get('q', [''])[0]
            search_mgr = SearchManager.get_instance(physical_dir)
            results = search_mgr.search(query) if search_mgr else []
            encoded = json.dumps(results).encode('utf-8')
            
            self.send_response(200)
            self.send_header("Content-type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)
            return

        if path.startswith('/_api/commit_info'):
            query = urllib.parse.parse_qs(parsed_url.query)
            commit_hash = query.get('hash', [''])[0]
            if not commit_hash:
                self.send_error(400, "Missing hash")
                return
            try:
                # Get stats and concise patch
                output = subprocess.check_output(['git', 'show', '--stat', '--patch', commit_hash], stderr=subprocess.STDOUT, text=True)
                encoded = json.dumps({"diff": output}).encode('utf-8')
                self.send_response(200)
                self.send_header("Content-type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)
            except Exception as e:
                self.send_error(500, f"Git show error: {str(e)}")
            return
            
        if path == '/_api/revert_global':
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length > 0:
                body = self.rfile.read(content_length).decode('utf-8')
                data = json.loads(body)
                hash_to_revert = data.get('hash')
                if hash_to_revert:
                    try:
                        subprocess.check_call(['git', 'checkout', hash_to_revert, '.'], stderr=subprocess.STDOUT)
                        subprocess.check_call(['git', 'commit', '-am', f"Reverted repo globally to state at {hash_to_revert}"], stderr=subprocess.STDOUT)
                        
                        import hi_export
                        hi_export.cmd_update()
                        self.send_response(200)
                        self.send_header("Content-type", "application/json; charset=utf-8")
                        self.end_headers()
                        self.wfile.write(json.dumps({"success": True}).encode('utf-8'))
                        return
                    except subprocess.CalledProcessError as e:
                        self.send_error(500, f"Git checkout error: {e.output.decode('utf-8') if hasattr(e, 'output') and e.output else str(e)}")
                        return
            self.send_error(400, "Bad Request")
            return
            
        if path == '/_api/status':
            try:
                subprocess.run(['git', 'fetch'], capture_output=True)
                status_res = subprocess.run(['git', 'status', '-s', '-b'], capture_output=True, text=True)
                stdout = status_res.stdout.strip()
                lines = stdout.split('\n')
                branch_info = lines[0] if lines else ""
                
                conflict = 'UU ' in stdout
                ahead = 0
                behind = 0
                
                if 'ahead' in branch_info:
                    ahead_m = re.search(r'ahead (\d+)', branch_info)
                    if ahead_m: ahead = int(ahead_m.group(1))
                if 'behind' in branch_info:
                    behind_m = re.search(r'behind (\d+)', branch_info)
                    if behind_m: behind = int(behind_m.group(1))
                
                # Check if there are any modified files (M) or untracked (?)
                dirty = len([l for l in lines[1:] if l.strip()]) > 0
                    
                files_status = {}
                try:
                    porcelain_out = subprocess.check_output(['git', 'status', '--porcelain'], stderr=subprocess.STDOUT, text=True)
                    for line in porcelain_out.split('\n'):
                        if len(line) > 3:
                            code = line[:2]
                            fpath = line[3:].split(' -> ')[-1].strip()
                            if fpath.startswith('"') and fpath.endswith('"'): fpath = fpath[1:-1]
                            
                            code_strip = code.strip()
                            if code_strip == '??': state = 'U'
                            elif 'M' in code: state = 'M'
                            elif 'A' in code: state = 'A'
                            elif 'D' in code: state = 'D'
                            elif 'R' in code: state = 'R'
                            else: state = 'M'
                            files_status[fpath] = state
                except:
                    pass

                resp = {
                    "conflict": conflict,
                    "ahead": ahead,
                    "behind": behind,
                    "dirty": dirty,
                    "branch_info": branch_info,
                    "files": files_status
                }
                encoded = json.dumps(resp).encode('utf-8')
                self.send_response(200)
                self.send_header("Content-type", "application/json; charset=utf-8")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)
            except Exception as e:
                self.send_error(500, str(e))
            return

        path_no_query = self.path.split('?')[0]
        if path_no_query.endswith('.md'):
            local_path = urllib.parse.unquote(path_no_query.lstrip('/'))
            if os.path.exists(local_path) and os.path.isfile(local_path):
                with open(local_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                def process_mermaid_block(match):
                    mermaid_code = match.group(1).replace('\r', '')
                    def replace_mermaid_link(link_match):
                        node_id = link_match.group(1)
                        url = link_match.group(3)
                        if url is None: url = ""
                        
                        if url.startswith('http') or url.startswith('#') or url.startswith('/#'):
                            return f'click {node_id} "{url}"'
                        clean_url = url
                        if clean_url.startswith('./'): clean_url = clean_url[2:]
                        return f'click {node_id} "/#/{clean_url}"'
                    
                    mermaid_code = re.sub(r'click\s+(\w+)\s+(href\s+)?"([^"]+)"', replace_mermaid_link, mermaid_code)
                    return f'```mermaid\n{mermaid_code}\n```'
                    
                content = re.sub(r'```mermaid\s*\n(.*?)\n```', process_mermaid_block, content, flags=re.DOTALL)
                
                encoded = content.encode('utf-8')
                self.send_response(200)
                self.send_header("Content-type", "text/markdown; charset=utf-8")
                self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
                self.send_header("Pragma", "no-cache")
                self.send_header("Expires", "0")
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)
                return
                
        # Inject HIBOOK_ROOT into HTML requests dynamically mapping the specific multiplexed namespace root
        if path == '/' or path == '/index.html':
            local_path = self.translate_path(self.path)
            if os.path.isdir(local_path):
                local_path = os.path.join(local_path, 'index.html')
                
            if os.path.exists(local_path) and os.path.isfile(local_path):
                with open(local_path, 'r', encoding='utf-8') as f:
                    html_content = f.read()
                
                # If requesting root or Hub index, route_name is empty, HIBOOK_ROOT stays as /
                root_val = f"/{route_name}/" if route_name else "/"
                prefix_script = f"<script>window.HIBOOK_ROOT = '{root_val}'; window.HIBOOK_ROOT = window.HIBOOK_ROOT.replace('//', '/');</script>"
                if '<head>' in html_content:
                    html_content = html_content.replace('<head>', f'<head>\n  {prefix_script}')
                else:
                    html_content = prefix_script + '\n' + html_content

                encoded = html_content.encode('utf-8')
                self.send_response(200)
                self.send_header("Content-type", "text/html; charset=utf-8")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)
                return

        # SimpleHTTPRequestHandler will call our overridden translate_path which expects the raw path
        # to correctly extract the routing context and map to physical_dir.
        super().do_GET()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        route_name, path, physical_dir = get_routing_context(parsed_url.path)
        _route_context.cwd = physical_dir
        
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length) if content_length > 0 else b'{}'
        try:
            req = json.loads(post_data.decode('utf-8'))
        except:
            req = {}
            
        def send_json(data, status=200):
            encoded = json.dumps(data).encode('utf-8')
            self.send_response(status)
            self.send_header("Content-type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)
            
        def is_safe_path(base, target):
            import os
            base_abs = os.path.abspath(base)
            target_abs = os.path.abspath(os.path.join(base, target))
            return target_abs.startswith(base_abs)
            
        def sync_workspace_assets(target_path):
            tool_dir = os.path.dirname(os.path.abspath(__file__))
            web_template_dir = os.path.join(tool_dir, 'template', 'web')
            hibook_web_dir = os.path.join(target_path, '.hibook_web')
            
            src_assets = os.path.join(web_template_dir, 'assets')
            if os.path.exists(src_assets):
                if not os.path.exists(hibook_web_dir): shutil.copytree(src_assets, hibook_web_dir)
                else: shutil.copytree(src_assets, hibook_web_dir, dirs_exist_ok=True)
                    
            index_path = os.path.join(target_path, 'index.html')
            if not os.path.exists(index_path):
                src_index = os.path.join(web_template_dir, 'index.html')
                if os.path.exists(src_index):
                    shutil.copy2(src_index, index_path)
            
        if path == '/_api/desktop/register':
            target_name = req.get("name", "")
            target_path = req.get("path", "")
            
            if target_name in ROUTE_MAP and ROUTE_MAP[target_name] != target_path:
                return send_json({"success": False, "error": f"Namespace '{target_name}' is already currently occupied by {ROUTE_MAP[target_name]}"}, 409)
                
            if os.path.exists(target_path):
                sync_workspace_assets(target_path)
                ROUTE_MAP[target_name] = target_path
                from hi_config import HiConfig
                HiConfig.add_workspace(target_name, target_path)
                search_mgr = SearchManager.get_instance(target_path)
                search_mgr.start_background_sync()
                return send_json({"success": True})
            return send_json({"success": False, "error": "Path mapping failed"}, 400)

        if path == '/_api/desktop/unregister':
            target_name = req.get("name", "")
            if target_name in ROUTE_MAP:
                del ROUTE_MAP[target_name]
            return send_json({"success": True})
            
        if path == '/_api/desktop/remove_from_hub':
            target_name = req.get("name", "")
            if target_name in ROUTE_MAP:
                del ROUTE_MAP[target_name]
            from hi_config import HiConfig
            HiConfig.remove_workspace(target_name)
            return send_json({"success": True})
            
        if path == '/_api/desktop/delete':
            target_name = req.get("name", "")
            if target_name in ROUTE_MAP:
                del ROUTE_MAP[target_name]
            from hi_config import HiConfig
            
            # Find the path before removing it from config
            kbs = HiConfig.get_workspaces()
            target_path = next((kb['path'] for kb in kbs if kb['name'] == target_name), None)
            
            HiConfig.remove_workspace(target_name)
            
            if target_path and os.path.exists(target_path):
                try:
                    shutil.rmtree(target_path)
                except Exception as e:
                    return send_json({"success": False, "error": f"Failed to delete directory: {str(e)}"}, 500)
            return send_json({"success": True})
            
        if path == '/_api/desktop/launch':
            target_name = req.get("name", "")
            from hi_config import HiConfig
            kbs = HiConfig.get_workspaces()
            target_path = next((kb['path'] for kb in kbs if kb['name'] == target_name), None)
            
            if target_path and os.path.exists(target_path):
                sync_workspace_assets(target_path)
                ROUTE_MAP[target_name] = target_path
                search_mgr = SearchManager.get_instance(target_path)
                search_mgr.start_background_sync()
                return send_json({"success": True, "url": f"/{target_name}/"})
            return send_json({"success": False, "error": "Workspace not found or path invalid"}, 404)
            
        if path == '/_api/desktop/list_dirs':
            try:
                # Payload is already natively unpacked upstream into "req" dict
                req_path = req.get("path", "~")
                home_dir = os.path.abspath(os.path.expanduser("~"))
                
                if not req_path or req_path == "~":
                    req_path = home_dir
                req_path = os.path.abspath(req_path)
                
                if not req_path.startswith(home_dir):
                    req_path = home_dir
                
                if not os.path.isdir(req_path):
                    req_path = os.path.dirname(req_path)
                    if not os.path.isdir(req_path) or not req_path.startswith(home_dir):
                        req_path = home_dir
                
                dirs = []
                try:
                    for entry in sorted(os.listdir(req_path)):
                        if entry.startswith('.'): continue
                        
                        full_entry = os.path.join(req_path, entry)
                        if os.path.isdir(full_entry):
                            if os.access(full_entry, os.R_OK | os.X_OK):
                                dirs.append({
                                    "name": entry,
                                    "path": full_entry
                                })
                except PermissionError:
                    pass 
                    
                parent_path = os.path.dirname(req_path)
                if parent_path == req_path or not parent_path.startswith(home_dir): 
                    parent_path = None
                
                return send_json({
                    "success": True, 
                    "current_path": req_path,
                    "parent_path": parent_path,
                    "dirs": dirs
                })
            except Exception as e:
                return send_json({"success": False, "error": str(e)}, 500)
            
        if path == '/_api/desktop/create':
            name = req.get("name", "").strip()
            parent_path = req.get("parent_path", "").strip()
            if not name: return send_json({"success": False, "error": "Invalid name"}, 400)
            
            if parent_path:
                target_path = os.path.join(parent_path, name)
            else:
                target_path = os.path.join(os.path.expanduser("~"), "Documents", "Hibook", name)
                
            if os.path.exists(target_path): return send_json({"success": False, "error": f"Folder {target_path} already exists"}, 409)
            
            os.makedirs(target_path, exist_ok=True)
            try:
                subprocess.run(['git', 'init'], cwd=target_path, check=True)
                with open(os.path.join(target_path, 'README.md'), 'w') as f:
                    f.write(f"# {name.capitalize()}\n\nWelcome to your new hibook!\n\n> **Note**: This knowledge base strictly follows the [Knowledge Management Rules](./RULE.md).\n")
                with open(os.path.join(target_path, 'SUMMARY.md'), 'w') as f:
                    f.write(f"* [{name.capitalize()}](/README.md)\n* [Rules](/RULE.md)\n")
                with open(os.path.join(target_path, '.gitignore'), 'w') as f:
                    f.write(".hibook_web/\nhibook_index.db\n.DS_Store\n")
                
                src_rule = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'template', 'RULE.md')
                dest_rule = os.path.join(target_path, 'RULE.md')
                if os.path.exists(src_rule):
                    shutil.copy2(src_rule, dest_rule)
                
                sync_workspace_assets(target_path)
                
                subprocess.run(['git', 'add', '.'], cwd=target_path, check=True)
                subprocess.run(['git', 'commit', '-m', 'Initial commit'], cwd=target_path, check=True)
                
                from hi_config import HiConfig
                HiConfig.add_workspace(name, target_path)
                return send_json({"success": True, "path": target_path})
            except Exception as e:
                return send_json({"success": False, "error": str(e)}, 500)
                
        if path == '/_api/desktop/clone':
            url = req.get("url", "").strip()
            name = req.get("name", "").strip()
            parent_path = req.get("parent_path", "").strip()
            if not url: return send_json({"success": False, "error": "Missing URL"}, 400)
            if not name: name = url.split('/')[-1].replace('.git', '')
            
            if parent_path:
                target_path = os.path.join(parent_path, name)
            else:
                target_path = os.path.join(os.path.expanduser("~"), "Documents", "Hibook", name)
                
            if os.path.exists(target_path): return send_json({"success": False, "error": f"Folder {target_path} already exists"}, 409)
            
            try:
                os.makedirs(os.path.dirname(target_path), exist_ok=True)
                subprocess.run(['git', 'clone', url, target_path], check=True)
                from hi_config import HiConfig
                HiConfig.add_workspace(name, target_path)
                return send_json({"success": True, "path": target_path})
            except Exception as e:
                return send_json({"success": False, "error": str(e)}, 500)
                
        if path == '/_api/desktop/export':
            name = req.get("name", "")
            export_name = req.get("exportName", "").strip() or "export"
            export_path = req.get("exportPath", "").strip()
            
            from hi_config import HiConfig
            kbs = HiConfig.get_workspaces()
            target_path = next((kb['path'] for kb in kbs if kb['name'] == name), None)
            
            if target_path and os.path.exists(target_path):
                try:
                    if export_path:
                        output_dir = os.path.join(export_path, export_name)
                    else:
                        output_dir = os.path.join(os.path.dirname(target_path), export_name)
                        
                    import hi_export
                    hi_export.cmd_export(target_path, output_dir)
                    return send_json({"success": True, "path": output_dir})
                except Exception as e:
                    return send_json({"success": False, "error": str(e)}, 500)
            return send_json({"success": False, "error": "Workspace not found"}, 404)

        if path == '/_api/save':
            file_path = req.get('file', '').lstrip('/')
            if not is_safe_path(physical_dir, file_path):
                return send_json({"success": False, "error": "Security: Invalid remote path traversal detected"}, 403)
            content = req.get('content', '')
            custom_message = req.get('message', '').strip()
            if not file_path:
                return send_json({"success": False, "error": "Missing file"}, 400)
            abs_file_path = os.path.join(physical_dir, file_path)
                
            try:
                # Write to disk strictly in the sandbox
                with open(abs_file_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                # Git commit
                subprocess.run(['git', 'add', file_path], cwd=physical_dir, check=True)
                msg = custom_message if custom_message else f"Manual-save: {file_path}"
                subprocess.run(['git', 'commit', '-m', msg], cwd=physical_dir, capture_output=True)
                # Get the new hash
                out = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=physical_dir, text=True)
                
                # Update Search Index
                search_mgr = SearchManager.get_instance(physical_dir)
                if search_mgr:
                    import sqlite3 # Import needed inline
                    mtime = os.path.getmtime(abs_file_path)
                    with search_mgr.lock:
                        with sqlite3.connect(search_mgr.db_path) as conn:
                            search_mgr._update_file_index(conn, file_path, abs_file_path, mtime)
                            conn.commit()
                            
                return send_json({"success": True, "hash": out.strip()})
            except Exception as e:
                return send_json({"success": False, "error": str(e)}, 500)
                
        if path == '/_api/save_all':
            custom_msg = req.get('message', 'Save external changes').strip()
            if not custom_msg: custom_msg = 'Save external changes'
            try:
                subprocess.run(['git', 'add', '.'], cwd=physical_dir, check=True)
                subprocess.run(['git', 'commit', '-m', custom_msg], cwd=physical_dir, capture_output=True)
                out = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=physical_dir, text=True)
                return send_json({"success": True, "hash": out.strip()})
            except Exception as e:
                return send_json({"success": False, "error": str(e)}, 500)
                
        if path == '/_api/discard_all':
            try:
                subprocess.run(['git', 'reset', '--hard'], cwd=physical_dir, check=True, capture_output=True)
                subprocess.run(['git', 'clean', '-fd'], cwd=physical_dir, check=True, capture_output=True)
                return send_json({"success": True})
            except Exception as e:
                return send_json({"success": False, "error": str(e)}, 500)
                
        if path == '/_api/sync':
            # Check for remote first
            remote_check = subprocess.run(['git', 'remote', '-v'], cwd=physical_dir, capture_output=True, text=True)
            if not remote_check.stdout.strip():
                return send_json({"success": False, "no_remote": True, "error": "No remote configured"})
                
            # Perform pull --no-rebase
            pull_res = subprocess.run(['git', 'pull', '--no-rebase'], cwd=physical_dir, capture_output=True, text=True)
            if pull_res.returncode != 0:
                # If conflict, abort and return conflict state
                if 'conflict' in pull_res.stdout.lower() or 'conflict' in pull_res.stderr.lower() or 'Automatic merge failed' in pull_res.stdout:
                    subprocess.run(['git', 'merge', '--abort'], cwd=physical_dir)
                    return send_json({"success": False, "conflict": True, "details": pull_res.stdout + pull_res.stderr})
                # Other error (e.g. no upstream, or uncommitted changes)
                return send_json({"success": False, "conflict": False, "error": pull_res.stderr or pull_res.stdout})
                
            # Pull succeeded (or already up to date), now push
            push_res = subprocess.run(['git', 'push'], cwd=physical_dir, capture_output=True, text=True)
            if push_res.returncode != 0:
                return send_json({"success": False, "error": "Failed to push: " + push_res.stderr})
                
            return send_json({"success": True})
            
        if path == '/_api/set_remote':
            remote_url = req.get('remote', '').strip()
            if not remote_url:
                return send_json({"success": False, "error": "Missing remote URL"}, 400)
            try:
                try:
                    subprocess.run(['git', 'remote', 'add', 'origin', remote_url], cwd=physical_dir, check=True, capture_output=True, text=True)
                except subprocess.CalledProcessError:
                    subprocess.run(['git', 'remote', 'set-url', 'origin', remote_url], cwd=physical_dir, check=True, capture_output=True, text=True)
                
                curr_branch = subprocess.check_output(['git', 'branch', '--show-current'], cwd=physical_dir, text=True).strip()
                if not curr_branch: curr_branch = 'main'
                
                # Setup upstream and push
                push_res = subprocess.run(['git', 'push', '-u', 'origin', curr_branch], cwd=physical_dir, capture_output=True, text=True)
                if push_res.returncode != 0:
                    return send_json({"success": False, "error": f"Failed to push to new remote: {push_res.stderr}"})
                return send_json({"success": True})
            except Exception as e:
                return send_json({"success": False, "error": str(e)}, 500)
                
        if path == '/_api/resolve':
            strategy = req.get('strategy') # 'local' or 'remote'
            if strategy not in ['local', 'remote']:
                return send_json({"success": False, "error": "Invalid strategy"}, 400)
                
            strat_flag = '-Xours' if strategy == 'local' else '-Xtheirs'
            try:
                # Attempt to pull and auto-resolve using the strategy
                res = subprocess.run(['git', 'pull', '--no-rebase', '-s', 'recursive', strat_flag], cwd=physical_dir, capture_output=True, text=True)
                if res.returncode != 0:
                     return send_json({"success": False, "error": "Resolution failed: " + res.stderr})
                subprocess.run(['git', 'push'], cwd=physical_dir, check=True)
                return send_json({"success": True})
            except Exception as e:
                return send_json({"success": False, "error": str(e)}, 500)
                
        if path == '/_api/drop_commit':
            commit_hash = req.get('hash', '')
            if not commit_hash:
                return send_json({"success": False, "error": "Missing commit hash"}, 400)
            try:
                res = subprocess.run(['git', 'rebase', '--onto', commit_hash + '^', commit_hash], cwd=physical_dir, capture_output=True, text=True)
                if res.returncode != 0:
                    subprocess.run(['git', 'rebase', '--abort'], cwd=physical_dir, capture_output=True)
                    return send_json({"success": False, "error": "无法彻底抹除该记录由于存在冲突。请手动解决或使用回滚操作。\n详情: " + res.stderr + res.stdout})
                return send_json({"success": True})
            except Exception as e:
                return send_json({"success": False, "error": str(e)}, 500)
        
        if path == '/_api/fs/create':
            target_path = req.get('path', '').lstrip('/')
            if not is_safe_path(physical_dir, target_path):
                return send_json({"success": False, "error": "Security: Invalid path traversal detected"}, 403)
            is_dir = req.get('is_dir', False)
            append_to_summary = req.get('append_summary', False)
            title = req.get('title', '')
            
            if not target_path: return send_json({"success": False, "error": "Missing path"}, 400)
            try:
                if is_dir:
                    os.makedirs(target_path, exist_ok=True)
                    subprocess.run(['git', 'add', target_path])
                    subprocess.run(['git', 'commit', '-m', f"Create directory {target_path}"])
                else:
                    os.makedirs(os.path.dirname(target_path) or '.', exist_ok=True)
                    if not os.path.exists(target_path):
                        with open(target_path, 'w', encoding='utf-8') as f:
                            note_title = title if title else (os.path.basename(target_path)[:-3] if target_path.endswith('.md') else os.path.basename(target_path))
                            f.write(f'# {note_title}\n\n')
                        
                        subprocess.run(['git', 'add', target_path])
                        commit_msg = f"Create {target_path}"
                        
                        if append_to_summary:
                            import hi_export
                            hi_export.cmd_update(None)
                            subprocess.run(['git', 'add', 'SUMMARY.md'])
                            commit_msg = f"Create {target_path} and update SUMMARY.md"
                            
                        subprocess.run(['git', 'commit', '-m', commit_msg])
                        search_mgr = SearchManager.get_instance(physical_dir)
                        if search_mgr: search_mgr.sync_index()
                return send_json({"success": True})
            except Exception as e:
                return send_json({"success": False, "error": str(e)}, 500)

        if path == '/_api/fs/append_summary':
            link_target = req.get('link', '')
            title = req.get('title', '')
            if not link_target or not title:
                return send_json({"success": False, "error": "Missing link or title"}, 400)
            try:
                summary_path = 'SUMMARY.md'
                with open(summary_path, 'a', encoding='utf-8') as f:
                    # Append it formatted
                    f.write(f"* [{title}](/{link_target})\n")
                subprocess.run(['git', 'add', 'SUMMARY.md'])
                subprocess.run(['git', 'commit', '-m', f"Add {title} to SUMMARY.md"])
                return send_json({"success": True})
            except Exception as e:
                return send_json({"success": False, "error": str(e)}, 500)

        if path == '/_api/fs/delete':
            target_path = req.get('path', '').lstrip('/')
            if not is_safe_path(physical_dir, target_path):
                return send_json({"success": False, "error": "Security: Invalid path traversal detected"}, 403)
            if not target_path or not os.path.exists(target_path):
                return send_json({"success": False, "error": "Path not found"}, 400)
            if _is_sync_required():
                return send_json({"success": False, "error": "硬隔离触发: 检测到您的本地版本落后于云端！\n请先点击右上角的【Sync】按钮拉取最新更改，然后再执行删除操作，以防发生冲突。"}, 400)
                
            try:
                subprocess.run(['git', 'rm', '-r', target_path])
                subprocess.run(['git', 'commit', '-m', f"Delete {target_path}"])
                
                # Auto Sync SUMMARY.md
                try:
                    hi_export.cmd_update(None)
                    subprocess.run(['git', 'add', 'SUMMARY.md'])
                    subprocess.run(['git', 'commit', '-m', f"Auto-update SUMMARY.md after deleting {target_path}"])
                except Exception as e:
                    print(f"Warning: Auto-update SUMMARY failed: {e}")
                    
                search_mgr = SearchManager.get_instance(physical_dir)
                if search_mgr: search_mgr.sync_index()
                return send_json({"success": True})
            except Exception as e:
                return send_json({"success": False, "error": str(e)}, 500)

        if path == '/_api/fs/rename':
            old_path = req.get('old_path', '').lstrip('/')
            new_path = req.get('new_path', '').lstrip('/')
            if not is_safe_path(physical_dir, old_path) or not is_safe_path(physical_dir, new_path):
                return send_json({"success": False, "error": "Security: Invalid path traversal detected"}, 403)
            if not old_path or not new_path or not os.path.exists(old_path):
                return send_json({"success": False, "error": "Invalid paths"}, 400)
            if _is_sync_required():
                return send_json({"success": False, "error": "硬隔离触发: 检测到您的本地版本落后于云端！\n重组多重链接可能产生极为复杂的网状冲突。请先点击右上角的【Sync】按钮确保处于最新状态，再重命名或移动全域级文件/文件夹。"}, 400)
                
            try:
                os.makedirs(os.path.dirname(new_path) or '.', exist_ok=True)
                subprocess.run(['git', 'mv', old_path, new_path], check=True)
                
                old_base = os.path.basename(old_path)[:-3] if old_path.endswith('.md') else os.path.basename(old_path)
                new_base = os.path.basename(new_path)[:-3] if new_path.endswith('.md') else os.path.basename(new_path)
                
                modified_files = []
                # Backlink rewriting for [[Wikilinks]] only if it's a markdown file
                if old_base != new_base and old_path.endswith('.md') and new_path.endswith('.md'):
                    for root, _, files in os.walk(os.getcwd()):
                        dirs = [d for d in root.split(os.sep) if d.startswith('.')]
                        if dirs: continue
                        for f in files:
                            if f.endswith('.md'):
                                full_p = os.path.join(root, f)
                                rel_p = os.path.relpath(full_p, os.getcwd())
                                if rel_p == new_path: continue
                                
                                with open(full_p, 'r', encoding='utf-8') as file_obj:
                                    content = file_obj.read()
                                    
                                new_content = re.sub(rf'\[\[{re.escape(old_base)}\]\]', f'[[{new_base}]]', content)
                                if new_content != content:
                                    with open(full_p, 'w', encoding='utf-8') as file_obj:
                                        file_obj.write(new_content)
                                    subprocess.run(['git', 'add', rel_p])
                                    modified_files.append(rel_p)
                
                subprocess.run(['git', 'commit', '-m', f"Rename {old_path} to {new_path} and update {len(modified_files)} links"])
                search_mgr = SearchManager.get_instance(physical_dir)
                if search_mgr: search_mgr.sync_index()
                return send_json({"success": True, "updated_links": len(modified_files)})
            except Exception as e:
                return send_json({"success": False, "error": str(e)}, 500)
        
        self.send_error(404, "API not found")


def cmd_start(args):
    port = args.get("port")
    port = int(port) if port else 3000
    
    try:
        from hi_config import HiConfig
        from hi_search import SearchManager
        saved_workspaces = HiConfig.get_workspaces()
        restored_count = 0
        for ws in saved_workspaces:
            if os.path.exists(ws['path']):
                ROUTE_MAP[ws['name']] = ws['path']
                SearchManager.get_instance(ws['path']).start_background_sync()
                restored_count += 1
        if restored_count > 0:
            HiLog.info(f"Restored {restored_count} workspaces from configuration.")
    except Exception as e:
        HiLog.warning(f"Could not restore workspaces: {e}")

    HiLog.info(f"Starting Hibook Global Multiplexing Hub on port {port}...")
    HiLog.info(f"Hub Dashboard available at http://localhost:{port}/")
    HiLog.info("Press Ctrl+C to stop.")
    
    class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
        daemon_threads = True
        allow_reuse_address = True

    try:
        with ThreadedTCPServer(("", port), HibookHTTPRequestHandler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    except Exception as e:
        HiLog.error(f"Failed to start Hub server on port {port}. {e}")

def cmd_stop(args):
    name = args.get("name")
    import urllib.request
    from hi_config import HiConfig
    port = HiConfig.get_config().get("port", 3007)
    
    if name:
        # Unregister specific namespace
        req = urllib.request.Request(f"http://localhost:{port}/_api/desktop/unregister",
                                     data=json.dumps({"name": name}).encode('utf-8'),
                                     headers={'Content-Type': 'application/json'},
                                     method="POST")
        try:
            with urllib.request.urlopen(req, timeout=3) as response:
                HiLog.info(f"Successfully unmounted workspace '{name}' from the daemon.")
        except Exception as e:
            HiLog.error(f"Failed to unmount workspace '{name}'. The daemon might be offline. {e}")
    else:
        # Stop global Hub daemon? Since it's a daemon, simplest is to just tell users to pkill it 
        # or implement a shutdown endpoint. Let's just pkill it for now to be robust.
        subprocess.run(['pkill', '-f', f'hibook start -p {port}'])
        subprocess.run(['pkill', '-f', f'hibook start'])
        subprocess.run(['pkill', '-f', 'MacWebWindowMBIcon'])
        subprocess.run(['pkill', '-f', 'MacWebWindowMB'])
        subprocess.run(['pkill', '-f', 'MacWebWindow'])
        HiLog.info(f"Hibook Hub daemon and UI instances stopped.")
def cmd_hub(args):
    port = args.get("port")
    if type(port) == list and len(port) > 0: port = port[0]
    port = int(port) if port else 3007

    import urllib.request
    import urllib.error
    import subprocess
    import time
    
    is_daemon_alive = False
    try:
        req = urllib.request.Request(f"http://localhost:{port}/_api/desktop/ping", method="GET")
        with urllib.request.urlopen(req, timeout=1) as response:
            if response.status == 200:
                is_daemon_alive = True
    except:
        pass
        
    if not is_daemon_alive:
        HiLog.info(f"Hub is offline. Automatically spawning Master Daemon in background on port {port}...")
        subprocess.Popen(['hibook', 'start', '-p', str(port)], start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1.5)

    target_url = f"http://localhost:{port}/"
    HiLog.info(f"Opening Hibook Hub Menu Bar App at {target_url}")
    launch_native_app(target_url, port)

def launch_native_app(url, port):
    import subprocess
    import tempfile
    import os
    
    bin_dir = os.path.expanduser(os.path.join("~", ".hibook_bin"))
    os.makedirs(bin_dir, exist_ok=True)
    bin_name = "MacWebWindowMBIcon"
    bin_path = os.path.join(bin_dir, bin_name)
    
    if not os.path.exists(bin_path):
        swift_code = """
import Cocoa
import WebKit

class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var statusItem: NSStatusItem!

    private func cleanCache() {
        let websiteDataTypes = WKWebsiteDataStore.allWebsiteDataTypes()
        let date = Date(timeIntervalSince1970: 0)
        WKWebsiteDataStore.default().removeData(ofTypes: websiteDataTypes, modifiedSince: date, completionHandler:{ })
    }

    func createBookIcon() -> NSImage {
        let size = NSSize(width: 18, height: 18)
        let image = NSImage(size: size)
        image.lockFocus()
        guard let context = NSGraphicsContext.current?.cgContext else { return image }
        
        let scale = 16.0 / 24.0
        context.translateBy(x: 1, y: 1)
        context.scaleBy(x: scale, y: scale)
        context.translateBy(x: 0, y: 24)
        context.scaleBy(x: 1, y: -1)
        
        context.setStrokeColor(NSColor.labelColor.cgColor)
        context.setLineWidth(2.0)
        context.setLineCap(.round)
        context.setLineJoin(.round)
        
        context.beginPath()
        context.move(to: CGPoint(x: 4, y: 19.5))
        context.addCurve(to: CGPoint(x: 6.5, y: 17), control1: CGPoint(x: 4, y: 18.12), control2: CGPoint(x: 5.12, y: 17))
        context.addLine(to: CGPoint(x: 20, y: 17))
        context.strokePath()
        
        context.beginPath()
        context.move(to: CGPoint(x: 6.5, y: 2))
        context.addLine(to: CGPoint(x: 20, y: 2))
        context.addLine(to: CGPoint(x: 20, y: 22))
        context.addLine(to: CGPoint(x: 6.5, y: 22))
        context.addCurve(to: CGPoint(x: 4, y: 19.5), control1: CGPoint(x: 5.12, y: 22), control2: CGPoint(x: 4, y: 20.88))
        context.addLine(to: CGPoint(x: 4, y: 4.5))
        context.addCurve(to: CGPoint(x: 6.5, y: 2), control1: CGPoint(x: 4, y: 3.12), control2: CGPoint(x: 5.12, y: 2))
        context.closePath()
        context.strokePath()
        
        image.unlockFocus()
        image.isTemplate = true
        return image
    }

    func applicationDidFinishLaunching(_ aNotification: Notification) {
        cleanCache()
        
        NSApp.setActivationPolicy(.accessory)
        
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            button.image = createBookIcon()
            button.title = ""
            button.action = #selector(toggleWindow(_:))
            button.target = self
        }
        
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1200, height: 800),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.delegate = self
        window.center()
        window.title = "Hibook Hub"
        
        window.isReleasedWhenClosed = false
        
        let config = WKWebViewConfiguration()
        webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        window.contentView?.addSubview(webView)
        
        let urlArgs = CommandLine.arguments.dropFirst()
        if let urlStr = urlArgs.first, let url = URL(string: urlStr) {
            webView.load(URLRequest(url: url))
        }
        
        showWindow()
    }

    @objc func toggleWindow(_ sender: Any?) {
        if window.isVisible {
            window.orderOut(nil)
        } else {
            showWindow()
        }
    }
    
    func showWindow() {
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        window.orderOut(nil)
        return false
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
"""
        swift_file = os.path.join(bin_dir, "mac_webview.swift")
        with open(swift_file, 'w') as f:
            f.write(swift_code)
        try:
            HiLog.info("Precompiling macOS Menu Bar payload for the first time...")
            subprocess.run(["swiftc", swift_file, "-o", bin_path], check=True, capture_output=True)
        except Exception as e:
            HiLog.error("Failed to compile native macOS template. Falling back to default external browser.")
            import webbrowser
            webbrowser.open(url)
            return

    try:
        subprocess.Popen([bin_path, url], start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        HiLog.info("Launched Native Menu Bar App successfully.")
    except Exception as e:
        import webbrowser
        webbrowser.open(url)


def cmd_web(args):
    port = args.get("port")
    name = args.get("name")
    if type(port) == list and len(port) > 0: port = port[0]
    if type(name) == list and len(name) > 0: name = name[0]
    port = int(port) if port else 3007
    root_dir = os.getcwd()
    
    if not name:
        name = os.path.basename(root_dir)
    
    import urllib.request
    import urllib.error
    import webbrowser
    
    # Detect if daemon is already active on this port
    is_daemon_alive = False
    try:
        req = urllib.request.Request(f"http://localhost:{port}/_api/desktop/ping", method="GET")
        with urllib.request.urlopen(req, timeout=1) as response:
            if response.status == 200:
                is_daemon_alive = True
    except:
        pass
        
    if not is_daemon_alive:
        HiLog.info(f"Hub is offline. Automatically spawning Master Daemon in background on port {port}...")
        subprocess.Popen(['hibook', 'start', '-p', str(port)], start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        _time.sleep(1.5) # Allow bind time

    # Register
    req = urllib.request.Request(f"http://localhost:{port}/_api/desktop/register", 
                                 data=json.dumps({"name": name, "path": root_dir}).encode('utf-8'),
                                 headers={'Content-Type': 'application/json'},
                                 method="POST")
    try:
        with urllib.request.urlopen(req) as response:
            target_url = f"http://localhost:{port}/{name}/"
            HiLog.info(f"Successfully mounted at {target_url}")
            launch_native_app(target_url, port)
    except urllib.error.HTTPError as e:
        if e.code == 409:
            HiLog.error(f"Name conflict! Workspace name '{name}' is already attached to a different repository.")
            HiLog.error(f"Please use 'hibook web -n <unique-name>' instead.")
        else:
            HiLog.error(f"Failed to register route to daemon: HTTP {e.code}")
    except Exception as e:
        HiLog.error(f"Failed to register route to daemon: {e}")
