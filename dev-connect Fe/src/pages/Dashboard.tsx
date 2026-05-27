import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlobalChat } from '../components/chat/GlobalChat';
import { PrivateChat } from '../components/chat/PrivateChat';
import { GroupChat } from '../components/chat/GroupChat';
import { GameRoom } from '../components/game/GameRoom';
import { CallOverlay } from '../components/call/CallOverlay';
import { ProfileEditor } from '../components/profile/ProfileEditor';
import {
  LogOut, Circle, MessageCircle, Gamepad2, Film, BookOpen, Settings,
  ChevronRight, Globe, Lock, Users, Flame, MonitorPlay, Star,
} from 'lucide-react';
import { UserAPI, MessageAPI } from '../services/api';
import { activateStompClient, deactivateStompClient, isStompConnected, subscribe } from '../services/stompClient';
import { getAvatarEmoji } from '../utils/avatars';

// ── Menu Config ──
interface SubItem {
  key: string;
  label: string;
  icon: React.ReactNode;
}

interface MenuItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  color: string;         // active accent color class
  bgColor: string;       // active bg class
  children?: SubItem[];
  disabled?: boolean;
}

const MENU: MenuItem[] = [
  {
    key: 'chat',
    label: 'Chat',
    icon: <MessageCircle className="w-[22px] h-[22px]" />,
    color: 'text-accent-purple',
    bgColor: 'bg-accent-purple/10',
    children: [
      { key: 'global', label: 'Global Chat', icon: <Globe className="w-4 h-4" /> },
      { key: 'private', label: 'Private Chat', icon: <Lock className="w-4 h-4" /> },
      { key: 'group', label: 'Groups', icon: <Users className="w-4 h-4" /> },
    ],
  },
  {
    key: 'gameroom',
    label: 'Game Room',
    icon: <Gamepad2 className="w-[22px] h-[22px]" />,
    color: 'text-accent-orange',
    bgColor: 'bg-accent-orange/10',
  },
  {
    key: 'movies',
    label: 'Movies',
    icon: <Film className="w-[22px] h-[22px]" />,
    color: 'text-pink-400',
    bgColor: 'bg-pink-500/10',
    children: [
      { key: 'trending', label: 'Trending', icon: <Flame className="w-4 h-4" /> },
      { key: 'watch', label: 'Watch Together', icon: <MonitorPlay className="w-4 h-4" /> },
      { key: 'favorites', label: 'Favorites', icon: <Star className="w-4 h-4" /> },
    ],
    disabled: true,
  },
  {
    key: 'resources',
    label: 'Resources',
    icon: <BookOpen className="w-[22px] h-[22px]" />,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    disabled: true,
  },
];

export const Dashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('chat');
  const [activeChild, setActiveChild] = useState('global');
  const [expandedTab, setExpandedTab] = useState<string | null>('chat');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [stompStatus, setStompStatus] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const interval = setInterval(() => setStompStatus(isStompConnected()), 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    UserAPI.getMe().then(res => setCurrentUser(res.data || res)).catch(() => {});
    activateStompClient();
    // Load unread counts on login
    MessageAPI.getUnreadCounts().then(res => {
      setUnreadCounts(res.data || {});
    }).catch(() => {});
    return () => { deactivateStompClient(); };
  }, []);

  // Listen for new message notifications to update badges
  useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;
    let sub: any = null;

    subscribe(`/topic/user/${currentUser.id}`, (msg: any) => {
      if (cancelled) return;
      if (msg.type === 'NEW_MESSAGE_NOTIFICATION') {
        // Build the roomId to check against currently open chat
        const currentRoomId = getCurrentRoomId();
        if (currentRoomId !== msg.roomId) {
          setUnreadCounts(prev => ({
            ...prev,
            [msg.roomId]: (prev[msg.roomId] || 0) + 1,
          }));
        }
      }
    }).then(s => { sub = s; });

    return () => { cancelled = true; sub?.unsubscribe(); };
  }, [currentUser?.id, activeTab, activeChild]);

  const getCurrentRoomId = (): string => {
    if (activeTab !== 'chat') return '';
    if (activeChild === 'global') return 'global';
    // For private/group, the exact roomId depends on which user/group is selected
    // We return empty so notifications always show badges when not in exact chat
    return '';
  };

  const markChatAsRead = (roomId: string) => {
    MessageAPI.markRead(roomId).catch(() => {});
    setUnreadCounts(prev => {
      const next = { ...prev };
      delete next[roomId];
      return next;
    });
  };

  // Get unread count for a specific sub-tab
  const getChildUnread = (childKey: string): number => {
    if (childKey === 'global') return unreadCounts['global'] || 0;
    if (childKey === 'private') {
      // Sum all private chat rooms (format: "1-3")
      return Object.entries(unreadCounts).reduce((sum, [key, count]) =>
        key.match(/^\d+-\d+$/) ? sum + count : sum, 0);
    }
    if (childKey === 'group') {
      // Sum all group rooms (format: "group-2")
      return Object.entries(unreadCounts).reduce((sum, [key, count]) =>
        key.startsWith('group-') ? sum + count : sum, 0);
    }
    return 0;
  };

  // Calculate total unread for "Chat" badge
  const totalChatUnread = Object.entries(unreadCounts).reduce((sum, [key, count]) => {
    // Count global, private (number-number), and group rooms
    if (key === 'global' || key.match(/^\d+-\d+$/) || key.startsWith('group-')) {
      return sum + count;
    }
    return sum;
  }, 0);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/');
  };

  const handleTabClick = (item: MenuItem) => {
    if (item.disabled) return;
    setActiveTab(item.key);
    if (item.children) {
      setExpandedTab(expandedTab === item.key ? null : item.key);
      if (!item.children.find(c => c.key === activeChild)) {
        setActiveChild(item.children[0].key);
      }
    } else {
      setExpandedTab(null);
    }
  };

  const handleChildClick = (parentKey: string, childKey: string) => {
    setActiveTab(parentKey);
    setActiveChild(childKey);
  };

  return (
    <div className="flex h-screen w-screen bg-[#0B1120] overflow-hidden">

      {/* ── Sidebar (hidden on mobile) ── */}
      <aside className={`hidden lg:flex ${sidebarCollapsed ? 'w-[72px]' : 'w-[280px]'} border-r border-white/[0.06] bg-[#0F172A] flex-col transition-all duration-300 shrink-0`}>

        {/* Logo */}
        <div className="h-16 flex items-center px-5 gap-3 border-b border-white/[0.06] shrink-0">
          <div
            className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-purple to-accent-orange flex items-center justify-center shrink-0 cursor-pointer shadow-lg shadow-accent-purple/20"
            onClick={() => { setActiveTab('chat'); setExpandedTab('chat'); setActiveChild('global'); }}
          >
            <span className="text-white font-extrabold text-lg">D</span>
          </div>
          <div className={`${sidebarCollapsed ? 'hidden' : 'hidden lg:flex'} flex-col overflow-hidden`}>
            <span className="font-extrabold text-lg bg-clip-text text-transparent bg-gradient-to-r from-accent-purple to-accent-orange leading-tight">
              DevConnect
            </span>
            <span className={`text-[10px] font-medium flex items-center gap-1 leading-tight ${stompStatus ? 'text-green-400' : 'text-red-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${stompStatus ? 'bg-green-400' : 'bg-red-400 animate-pulse'}`} />
              {stompStatus ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-5 px-3 lg:px-4 flex flex-col gap-[10px]">
          {MENU.map(item => {
            const isActive = activeTab === item.key;
            const isExpanded = expandedTab === item.key && item.children;

            return (
              <div key={item.key}>
                {/* Parent Tab */}
                <button
                  onClick={() => handleTabClick(item)}
                  disabled={item.disabled}
                  className={`
                    relative w-full flex items-center gap-1 h-[46px] pl-7 pr-3 rounded-xl transition-all duration-200 group
                    ${item.disabled
                      ? 'opacity-25 cursor-not-allowed'
                      : isActive
                        ? `${item.bgColor} ${item.color} font-semibold`
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                    }
                  `}
                >
                  {/* Active indicator bar */}
                  {isActive && !item.disabled && (
                    <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-7 rounded-r-full bg-gradient-to-b ${
                      item.key === 'chat' ? 'from-accent-purple to-accent-purple' :
                      item.key === 'gameroom' ? 'from-accent-orange to-accent-orange' :
                      item.key === 'movies' ? 'from-pink-400 to-pink-400' :
                      'from-cyan-400 to-cyan-400'
                    }`} />
                  )}

                  <div className="shrink-0 w-12 flex justify-center">{item.icon}</div>

                  <span className={`${sidebarCollapsed ? 'hidden' : 'hidden lg:block'} text-[15px] flex-1 text-left truncate`}>
                    {item.label}
                  </span>

                  {/* Unread badge on parent tab */}
                  {item.key === 'chat' && totalChatUnread > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-[11px] font-bold rounded-full flex items-center justify-center shrink-0">
                      {totalChatUnread > 99 ? '99+' : totalChatUnread}
                    </span>
                  )}

                  {/* Chevron for expandable */}
                  {item.children && !item.disabled && !(item.key === 'chat' && totalChatUnread > 0) && (
                    <ChevronRight className={`${sidebarCollapsed ? 'hidden' : 'hidden lg:block'} w-4 h-4 transition-transform duration-200 opacity-40 ${isExpanded ? 'rotate-90' : ''}`} />
                  )}

                  {/* Locked icon for disabled */}
                  {item.disabled && (
                    <Lock className={`${sidebarCollapsed ? 'hidden' : 'hidden lg:block'} w-3.5 h-3.5 opacity-40`} />
                  )}

                  {/* Tooltip (collapsed mode) */}
                  <div className="lg:hidden absolute left-full ml-3 px-3 py-1.5 bg-[#1E293B] text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 shadow-xl border border-white/10 pointer-events-none">
                    {item.label}
                  </div>
                </button>

                {/* Children — indented under parent icon */}
                {isExpanded && item.children && (
                  <div className={`${sidebarCollapsed ? 'hidden' : 'hidden lg:flex'} flex-col mt-1.5 mb-1`} style={{ marginLeft: '2rem' }}>
                    <div className="border-l-2 border-white/[0.08] pl-5 flex flex-col gap-0.5">
                      {item.children.map(child => {
                        const isChildActive = isActive && activeChild === child.key;
                        const childUnread = getChildUnread(child.key);
                        return (
                          <button
                            key={child.key}
                            onClick={() => handleChildClick(item.key, child.key)}
                            className={`
                              flex items-center gap-3 h-[34px] px-3 rounded-lg text-[13px] transition-all duration-150
                              ${isChildActive
                                ? `${item.color} font-semibold ${item.bgColor}`
                                : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'
                              }
                            `}
                          >
                            <div className="w-4 flex justify-center shrink-0">{child.icon}</div>
                            <span className="truncate flex-1 text-left">{child.label}</span>
                            {childUnread > 0 && (
                              <span className="min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">
                                {childUnread > 99 ? '99+' : childUnread}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* ── Bottom: User Profile ── */}
        <div className="border-t border-white/[0.06] p-3 flex flex-col gap-2">
          {/* Profile card */}
          <button
            onClick={() => setShowProfile(true)}
            className={`${sidebarCollapsed ? 'justify-center p-2' : 'lg:gap-3 lg:p-3 justify-center lg:justify-start p-2'} flex items-center rounded-xl hover:bg-white/[0.04] transition-colors group w-full`}
          >
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-full bg-[#1E293B] border-2 border-white/10 flex items-center justify-center text-xl group-hover:scale-105 transition-transform">
                {getAvatarEmoji(currentUser?.profileAvatar)}
              </div>
              <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#0F172A] ${stompStatus ? 'bg-green-400' : 'bg-slate-500'}`} />
            </div>
            <div className={`${sidebarCollapsed ? 'hidden' : 'hidden lg:flex'} flex-col overflow-hidden flex-1 text-left`}>
              <span className="font-semibold text-sm text-slate-200 truncate">{currentUser?.username || 'Loading...'}</span>
              <span className="text-[11px] text-slate-500 truncate">{currentUser?.email || ''}</span>
            </div>
            <Settings className={`${sidebarCollapsed ? 'hidden' : 'hidden lg:block'} w-4 h-4 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0`} />
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className={`${sidebarCollapsed ? 'justify-center' : 'lg:justify-start lg:gap-3 lg:px-4 justify-center'} flex items-center h-10 px-2 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/5 transition-colors w-full`}
          >
            <LogOut className="w-[18px] h-[18px] shrink-0" />
            <span className={`${sidebarCollapsed ? 'hidden' : 'hidden lg:block'} text-sm`}>Logout</span>
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 flex flex-col bg-[#0B1120] min-w-0">
        {/* Mobile sub-tabs — full width, equally divided */}
        {activeTab === 'chat' && (
          <div className="lg:hidden flex items-stretch bg-[#0F172A] border-b border-white/[0.06] shrink-0">
            {MENU.find(m => m.key === 'chat')?.children?.map(child => {
              const isChildActive = activeChild === child.key;
              const childUnread = getChildUnread(child.key);
              return (
                <button
                  key={child.key}
                  onClick={() => setActiveChild(child.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-all relative ${
                    isChildActive
                      ? 'text-accent-purple font-bold'
                      : 'text-slate-500'
                  }`}
                >
                  {child.icon}
                  <span>{child.label}</span>
                  {childUnread > 0 && (
                    <span className="min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                      {childUnread > 99 ? '99+' : childUnread}
                    </span>
                  )}
                  {isChildActive && (
                    <div className="absolute bottom-0 left-1/4 right-1/4 h-[2px] bg-accent-purple rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 flex min-h-0">
          {activeTab === 'chat' && activeChild === 'global' && <GlobalChat currentUser={currentUser} unreadCounts={unreadCounts} onMarkRead={markChatAsRead} />}
          {activeTab === 'chat' && activeChild === 'private' && <PrivateChat currentUser={currentUser} unreadCounts={unreadCounts} onMarkRead={markChatAsRead} />}
          {activeTab === 'chat' && activeChild === 'group' && <GroupChat currentUser={currentUser} unreadCounts={unreadCounts} onMarkRead={markChatAsRead} />}
          {activeTab === 'gameroom' && <GameRoom currentUser={currentUser} />}
        </div>
      </main>

      {/* ── Mobile Bottom Navigation ── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#0F172A] border-t border-white/[0.06] flex items-center justify-around px-2 py-1.5 z-40 safe-area-bottom">
        {MENU.filter(m => !m.disabled).map(item => {
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => handleTabClick(item)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all min-w-[56px] ${
                isActive ? `${item.color}` : 'text-slate-500'
              }`}
            >
              <div className="relative">
                {item.icon}
                {item.key === 'chat' && totalChatUnread > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {totalChatUnread > 99 ? '99+' : totalChatUnread}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{item.label}</span>
              {isActive && <div className={`w-5 h-0.5 rounded-full mt-0.5 ${
                item.key === 'chat' ? 'bg-accent-purple' :
                item.key === 'gameroom' ? 'bg-accent-orange' :
                'bg-pink-400'
              }`} />}
            </button>
          );
        })}
        {/* Profile button in bottom nav */}
        <button
          onClick={() => setShowProfile(true)}
          className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-slate-500 min-w-[56px]"
        >
          <div className="w-[22px] h-[22px] rounded-full bg-[#1E293B] border border-white/10 flex items-center justify-center text-xs">
            {getAvatarEmoji(currentUser?.profileAvatar)}
          </div>
          <span className="text-[10px] font-medium">Profile</span>
        </button>
      </div>

      {/* Overlays */}
      <CallOverlay currentUser={currentUser} />
      {showProfile && (
        <ProfileEditor
          currentUser={currentUser}
          onClose={() => setShowProfile(false)}
          onUpdate={(updated) => setCurrentUser(updated)}
        />
      )}
    </div>
  );
};
