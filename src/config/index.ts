import dotenv from 'dotenv';
dotenv.config();

export interface SocialMediaConfig {
  weibo: {
    appKey: string;
    appSecret: string;
    accessToken?: string;
    enabled: boolean;
  };
  douyin: {
    appKey: string;
    appSecret: string;
    accessToken?: string;
    enabled: boolean;
  };
  xiaohongshu: {
    appKey: string;
    appSecret: string;
    accessToken?: string;
    enabled: boolean;
  };
  toutiao: {
    appKey: string;
    appSecret: string;
    accessToken?: string;
    enabled: boolean;
  };
  volcanoEngine: {
    accessKeyId: string;
    secretAccessKey: string;
    enabled: boolean;
  };
}

export interface AdNetworkConfig {
  provider: 'google_adsense' | 'amazon_ads' | 'facebook_ads' | 'custom';
  apiKey?: string;
  apiSecret?: string;
  publisherId?: string;
  enabled: boolean;
}

export interface EcommerceConfig {
  provider: 'shopify' | 'amazon' | 'woocommerce' | 'custom';
  apiKey?: string;
  apiSecret?: string;
  storeUrl?: string;
  enabled: boolean;
}

export interface TradingConfig {
  provider: 'binance' | 'coinbase' | 'alpaca' | 'custom';
  apiKey?: string;
  apiSecret?: string;
  testnet: boolean;
  enabled: boolean;
}

export interface SaaSConfig {
  provider: 'stripe' | 'paypal' | 'custom';
  apiKey?: string;
  apiSecret?: string;
  webhookSecret?: string;
  enabled: boolean;
}

export interface SystemConfig {
  socialMedia: SocialMediaConfig;
  adNetworks: AdNetworkConfig;
  ecommerce: EcommerceConfig;
  trading: TradingConfig;
  payments: SaaSConfig;
  general: {
    autoStart: boolean;
    tradingInterval: number;
    contentInterval: number;
  };
}

function getEnv(key: string, defaultValue: string = ''): string {
  return process.env[key] || defaultValue;
}

function getBool(key: string, defaultValue: boolean = false): boolean {
  const val = process.env[key]?.toLowerCase();
  return val === 'true' || val === '1' || defaultValue;
}

export const config: SystemConfig = {
  socialMedia: {
    weibo: {
      appKey: getEnv('WEIBO_APP_KEY'),
      appSecret: getEnv('WEIBO_APP_SECRET'),
      accessToken: getEnv('WEIBO_ACCESS_TOKEN'),
      enabled: getBool('WEIBO_ENABLED', false),
    },
    douyin: {
      appKey: getEnv('DOUYIN_APP_KEY'),
      appSecret: getEnv('DOUYIN_APP_SECRET'),
      accessToken: getEnv('DOUYIN_ACCESS_TOKEN'),
      enabled: getBool('DOUYIN_ENABLED', false),
    },
    xiaohongshu: {
      appKey: getEnv('XHS_APP_KEY'),
      appSecret: getEnv('XHS_APP_SECRET'),
      accessToken: getEnv('XHS_ACCESS_TOKEN'),
      enabled: getBool('XHS_ENABLED', false),
    },
    toutiao: {
      appKey: getEnv('TOUTIAO_APP_KEY'),
      appSecret: getEnv('TOUTIAO_APP_SECRET'),
      accessToken: getEnv('TOUTIAO_ACCESS_TOKEN'),
      enabled: getBool('TOUTIAO_ENABLED', false),
    },
    volcanoEngine: {
      accessKeyId: getEnv('VOLCANO_ACCESS_KEY_ID'),
      secretAccessKey: getEnv('VOLCANO_SECRET_ACCESS_KEY'),
      enabled: getBool('VOLCANO_ENABLED', false),
    },
  },
  adNetworks: {
    provider: (getEnv('AD_PROVIDER', 'custom') as any) || 'custom',
    apiKey: getEnv('AD_API_KEY'),
    apiSecret: getEnv('AD_API_SECRET'),
    publisherId: getEnv('AD_PUBLISHER_ID'),
    enabled: getBool('AD_ENABLED', false),
  },
  ecommerce: {
    provider: (getEnv('ECOM_PROVIDER', 'custom') as any) || 'custom',
    apiKey: getEnv('ECOM_API_KEY'),
    apiSecret: getEnv('ECOM_API_SECRET'),
    storeUrl: getEnv('ECOM_STORE_URL'),
    enabled: getBool('ECOM_ENABLED', false),
  },
  trading: {
    provider: (getEnv('TRADING_PROVIDER', 'custom') as any) || 'custom',
    apiKey: getEnv('TRADING_API_KEY'),
    apiSecret: getEnv('TRADING_API_SECRET'),
    testnet: getBool('TRADING_TESTNET', true),
    enabled: getBool('TRADING_ENABLED', false),
  },
  payments: {
    provider: (getEnv('PAYMENT_PROVIDER', 'custom') as any) || 'custom',
    apiKey: getEnv('PAYMENT_API_KEY'),
    apiSecret: getEnv('PAYMENT_API_SECRET'),
    webhookSecret: getEnv('PAYMENT_WEBHOOK_SECRET'),
    enabled: getBool('PAYMENT_ENABLED', false),
  },
  general: {
    autoStart: getBool('AUTO_START', true),
    tradingInterval: parseInt(getEnv('TRADING_INTERVAL', '30000')),
    contentInterval: parseInt(getEnv('CONTENT_INTERVAL', '60000')),
  },
};

export function isConfigured(provider: 'weibo' | 'douyin' | 'xiaohongshu' | 'toutiao' | 'volcano' | 'ad' | 'ecom' | 'trading' | 'payment'): boolean {
  switch (provider) {
    case 'weibo':
      return !!config.socialMedia.weibo.enabled && !!config.socialMedia.weibo.appKey;
    case 'douyin':
      return !!config.socialMedia.douyin.enabled && !!config.socialMedia.douyin.appKey;
    case 'xiaohongshu':
      return !!config.socialMedia.xiaohongshu.enabled && !!config.socialMedia.xiaohongshu.appKey;
    case 'toutiao':
      return !!config.socialMedia.toutiao.enabled && !!config.socialMedia.toutiao.appKey;
    case 'volcano':
      return !!config.socialMedia.volcanoEngine.enabled && !!config.socialMedia.volcanoEngine.accessKeyId;
    case 'ad':
      return !!config.adNetworks.enabled && !!config.adNetworks.apiKey;
    case 'ecom':
      return !!config.ecommerce.enabled && !!config.ecommerce.apiKey;
    case 'trading':
      return !!config.trading.enabled && !!config.trading.apiKey;
    case 'payment':
      return !!config.payments.enabled && !!config.payments.apiKey;
    default:
      return false;
  }
}

export function getStatus(): {
  socialMedia: { weibo: boolean; douyin: boolean; xiaohongshu: boolean; toutiao: boolean; volcano: boolean };
  ad: { enabled: boolean; configured: boolean };
  ecommerce: { enabled: boolean; configured: boolean };
  trading: { enabled: boolean; configured: boolean; testnet: boolean };
  payment: { enabled: boolean; configured: boolean };
} {
  return {
    socialMedia: {
      weibo: isConfigured('weibo'),
      douyin: isConfigured('douyin'),
      xiaohongshu: isConfigured('xiaohongshu'),
      toutiao: isConfigured('toutiao'),
      volcano: isConfigured('volcano'),
    },
    ad: { enabled: config.adNetworks.enabled, configured: isConfigured('ad') },
    ecommerce: { enabled: config.ecommerce.enabled, configured: isConfigured('ecom') },
    trading: { enabled: config.trading.enabled, configured: isConfigured('trading'), testnet: config.trading.testnet },
    payment: { enabled: config.payments.enabled, configured: isConfigured('payment') },
  };
}
