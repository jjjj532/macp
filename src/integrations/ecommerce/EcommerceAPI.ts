import axios from 'axios';

export interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  images: string[];
  inventory: number;
  status: 'active' | 'draft' | 'archived';
}

export interface Order {
  id: string;
  orderNumber: string;
  customer: { email: string; name: string };
  items: OrderItem[];
  total: number;
  currency: string;
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  createdAt: Date;
}

export interface OrderItem {
  productId: string;
  title: string;
  quantity: number;
  price: number;
  total: number;
}

export interface Customer {
  id: string;
  email: string;
  name: string;
  ordersCount: number;
  totalSpent: number;
}

export class EcommerceAPI {
  private provider: string;
  private apiKey?: string;
  private storeUrl?: string;

  constructor(provider: string = 'shopify') {
    this.provider = provider;
  }

  configure(apiKey?: string, _apiSecret?: string, storeUrl?: string): void {
    this.apiKey = apiKey;
    this.storeUrl = storeUrl;
  }

  async getProducts(limit: number = 50): Promise<Product[]> {
    if (!this.apiKey) {
      return this.getMockProducts(limit);
    }
    return this.getMockProducts(limit);
  }

  async getProduct(id: string): Promise<Product | null> {
    const products = await this.getProducts(100);
    return products.find(p => p.id === id) || null;
  }

  async createProduct(product: Omit<Product, 'id'>): Promise<Product> {
    return { ...product, id: 'mock-' + Date.now() };
  }

  async updateInventory(_productId: string, quantity: number): Promise<boolean> {
    console.log(`[Ecom] Updated inventory: ${quantity}`);
    return true;
  }

  async getOrders(_status?: string, limit: number = 50): Promise<Order[]> {
    return this.getMockOrders(limit);
  }

  async getOrder(id: string): Promise<Order | null> {
    const orders = await this.getOrders();
    return orders.find(o => o.id === id) || null;
  }

  async fulfillOrder(orderId: string, _trackingNumber?: string): Promise<boolean> {
    console.log(`[Ecom] Fulfilled order: ${orderId}`);
    return true;
  }

  async getCustomers(limit: number = 50): Promise<Customer[]> {
    return this.getMockCustomers(limit);
  }

  async getRevenue(startDate: Date, endDate: Date): Promise<number> {
    const orders = await this.getOrders('paid', 100);
    return orders
      .filter(o => new Date(o.createdAt) >= startDate && new Date(o.createdAt) <= endDate)
      .reduce((sum, o) => sum + o.total, 0);
  }

  async getTopProducts(limit: number = 5): Promise<Product[]> {
    return (await this.getProducts(20)).slice(0, limit);
  }

  async getLowStockProducts(): Promise<Product[]> {
    const products = await this.getProducts(100);
    return products.filter(p => p.inventory < 10);
  }

  async getTotalRevenue(): Promise<number> {
    const orders = await this.getOrders('paid', 100);
    return orders.reduce((sum, o) => sum + o.total, 0);
  }

  async simulateOrder(productId: string, quantity: number = 1): Promise<Order> {
    const product = await this.getProduct(productId);
    const order: Order = {
      id: 'order-' + Date.now(),
      orderNumber: '#' + Math.floor(Math.random() * 10000),
      customer: { email: 'customer@example.com', name: 'Test Customer' },
      items: [{
        productId,
        title: product?.title || 'Product',
        quantity,
        price: product?.price || 10,
        total: (product?.price || 10) * quantity,
      }],
      total: (product?.price || 10) * quantity,
      currency: 'USD',
      status: 'paid',
      createdAt: new Date(),
    };
    return order;
  }

  async researchProducts(keywords: string[]): Promise<Product[]> {
    return keywords.map((kw, i) => ({
      id: `prod-research-${i}`,
      title: `${kw} Product`,
      description: `High quality ${kw} product`,
      price: Math.floor(Math.random() * 200 + 10),
      currency: 'USD',
      category: kw,
      images: [],
      inventory: Math.floor(Math.random() * 100),
      status: 'active',
    }));
  }

  async analyzeProduct(productId: string): Promise<{ score: number; recommendation: string; potentialRevenue: number }> {
    const product = await this.getProduct(productId);
    const score = product ? Math.floor(Math.random() * 40 + 60) : 50;
    return {
      score,
      recommendation: score > 80 ? '强烈推荐' : score > 60 ? '推荐' : '一般',
      potentialRevenue: (product?.price || 100) * (product?.inventory || 100) * 0.1,
    };
  }

  async generateDescription(productId: string): Promise<string> {
    const product = await this.getProduct(productId);
    return `【${product?.title || '产品'}】\n\n高品质${product?.category || '商品'}，欢迎选购！`;
  }

  async getCustomerServiceOrder(orderId: string): Promise<{ response: string; sentiment: 'positive' | 'neutral' | 'negative' }> {
    return {
      response: '感谢您的购买！我们会尽快处理您的订单。',
      sentiment: 'positive',
    };
  }

  private getMockProducts(limit: number): Product[] {
    const categories = ['Electronics', 'Clothing', 'Home', 'Sports', 'Books'];
    return Array(limit).fill(null).map((_, i) => ({
      id: `prod-${i + 1}`,
      title: `${categories[i % categories.length]} Product ${i + 1}`,
      description: `High quality product`,
      price: Math.floor(Math.random() * 200 + 10),
      currency: 'USD',
      category: categories[i % categories.length],
      images: [],
      inventory: Math.floor(Math.random() * 100),
      status: 'active' as const,
    }));
  }

  private getMockOrders(limit: number): Order[] {
    const statuses: Order['status'][] = ['pending', 'paid', 'shipped', 'delivered'];
    return Array(limit).fill(null).map((_, i) => ({
      id: `order-${i + 1}`,
      orderNumber: `#${1000 + i}`,
      customer: { email: `customer${i}@example.com`, name: `Customer ${i + 1}` },
      items: [{
        productId: `prod-${i + 1}`,
        title: `Product ${i + 1}`,
        quantity: Math.floor(Math.random() * 3) + 1,
        price: Math.floor(Math.random() * 100 + 10),
        total: 0,
      }],
      total: Math.floor(Math.random() * 500 + 20),
      currency: 'USD',
      status: statuses[Math.floor(Math.random() * statuses.length)],
      createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
    }));
  }

  private getMockCustomers(limit: number): Customer[] {
    return Array(limit).fill(null).map((_, i) => ({
      id: `cust-${i + 1}`,
      email: `customer${i}@example.com`,
      name: `Customer ${i + 1}`,
      ordersCount: Math.floor(Math.random() * 20),
      totalSpent: Math.floor(Math.random() * 5000),
    }));
  }
}

export function createEcommerceAPI(): EcommerceAPI {
  return new EcommerceAPI();
}
