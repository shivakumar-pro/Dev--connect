import React, { useState, useRef, useEffect } from 'react';
import { Send, Globe, Loader2, Sparkles } from 'lucide-react';
import { EmojiPicker } from '../common/EmojiPicker';
import { MessageAPI } from '../../services/api';
import { subscribe, sendGlobalMessage } from '../../services/stompClient';
import { getAvatarEmoji } from '../../utils/avatars';

interface Message {
  id?: string | number;
  senderId?: number;
  senderName: string;
  content: string;
  timestamp: string;
  sentAt: number;
  profileAvatar?: string;
  isOwn?: boolean;
}

const dayLabel = (ms: number) => {
  const d = new Date(ms);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yest)) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

export const GlobalChat = ({ currentUser, onMarkRead }: { currentUser?: any; unreadCounts?: Record<string, number>; onMarkRead?: (roomId: string) => void }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentUsername = currentUser?.username || 'me';

  useEffect(() => {
    onMarkRead?.('global');
  }, []);

  // Fetch initial messages
  useEffect(() => {
    const fetchGlobalMessages = async () => {
      try {
        const res = await MessageAPI.getGlobal(50);
        const data = Array.isArray(res) ? res : [];
        data.sort((a: any, b: any) => new Date(a.createdAt || a.timestamp || 0).getTime() - new Date(b.createdAt || b.timestamp || 0).getTime());
        const mapped: Message[] = data.map((m: any) => {
          const ms = new Date(m.createdAt || m.timestamp || Date.now()).getTime();
          return {
            ...m,
            senderName: m.senderName || m.senderId?.toString() || 'Unknown',
            isOwn: (m.senderName || m.senderId?.toString()) === currentUsername,
            sentAt: ms,
            timestamp: new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
        });
        setMessages(mapped);
      } catch (err) {
        console.error('Failed to fetch global messages', err);
        setMessages([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchGlobalMessages();
  }, [currentUsername]);

  // Subscribe to real-time global messages
  useEffect(() => {
    let cancelled = false;
    let sub: any = null;

    subscribe('/topic/global', (msg: any) => {
      if (cancelled) return;
      // Ignore typed events / contentless payloads (prevents phantom empty bubbles)
      if (msg.type || !msg.content) return;
      if ((msg.senderName || msg.senderId?.toString()) === currentUsername) return;
      const ms = new Date(msg.createdAt || msg.timestamp || Date.now()).getTime();
      setMessages(prev => [...prev, {
        ...msg,
        senderName: msg.senderName || msg.senderId?.toString() || 'Unknown',
        isOwn: false,
        sentAt: ms,
        timestamp: new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }]);
    }).then(s => { sub = s; });

    return () => { cancelled = true; sub?.unsubscribe(); };
  }, [currentUsername]);

  // Auto-scroll on new message
  useEffect(() => {
    const c = scrollRef.current;
    if (c) c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isSending) return;
    try {
      sendGlobalMessage(inputValue);
      const now = Date.now();
      setMessages(prev => [...prev, {
        id: now.toString(),
        senderName: currentUsername,
        content: inputValue,
        sentAt: now,
        timestamp: new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isOwn: true,
      }]);
      setInputValue('');
      inputRef.current?.focus();
    } catch (err) {
      console.error('Failed to send message', err);
    }
  };

  const insertEmoji = (emoji: string) => {
    setInputValue(v => v + emoji);
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full w-full bg-bg-primary relative">
      {/* Header */}
      <header className="h-16 sm:h-20 px-4 sm:px-6 lg:px-8 border-b border-border-color flex items-center justify-between shrink-0 glass z-10 w-full">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-accent-purple/30 to-accent-orange/20 border border-accent-purple/20 flex items-center justify-center shrink-0">
            <Globe className="w-5 h-5 sm:w-6 sm:h-6 text-accent-purple" />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-base sm:text-xl leading-tight truncate">Global Chat</h2>
            <p className="text-xs sm:text-sm text-text-secondary flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
              <span className="truncate">Global Developer Room</span>
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bg-tertiary border border-border-color text-xs font-medium text-text-secondary shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-accent-orange" />
          Public room
        </div>
      </header>

      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-36 lg:pb-6 flex flex-col">
        {isLoading ? (
          <div className="flex flex-col justify-center items-center h-full gap-3 text-text-muted">
            <Loader2 className="w-8 h-8 animate-spin text-accent-purple" />
            <span className="text-sm">Loading messages…</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-full text-center px-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent-purple/20 to-accent-orange/10 border border-accent-purple/20 flex items-center justify-center mb-5">
              <Globe className="w-10 h-10 text-accent-purple" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-1.5">Welcome to Global Chat</h3>
            <p className="text-sm text-text-secondary max-w-sm leading-relaxed">
              This is the start of the global developer room. Say hello and start the conversation — everyone here can see it.
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1" />
            <div className="flex flex-col gap-1.5">
              {messages.map((msg, idx) => {
                const prev = messages[idx - 1];
                const newDay = idx === 0 || dayLabel(prev.sentAt) !== dayLabel(msg.sentAt);
                const grouped = !newDay && prev && prev.senderName === msg.senderName && prev.isOwn === msg.isOwn;
                const showHeader = !grouped;

                return (
                  <React.Fragment key={msg.id || idx}>
                    {newDay && (
                      <div className="flex items-center gap-3 my-4">
                        <div className="flex-1 h-px bg-border-color" />
                        <span className="text-[11px] font-medium text-text-muted px-2 py-0.5 rounded-full bg-bg-secondary border border-border-color">
                          {dayLabel(msg.sentAt)}
                        </span>
                        <div className="flex-1 h-px bg-border-color" />
                      </div>
                    )}

                    <div className={`group flex gap-2.5 sm:gap-3 max-w-[88%] sm:max-w-[75%] ${msg.isOwn ? 'ml-auto flex-row-reverse' : ''} ${showHeader ? 'mt-2' : ''}`}>
                      {/* Avatar */}
                      {!msg.isOwn && (
                        showHeader ? (
                          <div className="w-9 h-9 rounded-full bg-bg-tertiary border border-border-color shrink-0 flex items-center justify-center text-base">
                            {getAvatarEmoji(msg.profileAvatar)}
                          </div>
                        ) : (
                          <div className="w-9 shrink-0" />
                        )
                      )}

                      <div className={`flex flex-col min-w-0 ${msg.isOwn ? 'items-end' : 'items-start'}`}>
                        {showHeader && !msg.isOwn && (
                          <span className="text-xs font-medium text-accent-purple mb-1 ml-1">{msg.senderName}</span>
                        )}
                        <div className="flex items-end gap-2">
                          {msg.isOwn && (
                            <span className="text-[10px] text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0">{msg.timestamp}</span>
                          )}
                          <div className={`px-4 py-2.5 rounded-2xl shadow-sm break-words ${
                            msg.isOwn
                              ? 'bg-gradient-to-br from-accent-purple to-accent-hover text-white rounded-br-md'
                              : 'bg-bg-tertiary text-text-primary border border-border-color rounded-bl-md'
                          }`}>
                            <p className="text-sm sm:text-[15px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                          </div>
                          {!msg.isOwn && (
                            <span className="text-[10px] text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0">{msg.timestamp}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="fixed bottom-16 left-0 right-0 lg:static lg:bottom-0 p-3 sm:p-4 lg:p-6 bg-bg-secondary border-t border-border-color z-30 shrink-0">
        <form onSubmit={handleSend} className="max-w-4xl mx-auto flex items-center gap-2 sm:gap-3">
          <EmojiPicker onSelect={insertEmoji} />

          <input
            ref={inputRef}
            type="text"
            className="flex-1 min-w-0 h-11 sm:h-12 bg-bg-tertiary border border-border-color focus:border-accent-purple rounded-full px-4 sm:px-5 text-sm sm:text-base focus:outline-none focus:ring-1 focus:ring-accent-purple/30 text-text-primary placeholder:text-text-muted transition-all"
            placeholder="Type your message to the world…"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />

          <button
            type="submit"
            disabled={!inputValue.trim() || isSending}
            onMouseDown={(e) => e.preventDefault()}
            className="shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center bg-gradient-to-br from-accent-orange to-red-500 text-white shadow-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            aria-label="Send"
          >
            {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>
      </div>
    </div>
  );
};
