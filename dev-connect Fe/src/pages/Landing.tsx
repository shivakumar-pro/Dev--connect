import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/common/Button';
import { ThemeToggleButton } from '../components/common/ThemeSwitcher';
import {
  MessageSquare,
  Globe,
  Users,
  Shield,
  Zap,
  Code2,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Terminal,
  Lock,
} from 'lucide-react';

const GithubIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.02c-3.2.7-3.88-1.37-3.88-1.37-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.78 1.2 1.78 1.2 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.71 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.44-2.69 5.41-5.26 5.7.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
  </svg>
);

const TwitterIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M18.244 2H21.5l-7.51 8.583L23 22h-6.844l-5.36-7.012L4.6 22H1.34l8.05-9.2L1 2h7.02l4.846 6.405L18.244 2zm-1.2 18h1.892L7.044 4H5.04l12.004 16z" />
  </svg>
);

const LinkedinIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
  </svg>
);

export const Landing = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary relative overflow-x-hidden">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-[15%] left-[10%] h-[45%] w-[45%] rounded-full bg-accent-purple/10 blur-[140px]" />
        <div className="absolute top-[10%] right-[5%] h-[40%] w-[40%] rounded-full bg-accent-orange/10 blur-[140px]" />
      </div>

      {/* Sticky nav */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-bg-primary/70 border-b border-border-color">
        <nav className="max-w-6xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent-purple to-accent-orange flex items-center justify-center shadow-glow">
              <MessageSquare className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="text-lg font-semibold tracking-tight">DevConnect</span>
          </button>

          <div className="hidden md:flex items-center gap-8 text-sm text-text-secondary">
            <a href="#features" className="hover:text-text-primary transition-colors">Features</a>
            <a href="#how" className="hover:text-text-primary transition-colors">How it works</a>
            <a href="#community" className="hover:text-text-primary transition-colors">Community</a>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggleButton />
            <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>
              Sign in
            </Button>
            <Button variant="primary" size="sm" onClick={() => navigate('/register')} className="gap-1.5">
              Get started <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </nav>
      </header>

      {/* Hero — centered, breathing room */}
      <section className="relative z-10 px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center pt-24 pb-20 lg:pt-32 lg:pb-28">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-bg-secondary border border-border-color text-xs font-medium text-text-secondary mb-8">
            <Sparkles className="w-3.5 h-3.5 text-accent-orange" />
            v1.0 is live — built for developers
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
            Where developers
            <br />
            <span className="text-gradient">ship together.</span>
          </h1>

          <p className="text-lg md:text-xl text-text-secondary max-w-2xl mx-auto leading-relaxed mb-10">
            Real-time chat, private groups, and live collaboration —
            a focused workspace for engineering teams and the global dev community.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
            <Button size="lg" variant="primary" onClick={() => navigate('/register')} className="gap-2">
              Start for free <ArrowRight className="w-4 h-4" />
            </Button>
            <Button size="lg" variant="secondary" onClick={() => navigate('/login')}>
              Sign in
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-text-muted">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> No credit card required
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Free forever
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Open source
            </span>
          </div>
        </div>
      </section>

      {/* Product preview */}
      <section className="relative z-10 px-6 lg:px-8 pb-24 lg:pb-32">
        <div className="max-w-5xl mx-auto relative">
          <div className="absolute -inset-6 bg-gradient-to-r from-accent-purple/20 to-accent-orange/20 blur-3xl rounded-3xl pointer-events-none" />
          <div className="relative glass rounded-2xl overflow-hidden shadow-2xl">
            {/* Window chrome */}
            <div className="flex items-center gap-2 px-4 h-10 border-b border-border-color bg-bg-secondary/60">
              <span className="w-3 h-3 rounded-full bg-red-500/70" />
              <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/70" />
              <span className="ml-3 flex items-center gap-1.5 text-xs font-mono text-text-muted">
                <Terminal className="w-3.5 h-3.5" /> devconnect.app/global
              </span>
              <span className="ml-auto flex items-center gap-1.5 text-[11px] font-mono text-emerald-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> live
              </span>
            </div>
            <div className="grid grid-cols-12 min-h-[400px]">
              {/* Sidebar */}
              <aside className="hidden sm:flex col-span-4 md:col-span-3 border-r border-border-color flex-col p-3 gap-0.5 bg-bg-secondary/30">
                <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted px-2 py-2">
                  # rooms
                </div>
                {[
                  { name: 'global', active: true, badge: 12 },
                  { name: 'react', active: false, badge: 3 },
                  { name: 'rust', active: false, badge: null },
                  { name: 'devops', active: false, badge: null },
                  { name: 'design', active: false, badge: 1 },
                ].map((r) => (
                  <div
                    key={r.name}
                    className={`flex items-center justify-between px-2 py-1.5 rounded-md text-sm font-mono ${
                      r.active
                        ? 'bg-accent-purple/15 text-accent-purple font-medium'
                        : 'text-text-secondary'
                    }`}
                  >
                    <span># {r.name}</span>
                    {r.badge && (
                      <span className="text-[10px] px-1.5 rounded bg-accent-orange/20 text-accent-orange">
                        {r.badge}
                      </span>
                    )}
                  </div>
                ))}
              </aside>

              {/* Chat */}
              <div className="col-span-12 sm:col-span-8 md:col-span-9 p-5 flex flex-col gap-4 text-left">
                {[
                  {
                    name: 'Ada',
                    color: 'from-accent-purple to-fuchsia-500',
                    time: '2m',
                    text: 'Anyone tried the new React 19 use() hook in production?',
                  },
                  {
                    name: 'Linus',
                    color: 'from-accent-orange to-amber-500',
                    time: '1m',
                    text: 'Yep — using it for resource loading. Pairs nicely with Suspense.',
                  },
                  {
                    name: 'Grace',
                    color: 'from-emerald-500 to-teal-500',
                    time: 'now',
                    text: 'Quick demo in #react in 5 — join us.',
                  },
                ].map((m) => (
                  <div key={m.name} className="flex gap-3 items-start">
                    <div
                      className={`w-8 h-8 rounded-full bg-gradient-to-br ${m.color} flex items-center justify-center text-xs font-semibold text-white shrink-0`}
                    >
                      {m.name[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="font-medium text-text-primary">{m.name}</span>
                        <span className="font-mono text-text-muted">· {m.time}</span>
                      </div>
                      <div className="text-sm text-text-secondary mt-0.5">{m.text}</div>
                    </div>
                  </div>
                ))}

                <div className="mt-auto pt-4 flex items-center gap-2">
                  <div className="flex-1 h-10 rounded-md bg-bg-secondary border border-border-color px-3 flex items-center font-mono text-xs text-text-muted">
                    Message #global…
                  </div>
                  <div className="h-10 w-10 rounded-md bg-gradient-to-br from-accent-purple to-accent-orange flex items-center justify-center">
                    <ArrowRight className="w-4 h-4 text-white" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section id="community" className="relative z-10 px-6 lg:px-8 py-20 border-y border-border-color bg-bg-secondary/30">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-10 text-center">
          {[
            { v: '10k+', l: 'Developers' },
            { v: '1M+', l: 'Messages sent' },
            { v: '500+', l: 'Active groups' },
            { v: '99.9%', l: 'Uptime' },
          ].map((s) => (
            <div key={s.l}>
              <div className="text-3xl md:text-4xl font-bold text-gradient">{s.v}</div>
              <div className="text-sm text-text-secondary mt-2">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 px-6 lg:px-8 py-24 lg:py-32">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <div className="inline-block px-2.5 py-1 rounded-md bg-accent-purple/10 text-accent-purple text-xs font-semibold tracking-wider uppercase mb-4">
              Features
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Built for engineers
            </h2>
            <p className="text-lg text-text-secondary">
              A focused toolkit for real-time developer collaboration — no bloat, no distractions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: Globe, color: 'text-accent-purple', bg: 'bg-accent-purple/10', title: 'Global community', body: 'Drop into a worldwide room of developers. Ask, share, learn — in real time.' },
              { icon: Users, color: 'text-accent-orange', bg: 'bg-accent-orange/10', title: 'Private groups', body: 'Spin up focused rooms for your team. Invite-only, yours to moderate.' },
              { icon: Zap, color: 'text-yellow-400', bg: 'bg-yellow-400/10', title: 'Realtime delivery', body: 'Sub-second messages over WebSockets. Feels like the same room.' },
              { icon: Shield, color: 'text-emerald-500', bg: 'bg-emerald-500/10', title: 'Secure by default', body: 'JWT auth and per-message authorization. Your conversations stay yours.' },
              { icon: Code2, color: 'text-sky-400', bg: 'bg-sky-400/10', title: 'Built for devs', body: 'Code-friendly UX, keyboard shortcuts, and an interface that respects your flow.' },
              { icon: MessageSquare, color: 'text-pink-400', bg: 'bg-pink-400/10', title: 'Rich messaging', body: 'DMs, group chat, presence, read receipts, and unread counts — out of the box.' },
            ].map((f) => (
              <div
                key={f.title}
                className="p-6 rounded-2xl border border-border-color bg-bg-secondary/40 hover:bg-bg-secondary hover:border-border-hover transition-colors"
              >
                <div className={`w-11 h-11 rounded-lg ${f.bg} flex items-center justify-center mb-5`}>
                  <f.icon className={`w-5 h-5 ${f.color}`} />
                </div>
                <h3 className="text-base font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="relative z-10 px-6 lg:px-8 py-24 lg:py-32 border-t border-border-color">
        <div className="max-w-5xl mx-auto">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <div className="inline-block px-2.5 py-1 rounded-md bg-accent-orange/10 text-accent-orange text-xs font-semibold tracking-wider uppercase mb-4">
              How it works
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Get going in under a minute
            </h2>
            <p className="text-lg text-text-secondary">
              From sign-up to your first message in three quick steps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { n: '01', icon: Lock, title: 'Create an account', body: 'Sign up with your email — no credit card, no setup fee.' },
              { n: '02', icon: Users, title: 'Join or create a room', body: 'Drop into #global or create a private group for your team.' },
              { n: '03', icon: MessageSquare, title: 'Start collaborating', body: 'Send messages, share ideas, and ship together in real time.' },
            ].map((s) => (
              <div key={s.n} className="p-6 rounded-2xl border border-border-color bg-bg-secondary/40">
                <div className="flex items-center justify-between mb-5">
                  <div className="w-10 h-10 rounded-lg bg-bg-tertiary border border-border-color flex items-center justify-center">
                    <s.icon className="w-4 h-4 text-text-secondary" />
                  </div>
                  <span className="text-xs font-mono text-accent-purple">{s.n}</span>
                </div>
                <h3 className="text-base font-semibold mb-2">{s.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 px-6 lg:px-8 py-24 lg:py-32">
        <div className="max-w-4xl mx-auto text-center p-10 md:p-16 rounded-3xl border border-border-color bg-gradient-to-br from-accent-purple/10 via-bg-secondary/40 to-accent-orange/10 relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-accent-purple/20 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full bg-accent-orange/20 blur-3xl pointer-events-none" />
          <h2 className="relative text-3xl md:text-5xl font-bold tracking-tight mb-4">
            Ready to join the conversation?
          </h2>
          <p className="relative text-lg text-text-secondary mb-8 max-w-xl mx-auto">
            Create your account and start collaborating with developers around the world.
          </p>
          <div className="relative flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" variant="primary" onClick={() => navigate('/register')} className="gap-2">
              Create your account <ArrowRight className="w-4 h-4" />
            </Button>
            <Button size="lg" variant="ghost" onClick={() => navigate('/login')}>
              I already have an account
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border-color px-6 lg:px-8 py-10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-accent-purple to-accent-orange flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <span>© {new Date().getFullYear()} DevConnect — Built for developers.</span>
          </div>
          <div className="flex items-center gap-5 text-text-muted">
            <a href="#" aria-label="GitHub" className="hover:text-text-primary transition-colors">
              <GithubIcon className="w-4 h-4" />
            </a>
            <a href="#" aria-label="Twitter" className="hover:text-text-primary transition-colors">
              <TwitterIcon className="w-4 h-4" />
            </a>
            <a href="#" aria-label="LinkedIn" className="hover:text-text-primary transition-colors">
              <LinkedinIcon className="w-4 h-4" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
