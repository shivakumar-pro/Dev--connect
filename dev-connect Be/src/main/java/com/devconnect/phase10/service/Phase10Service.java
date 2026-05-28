package com.devconnect.phase10.service;

import com.devconnect.phase10.dto.Phase10Event;
import com.devconnect.phase10.engine.Phase10Bot;
import com.devconnect.phase10.engine.Phase10Engine;
import com.devconnect.phase10.model.*;
import com.devconnect.phase10.model.PhaseDefinition.GroupType;
import com.devconnect.phase10.repository.Phase10StatsRepository;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.*;
import java.util.stream.Collectors;

/**
 * Orchestrates real-time multiplayer Phase 10 (2-6 players, optional bots).
 *
 * Turn cycle: DRAW (pile or discard) -> optional lay phase / hit melds -> DISCARD.
 * Round ends when a player empties their hand; the game ends when someone completes
 * phase 10. State is in-memory; per-user stats are DB-persisted at game end.
 *
 * All mutating operations synchronize on the room to keep WS handler threads and the
 * scheduler (timers, bot moves) from racing on shared state.
 */
@Slf4j
@Service
public class Phase10Service {

    private static final int HAND_SIZE = 10;
    private static final long BOT_MOVE_DELAY_MS = 1300;
    private static final long ROUND_RESULT_DELAY_MS = 6500;

    private final SimpMessagingTemplate messagingTemplate;
    private final Phase10Engine engine;
    private final Phase10Bot bot;
    private final Phase10StatsRepository statsRepository;

    private final Map<String, Phase10Room> rooms = new ConcurrentHashMap<>();
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(4);

    public Phase10Service(SimpMessagingTemplate messagingTemplate, Phase10Engine engine,
                          Phase10Bot bot, Phase10StatsRepository statsRepository) {
        this.messagingTemplate = messagingTemplate;
        this.engine = engine;
        this.bot = bot;
        this.statsRepository = statsRepository;
    }

    @PreDestroy
    public void shutdown() {
        scheduler.shutdownNow();
    }

    // ==================== ROOM MANAGEMENT ====================

    public Phase10Room createRoom(String host, Integer maxPlayers, Integer turnTimerSeconds, Boolean botsEnabled) {
        String roomId = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        Phase10Room room = new Phase10Room(roomId, host);
        if (maxPlayers != null) room.setMaxPlayers(Math.max(2, Math.min(6, maxPlayers)));
        if (turnTimerSeconds != null) room.setTurnTimerSeconds(Math.max(15, Math.min(120, turnTimerSeconds)));
        if (botsEnabled != null) room.setBotsEnabled(botsEnabled);
        room.getPlayers().put(host, new Phase10Player(host, false));
        rooms.put(roomId, room);
        log.info("Phase10 room created: id={}, host='{}', bots={}", roomId, host, room.isBotsEnabled());
        return room;
    }

    public Phase10Room getRoom(String roomId) {
        return rooms.get(roomId);
    }

    public Map<String, Object> getPublicState(String roomId) {
        Phase10Room room = rooms.get(roomId);
        return room == null ? null : publicState(room);
    }

    public List<Map<String, Object>> listRooms() {
        return rooms.values().stream()
                .filter(r -> r.getStatus() == Phase10Room.Status.WAITING)
                .map(r -> {
                    Map<String, Object> info = new LinkedHashMap<>();
                    info.put("roomId", r.getRoomId());
                    info.put("hostUsername", r.getHostUsername());
                    info.put("players", r.getPlayers().size());
                    info.put("maxPlayers", r.getMaxPlayers());
                    info.put("botsEnabled", r.isBotsEnabled());
                    info.put("turnTimerSeconds", r.getTurnTimerSeconds());
                    return info;
                })
                .collect(Collectors.toList());
    }

    // ==================== JOIN / LEAVE ====================

    public void joinRoom(String roomId, String username) {
        Phase10Room room = rooms.get(roomId);
        if (room == null) { sendError(username, "Room not found"); return; }
        synchronized (room) {
            Phase10Player existing = room.getPlayer(username);
            if (existing != null) {
                existing.setConnected(true);
                sendToRoom(roomId, base(room, Phase10Event.Type.PLAYER_JOINED)
                        .player(username).message(username + " reconnected").build());
                sendHand(room, existing);
                broadcastState(room);
                return;
            }
            if (room.getStatus() != Phase10Room.Status.WAITING) { sendError(username, "Game already started"); return; }
            if (room.isFull()) { sendError(username, "Room is full"); return; }

            room.getPlayers().put(username, new Phase10Player(username, false));
            sendToRoom(roomId, base(room, Phase10Event.Type.PLAYER_JOINED)
                    .player(username)
                    .message(username + " joined (" + room.getPlayers().size() + "/" + room.getMaxPlayers() + ")")
                    .build());
            broadcastState(room);
        }
    }

    public void leaveRoom(String roomId, String username) {
        Phase10Room room = rooms.get(roomId);
        if (room == null) return;
        synchronized (room) {
            Phase10Player player = room.getPlayer(username);
            if (player == null) return;

            if (room.getStatus() == Phase10Room.Status.WAITING) {
                room.getPlayers().remove(username);
                if (allBotsOrEmpty(room)) { disposeRoom(room); return; }
                if (username.equals(room.getHostUsername())) reassignHost(room);
                sendToRoom(roomId, base(room, Phase10Event.Type.PLAYER_LEFT)
                        .player(username).message(username + " left").build());
                broadcastState(room);
                return;
            }

            // Mid-game: keep the seat but auto-play it like a bot so the game can continue.
            player.setConnected(false);
            sendToRoom(roomId, base(room, Phase10Event.Type.PLAYER_LEFT)
                    .player(username).message(username + " disconnected — auto-playing").build());

            if (noConnectedHumans(room)) { disposeRoom(room); return; }
            if (username.equals(room.getHostUsername())) reassignHost(room);
            broadcastState(room);

            // If it's their turn right now, kick off the auto move.
            if (room.getStatus() == Phase10Room.Status.PLAYING
                    && username.equals(room.getCurrentPlayerName())) {
                scheduleAutoTurn(room, room.getTurnToken(), BOT_MOVE_DELAY_MS);
            }
        }
    }

    public void addBot(String roomId, String requester) {
        Phase10Room room = rooms.get(roomId);
        if (room == null) { sendError(requester, "Room not found"); return; }
        synchronized (room) {
            if (!requester.equals(room.getHostUsername())) { sendError(requester, "Only the host can add bots"); return; }
            if (!room.isBotsEnabled()) { sendError(requester, "Bots are disabled for this room"); return; }
            if (room.getStatus() != Phase10Room.Status.WAITING) { sendError(requester, "Game already started"); return; }
            if (room.isFull()) { sendError(requester, "Room is full"); return; }

            int n = (int) room.getPlayers().values().stream().filter(Phase10Player::isBot).count() + 1;
            String botName = "Bot " + n;
            while (room.getPlayers().containsKey(botName)) botName = "Bot " + (++n);
            room.getPlayers().put(botName, new Phase10Player(botName, true));
            sendToRoom(roomId, base(room, Phase10Event.Type.BOT_ADDED)
                    .player(botName).message(botName + " was added").build());
            broadcastState(room);
        }
    }

    public void removeBot(String roomId, String requester, String botName) {
        Phase10Room room = rooms.get(roomId);
        if (room == null) return;
        synchronized (room) {
            if (!requester.equals(room.getHostUsername())) { sendError(requester, "Only the host can remove bots"); return; }
            if (room.getStatus() != Phase10Room.Status.WAITING) return;
            Phase10Player p = room.getPlayer(botName);
            if (p != null && p.isBot()) {
                room.getPlayers().remove(botName);
                sendToRoom(roomId, base(room, Phase10Event.Type.PLAYER_LEFT)
                        .player(botName).message(botName + " removed").build());
                broadcastState(room);
            }
        }
    }

    // ==================== START / ROUND ====================

    public void startGame(String roomId, String username) {
        Phase10Room room = rooms.get(roomId);
        if (room == null) { sendError(username, "Room not found"); return; }
        synchronized (room) {
            if (!username.equals(room.getHostUsername())) { sendError(username, "Only the host can start"); return; }
            if (room.getStatus() != Phase10Room.Status.WAITING) { sendError(username, "Already started"); return; }
            if (!room.hasEnoughPlayers()) { sendError(username, "Need at least " + room.getMinPlayers() + " players"); return; }

            room.setStatus(Phase10Room.Status.PLAYING);
            room.setTurnOrder(new ArrayList<>(room.getPlayers().keySet()));
            room.setRoundNumber(0);
            for (Phase10Player p : room.getPlayers().values()) { p.setCurrentPhase(1); p.setTotalScore(0); }
            sendToRoom(roomId, base(room, Phase10Event.Type.GAME_STARTED)
                    .message("Game started!").build());
            startRound(room);
        }
    }

    private void startRound(Phase10Room room) {
        room.setRoundNumber(room.getRoundNumber() + 1);
        room.setStatus(Phase10Room.Status.PLAYING);
        room.getTable().clear();
        room.getDiscardPile().clear();
        for (Phase10Player p : room.getPlayers().values()) p.resetForRound();

        // Deal
        List<Card> deck = engine.buildDeck();
        engine.shuffle(deck);
        for (int i = 0; i < HAND_SIZE; i++) {
            for (Phase10Player p : room.getPlayers().values()) {
                p.getHand().add(deck.remove(deck.size() - 1));
            }
        }
        room.setDrawPile(new ArrayList<>(deck));

        // Flip the first up-card (never start the discard pile with a Skip)
        Card up = room.getDrawPile().remove(room.getDrawPile().size() - 1);
        while (up.isSkip() && !room.getDrawPile().isEmpty()) {
            room.getDrawPile().add(0, up);
            up = room.getDrawPile().remove(room.getDrawPile().size() - 1);
        }
        room.getDiscardPile().add(up);

        // Rotate who starts each round
        int n = room.getTurnOrder().size();
        room.setCurrentTurnIndex(((room.getRoundNumber() - 1) % n));

        sendToRoom(room.getRoomId(), base(room, Phase10Event.Type.ROUND_STARTED)
                .message("Round " + room.getRoundNumber() + " — deal!").build());
        for (Phase10Player p : room.getPlayers().values()) sendHand(room, p);

        beginTurn(room);
    }

    private void beginTurn(Phase10Room room) {
        // Skip over any players holding a Skip penalty.
        int guard = 0, max = room.getTurnOrder().size() * 2 + 2;
        while (guard++ < max) {
            Phase10Player cur = room.getCurrentPlayer();
            if (cur == null) return;
            if (cur.isSkipNext()) {
                cur.setSkipNext(false);
                sendToRoom(room.getRoomId(), base(room, Phase10Event.Type.SKIP_APPLIED)
                        .player(cur.getUsername()).target(cur.getUsername())
                        .message(cur.getUsername() + "'s turn was skipped").build());
                room.setCurrentTurnIndex(room.getCurrentTurnIndex() + 1);
                continue;
            }
            break;
        }

        Phase10Player cur = room.getCurrentPlayer();
        if (cur == null) return;
        room.setTurnPhase(Phase10Room.TurnPhase.DRAW);
        room.setTurnToken(room.getTurnToken() + 1);
        long token = room.getTurnToken();

        sendToRoom(room.getRoomId(), base(room, Phase10Event.Type.TURN_START)
                .player(cur.getUsername())
                .currentTurn(cur.getUsername())
                .turnPhase(room.getTurnPhase().name())
                .turnTimerSeconds(room.getTurnTimerSeconds())
                .message(cur.getUsername() + "'s turn").build());
        broadcastState(room);

        startTurnTimer(room, token);
        if (cur.isBot() || !cur.isConnected()) scheduleAutoTurn(room, token, BOT_MOVE_DELAY_MS);
    }

    private void advanceTurn(Phase10Room room) {
        room.setCurrentTurnIndex(room.getCurrentTurnIndex() + 1);
        beginTurn(room);
    }

    // ==================== PLAYER ACTIONS (validated entry points) ====================

    public void draw(String roomId, String username, boolean fromDiscard) {
        Phase10Room room = rooms.get(roomId);
        if (room == null) { sendError(username, "Room not found"); return; }
        synchronized (room) {
            if (!validTurn(room, username, Phase10Room.TurnPhase.DRAW)) return;
            doDraw(room, room.getPlayer(username), fromDiscard);
        }
    }

    public void layPhase(String roomId, String username, List<List<String>> groups) {
        Phase10Room room = rooms.get(roomId);
        if (room == null) { sendError(username, "Room not found"); return; }
        synchronized (room) {
            if (!validTurn(room, username, Phase10Room.TurnPhase.ACTION)) return;
            doLayPhase(room, room.getPlayer(username), groups);
        }
    }

    public void hit(String roomId, String username, String meldId, String cardId, String runEnd) {
        Phase10Room room = rooms.get(roomId);
        if (room == null) { sendError(username, "Room not found"); return; }
        synchronized (room) {
            if (!validTurn(room, username, Phase10Room.TurnPhase.ACTION)) return;
            doHit(room, room.getPlayer(username), meldId, cardId, parseEnd(runEnd));
        }
    }

    public void discard(String roomId, String username, String cardId, String skipTarget) {
        Phase10Room room = rooms.get(roomId);
        if (room == null) { sendError(username, "Room not found"); return; }
        synchronized (room) {
            if (!validTurn(room, username, Phase10Room.TurnPhase.ACTION)) return;
            doDiscard(room, room.getPlayer(username), cardId, skipTarget);
        }
    }

    private boolean validTurn(Phase10Room room, String username, Phase10Room.TurnPhase expected) {
        if (room.getStatus() != Phase10Room.Status.PLAYING) { sendError(username, "Game not in progress"); return false; }
        if (!username.equals(room.getCurrentPlayerName())) { sendError(username, "It's not your turn"); return false; }
        if (room.getTurnPhase() != expected) {
            sendError(username, expected == Phase10Room.TurnPhase.DRAW ? "You already drew" : "Draw a card first");
            return false;
        }
        return true;
    }

    // ==================== ACTION IMPLEMENTATIONS ====================

    private void doDraw(Phase10Room room, Phase10Player player, boolean fromDiscard) {
        Card drawn;
        String source;
        if (fromDiscard) {
            Card top = room.discardTop();
            if (top == null) { sendError(player.getUsername(), "Discard pile is empty"); return; }
            if (top.isSkip()) { sendError(player.getUsername(), "You can't take a Skip from the discard pile"); return; }
            room.getDiscardPile().remove(room.getDiscardPile().size() - 1);
            drawn = top;
            source = "DISCARD";
        } else {
            drawn = drawFromPile(room);
            if (drawn == null) { sendError(player.getUsername(), "No cards left to draw"); return; }
            source = "DRAW";
        }
        player.getHand().add(drawn);
        room.setTurnPhase(Phase10Room.TurnPhase.ACTION);

        // Public draw event never reveals which card was taken (the drawer gets it via HAND).
        sendToRoom(room.getRoomId(), base(room, Phase10Event.Type.CARD_DRAWN)
                .player(player.getUsername())
                .source(source)
                .build());
        sendHand(room, player);
        broadcastState(room);
    }

    private Card drawFromPile(Phase10Room room) {
        if (room.getDrawPile().isEmpty()) {
            // Reshuffle the discard pile (keep the top card) back into the draw pile.
            if (room.getDiscardPile().size() <= 1) return null;
            Card top = room.getDiscardPile().remove(room.getDiscardPile().size() - 1);
            List<Card> recycled = new ArrayList<>(room.getDiscardPile());
            room.getDiscardPile().clear();
            room.getDiscardPile().add(top);
            engine.shuffle(recycled);
            room.setDrawPile(recycled);
        }
        return room.getDrawPile().remove(room.getDrawPile().size() - 1);
    }

    private void doLayPhase(Phase10Room room, Phase10Player player, List<List<String>> groups) {
        if (player.isPhaseCompletedThisRound()) { sendError(player.getUsername(), "You already laid your phase this round"); return; }
        if (groups == null || groups.isEmpty()) { sendError(player.getUsername(), "Select cards to lay down"); return; }

        // Resolve card ids -> cards from hand (must be unique & owned)
        List<List<Card>> cardGroups = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (List<String> g : groups) {
            List<Card> cg = new ArrayList<>();
            for (String id : g) {
                if (!seen.add(id)) { sendError(player.getUsername(), "Duplicate card in lay-down"); return; }
                Card c = player.findCard(id);
                if (c == null) { sendError(player.getUsername(), "Card not in your hand"); return; }
                cg.add(c);
            }
            cardGroups.add(cg);
        }

        Phase10Engine.LayResult result = engine.validatePhase(cardGroups, player.getCurrentPhase(), player.getUsername());
        if (!result.ok) { sendError(player.getUsername(), result.error); return; }

        // Commit
        for (List<Card> g : cardGroups) player.getHand().removeAll(g);
        room.getTable().addAll(result.melds);
        player.setPhaseCompletedThisRound(true);

        sendToRoom(room.getRoomId(), base(room, Phase10Event.Type.PHASE_LAID)
                .player(player.getUsername())
                .melds(result.melds)
                .message(player.getUsername() + " completed Phase " + player.getCurrentPhase()
                        + " (" + PhaseDefinition.description(player.getCurrentPhase()) + ")")
                .build());
        sendHand(room, player);
        broadcastState(room);

        if (player.getHand().isEmpty()) endRound(room, player.getUsername());
    }

    private void doHit(Phase10Room room, Phase10Player player, String meldId, String cardId, Phase10Engine.RunEnd end) {
        if (!player.isPhaseCompletedThisRound()) { sendError(player.getUsername(), "Lay your phase before hitting"); return; }
        Meld meld = room.findMeld(meldId);
        if (meld == null) { sendError(player.getUsername(), "Meld not found"); return; }
        Card card = player.findCard(cardId);
        if (card == null) { sendError(player.getUsername(), "Card not in your hand"); return; }

        if (!engine.applyHit(meld, card, end)) {
            sendError(player.getUsername(), "That card can't be added there");
            return;
        }
        player.getHand().remove(card);

        sendToRoom(room.getRoomId(), base(room, Phase10Event.Type.HIT)
                .player(player.getUsername())
                .meldId(meldId)
                .card(card)
                .message(player.getUsername() + " added a card").build());
        sendHand(room, player);
        broadcastState(room);

        if (player.getHand().isEmpty()) endRound(room, player.getUsername());
    }

    private void doDiscard(Phase10Room room, Phase10Player player, String cardId, String skipTarget) {
        Card card = player.findCard(cardId);
        if (card == null) { sendError(player.getUsername(), "Card not in your hand"); return; }

        // A player can only empty their hand if they have laid their phase.
        if (player.getHand().size() == 1 && !player.isPhaseCompletedThisRound()) {
            sendError(player.getUsername(), "You must complete your phase before going out");
            return;
        }

        String appliedSkipTarget = null;
        if (card.isSkip()) {
            appliedSkipTarget = resolveSkipTarget(room, player, skipTarget);
            if (appliedSkipTarget == null) { sendError(player.getUsername(), "Choose a player to skip"); return; }
        }

        player.getHand().remove(card);
        room.getDiscardPile().add(card);
        room.cancelTimer();

        sendToRoom(room.getRoomId(), base(room, Phase10Event.Type.CARD_DISCARDED)
                .player(player.getUsername())
                .card(card)
                .discardTop(card).build());
        sendHand(room, player);

        if (appliedSkipTarget != null) {
            room.getPlayer(appliedSkipTarget).setSkipNext(true);
            sendToRoom(room.getRoomId(), base(room, Phase10Event.Type.SKIP_APPLIED)
                    .player(player.getUsername())
                    .target(appliedSkipTarget)
                    .message(player.getUsername() + " skipped " + appliedSkipTarget).build());
        }

        if (player.getHand().isEmpty()) {
            endRound(room, player.getUsername());
        } else {
            broadcastState(room);
            advanceTurn(room);
        }
    }

    private String resolveSkipTarget(Phase10Room room, Phase10Player self, String requested) {
        if (requested != null && !requested.equals(self.getUsername())) {
            Phase10Player t = room.getPlayer(requested);
            if (t != null) return requested;
        }
        // Fallback: first other player who isn't already skipped.
        for (String name : room.getTurnOrder()) {
            if (name.equals(self.getUsername())) continue;
            Phase10Player p = room.getPlayer(name);
            if (p != null && !p.isSkipNext()) return name;
        }
        return null;
    }

    // ==================== AUTO / BOT TURN ====================

    private void scheduleAutoTurn(Phase10Room room, long token, long delayMs) {
        scheduler.schedule(() -> {
            try { executeAutoTurn(room, token); }
            catch (Exception e) { log.error("Auto turn failed in room {}", room.getRoomId(), e); }
        }, delayMs, TimeUnit.MILLISECONDS);
    }

    private void startTurnTimer(Phase10Room room, long token) {
        room.cancelTimer();
        room.setTurnTimer(scheduler.schedule(() -> {
            try { executeAutoTurn(room, token); }
            catch (Exception e) { log.error("Turn timeout failed in room {}", room.getRoomId(), e); }
        }, room.getTurnTimerSeconds(), TimeUnit.SECONDS));
    }

    /** Plays a full turn automatically — used for bots, disconnects, and turn timeouts. */
    private void executeAutoTurn(Phase10Room room, long token) {
        synchronized (room) {
            if (room.getTurnToken() != token) return;            // stale
            if (room.getStatus() != Phase10Room.Status.PLAYING) return;
            Phase10Player player = room.getCurrentPlayer();
            if (player == null) return;

            if (room.getTurnPhase() == Phase10Room.TurnPhase.DRAW) {
                boolean fromDiscard = bot.wantsDiscardCard(player, room.discardTop());
                doDraw(room, player, fromDiscard);
            }
            if (room.getStatus() != Phase10Room.Status.PLAYING || room.getTurnToken() != token) return;

            Phase10Bot.BotMove move = bot.planTurn(room, player);
            if (move.layGroups != null) {
                doLayPhase(room, player, move.layGroups);
            }
            if (room.getStatus() == Phase10Room.Status.PLAYING && room.getTurnToken() == token) {
                for (Phase10Bot.HitPlan h : move.hits) {
                    if (room.getStatus() != Phase10Room.Status.PLAYING) break;
                    doHit(room, player, h.meldId, h.cardId, h.end);
                }
            }
            if (room.getStatus() == Phase10Room.Status.PLAYING && room.getTurnToken() == token) {
                String discardId = move.discardCardId;
                if (discardId == null && !player.getHand().isEmpty()) discardId = player.getHand().get(0).getId();
                if (discardId != null) doDiscard(room, player, discardId, move.skipTarget);
            }
        }
    }

    // ==================== ROUND / GAME END ====================

    private void endRound(Phase10Room room, String outPlayer) {
        room.setStatus(Phase10Room.Status.ROUND_RESULT);
        room.cancelTimer();

        List<Map<String, Object>> results = new ArrayList<>();
        boolean gameOver = false;
        for (String name : room.getTurnOrder()) {
            Phase10Player p = room.getPlayer(name);
            if (p == null) continue;
            int before = p.getCurrentPhase();
            int roundScore = name.equals(outPlayer) ? 0 : engine.handScore(p.getHand());
            p.setLastRoundScore(roundScore);
            p.setTotalScore(p.getTotalScore() + roundScore);

            boolean completed = p.isPhaseCompletedThisRound();
            if (completed) { p.setCurrentPhase(before + 1); p.setAdvancedLastRound(true); }
            else p.setAdvancedLastRound(false);
            if (p.getCurrentPhase() > PhaseDefinition.MAX_PHASE) gameOver = true;

            Map<String, Object> r = new LinkedHashMap<>();
            r.put("username", name);
            r.put("bot", p.isBot());
            r.put("phaseBefore", before);
            r.put("completed", completed);
            r.put("phaseAfter", Math.min(p.getCurrentPhase(), PhaseDefinition.MAX_PHASE));
            r.put("finishedAll", p.getCurrentPhase() > PhaseDefinition.MAX_PHASE);
            r.put("roundScore", roundScore);
            r.put("totalScore", p.getTotalScore());
            results.add(r);
        }

        sendToRoom(room.getRoomId(), base(room, Phase10Event.Type.ROUND_RESULT)
                .player(outPlayer)
                .standings(results)
                .message(outPlayer + " went out!")
                .build());
        broadcastState(room);

        if (gameOver) {
            scheduler.schedule(() -> { synchronized (room) { endGame(room); } },
                    ROUND_RESULT_DELAY_MS, TimeUnit.MILLISECONDS);
        } else {
            scheduler.schedule(() -> { synchronized (room) {
                if (room.getStatus() == Phase10Room.Status.ROUND_RESULT) startRound(room);
            } }, ROUND_RESULT_DELAY_MS, TimeUnit.MILLISECONDS);
        }
    }

    private void endGame(Phase10Room room) {
        room.setStatus(Phase10Room.Status.FINISHED);
        room.cancelTimer();

        // Winner = a player who completed phase 10, lowest total score.
        String winner = null;
        int bestScore = Integer.MAX_VALUE;
        for (Phase10Player p : room.getPlayers().values()) {
            if (p.getCurrentPhase() > PhaseDefinition.MAX_PHASE && p.getTotalScore() < bestScore) {
                bestScore = p.getTotalScore();
                winner = p.getUsername();
            }
        }
        room.setWinner(winner);

        List<Map<String, Object>> standings = buildStandings(room);

        sendToRoom(room.getRoomId(), base(room, Phase10Event.Type.GAME_OVER)
                .winner(winner)
                .standings(standings)
                .message(winner != null ? winner + " wins Phase 10!" : "Game over")
                .build());
        broadcastState(room);

        persistStats(room, winner);
    }

    private List<Map<String, Object>> buildStandings(Phase10Room room) {
        return room.getPlayers().values().stream()
                .sorted(Comparator
                        .comparingInt((Phase10Player p) -> -Math.min(p.getCurrentPhase(), PhaseDefinition.MAX_PHASE + 1))
                        .thenComparingInt(Phase10Player::getTotalScore))
                .map(p -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("username", p.getUsername());
                    m.put("bot", p.isBot());
                    m.put("phase", Math.min(p.getCurrentPhase(), PhaseDefinition.MAX_PHASE));
                    m.put("finishedAll", p.getCurrentPhase() > PhaseDefinition.MAX_PHASE);
                    m.put("score", p.getTotalScore());
                    return m;
                })
                .collect(Collectors.toList());
    }

    private void persistStats(Phase10Room room, String winner) {
        for (Phase10Player p : room.getPlayers().values()) {
            if (p.isBot()) continue;
            try {
                Phase10Stats stats = statsRepository.findByUsername(p.getUsername())
                        .orElseGet(() -> new Phase10Stats(p.getUsername()));
                boolean won = p.getUsername().equals(winner);
                int highestPhase = Math.min(p.getCurrentPhase(), PhaseDefinition.MAX_PHASE);
                int phasesCleared = Math.min(p.getCurrentPhase() - 1, PhaseDefinition.MAX_PHASE);
                stats.recordGame(won, highestPhase, phasesCleared, p.getTotalScore());
                statsRepository.save(stats);
            } catch (Exception e) {
                log.error("Failed to persist Phase10 stats for {}", p.getUsername(), e);
            }
        }
    }

    // ==================== CHAT / REMATCH ====================

    public void sendChat(String roomId, String username, String message) {
        Phase10Room room = rooms.get(roomId);
        if (room == null || message == null || message.isBlank()) return;
        sendToRoom(roomId, base(room, Phase10Event.Type.CHAT_MESSAGE)
                .sender(username).message(message.trim()).build());
    }

    public void requestRematch(String roomId, String username) {
        Phase10Room room = rooms.get(roomId);
        if (room == null) { sendError(username, "Room not found"); return; }
        synchronized (room) {
            if (room.getStatus() != Phase10Room.Status.FINISHED) { sendError(username, "Game isn't finished"); return; }
            room.getRematchVotes().add(username);
            long humans = room.getPlayers().values().stream().filter(p -> !p.isBot()).count();
            if (room.getRematchVotes().size() >= humans) {
                room.resetForRematch();
                sendToRoom(roomId, base(room, Phase10Event.Type.REMATCH_ACCEPTED)
                        .message("Rematch! Host can start again.").build());
                broadcastState(room);
            } else {
                sendToRoom(roomId, base(room, Phase10Event.Type.REMATCH_REQUEST)
                        .player(username)
                        .message(username + " wants a rematch (" + room.getRematchVotes().size() + "/" + humans + ")")
                        .build());
            }
        }
    }

    // ==================== STATE / HELPERS ====================

    private void broadcastState(Phase10Room room) {
        sendToRoom(room.getRoomId(), base(room, Phase10Event.Type.STATE)
                .state(publicState(room)).build());
    }

    private Map<String, Object> publicState(Phase10Room room) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("roomId", room.getRoomId());
        s.put("status", room.getStatus().name());
        s.put("hostUsername", room.getHostUsername());
        s.put("botsEnabled", room.isBotsEnabled());
        s.put("roundNumber", room.getRoundNumber());
        s.put("maxPlayers", room.getMaxPlayers());
        s.put("turnTimerSeconds", room.getTurnTimerSeconds());
        s.put("currentTurn", room.getCurrentPlayerName());
        s.put("turnPhase", room.getTurnPhase().name());
        s.put("drawPileCount", room.getDrawPile().size());
        s.put("discardTop", room.discardTop());
        s.put("discardCount", room.getDiscardPile().size());
        s.put("winner", room.getWinner());
        s.put("table", room.getTable());

        List<Map<String, Object>> players = new ArrayList<>();
        String current = room.getCurrentPlayerName();
        for (String name : (room.getTurnOrder().isEmpty() ? room.getPlayerUsernames() : room.getTurnOrder())) {
            Phase10Player p = room.getPlayer(name);
            if (p == null) continue;
            Map<String, Object> pm = new LinkedHashMap<>();
            pm.put("username", p.getUsername());
            pm.put("bot", p.isBot());
            pm.put("connected", p.isConnected());
            pm.put("handCount", p.getHand().size());
            pm.put("currentPhase", Math.min(p.getCurrentPhase(), PhaseDefinition.MAX_PHASE));
            pm.put("phaseDescription", PhaseDefinition.description(Math.min(p.getCurrentPhase(), PhaseDefinition.MAX_PHASE)));
            pm.put("phaseCompletedThisRound", p.isPhaseCompletedThisRound());
            pm.put("totalScore", p.getTotalScore());
            pm.put("lastRoundScore", p.getLastRoundScore());
            pm.put("skipNext", p.isSkipNext());
            pm.put("isHost", p.getUsername().equals(room.getHostUsername()));
            pm.put("isCurrent", p.getUsername().equals(current));
            players.add(pm);
        }
        s.put("players", players);
        return s;
    }

    private void sendHand(Phase10Room room, Phase10Player player) {
        if (player.isBot()) return;
        sendToUser(player.getUsername(), Phase10Event.builder()
                .type(Phase10Event.Type.HAND)
                .roomId(room.getRoomId())
                .hand(new ArrayList<>(player.getHand()))
                .build());
    }

    private Phase10Event.Phase10EventBuilder base(Phase10Room room, Phase10Event.Type type) {
        return Phase10Event.builder()
                .type(type)
                .roomId(room.getRoomId())
                .status(room.getStatus().name())
                .hostUsername(room.getHostUsername())
                .players(room.getPlayerUsernames());
    }

    private Phase10Engine.RunEnd parseEnd(String runEnd) {
        if (runEnd == null) return null;
        try { return Phase10Engine.RunEnd.valueOf(runEnd.toUpperCase()); }
        catch (Exception e) { return null; }
    }

    private boolean allBotsOrEmpty(Phase10Room room) {
        return room.getPlayers().values().stream().noneMatch(p -> !p.isBot());
    }

    private boolean noConnectedHumans(Phase10Room room) {
        return room.getPlayers().values().stream().noneMatch(p -> !p.isBot() && p.isConnected());
    }

    private void reassignHost(Phase10Room room) {
        room.getPlayers().keySet().stream()
                .filter(name -> { Phase10Player p = room.getPlayer(name); return p != null && !p.isBot() && p.isConnected(); })
                .findFirst()
                .ifPresent(room::setHostUsername);
    }

    private void disposeRoom(Phase10Room room) {
        room.cancelTimer();
        rooms.remove(room.getRoomId());
        log.info("Phase10 room disposed: {}", room.getRoomId());
    }

    // ==================== STATS QUERIES ====================

    public Phase10Stats getStats(String username) {
        return statsRepository.findByUsername(username).orElse(null);
    }

    public List<Phase10Stats> getLeaderboard() {
        return statsRepository.findTop10ByOrderByGamesWonDescTotalPhasesClearedDesc();
    }

    // ==================== MESSAGING ====================

    private void sendToRoom(String roomId, Phase10Event event) {
        messagingTemplate.convertAndSend("/topic/phase10/" + roomId, event);
    }

    private void sendToUser(String username, Phase10Event event) {
        messagingTemplate.convertAndSendToUser(username, "/queue/phase10", event);
    }

    private void sendError(String username, String message) {
        sendToUser(username, Phase10Event.builder()
                .type(Phase10Event.Type.ERROR).message(message).build());
    }
}
