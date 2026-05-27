package com.devconnect.service;

import com.devconnect.dto.response.GameEvent;
import com.devconnect.model.GameLeaderboard;
import com.devconnect.model.GameRoom;
import com.devconnect.repository.GameLeaderboardRepository;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * Game Service — core logic for the 2-player "Guess the Number" game.
 *
 * Game state lifecycle:
 *   WAITING -> NUMBER_SELECTION -> PLAYING -> FINISHED
 *
 * Features:
 *   - Room creation with difficulty (EASY 1-50, MEDIUM 1-100, HARD 1-1000)
 *   - Coin toss to decide who goes first
 *   - Turn-based guessing with hints (Too High / Too Low / Correct)
 *   - 30-second timer per turn — auto-skips if no response
 *   - Draw detection: if player A guesses correctly, player B gets one final attempt
 *   - In-game chat between players
 *   - Rematch: both players request -> room resets
 *   - Leaderboard: wins/losses/draws persisted to game_leaderboard table
 *
 * State is stored in-memory (ConcurrentHashMap). Leaderboard is DB-persisted.
 * WebSocket events are broadcast to /topic/game/{roomId} and /user/queue/game.
 */
@Slf4j
@Service
public class GameService {

    private final SimpMessagingTemplate messagingTemplate;
    private final GameLeaderboardRepository leaderboardRepository;
    private final Map<String, GameRoom> rooms = new ConcurrentHashMap<>();
    private final Random random = new Random();
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2);

    public GameService(SimpMessagingTemplate messagingTemplate, GameLeaderboardRepository leaderboardRepository) {
        this.messagingTemplate = messagingTemplate;
        this.leaderboardRepository = leaderboardRepository;
    }

    @PreDestroy
    public void shutdown() {
        scheduler.shutdownNow();
    }

    // ==================== ROOM MANAGEMENT ====================

    public GameRoom createRoom(GameRoom.Difficulty difficulty) {
        String roomId = UUID.randomUUID().toString().substring(0, 8);
        GameRoom room = new GameRoom(roomId, difficulty);
        rooms.put(roomId, room);
        return room;
    }

    public GameRoom getRoom(String roomId) {
        return rooms.get(roomId);
    }

    // ==================== JOIN ====================

    public void joinRoom(String roomId, String username) {
        GameRoom room = rooms.get(roomId);
        if (room == null) {
            sendError(username, "Room not found: " + roomId);
            return;
        }

        if (room.getPlayers().contains(username)) {
            sendToRoom(roomId, GameEvent.builder()
                    .type(GameEvent.Type.JOIN_ROOM)
                    .roomId(roomId)
                    .player(username)
                    .message(username + " reconnected")
                    .status(room.getStatus().name())
                    .difficulty(room.getDifficulty().name())
                    .minRange(room.getMinRange())
                    .maxRange(room.getMaxRange())
                    .build());
            return;
        }

        if (room.isFull()) {
            sendError(username, "Room is full");
            return;
        }

        room.getPlayers().add(username);
        room.getAttempts().put(username, 0);

        GameEvent.GameEventBuilder eventBuilder = GameEvent.builder()
                .type(GameEvent.Type.JOIN_ROOM)
                .roomId(roomId)
                .player(username)
                .difficulty(room.getDifficulty().name())
                .minRange(room.getMinRange())
                .maxRange(room.getMaxRange())
                .message(username + " joined the room");

        if (room.isFull()) {
            room.setStatus(GameRoom.Status.NUMBER_SELECTION);
            eventBuilder
                    .player1(room.getPlayers().get(0))
                    .player2(room.getPlayers().get(1))
                    .status(GameRoom.Status.NUMBER_SELECTION.name())
                    .message("Both players joined! Select your secret numbers ("
                            + room.getMinRange() + "-" + room.getMaxRange() + ").");
        } else {
            eventBuilder.status(room.getStatus().name());
        }

        sendToRoom(roomId, eventBuilder.build());
    }

    // ==================== NUMBER SELECTION ====================

    public void selectNumber(String roomId, String username, int number) {
        GameRoom room = rooms.get(roomId);
        if (room == null) {
            sendError(username, "Room not found");
            return;
        }

        if (room.getStatus() != GameRoom.Status.NUMBER_SELECTION) {
            sendError(username, "Not in number selection phase");
            return;
        }

        if (!room.getPlayers().contains(username)) {
            sendError(username, "You are not in this room");
            return;
        }

        if (number < room.getMinRange() || number > room.getMaxRange()) {
            sendError(username, "Number must be between " + room.getMinRange() + " and " + room.getMaxRange());
            return;
        }

        room.getSecretNumbers().put(username, number);

        sendToUser(username, GameEvent.builder()
                .type(GameEvent.Type.NUMBER_SELECTED)
                .roomId(roomId)
                .player(username)
                .message("You selected your secret number")
                .build());

        String opponent = room.getOpponent(username);
        if (opponent != null) {
            sendToUser(opponent, GameEvent.builder()
                    .type(GameEvent.Type.NUMBER_SELECTED)
                    .roomId(roomId)
                    .player(username)
                    .message(username + " has selected their number")
                    .build());
        }

        if (room.bothNumbersSelected()) {
            performTossAndStart(room);
        }
    }

    // ==================== TOSS & START ====================

    private void performTossAndStart(GameRoom room) {
        int tossResult = random.nextInt(2);
        String firstPlayer = room.getPlayers().get(tossResult);
        room.setCurrentTurnPlayer(firstPlayer);
        room.setStatus(GameRoom.Status.PLAYING);

        sendToRoom(room.getRoomId(), GameEvent.builder()
                .type(GameEvent.Type.START_GAME)
                .roomId(room.getRoomId())
                .currentTurnPlayer(firstPlayer)
                .player1(room.getPlayers().get(0))
                .player2(room.getPlayers().get(1))
                .message("Toss won by " + firstPlayer + "! " + firstPlayer + " goes first.")
                .status(GameRoom.Status.PLAYING.name())
                .turnTimeoutSeconds(room.getTurnTimeoutSeconds())
                .difficulty(room.getDifficulty().name())
                .minRange(room.getMinRange())
                .maxRange(room.getMaxRange())
                .build());

        startTurnTimer(room);
    }

    // ==================== TIMER ====================

    private void startTurnTimer(GameRoom room) {
        room.cancelTimer();

        String playerAtTurn = room.getCurrentTurnPlayer();
        String roomId = room.getRoomId();

        ScheduledFuture<?> future = scheduler.schedule(() -> {
            if (room.getStatus() == GameRoom.Status.PLAYING
                    && playerAtTurn.equals(room.getCurrentTurnPlayer())) {
                handleTimeout(room, playerAtTurn);
            }
        }, room.getTurnTimeoutSeconds(), TimeUnit.SECONDS);

        room.setTurnTimer(future);
    }

    private void handleTimeout(GameRoom room, String timedOutPlayer) {
        sendToRoom(room.getRoomId(), GameEvent.builder()
                .type(GameEvent.Type.TURN_TIMEOUT)
                .roomId(room.getRoomId())
                .player(timedOutPlayer)
                .message("Time's up! " + timedOutPlayer + "'s turn skipped.")
                .build());

        // If there was a pending winner and the timed-out player was the one
        // who needed to match → the pending winner wins outright
        if (room.getWinner() != null) {
            String winner = room.getWinner();
            room.setStatus(GameRoom.Status.FINISHED);
            room.cancelTimer();
            sendGameResult(room, winner,
                    winner + " WINS! Opponent timed out on their final attempt.");
            updateLeaderboard(winner, room.getOpponent(winner), false);
            return;
        }

        switchTurn(room);
    }

    // ==================== GUESS ====================

    public void makeGuess(String roomId, String username, int guess) {
        GameRoom room = rooms.get(roomId);
        if (room == null) {
            sendError(username, "Room not found");
            return;
        }

        if (room.getStatus() != GameRoom.Status.PLAYING) {
            sendError(username, "Game is not in progress");
            return;
        }

        if (!username.equals(room.getCurrentTurnPlayer())) {
            sendError(username, "It's not your turn");
            return;
        }

        if (guess < room.getMinRange() || guess > room.getMaxRange()) {
            sendError(username, "Guess must be between " + room.getMinRange() + " and " + room.getMaxRange());
            return;
        }

        if (room.hasAlreadyGuessed(username, guess)) {
            sendError(username, "You already guessed " + guess + ". Try a different number.");
            return;
        }

        // Cancel the timer since the player responded in time
        room.cancelTimer();

        String opponent = room.getOpponent(username);
        int opponentSecret = room.getSecretNumbers().get(opponent);

        room.incrementAttempts(username);
        room.addGuess(username, guess);

        String hint;
        boolean correct = false;

        if (guess == opponentSecret) {
            hint = "Correct";
            correct = true;
        } else if (guess > opponentSecret) {
            hint = "Too High";
        } else {
            hint = "Too Low";
        }

        sendToRoom(roomId, GameEvent.builder()
                .type(GameEvent.Type.GUESS_RESULT)
                .roomId(roomId)
                .player(username)
                .guess(guess)
                .hint(hint)
                .player1Attempts(room.getAttemptCount(room.getPlayers().get(0)))
                .player2Attempts(room.getAttemptCount(room.getPlayers().get(1)))
                .player1(room.getPlayers().get(0))
                .player2(room.getPlayers().get(1))
                .message(username + " guessed " + guess + " → " + hint)
                .build());

        if (correct) {
            handleCorrectGuess(room, username);
        } else {
            switchTurn(room);
        }
    }

    private void handleCorrectGuess(GameRoom room, String guesser) {
        String opponent = room.getOpponent(guesser);
        int guesserAttempts = room.getAttemptCount(guesser);
        int opponentAttempts = room.getAttemptCount(opponent);

        if (opponentAttempts < guesserAttempts) {
            // Opponent gets one final guess to match
            room.setCurrentTurnPlayer(opponent);
            room.setWinner(guesser);

            sendToRoom(room.getRoomId(), GameEvent.builder()
                    .type(GameEvent.Type.TURN_SWITCH)
                    .roomId(room.getRoomId())
                    .currentTurnPlayer(opponent)
                    .turnTimeoutSeconds(room.getTurnTimeoutSeconds())
                    .message(guesser + " guessed correctly! " + opponent + " gets one final attempt to match.")
                    .build());

            startTurnTimer(room);
            return;
        }

        // Both guessed correctly in same attempt count → DRAW
        if (room.getWinner() != null && opponentAttempts == guesserAttempts) {
            room.setStatus(GameRoom.Status.FINISHED);
            room.cancelTimer();
            sendToRoom(room.getRoomId(), GameEvent.builder()
                    .type(GameEvent.Type.GAME_RESULT)
                    .roomId(room.getRoomId())
                    .message("It's a DRAW! Both players guessed correctly in " + guesserAttempts + " attempts.")
                    .player1Attempts(room.getAttemptCount(room.getPlayers().get(0)))
                    .player2Attempts(room.getAttemptCount(room.getPlayers().get(1)))
                    .player1(room.getPlayers().get(0))
                    .player2(room.getPlayers().get(1))
                    .status(GameRoom.Status.FINISHED.name())
                    .build());
            updateLeaderboard(room.getPlayers().get(0), room.getPlayers().get(1), true);
            return;
        }

        // Outright win
        room.setWinner(guesser);
        room.setStatus(GameRoom.Status.FINISHED);
        room.cancelTimer();
        sendGameResult(room, guesser, guesser + " WINS in " + guesserAttempts + " attempts!");
        updateLeaderboard(guesser, opponent, false);
    }

    private void switchTurn(GameRoom room) {
        if (room.getWinner() != null) {
            String winner = room.getWinner();
            room.setStatus(GameRoom.Status.FINISHED);
            room.cancelTimer();
            String opponent = room.getOpponent(winner);
            sendGameResult(room, winner,
                    winner + " WINS! Opponent failed to match in the same number of attempts.");
            updateLeaderboard(winner, opponent, false);
            return;
        }

        String currentPlayer = room.getCurrentTurnPlayer();
        String nextPlayer = room.getOpponent(currentPlayer);
        room.setCurrentTurnPlayer(nextPlayer);

        sendToRoom(room.getRoomId(), GameEvent.builder()
                .type(GameEvent.Type.TURN_SWITCH)
                .roomId(room.getRoomId())
                .currentTurnPlayer(nextPlayer)
                .turnTimeoutSeconds(room.getTurnTimeoutSeconds())
                .message("It's " + nextPlayer + "'s turn")
                .build());

        startTurnTimer(room);
    }

    private void sendGameResult(GameRoom room, String winner, String message) {
        sendToRoom(room.getRoomId(), GameEvent.builder()
                .type(GameEvent.Type.GAME_RESULT)
                .roomId(room.getRoomId())
                .winner(winner)
                .message(message)
                .player1Attempts(room.getAttemptCount(room.getPlayers().get(0)))
                .player2Attempts(room.getAttemptCount(room.getPlayers().get(1)))
                .player1(room.getPlayers().get(0))
                .player2(room.getPlayers().get(1))
                .status(GameRoom.Status.FINISHED.name())
                .build());
    }

    // ==================== CHAT ====================

    public void sendChatMessage(String roomId, String sender, String message) {
        GameRoom room = rooms.get(roomId);
        if (room == null) {
            sendError(sender, "Room not found");
            return;
        }

        if (!room.getPlayers().contains(sender)) {
            sendError(sender, "You are not in this room");
            return;
        }

        sendToRoom(roomId, GameEvent.builder()
                .type(GameEvent.Type.CHAT_MESSAGE)
                .roomId(roomId)
                .sender(sender)
                .message(message)
                .build());
    }

    // ==================== REMATCH ====================

    public void requestRematch(String roomId, String username) {
        GameRoom room = rooms.get(roomId);
        if (room == null) {
            sendError(username, "Room not found");
            return;
        }

        if (room.getStatus() != GameRoom.Status.FINISHED) {
            sendError(username, "Game is not finished yet");
            return;
        }

        if (!room.getPlayers().contains(username)) {
            sendError(username, "You are not in this room");
            return;
        }

        room.getRematchRequests().add(username);

        if (room.getRematchRequests().size() >= 2) {
            // Both accepted — reset
            room.resetForRematch();

            sendToRoom(roomId, GameEvent.builder()
                    .type(GameEvent.Type.REMATCH_ACCEPTED)
                    .roomId(roomId)
                    .message("Rematch accepted! Select your secret numbers ("
                            + room.getMinRange() + "-" + room.getMaxRange() + ").")
                    .player1(room.getPlayers().get(0))
                    .player2(room.getPlayers().get(1))
                    .status(GameRoom.Status.NUMBER_SELECTION.name())
                    .difficulty(room.getDifficulty().name())
                    .minRange(room.getMinRange())
                    .maxRange(room.getMaxRange())
                    .build());
        } else {
            sendToRoom(roomId, GameEvent.builder()
                    .type(GameEvent.Type.REMATCH_REQUEST)
                    .roomId(roomId)
                    .player(username)
                    .message(username + " wants a rematch!")
                    .build());
        }
    }

    // ==================== LEADERBOARD ====================

    private void updateLeaderboard(String player1, String player2, boolean isDraw) {
        if (isDraw) {
            getOrCreateEntry(player1).recordDraw();
            getOrCreateEntry(player2).recordDraw();
            leaderboardRepository.save(getOrCreateEntry(player1));
            leaderboardRepository.save(getOrCreateEntry(player2));
        } else {
            // player1 = winner, player2 = loser
            GameLeaderboard winnerEntry = getOrCreateEntry(player1);
            GameLeaderboard loserEntry = getOrCreateEntry(player2);
            winnerEntry.recordWin();
            loserEntry.recordLoss();
            leaderboardRepository.save(winnerEntry);
            leaderboardRepository.save(loserEntry);
        }
    }

    private GameLeaderboard getOrCreateEntry(String username) {
        return leaderboardRepository.findByUsername(username)
                .orElseGet(() -> leaderboardRepository.save(new GameLeaderboard(username)));
    }

    public List<GameLeaderboard> getLeaderboard() {
        return leaderboardRepository.findTop10ByOrderByWinsDesc();
    }

    public GameLeaderboard getPlayerStats(String username) {
        return leaderboardRepository.findByUsername(username).orElse(null);
    }

    // ==================== MESSAGING HELPERS ====================

    private void sendToRoom(String roomId, GameEvent event) {
        messagingTemplate.convertAndSend("/topic/game/" + roomId, event);
    }

    private void sendToUser(String username, GameEvent event) {
        messagingTemplate.convertAndSendToUser(username, "/queue/game", event);
    }

    private void sendError(String username, String message) {
        sendToUser(username, GameEvent.builder()
                .type(GameEvent.Type.ERROR)
                .message(message)
                .build());
    }
}
