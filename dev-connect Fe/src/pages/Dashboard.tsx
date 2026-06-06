import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlobalChat } from '../components/chat/GlobalChat';
import { PrivateChat } from '../components/chat/PrivateChat';
import { GroupChat } from '../components/chat/GroupChat';
import { GameRoom, type GameJoinInvite } from '../components/game/GameRoom';
import { CallOverlay } from '../components/call/CallOverlay';
import { ProfileEditor } from '../components/profile/ProfileEditor';
import { Home } from '../components/dashboard/Home';
import { Leaderboard } from '../components/leaderboard/Leaderboard';
import {
  LogOut, MessageCircle, Gamepad2, Film, BookOpen, Settings,
  ChevronRight, Globe, Lock, Users, Flame, MonitorPlay, Star, User,
  Home as HomeIcon, Trophy,
} from 'lucide-react';
import { UserAPI, MessageAPI } from '../services/api';
import { activateStompClient, deactivateStompClient, isStompConnected, subscribe } from '../services/stompClient';
import { getAvatarEmoji } from '../utils/avatars';
import { parseGameInvite, type GameInvitePayload } from '../utils/gameInvite';

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
  color: string;         // active accent text color
  bgColor: string;       // active bg tint
  gradient: string;      // active gradient
  children?: SubItem[];
  disabled?: boolean;
}

const MENU: MenuItem[] = [
  {
    key: 'home',
    label: 'Home',
    icon: <HomeIcon className="w-[22px] h-[22px]" />,
    color: 'text-accent-orange',
    bgColor: 'bg-accent-orange/10',
    gradient: 'from-accent-orange to-amber-500',
  },
  {
    key: 'chat',
    label: 'Chat',
    icon: <MessageCircle className="w-[22px] h-[22px]" />,
    color: 'text-accent-purple',
    bgColor: 'bg-accent-purple/10',
    gradient: 'from-accent-purple to-accent-hover',
    children: [
      { key: 'private', label: 'Private Chat', icon: <Lock className="w-4 h-4" /> },
      { key: 'group', label: 'Groups', icon: <Users className="w-4 h-4" /> },
      { key: 'global', label: 'Global Chat', icon: <Globe className="w-4 h-4" /> },
    ],
  },
  {
    key: 'gameroom',
    label: 'Game Room',
    icon: <Gamepad2 className="w-[22px] h-[22px]" />,
    color: 'text-accent-orange',
    bgColor: 'bg-accent-orange/10',
    gradient: 'from-accent-orange to-red-500',
  },
  {
    key: 'leaderboard',
    label: 'Leaderboard',
    icon: <Trophy className="w-[22px] h-[22px]" />,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    gradient: 'from-yellow-500 to-amber-600',
  },
  {
    key: 'movies',
    label: 'Movies',
    icon: <Film className="w-[22px] h-[22px]" />,
    color: 'text-pink-400',
    bgColor: 'bg-pink-500/10',
    gradient: 'from-pink-500 to-rose-500',
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
    gradient: 'from-cyan-500 to-sky-500',
    disabled: true,
  },
];

export const Dashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('home');
  const [activeChild, setActiveChild] = useState('private');
  const [expandedTab, setExpandedTab] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [stompStatus, setStompStatus] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [incomingInvite, setIncomingInvite] = useState<{ payload: GameInvitePayload; fromName: string; fromAvatar?: string } | null>(null);
  const [gameJoinInvite, setGameJoinInvite] = useState<GameJoinInvite | null>(null);

  const routeToGameInvite = (payload: GameInvitePayload) => {
    setGameJoinInvite({ kind: payload.kind, roomId: payload.roomId, diceType: payload.diceType, partyKey: payload.partyKey });
    setActiveTab('gameroom');
    setExpandedTab(null);
    setIncomingInvite(null);
  };

  const acceptInvite = () => {
    if (incomingInvite) routeToGameInvite(incomingInvite.payload);
  };

  useEffect(() => {
    const interval = setInterval(() => setStompStatus(isStompConnected()), 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    UserAPI.getMe().then(res => setCurrentUser(res.data || res)).catch(() => {});
    activateStompClient();
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
        const currentRoomId = getCurrentRoomId();
        if (currentRoomId !== msg.roomId) {
          setUnreadCounts(prev => ({
            ...prev,
            [msg.roomId]: (prev[msg.roomId] || 0) + 1,
          }));
        }
        return;
      }
      // Game-room invite arriving as a private message — show the popup.
      const inv = parseGameInvite(msg.content);
      if (inv && msg.senderId && String(msg.senderId) !== String(currentUser.id)) {
        setIncomingInvite({ payload: inv, fromName: msg.senderName || inv.invitedBy, fromAvatar: msg.profileAvatar });
      }
    }).then(s => { sub = s; });

    return () => { cancelled = true; sub?.unsubscribe(); };
  }, [currentUser?.id, activeTab, activeChild]);

  const getCurrentRoomId = (): string => {
    if (activeTab !== 'chat') return '';
    if (activeChild === 'global') return 'global';
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

  const getChildUnread = (childKey: string): number => {
    if (childKey === 'global') return unreadCounts['global'] || 0;
    if (childKey === 'private') {
      return Object.entries(unreadCounts).reduce((sum, [key, count]) =>
        key.match(/^\d+-\d+$/) ? sum + count : sum, 0);
    }
    if (childKey === 'group') {
      return Object.entries(unreadCounts).reduce((sum, [key, count]) =>
        key.startsWith('group-') ? sum + count : sum, 0);
    }
    return 0;
  };

  const totalChatUnread = Object.entries(unreadCounts).reduce((sum, [key, count]) => {
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
    <div className="flex h-screen w-screen bg-bg-primary overflow-hidden">

      {/* ── Sidebar (desktop) ── */}
      <aside className="hidden lg:flex w-[280px] border-r border-border-color bg-bg-secondary flex-col shrink-0">

        {/* Logo */}
        <div className="h-[72px] flex items-center px-5 gap-3 border-b border-border-color shrink-0">
          <button
            className="logo-3d w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
            onClick={() => { setActiveTab('home'); setExpandedTab(null); }}
            aria-label="DevConnect home"
          >
            <span className="text-white font-extrabold text-lg">D</span>
          </button>
          <div className="flex flex-col overflow-hidden">
            <span className="font-extrabold text-lg bg-clip-text text-transparent bg-gradient-to-r from-accent-purple to-accent-orange leading-tight">
              Dev Connect
            </span>
            <span className={`text-[11px] font-medium flex items-center gap-1.5 leading-tight ${stompStatus ? 'text-emerald-400' : 'text-text-muted'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${stompStatus ? 'bg-emerald-400' : 'bg-text-muted animate-pulse'}`} />
              {stompStatus ? 'Online' : 'Connecting…'}
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1.5">
          {MENU.map(item => {
            const isActive = activeTab === item.key;
            const isExpanded = expandedTab === item.key && item.children;

            return (
              <div key={item.key}>
                {/* Parent Tab */}
                <button
                  onClick={() => handleTabClick(item)}
                  disabled={item.disabled}
                  className={`relative w-full flex items-center gap-3 h-12 px-3 rounded-xl transition-all duration-200 ${
                    item.disabled
                      ? 'opacity-30 cursor-not-allowed'
                      : isActive
                        ? `bg-gradient-to-r ${item.gradient} text-white font-semibold shadow-lg`
                        : 'text-text-secondary hover:text-text-primary hover:bg-hover-bg'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                    isActive && !item.disabled ? 'bg-white/20' : 'bg-hover-bg'
                  }`}>
                    {item.icon}
                  </div>

                  <span className="text-[15px] flex-1 text-left truncate">{item.label}</span>

                  {item.key === 'chat' && totalChatUnread > 0 && (
                    <span className={`min-w-[20px] h-5 px-1.5 text-[11px] font-bold rounded-full flex items-center justify-center shrink-0 ${isActive ? 'bg-white text-accent-purple' : 'bg-red-500 text-white'}`}>
                      {totalChatUnread > 99 ? '99+' : totalChatUnread}
                    </span>
                  )}

                  {item.children && !item.disabled && !(item.key === 'chat' && totalChatUnread > 0) && (
                    <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isActive ? 'opacity-90' : 'opacity-40'} ${isExpanded ? 'rotate-90' : ''}`} />
                  )}

                  {item.disabled && <Lock className="w-3.5 h-3.5 opacity-50 shrink-0" />}
                </button>

                {/* Children */}
                {isExpanded && item.children && (
                  <div className="flex flex-col mt-1 mb-1 ml-5">
                    <div className="border-l-2 border-border-color pl-4 flex flex-col gap-0.5">
                      {item.children.map(child => {
                        const isChildActive = isActive && activeChild === child.key;
                        const childUnread = getChildUnread(child.key);
                        return (
                          <button
                            key={child.key}
                            onClick={() => handleChildClick(item.key, child.key)}
                            className={`flex items-center gap-3 h-9 px-3 rounded-lg text-[13px] transition-all duration-150 ${
                              isChildActive
                                ? `${item.color} font-semibold ${item.bgColor}`
                                : 'text-text-muted hover:text-text-secondary hover:bg-hover-bg'
                            }`}
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
        <div className="border-t border-border-color p-3 flex flex-col gap-1">
          <button
            onClick={() => setShowProfile(true)}
            className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-hover-bg transition-colors group w-full"
          >
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-full bg-bg-tertiary border-2 border-border-color flex items-center justify-center text-xl group-hover:scale-105 transition-transform">
                {getAvatarEmoji(currentUser?.profileAvatar)}
              </div>
              <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-bg-secondary ${stompStatus ? 'bg-emerald-400' : 'bg-text-muted'}`} />
            </div>
            <div className="flex flex-col overflow-hidden flex-1 text-left">
              <span className="font-semibold text-sm text-text-primary truncate">{currentUser?.username || 'Loading…'}</span>
              <span className="text-[11px] text-text-muted truncate">{currentUser?.email || ''}</span>
            </div>
            <Settings className="w-4 h-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center gap-3 h-10 px-3 rounded-xl text-text-muted hover:text-red-400 hover:bg-red-500/5 transition-colors w-full"
          >
            <LogOut className="w-[18px] h-[18px] shrink-0" />
            <span className="text-sm">Logout</span>
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 flex flex-col bg-bg-primary min-w-0">
        {/* Mobile chat sub-tabs */}
        {activeTab === 'chat' && (
          <div className="lg:hidden flex items-center gap-2 bg-bg-secondary border-b border-border-color shrink-0 px-3 py-2 overflow-x-auto">
            {MENU.find(m => m.key === 'chat')?.children?.map(child => {
              const isChildActive = activeChild === child.key;
              const childUnread = getChildUnread(child.key);
              return (
                <button
                  key={child.key}
                  onClick={() => setActiveChild(child.key)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium transition-all whitespace-nowrap shrink-0 ${
                    isChildActive
                      ? 'bg-accent-purple/15 text-accent-purple border border-accent-purple/30'
                      : 'text-text-secondary bg-hover-bg border border-transparent'
                  }`}
                >
                  {child.icon}
                  <span>{child.label}</span>
                  {childUnread > 0 && (
                    <span className="min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                      {childUnread > 99 ? '99+' : childUnread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 flex min-h-0">
          {activeTab === 'home' && <Home currentUser={currentUser} onNavigate={(tab, child) => { setActiveTab(tab); if (child) { setActiveChild(child); setExpandedTab(tab); } else { setExpandedTab(null); } }} />}
          {activeTab === 'leaderboard' && <Leaderboard currentUser={currentUser} />}
          {activeTab === 'chat' && activeChild === 'global' && <GlobalChat currentUser={currentUser} unreadCounts={unreadCounts} onMarkRead={markChatAsRead} />}
          {activeTab === 'chat' && activeChild === 'private' && <PrivateChat currentUser={currentUser} unreadCounts={unreadCounts} onMarkRead={markChatAsRead} onJoinGameInvite={routeToGameInvite} />}
          {activeTab === 'chat' && activeChild === 'group' && <GroupChat currentUser={currentUser} unreadCounts={unreadCounts} onMarkRead={markChatAsRead} />}
          {activeTab === 'gameroom' && <GameRoom currentUser={currentUser} joinInvite={gameJoinInvite} onInviteConsumed={() => setGameJoinInvite(null)} />}
        </div>
      </main>

      {/* ── Mobile Bottom Navigation ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-bg-secondary/95 backdrop-blur-lg border-t border-border-color flex items-center justify-around px-2 z-40">
        {MENU.filter(m => !m.disabled).map(item => {
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => handleTabClick(item)}
              className={`flex flex-col items-center gap-1 px-4 py-1.5 rounded-2xl transition-all min-w-[64px] ${
                isActive ? `bg-gradient-to-br ${item.gradient} text-white shadow-lg` : 'text-text-muted'
              }`}
            >
              <div className="relative">
                {item.icon}
                {item.key === 'chat' && totalChatUnread > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center border border-bg-secondary">
                    {totalChatUnread > 99 ? '99+' : totalChatUnread}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-semibold">{item.label}</span>
            </button>
          );
        })}
        <button
          onClick={() => setShowProfile(true)}
          className="flex flex-col items-center gap-1 px-4 py-1.5 rounded-2xl text-text-muted min-w-[64px]"
        >
          <div className="relative w-[22px] h-[22px] flex items-center justify-center">
            <User className="w-[22px] h-[22px]" />
          </div>
          <span className="text-[10px] font-semibold">Profile</span>
        </button>
      </nav>

      {/* Game invite popup */}
      {incomingInvite && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={() => setIncomingInvite(null)}>
          <div className="bg-bg-secondary border border-border-color rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="h-1.5 bg-gradient-to-r from-accent-purple to-accent-orange" />
            <div className="p-6 flex flex-col items-center text-center">
              <div className="relative mb-4">
                <div className="w-16 h-16 rounded-full bg-bg-tertiary border-2 border-border-color flex items-center justify-center text-3xl">
                  {getAvatarEmoji(incomingInvite.fromAvatar)}
                </div>
                <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-gradient-to-br from-accent-purple to-accent-orange flex items-center justify-center border-2 border-bg-secondary">
                  <Gamepad2 className="w-4 h-4 text-white" />
                </div>
              </div>
              <h3 className="text-lg font-bold text-text-primary">Game Invitation</h3>
              <p className="text-sm text-text-secondary mt-1.5">
                <span className="font-semibold text-text-primary">{incomingInvite.fromName}</span> invited you to play{' '}
                <span className="font-semibold text-accent-purple">{incomingInvite.payload.label}</span>
              </p>
              <p className="text-xs text-text-muted font-mono mt-2">Room: {incomingInvite.payload.roomId}</p>
              <div className="flex gap-3 mt-6 w-full">
                <button
                  onClick={() => setIncomingInvite(null)}
                  className="flex-1 h-11 rounded-xl border border-border-color text-text-secondary hover:text-text-primary hover:bg-hover-bg transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={acceptInvite}
                  className="flex-1 h-11 rounded-xl bg-gradient-to-r from-accent-purple to-accent-orange text-white font-semibold shadow-lg hover:opacity-90 transition-opacity"
                >
                  Join Room
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
