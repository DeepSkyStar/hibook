import os
import json
from pathlib import Path

class HiConfig:
    _CONFIG_FILE = os.path.join(str(Path.home()), '.hibook', 'config.json')

    @classmethod
    def _ensure_config_exists(cls):
        os.makedirs(os.path.dirname(cls._CONFIG_FILE), exist_ok=True)
        if not os.path.exists(cls._CONFIG_FILE):
            cls._save({
                'port': 3007,
                'workspaces': []
            })

    @classmethod
    def _save(cls, data):
        with open(cls._CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4)

    @classmethod
    def get_config(cls):
        cls._ensure_config_exists()
        try:
            with open(cls._CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {'port': 3007, 'workspaces': []}

    @classmethod
    def get_port(cls):
        return cls.get_config().get('port', 3007)

    @classmethod
    def set_port(cls, port):
        cfg = cls.get_config()
        cfg['port'] = int(port)
        cls._save(cfg)

    @classmethod
    def get_workspaces(cls):
        return cls.get_config().get('workspaces', [])

    @classmethod
    def add_workspace(cls, name, path):
        cfg = cls.get_config()
        workspaces = cfg.get('workspaces', [])
        
        # Don't add duplicate paths
        for ws in workspaces:
            if ws.get('path') == path:
                ws['name'] = name # Update name if path matches
                cls._save(cfg)
                return
                
        # Handle duplicate names by padding
        original_name = name
        counter = 1
        while any(ws.get('name') == name for ws in workspaces):
            name = f"{original_name}_{counter}"
            counter += 1
            
        workspaces.append({'name': name, 'path': path})
        cfg['workspaces'] = workspaces
        cls._save(cfg)

    @classmethod
    def remove_workspace(cls, name):
        cfg = cls.get_config()
        workspaces = cfg.get('workspaces', [])
        cfg['workspaces'] = [ws for ws in workspaces if ws.get('name') != name]
        cls._save(cfg)
