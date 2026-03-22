import os
import sqlite3
import re
import threading
from hi_basic import HiLog

class SearchManager:
    _instance = None
    _lock = threading.Lock()

    @classmethod
    def get_instance(cls, root_dir=None):
        if not cls._instance and root_dir:
            with cls._lock:
                if not cls._instance:
                    cls._instance = SearchManager(root_dir)
        return cls._instance

    def __init__(self, root_dir):
        self.root_dir = root_dir
        self.db_path = os.path.join(root_dir, '.hibook_web', 'hibook_index.db')
        self.lock = threading.Lock()
        self._init_db()

    def _init_db(self):
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        with self.lock:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute('''
                    CREATE TABLE IF NOT EXISTS file_meta (
                        path TEXT PRIMARY KEY,
                        mtime REAL
                    )
                ''')
                
                # Use unicode61 which is built-in everywhere.
                # We will manually segment CJK characters to support precise phrase matching.
                conn.execute('''
                    CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
                        path, title, tags, aliases, content,
                        tokenize="unicode61"
                    )
                ''')

    def _segment_cjk(self, text):
        if not text: return ""
        # Insert spaces around CJK characters
        return re.sub(r'([\u4e00-\u9fff])', r' \1 ', text)
        
    def _clean_cjk_spaces(self, text):
        # Remove spaces between CJK characters and <b>/</b> tags
        # This reverses the space insertion for display
        return re.sub(r'(?<=[\u4e00-\u9fff>])\s+(?=[<\u4e00-\u9fff])', '', text).strip()

    def parse_frontmatter(self, content):
        tags = []
        aliases = []
        title = ""
        body = content

        fm_match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
        if fm_match:
            fm_text = fm_match.group(1)
            body = content[fm_match.end():]
            
            for line in fm_text.split('\n'):
                line = line.strip()
                if line.startswith('title:'):
                    title = line.split(':', 1)[1].strip().strip('"\'')
                elif line.startswith('aliases:'):
                    al_val = line.split(':', 1)[1].strip()
                    if al_val.startswith('[') and al_val.endswith(']'):
                        aliases = [x.strip().strip('"\'') for x in al_val[1:-1].split(',') if x.strip()]
                elif line.startswith('tags:'):
                    tg_val = line.split(':', 1)[1].strip()
                    if tg_val.startswith('[') and tg_val.endswith(']'):
                        tags = [x.strip().strip('"\'') for x in tg_val[1:-1].split(',') if x.strip()]

        if not title:
            t_match = re.search(r'^#\s+(.*?)$', body, re.MULTILINE)
            if t_match:
                title = t_match.group(1).strip()
                
        return title, tags, aliases, body

    def _update_file_index(self, conn, path, full_path, mtime):
        try:
            with open(full_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception:
            return

        title, tags, aliases, body = self.parse_frontmatter(content)
        tags_str = " ".join(tags)
        aliases_str = " ".join(aliases)
        
        cTitle = title.replace('"', '""')
        cTags = tags_str.replace('"', '""')
        cAliases = aliases_str.replace('"', '""')
        cBody = body.replace('"', '""')

        # Remove old entry if exists (FTS5 requires explicit delete or just using INSERT OR REPLACE via triggers, 
        # but since FTS doesn't have primary keys seamlessly, it's safer to delete by path)
        conn.execute("DELETE FROM search_index WHERE path = ?", (path,))
        conn.execute('''
            INSERT INTO search_index (path, title, tags, aliases, content)
            VALUES (?, ?, ?, ?, ?)
        ''', (path, self._segment_cjk(title), self._segment_cjk(tags_str), self._segment_cjk(aliases_str), self._segment_cjk(body)))
        
        conn.execute('''
            INSERT OR REPLACE INTO file_meta (path, mtime)
            VALUES (?, ?)
        ''', (path, mtime))

    def sync_index(self):
        """Scans the directory and updates the FTS index for changed files."""
        HiLog.info("SearchManager: Synchronizing global search index...")
        with self.lock:
            with sqlite3.connect(self.db_path) as conn:
                # 1. Load existing file mod times
                cursor = conn.execute("SELECT path, mtime FROM file_meta")
                existing = {row[0]: row[1] for row in cursor.fetchall()}
                
                current_files = set()

                for root, dirs, files in os.walk(self.root_dir):
                    dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ['template']]
                    for f in files:
                        if f.endswith('.md'):
                            full_path = os.path.join(root, f)
                            path = os.path.relpath(full_path, self.root_dir)
                            current_files.add(path)
                            
                            mtime = os.path.getmtime(full_path)
                            
                            if path not in existing or mtime > existing[path]:
                                self._update_file_index(conn, path, full_path, mtime)
                                
                # 2. Cleanup deleted files
                deleted_files = set(existing.keys()) - current_files
                for df in deleted_files:
                    conn.execute("DELETE FROM search_index WHERE path = ?", (df,))
                    conn.execute("DELETE FROM file_meta WHERE path = ?", (df,))
                    
                conn.commit()
        HiLog.info("SearchManager: Index sync complete.")

    def search(self, query):
        if not query:
            return []
            
        # Segment and quote the query for phrase matching
        safe_query = self._segment_cjk(query).strip()
        safe_query = safe_query.replace('"', '""')
        safe_query = f'"{safe_query}"'
             
        results = []
        with self.lock:
            with sqlite3.connect(self.db_path) as conn:
                try:
                    cursor = conn.execute(f'''
                        SELECT 
                            path, 
                            title, 
                            snippet(search_index, 4, '<b>', '</b>', '...', 50) as snippet,
                            rank
                        FROM search_index 
                        WHERE search_index MATCH ?
                        ORDER BY rank
                        LIMIT 30
                    ''', (safe_query,))
                    
                    for row in cursor.fetchall():
                        results.append({
                            "path": row[0],
                            "title": self._clean_cjk_spaces(row[1]),
                            "snippet": self._clean_cjk_spaces(row[2])
                        })
                except Exception as e:
                    HiLog.error(f"Search query failed: {e}")
        return results

    def start_background_sync(self):
        t = threading.Thread(target=self.sync_index, daemon=True)
        t.start()
