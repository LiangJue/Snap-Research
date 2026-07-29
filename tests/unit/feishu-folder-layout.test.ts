import { describe, expect, it } from 'vitest';

import {
  FEISHU_DEFAULTS,
  pickFeishuFolderPathForConversation,
  type FeishuPathConfig,
} from '@services/sync/feishu/settings-store';

describe('Feishu folder layout', () => {
  it('defaults to root-level Snap Research-* folders (aligned with Obsidian)', () => {
    expect(FEISHU_DEFAULTS.chatFolder).toBe('Snap Research-AIChats');
    expect(FEISHU_DEFAULTS.articleFolder).toBe('Snap Research-WebArticles');
    expect(FEISHU_DEFAULTS.videoFolder).toBe('Snap Research-Videos');
  });

  it('picks folder path by conversation kind', () => {
    const config: FeishuPathConfig = {
      chatFolder: FEISHU_DEFAULTS.chatFolder,
      articleFolder: FEISHU_DEFAULTS.articleFolder,
      videoFolder: FEISHU_DEFAULTS.videoFolder,
      defaults: { ...FEISHU_DEFAULTS },
    };

    expect(pickFeishuFolderPathForConversation({ sourceType: 'chat' }, config)).toBe('Snap Research-AIChats');
    expect(pickFeishuFolderPathForConversation({ sourceType: 'article' }, config)).toBe('Snap Research-WebArticles');
    expect(pickFeishuFolderPathForConversation({ sourceType: 'video' }, config)).toBe('Snap Research-Videos');
  });
});
