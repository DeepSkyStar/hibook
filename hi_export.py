#!/usr/bin/env python3
# coding=utf-8

import os
import re
import shutil
from hi_basic import *

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
            if path.startswith('/'):
                path = path.lstrip('/')
            elif path.startswith('./'):
                path = path[2:]
            level = len(indent) // 2
            files.append((title, path, level))
    return files

def get_title(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                if line.startswith('# '):
                    return line[2:].strip()
    except:
        pass
    name_without_ext = os.path.splitext(os.path.basename(file_path))[0]
    return name_without_ext

def process_folder(folder_path, root_dir, level):
    lines = []
    indent = "  " * level 
    try:
        items = os.listdir(folder_path)
    except OSError:
        return []

    files = []
    dirs = []
    for item in items:
        if item.startswith('.') or item in ['export', 'assets', 'rule']: continue
        full_path = os.path.join(folder_path, item)
        if os.path.isdir(full_path):
            dirs.append(item)
        elif item.endswith('.md'):
            files.append(item)
            
    files.sort()
    dirs.sort()
    
    for file in files:
        if file.lower() == 'readme.md' or file in ['SUMMARY.md', 'RULE.md']:
            continue
            
        file_path = os.path.join(folder_path, file)
        rel_path = os.path.relpath(file_path, root_dir)
        title = get_title(file_path)
        
        lines.append(f"{indent}* [{title}](/{rel_path})")
        
    for d in dirs:
        dir_path = os.path.join(folder_path, d)
        readme_path = os.path.join(dir_path, 'README.md')
        
        display_title = d.title()
        link = ""
        
        if os.path.exists(readme_path):
            display_title = get_title(readme_path)
            link = os.path.relpath(readme_path, root_dir)
        
        sub_files = [f for f in os.listdir(dir_path) if f.endswith('.md')]
        if link:
            lines.append(f"{indent}* [{display_title}](/{link})")
            lines.extend(process_folder(dir_path, root_dir, level + 1))
        elif sub_files:
            lines.append(f"{indent}* {display_title}")
            lines.extend(process_folder(dir_path, root_dir, level + 1))

    return lines

def cmd_update(args):
    root_dir = os.getcwd()
    summary_path = os.path.join(root_dir, 'SUMMARY.md')
    
    content = []
    
    readme_path = os.path.join(root_dir, 'README.md')
    if os.path.exists(readme_path):
        title = get_title(readme_path)
        content.append(f"* [{title}](/README.md)")
    else:
        content.append("* [Overview](/README.md)")
        
    rule_path = os.path.join(root_dir, 'RULE.md')
    if os.path.exists(rule_path):
        content.append("* [Rules](/RULE.md)")
        
    content.extend(process_folder(root_dir, root_dir, level=0))

    with open(summary_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(content) + '\n')
        
    HiLog.info(f"Successfully updated {summary_path}")
    pass

def read_file_content(file_path, root_dir):
    full_path = os.path.join(root_dir, file_path)
    if not os.path.exists(full_path):
        HiLog.warning(f"File not found: {full_path}")
        return ""
    with open(full_path, 'r', encoding='utf-8') as f:
        content = f.read()
    return content

def cmd_export(target_dir=None, output_dir=None):
    root_dir = target_dir if target_dir else os.getcwd()
    summary_path = os.path.join(root_dir, 'SUMMARY.md')
    if not os.path.exists(summary_path):
        HiLog.error(f"Cannot find SUMMARY.md in {root_dir}")
        return
        
    if not output_dir:
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

    # No longer copying separate mermaid ESM packages since we migrated to single global CDN bundles

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
<script src="https://cdn.jsdelivr.net/npm/mermaid@9.4.3/dist/mermaid.min.js"></script>
<script type="text/javascript">
    mermaid.initialize({{
        startOnLoad: false, theme: 'neutral', securityLevel: 'loose', flowchart: {{ useMaxWidth: true, htmlLabels: true, curve: 'basis' }}
    }});
    window.addEventListener('load', function() {{
        var nodes = document.querySelectorAll('.mermaid');
        if (nodes.length > 0) {{
            mermaid.init(undefined, nodes);
        }}
    }});
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
