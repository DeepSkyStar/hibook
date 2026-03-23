import webview
import os
import subprocess
import urllib.request
import urllib.error
import urllib.parse
from hi_config import HiConfig

class DesktopAPI:
    def __init__(self, window=None):
        self.window = window

    def get_workspaces(self):
        return HiConfig.get_workspaces()

    def get_port(self):
        return HiConfig.get_port()

    def set_port(self, port):
        HiConfig.set_port(port)
        return True

    def create_kb(self, name):
        # Create under ~/Hibook/name
        base_dir = os.path.join(os.path.expanduser('~'), 'Hibook')
        os.makedirs(base_dir, exist_ok=True)
        path = os.path.join(base_dir, name)
        
        if os.path.exists(path):
            raise Exception(f"Directory {path} already exists.")
            
        os.makedirs(path)
        
        # Initialize basic files
        import shutil
        from hibook import __setup_parser
        # Could just copy from template or write a basic README
        with open(os.path.join(path, 'README.md'), 'w') as f:
            f.write(f"# {name}\\n\\nWelcome to your new knowledge base!")
            
        HiConfig.add_workspace(name, path)
        return True

    def clone_kb(self, url, name=None):
        base_dir = os.path.join(os.path.expanduser('~'), 'Hibook')
        os.makedirs(base_dir, exist_ok=True)
        
        if not name:
            name = url.split('/')[-1].replace('.git', '')
            
        path = os.path.join(base_dir, name)
        if os.path.exists(path):
            raise Exception(f"Directory {path} already exists.")
            
        subprocess.check_call(['git', 'clone', url, path])
        HiConfig.add_workspace(name, path)
        return True

    def export_kb(self, name, path):
        import hi_export
        # Perform export logic
        hi_export.cmd_export({'<doc_dir>': path})
        return True

    def launch_kb(self, name, path):
        # Launch using hibook web -n name within path, then open browser
        import webbrowser
        port = HiConfig.get_port()
        
        # Check if daemon is active
        daemon_url = f"http://localhost:{port}/_api/desktop/ping"
        daemon_alive = False
        try:
            req = urllib.request.Request(daemon_url, method='GET')
            with urllib.request.urlopen(req, timeout=1) as response:
                if response.status == 200:
                    daemon_alive = True
        except Exception:
            pass
            
        if daemon_alive:
            # Register path dynamically to background daemon
            register_url = f"http://localhost:{port}/_api/desktop/register"
            data = urllib.parse.urlencode({'name': name, 'path': path}).encode('utf-8')
            req = urllib.request.Request(register_url, data=data, method='POST')
            try:
                urllib.request.urlopen(req, timeout=3)
            except Exception as e:
                print(f"Failed to register namespace: {e}")
        else:
            # Spawn new daemon in background
            import threading
            def run_server():
                from hibook import main
                import sys
                os.chdir(path)
                old_argv = sys.argv
                sys.argv = ['hibook', 'web', '-n', name, '-p', str(port)]
                try:
                    main()
                except Exception as e:
                    print(f"Server exception: {e}")
                finally:
                    sys.argv = old_argv

            t = threading.Thread(target=run_server, daemon=True)
            t.start()
            import time
            time.sleep(2) # Wait for server to bind

        target_url = f"http://localhost:{port}/{name}/"
        webbrowser.open(target_url)
        return True


def start_desktop():
    api = DesktopAPI()
    
    # Path to local dashboard HTML
    template_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'template', 'desktop')
    html_file = f"file://{os.path.join(template_dir, 'index.html')}"
    
    window = webview.create_window(
        title='Hibook Desktop Hub',
        url=html_file,
        js_api=api,
        width=1100,
        height=750,
        min_size=(800, 600)
    )
    api.window = window
    webview.start(debug=False)

if __name__ == '__main__':
    start_desktop()
