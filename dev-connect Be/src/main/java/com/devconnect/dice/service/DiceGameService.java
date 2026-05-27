package com.devconnect.dice.service;

import com.devconnect.dice.dto.DiceActionRequest;
import com.devconnect.dice.model.DiceGameType;
import com.devconnect.dice.model.DicePlayer;
import com.devconnect.dice.model.DiceRoom;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;

/**
 * In-memory orchestrator for the four dice games:
 *   PIG, FARKLE, LIARS_DICE, SHIP_CAPTAIN_CREW
 *
 * Each room has a turn order; only the current player can submit an action.
 * Actions per game:
 *   PIG               -> action = "roll" | "hold"
 *   FARKLE            -> action = "roll" | "keep" (with indices) | "bank"
 *   LIARS_DICE        -> action = "bid" (qty,face) | "challenge"
 *   SHIP_CAPTAIN_CREW -> action = "roll" | "stop"
 */
@Slf4j
@Service
public class DiceGameService {

    private final Map<String, DiceRoom> rooms = new ConcurrentHashMap<>();

    // ==================== ROOM LIFECYCLE ====================

    public DiceRoom createRoom(DiceGameType type, String host, Integer targetScore, Integer maxPlayers) {
        if (type == null) throw new IllegalArgumentException("gameType required");
        if (host == null || host.isBlank()) throw new IllegalArgumentException("hostUsername required");

        String roomId = UUID.randomUUID().toString().substring(0, 8);
        DiceRoom room = new DiceRoom(roomId, type, host);
        room.setTargetScore(targetScore != null ? targetScore : defaultTarget(type));
        if (maxPlayers != null) room.setMaxPlayers(maxPlayers);
        room.getPlayers().put(host, new DicePlayer(host));
        rooms.put(roomId, room);
        log.info("Dice room created: id={} game={} host={}", roomId, type, host);
        return room;
    }

    public DiceRoom getRoom(String roomId) {
        DiceRoom r = rooms.get(roomId);
        if (r == null) throw new NoSuchElementException("Room not found: " + roomId);
        return r;
    }

    public List<Map<String, Object>> listRooms() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (DiceRoom r : rooms.values()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("roomId", r.getRoomId());
            m.put("gameType", r.getGameType().name());
            m.put("host", r.getHostUsername());
            m.put("status", r.getStatus().name());
            m.put("players", r.getPlayers().size());
            m.put("maxPlayers", r.getMaxPlayers());
            out.add(m);
        }
        return out;
    }

    public DiceRoom joinRoom(String roomId, String username) {
        DiceRoom r = getRoom(roomId);
        if (username == null || username.isBlank()) throw new IllegalArgumentException("username required");
        if (r.getStatus() != DiceRoom.Status.WAITING) throw new IllegalStateException("Game already started");
        if (r.getPlayers().containsKey(username)) return r;
        if (r.getPlayers().size() >= r.getMaxPlayers()) throw new IllegalStateException("Room is full");
        r.getPlayers().put(username, new DicePlayer(username));
        return r;
    }

    public DiceRoom leaveRoom(String roomId, String username) {
        DiceRoom r = getRoom(roomId);
        r.getPlayers().remove(username);
        r.getTurnOrder().remove(username);
        if (r.getPlayers().isEmpty()) {
            rooms.remove(roomId);
            return r;
        }
        if (username.equals(r.getHostUsername())) {
            r.setHostUsername(r.getPlayers().keySet().iterator().next());
        }
        return r;
    }

    public DiceRoom startGame(String roomId, String username) {
        DiceRoom r = getRoom(roomId);
        if (!username.equals(r.getHostUsername())) throw new IllegalStateException("Only host can start");
        if (r.getStatus() != DiceRoom.Status.WAITING) throw new IllegalStateException("Already started");
        if (r.getPlayers().size() < r.getMinPlayers())
            throw new IllegalStateException("Need at least " + r.getMinPlayers() + " players");

        r.setTurnOrder(new ArrayList<>(r.getPlayers().keySet()));
        r.setCurrentTurnIndex(0);
        r.setStatus(DiceRoom.Status.IN_PROGRESS);

        switch (r.getGameType()) {
            case PIG -> initPig(r);
            case FARKLE -> initFarkle(r);
            case LIARS_DICE -> initLiarsDice(r);
            case SHIP_CAPTAIN_CREW -> initShipCaptainCrew(r);
        }
        log.info("Dice game started: room={} type={} order={}", roomId, r.getGameType(), r.getTurnOrder());
        return r;
    }

    // ==================== ACTION DISPATCH ====================

    public Map<String, Object> handleAction(String roomId, DiceActionRequest req) {
        DiceRoom r = getRoom(roomId);
        if (r.getStatus() != DiceRoom.Status.IN_PROGRESS) throw new IllegalStateException("Game not in progress");
        if (req.getUsername() == null || !r.getPlayers().containsKey(req.getUsername()))
            throw new IllegalArgumentException("username not in room");
        if (req.getAction() == null) throw new IllegalArgumentException("action required");

        Map<String, Object> result = switch (r.getGameType()) {
            case PIG -> handlePigAction(r, req);
            case FARKLE -> handleFarkleAction(r, req);
            case LIARS_DICE -> handleLiarsDiceAction(r, req);
            case SHIP_CAPTAIN_CREW -> handleShipCaptainCrewAction(r, req);
        };
        r.logEvent(result);
        return result;
    }

    // ==================== VIEW (player-aware) ====================

    /**
     * Returns a JSON-friendly view of the room. For Liar's Dice, only the
     * requesting player's hand is exposed (others' hands are hidden).
     */
    public Map<String, Object> view(String roomId, String forUsername) {
        DiceRoom r = getRoom(roomId);
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("roomId", r.getRoomId());
        v.put("gameType", r.getGameType().name());
        v.put("host", r.getHostUsername());
        v.put("status", r.getStatus().name());
        v.put("targetScore", r.getTargetScore());
        v.put("turnOrder", r.getTurnOrder());
        v.put("currentPlayer", r.getCurrentUsername());
        v.put("winner", r.getWinner());

        List<Map<String, Object>> players = new ArrayList<>();
        for (DicePlayer p : r.getPlayers().values()) {
            Map<String, Object> pm = new LinkedHashMap<>();
            pm.put("username", p.getUsername());
            pm.put("score", p.getScore());
            pm.put("eliminated", p.isEliminated());
            if (r.getGameType() == DiceGameType.LIARS_DICE) {
                pm.put("diceCount", p.getDiceCount());
                if (p.getUsername().equals(forUsername) || r.getStatus() == DiceRoom.Status.FINISHED) {
                    pm.put("hand", p.getHand());
                }
            }
            players.add(pm);
        }
        v.put("players", players);

        Map<String, Object> publicState = new LinkedHashMap<>(r.getGameState());
        v.put("gameState", publicState);
        v.put("recentEvents", r.getEvents());
        return v;
    }

    // ==================== PIG ====================

    private void initPig(DiceRoom r) {
        r.getGameState().put("turnScore", 0);
        r.getGameState().put("lastRoll", null);
    }

    private Map<String, Object> handlePigAction(DiceRoom r, DiceActionRequest req) {
        requireTurn(r, req.getUsername());
        DicePlayer p = r.getPlayers().get(req.getUsername());
        Map<String, Object> gs = r.getGameState();
        int turnScore = (int) gs.getOrDefault("turnScore", 0);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("player", req.getUsername());

        switch (req.getAction().toLowerCase()) {
            case "roll" -> {
                int roll = roll1to6();
                gs.put("lastRoll", roll);
                out.put("rolled", roll);
                if (roll == 1) {
                    out.put("event", "BUST");
                    out.put("turnScoreLost", turnScore);
                    gs.put("turnScore", 0);
                    r.advanceTurn();
                    out.put("nextPlayer", r.getCurrentUsername());
                } else {
                    int t = turnScore + roll;
                    gs.put("turnScore", t);
                    out.put("event", "ROLL_OK");
                    out.put("turnScore", t);
                }
            }
            case "hold" -> {
                p.setScore(p.getScore() + turnScore);
                out.put("event", "HOLD");
                out.put("banked", turnScore);
                out.put("totalScore", p.getScore());
                gs.put("turnScore", 0);
                if (p.getScore() >= r.getTargetScore()) {
                    r.setStatus(DiceRoom.Status.FINISHED);
                    r.setWinner(p.getUsername());
                    out.put("event", "WIN");
                    out.put("winner", p.getUsername());
                } else {
                    r.advanceTurn();
                    out.put("nextPlayer", r.getCurrentUsername());
                }
            }
            default -> throw new IllegalArgumentException("Pig actions: roll | hold");
        }
        return out;
    }

    // ==================== FARKLE ====================

    private void initFarkle(DiceRoom r) {
        r.getGameState().put("turnScore", 0);
        r.getGameState().put("currentRoll", new ArrayList<Integer>());
        r.getGameState().put("remainingDice", 6);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> handleFarkleAction(DiceRoom r, DiceActionRequest req) {
        requireTurn(r, req.getUsername());
        DicePlayer p = r.getPlayers().get(req.getUsername());
        Map<String, Object> gs = r.getGameState();
        int turnScore = (int) gs.getOrDefault("turnScore", 0);
        List<Integer> currentRoll = (List<Integer>) gs.getOrDefault("currentRoll", new ArrayList<Integer>());
        int remaining = (int) gs.getOrDefault("remainingDice", 6);
        boolean awaitingKeep = !currentRoll.isEmpty();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("player", req.getUsername());
        String act = req.getAction().toLowerCase();

        switch (act) {
            case "roll" -> {
                if (awaitingKeep)
                    throw new IllegalStateException("Must 'keep' scoring dice before rolling again");
                List<Integer> roll = new ArrayList<>();
                for (int i = 0; i < remaining; i++) roll.add(roll1to6());
                gs.put("currentRoll", roll);
                out.put("rolled", roll);
                if (!anyScoringPossible(roll)) {
                    out.put("event", "FARKLE");
                    out.put("turnScoreLost", turnScore);
                    gs.put("turnScore", 0);
                    gs.put("currentRoll", new ArrayList<Integer>());
                    gs.put("remainingDice", 6);
                    r.advanceTurn();
                    out.put("nextPlayer", r.getCurrentUsername());
                } else {
                    out.put("event", "ROLL_OK");
                    out.put("turnScore", turnScore);
                    out.put("remainingDice", remaining);
                }
            }
            case "keep" -> {
                if (!awaitingKeep) throw new IllegalStateException("Roll first");
                List<Integer> indices = req.getIndices();
                if (indices == null || indices.isEmpty())
                    throw new IllegalArgumentException("indices required");
                Set<Integer> seen = new HashSet<>();
                List<Integer> kept = new ArrayList<>();
                for (Integer i : indices) {
                    if (i == null || i < 0 || i >= currentRoll.size() || !seen.add(i))
                        throw new IllegalArgumentException("Invalid index: " + i);
                    kept.add(currentRoll.get(i));
                }
                int s = scoreFarkleSelection(kept);
                if (s <= 0)
                    throw new IllegalArgumentException("Selected dice don't form a valid scoring combination");

                int newTurnScore = turnScore + s;
                int newRemaining = remaining - kept.size();
                boolean hot = false;
                if (newRemaining == 0) { newRemaining = 6; hot = true; }
                gs.put("turnScore", newTurnScore);
                gs.put("remainingDice", newRemaining);
                gs.put("currentRoll", new ArrayList<Integer>());

                out.put("event", hot ? "HOT_DICE" : "KEPT");
                out.put("kept", kept);
                out.put("scored", s);
                out.put("turnScore", newTurnScore);
                out.put("remainingDice", newRemaining);
            }
            case "bank" -> {
                if (awaitingKeep)
                    throw new IllegalStateException("Must keep before banking");
                if (turnScore <= 0)
                    throw new IllegalStateException("Nothing to bank");
                p.setScore(p.getScore() + turnScore);
                out.put("event", "BANKED");
                out.put("banked", turnScore);
                out.put("totalScore", p.getScore());
                gs.put("turnScore", 0);
                gs.put("remainingDice", 6);
                gs.put("currentRoll", new ArrayList<Integer>());
                if (p.getScore() >= r.getTargetScore()) {
                    r.setStatus(DiceRoom.Status.FINISHED);
                    r.setWinner(p.getUsername());
                    out.put("event", "WIN");
                    out.put("winner", p.getUsername());
                } else {
                    r.advanceTurn();
                    out.put("nextPlayer", r.getCurrentUsername());
                }
            }
            default -> throw new IllegalArgumentException("Farkle actions: roll | keep | bank");
        }
        return out;
    }

    /**
     * Score a chosen subset of dice. Returns -1 if any selected die doesn't
     * participate in a scoring combination.
     */
    private int scoreFarkleSelection(List<Integer> dice) {
        int n = dice.size();
        int[] c = new int[7];
        for (int d : dice) c[d]++;
        if (n == 6) {
            boolean straight = true;
            for (int i = 1; i <= 6; i++) if (c[i] != 1) { straight = false; break; }
            if (straight) return 1500;
            int pairs = 0;
            for (int i = 1; i <= 6; i++) if (c[i] == 2) pairs++;
            if (pairs == 3) return 1500;
        }
        int score = 0;
        for (int face = 1; face <= 6; face++) {
            int cnt = c[face];
            if (cnt == 0) continue;
            if (cnt >= 3) {
                int base = (face == 1) ? 1000 : face * 100;
                score += base * (cnt - 2);
            } else {
                if (face == 1) score += cnt * 100;
                else if (face == 5) score += cnt * 50;
                else return -1;
            }
        }
        return score;
    }

    private boolean anyScoringPossible(List<Integer> roll) {
        int[] c = new int[7];
        for (int d : roll) c[d]++;
        if (c[1] > 0 || c[5] > 0) return true;
        for (int i = 2; i <= 6; i++) if (i != 5 && c[i] >= 3) return true;
        if (roll.size() == 6) {
            boolean straight = true;
            for (int i = 1; i <= 6; i++) if (c[i] != 1) { straight = false; break; }
            if (straight) return true;
            int pairs = 0;
            for (int i = 1; i <= 6; i++) if (c[i] == 2) pairs++;
            if (pairs == 3) return true;
        }
        return false;
    }

    // ==================== LIAR'S DICE ====================

    private void initLiarsDice(DiceRoom r) {
        int diceEach = 5;
        for (DicePlayer p : r.getPlayers().values()) {
            p.setDiceCount(diceEach);
            p.setHand(rollHand(diceEach));
        }
        r.getGameState().put("currentBidQty", 0);
        r.getGameState().put("currentBidFace", 0);
        r.getGameState().put("currentBidder", null);
        r.getGameState().put("round", 1);
    }

    private List<Integer> rollHand(int n) {
        List<Integer> h = new ArrayList<>();
        for (int i = 0; i < n; i++) h.add(roll1to6());
        return h;
    }

    private Map<String, Object> handleLiarsDiceAction(DiceRoom r, DiceActionRequest req) {
        requireTurn(r, req.getUsername());
        Map<String, Object> gs = r.getGameState();
        int curQty = (int) gs.getOrDefault("currentBidQty", 0);
        int curFace = (int) gs.getOrDefault("currentBidFace", 0);
        String curBidder = (String) gs.get("currentBidder");

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("player", req.getUsername());
        String act = req.getAction().toLowerCase();

        switch (act) {
            case "bid" -> {
                Integer qty = req.getQuantity();
                Integer face = req.getFaceValue();
                if (qty == null || face == null)
                    throw new IllegalArgumentException("bid requires quantity and faceValue");
                if (face < 1 || face > 6) throw new IllegalArgumentException("faceValue 1-6");
                if (qty <= 0) throw new IllegalArgumentException("quantity must be > 0");
                if (curQty > 0 && !(qty > curQty || (qty == curQty && face > curFace)))
                    throw new IllegalArgumentException("Bid must increase quantity or face value");

                gs.put("currentBidQty", qty);
                gs.put("currentBidFace", face);
                gs.put("currentBidder", req.getUsername());
                out.put("event", "BID");
                out.put("bidder", req.getUsername());
                out.put("quantity", qty);
                out.put("faceValue", face);
                r.advanceTurn();
                out.put("nextPlayer", r.getCurrentUsername());
            }
            case "challenge" -> {
                if (curBidder == null) throw new IllegalStateException("No bid to challenge");
                Map<String, List<Integer>> hands = new LinkedHashMap<>();
                int total = 0;
                for (DicePlayer p : r.getPlayers().values()) {
                    if (p.isEliminated()) continue;
                    hands.put(p.getUsername(), new ArrayList<>(p.getHand()));
                    for (int d : p.getHand()) if (d == curFace) total++;
                }
                boolean bidderWasRight = total >= curQty;
                String loser = bidderWasRight ? req.getUsername() : curBidder;
                DicePlayer loserPlayer = r.getPlayers().get(loser);
                loserPlayer.setDiceCount(loserPlayer.getDiceCount() - 1);
                if (loserPlayer.getDiceCount() <= 0) loserPlayer.setEliminated(true);

                out.put("event", "CHALLENGE");
                out.put("bidder", curBidder);
                out.put("challenger", req.getUsername());
                out.put("bidQty", curQty);
                out.put("bidFace", curFace);
                out.put("totalActual", total);
                out.put("bidderWasRight", bidderWasRight);
                out.put("loser", loser);
                out.put("loserNewDiceCount", loserPlayer.getDiceCount());
                out.put("hands", hands);

                long alive = r.getPlayers().values().stream().filter(p -> !p.isEliminated()).count();
                if (alive <= 1) {
                    DicePlayer w = r.getPlayers().values().stream()
                            .filter(p -> !p.isEliminated()).findFirst().orElse(null);
                    r.setStatus(DiceRoom.Status.FINISHED);
                    r.setWinner(w == null ? null : w.getUsername());
                    out.put("event", "WIN");
                    out.put("winner", r.getWinner());
                } else {
                    for (DicePlayer p : r.getPlayers().values()) {
                        if (!p.isEliminated()) p.setHand(rollHand(p.getDiceCount()));
                    }
                    gs.put("currentBidQty", 0);
                    gs.put("currentBidFace", 0);
                    gs.put("currentBidder", null);
                    gs.put("round", (int) gs.getOrDefault("round", 1) + 1);

                    String startNext = loserPlayer.isEliminated() ? curBidder : loser;
                    int idx = r.getTurnOrder().indexOf(startNext);
                    if (idx >= 0) r.setCurrentTurnIndex(idx);
                    if (r.getCurrentPlayer() != null && r.getCurrentPlayer().isEliminated()) r.advanceTurn();
                    out.put("nextPlayer", r.getCurrentUsername());
                }
            }
            default -> throw new IllegalArgumentException("Liar's Dice actions: bid | challenge");
        }
        return out;
    }

    // ==================== SHIP CAPTAIN CREW ====================

    private void initShipCaptainCrew(DiceRoom r) {
        r.getGameState().put("turnState", freshScCcTurn());
        r.getGameState().put("turnsPlayed", 0);
    }

    private Map<String, Object> freshScCcTurn() {
        Map<String, Object> ts = new LinkedHashMap<>();
        ts.put("rollsLeft", 3);
        ts.put("hasShip", false);
        ts.put("hasCaptain", false);
        ts.put("hasCrew", false);
        ts.put("locked", new ArrayList<Integer>());
        ts.put("remaining", new ArrayList<Integer>());
        return ts;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> handleShipCaptainCrewAction(DiceRoom r, DiceActionRequest req) {
        requireTurn(r, req.getUsername());
        DicePlayer p = r.getPlayers().get(req.getUsername());
        Map<String, Object> gs = r.getGameState();
        Map<String, Object> ts = (Map<String, Object>) gs.get("turnState");
        if (ts == null) { ts = freshScCcTurn(); gs.put("turnState", ts); }

        int rollsLeft = (int) ts.get("rollsLeft");
        boolean hasShip = (boolean) ts.get("hasShip");
        boolean hasCaptain = (boolean) ts.get("hasCaptain");
        boolean hasCrew = (boolean) ts.get("hasCrew");
        List<Integer> locked = (List<Integer>) ts.get("locked");

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("player", req.getUsername());
        String act = req.getAction().toLowerCase();

        if ("roll".equals(act)) {
            if (rollsLeft <= 0) throw new IllegalStateException("No rolls left, call 'stop'");
            int diceToRoll = 5 - locked.size();
            List<Integer> roll = new ArrayList<>();
            for (int i = 0; i < diceToRoll; i++) roll.add(roll1to6());
            List<Integer> available = new ArrayList<>(roll);

            if (!hasShip) {
                int idx = available.indexOf(6);
                if (idx >= 0) { available.remove(idx); locked.add(6); hasShip = true; }
            }
            if (hasShip && !hasCaptain) {
                int idx = available.indexOf(5);
                if (idx >= 0) { available.remove(idx); locked.add(5); hasCaptain = true; }
            }
            if (hasShip && hasCaptain && !hasCrew) {
                int idx = available.indexOf(4);
                if (idx >= 0) { available.remove(idx); locked.add(4); hasCrew = true; }
            }
            rollsLeft--;
            ts.put("rollsLeft", rollsLeft);
            ts.put("hasShip", hasShip);
            ts.put("hasCaptain", hasCaptain);
            ts.put("hasCrew", hasCrew);
            ts.put("locked", locked);
            ts.put("remaining", available);

            out.put("event", "ROLL_OK");
            out.put("rolled", roll);
            out.put("locked", new ArrayList<>(locked));
            out.put("remaining", available);
            out.put("rollsLeft", rollsLeft);
            out.put("hasShip", hasShip);
            out.put("hasCaptain", hasCaptain);
            out.put("hasCrew", hasCrew);

            if (rollsLeft == 0) endShipTurn(r, p, ts, out);
        } else if ("stop".equals(act)) {
            endShipTurn(r, p, ts, out);
        } else {
            throw new IllegalArgumentException("Ship/Captain/Crew actions: roll | stop");
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private void endShipTurn(DiceRoom r, DicePlayer p, Map<String, Object> ts, Map<String, Object> out) {
        boolean hasShip = (boolean) ts.get("hasShip");
        boolean hasCaptain = (boolean) ts.get("hasCaptain");
        boolean hasCrew = (boolean) ts.get("hasCrew");
        int cargo = 0;
        if (hasShip && hasCaptain && hasCrew) {
            for (int d : (List<Integer>) ts.getOrDefault("remaining", new ArrayList<>())) cargo += d;
        }
        p.setScore(p.getScore() + cargo);
        out.put("turnEnded", true);
        out.put("cargo", cargo);
        out.put("totalScore", p.getScore());

        Map<String, Object> gs = r.getGameState();
        gs.put("turnState", freshScCcTurn());
        int turnsPlayed = (int) gs.getOrDefault("turnsPlayed", 0) + 1;
        gs.put("turnsPlayed", turnsPlayed);

        if (turnsPlayed >= r.getPlayers().size()) {
            String winner = null;
            int max = -1;
            for (DicePlayer pl : r.getPlayers().values()) {
                if (pl.getScore() > max) { max = pl.getScore(); winner = pl.getUsername(); }
            }
            r.setStatus(DiceRoom.Status.FINISHED);
            r.setWinner(winner);
            out.put("event", "WIN");
            out.put("winner", winner);
        } else {
            r.advanceTurn();
            out.put("nextPlayer", r.getCurrentUsername());
        }
    }

    // ==================== HELPERS ====================

    private void requireTurn(DiceRoom r, String username) {
        if (!username.equals(r.getCurrentUsername()))
            throw new IllegalStateException("Not your turn (current: " + r.getCurrentUsername() + ")");
    }

    private int roll1to6() {
        return ThreadLocalRandom.current().nextInt(1, 7);
    }

    private int defaultTarget(DiceGameType t) {
        return switch (t) {
            case PIG -> 100;
            case FARKLE -> 10000;
            case LIARS_DICE -> 0;
            case SHIP_CAPTAIN_CREW -> 0;
        };
    }
}
