import axios from 'axios';

export interface AdImpression {
  id: string;
  adUnit: string;
  impressions: number;
  clicks: number;
  ctr: number;
  revenue: number;
  date: Date;
}

export interface AdConfig {
  adUnit: string;
  adSize: 'banner' | 'rectangle' | 'skyscraper' | 'mobile';
  formats: string[];
}

export class AdNetworkAPI {
  private provider: string;
  private apiKey?: string;
  private publisherId?: string;
  private baseUrl = 'https://api.example.com/v1';

  constructor(provider: string = 'custom') {
    this.provider = provider;
  }

  configure(apiKey?: string, publisherId?: string): void {
    this.apiKey = apiKey;
    this.publisherId = publisherId;
  }

  async getAdUnits(): Promise<AdConfig[]> {
    if (!this.apiKey) {
      return this.getMockAdUnits();
    }

    try {
      const response = await axios.get(`${this.baseUrl}/adunits`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        params: { publisherId: this.publisherId },
      });
      return response.data as AdConfig[];
    } catch (error) {
      console.error('Failed to get ad units:', error);
      return this.getMockAdUnits();
    }
  }

  async getReport(startDate: Date, endDate: Date): Promise<AdImpression[]> {
    if (!this.apiKey) {
      return this.getMockReport(startDate, endDate);
    }

    try {
      const response = await axios.get(`${this.baseUrl}/reports`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        params: {
          publisherId: this.publisherId,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
        },
      });
      return response.data as AdImpression[];
    } catch (error) {
      console.error('Failed to get report:', error);
      return this.getMockReport(startDate, endDate);
    }
  }

  async getEarnings(): Promise<number> {
    const report = await this.getReport(
      new Date(Date.now() - 24 * 60 * 60 * 1000),
      new Date()
    );
    return report.reduce((sum, r) => sum + r.revenue, 0);
  }

  async trackImpression(adUnit: string): Promise<void> {
    console.log(`[Ad] Impression tracked: ${adUnit}`);
  }

  async trackClick(adUnit: string): Promise<void> {
    console.log(`[Ad] Click tracked: ${adUnit}`);
  }

  private getMockAdUnits(): AdConfig[] {
    return [
      { adUnit: 'banner-1', adSize: 'banner', formats: ['728x90', '320x50'] },
      { adUnit: 'rectangle-1', adSize: 'rectangle', formats: ['300x250'] },
      { adUnit: 'skyscraper-1', adSize: 'skyscraper', formats: ['160x600', '300x600'] },
      { adUnit: 'mobile-1', adSize: 'mobile', formats: ['320x100', '300x50'] },
    ];
  }

  private getMockReport(startDate: Date, endDate: Date): AdImpression[] {
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
    const impressions: AdImpression[] = [];

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const baseImpressions = Math.floor(Math.random() * 10000) + 1000;
      const ctr = Math.random() * 0.05 + 0.01;
      const clicks = Math.floor(baseImpressions * ctr);
      const rpm = Math.random() * 5 + 1;

      impressions.push({
        id: `imp-${i}`,
        adUnit: 'banner-1',
        impressions: baseImpressions,
        clicks,
        ctr: ctr * 100,
        revenue: (baseImpressions / 1000) * rpm,
        date,
      });
    }

    return impressions;
  }
}

export function createAdNetworkAPI(): AdNetworkAPI {
  return new AdNetworkAPI();
}
