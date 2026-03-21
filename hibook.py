#!/usr/bin/env python3
# coding=utf-8

from hi_basic import *
import os
import argparse
import textwrap
import re
import shutil

def __info(args):
    curpath = os.path.dirname(os.path.abspath(__file__))
    appinfo = HiAppInfo(curpath)
    print(appinfo.name + " " + appinfo.version + " by " + appinfo.owner if appinfo.owner else "Unknown")
    pass

def __create(args):
    name = args.get("name")
    if type(name) == list and len(name) > 0:
        name = name[0]
    
    if not name:
        HiLog.error("Please provide a name for the new book directory.")
        return
        
    root_dir = os.getcwd()
    target_dir = os.path.join(root_dir, name)
    
    if os.path.exists(target_dir):
        HiLog.error(f"Directory {name} already exists.")
        return
        
    os.makedirs(target_dir)
    
    gitignore_path = os.path.join(target_dir, '.gitignore')
    with open(gitignore_path, 'w', encoding='utf-8') as f:
        f.write(".hibook_web/\nexport/\nindex.html\n")
        
    readme_path = os.path.join(target_dir, 'README.md')
    with open(readme_path, 'w', encoding='utf-8') as f:
        f.write(f"# {name.capitalize()}\n\nWelcome to your new hibook!\n")
        
    summary_path = os.path.join(target_dir, 'SUMMARY.md')
    with open(summary_path, 'w', encoding='utf-8') as f:
        f.write("* [Overview](README.md)\n")
        
    HiLog.info(f"Successfully created new hibook project in '{name}'")
    HiLog.info(f"Run `cd {name}` and then `hibook web` to view it.")
    pass

def __web(args):
    port = args.get("port", 3000)
    if not port:
        port = 3000
    else:
        port = int(port[0])
    
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
    
    import http.server
    import socketserver
    import urllib.parse

    class HibookHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
        def do_GET(self):
            path_no_query = self.path.split('?')[0]
            if path_no_query.endswith('.md'):
                local_path = urllib.parse.unquote(path_no_query.lstrip('/'))
                if os.path.exists(local_path) and os.path.isfile(local_path):
                    with open(local_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        
                    def process_mermaid_block(match):
                        mermaid_code = match.group(1)
                        def replace_mermaid_link(link_match):
                            node_id = link_match.group(1)
                            url = link_match.group(2)
                            if url.startswith('http') or url.startswith('#') or url.startswith('/#'):
                                return link_match.group(0)
                            return f'click {node_id} "/#/{url}"'
                        mermaid_code = re.sub(r'click\s+(\w+)\s+"([^"]+)"', replace_mermaid_link, mermaid_code)
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

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", port), HibookHTTPRequestHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass

def parse_summary(summary_path):
    with open(summary_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    files = []
    for line in lines:
        match = re.search(r'^(\s*)\* \[(.*?)\]\((.*?)\)', line)
        if match:
            indent = match.group(1)
            title = match.group(2)
            path = match.group(3)
            level = len(indent) // 2
            files.append((title, path, level))
    return files

def read_file_content(file_path, root_dir):
    full_path = os.path.join(root_dir, file_path)
    if not os.path.exists(full_path):
        HiLog.warning(f"File not found: {full_path}")
        return ""
    with open(full_path, 'r', encoding='utf-8') as f:
        content = f.read()
    return content

def __export(args):
    root_dir = os.getcwd()
    summary_path = os.path.join(root_dir, 'SUMMARY.md')
    if not os.path.exists(summary_path):
        HiLog.error(f"Cannot find SUMMARY.md in {root_dir}")
        return
        
    output_dir = os.path.join(root_dir, 'export')
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    output_md_path = os.path.join(output_dir, 'knowledge_full.md')
    output_html_path = os.path.join(output_dir, 'knowledge_full.html')

    HiLog.info(f"Reading SUMMARY.md from {summary_path}...")
    files = parse_summary(summary_path)
    
    # Check if README.md exists and is not in files
    has_readme = any(f[1] == 'README.md' for f in files)
    
    full_content = ""
    
    HiLog.info(f"Found {len(files)} files. Merging...")
    
    merged_files_set = set()
    for title, path, level in files:
        if not path.startswith('http') and not path.startswith('#'):
            merged_files_set.add(path)
    
    last_dir = None
    
    for title, path, level in files:
        if path.startswith('http') or path.startswith('#'):
            continue
            
        HiLog.info(f"Processing: {path}")
        content = read_file_content(path, root_dir)
        
        anchor_id = path.replace('/', '_').replace('.', '_')
        
        def replace_link(match):
            link_text = match.group(1)
            link_target = match.group(2)
            
            if link_target.startswith('http') or link_target.startswith('#'):
                return match.group(0)
            
            if link_target.startswith('/'):
                target_path = link_target.lstrip('/')
            else:
                current_dir = os.path.dirname(path)
                target_path = os.path.normpath(os.path.join(current_dir, link_target))
            
            if target_path in merged_files_set:
                target_anchor = target_path.replace('/', '_').replace('.', '_')
                return f'[{link_text}](#{target_anchor})'
            else:
                return match.group(0)

        content = re.sub(r'\[(.*?)\]\((.*?)\)', replace_link, content)
        content = f'<span id="{anchor_id}"></span>\n\n' + content
        
        current_dir = os.path.dirname(path)
        if last_dir is not None:
            full_content += f"\n\n<div class='page-break'></div>\n\n"
        last_dir = current_dir
        full_content += content

    def process_mermaid_block(match):
        mermaid_code = match.group(1)
        def replace_mermaid_link(link_match):
            node_id = link_match.group(1)
            url = link_match.group(2)
            if url in merged_files_set:
                anchor = url.replace('/', '_').replace('.', '_')
                return f'click {node_id} "#{anchor}"'
            # try to match absolute / style
            if url.startswith('/'):
                url_no_slash = url[1:]
                if url_no_slash in merged_files_set:
                    anchor = url_no_slash.replace('/', '_').replace('.', '_')
                    return f'click {node_id} "#{anchor}"'
            return link_match.group(0)
        mermaid_code = re.sub(r'click\s+(\w+)\s+"([^"]+)"', replace_mermaid_link, mermaid_code)
        return f'<div class="mermaid">\n{mermaid_code}\n</div>'

    html_content_pre = re.sub(r'```mermaid\s*\n(.*?)\n```', process_mermaid_block, full_content, flags=re.DOTALL)

    with open(output_md_path, 'w', encoding='utf-8') as f:
        f.write(full_content)
    HiLog.info(f"Markdown export saved to: {output_md_path}")

    # Copy template resources
    tool_dir = os.path.dirname(os.path.abspath(__file__))
    web_rule_dir = os.path.join(tool_dir, 'template', 'web')
    
    src_entry = os.path.join(web_rule_dir, 'mermaid.esm.min.mjs')
    dst_entry = os.path.join(output_dir, 'mermaid.js')
    if os.path.exists(src_entry):
        shutil.copy2(src_entry, dst_entry)
    
    src_chunk = os.path.join(web_rule_dir, 'mermaid-b92f6f74.js')
    dst_chunk = os.path.join(output_dir, 'mermaid-b92f6f74.js')
    if os.path.exists(src_chunk):
        shutil.copy2(src_chunk, dst_chunk)

    try:
        math_placeholders = {}
        math_counter = 0

        def protect_math(match):
            nonlocal math_counter
            content = match.group(0)
            placeholder = f"MATH_BLOCK_{math_counter}_PLACEHOLDER"
            math_placeholders[placeholder] = content
            math_counter += 1
            return placeholder

        html_content_pre = re.sub(r'\$\$([\s\S]*?)\$\$', protect_math, html_content_pre)
        html_content_pre = re.sub(r'(?<!\$)\$(?!\$)(.*?)(?<!\$)\$(?!\$)', protect_math, html_content_pre)

        import markdown
        html_body = markdown.markdown(html_content_pre, extensions=['fenced_code', 'tables'])
        
        for placeholder, content in math_placeholders.items():
            html_body = html_body.replace(placeholder, content)

        final_html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>Hibook Export</title>
<style>
    body {{ 
        font-family: "Helvetica Neue", Helvetica, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif; 
        line-height: 1.8; 
        max-width: 900px; 
        margin: 0 auto; 
        padding: 40px; 
        color: #333;
    }}
    h1, h2, h3 {{ color: #2c3e50; margin-top: 1.5em; }}
    h1 {{ border-bottom: 2px solid #eaecef; padding-bottom: 0.3em; }}
    h2 {{ border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }}
    img {{ max-width: 100%; display: block; margin: 20px auto; }}
    pre {{ 
        background: #f8f8f8; 
        padding: 15px; 
        border-radius: 5px; 
        overflow-x: auto;
        border: 1px solid #eee;
    }}
    code {{ 
        background: #f8f8f8; 
        padding: 2px 5px; 
        border-radius: 3px; 
        font-family: "Roboto Mono", Monaco, courier, monospace;
        font-size: 0.9em;
    }}
    blockquote {{ 
        border-left: 4px solid #42b983; 
        margin: 20px 0; 
        padding-left: 15px; 
        color: #666; 
        background-color: #f9f9f9;
        padding: 10px 15px;
    }}
    table {{ border-collapse: collapse; width: 100%; margin: 20px 0; }}
    th, td {{ border: 1px solid #dfe2e5; padding: 8px 12px; text-align: left; }}
    th {{ background-color: #f2f2f2; font-weight: bold; }}
    tr:nth-child(2n) {{ background-color: #f8f8f8; }}
    .page-break {{ page-break-before: always; }}
    @media print {{
        .page-break {{ page-break-before: always; }}
        h1, h2, h3, h4, h5, h6 {{ page-break-after: avoid; }}
        pre, blockquote, table, img, .mermaid, ul, ol, dl {{ page-break-inside: avoid; }}
        body {{ max-width: 100%; padding: 0; }}
    }}
    .mermaid {{ 
        display: flex; 
        justify-content: center; 
        margin: 30px 0; 
        background: white;
    }}
    .mermaid svg {{ max-width: 100% !important; height: auto !important; }}
</style>
<script>
MathJax = {{ tex: {{ inlineMath: [['$', '$'], ['\\\\(', '\\\\)']], displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']] }}, svg: {{ fontCache: 'global' }} }};
</script>
<script type="text/javascript" id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>
<script type="module">
    import mermaid from "./mermaid.js";
    mermaid.initialize({{
        startOnLoad: false, theme: 'neutral', securityLevel: 'loose', flowchart: {{ useMaxWidth: true, htmlLabels: true, curve: 'basis' }}
    }});
    await mermaid.run({{ querySelector: '.mermaid' }});
</script>
</head>
<body>
{html_body}
</body>
</html>"""
        with open(output_html_path, 'w', encoding='utf-8') as f:
            f.write(final_html)
        HiLog.info(f"HTML export saved to: {output_html_path}")
    except ImportError:
        HiLog.warning("Python 'markdown' library not found. Skipping HTML generation.")
        HiLog.warning(f"Or just use the generated Markdown file: {output_md_path}")
    pass


def __setup_parser():
    parser = argparse.ArgumentParser(
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description=textwrap.dedent(HiText("menu_desc", """
        hibook
        This is the hibook project for viewing and exporting markdown directories.
        """)),
        epilog=textwrap.dedent("""
        """)
        )

    subparsers = parser.add_subparsers(
        title=HiText("menu_list_title", "Command List")
    )

    parser_info = subparsers.add_parser(
        name="info",
        help=HiText("menu_info_help", "View tool's version and owner.")
        )
    parser_info.set_defaults(func=__info)

    parser_create = subparsers.add_parser(
        name="create",
        help=HiText("menu_create_help", "Create a new hibook project directory.")
        )
    parser_create.add_argument(
        "name",
        help=HiText("menu_create_name", "Name of the directory to create"),
        nargs=1
    )
    parser_create.set_defaults(func=__create)

    parser_web = subparsers.add_parser(
        name="web",
        help=HiText("menu_web_help", "Start a local web server to view the book.")
        )
    parser_web.add_argument(
        "-p", "--port",
        help=HiText("menu_web_port", "Port for the web server (default: 3000)"),
        nargs=1,
        action="store"
    )
    parser_web.set_defaults(func=__web)

    parser_export = subparsers.add_parser(
        name="export",
        help=HiText("menu_export_help", "Export the book to PDF ready HTML/Markdown.")
        )
    parser_export.set_defaults(func=__export)

    args = parser.parse_args()

    if len(vars(args)) == 0 or 'func' not in args:
        parser.print_help()
    else:
        args.func(vars(args))
    pass

def main():
    __setup_parser()
    pass

if __name__ == "__main__":
    main()
