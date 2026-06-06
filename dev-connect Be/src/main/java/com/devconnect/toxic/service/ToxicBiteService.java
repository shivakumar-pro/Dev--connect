package com.devconnect.toxic.service;

import com.devconnect.toxic.dto.ToxicBiteActionRequest;
import com.devconnect.toxic.model.ToxicBitePlayer;
import com.devconnect.toxic.model.ToxicBiteRoom;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;

/**
 * In-memory orchestrator for Toxic Bite.
 *
 * Round flow:
 *   POISONING  -> every alive player must pick one position on the opponent's
 *                 board (action="poison", position=1..9). When both have picked,
 *                 phase auto-advances to EATING.
 *   EATING     -> current player calls action="eat", position=1..9 on their own
 *                 board. If they hit the opponent's poison they die; otherwise
 *                 they score +1 and the turn advances. When everyone is dead the
 *                 round ends and the next round begins (or the match ends).
 */
@Service
public class ToxicBiteService {

    private final Map<String, ToxicBiteRoom> rooms = new ConcurrentHashMap<>();

    /** Pool of food emojis the round board is drawn from. */
    private static final String[] FOODS = {
            "🍕","🍔","🍟","🌭","🍩","🍗","🥪","🍜","🍎",
            "🍣","🍤","🥟","🍱","🍛","🥗","🍝","🌮","🌯",
            "🍪","🍰","🥞","🧁","🍮","🥯","🥨","🍿","🍫"
    };

    // ==================== ROOM LIFECYCLE ====================

    public ToxicBiteRoom createRoom(String hostUsername, Integer rounds, Integer maxPlayers) {
        if (hostUsername == null || hostUsername.isBlank())
            throw new IllegalArgumentException("hostUsername required");

        int totalRounds = normalizeRounds(rounds);
        int cap = (maxPlayers == null || maxPlayers < 2) ? 2 : Math.min(maxPlayers, 6);

        String roomId = generateRoomId();
        ToxicBiteRoom r = new ToxicBiteRoom(roomId, hostUsername);
        r.setTotalRounds(totalRounds);
        r.setMaxPlayers(cap);
        r.getPlayers().put(hostUsername, new ToxicBitePlayer(hostUsername));
        r.resetTurnOrder();
        rooms.put(roomId, r);
        r.logEvent(hostUsername + " created the room (" + totalRounds + " rounds)");
        return r;
    }

    public ToxicBiteRoom joinRoom(String roomId, String username) {
        ToxicBiteRoom r = require(roomId);
        if (r.getStatus() != ToxicBiteRoom.Status.WAITING)
            throw new IllegalStateException("Game already started");
        if (r.getPlayers().containsKey(username)) return r;
        if (r.getPlayers().size() >= r.getMaxPlayers())
            throw new IllegalStateException("Room is full");
        r.getPlayers().put(username, new ToxicBitePlayer(username));
        r.resetTurnOrder();
        r.logEvent(username + " joined");
        return r;
    }

    public void leaveRoom(String roomId, String username) {
        ToxicBiteRoom r = require(roomId);
        if (!r.getPlayers().containsKey(username)) return;
        r.getPlayers().remove(username);
        r.resetTurnOrder();
        r.logEvent(username + " left");
        if (r.getPlayers().isEmpty()) {
            rooms.remove(roomId);
            return;
        }
        if (r.getStatus() == ToxicBiteRoom.Status.IN_PROGRESS && r.getPlayers().size() < r.getMinPlayers()) {
            // Last opponent left mid-game — declare the remaining player the winner.
            ToxicBitePlayer last = r.getPlayers().values().iterator().next();
            r.setStatus(ToxicBiteRoom.Status.FINISHED);
            r.setWinner(last.getUsername());
            r.logEvent(last.getUsername() + " wins by walkover");
        }
    }

    public ToxicBiteRoom startGame(String roomId, String username) {
        ToxicBiteRoom r = require(roomId);
        if (!username.equals(r.getHostUsername()))
            throw new IllegalStateException("Only the host can start");
        if (r.getStatus() != ToxicBiteRoom.Status.WAITING)
            throw new IllegalStateException("Already started");
        if (r.getPlayers().size() < r.getMinPlayers())
            throw new IllegalStateException("Need at least " + r.getMinPlayers() + " players");

        r.setStatus(ToxicBiteRoom.Status.IN_PROGRESS);
        beginRound(r, 1);
        r.logEvent("Game started — Round 1");
        return r;
    }

    // ==================== ACTIONS ====================

    public ToxicBiteRoom handleAction(String roomId, ToxicBiteActionRequest req) {
        ToxicBiteRoom r = require(roomId);
        if (r.getStatus() != ToxicBiteRoom.Status.IN_PROGRESS)
            throw new IllegalStateException("Game is not in progress");

        String username = req.getUsername();
        ToxicBitePlayer me = r.getPlayers().get(username);
        if (me == null) throw new IllegalStateException("You are not in this room");

        String action = req.getAction() == null ? "" : req.getAction().toLowerCase(Locale.ROOT);
        Integer pos = req.getPosition();
        validatePosition(pos);

        switch (action) {
            case "poison" -> doPoison(r, me, pos);
            case "eat"    -> doEat(r, me, pos);
            default       -> throw new IllegalArgumentException("Unknown action: " + req.getAction());
        }
        return r;
    }

    private void doPoison(ToxicBiteRoom r, ToxicBitePlayer me, int pos) {
        if (r.getPhase() != ToxicBiteRoom.Phase.POISONING)
            throw new IllegalStateException("Not in poison phase");
        if (me.getPoisonForOpponent() != null)
            throw new IllegalStateException("You already placed the poison");
        me.setPoisonForOpponent(pos);
        r.logEvent(me.getUsername() + " hid the poison");

        // If every player has placed a poison, advance to EATING.
        boolean allReady = r.getPlayers().values().stream()
                .allMatch(p -> p.getPoisonForOpponent() != null);
        if (allReady) {
            r.setPhase(ToxicBiteRoom.Phase.EATING);
            r.logEvent("Eating phase begins — " + r.getCurrentUsername() + " goes first");
        }
    }

    private void doEat(ToxicBiteRoom r, ToxicBitePlayer me, int pos) {
        if (r.getPhase() != ToxicBiteRoom.Phase.EATING)
            throw new IllegalStateException("Not in eating phase");
        if (!me.isAlive())
            throw new IllegalStateException("You're already out this round");
        if (!me.getUsername().equals(r.getCurrentUsername()))
            throw new IllegalStateException("Not your turn");
        if (me.getEatenPositions().contains(pos))
            throw new IllegalStateException("Already eaten that one");

        ToxicBitePlayer opponent = r.opponentOf(me.getUsername());
        // In 2-player matches the opponent's poisonForOpponent is what's hiding
        // on MY board. (For 3+ players we'd need a per-victim map; out of scope.)
        Integer myPoison = opponent == null ? null : opponent.getPoisonForOpponent();

        me.getEatenPositions().add(pos);

        if (myPoison != null && myPoison == pos) {
            // 💀 BUST
            me.setAlive(false);
            r.logEvent(me.getUsername() + " bit the poison at position " + pos + " ☠️");
            // Round-score already reflects safe bites taken so far.
        } else {
            me.setCurrentRoundScore(me.getCurrentRoundScore() + 1);
            r.logEvent(me.getUsername() + " ate position " + pos + " — safe (+1)");

            // Ate 8/9 safely → the one remaining tile is necessarily the poison.
            // Auto-survive the meal, award +5 bonus, retire the player for the round.
            if (me.getEatenPositions().size() == 8) {
                me.setCurrentRoundScore(me.getCurrentRoundScore() + 5);
                me.setSurvived(true);
                me.setAlive(false);
                r.logEvent(me.getUsername() + " survived the meal! 🏆 +5 bonus");
            }
        }

        // Round ends when nobody is alive any more.
        boolean anyAlive = r.getPlayers().values().stream().anyMatch(ToxicBitePlayer::isAlive);
        if (!anyAlive) {
            endRound(r);
        } else {
            r.advanceTurn();
        }
    }

    // ==================== ROUND CONTROL ====================

    private void beginRound(ToxicBiteRoom r, int roundNum) {
        r.setCurrentRound(roundNum);
        r.setPhase(ToxicBiteRoom.Phase.POISONING);
        r.setBoard(rollFreshBoard());
        r.resetTurnOrder();

        for (ToxicBitePlayer p : r.getPlayers().values()) {
            p.setAlive(true);
            p.setSurvived(false);
            p.setCurrentRoundScore(0);
            p.setPoisonForOpponent(null);
            p.setEatenPositions(new LinkedHashSet<>());
        }
    }

    private void endRound(ToxicBiteRoom r) {
        r.setPhase(ToxicBiteRoom.Phase.ROUND_OVER);

        // Bank the round score, snapshot the reveal data.
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("round", r.getCurrentRound());
        snapshot.put("board", new ArrayList<>(r.getBoard()));

        List<Map<String, Object>> reveal = new ArrayList<>();
        for (ToxicBitePlayer p : r.getPlayers().values()) {
            p.getRoundScores().add(p.getCurrentRoundScore());
            p.setTotalScore(p.getTotalScore() + p.getCurrentRoundScore());

            // Where the poison was sitting on THIS player's board (= opponent's pick).
            ToxicBitePlayer opp = r.opponentOf(p.getUsername());
            Integer onMyBoard = opp == null ? null : opp.getPoisonForOpponent();

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("username", p.getUsername());
            row.put("scored", p.getCurrentRoundScore());
            row.put("totalScore", p.getTotalScore());
            row.put("poisonOnMyBoard", onMyBoard);
            row.put("eaten", new ArrayList<>(p.getEatenPositions()));
            row.put("survived", p.isSurvived());
            reveal.add(row);
        }
        snapshot.put("players", reveal);

        // Round winner is whoever scored most this round (null on tie).
        String roundWinner = null;
        int top = -1; boolean tie = false;
        for (ToxicBitePlayer p : r.getPlayers().values()) {
            int s = p.getCurrentRoundScore();
            if (s > top) { top = s; roundWinner = p.getUsername(); tie = false; }
            else if (s == top) { tie = true; }
        }
        snapshot.put("roundWinner", tie ? null : roundWinner);
        r.getRoundHistory().add(snapshot);
        r.logEvent("Round " + r.getCurrentRound() + " complete" +
                (tie ? " — tied" : roundWinner != null ? " — " + roundWinner + " takes it" : ""));

        // Auto-advance to the next round or end the match.
        if (r.getCurrentRound() >= r.getTotalRounds()) {
            finishMatch(r);
        } else {
            // Note: the client polls every couple of seconds, so we keep the
            // ROUND_OVER phase for one beat so they can show the reveal screen.
            // The frontend calls /next-round to actually advance.
        }
    }

    public ToxicBiteRoom advanceRound(String roomId, String username) {
        ToxicBiteRoom r = require(roomId);
        if (r.getStatus() != ToxicBiteRoom.Status.IN_PROGRESS) return r;
        if (r.getPhase() != ToxicBiteRoom.Phase.ROUND_OVER)
            throw new IllegalStateException("Round not finished yet");
        if (!r.getPlayers().containsKey(username))
            throw new IllegalStateException("Not in this room");

        if (r.getCurrentRound() >= r.getTotalRounds()) {
            finishMatch(r);
            return r;
        }
        beginRound(r, r.getCurrentRound() + 1);
        r.logEvent("Round " + r.getCurrentRound() + " begins");
        return r;
    }

    private void finishMatch(ToxicBiteRoom r) {
        r.setStatus(ToxicBiteRoom.Status.FINISHED);
        String winner = null;
        int top = -1; boolean tie = false;
        for (ToxicBitePlayer p : r.getPlayers().values()) {
            if (p.getTotalScore() > top) { top = p.getTotalScore(); winner = p.getUsername(); tie = false; }
            else if (p.getTotalScore() == top) { tie = true; }
        }
        r.setWinner(tie ? null : winner);
        r.logEvent(tie ? "Match tied!" : (winner + " wins the match!"));
    }

    // ==================== VIEW (player-aware) ====================

    public Map<String, Object> view(String roomId, String forUsername) {
        ToxicBiteRoom r = require(roomId);
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("roomId", r.getRoomId());
        v.put("host", r.getHostUsername());
        v.put("hostUsername", r.getHostUsername());
        v.put("status", r.getStatus().name());
        v.put("phase", r.getPhase().name());
        v.put("totalRounds", r.getTotalRounds());
        v.put("currentRound", r.getCurrentRound());
        v.put("maxPlayers", r.getMaxPlayers());
        v.put("board", r.getBoard());
        v.put("currentPlayer", r.getCurrentUsername());
        v.put("winner", r.getWinner());
        v.put("turnOrder", r.getTurnOrder());
        v.put("eventLog", new ArrayList<>(r.getEventLog()));
        v.put("roundHistory", r.getRoundHistory());

        List<Map<String, Object>> players = new ArrayList<>();
        for (ToxicBitePlayer p : r.getPlayers().values()) {
            Map<String, Object> pm = new LinkedHashMap<>();
            pm.put("username", p.getUsername());
            pm.put("score", p.getTotalScore());
            pm.put("currentRoundScore", p.getCurrentRoundScore());
            pm.put("roundScores", p.getRoundScores());
            pm.put("alive", p.isAlive());
            pm.put("survived", p.isSurvived());
            pm.put("eaten", new ArrayList<>(p.getEatenPositions()));
            // Only echo my own poison pick; never leak the opponent's pick during play.
            boolean isMe = p.getUsername().equals(forUsername);
            boolean roundOver = r.getPhase() == ToxicBiteRoom.Phase.ROUND_OVER
                                || r.getStatus() == ToxicBiteRoom.Status.FINISHED;
            if (isMe || roundOver) {
                pm.put("poisonForOpponent", p.getPoisonForOpponent());
            }
            pm.put("hasPickedPoison", p.getPoisonForOpponent() != null);
            players.add(pm);
        }
        v.put("players", players);
        return v;
    }

    public List<Map<String, Object>> listRooms() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (ToxicBiteRoom r : rooms.values()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("roomId", r.getRoomId());
            m.put("host", r.getHostUsername());
            m.put("status", r.getStatus().name());
            m.put("players", r.getPlayers().size());
            m.put("maxPlayers", r.getMaxPlayers());
            m.put("rounds", r.getTotalRounds());
            out.add(m);
        }
        return out;
    }

    // ==================== HELPERS ====================

    private ToxicBiteRoom require(String roomId) {
        ToxicBiteRoom r = rooms.get(roomId);
        if (r == null) throw new NoSuchElementException("Room not found: " + roomId);
        return r;
    }

    private static int normalizeRounds(Integer rounds) {
        if (rounds == null) return 3;
        if (rounds <= 1) return 1;
        if (rounds >= 5) return 5;
        return 3; // we only support 1 / 3 / 5
    }

    private static void validatePosition(Integer pos) {
        if (pos == null || pos < 1 || pos > 9)
            throw new IllegalArgumentException("position must be 1..9");
    }

    private static String generateRoomId() {
        return "TOX-" + Long.toString(System.currentTimeMillis(), 36).toUpperCase()
                + "-" + Integer.toString(ThreadLocalRandom.current().nextInt(36 * 36 * 36), 36).toUpperCase();
    }

    private static List<String> rollFreshBoard() {
        List<String> pool = new ArrayList<>(Arrays.asList(FOODS));
        Collections.shuffle(pool, ThreadLocalRandom.current());
        return new ArrayList<>(pool.subList(0, 9));
    }
}
