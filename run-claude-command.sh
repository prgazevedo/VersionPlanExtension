#!/bin/bash

# Script to execute Claude Config Manager commands via VSCode CLI automation

COMMAND=$1

if [ -z "$COMMAND" ]; then
    echo "Usage: $0 <command>"
    echo "Available commands:"
    echo "  init    - Initialize Config Repository"
    echo "  create  - Create from Template"
    echo "  sync    - Sync to Repository"  
    echo "  edit    - Edit CLAUDE.md"
    exit 1
fi

# Map short commands to full command IDs
case $COMMAND in
    "init")
        CMD_ID="claude-config.init"
        ;;
    "create")
        CMD_ID="claude-config.create"
        ;;
    "sync")
        CMD_ID="claude-config.sync"
        ;;
    "edit")
        CMD_ID="claude-config.edit"
        ;;
    *)
        echo "Unknown command: $COMMAND"
        exit 1
        ;;
esac

echo "Executing Claude Config command: $CMD_ID"

# Use AppleScript to automate VSCode command execution
osascript -e "
tell application \"Visual Studio Code\"
    activate
    delay 1
    tell application \"System Events\"
        key code 35 using {command down, shift down}
        delay 1
        type text \"$CMD_ID\"
        delay 1
        key code 36
    end tell
end tell
"