package com.devconnect.party.service;

import com.devconnect.party.dto.PartyEvent;
import com.devconnect.party.engine.*;
import com.devconnect.party.model.PartyGameType;
import com.devconnect.party.model.PartyRoom;
import com.devconnect.party.model.PlayerInfo;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.*;
import java.util.stream.Collectors;

/**
 * Party Room Service — orchestrator for all 8 multiplayer party games.
 *
 * Architecture:
 *   - Each game type has a GameEngine implementation (strategy pattern)
 *   - This service handles: rooms, join/leave, host controls, round flow, timers, scoring, chat, rematch
 *   - Game engines handle: round content, action validation, scoring logic
 *
 * Round flow:
 *   1. startNextRound() -> engine.onRoundStart() -> broadcast ROUND_START
 *   2. Players submit actions -> handleAction() -> engine.validateAction()
 *   3. When all submitted OR timer expires:
 *      a. If engine.hasSecondPhase() -> engine.onPhase2Start() -> more actions
 *      b. Else -> engine.evaluateRound() -> broadcast ROUND_RESULT with scores
 *   4. If last round -> endGame() -> GAME_OVER with winner
 *
 * Per-player data (Bluff, SecretHint):
 *   Some games send different data to each player (e.g., the liar gets different instructions).
 *   These use /user/queue/party instead of /topic/party/{roomId}.
 *
 * State is in-memory (ConcurrentHashMap). Rooms are cleaned up when all players leave.
 */
@Slf4j
@Service
public class PartyRoomService {

    private final SimpMessagingTemplate messagingTemplate;
    private final Map<PartyGameType, GameEngine> engines;
    private final Map<String, PartyRoom> rooms = new ConcurrentHashMap<>();
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(4);

    public PartyRoomService(
            SimpMessagingTemplate messagingTemplate,
            GuessNumberEngine guessNumberEngine,
            ThisOrThatEngine thisOrThatEngine,
            GuessFavoritesEngine guessFavoritesEngine,
            BluffEngine bluffEngine,
            QuickQuizEngine quickQuizEngine,
            PredictMeEngine predictMeEngine,
            MemoryGameEngine memoryGameEngine,
            SecretHintEngine secretHintEngine) {
        this.messagingTemplate = messagingTemplate;
        this.engines = Map.of(
                PartyGameType.GUESS_THE_NUMBER, guessNumberEngine,
                PartyGameType.THIS_OR_THAT, thisOrThatEngine,
                PartyGameType.GUESS_FAVORITES, guessFavoritesEngine,
                PartyGameType.BLUFF, bluffEngine,
                PartyGameType.QUICK_QUIZ, quickQuizEngine,
                PartyGameType.PREDICT_ME, predictMeEngine,
                PartyGameType.MEMORY_GAME, memoryGameEngine,
                PartyGameType.SECRET_HINT, secretHintEngine
        );
    }

    @PreDestroy
    public void shutdown() {
        scheduler.shutdownNow();
    }

    // ==================== ROOM MANAGEMENT ====================

    public PartyRoom createRoom(PartyGameType gameType, String hostUsername,
                                 Integer maxRounds, Integer timerSeconds, Integer maxPlayers) {
        String roomId = UUID.randomUUID().toString().substring(0, 8);
        PartyRoom room = new PartyRoom(roomId, gameType, hostUsername);
        if (maxRounds != null) room.setMaxRounds(maxRounds);
        if (timerSeconds != null) room.setTimerSeconds(timerSeconds);
        if (maxPlayers != null) room.setMaxPlayers(maxPlayers);

        GameEngine engine = engines.get(gameType);
        if (engine != null) {
            room.setMinPlayers(engine.minPlayers());
        }

        room.addPlayer(hostUsername);
        rooms.put(roomId, room);
        log.info("Party room created: id={}, game={}, host='{}'", roomId, gameType, hostUsername);
        return room;
    }

    public PartyRoom getRoom(String roomId) {
        return rooms.get(roomId);
    }

    public List<Map<String, Object>> listRooms() {
        return rooms.values().stream()
                .filter(r -> r.getStatus() == PartyRoom.Status.WAITING)
                .map(r -> {
                    Map<String, Object> info = new LinkedHashMap<>();
                    info.put("roomId", r.getRoomId());
                    info.put("gameType", r.getGameType().name());
                    info.put("hostUsername", r.getHostUsername());
                    info.put("players", r.getPlayers().size());
                    info.put("maxPlayers", r.getMaxPlayers());
                    info.put("maxRounds", r.getMaxRounds());
                    return info;
                })
                .collect(Collectors.toList());
    }

    // ==================== JOIN / LEAVE ====================

    public void joinRoom(String roomId, String username) {
        PartyRoom room = rooms.get(roomId);
        if (room == null) { sendError(username, "Room not found"); return; }

        if (room.getPlayers().containsKey(username)) {
            room.getPlayer(username).setConnected(true);
            sendToRoom(roomId, PartyEvent.builder()
                    .type(PartyEvent.Type.PLAYER_JOINED)
                    .roomId(roomId).player(username)
                    .message(username + " reconnected")
                    .players(room.getPlayerUsernames())
                    .hostUsername(room.getHostUsername())
                    .gameType(room.getGameType().name())
                    .status(room.getStatus().name())
                    .build());
            return;
        }

        if (room.isFull()) { sendError(username, "Room is full"); return; }
        if (room.getStatus() != PartyRoom.Status.WAITING) { sendError(username, "Game already started"); return; }

        room.addPlayer(username);

        sendToRoom(roomId, PartyEvent.builder()
                .type(PartyEvent.Type.PLAYER_JOINED)
                .roomId(roomId).player(username)
                .message(username + " joined (" + room.getPlayers().size() + "/" + room.getMaxPlayers() + ")")
                .players(room.getPlayerUsernames())
                .hostUsername(room.getHostUsername())
                .gameType(room.getGameType().name())
                .status(room.getStatus().name())
                .build());
    }

    public void leaveRoom(String roomId, String username) {
        PartyRoom room = rooms.get(roomId);
        if (room == null) return;

        room.removePlayer(username);

        if (room.getPlayers().isEmpty()) {
            room.cancelTimer();
            rooms.remove(roomId);
            return;
        }

        // Transfer host
        if (username.equals(room.getHostUsername())) {
            room.setHostUsername(room.getPlayerUsernames().get(0));
        }

        sendToRoom(roomId, PartyEvent.builder()
                .type(PartyEvent.Type.PLAYER_LEFT)
                .roomId(roomId).player(username)
                .message(username + " left")
                .players(room.getPlayerUsernames())
                .hostUsername(room.getHostUsername())
                .build());
    }

    // ==================== GAME START (HOST ONLY) ====================

    public void startGame(String roomId, String username) {
        PartyRoom room = rooms.get(roomId);
        if (room == null) { sendError(username, "Room not found"); return; }
        if (!username.equals(room.getHostUsername())) { sendError(username, "Only host can start"); return; }
        if (!room.hasEnoughPlayers()) {
            sendError(username, "Need at least " + room.getMinPlayers() + " players");
            return;
        }

        room.setStatus(PartyRoom.Status.STARTED);
        log.info("Game started: room={}, game={}, players={}", roomId, room.getGameType(), room.getPlayerUsernames());

        sendToRoom(roomId, PartyEvent.builder()
                .type(PartyEvent.Type.GAME_STARTED)
                .roomId(roomId)
                .gameType(room.getGameType().name())
                .players(room.getPlayerUsernames())
                .maxRounds(room.getMaxRounds())
                .timerSeconds(room.getTimerSeconds())
                .message("Game started! " + room.getGameType().name())
                .status(room.getStatus().name())
                .build());

        // Start first round after a small delay
        scheduler.schedule(() -> startNextRound(room), 2, TimeUnit.SECONDS);
    }

    // ==================== ROUND MANAGEMENT ====================

    private void startNextRound(PartyRoom room) {
        room.setCurrentRound(room.getCurrentRound() + 1);
        log.info("Round {}/{} starting: room={}", room.getCurrentRound(), room.getMaxRounds(), room.getRoomId());
        room.setStatus(PartyRoom.Status.IN_ROUND);
        room.clearRoundData();

        GameEngine engine = engines.get(room.getGameType());
        Map<String, Object> roundData = engine.onRoundStart(room);

        PartyEvent.PartyEventBuilder eventBuilder = PartyEvent.builder()
                .type(PartyEvent.Type.ROUND_START)
                .roomId(room.getRoomId())
                .currentRound(room.getCurrentRound())
                .maxRounds(room.getMaxRounds())
                .timerSeconds(room.getTimerSeconds())
                .roundData(roundData)
                .status(room.getStatus().name());

        // Check if this game has per-player data (Bluff, SecretHint)
        boolean hasPerPlayer = roundData.containsKey("perPlayer") && (boolean) roundData.get("perPlayer");
        if (hasPerPlayer) {
            @SuppressWarnings("unchecked")
            Map<String, Map<String, Object>> perPlayerData =
                    (Map<String, Map<String, Object>>) room.getGameData().get("perPlayerData");
            // Send per-player events
            for (String player : room.getPlayerUsernames()) {
                Map<String, Object> playerSpecific = new LinkedHashMap<>(roundData);
                playerSpecific.remove("perPlayer");
                playerSpecific.putAll(perPlayerData.getOrDefault(player, Map.of()));
                sendToUser(player, eventBuilder.roundData(playerSpecific).build());
            }
        } else {
            sendToRoom(room.getRoomId(), eventBuilder.build());
        }

        startRoundTimer(room);
    }

    private void startRoundTimer(PartyRoom room) {
        room.cancelTimer();
        String roomId = room.getRoomId();
        int round = room.getCurrentRound();

        ScheduledFuture<?> future = scheduler.schedule(() -> {
            if (room.getStatus() == PartyRoom.Status.IN_ROUND && room.getCurrentRound() == round) {
                handleTimerExpired(room);
            }
        }, room.getTimerSeconds(), TimeUnit.SECONDS);

        room.setRoundTimer(future);
    }

    private void handleTimerExpired(PartyRoom room) {
        sendToRoom(room.getRoomId(), PartyEvent.builder()
                .type(PartyEvent.Type.TIMER_EXPIRED)
                .roomId(room.getRoomId())
                .message("Time's up!")
                .build());

        GameEngine engine = engines.get(room.getGameType());

        // Check if we need phase 2
        if (engine.hasSecondPhase(room)) {
            Map<String, Object> phase2Data = engine.onPhase2Start(room);
            sendToRoom(room.getRoomId(), PartyEvent.builder()
                    .type(PartyEvent.Type.ROUND_START)
                    .roomId(room.getRoomId())
                    .roundData(phase2Data)
                    .currentRound(room.getCurrentRound())
                    .timerSeconds(room.getTimerSeconds())
                    .message("Phase 2!")
                    .build());
            startRoundTimer(room);
            return;
        }

        evaluateAndAdvance(room);
    }

    // ==================== PLAYER ACTION ====================

    public void handleAction(String roomId, String username, Map<String, Object> action) {
        PartyRoom room = rooms.get(roomId);
        if (room == null) { sendError(username, "Room not found"); return; }
        if (room.getStatus() != PartyRoom.Status.IN_ROUND) { sendError(username, "Not in a round"); return; }
        if (!room.getPlayers().containsKey(username)) { sendError(username, "Not in this room"); return; }
        if (room.getPlayerActions().containsKey(username)) { sendError(username, "Already submitted"); return; }

        GameEngine engine = engines.get(room.getGameType());
        int phase = (int) room.getGameData().getOrDefault("phase", 1);

        String error;
        if (phase > 1) {
            error = engine.validatePhase2Action(room, username, action);
        } else {
            error = engine.validateAction(room, username, action);
        }
        if (error != null) { sendError(username, error); return; }

        room.getPlayerActions().put(username, action);

        // Acknowledge
        sendToUser(username, PartyEvent.builder()
                .type(PartyEvent.Type.ACTION_ACK)
                .roomId(roomId)
                .message("Action received!")
                .build());

        // Check if all players acted
        boolean allActed;
        if (phase == 1 && isPhase1SinglePlayer(room)) {
            // Only one player needs to act (e.g., GuessFavorites target, SecretHint hint-giver)
            allActed = room.getPlayerActions().size() >= 1;
        } else if (phase > 1 && isPhase2ExcludesOnePlayer(room)) {
            allActed = room.getPlayerActions().size() >= room.getPlayers().size() - 1;
        } else {
            allActed = room.allPlayersActed();
        }

        if (allActed) {
            room.cancelTimer();

            if (engine.hasSecondPhase(room)) {
                Map<String, Object> phase2Data = engine.onPhase2Start(room);

                boolean hasPerPlayer = phase2Data.containsKey("perPlayer");
                if (hasPerPlayer) {
                    // Per-player phase 2 data (if needed in future)
                    sendToRoom(room.getRoomId(), PartyEvent.builder()
                            .type(PartyEvent.Type.ROUND_START)
                            .roomId(room.getRoomId())
                            .roundData(phase2Data)
                            .currentRound(room.getCurrentRound())
                            .timerSeconds(room.getTimerSeconds())
                            .message("Phase 2!")
                            .build());
                } else {
                    sendToRoom(room.getRoomId(), PartyEvent.builder()
                            .type(PartyEvent.Type.ROUND_START)
                            .roomId(room.getRoomId())
                            .roundData(phase2Data)
                            .currentRound(room.getCurrentRound())
                            .timerSeconds(room.getTimerSeconds())
                            .message("Phase 2!")
                            .build());
                }
                startRoundTimer(room);
            } else {
                evaluateAndAdvance(room);
            }
        }
    }

    private boolean isPhase1SinglePlayer(PartyRoom room) {
        PartyGameType type = room.getGameType();
        return type == PartyGameType.GUESS_FAVORITES || type == PartyGameType.SECRET_HINT;
    }

    private boolean isPhase2ExcludesOnePlayer(PartyRoom room) {
        PartyGameType type = room.getGameType();
        return type == PartyGameType.GUESS_FAVORITES || type == PartyGameType.SECRET_HINT;
    }

    private void evaluateAndAdvance(PartyRoom room) {
        GameEngine engine = engines.get(room.getGameType());
        Map<String, Object> results = engine.evaluateRound(room);

        room.setStatus(PartyRoom.Status.ROUND_RESULT);

        // Send round results + scoreboard
        sendToRoom(room.getRoomId(), PartyEvent.builder()
                .type(PartyEvent.Type.ROUND_RESULT)
                .roomId(room.getRoomId())
                .currentRound(room.getCurrentRound())
                .results(results)
                .scoreboard(buildScoreboard(room))
                .message("Round " + room.getCurrentRound() + " complete!")
                .build());

        // Check if game is over
        if (room.getCurrentRound() >= room.getMaxRounds()) {
            scheduler.schedule(() -> endGame(room), 3, TimeUnit.SECONDS);
        } else {
            scheduler.schedule(() -> startNextRound(room), 4, TimeUnit.SECONDS);
        }
    }

    private void endGame(PartyRoom room) {
        room.setStatus(PartyRoom.Status.FINISHED);
        room.cancelTimer();
        log.info("Game over: room={}, scoreboard={}", room.getRoomId(), room.getScoreboard());

        List<Map<String, Object>> scoreboard = buildScoreboard(room);
        String winner = scoreboard.isEmpty() ? "" : (String) scoreboard.get(0).get("username");

        // Check draw
        if (scoreboard.size() > 1) {
            int topScore = (int) scoreboard.get(0).get("score");
            long topCount = scoreboard.stream().filter(s -> (int) s.get("score") == topScore).count();
            if (topCount > 1) winner = null; // draw
        }

        sendToRoom(room.getRoomId(), PartyEvent.builder()
                .type(PartyEvent.Type.GAME_OVER)
                .roomId(room.getRoomId())
                .winner(winner)
                .scoreboard(scoreboard)
                .message(winner != null ? winner + " wins!" : "It's a DRAW!")
                .status(PartyRoom.Status.FINISHED.name())
                .build());
    }

    // ==================== CHAT ====================

    public void sendChat(String roomId, String username, String message) {
        PartyRoom room = rooms.get(roomId);
        if (room == null) { sendError(username, "Room not found"); return; }

        sendToRoom(roomId, PartyEvent.builder()
                .type(PartyEvent.Type.CHAT_MESSAGE)
                .roomId(roomId)
                .sender(username)
                .message(message)
                .build());
    }

    // ==================== REMATCH ====================

    public void requestRematch(String roomId, String username) {
        PartyRoom room = rooms.get(roomId);
        if (room == null) { sendError(username, "Room not found"); return; }
        if (room.getStatus() != PartyRoom.Status.FINISHED) { sendError(username, "Game not finished"); return; }

        room.getRematchVotes().add(username);

        if (room.getRematchVotes().size() >= room.getPlayers().size()) {
            room.resetForRematch();
            sendToRoom(roomId, PartyEvent.builder()
                    .type(PartyEvent.Type.REMATCH_ACCEPTED)
                    .roomId(roomId)
                    .players(room.getPlayerUsernames())
                    .hostUsername(room.getHostUsername())
                    .message("Rematch! Waiting for host to start.")
                    .status(PartyRoom.Status.WAITING.name())
                    .build());
        } else {
            sendToRoom(roomId, PartyEvent.builder()
                    .type(PartyEvent.Type.REMATCH_REQUEST)
                    .roomId(roomId)
                    .player(username)
                    .message(username + " wants a rematch! (" + room.getRematchVotes().size() + "/" + room.getPlayers().size() + ")")
                    .build());
        }
    }

    // ==================== HELPERS ====================

    private List<Map<String, Object>> buildScoreboard(PartyRoom room) {
        return room.getScoreboard().stream()
                .map(p -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("username", p.getUsername());
                    m.put("score", p.getScore());
                    return m;
                })
                .collect(Collectors.toList());
    }

    private void sendToRoom(String roomId, PartyEvent event) {
        messagingTemplate.convertAndSend("/topic/party/" + roomId, event);
    }

    private void sendToUser(String username, PartyEvent event) {
        messagingTemplate.convertAndSendToUser(username, "/queue/party", event);
    }

    private void sendError(String username, String message) {
        sendToUser(username, PartyEvent.builder()
                .type(PartyEvent.Type.ERROR)
                .message(message)
                .build());
    }
}
