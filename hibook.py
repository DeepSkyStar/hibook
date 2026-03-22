#!/usr/bin/env python3
# coding=utf-8

from hi_basic import HiAppInfo, HiLog, HiText
import os
import argparse
import textwrap
import shutil
from hi_server import cmd_web
from hi_export import cmd_update, cmd_export

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
        f.write(f"# {name.capitalize()}\n\nWelcome to your new hibook!\n\n> **Note**: This knowledge base strictly follows the [Knowledge Management Rules](./RULE.md).\n")
        
    summary_path = os.path.join(target_dir, 'SUMMARY.md')
    with open(summary_path, 'w', encoding='utf-8') as f:
        f.write(f"* [{name.capitalize()}](/README.md)\n* [Rules](/RULE.md)\n")
        
    tool_dir = os.path.dirname(os.path.abspath(__file__))
    src_rule = os.path.join(tool_dir, 'template', 'RULE.md')
    dest_rule = os.path.join(target_dir, 'RULE.md')
    if os.path.exists(src_rule):
        shutil.copy2(src_rule, dest_rule)
        
    HiLog.info(f"Successfully created new hibook project in '{name}'")
    HiLog.info(f"Run `cd {name}` and then `hibook web` to view it.")
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
    parser_web.set_defaults(func=cmd_web)

    parser_update = subparsers.add_parser(
        name="update",
        help=HiText("menu_update_help", "Update SUMMARY.md from directory structure.")
        )
    parser_update.set_defaults(func=cmd_update)

    parser_export = subparsers.add_parser(
        name="export",
        help=HiText("menu_export_help", "Export the book to PDF ready HTML/Markdown.")
        )
    parser_export.set_defaults(func=cmd_export)

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
