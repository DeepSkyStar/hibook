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

_graph_cache = None
_graph_cache_time = 0

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
            
            # Extract title from the first heading 1
            title_match = re.search(r'^#\s+(.*?)$', content, re.MULTILINE)
            label = title_match.group(1).strip() if title_match else os.path.basename(path)[:-3]
            nodes.append({"id": path, "label": label})
                
            for match in re.finditer(r'\[\[(.*?)\]\]', content):
                wl = match.group(1)
                target = basename_to_path.get(wl)
                if not target and wl + ".md" in file_contents: 
                    target = wl + ".md"
                if target:
                    start = max(0, match.start() - 30)
                    end = min(len(content), match.end() + 30)
                    snippet = content[start:end].replace('\n', ' ')
                    edges.append({"source": path, "target": target})
                    backlinks[target].append({"source": path, "type": "wikilink", "text": wl, "snippet": snippet})
                    
            for match in re.finditer(r'\[(.*?)\]\((.*?\.md)\)', content):
                text = match.group(1)
                link = match.group(2)
                target_path = os.path.normpath(os.path.join(os.path.dirname(path), link))
                if target_path in file_contents:
                     start = max(0, match.start() - 30)
                     end = min(len(content), match.end() + 30)
                     snippet = content[start:end].replace('\n', ' ')
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
    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        
        if path.startswith('/_api/history'):
            query = urllib.parse.parse_qs(parsed_url.query)
            file_path = query.get('file', [''])[0]
            
            # Remove leading slash from file_path if present so git can find it correctly relative to cwd
            file_path = file_path.lstrip('/')
            
            if not file_path or not os.path.exists(file_path):
                self.send_error(404, "File not found")
                return
                
            try:
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
                    
                resp = {
                    "conflict": conflict,
                    "ahead": ahead,
                    "behind": behind,
                    "dirty": dirty,
                    "branch_info": branch_info
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
                return send_json({"success": True, "hash": out.strip()})
            except Exception as e:
                return send_json({"success": False, "error": str(e)}, 500)
                
        if path == '/_api/sync':
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

    HiLog.info(f"Starting web server at http://localhost:{port}")
    HiLog.info("Press Ctrl+C to stop.")
    
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", port), HibookHTTPRequestHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
