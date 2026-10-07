import { useRef, useState, type FormEvent } from 'react';
import { ArrowUp, Bot, CheckCircle2, Sparkles, UserRound } from 'lucide-react';

import { nexos } from '@nexos/sdk';
import type { NexAIAction, NexAIMessage } from '@nexos/types';
import { Button, Dialog } from '@nexos/ui';

import { useDesktop } from '../desktop-context';
import type { ApplicationProperties } from './registry';

export default function NexAIApp(_properties: ApplicationProperties) {
  const desktop = useDesktop();
  const [messages, setMessages] = useState<NexAIMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hi ${desktop.user.displayName.split(' ')[0] ?? ''}. I’m NexAI. I can help you navigate NexOS and carry out safe system actions.`,
      createdAt: new Date().toISOString(),
      proposedAction: null,
    },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [confirmation, setConfirmation] = useState<NexAIAction | null>(null);
  const sequence = useRef(0);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || thinking) return;
    const userMessage: NexAIMessage = {
      id: `user-${sequence.current++}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
      proposedAction: null,
    };
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setThinking(true);
    try {
      const response = await nexos.ai.chat(text);
      setMessages((current) => [...current, response]);
    } catch (reason) {
      setMessages((current) => [
        ...current,
        {
          id: `error-${sequence.current++}`,
          role: 'assistant',
          content: reason instanceof Error ? reason.message : 'NexAI could not respond.',
          createdAt: new Date().toISOString(),
          proposedAction: null,
        },
      ]);
    } finally {
      setThinking(false);
    }
  };

  const perform = async (action: NexAIAction, confirmed = false) => {
    if (action.destructive && !confirmed) {
      setConfirmation(action);
      return;
    }
    const result = await nexos.ai.execute(action, confirmed);
    if (action.tool === 'apps.open' && action.arguments['applicationId'])
      await desktop.launchApp(action.arguments['applicationId']);
    else if (action.tool === 'settings.open')
      await desktop.launchApp('com.nexos.settings', {
        section: action.arguments['section'] ?? 'system',
      });
    else if (action.tool === 'files.search') await desktop.launchApp('com.nexos.files');
    else if (action.tool === 'system.lock') await desktop.lock();
    setMessages((current) => [
      ...current,
      {
        id: `tool-${sequence.current++}`,
        role: 'assistant',
        content: `✓ ${result}`,
        createdAt: new Date().toISOString(),
        proposedAction: null,
      },
    ]);
    setConfirmation(null);
  };

  return (
    <div className="nexai-app">
      <header>
        <div>
          <span>
            <Sparkles size={19} />
          </span>
          <div>
            <h1>NexAI</h1>
            <p>Local mock provider · Tool safety enabled</p>
          </div>
        </div>
        <em>
          <i /> Ready
        </em>
      </header>
      <div className="nexai-messages" aria-live="polite">
        {messages.map((message) => (
          <article key={message.id} className={`nexai-message nexai-message--${message.role}`}>
            <span>
              {message.role === 'assistant' ? <Bot size={17} /> : <UserRound size={17} />}
            </span>
            <div>
              <p>{message.content}</p>
              {message.proposedAction ? (
                <Button variant="secondary" onClick={() => void perform(message.proposedAction!)}>
                  <CheckCircle2 size={15} /> {message.proposedAction.description}
                </Button>
              ) : null}
            </div>
          </article>
        ))}
        {thinking ? (
          <article className="nexai-message nexai-message--assistant">
            <span>
              <Bot size={17} />
            </span>
            <div className="thinking-dots">
              <i />
              <i />
              <i />
            </div>
          </article>
        ) : null}
      </div>
      <div className="nexai-suggestions">
        {['Open Files', 'Find welcome', 'Explain theme settings', 'Lock NexOS'].map(
          (suggestion) => (
            <button key={suggestion} type="button" onClick={() => setInput(suggestion)}>
              {suggestion}
            </button>
          ),
        )}
      </div>
      <form onSubmit={(event) => void send(event)}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Ask NexAI to open an app, find a file, or explain a setting…"
          aria-label="Message NexAI"
        />
        <button type="submit" disabled={!input.trim() || thinking} aria-label="Send message">
          <ArrowUp size={18} />
        </button>
      </form>
      <Dialog
        open={confirmation !== null}
        title="Confirm NexAI action"
        description={confirmation?.description}
        onClose={() => setConfirmation(null)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirmation(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => confirmation && void perform(confirmation, true)}
            >
              Confirm action
            </Button>
          </>
        }
      >
        <p>
          This action changes or removes data. NexAI will not continue without your explicit
          confirmation.
        </p>
      </Dialog>
    </div>
  );
}
