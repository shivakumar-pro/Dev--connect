# DevConnect — Upcoming Tasks & Ideas

Running backlog of features and "make it more addictive" ideas. New ideas get
appended here instead of being lost in chat. Tick items as they ship.

> Legend: ⬜ todo · 🟡 in progress · ✅ done

---

## 🎯 Engagement / "make it addictive" (priority order)

1. ⬜ **Daily challenge** — same Bottle Shuffle puzzle seed for everyone each day; compare attempts with friends. (Drives daily return.)
2. 🟡 **Leaderboards** — weekly + all-time, per-game + all-games combined. *(backend/stats being built now)*
3. 🟡 **Player stats** — games played, wins, win rate, best score, streaks. *(being built now)*
4. ⬜ **Login & win streaks** — flame counter on Home; "your streak ends in Xh" nudges.
5. ⬜ **XP / levels / ranks** — Bronze→Diamond, plus an ELO-style rating for head-to-head games.
6. ⬜ **Achievements / badges** — e.g. "Solved in 1!", "5-win streak", "Beat a hard bot".
7. ⬜ **Cosmetics** — unlockable bottle skins / themes bought with coins earned by playing.
8. ⬜ **Rematch + challenge-a-friend** deep links in chat for Bottle Shuffle (extend existing invite system).
9. ⬜ **Push notifications** — "X challenged you", "Daily challenge is live", "You dropped to #4".
10. ⬜ **Difficulty progression** — 4 / 5 / 6 bottles; harder = more XP.
11. ⬜ **Juice** — sounds, confetti, floating emoji reactions, near-miss feedback ("so close — 4/5!").

---

## 🧩 Features / product

- ⬜ **Home dashboard** — personalized landing: stats, streak, leaderboard snapshot, quick-play, recent chats. *(being built now)*
- ⬜ **Leaderboard record hooks for remaining games** — call `leaderboardService.record(gameKey, username, won, score)` at each game's finish. Done: Bottle Shuffle (`BOTTLE`). TODO: Dice (4 variants, multiple finish points), Phase 10, Guess the Number (currently uses legacy `GameLeaderboard`), Party games. Until wired, the unified board only shows their data once added.
- ⬜ **Bots for remaining games** — Dice (Pig/Farkle/Liar's/SCC), Guess the Number, Party games. (Phase 10 + Bottle Shuffle done.)
- ⬜ **In-game chat for all games** — Bottle Shuffle has a floating emoji chat; extend the pattern to the REST-polled games that lack it.
- ⬜ **Spectator mode** — watch a live game.
- ⬜ **Friends / online presence** — see who's online, invite directly.

---

## 🐛 Known issues / tech debt

- ✅ **WebSocket CORS** — `/ws/info` was blocked (credentials). Fixed via `cors.allow-credentials=true`.
- ✅ **Global chat send** — now optimistic + REST fallback when socket is down.
- ⬜ **Bundle size** — main JS chunk > 500 kB; consider route-based code-splitting / dynamic imports.
- ⬜ **Anti-cheat (Bottle Shuffle)** — secret order currently never sent to clients during play (good); revisit if scores become competitive.

---

_Last updated: 2026-06-01_
