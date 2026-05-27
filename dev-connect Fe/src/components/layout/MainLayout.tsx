import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { MessageSquare, Gamepad2, Settings, Code, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Sidebar = () => {
  const navItems = [
    { to: '/dashboard', icon: Users, label: 'Dashboard' },
    { to: '/chat', icon: MessageSquare, label: 'Rooms' },
    { to: '/games', icon: Gamepad2, label: 'Mini Games' },
    { to: '/editor', icon: Code, label: 'Live Editor' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="w-64 h-full glass flex flex-col pt-6 z-10 border-r border-[#ffffff15] shrink-0">
      <div className="px-6 mb-8 flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-gradient-to-tr from-[var(--accent-cyan)] to-[var(--accent-violet)] shadow-[var(--shadow-glow)]"></div>
        <h1 className="text-xl font-bold tracking-tight text-white mb-0">DevConnect<span className="text-[var(--accent-cyan)]">+</span></h1>
      </div>
      
      <nav className="flex-1 px-4 flex flex-col gap-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 font-medium ${
                isActive
                  ? 'bg-gradient-to-r from-[var(--accent-cyan)]/10 to-[var(--accent-violet)]/10 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/20 shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-white hover:bg-white/5'
              }`
            }
          >
            <item.icon size={20} />
            {item.label}
          </NavLink>
        ))}
      </nav>
      
      <div className="p-4 mt-auto mb-4 border-t border-[var(--border-color)] mx-4 pt-6">
        <div className="flex items-center gap-3 w-full">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 border border-white/10 shrink-0"></div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-white truncate max-w-[120px]">Demo User</span>
            <span className="text-xs text-[var(--accent-cyan)]">Online</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const MainLayout = () => {
  const location = useLocation();
  
  return (
    <div className="flex w-full h-full bg-[var(--bg-primary)] overflow-hidden relative">
      {/* Abstract Background Elements */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[var(--accent-violet)] opacity-[0.03] blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[var(--accent-cyan)] opacity-[0.03] blur-[100px] pointer-events-none"></div>
      
      <Sidebar />
      <main className="flex-1 overflow-y-auto h-full relative z-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="h-full w-full"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
};
