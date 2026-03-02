#!/usr/bin/env python3
"""
金融数据爬虫 - 腾讯财经实时行情
"""
import requests
import re
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime
import time

class TencentCrawler:
    def __init__(self):
        self.cache = {}
        self.cache_time = 0
    
    def get_data(self):
        # 检查缓存
        if time.time() - self.cache_time < 3 and self.cache:
            return self.cache
        
        url = 'https://qt.gtimg.cn/q=sh000001,sz399001,sz399006,sh000300,sh000016,sh000905'
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.qq.com/'
        }
        
        try:
            r = requests.get(url, headers=headers, timeout=10)
            if r.status_code == 200:
                # GBK编码转换
                text = r.content.decode('gbk', errors='ignore')
                
                # 解析
                result = []
                symbols = [
                    ('sh000001', '上证指数'),
                    ('sz399001', '深证成指'),
                    ('sz399006', '创业板指'),
                    ('sh000300', '沪深300'),
                    ('sh000016', '上证50'),
                    ('sh000905', '中证500'),
                ]
                
                for sym, name in symbols:
                    pattern = f'v_{sym}=\\\"([^\\\"]+)\\\"'
                    match = re.search(pattern, text)
                    if match:
                        parts = match.group(1).split('~')
                        if len(parts) > 30:
                            result.append({
                                'symbol': sym,
                                'name': parts[1],
                                'price': float(parts[3]) if parts[3] else 0,
                                'change': float(parts[4]) if parts[4] else 0,
                                'change_pct': float(parts[5]) if parts[5] else 0,
                            })
                
                if result:
                    self.cache = result
                    self.cache_time = time.time()
                    return result
        except Exception as e:
            print(f"Error: {e}")
        
        return []
    
    def get_stock(self, symbol):
        """获取个股"""
        if symbol.startswith('6'):
            sym = f'sh{symbol}'
        else:
            sym = f'sz{symbol}'
        
        url = f'https://qt.gtimg.cn/q={sym}'
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.qq.com/'
        }
        
        try:
            r = requests.get(url, headers=headers, timeout=10)
            if r.status_code == 200:
                text = r.content.decode('gbk', errors='ignore')
                pattern = f'v_{sym}=\\\"([^\\\"]+)\\\"'
                match = re.search(pattern, text)
                if match:
                    parts = match.group(1).split('~')
                    if len(parts) > 30:
                        return {
                            'symbol': symbol,
                            'name': parts[1],
                            'price': float(parts[3]) if parts[3] else 0,
                            'change': float(parts[4]) if parts[4] else 0,
                            'change_pct': float(parts[5]) if parts[5] else 0,
                            'open': float(parts[6]) if parts[6] else 0,
                            'high': float(parts[7]) if parts[7] else 0,
                            'low': float(parts[8]) if parts[8] else 0,
                        }
        except Exception as e:
            print(f"Error: {e}")
        
        return {}

crawler = TencentCrawler()
PORT = 18890

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {args[0]}")
    
    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
    
    def do_GET(self):
        path = self.path
        
        if path == '/health':
            self.send_json({"status": "ok", "service": "腾讯财经爬虫", "timestamp": datetime.now().isoformat()})
            return
        
        if '/index' in path or path == '/':
            data = crawler.get_data()
            if data:
                self.send_json({"success": True, "data": data, "source": "tencent", "timestamp": datetime.now().isoformat()})
            else:
                self.send_json({"success": False, "error": "获取失败"})
            return
        
        if '/stock/' in path:
            symbol = path.split('/')[-1] or '000001'
            data = crawler.get_stock(symbol)
            if data:
                self.send_json({"success": True, "data": data, "source": "tencent", "timestamp": datetime.now().isoformat()})
            else:
                self.send_json({"success": False, "error": "获取失败"})
            return
        
        self.send_json({"error": "未知接口"})

print(f"启动腾讯财经爬虫服务，端口: {PORT}")
HTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
