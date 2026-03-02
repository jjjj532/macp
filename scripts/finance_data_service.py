#!/usr/bin/env python3
"""
高质量金融数据服务
支持: Tushare + 反爬虫爬虫
目标: 实时、高质量、高成功率
"""
import sys
import json
import time
import random
import hashlib
import requests
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
import threading

# 配置
TUSHARE_TOKEN = '5109b8f566d294f1281ff8a39da210d75725ec2de4b256072bb0725a'

# 反爬虫配置
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
]

HEADERS = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
}

class AntiCrawler:
    """反爬虫工具类"""
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
        self.last_request_time = 0
        self.request_count = 0
        self.lock = threading.Lock()
    
    def get_random_headers(self) -> Dict:
        """获取随机请求头"""
        headers = HEADERS.copy()
        headers['User-Agent'] = random.choice(USER_AGENTS)
        headers['Referer'] = random.choice([
            'https://www.eastmoney.com/',
            'https://finance.sina.com.cn/',
            'https://www.baidu.com/',
        ])
        return headers
    
    def rate_limit(self, min_interval: float = 0.5):
        """频率限制"""
        with self.lock:
            now = time.time()
            elapsed = now - self.last_request_time
            if elapsed < min_interval:
                time.sleep(min_interval - elapsed)
            self.last_request_time = time.time()
    
    def request_with_retry(
        self, 
        url: str, 
        method: str = 'GET',
        max_retries: int = 3,
        timeout: int = 10,
        **kwargs
    ) -> Optional[requests.Response]:
        """带重试的请求"""
        for attempt in range(max_retries):
            try:
                self.rate_limit(random.uniform(0.3, 1.0))
                response = self.session.request(
                    method, 
                    url, 
                    timeout=timeout,
                    headers=self.get_random_headers(),
                    **kwargs
                )
                if response.status_code == 200:
                    return response
                elif response.status_code == 403:
                    print(f"[反爬] 请求被禁止: {url}")
                elif response.status_code == 404:
                    return None
            except Exception as e:
                print(f"[请求失败] 尝试 {attempt + 1}/{max_retries}: {e}")
                time.sleep(random.uniform(1, 3))
        return None


class TushareDataSource:
    """Tushare数据源"""
    
    def __init__(self, token: str):
        import tushare as ts
        ts.set_token(token)
        self.pro = ts.pro_api()
        self.cache = {}
        self.cache_time = {}
        self.cache_duration = 5  # 5秒缓存
    
    def _is_cache_valid(self, key: str) -> bool:
        if key not in self.cache:
            return False
        return time.time() - self.cache_time.get(key, 0) < self.cache_duration
    
    def get_index_realtime(self) -> List[Dict]:
        """获取指数实时行情"""
        key = 'index_realtime'
        if self._is_cache_valid(key):
            return self.cache[key]
        
        try:
            df = self.pro.index_daily(ts_code='000001.SH', start_date=(datetime.now() - timedelta(days=5)).strftime('%Y%m%d'))
            result = df.tail(1).to_dict('records')
            self.cache[key] = result
            self.cache_time[key] = time.time()
            return result
        except Exception as e:
            print(f"[Tushare] 获取指数失败: {e}")
            return []
    
    def get_stock_realtime(self, symbol: str = '000001') -> Dict:
        """获取个股实时行情"""
        key = f'stock_{symbol}'
        if self._is_cache_valid(key):
            return self.cache[key]
        
        try:
            df = self.pro.daily(ts_code=f'{symbol}.SZ' if symbol.startswith('0') else f'{symbol}.SH', 
                               start_date=(datetime.now() - timedelta(days=1)).strftime('%Y%m%d'))
            if not df.empty:
                result = df.tail(1).to_dict('records')[0]
                self.cache[key] = result
                self.cache_time[key] = time.time()
                return result
        except Exception as e:
            print(f"[Tushare] 获取股票失败: {e}")
        return {}


class CrawlerDataSource:
    """爬虫数据源 - 东方财富"""
    
    def __init__(self):
        self.anti_crawler = AntiCrawler()
        self.base_url = 'https://push2.eastmoney.com'
    
    def get_index_realtime(self) -> List[Dict]:
        """获取指数实时行情"""
        url = f"{self.base_url}/api/qt/ulist.np/get"
        params = {
            'fltt': 2,
            'fields': 'f2,f3,f4,f12,f14',
            'secids': '1.000001,0.399001,0.399006,1.000300,1.000016,1.000905,0.399101,0.399102',
            '_': int(time.time() * 1000)
        }
        
        response = self.anti_crawler.request_with_retry(url, params=params)
        if response and response.text:
            try:
                data = response.json()
                if data.get('data'):
                    return [{
                        'symbol': item.get('f12', ''),
                        'name': item.get('f14', ''),
                        'price': item.get('f2'),
                        'change': item.get('f3')
                    } for item in data['data']]
            except:
                pass
        return []
    
    def get_stock_realtime(self, symbol: str) -> Dict:
        """获取个股实时行情"""
        secid = f'1.{symbol}' if symbol.startswith('6') else f'0.{symbol}'
        url = f"{self.base_url}/api/qt/stock/get"
        params = {
            'secid': secid,
            'fields': 'f43,f44,f45,f46,f47,f48,f58,f170',
            '_': int(time.time() * 1000)
        }
        
        response = self.anti_crawler.request_with_retry(url, params=params)
        if response and response.text:
            try:
                data = response.json()
                if data.get('data'):
                    d = data['data']
                    return {
                        'symbol': symbol,
                        'name': d.get('f58', ''),
                        'price': d.get('f43', 0) / 100 if d.get('f43') else None,
                        'change': d.get('f170', 0) / 100 if d.get('f170') else None,
                        'open': d.get('f43', 0) / 100 if d.get('f43') else None,
                        'high': d.get('f44', 0) / 100 if d.get('f44') else None,
                        'low': d.get('f45', 0) / 100 if d.get('f45') else None,
                    }
            except:
                pass
        return {}
    
    def get_concept_board(self) -> List[Dict]:
        """获取概念板块"""
        url = f"{self.base_url}/api/qt/clist/get"
        params = {
            'pn': 1,
            'pz': 30,
            'po': 1,
            'np': 1,
            'ut': 'bd1d9ddb04089700cf9c27f6f7426281',
            'fltt': 2,
            'invt': 2,
            'fid': 'f3',
            'fs': 'm:90+t:2',
            'fields': 'f2,f3,f4,f12,f14',
            '_': int(time.time() * 1000)
        }
        
        response = self.anti_crawler.request_with_retry(url, params=params)
        if response and response.text:
            try:
                data = response.json()
                if data.get('data') and data['data'].get('diff'):
                    return [{
                        'name': item.get('f14', ''),
                        'change': item.get('f3'),
                    } for item in data['data']['diff']]
            except:
                pass
        return []
    
    def get_industry_board(self) -> List[Dict]:
        """获取行业板块"""
        url = f"{self.base_url}/api/qt/clist/get"
        params = {
            'pn': 1,
            'pz': 30,
            'po': 1,
            'np': 1,
            'ut': 'bd1d9ddb04089700cf9c27f6f7426281',
            'fltt': 2,
            'invt': 2,
            'fid': 'f3',
            'fs': 'm:90+t:3',
            'fields': 'f2,f3,f4,f12,f14',
            '_': int(time.time() * 1000)
        }
        
        response = self.anti_crawler.request_with_retry(url, params=params)
        if response and response.text:
            try:
                data = response.json()
                if data.get('data') and data['data'].get('diff'):
                    return [{
                        'name': item.get('f14', ''),
                        'change': item.get('f3'),
                    } for item in data['data']['diff']]
            except:
                pass
        return []


class FinanceDataService:
    """金融数据服务 - 整合Tushare和爬虫"""
    
    def __init__(self):
        self.tushare = TushareDataSource(TUSHARE_TOKEN)
        self.crawler = CrawlerDataSource()
        self.source_priority = ['tushare', 'crawler']  # 优先使用Tushare
    
    def get_timestamp(self) -> str:
        return datetime.now().isoformat()
    
    def success_response(self, data: Any, source: str = 'mixed') -> Dict:
        return {
            "success": True,
            "data": data,
            "timestamp": self.get_timestamp(),
            "source": source
        }
    
    def error_response(self, error: str) -> Dict:
        return {
            "success": False,
            "error": error,
            "timestamp": self.get_timestamp()
        }
    
    def get_index_realtime(self) -> Dict:
        """获取指数实时行情"""
        # 优先使用爬虫（更实时）
        data = self.crawler.get_index_realtime()
        if data:
            return self.success_response(data, 'crawler')
        
        # 备用Tushare
        data = self.tushare.get_index_realtime()
        if data:
            return self.success_response(data, 'tushare')
        
        return self.error_response("获取失败")
    
    def get_stock_realtime(self, symbol: str = '000001') -> Dict:
        """获取个股实时行情"""
        data = self.crawler.get_stock_realtime(symbol)
        if data:
            return self.success_response(data, 'crawler')
        
        data = self.tushare.get_stock_realtime(symbol)
        if data:
            return self.success_response(data, 'tushare')
        
        return self.error_response("获取失败")
    
    def get_concept_board(self) -> Dict:
        """获取概念板块"""
        data = self.crawler.get_concept_board()
        if data:
            return self.success_response(data, 'crawler')
        
        return self.error_response("获取失败")
    
    def get_industry_board(self) -> Dict:
        """获取行业板块"""
        data = self.crawler.get_industry_board()
        if data:
            return self.success_response(data, 'crawler')
        
        return self.error_response("获取失败")
    
    def get_stock_kline(self, symbol: str, period: str = 'daily') -> Dict:
        """获取K线数据"""
        try:
            import tushare as ts
            ts.set_token(TUSHARE_TOKEN)
            pro = ts.pro_api()
            
            df = pro.daily(
                ts_code=f'{symbol}.SZ' if symbol.startswith('0') else f'{symbol}.SH',
                start_date=(datetime.now() - timedelta(days=30)).strftime('%Y%m%d')
            )
            
            if not df.empty:
                data = df.tail(30).to_dict('records')
                return self.success_response(data, 'tushare')
        except Exception as e:
            print(f"[K线] 获取失败: {e}")
        
        return self.error_response("获取失败")
    
    def get_fund_flow(self, symbol: str) -> Dict:
        """获取资金流向"""
        # 爬虫方式获取
        url = f"https://push2.eastmoney.com/api/qt/stock/fflow/daykline/get"
        params = {
            'lmt': 10,
            'klt': 101,
            'secid': f'1.{symbol}' if symbol.startswith('6') else f'0.{symbol}',
            'fields1': 'f1,f2,f3,f7',
            'fields2': 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65',
            '_': int(time.time() * 1000)
        }
        
        response = self.crawler.anti_crawler.request_with_retry(url, params=params)
        if response and response.text:
            try:
                data = response.json()
                if data.get('data') and data['data'].get('klines'):
                    klines = data['data']['klines']
                    result = []
                    for kline in klines:
                        parts = kline.split(',')
                        result.append({
                            'date': parts[0],
                            '主力净流入': parts[1],
                            '散户净流入': parts[2],
                            '主力净流入占比': parts[3],
                        })
                    return self.success_response(result, 'crawler')
            except:
                pass
        
        return self.error_response("获取失败")
    
    def health_check(self) -> Dict:
        """健康检查"""
        return {
            "status": "ok",
            "service": "金融数据服务",
            "sources": {
                "tushare": "available",
                "crawler": "available"
            },
            "timestamp": self.get_timestamp()
        }


# HTTP服务
PORT = 18889
service = FinanceDataService()

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {args[0]}")
    
    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
    
    def do_GET(self):
        path = self.path
        
        if path == '/health':
            self.send_json(service.health_check())
            return
        
        if '/index' in path:
            self.send_json(service.get_index_realtime())
            return
        
        if '/stock/' in path:
            symbol = path.split('/')[-1] or '000001'
            self.send_json(service.get_stock_realtime(symbol))
            return
        
        if '/concept' in path:
            self.send_json(service.get_concept_board())
            return
        
        if '/industry' in path:
            self.send_json(service.get_industry_board())
            return
        
        if '/kline/' in path:
            symbol = path.split('/')[-1] or '000001'
            self.send_json(service.get_stock_kline(symbol))
            return
        
        if '/fundflow/' in path:
            symbol = path.split('/')[-1] or '000001'
            self.send_json(service.get_fund_flow(symbol))
            return
        
        self.send_json({"error": "未知接口"})

def run_server():
    server = HTTPServer(('0.0.0.0', PORT), Handler)
    print(f"金融数据服务启动成功，端口: {PORT}")
    print(f"数据源: Tushare + 反爬虫东方财富")
    server.serve_forever()

if __name__ == '__main__':
    run_server()
