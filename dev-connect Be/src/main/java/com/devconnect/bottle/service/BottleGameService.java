package com.devconnect.bottle.service;

import com.devconnect.bottle.dto.BottleAttemptRequest;
import com.devconnect.bottle.model.BottlePlayer;
import com.devconnect.bottle.model.BottleRoom;
import com.devconnect.service.LeaderboardService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory orchestrator for the multiplayer "Bottle Shuffle Match".
 *
 *  1. createRoom  -> host opens a lobby
 *  2. joinRoom    -> opponents join via room code
 *  3. startGame   -> host starts; a secret order is generated and revealed briefly
 *  4. submit      -> each player submits arrangements; only their own match-count
 *                    is returned. Reaching 5/5 records their attempt count.
 *  5. finish      -> once every player has solved, the player with the fewest
 *                    attempts wins (ties broken by who solved first).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BottleGameService {

    /**
     * Full bottle palette. The first {@code bottleCount} colors are used for a
     * given room (so a 5-bottle room uses RED..PURPLE, a 10-bottle one uses all).
     * Keep this in sync with the frontend BOTTLES list — same keys, same order.
     */
    public static final List<String> ALL_COLORS = List.of(
            "RED", "BLUE", "GREEN", "YELLOW", "PURPLE",
            "ORANGE", "PINK", "CYAN", "BROWN", "WHITE");

    /** Bottle counts the lobby exposes. */
    public static final List<Integer> ALLOWED_COUNTS = List.of(5, 7, 10);

    /** @deprecated kept only for legacy callers; use {@link BottleRoom#getColors()}. */
    @Deprecated
    public static final List<String> COLORS = ALL_COLORS.subList(0, 5);

    private final LeaderboardService leaderboardService;
    private final Map<String, BottleRoom> rooms = new ConcurrentHashMap<>();
    private final Random random = new Random();

    private static int normalizeBottleCount(Integer n) {
        if (n == null) return 5;
        // Allow only 5, 7, 10 — pin to the nearest allowed count for stray input.
        if (n <= 5) return 5;
        if (n <= 7) return 7;
        return 10;
    }

    // ==================== ROOM LIFECYCLE ====================

    public BottleRoom createRoom(String host, Integer maxPlayers, Integer bottleCount) {
        if (host == null || host.isBlank()) throw new IllegalArgumentException("hostUsername required");
        String roomId = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        BottleRoom room = new BottleRoom(roomId, host);
        if (maxPlayers != null && maxPlayers >= 2 && maxPlayers <= 6) room.setMaxPlayers(maxPlayers);

        int count = normalizeBottleCount(bottleCount);
        room.setBottleCount(count);
        room.setColors(new ArrayList<>(ALL_COLORS.subList(0, count)));

        room.getPlayers().put(host, new BottlePlayer(host));
        rooms.put(roomId, room);
        log.info("Bottle room created: id={} host={} bottles={}", roomId, host, count);
        return room;
    }

    /** Back-compat overload for callers that don't pass bottleCount yet. */
    public BottleRoom createRoom(String host, Integer maxPlayers) {
        return createRoom(host, maxPlayers, null);
    }

    public BottleRoom getRoom(String roomId) {
        BottleRoom r = rooms.get(roomId == null ? "" : roomId.toUpperCase());
        if (r == null) throw new NoSuchElementException("Room not found: " + roomId);
        return r;
    }

    public List<Map<String, Object>> listRooms() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (BottleRoom r : rooms.values()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("roomId", r.getRoomId());
            m.put("host", r.getHostUsername());
            m.put("status", r.getStatus().name());
            m.put("players", r.getPlayers().size());
            m.put("maxPlayers", r.getMaxPlayers());
            m.put("bottleCount", r.getBottleCount());
            out.add(m);
        }
        return out;
    }

    public BottleRoom joinRoom(String roomId, String username) {
        BottleRoom r = getRoom(roomId);
        if (username == null || username.isBlank()) throw new IllegalArgumentException("username required");
        if (r.getStatus() != BottleRoom.Status.WAITING) throw new IllegalStateException("Game already started");
        if (r.getPlayers().containsKey(username)) return r;
        if (r.getPlayers().size() >= r.getMaxPlayers()) throw new IllegalStateException("Room is full");
        r.getPlayers().put(username, new BottlePlayer(username));
        return r;
    }

    /** Add a CPU bot to the room (host only). */
    public BottleRoom addBot(String roomId, String username) {
        BottleRoom r = getRoom(roomId);
        if (!username.equals(r.getHostUsername())) throw new IllegalStateException("Only the host can add bots");
        if (r.getStatus() != BottleRoom.Status.WAITING) throw new IllegalStateException("Game already started");
        if (r.getPlayers().size() >= r.getMaxPlayers()) throw new IllegalStateException("Room is full");

        int n = 1;
        String name;
        do { name = "🤖 Bot " + n++; } while (r.getPlayers().containsKey(name));
        BottlePlayer bot = new BottlePlayer(name);
        bot.setBot(true);
        r.getPlayers().put(name, bot);
        return r;
    }

    public BottleRoom removeBot(String roomId, String username, String botName) {
        BottleRoom r = getRoom(roomId);
        if (!username.equals(r.getHostUsername())) throw new IllegalStateException("Only the host can remove bots");
        BottlePlayer p = r.getPlayers().get(botName);
        if (p != null && p.isBot()) r.getPlayers().remove(botName);
        return r;
    }

    public BottleRoom leaveRoom(String roomId, String username) {
        BottleRoom r = getRoom(roomId);
        r.getPlayers().remove(username);
        if (r.getPlayers().isEmpty()) {
            rooms.remove(r.getRoomId());
            return r;
        }
        if (username.equals(r.getHostUsername())) {
            r.setHostUsername(r.getPlayers().keySet().iterator().next());
        }
        // If a player leaves mid-game, the remaining players may now all be solved.
        if (r.getStatus() == BottleRoom.Status.IN_PROGRESS) maybeFinish(r);
        return r;
    }

    public BottleRoom startGame(String roomId, String username) {
        BottleRoom r = getRoom(roomId);
        if (!username.equals(r.getHostUsername())) throw new IllegalStateException("Only the host can start");
        if (r.getStatus() == BottleRoom.Status.IN_PROGRESS) throw new IllegalStateException("Already started");
        if (r.getPlayers().size() < r.getMinPlayers())
            throw new IllegalStateException("Need at least " + r.getMinPlayers() + " players");

        // reset all players (and give each bot a fresh skill roll)
        for (BottlePlayer p : r.getPlayers().values()) {
            p.setAttempts(0);
            p.setLastMatches(0);
            p.setSolved(false);
            p.setSolvedAtAttempt(0);
            p.setFinishRank(0);
            if (p.isBot()) {
                // Medium skill: solves in 1-4 attempts, ~2-4s per attempt.
                p.setBotTargetAttempts(1 + random.nextInt(4));
                p.setBotIntervalMs(2000 + random.nextInt(2000));
            }
        }
        r.setFinishSeq(0);
        r.setWinner(null);

        // Backfill colors for rooms created before bottleCount existed.
        if (r.getColors() == null || r.getColors().isEmpty()) {
            int count = r.getBottleCount() > 0 ? r.getBottleCount() : 5;
            r.setBottleCount(count);
            r.setColors(new ArrayList<>(ALL_COLORS.subList(0, count)));
        }
        List<String> order = new ArrayList<>(r.getColors());
        Collections.shuffle(order, random);
        r.setOriginalOrder(order);

        long now = System.currentTimeMillis();
        r.setStartedAt(now);
        r.setMemorizeEndsAt(now + r.getMemorizeSeconds() * 1000L);
        r.setStatus(BottleRoom.Status.IN_PROGRESS);
        log.info("Bottle game started: room={} order={}", roomId, order);
        return r;
    }

    /** Reset back to the lobby so the host can start a fresh round. */
    public BottleRoom rematch(String roomId, String username) {
        BottleRoom r = getRoom(roomId);
        r.setStatus(BottleRoom.Status.WAITING);
        r.setWinner(null);
        r.setFinishSeq(0);
        r.getOriginalOrder().clear();
        for (BottlePlayer p : r.getPlayers().values()) {
            p.setAttempts(0);
            p.setLastMatches(0);
            p.setSolved(false);
            p.setSolvedAtAttempt(0);
            p.setFinishRank(0);
        }
        return r;
    }

    // ==================== CHAT ====================

    /** Post a chat message or emoji. Players in the room only. */
    public BottleRoom chat(String roomId, String username, String message) {
        BottleRoom r = getRoom(roomId);
        if (!r.getPlayers().containsKey(username)) throw new IllegalArgumentException("You are not in this room");
        if (message == null) throw new IllegalArgumentException("message required");
        String msg = message.trim();
        if (msg.isEmpty()) return r;
        if (msg.length() > 200) msg = msg.substring(0, 200);

        r.setChatSeq(r.getChatSeq() + 1);
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("id", r.getChatSeq());
        entry.put("sender", username);
        entry.put("message", msg);
        entry.put("ts", System.currentTimeMillis());
        r.getChat().add(entry);
        if (r.getChat().size() > 50) r.getChat().remove(0);
        return r;
    }

    // ==================== GAMEPLAY ====================

    /**
     * Records one attempt for the player. Returns only that player's own result
     * (match count + whether they solved) — never the opponent's progress or the
     * secret order (until the game is finished).
     */
    public Map<String, Object> submit(String roomId, BottleAttemptRequest req) {
        BottleRoom r = getRoom(roomId);
        String username = req.getUsername();
        BottlePlayer p = r.getPlayers().get(username);
        if (p == null) throw new IllegalArgumentException("You are not in this room");
        if (r.getStatus() != BottleRoom.Status.IN_PROGRESS) throw new IllegalStateException("Game is not in progress");
        if (System.currentTimeMillis() < r.getMemorizeEndsAt())
            throw new IllegalStateException("Still memorizing — wait for the order to hide");
        if (p.isSolved()) throw new IllegalStateException("You already solved it");

        List<String> arrangement = req.getArrangement();
        validateArrangement(arrangement, r.getColors());

        p.setAttempts(p.getAttempts() + 1);
        int matches = countMatches(r.getOriginalOrder(), arrangement);
        p.setLastMatches(matches);

        if (matches == r.getColors().size()) {
            p.setSolved(true);
            p.setSolvedAtAttempt(p.getAttempts());
            r.setFinishSeq(r.getFinishSeq() + 1);
            p.setFinishRank(r.getFinishSeq());
        }

        advanceBots(r, System.currentTimeMillis());
        maybeFinish(r);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("matches", matches);
        out.put("solved", p.isSolved());
        out.put("attempt", p.getAttempts());
        return out;
    }

    /**
     * Advances each bot's progress based on wall-clock time since the memorize
     * window closed — no background threads needed; evaluated lazily on poll/submit.
     */
    private void advanceBots(BottleRoom r, long now) {
        if (r.getStatus() != BottleRoom.Status.IN_PROGRESS) return;
        if (now < r.getMemorizeEndsAt()) return;
        long elapsed = now - r.getMemorizeEndsAt();
        for (BottlePlayer p : r.getPlayers().values()) {
            if (!p.isBot() || p.isSolved()) continue;
            int target = Math.max(1, p.getBotTargetAttempts());
            long interval = Math.max(500, p.getBotIntervalMs());
            int attemptsByNow = (int) Math.min(target, elapsed / interval);
            if (attemptsByNow <= p.getAttempts()) continue;
            p.setAttempts(attemptsByNow);
            int total = r.getColors().size();
            if (attemptsByNow >= target) {
                p.setLastMatches(total);
                p.setSolved(true);
                p.setSolvedAtAttempt(target);
                r.setFinishSeq(r.getFinishSeq() + 1);
                p.setFinishRank(r.getFinishSeq());
            } else {
                // partial progress — pretend it got "close" but not perfect
                p.setLastMatches(Math.min(total - 1, attemptsByNow + 1));
            }
        }
    }

    /** Finishes the game once every (remaining) player has solved. */
    private void maybeFinish(BottleRoom r) {
        if (r.getStatus() != BottleRoom.Status.IN_PROGRESS) return;
        if (r.getPlayers().isEmpty()) return;
        boolean allSolved = r.getPlayers().values().stream().allMatch(BottlePlayer::isSolved);
        if (!allSolved) return;

        // Winner: fewest attempts, tie broken by earliest to solve (lowest finishRank).
        BottlePlayer best = null;
        for (BottlePlayer p : r.getPlayers().values()) {
            if (best == null
                    || p.getSolvedAtAttempt() < best.getSolvedAtAttempt()
                    || (p.getSolvedAtAttempt() == best.getSolvedAtAttempt() && p.getFinishRank() < best.getFinishRank())) {
                best = p;
            }
        }
        r.setWinner(best != null ? best.getUsername() : null);
        r.setStatus(BottleRoom.Status.FINISHED);
        log.info("Bottle game finished: room={} winner={}", r.getRoomId(), r.getWinner());

        // Record results for the leaderboard/stats (humans only; bots skipped in service).
        // Score = attempts to solve (lower is better) — only meaningful for solvers.
        for (BottlePlayer p : r.getPlayers().values()) {
            boolean won = p.getUsername().equals(r.getWinner());
            leaderboardService.record("BOTTLE", p.getUsername(), won, p.getSolvedAtAttempt());
        }
    }

    private void validateArrangement(List<String> arrangement, List<String> expected) {
        if (arrangement == null || arrangement.size() != expected.size())
            throw new IllegalArgumentException("arrangement must contain exactly " + expected.size() + " bottles");
        if (!new HashSet<>(arrangement).equals(new HashSet<>(expected)))
            throw new IllegalArgumentException("arrangement must be a permutation of the bottle colors");
    }

    private int countMatches(List<String> original, List<String> guess) {
        int m = 0;
        for (int i = 0; i < original.size(); i++) {
            if (original.get(i).equals(guess.get(i))) m++;
        }
        return m;
    }

    // ==================== VIEW ====================

    /**
     * Builds a player-aware view. Opponents' match counts and the secret order
     * stay hidden while the game is in progress; the order is revealed only
     * during the memorize window (for the asking player) and after the game ends.
     */
    public Map<String, Object> view(String roomId, String forUsername) {
        BottleRoom r = getRoom(roomId);
        long now = System.currentTimeMillis();
        advanceBots(r, now);
        maybeFinish(r);
        boolean memorizing = r.getStatus() == BottleRoom.Status.IN_PROGRESS && now < r.getMemorizeEndsAt();
        boolean finished = r.getStatus() == BottleRoom.Status.FINISHED;

        Map<String, Object> v = new LinkedHashMap<>();
        v.put("roomId", r.getRoomId());
        v.put("host", r.getHostUsername());
        v.put("status", r.getStatus().name());
        v.put("maxPlayers", r.getMaxPlayers());
        v.put("minPlayers", r.getMinPlayers());
        v.put("winner", r.getWinner());
        // Room-specific color set. Falls back to a 5-bottle palette for very old
        // rooms created before the bottleCount field existed.
        List<String> colors = (r.getColors() != null && !r.getColors().isEmpty())
                ? r.getColors()
                : ALL_COLORS.subList(0, 5);
        v.put("colors", colors);
        v.put("bottleCount", colors.size());
        v.put("memorizeSeconds", r.getMemorizeSeconds());
        v.put("memorizeEndsAt", r.getMemorizeEndsAt());
        v.put("startedAt", r.getStartedAt());
        v.put("serverNow", now);
        v.put("memorizing", memorizing);
        v.put("chat", r.getChat());

        List<Map<String, Object>> players = new ArrayList<>();
        for (BottlePlayer p : r.getPlayers().values()) {
            Map<String, Object> pm = new LinkedHashMap<>();
            pm.put("username", p.getUsername());
            pm.put("bot", p.isBot());
            pm.put("attempts", p.getAttempts());
            pm.put("solved", p.isSolved());
            // Reveal exact match counts only when finished.
            if (finished) {
                pm.put("solvedAtAttempt", p.getSolvedAtAttempt());
                pm.put("finishRank", p.getFinishRank());
            }
            // Always include the asking player's own latest match count.
            if (p.getUsername().equals(forUsername)) {
                pm.put("yourLastMatches", p.getLastMatches());
            }
            players.add(pm);
        }
        v.put("players", players);

        // The secret order: visible during the memorize window to the asking
        // player, and to everyone once the game is finished.
        if (memorizing || finished) {
            v.put("revealOrder", r.getOriginalOrder());
        }
        return v;
    }
}
