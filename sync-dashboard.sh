#!/bin/bash

# Quick dashboard sync (for UI changes only)
# Usage: ./sync-dashboard.sh

scp "/Users/mac/AI/OpenCode/Multi-Agent Collaboration Platform (MACP)/dashboard.html" root@43.140.246.228:/opt/macp/
echo "Dashboard synced to server"
