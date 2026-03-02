#!/usr/bin/env python3
"""
量化金融数据获取工具
支持: A股、期货、期权、基金、宏观经济等
"""
import sys
import json
import time
import akshare as ak
from datetime import datetime, timedelta

def get_timestamp():
    return datetime.now().isoformat()

def error_response(msg):
    return json.dumps({
        "success": False,
        "error": msg,
        "timestamp": get_timestamp()
    })

def success_response(data, source="akshare"):
    return json.dumps({
        "success": True,
        "data": data,
        "timestamp": get_timestamp(),
        "source": source
    })

def get_a_stock_realtime():
    """A股实时行情"""
    try:
        df = ak.stock_zh_a_spot_em()
        result = []
        for _, row in df.head(100).iterrows():
            result.append({
                "symbol": row.get('代码', ''),
                "name": row.get('名称', ''),
                "price": float(row.get('最新价', 0)) if row.get('最新价') else None,
                "change": float(row.get('涨跌幅', 0)) if row.get('涨跌幅') else 0,
                "volume": row.get('成交量', ''),
                "amount": row.get('成交额', ''),
                "amplitude": float(row.get('振幅', 0)) if row.get('振幅') else 0,
                "high": float(row.get('最高', 0)) if row.get('最高') else None,
                "low": float(row.get('最低', 0)) if row.get('最低') else None,
                "open": float(row.get('今开', 0)) if row.get('今开') else None,
                "close": float(row.get('昨收', 0)) if row.get('昨收') else None,
            })
        return success_response(result)
    except Exception as e:
        return error_response(f"获取失败: {str(e)}")

def get_a_stock_kline(symbol, period="daily", days=30):
    """A股历史K线"""
    try:
        df = ak.stock_zh_a_hist(
            symbol=symbol, 
            period=period, 
            start_date=(datetime.now() - timedelta(days=days)).strftime("%Y%m%d"),
            adjust="qfq"
        )
        result = []
        for _, row in df.iterrows():
            result.append({
                "date": str(row.get('日期', '')),
                "open": float(row.get('开盘', 0)) if row.get('开盘') else None,
                "close": float(row.get('收盘', 0)) if row.get('收盘') else None,
                "high": float(row.get('最高', 0)) if row.get('最高') else None,
                "low": float(row.get('最低', 0)) if row.get('最低') else None,
                "volume": float(row.get('成交量', 0)) if row.get('成交量') else 0,
                "amount": float(row.get('成交额', 0)) if row.get('成交额') else 0,
            })
        return success_response(result)
    except Exception as e:
        return error_response(f"获取失败: {str(e)}")

def get_fund_flow(symbol):
    """资金流向"""
    try:
        df = ak.stock_individual_fund_flow(stock=symbol, market="sh")
        result = []
        for _, row in df.head(10).iterrows():
            result.append({
                "date": str(row.get('日期', '')),
                "主力净流入": float(row.get('主力净流入', 0)) if row.get('主力净流入') else 0,
                "散户净流入": float(row.get('散户净流入', 0)) if row.get('散户净流入') else 0,
                "超大单净流入": float(row.get('超大单净流入', 0)) if row.get('超大单净流入') else 0,
                "大单净流入": float(row.get('大单净流入', 0)) if row.get('大单净流入') else 0,
                "中单净流入": float(row.get('中单净流入', 0)) if row.get('中单净流入') else 0,
                "小单净流入": float(row.get('小单净流入', 0)) if row.get('小单净流入') else 0,
            })
        return success_response(result)
    except Exception as e:
        return error_response(f"获取失败: {str(e)}")

def get_index_realtime():
    """指数实时行情"""
    try:
        df = ak.stock_zh_index_spot_em()
        result = []
        for _, row in df.head(20).iterrows():
            result.append({
                "symbol": row.get('代码', ''),
                "name": row.get('名称', ''),
                "price": float(row.get('最新价', 0)) if row.get('最新价') else None,
                "change": float(row.get('涨跌幅', 0)) if row.get('涨跌幅') else 0,
                "volume": row.get('成交量', ''),
                "amount": row.get('成交额', ''),
            })
        return success_response(result)
    except Exception as e:
        return error_response(f"获取失败: {str(e)}")

def get_futures_realtime(symbol=""):
    """期货实时行情"""
    try:
        if symbol:
            df = ak.futures_zh_realtime(symbol=symbol)
        else:
            df = ak.futures_zh_realtime_all()
        result = []
        for _, row in df.head(20).iterrows():
            result.append({
                "symbol": row.get('合约代码', ''),
                "name": row.get('合约名称', ''),
                "latest_price": float(row.get('最新价', 0)) if row.get('最新价') else None,
                "change": float(row.get('涨跌幅', 0)) if row.get('涨跌幅') else 0,
                "volume": row.get('成交量', ''),
                "amount": row.get('成交额', ''),
            })
        return success_response(result)
    except Exception as e:
        return error_response(f"获取失败: {str(e)}")

def get_etf_realtime():
    """ETF实时行情"""
    try:
        df = ak.fund_etf_spot_em()
        result = []
        for _, row in df.head(30).iterrows():
            result.append({
                "symbol": row.get('代码', ''),
                "name": row.get('名称', ''),
                "price": float(row.get('最新价', 0)) if row.get('最新价') else None,
                "change": float(row.get('涨跌幅', 0)) if row.get('涨跌幅') else 0,
                "volume": row.get('成交量', ''),
            })
        return success_response(result)
    except Exception as e:
        return error_response(f"获取失败: {str(e)}")

def get_concept_board():
    """概念板块"""
    try:
        df = ak.stock_board_concept_name_em()
        result = []
        for _, row in df.head(30).iterrows():
            result.append({
                "name": row.get('板块名称', ''),
                "change": float(row.get('涨跌幅', 0)) if row.get('涨跌幅') else 0,
                "volume": row.get('成交额', ''),
                "up_count": int(row.get('上涨', 0)) if row.get('上涨') else 0,
                "down_count": int(row.get('下跌', 0)) if row.get('下跌') else 0,
            })
        return success_response(result)
    except Exception as e:
        return error_response(f"获取失败: {str(e)}")

def get_industry_board():
    """行业板块"""
    try:
        df = ak.stock_board_industry_name_em()
        result = []
        for _, row in df.head(30).iterrows():
            result.append({
                "name": row.get('板块名称', ''),
                "change": float(row.get('涨跌幅', 0)) if row.get('涨跌幅') else 0,
                "volume": row.get('成交额', ''),
            })
        return success_response(result)
    except Exception as e:
        return error_response(f"获取失败: {str(e)}")

def get_macro_gdp():
    """GDP数据"""
    try:
        df = ak.macro_china_gdp()
        result = []
        for _, row in df.iterrows():
            result.append({
                "quarter": str(row.get('季度', '')),
                "gdp": float(row.get('国内生产总值(亿元)', 0)) if row.get('国内生产总值(亿元)') else None,
                "gdp_yoy": float(row.get('国内生产总值同比增长', 0)) if row.get('国内生产总值同比增长') else None,
            })
        return success_response(result)
    except Exception as e:
        return error_response(f"获取失败: {str(e)}")

def get_macro_cpi():
    """CPI数据"""
    try:
        df = ak.macro_china_cpi()
        result = []
        for _, row in df.iterrows():
            result.append({
                "month": str(row.get('月份', '')),
                "cpi": float(row.get('全国居民消费价格', 0)) if row.get('全国居民消费价格') else None,
                "cpi_yoy": float(row.get('全国居民消费价格同比增长', 0)) if row.get('全国居民消费价格同比增长') else None,
            })
        return success_response(result)
    except Exception as e:
        return error_response(f"获取失败: {str(e)}")

def get_stock_news():
    """财经新闻"""
    try:
        df = ak.stock_news_em()
        result = []
        for _, row in df.head(20).iterrows():
            result.append({
                "title": row.get('新闻标题', ''),
                "datetime": str(row.get('发布时间', '')),
                "source": row.get('文章来源', ''),
            })
        return success_response(result)
    except Exception as e:
        return error_response(f"获取失败: {str(e)}")

def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "help"
    arg1 = sys.argv[2] if len(sys.argv) > 2 else ""
    arg2 = sys.argv[3] if len(sys.argv) > 3 else ""
    
    if cmd == "stock":
        print(get_a_stock_realtime())
    elif cmd == "kline":
        print(get_a_stock_kline(arg1 or "000001", arg2 or "daily", 30))
    elif cmd == "fundflow":
        print(get_fund_flow(arg1 or "000001"))
    elif cmd == "index":
        print(get_index_realtime())
    elif cmd == "futures":
        print(get_futures_realtime(arg1))
    elif cmd == "etf":
        print(get_etf_realtime())
    elif cmd == "concept":
        print(get_concept_board())
    elif cmd == "industry":
        print(get_industry_board())
    elif cmd == "gdp":
        print(get_macro_gdp())
    elif cmd == "cpi":
        print(get_macro_cpi())
    elif cmd == "news":
        print(get_stock_news())
    else:
        print(json.dumps({
            "commands": {
                "stock": "A股实时行情",
                "kline <symbol> [period]": "K线数据",
                "fundflow <symbol>": "资金流向",
                "index": "指数行情",
                "futures [symbol]": "期货行情",
                "etf": "ETF行情",
                "concept": "概念板块",
                "industry": "行业板块",
                "gdp": "GDP数据",
                "cpi": "CPI数据",
                "news": "财经新闻"
            }
        }))

if __name__ == "__main__":
    main()
