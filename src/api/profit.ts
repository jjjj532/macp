import express from 'express';
import { ProfitManager, ContentAgent, TradingAgent, SaaSAgent } from '../profit';
import { config, getStatus } from '../config';
import { createAdNetworkAPI } from '../integrations/advertising/AdNetworkAPI';
import { createEcommerceAPI } from '../integrations/ecommerce/EcommerceAPI';
import { createExchangeAPI } from '../integrations/trading/ExchangeAPI';
import { createChineseSocialMediaAPI } from '../integrations/chinese-social/ChineseSocialMedia';

export class ProfitAPI {
  private router = express.Router();
  private profitManager = new ProfitManager();
  private contentAgent: ContentAgent;
  private ecommerceAgent = createEcommerceAPI();
  private tradingAgent: TradingAgent;
  private saasAgent = new SaaSAgent();
  private adNetwork = createAdNetworkAPI();
  private exchangeAPI = createExchangeAPI();
  private chineseSocialMedia = createChineseSocialMediaAPI();

  constructor() {
    if (config.socialMedia.weibo.enabled && config.socialMedia.weibo.appKey) {
      this.chineseSocialMedia.configureWeibo(
        config.socialMedia.weibo.appKey,
        config.socialMedia.weibo.appSecret,
        config.socialMedia.weibo.accessToken
      );
      console.log('✓ 微博API已配置');
    }
    
    if (config.socialMedia.volcanoEngine.enabled && config.socialMedia.volcanoEngine.accessKeyId) {
      this.chineseSocialMedia.configureVolcano(
        config.socialMedia.volcanoEngine.accessKeyId,
        config.socialMedia.volcanoEngine.secretAccessKey
      );
      console.log('✓ 火山引擎API已配置');
    }
    
    this.contentAgent = new ContentAgent({}, this.chineseSocialMedia);
    
    if (config.ecommerce.apiKey) {
      this.ecommerceAgent.configure(config.ecommerce.apiKey, config.ecommerce.apiSecret, config.ecommerce.storeUrl);
    }

    if (config.trading.apiKey) {
      this.exchangeAPI = createExchangeAPI();
    }

    this.tradingAgent = new TradingAgent();
    this.tradingAgent.reset();
    
    this.setupRoutes();
    
    if (config.trading.enabled) {
      this.startAutoTrading();
    }
    
    if (config.adNetworks.enabled) {
      this.startContentGeneration();
    }
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

    this.router.get('/profit/status', (req, res) => {
      res.json({
        config: getStatus(),
        integrations: {
          adNetwork: { provider: config.adNetworks.provider, configured: !!config.adNetworks.apiKey, enabled: config.adNetworks.enabled },
          ecommerce: { provider: config.ecommerce.provider, configured: !!config.ecommerce.apiKey, enabled: config.ecommerce.enabled },
          trading: { provider: config.trading.provider, configured: !!config.trading.apiKey, enabled: config.trading.enabled, testnet: config.trading.testnet },
          payment: { provider: config.payments.provider, configured: !!config.payments.apiKey, enabled: config.payments.enabled },
        },
      });
    });

    this.router.get('/profit/daily', (req, res) => res.json(this.profitManager.getDailyStats()));
    this.router.get('/profit/total', (req, res) => res.json({ revenue: this.profitManager.getAllTimeRevenue(), costs: this.profitManager.getAllTimeCosts(), profit: this.profitManager.getRunningProfit() }));
    this.router.post('/profit/track-revenue', async (req, res) => {
      try {
        const { source, type, amount, metadata } = req.body;
        const revenue = await this.profitManager.trackRevenue({ name: source, type: type || 'ads', amount: Number(amount), currency: 'USD', metadata });
        res.json(revenue);
      } catch (error) { res.status(400).json({ error: (error as Error).message }); }
    });
    this.router.post('/profit/track-cost', async (req, res) => {
      try {
        const { category, amount, description } = req.body;
        const cost = await this.profitManager.trackCost({ category: category || 'other', amount: Number(amount), description: description || '' });
        res.json(cost);
      } catch (error) { res.status(400).json({ error: (error as Error).message }); }
    });
    this.router.get('/profit/settlements', (req, res) => res.json(this.profitManager.getSettlements()));

    this.router.post('/content/generate', async (req, res) => {
      try {
        const { topic, keywords } = req.body;
        const content = await this.contentAgent.generateArticle(topic || 'AI', keywords || ['tech', 'innovation']);
        res.json(content);
      } catch (error) { res.status(400).json({ error: (error as Error).message }); }
    });
    this.router.post('/content/publish', async (req, res) => {
      try {
        const { contentId, platform } = req.body;
        const contents = this.contentAgent.getGeneratedContents();
        const content = contents.find(c => c.id === contentId);
        if (!content) throw new Error('Content not found');
        const published = await this.contentAgent.publishToPlatform(content, platform || 'medium');
        const revenue = await this.contentAgent.simulateAdRevenue(contentId, Math.floor(Math.random() * 10000));
        await this.profitManager.trackRevenue({ name: 'content_ad', type: 'ads', amount: revenue, currency: 'USD', metadata: { contentId, platform } });
        res.json(published);
      } catch (error) { res.status(400).json({ error: (error as Error).message }); }
    });
    this.router.get('/content/list', (req, res) => res.json(this.contentAgent.getGeneratedContents()));

    this.router.get('/content/platforms', (req, res) => {
      res.json(this.contentAgent.getSupportedPlatforms());
    });

    this.router.get('/content/platforms/all/stats', async (req, res) => {
      try {
        const stats = await this.contentAgent.getAllPlatformStats();
        res.json(stats);
      } catch (error) { res.status(400).json({ error: (error as Error).message }); }
    });

    this.router.get('/content/platforms/:platform/stats', async (req, res) => {
      try {
        const stats = await this.contentAgent.getPlatformStats(req.params.platform as any);
        res.json(stats);
      } catch (error) { res.status(400).json({ error: (error as Error).message }); }
    });

    this.router.post('/content/publish-chinese', async (req, res) => {
      try {
        const { contentId, platform } = req.body;
        const contents = this.contentAgent.getGeneratedContents();
        const content = contents.find(c => c.id === contentId);
        if (!content) throw new Error('Content not found');
        const published = await this.contentAgent.publishToChinesePlatform(content, platform as any);
        const revenue = await this.contentAgent.simulateAdRevenue(contentId, Math.floor(Math.random() * 50000));
        await this.profitManager.trackRevenue({ name: 'content_ad', type: 'ads', amount: revenue, currency: 'CNY', metadata: { contentId, platform } });
        res.json(published);
      } catch (error) { res.status(400).json({ error: (error as Error).message }); }
    });

    this.router.post('/content/publish-all', async (req, res) => {
      try {
        const { contentId } = req.body;
        const contents = this.contentAgent.getGeneratedContents();
        const content = contents.find(c => c.id === contentId);
        if (!content) throw new Error('Content not found');
        const results = await this.contentAgent.publishToMultiplePlatforms(content);
        const revenue = await this.contentAgent.simulateAdRevenue(contentId, Math.floor(Math.random() * 100000));
        await this.profitManager.trackRevenue({ name: 'content_ad', type: 'ads', amount: revenue, currency: 'CNY', metadata: { contentId, platforms: results.map(r => r.platform) } });
        res.json({ published: results, estimatedRevenue: revenue });
      } catch (error) { res.status(400).json({ error: (error as Error).message }); }
    });

    this.router.post('/content/optimize', async (req, res) => {
      try {
        const { contentId, platform } = req.body;
        const contents = this.contentAgent.getGeneratedContents();
        const content = contents.find(c => c.id === contentId);
        if (!content) throw new Error('Content not found');
        const optimized = this.contentAgent.optimizeContentForPlatform(content, platform as any);
        res.json(optimized);
      } catch (error) { res.status(400).json({ error: (error as Error).message }); }
    });

    this.router.post('/content/schedule', async (req, res) => {
      try {
        const { contentId, platform, publishTime } = req.body;
        const contents = this.contentAgent.getGeneratedContents();
        const content = contents.find(c => c.id === contentId);
        if (!content) throw new Error('Content not found');
        const scheduled = await this.contentAgent.schedulePost(content, platform as any, new Date(publishTime));
        res.json(scheduled);
      } catch (error) { res.status(400).json({ error: (error as Error).message }); }
    });

    this.router.post('/content/generate-ready', async (req, res) => {
      try {
        const { topic, keywords, platform } = req.body;
        const result = await this.contentAgent.generateReadyToPost(
          topic || 'AI人工智能',
          keywords || ['科技', '创新'],
          platform || 'xiaohongshu'
        );
        res.json(result);
      } catch (error) { res.status(400).json({ error: (error as Error).message }); }
    });

    this.router.get('/content/ready/:platform', async (req, res) => {
      try {
        const contents = this.contentAgent.getGeneratedContents();
        const latest = contents[contents.length - 1];
        if (!latest) throw new Error('No content found. Generate content first.');
        const result = await this.contentAgent.generateReadyToPost(latest.title, latest.tags, req.params.platform as any);
        res.json(result);
      } catch (error) { res.status(400).json({ error: (error as Error).message }); }
    });

    this.router.post('/ecommerce/research', async (req, res) => {
      try {
        const { keywords } = req.body;
        const products = await this.ecommerceAgent.researchProducts(keywords || ['tech', 'gadget']);
        res.json(products);
      } catch (error) { res.status(400).json({ error: (error as Error).message }); }
    });
    this.router.post('/ecommerce/order', async (req, res) => {
      try {
        const { productId, quantity } = req.body;
        const order = await this.ecommerceAgent.simulateOrder(productId, quantity || 1);
        await this.profitManager.trackRevenue({ name: 'ecommerce_sale', type: 'sales', amount: order.total, currency: 'USD', metadata: { orderId: order.id } });
        res.json(order);
      } catch (error) { res.status(400).json({ error: (error as Error).message }); }
    });
    this.router.get('/ecommerce/products', async (req, res) => {
      res.json({ top: await this.ecommerceAgent.getTopProducts(), lowStock: await this.ecommerceAgent.getLowStockProducts(), revenue: await this.ecommerceAgent.getTotalRevenue() });
    });

    this.router.get('/trading/portfolio', (req, res) => {
      res.json({ balance: this.tradingAgent.getBalance(), positions: this.tradingAgent.getPositions(), totalValue: this.tradingAgent.getPortfolioValue(), totalPnL: this.tradingAgent.getTotalPnL(), totalPnLPercent: this.tradingAgent.getTotalPnLPercent() });
    });
    this.router.get('/trading/signals', (req, res) => res.json(this.tradingAgent.getSignals()));
    this.router.get('/trading/trades', (req, res) => res.json(this.tradingAgent.getRecentTrades()));
    this.router.post('/trading/trade', async (req, res) => {
      try {
        const { symbol } = req.body;
        const signal = await this.tradingAgent.generateSignal(symbol || 'BTC');
        const trade = await this.tradingAgent.executeTrade(signal);
        if (trade && trade.pnl) {
          await this.profitManager.trackRevenue({ name: 'trading_pnl', type: 'trading', amount: Math.abs(trade.pnl), currency: 'USD', metadata: { tradeId: trade.id, symbol } });
        }
        res.json({ signal, trade });
      } catch (error) { res.status(400).json({ error: (error as Error).message }); }
    });

    this.router.get('/saas/plans', (req, res) => res.json(this.saasAgent.getPlans()));
    this.router.post('/saas/create-key', async (req, res) => {
      try {
        const { userId, planId } = req.body;
        const apiKey = await this.saasAgent.createAPIKey(userId || 'user_1', planId);
        res.json(apiKey);
      } catch (error) { res.status(400).json({ error: (error as Error).message }); }
    });
    this.router.get('/saas/stats', (req, res) => res.json({ revenue: this.saasAgent.getMonthlyRevenue(), users: this.saasAgent.getTotalUsers(), plans: this.saasAgent.getPlans() }));
    this.router.post('/saas/upgrade', async (req, res) => {
      try {
        const { userId, planId } = req.body;
        const result = await this.saasAgent.upgradePlan(userId, planId);
        const plan = this.saasAgent.getPlans().find(p => p.id === planId);
        if (plan && plan.price > 0) {
          await this.profitManager.trackRevenue({ name: 'saas_subscription', type: 'subscription', amount: plan.price, currency: 'USD', metadata: { userId, planId } });
        }
        res.json(result);
      } catch (error) { res.status(400).json({ error: (error as Error).message }); }
    });

    this.router.get('/profit/test-apis', async (req, res) => {
      const results: any = {};
      if (config.trading.enabled && config.trading.apiKey) {
        try { 
          const prices = await this.exchangeAPI.getPrices(['BTC', 'ETH']); 
          results.trading = { success: true, prices: prices.map(p => ({ symbol: p.symbol, price: p.price })) }; 
        } catch (e: any) { results.trading = { success: false, error: e.message }; }
      } else { results.trading = { success: true, mode: 'simulation' }; }
      if (config.ecommerce.enabled && config.ecommerce.apiKey) {
        try { 
          const products = await this.ecommerceAgent.getProducts(5); 
          results.ecommerce = { success: true, productCount: products.length }; 
        } catch (e: any) { results.ecommerce = { success: false, error: e.message }; }
      } else { results.ecommerce = { success: true, mode: 'simulation' }; }
      if (config.adNetworks.enabled && config.adNetworks.apiKey) {
        try { 
          const earnings = await this.adNetwork.getEarnings(); 
          results.adNetwork = { success: true, earnings }; 
        } catch (e: any) { results.adNetwork = { success: false, error: e.message }; }
      } else { results.adNetwork = { success: true, mode: 'simulation' }; }
      res.json(results);
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
              await this.profitManager.trackRevenue({ name: 'trading_pnl', type: 'trading', amount: Math.abs(trade.pnl), currency: 'USD', metadata: { tradeId: trade.id, symbol } });
            }
          }
        } catch (e) { console.error('Trading error:', e); }
      }
      await this.tradingAgent.updatePositions();
    }, config.general.tradingInterval || 30000);
  }

  private startContentGeneration(): void {
    const topics = ['AI Technology', 'Machine Learning', 'Blockchain', 'Cloud Computing'];
    const keywordsList = [['AI', 'automation', 'future'], ['ML', 'deep learning', 'neural'], ['crypto', 'defi', 'web3'], ['cloud', 'devops', 'kubernetes']];
    setInterval(async () => {
      const topic = topics[Math.floor(Math.random() * topics.length)];
      const kw = keywordsList[Math.floor(Math.random() * keywordsList.length)];
      try {
        const content = await this.contentAgent.generateArticle(topic, kw);
        const published = await this.contentAgent.publishToPlatform(content, 'medium');
        const revenue = await this.contentAgent.simulateAdRevenue(content.id, Math.floor(Math.random() * 50000 + 10000));
        await this.profitManager.trackRevenue({ name: 'content_ad_revenue', type: 'ads', amount: revenue, currency: 'USD', metadata: { contentId: content.id, topic } });
      } catch (e) { console.error('Content generation error:', e); }
    }, config.general.contentInterval || 60000);
  }

  getRouter() { return this.router; }
}
