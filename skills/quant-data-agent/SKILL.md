---
name: quant-data-agent
description: 量化金融数据智能体 - 全网金融数据实时获取，为交易策略提供全面、实时、高质量的数据支撑
---

# 量化金融数据智能体

专为量化交易设计的全市场金融数据获取智能体。

## 功能特性

### 1. 实时数据（毫秒级）
- A股/港股/期货实时行情
- 期权实时数据
- 资金流向实时监控

### 2. 历史数据
- 全市场K线数据
- 自定义时间范围
- 多种复权方式

### 3. 特色数据
- 资金流向（主力/散户/超大单）
- 龙虎榜数据
- 融资融券
- 限售股解禁
- 股权质押

### 4. 宏观经济
- GDP/CPI/PPI
- 利率/汇率
- 社融/M2

## 数据源

| 数据类型 | 主要来源 | 备选来源 |
|---------|---------|---------|
| A股行情 | 东方财富 | 新浪财经 |
| 期货 | 东方财富 | 文华财经 |
| 港股 | 东方财富 | 新浪 |
| 宏观 | 国家统计局 | wind |

## 使用示例

### 获取A股实时行情
```python
# 全部A股
df = ak.stock_zh_a_spot_em()

# 单只股票
df = ak.stock_zh_a_spot_em()
stock = df[df['代码'] == '000001']
```

### 获取资金流向
```python
# 个股资金流向
ak.stock_individual_fund_flow(stock="000001", market="sh")

# 行业资金流向
ak.stock_sector_fund_flow_rank(indicator="今日")
```

### 获取期货数据
```python
# 期货实时行情
ak.futures_zh_realtime(symbol="螺纹钢")

# 期货历史数据
ak.futures_zh_daily(symbol="RB2505", start_date="20240101")
```

### 获取宏观经济
```python
# GDP
ak.macro_china_gdp()

# CPI
ak.macro_china_cpi()
```

## 数据质量保证

1. 多源交叉验证
2. 异常数据自动标记
3. 实时延迟监控
4. 自动重试机制

## 注意事项

1. 部分接口有频率限制
2. 历史数据可能有延迟
3. 数据仅供参考，不构成投资建议
