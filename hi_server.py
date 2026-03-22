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
import time as _time
from hi_search import SearchManager
import hi_export

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
                    
            for match in re.finditer(r'\[(.*?)\]\((.*?\.md)\)', body):
                text = match.group(1)
                link = match.group(2)
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
    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        
        if path.startswith('/_api/history'):
            query = urllib.parse.parse_qs(parsed_url.query)
            file_path = query.get('file', [''])[0]
            
            # Remove leading slash from file_path if present so git can find it correctly relative to cwd
            # Remove leading slash from file_path if present so git can find it correctly relative to cwd
            file_path = file_path.lstrip('/')
            
            # If file_path is empty, we do a global repo history fetch
            if file_path and not os.path.exists(file_path):
                self.send_error(404, "File not found")
                return
                
            try:
                if not file_path:
                    cmd = ['git', 'log', '--pretty=format:%h|%an|%ad|%s', '--date=short', '-n', '50']
                else:
                    cmd = ['git', 'log', '--pretty=format:%h|%an|%ad|%s', '--date=short', '--', file_path]
                output = subprocess.check_output(cmd, stderr=subprocess.STDOUT, text=True)
                
                # Fetch unsynced hashes safely
                unsynced = set()
                try:
                    unsynced_out = subprocess.check_output(['git', 'log', '@{u}..HEAD', '--format=%h'], stderr=subprocess.DEVNULL, text=True)
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
            
            if not file_path or not commit_hash or not os.path.exists(file_path):
                self.send_error(404, "File not found or missing parameters")
                return
                
            try:
                cmd = ['git', 'show', f'{commit_hash}:{file_path}']
                output = subprocess.check_output(cmd, stderr=subprocess.STDOUT)
                
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
                    rel_p = os.path.relpath(full_p, os.getcwd())
                    if os.path.isdir(full_p):
                        children = build_tree(full_p)
                        tree.append({"type": "folder", "name": entry, "path": rel_p, "children": children})
                    elif entry.endswith('.md'):
                         tree.append({"type": "file", "name": entry, "path": rel_p})
                return tree
                
            tree_data = build_tree(os.getcwd())
            encoded = json.dumps(tree_data).encode('utf-8')
            self.send_response(200)
            self.send_header("Content-type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)
            return

        if path == '/_api/graph':
            root_dir = os.getcwd()
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
            
            root_dir = os.getcwd()
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
            search_mgr = SearchManager.get_instance()
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
        super().do_GET()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        
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

        if path == '/_api/save':
            file_path = req.get('file', '').lstrip('/')
            content = req.get('content', '')
            custom_message = req.get('message', '').strip()
            if not file_path:
                return send_json({"success": False, "error": "Missing file"}, 400)
                
            try:
                # Write to disk
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                # Git commit
                subprocess.run(['git', 'add', file_path], check=True)
                msg = custom_message if custom_message else f"Manual-save: {file_path}"
                subprocess.run(['git', 'commit', '-m', msg], capture_output=True)
                # Get the new hash
                out = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], text=True)
                
                # Update Search Index
                search_mgr = SearchManager.get_instance()
                if search_mgr:
                    import sqlite3 # Import needed inline
                    mtime = os.path.getmtime(file_path)
                    with search_mgr.lock:
                        with sqlite3.connect(search_mgr.db_path) as conn:
                            search_mgr._update_file_index(conn, file_path, os.path.join(search_mgr.root_dir, file_path), mtime)
                            conn.commit()
                            
                return send_json({"success": True, "hash": out.strip()})
            except Exception as e:
                return send_json({"success": False, "error": str(e)}, 500)
                
        if path == '/_api/save_all':
            custom_msg = req.get('message', 'Save external changes').strip()
            if not custom_msg: custom_msg = 'Save external changes'
            try:
                subprocess.run(['git', 'add', '.'], check=True)
                subprocess.run(['git', 'commit', '-m', custom_msg], capture_output=True)
                out = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], text=True)
                return send_json({"success": True, "hash": out.strip()})
            except Exception as e:
                return send_json({"success": False, "error": str(e)}, 500)
                
        if path == '/_api/discard_all':
            try:
                subprocess.run(['git', 'reset', '--hard'], check=True, capture_output=True)
                subprocess.run(['git', 'clean', '-fd'], check=True, capture_output=True)
                return send_json({"success": True})
            except Exception as e:
                return send_json({"success": False, "error": str(e)}, 500)
                
        if path == '/_api/sync':
            # Check for remote first
            remote_check = subprocess.run(['git', 'remote', '-v'], capture_output=True, text=True)
            if not remote_check.stdout.strip():
                return send_json({"success": False, "no_remote": True, "error": "No remote configured"})
                
            # Perform pull --no-rebase
            pull_res = subprocess.run(['git', 'pull', '--no-rebase'], capture_output=True, text=True)
            if pull_res.returncode != 0:
                # If conflict, abort and return conflict state
                if 'conflict' in pull_res.stdout.lower() or 'conflict' in pull_res.stderr.lower() or 'Automatic merge failed' in pull_res.stdout:
                    subprocess.run(['git', 'merge', '--abort'])
                    return send_json({"success": False, "conflict": True, "details": pull_res.stdout + pull_res.stderr})
                # Other error (e.g. no upstream, or uncommitted changes)
                return send_json({"success": False, "conflict": False, "error": pull_res.stderr or pull_res.stdout})
                
            # Pull succeeded (or already up to date), now push
            push_res = subprocess.run(['git', 'push'], capture_output=True, text=True)
            if push_res.returncode != 0:
                return send_json({"success": False, "error": "Failed to push: " + push_res.stderr})
                
            return send_json({"success": True})
            
        if path == '/_api/set_remote':
            remote_url = req.get('remote', '').strip()
            if not remote_url:
                return send_json({"success": False, "error": "Missing remote URL"}, 400)
            try:
                try:
                    subprocess.run(['git', 'remote', 'add', 'origin', remote_url], check=True, capture_output=True, text=True)
                except subprocess.CalledProcessError:
                    subprocess.run(['git', 'remote', 'set-url', 'origin', remote_url], check=True, capture_output=True, text=True)
                
                curr_branch = subprocess.check_output(['git', 'branch', '--show-current'], text=True).strip()
                if not curr_branch: curr_branch = 'main'
                
                # Setup upstream and push
                push_res = subprocess.run(['git', 'push', '-u', 'origin', curr_branch], capture_output=True, text=True)
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
                res = subprocess.run(['git', 'pull', '--no-rebase', '-s', 'recursive', strat_flag], capture_output=True, text=True)
                if res.returncode != 0:
                     return send_json({"success": False, "error": "Resolution failed: " + res.stderr})
                subprocess.run(['git', 'push'], check=True)
                return send_json({"success": True})
            except Exception as e:
                return send_json({"success": False, "error": str(e)}, 500)
                
        if path == '/_api/drop_commit':
            commit_hash = req.get('hash', '')
            if not commit_hash:
                return send_json({"success": False, "error": "Missing commit hash"}, 400)
            try:
                res = subprocess.run(['git', 'rebase', '--onto', commit_hash + '^', commit_hash], capture_output=True, text=True)
                if res.returncode != 0:
                    subprocess.run(['git', 'rebase', '--abort'], capture_output=True)
                    return send_json({"success": False, "error": "无法彻底抹除该记录由于存在冲突。请手动解决或使用回滚操作。\n详情: " + res.stderr + res.stdout})
                return send_json({"success": True})
            except Exception as e:
                return send_json({"success": False, "error": str(e)}, 500)
        
        if path == '/_api/fs/create':
            target_path = req.get('path', '').lstrip('/')
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
                        search_mgr = SearchManager.get_instance()
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
                    
                search_mgr = SearchManager.get_instance()
                if search_mgr: search_mgr.sync_index()
                return send_json({"success": True})
            except Exception as e:
                return send_json({"success": False, "error": str(e)}, 500)

        if path == '/_api/fs/rename':
            old_path = req.get('old_path', '').lstrip('/')
            new_path = req.get('new_path', '').lstrip('/')
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
                search_mgr = SearchManager.get_instance()
                if search_mgr: search_mgr.sync_index()
                return send_json({"success": True, "updated_links": len(modified_files)})
            except Exception as e:
                return send_json({"success": False, "error": str(e)}, 500)
        
        self.send_error(404, "API not found")


def cmd_web(args):
    port = args.get("port")
    if not port:
        port = 3000
    elif type(port) == list and len(port) > 0:
        port = int(port[0])
    else:
        port = int(port)
    
    tool_dir = os.path.dirname(os.path.abspath(__file__))
    web_template_dir = os.path.join(tool_dir, 'template', 'web')
    root_dir = os.getcwd()
    hibook_web_dir = os.path.join(root_dir, '.hibook_web')
    
    # copy assets
    src_assets = os.path.join(web_template_dir, 'assets')
    if os.path.exists(src_assets):
        if not os.path.exists(hibook_web_dir):
            shutil.copytree(src_assets, hibook_web_dir)
        else:
            shutil.copytree(src_assets, hibook_web_dir, dirs_exist_ok=True)
            
    # inject index.html if not present
    index_path = os.path.join(root_dir, 'index.html')
    if not os.path.exists(index_path):
        src_index = os.path.join(web_template_dir, 'index.html')
        if os.path.exists(src_index):
            shutil.copy2(src_index, index_path)
            HiLog.info("Injected Docsify index.html into current directory.")

    HiLog.info("Starting web server at http://localhost:{port}")
    HiLog.info("Press Ctrl+C to stop.")
    
    # Initialize background indexing module
    search_mgr = SearchManager.get_instance(root_dir)
    search_mgr.start_background_sync()
    
    class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
        daemon_threads = True
        allow_reuse_address = True

    with ThreadedTCPServer(("", port), HibookHTTPRequestHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
