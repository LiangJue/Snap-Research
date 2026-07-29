import { describe, expect, it } from 'vitest';
import { conversationKinds } from '@services/protocols/conversation-kinds.ts';

function loadConversationKinds() {
  return conversationKinds;
}

describe('conversation-kinds', () => {
  it('registers built-in kinds and picks article by sourceType', () => {
    const kinds = loadConversationKinds();
    const list = kinds.list();
    expect(list.length).toBeGreaterThanOrEqual(2);

    const article = kinds.pick({ sourceType: 'article', title: 'T' });
    expect(article.id).toBe('article');
    expect(article.obsidian.folder).toBe('Snap Research-WebArticles');
    expect(article.notion.dbSpec.storageKey).toBe('notion_db_id_syncnos_web_articles');
  });

  it('defaults to chat when no kind matches', () => {
    const kinds = loadConversationKinds();
    const chat = kinds.pick({ sourceType: 'unknown', title: 'T', source: 'chatgpt' });
    expect(chat.id).toBe('chat');
    expect(chat.obsidian.folder).toBe('Snap Research-AIChats');
    expect(chat.notion.dbSpec.storageKey).toBe('notion_db_id_syncnos_ai_chats');
  });

  it('routes research cards to dedicated Notion and Obsidian destinations', () => {
    const kinds = loadConversationKinds();
    const research = kinds.pick({ sourceType: 'research', title: 'Evidence card' });
    expect(research.id).toBe('research');
    expect(research.obsidian.folder).toBe('Snap Research-ResearchCards');
    expect(research.notion.dbSpec.storageKey).toBe('notion_db_id_syncnos_research_cards');
  });

  it('does not expose pageSpec.shouldRebuild (rebuild strategy is handled by orchestrator)', () => {
    const kinds = loadConversationKinds();
    const kind = kinds.pick({ sourceType: 'article' });
    expect((kind.notion.pageSpec as any).shouldRebuild).toBeUndefined();
  });

  it('exposes notion storage keys from registry (used by infra like disconnect/backup)', () => {
    const kinds = loadConversationKinds();
    const keys = kinds.getNotionStorageKeys();
    expect(keys).toContain('notion_db_id_syncnos_ai_chats');
    expect(keys).toContain('notion_db_id_syncnos_web_articles');
    expect(keys).toContain('notion_db_id_syncnos_research_cards');
  });
});
