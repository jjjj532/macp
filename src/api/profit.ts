import express, { Request, Response } from 'express';
import { ProfitManager, ContentAgent, EcommerceAgent, TradingAgent, SaaSAgent } from '../profit';

export class ProfitAPI {
  private router = express.Router();
  private profitManager: ProfitManager;
  private contentAgent: ContentAgent;
  private ecommerceAgent: EcommerceAgent;
  private tradingAgent: TradingAgent;
  private saasAgent: SaaSAgent;

  constructor() {
    this.profitManager = new ProfitManager();
    this.contentAgent = new ContentAgent();
    this.ecommerceAgent = new EcommerceAgent();
    this.tradingAgent = new TradingAgent();
    this.tradingAgent.reset();
    
    this.setupRoutes();
    this.startAutoTrading();
    this.startContentGeneration();
  }

  private setupRoutes(): void {
    this.router.get('/profit', (req, res) => {
      const daily = this.profitManager.getDailyStats();
      const total = this.profitManager.getAllTimeRevenue();
      const report = this.profitManager.calculateProfit('daily');
      res.json({
        daily,
        total,
        breakdown: report.breakdown.bySource,
      });
    });

    this.router.get('/profit/daily', (req, res) => {
      res.json(this.profitManager.getDailyStats());
    });

    this.router.get('/profit/total', (req, res) => {
      res.json({
        revenue: this.profitManager.getAllTimeRevenue(),
        costs: this.profitManager.getAllTimeCosts(),
        profit: this.profitManager.getRunningProfit(),
      });
    });

    this.router.post('/profit/track-revenue', async (req, res) => {
      try {
        const { source, type, amount, metadata } = req.body;
        const revenue = await this.profitManager.trackRevenue({
          name: source,
          type: type || 'ads',
          amount: Number(amount),
          currency: 'USD',
          metadata,
        });
        res.json(revenue);
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });

    this.router.post('/profit/track-cost', async (req, res) => {
      try {
        const { category, amount, description } = req.body;
        const cost = await this.profitManager.trackCost({
          category: category || 'other',
          amount: Number(amount),
          description: description || '',
        });
        res.json(cost);
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });

    this.router.get('/profit/settlements', (req, res) => {
      res.json(this.profitManager.getSettlements());
    });

    this.router.post('/content/generate', async (req, res) => {
      try {
        const { topic, keywords } = req.body;
        const content = await this.contentAgent.generateArticle(
          topic || 'AI',
          keywords || ['technology', 'innovation']
        );
        res.json(content);
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });

    this.router.post('/content/publish', async (req, res) => {
      try {
        const { contentId, platform } = req.body;
        const published = await this.contentAgent.publishToPlatform(
          await this.contentAgent.getGeneratedContents().find(c => c.id === contentId) || { id: '', title: '', body: '', tags: [], platform: '', published: false },
          platform || 'medium'
        );
        
        const revenue = await this.contentAgent.simulateAdRevenue(contentId, Math.floor(Math.random() * 10000));
        await this.profitManager.trackRevenue({
          name: 'content_ad',
          type: 'ads',
          amount: revenue,
          currency: 'USD',
          metadata: { contentId, platform },
        });
        
        res.json(published);
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });

    this.router.get('/content/list', (req, res) => {
      res.json(this.contentAgent.getGeneratedContents());
    });

    this.router.post('/ecommerce/research', async (req, res) => {
      try {
        const { keywords } = req.body;
        const products = await this.ecommerceAgent.researchProducts(keywords || ['tech', 'gadget']);
        res.json(products);
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });

    this.router.post('/ecommerce/order', async (req, res) => {
      try {
        const { productId, quantity } = req.body;
        const order = await this.ecommerceAgent.simulateOrder(productId, quantity || 1);
        
        await this.profitManager.trackRevenue({
          name: 'ecommerce_sale',
          type: 'sales',
          amount: order.total,
          currency: 'USD',
          metadata: { orderId: order.id },
        });
        
        res.json(order);
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });

    this.router.get('/ecommerce/products', (req, res) => {
      res.json({
        top: this.ecommerceAgent.getTopProducts(),
        lowStock: this.ecommerceAgent.getLowStockProducts(),
        revenue: this.ecommerceAgent.getTotalRevenue(),
      });
    });

    this.router.get('/trading/portfolio', (req, res) => {
      res.json({
        balance: this.tradingAgent.getBalance(),
        positions: this.tradingAgent.getPositions(),
        totalValue: this.tradingAgent.getPortfolioValue(),
        totalPnL: this.tradingAgent.getTotalPnL(),
        totalPnLPercent: this.tradingAgent.getTotalPnLPercent(),
      });
    });

    this.router.get('/trading/signals', (req, res) => {
      res.json(this.tradingAgent.getSignals());
    });

    this.router.get('/trading/trades', (req, res) => {
      res.json(this.tradingAgent.getRecentTrades());
    });

    this.router.post('/trading/trade', async (req, res) => {
      try {
        const { symbol } = req.body;
        const signal = await this.tradingAgent.generateSignal(symbol || 'BTC');
        const trade = await this.tradingAgent.executeTrade(signal);
        
        if (trade) {
          await this.profitManager.trackRevenue({
            name: 'trading_profit',
            type: 'trading',
            amount: Math.abs(trade.pnl || 0),
            currency: 'USD',
            metadata: { tradeId: trade.id, symbol },
          });
        }
        
        res.json({ signal, trade });
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });

    this.router.get('/saas/plans', (req, res) => {
      res.json(this.saasAgent.getPlans());
    });

    this.router.post('/saas/create-key', async (req, res) => {
      try {
        const { userId, planId } = req.body;
        const apiKey = await this.saasAgent.createAPIKey(userId || 'user_1', planId);
        res.json(apiKey);
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });

    this.router.get('/saas/stats', (req, res) => {
      res.json({
        revenue: this.saasAgent.getMonthlyRevenue(),
        users: this.saasAgent.getTotalUsers(),
        plans: this.saasAgent.getPlans(),
      });
    });

    this.router.post('/saas/upgrade', async (req, res) => {
      try {
        const { userId, planId } = req.body;
        const result = await this.saasAgent.upgradePlan(userId, planId);
        
        const plan = this.saasAgent.getPlans().find(p => p.id === planId);
        if (plan && plan.price > 0) {
          await this.profitManager.trackRevenue({
            name: 'saas_subscription',
            type: 'subscription',
            amount: plan.price,
            currency: 'USD',
            metadata: { userId, planId },
          });
        }
        
        res.json(result);
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });
  }

  private startAutoTrading(): void {
    setInterval(async () => {
      for (const symbol of this.tradingAgent.getConfig().symbols) {
        try {
          const signal = await this.tradingAgent.generateSignal(symbol);
          if (signal.action !== 'hold') {
            const trade = await this.tradingAgent.executeTrade(signal);
            if (trade && trade.pnl) {
              await this.profitManager.trackRevenue({
                name: 'trading_pnl',
                type: 'trading',
                amount: Math.abs(trade.pnl),
                currency: 'USD',
                metadata: { tradeId: trade.id, symbol },
              });
            }
          }
        } catch (e) {
          console.error('Trading error:', e);
        }
      }
      
      await this.tradingAgent.updatePositions();
    }, 30000);
  }

  private startContentGeneration(): void {
    setInterval(async () => {
      const topics = ['AI Technology', 'Machine Learning', 'Blockchain', 'Cloud Computing'];
      const keywords = [
        ['AI', 'automation', 'future'],
        ['ML', 'deep learning', 'neural'],
        ['crypto', 'defi', 'web3'],
        ['cloud', 'devops', 'kubernetes'],
      ];
      
      const topic = topics[Math.floor(Math.random() * topics.length)];
      const kw = keywords[Math.floor(Math.random() * keywords.length)];
      
      try {
        const content = await this.contentAgent.generateArticle(topic, kw);
        const published = await this.contentAgent.publishToPlatform(content, 'medium');
        const revenue = await this.contentAgent.simulateAdRevenue(content.id, Math.floor(Math.random() * 50000 + 10000));
        
        await this.profitManager.trackRevenue({
          name: 'content_ad_revenue',
          type: 'ads',
          amount: revenue,
          currency: 'USD',
          metadata: { contentId: content.id, topic },
        });
      } catch (e) {
        console.error('Content generation error:', e);
      }
    }, 60000);
  }

  getRouter() {
    return this.router;
  }
}
