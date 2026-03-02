#!/usr/bin/env python3
"""
量化金融数据查询工具
多源: 腾讯财经、新浪财经、雪球、Tushare
"""
import sys
import json
import requests
from datetime import datetime

CRAWLER_URL = 'http://localhost:18890'
TUSHARE_URL = 'http://localhost:18889'

def get_timestamp():
    return datetime.now().isoformat()

def error_response(msg):
    return json.dumps({
        "success": False,
        "error": msg,
        "timestamp": get_timestamp()
    })

def success_response(data, source="mixed"):
    return json.dumps({
        "success": True,
        "data": data,
        "source": source,
        "timestamp": get_timestamp()
    })

def get_index():
    """获取指数实时行情"""
    try:
        r = requests.get(f'{CRAWLER_URL}/index', timeout=10)
        if r.status_code == 200:
            return r.text
    except:
        pass
    return error_response("获取失败")

def get_stock(symbol):
    """获取个股实时行情"""
    try:
        r = requests.get(f'{CRAWLER_URL}/stock/{symbol}', timeout=10)
        if r.status_code == 200:
            return r.text
    except:
        pass
    return error_response("获取失败")

def get_stats():
    """获取爬虫统计"""
    try:
        r = requests.get(f'{CRAWLER_URL}/stats', timeout=10)
        if r.status_code == 200:
            return r.text
    except:
        pass
    return error_response("获取失败")

def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "help"
    arg1 = sys.argv[2] if len(sys.argv) > 2 else ""
    
    if cmd == "index":
        print(get_index())
    elif cmd == "stock":
        print(get_stock(arg1 or "000001"))
    elif cmd == "stats":
        print(get_stats())
    elif cmd == "help":
        print(json.dumps({
            "commands": {
                "index": "指数实时行情",
                "stock <symbol>": "个股行情",
                "stats": "爬虫统计"
            }
        }))
    else:
        print(error_response("未知命令"))

if __name__ == "__main__":
    main()
