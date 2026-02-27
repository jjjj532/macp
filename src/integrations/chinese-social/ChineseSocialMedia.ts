import axios from 'axios';

export type ChinesePlatform = 'douyin' | 'toutiao' | 'weibo' | 'xiaohongshu' | 'zhihu' | 'bilibili';

export interface PlatformPost {
  id: string;
  platform: ChinesePlatform;
  content: string;
  title?: string;
  images?: string[];
  videos?: string[];
  tags: string[];
  published: boolean;
  url?: string;
  likes?: number;
  comments?: number;
  shares?: number;
  followers?: number;
  publishedAt?: Date;
}

export interface PlatformStats {
  platform: ChinesePlatform;
  totalPosts: number;
  totalFollowers: number;
  totalLikes: number;
  avgEngagement: number;
}

export interface ContentOptimization {
  platform: ChinesePlatform;
  optimizedTitle: string;
  optimizedContent: string;
  recommendedHashtags: string[];
  bestPostingTime: string;
  characterLimit: number;
}

export class ChineseSocialMediaAPI {
  private configs: Map<ChinesePlatform, { appId: string; appSecret: string; accessToken?: string }> = new Map();
  private posts: Map<string, PlatformPost> = new Map();
  private stats: Map<ChinesePlatform, PlatformStats> = new Map();

  constructor() {
    this.initPlatforms();
  }

  private initPlatforms(): void {
    const platforms: ChinesePlatform[] = ['douyin', 'toutiao', 'weibo', 'xiaohongshu', 'zhihu', 'bilibili'];
    platforms.forEach(p => {
      this.stats.set(p, {
        platform: p,
        totalPosts: 0,
        totalFollowers: Math.floor(Math.random() * 10000),
        totalLikes: Math.floor(Math.random() * 50000),
        avgEngagement: Math.random() * 5 + 2,
      });
    });
  }

  configurePlatform(platform: ChinesePlatform, appId: string, appSecret: string): void {
    this.configs.set(platform, { appId, appSecret });
  }

  isConfigured(platform: ChinesePlatform): boolean {
    return !!this.configs.get(platform)?.accessToken;
  }

  async publishToPlatform(content: PlatformPost, platform: ChinesePlatform): Promise<PlatformPost> {
    const optimized = this.optimizeForPlatform(content, platform);
    const post: PlatformPost = {
      id: `post-${platform}-${Date.now()}`,
      platform,
      content: optimized.optimizedContent,
      title: optimized.optimizedTitle,
      tags: optimized.recommendedHashtags,
      published: true,
      url: this.generateMockUrl(platform),
      likes: Math.floor(Math.random() * 1000),
      comments: Math.floor(Math.random() * 100),
      shares: Math.floor(Math.random() * 50),
      publishedAt: new Date(),
    };

    this.posts.set(post.id, post);
    
    const platformStats = this.stats.get(platform);
    if (platformStats) {
      platformStats.totalPosts++;
      platformStats.totalFollowers += Math.floor(Math.random() * 100);
    }

    return post;
  }

  optimizeForPlatform(content: PlatformPost, platform: ChinesePlatform): ContentOptimization {
    const optimizations: Record<ChinesePlatform, ContentOptimization> = {
      douyin: {
        platform,
        optimizedTitle: this.formatForDouyin(content.title || content.content.substring(0, 30)),
        optimizedContent: this.formatForDouyin(content.content),
        recommendedHashtags: this.getDouyinHashtags(content.tags),
        bestPostingTime: '12:00-14:00 或 18:00-21:00',
        characterLimit: 2000,
      },
      toutiao: {
        platform,
        optimizedTitle: content.title ? this.formatForToutiaoTitle(content.title) : '',
        optimizedContent: this.formatForToutiao(content.content),
        recommendedHashtags: this.getToutiaoHashtags(content.tags),
        bestPostingTime: '7:00-9:00 或 12:00-13:00',
        characterLimit: 5000,
      },
      weibo: {
        platform,
        optimizedTitle: '',
        optimizedContent: this.formatForWeibo(content.content, content.title),
        recommendedHashtags: this.getWeiboHashtags(content.tags),
        bestPostingTime: '9:00-11:00 或 20:00-22:00',
        characterLimit: 2000,
      },
      xiaohongshu: {
        platform,
        optimizedTitle: this.formatForXiaohongshuTitle(content.title || content.content.substring(0, 20)),
        optimizedContent: this.formatForXiaohongshu(content.content),
        recommendedHashtags: this.getXiaohongshuHashtags(content.tags),
        bestPostingTime: '10:00-12:00 或 20:00-22:00',
        characterLimit: 1000,
      },
      zhihu: {
        platform,
        optimizedTitle: content.title || '',
        optimizedContent: this.formatForZhihu(content.content),
        recommendedHashtags: this.getZhihuHashtags(content.tags),
        bestPostingTime: '8:00-10:00 或 21:00-23:00',
        characterLimit: 10000,
      },
      bilibili: {
        platform,
        optimizedTitle: this.formatForBilibiliTitle(content.title || content.content.substring(0, 30)),
        optimizedContent: this.formatForBilibili(content.content),
        recommendedHashtags: this.getBilibiliHashtags(content.tags),
        bestPostingTime: '18:00-24:00',
        characterLimit: 5000,
      },
    };

    return optimizations[platform];
  }

  private formatForDouyin(text: string): string {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length > 5) {
      return lines.slice(0, 5).join('\n\n') + '\n\n👉 更多内容点击主页查看';
    }
    return text;
  }

  private formatForDouyinTitle(title: string): string {
    return title.length > 30 ? title.substring(0, 27) + '...' : title;
  }

  private formatForToutiao(text: string): string {
    return text + '\n\n#头条青云计划 #内容创作';
  }

  private formatForToutiaoTitle(title: string): string {
    return title.length > 50 ? title.substring(0, 47) + '...' : title;
  }

  private formatForWeibo(text: string, title?: string): string {
    const prefix = title ? `【${title}】` : '';
    const suffix = '\n\n#微博公开课 #干货分享';
    const remaining = 2000 - prefix.length - suffix.length;
    return prefix + text.substring(0, remaining) + suffix;
  }

  private formatForXiaohongshu(text: string): string {
    return text.replace(/### /g, '💡 ').replace(/## /g, '✨ ') + '\n\n📍关注我了解更多 | 收藏备用';
  }

  private formatForXiaohongshuTitle(title: string): string {
    const emojis = ['✨', '🌟', '💫', '🔥', '📌'];
    return emojis[Math.floor(Math.random() * emojis.length)] + title;
  }

  private formatForZhihu(text: string): string {
    return text + '\n\n— — —\n\n本文作者：AI内容创作助手\n如需转载，请联系授权';
  }

  private formatForBilibili(text: string): string {
    return text.replace(/结论/g, '✅ 结论').replace(/重点/g, '📌 重点') + '\n\n👍点赞 | 📁收藏 | 🔔关注';
  }

  private formatForBilibiliTitle(title: string): string {
    const prefixes = ['【实测】', '【必看】', '【科普】', '【教程】'];
    return prefixes[Math.floor(Math.random() * prefixes.length)] + title;
  }

  private getDouyinHashtags(tags: string[]): string[] {
    return tags.slice(0, 3).map(t => `#${t}`).concat(['#抖音小助手', '#内容创作']);
  }

  private getToutiaoHashtags(tags: string[]): string[] {
    return tags.slice(0, 3).concat(['头条', '青云计划', '创作']);
  }

  private getWeiboHashtags(tags: string[]): string[] {
    return tags.slice(0, 2).map(t => `#${t}#`).concat(['#微博公开课', '#干货分享']);
  }

  private getXiaohongshuHashtags(tags: string[]): string[] {
    return tags.slice(0, 4).map(t => `#${t}`).concat(['#小红书助手', '#笔记分享']);
  }

  private getZhihuHashtags(tags: string[]): string[] {
    return tags.slice(0, 3).concat(['知乎专栏', '内容创作']);
  }

  private getBilibiliHashtags(tags: string[]): string[] {
    return tags.slice(0, 3).map(t => "#" + t + "#").concat(['#B站', '#知识分享']);
  }

  private generateMockUrl(platform: ChinesePlatform): string {
    const urls: Record<ChinesePlatform, string> = {
      douyin: `https://www.douyin.com/video/${Date.now()}`,
      toutiao: `https://www.toutiao.com/article/${Date.now()}`,
      weibo: `https://m.weibo.cn/status/${Date.now()}`,
      xiaohongshu: `https://www.xiaohongshu.com/discovery/item/${Date.now()}`,
      zhihu: `https://zhuanlan.zhihu.com/p/${Date.now()}`,
      bilibili: `https://www.bilibili.com/video/BV${Date.now()}`,
    };
    return urls[platform];
  }

  async getPlatformStats(platform: ChinesePlatform): Promise<PlatformStats | null> {
    const stats = this.stats.get(platform);
    if (stats) {
      stats.totalFollowers += Math.floor(Math.random() * 50);
      stats.totalLikes += Math.floor(Math.random() * 100);
    }
    return stats || null;
  }

  async getAllStats(): Promise<PlatformStats[]> {
    return Array.from(this.stats.values());
  }

  getPosts(platform?: ChinesePlatform): PlatformPost[] {
    if (platform) {
      return Array.from(this.posts.values()).filter(p => p.platform === platform);
    }
    return Array.from(this.posts.values());
  }

  getPostById(id: string): PlatformPost | undefined {
    return this.posts.get(id);
  }

  async schedulePost(content: PlatformPost, platform: ChinesePlatform, publishTime: Date): Promise<{ scheduledId: string; publishTime: Date }> {
    return {
      scheduledId: `scheduled-${Date.now()}`,
      publishTime,
    };
  }
}

export function createChineseSocialMediaAPI(): ChineseSocialMediaAPI {
  return new ChineseSocialMediaAPI();
}
