#!/usr/bin/env python3
"""
A股市场数据服务 - 基于 AkShare (使用内置http.server)
"""
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
import akshare as ak
from datetime import datetime
import threading

PORT = 18888

class StockHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {args[0]}")
    
    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
    
    def do_GET(self):
        path = self.path
        
        if path == '/health':
            self.send_json({"status": "ok", "service": "AkShare A股数据服务"})
            return
        
        if path.startswith('/stock/realtime/all'):
            try:
                limit = 100
                df = ak.stock_zh_a_spot_em()
                df = df.head(limit)
                stocks = []
                for _, row in df.iterrows():
                    price = row.get('最新价')
                    change = row.get('涨跌幅')
                    stocks.append({
                        "symbol": row.get('代码', ''),
                        "name": row.get('名称', ''),
                        "price": float(price) if price else 0,
                        "change": float(change) if change else 0,
                    })
                self.send_json(stocks)
            except Exception as e:
                self.send_json({"error": str(e)}, 500)
            return
        
        if path.startswith('/stock/index/realtime'):
            try:
                df = ak.stock_zh_index_spot_em()
                indices = []
                for _, row in df.head(10).iterrows():
                    price = row.get('最新价')
                    change = row.get('涨跌幅')
                    indices.append({
                        "symbol": row.get('代码', ''),
                        "name": row.get('名称', ''),
                        "price": float(price) if price else 0,
                        "change": float(change) if change else 0,
                    })
                self.send_json(indices)
            except Exception as e:
                self.send_json({"error": str(e)}, 500)
            return
        
        if path.startswith('/stock/news'):
            try:
                df = ak.stock_news_em()
                news = []
                for _, row in df.head(10).iterrows():
                    news.append({
                        "title": row.get('新闻标题', ''),
                        "datetime": str(row.get('发布时间', '')),
                    })
                self.send_json(news)
            except Exception as e:
                self.send_json({"error": str(e)}, 500)
            return
        
        if path.startswith('/stock/concept'):
            try:
                df = ak.stock_board_concept_name_em()
                concepts = []
                for _, row in df.head(20).iterrows():
                    change = row.get('涨跌幅')
                    concepts.append({
                        "name": row.get('板块名称', ''),
                        "change": float(change) if change else 0,
                    })
                self.send_json(concepts)
            except Exception as e:
                self.send_json({"error": str(e)}, 500)
            return
        
        if path.startswith('/stock/industry'):
            try:
                df = ak.stock_board_industry_name_em()
                industries = []
                for _, row in df.head(20).iterrows():
                    change = row.get('涨跌幅')
                    industries.append({
                        "name": row.get('板块名称', ''),
                        "change": float(change) if change else 0,
                    })
                self.send_json(industries)
            except Exception as e:
                self.send_json({"error": str(e)}, 500)
            return
        
        # 个股实时行情
        if path.startswith('/stock/realtime/'):
            symbol = path.split('/')[-1]
            try:
                df = ak.stock_zh_a_spot_em()
                stock = df[df['代码'] == symbol]
                if stock.empty:
                    self.send_json({"error": "股票未找到"}, 404)
                    return
                row = stock.iloc[0]
                self.send_json({
                    "symbol": symbol,
                    "name": row.get('名称', ''),
                    "price": float(row.get('最新价', 0)) if row.get('最新价') else 0,
                    "change": float(row.get('涨跌幅', 0)) if row.get('涨跌幅') else 0,
                    "volume": float(row.get('成交量', 0)) if row.get('成交量') else 0,
                })
            except Exception as e:
                self.send_json({"error": str(e)}, 500)
            return
        
        self.send_json({"error": "Unknown endpoint"}, 404)

def run_server():
    server = HTTPServer(('0.0.0.0', PORT), StockHandler)
    print(f"A股市场数据服务启动成功，端口: {PORT}")
    print(f"访问 http://localhost:{PORT}/health 检查服务状态")
    server.serve_forever()

if __name__ == '__main__':
    run_server()
