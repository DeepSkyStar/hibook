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
                history = []
                for line in output.strip().split('\n'):
                    if line:
                        parts = line.split('|', 3)
                        if len(parts) == 4:
                            history.append({
                                'hash': parts[0],
                                'author': parts[1],
                                'date': parts[2],
                                'message': parts[3]
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
