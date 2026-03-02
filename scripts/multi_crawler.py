#!/usr/bin/env python3
"""
多源金融数据爬虫服务
支持: 腾讯财经、新浪财经、雪球
目标: 实时、高质量、高成功率
"""
import requests
import re
import json
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime
from typing import Optional, List, Dict

class TencentCrawler:
    """腾讯财经"""
    
    def get_index(self) -> List[Dict]:
        url = 'https://qt.gtimg.cn/q=sh000001,sz399001,sz399006,sh000300,sh000016,sh000905'
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.qq.com/'
        }
        try:
            r = requests.get(url, headers=headers, timeout=10)
            if r.status_code == 200:
                text = r.content.decode('gbk', errors='ignore')
                symbols = [
                    ('sh000001', '上证指数'), ('sz399001', '深证成指'),
                    ('sz399006', '创业板指'), ('sh000300', '沪深300'),
                    ('sh000016', '上证50'), ('sh000905', '中证500'),
                ]
                result = []
                for sym, name in symbols:
                    pattern = f'v_{sym}=\"([^\"]+)\"'
                    match = re.search(pattern, text)
                    if match:
                        parts = match.group(1).split('~')
                        if len(parts) > 30:
                            result.append({
                                'symbol': sym, 'name': name,
                                'price': float(parts[3]) if parts[3] else 0,
                                'change': float(parts[4]) if parts[4] else 0,
                                'change_pct': float(parts[5]) if parts[5] else 0,
                            })
                return result
        except Exception as e:
            print(f"[腾讯] 错误: {e}")
        return []
    
    def get_stock(self, symbol: str) -> Dict:
        sym = f'sh{symbol}' if symbol.startswith('6') else f'sz{symbol}'
        url = f'https://qt.gtimg.cn/q={sym}'
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.qq.com/'
        }
        try:
            r = requests.get(url, headers=headers, timeout=10)
            if r.status_code == 200:
                text = r.content.decode('gbk', errors='ignore')
                pattern = f'v_{sym}=\"([^\"]+)\"'
                match = re.search(pattern, text)
                if match:
                    parts = match.group(1).split('~')
                    if len(parts) > 30:
                        return {
                            'symbol': symbol, 'name': parts[1],
                            'price': float(parts[3]) if parts[3] else 0,
                            'change': float(parts[4]) if parts[4] else 0,
                            'change_pct': float(parts[5]) if parts[5] else 0,
                            'open': float(parts[6]) if parts[6] else 0,
                            'high': float(parts[7]) if parts[7] else 0,
                            'low': float(parts[8]) if parts[8] else 0,
                            'volume': parts[6], 'amount': parts[7],
                        }
        except Exception as e:
            print(f"[腾讯] 股票{symbol}错误: {e}")
        return {}


class SinaCrawler:
    """新浪财经"""
    
    def get_index(self) -> List[Dict]:
        url = 'https://hq.sinajs.cn/list=n_sh000001,n_sz399001,n_sz399006,n_sh000300,n_sh000016,n_sh000905'
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://finance.sina.com.cn/',
        }
        try:
            r = requests.get(url, headers=headers, timeout=10)
            if r.status_code == 200:
                text = r.text
                name_map = {
                    'n_sh000001': ('sh000001', '上证指数'),
                    'n_sz399001': ('sz399001', '深证成指'),
                    'n_sz399006': ('sz399006', '创业板指'),
                    'n_sh000300': ('sh000300', '沪深300'),
                    'n_sh000016': ('sh000016', '上证50'),
                    'n_sh000905': ('sh000905', '中证500'),
                }
                result = []
                for key, (code, name) in name_map.items():
                    pattern = f'var hq_str_{key}="([^"]+)"'
                    match = re.search(pattern, text)
                    if match:
                        parts = match.group(1).split(',')
                        if len(parts) > 3:
                            result.append({
                                'symbol': code, 'name': name,
                                'price': float(parts[1]) if parts[1] else 0,
                                'change': float(parts[2]) if parts[2] else 0,
                                'change_pct': float(parts[3]) if parts[3] else 0,
                            })
                return result
        except Exception as e:
            print(f"[新浪] 错误: {e}")
        return []
    
    def get_stock(self, symbol: str) -> Dict:
        sym = f'sh{symbol}' if symbol.startswith('6') else f'sz{symbol}'
        url = f'https://hq.sinajs.cn/list={sym}'
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://finance.sina.com.cn/',
        }
        try:
            r = requests.get(url, headers=headers, timeout=10)
            if r.status_code == 200:
                text = r.text
                pattern = f'var hq_str_{sym}="([^"]+)"'
                match = re.search(pattern, text)
                if match:
                    parts = match.group(1).split(',')
                    if len(parts) > 30:
                        return {
                            'symbol': symbol, 'name': parts[0],
                            'price': float(parts[1]) if parts[1] else 0,
                            'change': float(parts[2]) if parts[2] else 0,
                            'change_pct': float(parts[3]) if parts[3] else 0,
                            'open': float(parts[5]) if parts[5] else 0,
                            'high': parts[6], 'low': parts[7],
                        }
        except Exception as e:
            print(f"[新浪] 股票{symbol}错误: {e}")
        return {}


class XueqiuCrawler:
    """雪球"""
    
    def __init__(self):
        self.cookies = self._get_cookies()
    
    def _get_cookies(self) -> Dict:
        headers = {'User-Agent': 'Mozilla/5.0'}
        try:
            r = requests.get('https://xueqiu.com/', headers=headers, timeout=10)
            return dict(r.cookies)
        except:
            return {}
    
    def get_stock(self, symbol: str) -> Dict:
        url = f'https://stock.xueqiu.com/v5/stock/quote.json?symbol={symbol}'
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://xueqiu.com/',
            'Cookie': '; '.join([f'{k}={v}' for k, v in self.cookies.items()]),
        }
        try:
            r = requests.get(url, headers=headers, timeout=10)
            if r.status_code == 200:
                data = r.json()
                if data.get('data'):
                    item = data['data']
                    return {
                        'symbol': symbol,
                        'name': item.get('name'),
                        'price': item.get('current'),
                        'change': item.get('change'),
                        'change_pct': item.get('percent'),
                        'open': item.get('open'),
                        'high': item.get('high'),
                        'low': item.get('low'),
                    }
        except Exception as e:
            print(f"[雪球] 股票{symbol}错误: {e}")
        return {}


class DataManager:
    """数据管理器 - 多源优先"""
    
    def __init__(self):
        self.tencent = TencentCrawler()
        self.sina = SinaCrawler()
        self.xueqiu = XueqiuCrawler()
        self.cache = {}
        self.cache_time = 0
        self.stats = {'success': 0, 'fail': 0}
    
    def get_index(self) -> List[Dict]:
        # 优先腾讯
        data = self.tencent.get_index()
        if data:
            self.stats['success'] += 1
            return data
        
        # 备用新浪
        data = self.sina.get_index()
        if data:
            self.stats['success'] += 1
            return data
        
        self.stats['fail'] += 1
        return []
    
    def get_stock(self, symbol: str) -> Dict:
        # 优先腾讯
        data = self.tencent.get_stock(symbol)
        if data:
            self.stats['success'] += 1
            return data
        
        # 备用新浪
        data = self.sina.get_stock(symbol)
        if data:
            self.stats['success'] += 1
            return data
        
        # 备用雪球
        data = self.xueqiu.get_stock(symbol)
        if data:
            self.stats['success'] += 1
            return data
        
        self.stats['fail'] += 1
        return {}
    
    def get_stats(self) -> Dict:
        total = self.stats['success'] + self.stats['fail']
        rate = self.stats['success'] / total * 100 if total > 0 else 0
        return {
            'success': self.stats['success'],
            'fail': self.stats['fail'],
            'rate': f"{rate:.1f}%"
        }


data_manager = DataManager()
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
            self.send_json({
                "status": "ok",
                "service": "多源金融数据爬虫",
                "sources": ["腾讯财经", "新浪财经", "雪球"],
                "stats": data_manager.get_stats(),
                "timestamp": datetime.now().isoformat()
            })
            return
        
        if path == '/stats':
            self.send_json(data_manager.get_stats())
            return
        
        if '/index' in path or path == '/':
            data = data_manager.get_index()
            if data:
                self.send_json({
                    "success": True,
                    "data": data,
                    "source": "tencent/sina",
                    "timestamp": datetime.now().isoformat()
                })
            else:
                self.send_json({
                    "success": False,
                    "error": "获取失败",
                    "timestamp": datetime.now().isoformat()
                })
            return
        
        if '/stock/' in path:
            symbol = path.split('/')[-1] or '000001'
            data = data_manager.get_stock(symbol)
            if data:
                self.send_json({
                    "success": True,
                    "data": data,
                    "source": "tencent/sina/xueqiu",
                    "timestamp": datetime.now().isoformat()
                })
            else:
                self.send_json({
                    "success": False,
                    "error": "获取失败",
                    "timestamp": datetime.now().isoformat()
                })
            return
        
        self.send_json({"error": "未知接口"})

print(f"启动多源金融数据爬虫，端口: {PORT}")
print("数据源: 腾讯财经、新浪财经、雪球")
HTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
