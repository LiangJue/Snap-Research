import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';

import { isEventInsideDismissableContainer } from '../../src/ui/shared/useDismissableLayer';

describe('dismissable layer Shadow DOM hit testing', () => {
  it('treats a composed-path descendant as inside when event.target is retargeted to the host', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const host = dom.window.document.createElement('div');
    const container = dom.window.document.createElement('div');
    const button = dom.window.document.createElement('button');
    container.appendChild(button);
    host.attachShadow({ mode: 'open' }).appendChild(container);
    dom.window.document.body.appendChild(host);

    const retargetedEvent = {
      target: host,
      composedPath: () => [button, container, host, dom.window.document, dom.window],
    } as unknown as Event;

    expect(isEventInsideDismissableContainer(retargetedEvent, container)).toBe(true);
  });
});
