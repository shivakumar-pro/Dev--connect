import React, { useState, useRef, useEffect } from 'react';
import { Send, Globe, Smile, Loader2 } from 'lucide-react';
import { Button } from '../common/Button';
import { MessageAPI } from '../../services/api';
import { subscribe, sendGlobalMessage } from '../../services/stompClient';
import { getAvatarEmoji } from '../../utils/avatars';

// Dummy interfaces matching backend payload
interface Message {
  id?: string | number;
  senderId?: number;
  senderName: string;
  content: string;
  timestamp: string;
  isOwn?: boolean;
}

export const GlobalChat = ({ currentUser, unreadCounts, onMarkRead }: { currentUser?: any; unreadCounts?: Record<string, number>; onMarkRead?: (roomId: string) => void }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentUsername = currentUser?.username || 'me';

  // Mark as read on mount
  useEffect(() => {
    onMarkRead?.('global');
  }, []);

  // Fetch initial messages
  useEffect(() => {
    const fetchGlobalMessages = async () => {
      try {
        const res = await MessageAPI.getGlobal(50);
        // Map backend response if needed. Assuming it matches or we provide defaults.
        const data = Array.isArray(res) ? res : [];
        data.sort((a: any, b: any) => new Date(a.createdAt || a.timestamp || 0).getTime() - new Date(b.createdAt || b.timestamp || 0).getTime());
        const mapped = data.map((m: any) => ({
          ...m,
          senderName: m.senderName || m.senderId?.toString() || 'Unknown',
          isOwn: (m.senderName || m.senderId?.toString()) === currentUsername,
          timestamp: new Date(m.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }));
        setMessages(mapped);
      } catch (err) {
        console.error('Failed to fetch global messages', err);
        // Fallback for UI if backend is not ready
        setMessages([
          { id: '1', senderName: 'system', content: 'Welcome to Global Chat!', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), isOwn: false },
        ]);
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
      if ((msg.senderName || msg.senderId?.toString()) === currentUsername) return;
      setMessages(prev => [...prev, {
        ...msg,
        senderName: msg.senderName || msg.senderId?.toString() || 'Unknown',
        isOwn: false,
        timestamp: new Date(msg.createdAt || msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }]);
    }).then(s => { sub = s; });

    return () => { cancelled = true; sub?.unsubscribe(); };
  }, [currentUsername]);

  // Auto-scroll on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isSending) return;
    
    try {
      sendGlobalMessage(inputValue);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        senderName: currentUsername,
        content: inputValue,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isOwn: true
      }]);
      setInputValue('');
    } catch (err) {
      console.error('Failed to send message', err);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-bg-primary">
      {/* Header */}
      <header className="h-20 px-8 border-b border-border-color flex items-center justify-between shrink-0 glass z-10 w-full relative">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-accent-purple/20 flex items-center justify-center">
            <Globe className="w-6 h-6 text-accent-purple" />
          </div>
          <div>
            <h2 className="font-bold text-xl leading-tight">Global Chat</h2>
            <p className="text-sm text-text-secondary flex items-center gap-1.5 mt-1">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" /> Global Developer Room
            </p>
          </div>
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6">
        <div className="flex-1" />
        {isLoading ? (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-accent-purple" />
          </div>
        ) : messages.map((msg, idx) => {
          const showAvatar = idx === 0 || messages[idx - 1].senderName !== msg.senderName;
          
          return (
            <div key={msg.id || idx} className={`flex gap-4 max-w-[85%] ${msg.isOwn ? 'ml-auto flex-row-reverse' : ''}`}>
              {!msg.isOwn && showAvatar ? (
                <div className="w-10 h-10 rounded-full bg-bg-tertiary border border-border-color shrink-0 flex items-center justify-center text-lg mt-1">
                  {getAvatarEmoji((msg as any).profileAvatar)}
                </div>
              ) : (
                !msg.isOwn && <div className="w-10 shrink-0" />
              )}
              
              <div className={`flex flex-col ${msg.isOwn ? 'items-end' : 'items-start'}`}>
                {showAvatar && !msg.isOwn && (
                  <span className="text-sm text-text-muted mb-1.5 ml-1">{msg.senderName}</span>
                )}
                
                <div className={`px-5 py-3.5 rounded-3xl relative shadow-sm ${
                  msg.isOwn 
                    ? 'bg-gradient-to-r from-accent-purple to-accent-hover text-white rounded-tr-sm' 
                    : 'bg-bg-tertiary text-text-primary rounded-tl-sm border border-border-color'
                }`}>
                  <p className="text-base leading-relaxed tracking-wide">{msg.content}</p>
                </div>
                
                <span className="text-[11px] font-medium text-text-muted mt-1.5 mx-2">{msg.timestamp}</span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="fixed bottom-14 left-0 right-0 lg:static p-3 sm:p-6 bg-bg-secondary border-t border-border-color z-30 shrink-0">
        <form onSubmit={handleSend} className="max-w-6xl mx-auto flex items-center gap-4">
          <button type="button" className="p-3 text-text-muted hover:text-accent-purple transition-colors bg-bg-tertiary rounded-full">
            <Smile className="w-6 h-6" />
          </button>
          
          <input
            type="text"
            className="flex-1 bg-bg-tertiary border border-border-color focus:border-accent-purple rounded-full px-6 py-4 text-base focus:outline-none focus:ring-1 focus:ring-accent-purple/30 text-text-primary placeholder:text-text-muted transition-all shadow-inner"
            placeholder="Type your message to the world..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          
          <Button type="submit" variant="primary" size="icon" className="rounded-full shrink-0 w-14 h-14 flex items-center justify-center bg-gradient-to-br from-accent-orange to-red-500 hover:opacity-90 shadow-lg" disabled={!inputValue.trim() || isSending}>
            {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-1" />}
          </Button>
        </form>
      </div>
    </div>
  );
};
