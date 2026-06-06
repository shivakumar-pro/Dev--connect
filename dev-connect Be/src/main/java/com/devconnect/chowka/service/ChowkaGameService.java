package com.devconnect.chowka.service;

import com.devconnect.chowka.engine.ChowkaEngine;
import com.devconnect.chowka.dto.ChowkaEvent;
import com.devconnect.chowka.model.ChowkaPlayer;
import com.devconnect.chowka.model.ChowkaRoom;
import com.devconnect.chowka.model.Piece;
import com.devconnect.service.LeaderboardService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * In-memory orchestrator for multiplayer Chowka Bara.
 *
 *  1. createRoom -> host opens a lobby
 *  2. joinRoom / addBot -> seats fill (2..4)
 *  3. startGame -> turn order set, pieces placed (open-start) or kept in base
 *  4. roll -> server generates a secure cowrie throw; legal moves computed
 *  5. move -> chosen piece advances; captures + finishing applied
 *  6. turn passes unless the roll/outcome grants an extra turn
 *  7. first player to bring all 4 pieces to the centre wins (FINISHED)
 *
 * Dice are ALWAYS generated server-side (never trust the client). Bots are
 * driven by a small scheduled executor so their turns animate naturally.
 */
@Slf4j
@Service
public class ChowkaGameService {

    public static final String GAME_KEY = "CHOWKA";

    private final SimpMessagingTemplate messaging;
    private final ChowkaEngine engine;
    private final LeaderboardService leaderboardService;

    private final Map<String, ChowkaRoom> rooms = new ConcurrentHashMap<>();
    private final SecureRandom random = new SecureRandom();
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2);

    public ChowkaGameService(SimpMessagingTemplate messaging, ChowkaEngine engine,
                             LeaderboardService leaderboardService) {
        this.messaging = messaging;
        this.engine = engine;
        this.leaderboardService = leaderboardService;
    }

    // ==================== ROOM LIFECYCLE ====================

    public ChowkaRoom createRoom(String host, Integer maxPlayers, Boolean openStart) {
        if (host == null || host.isBlank()) throw new IllegalArgumentException("hostUsername required");
        String roomId = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        ChowkaRoom room = new ChowkaRoom(roomId, host);
        if (maxPlayers != null && maxPlayers >= 2 && maxPlayers <= 4) room.setMaxPlayers(maxPlayers);
        if (openStart != null) room.setOpenStart(openStart);
        addSeat(room, host, false);
        rooms.put(roomId, room);
        log.info("Chowka room created: id={} host={} openStart={}", roomId, host, room.isOpenStart());
        return room;
    }

    public ChowkaRoom getRoom(String roomId) {
        ChowkaRoom r = rooms.get(roomId == null ? "" : roomId.toUpperCase());
        if (r == null) throw new NoSuchElementException("Room not found: " + roomId);
        return r;
    }

    public List<Map<String, Object>> listRooms() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (ChowkaRoom r : rooms.values()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("roomId", r.getRoomId());
            m.put("host", r.getHostUsername());
            m.put("status", r.getStatus().name());
            m.put("players", r.getPlayers().size());
            m.put("maxPlayers", r.getMaxPlayers());
            m.put("openStart", r.isOpenStart());
            out.add(m);
        }
        return out;
    }

    private ChowkaPlayer addSeat(ChowkaRoom room, String username, boolean bot) {
        int seat = room.getPlayers().size();
        String color = ChowkaEngine.COLORS[seat % ChowkaEngine.COLORS.length];
        ChowkaPlayer p = new ChowkaPlayer(username, seat, color);
        p.setBot(bot);
        room.getPlayers().put(username, p);
        return p;
    }

    public void joinRoom(String roomId, String username) {
        ChowkaRoom r = getRoom(roomId);
        if (username == null || username.isBlank()) throw new IllegalArgumentException("username required");
        if (r.getPlayers().containsKey(username)) {
            r.getPlayers().get(username).setConnected(true);
            broadcastState(r);
            return;
        }
        if (r.getStatus() != ChowkaRoom.Status.WAITING) throw new IllegalStateException("Game already started");
        if (r.getPlayers().size() >= r.getMaxPlayers()) throw new IllegalStateException("Room is full");
        addSeat(r, username, false);
        sendToRoom(roomId, base(r, ChowkaEvent.Type.PLAYER_JOINED).player(username)
                .message(username + " joined").build());
        broadcastState(r);
    }

    public void addBot(String roomId, String username) {
        ChowkaRoom r = getRoom(roomId);
        requireHost(r, username);
        if (r.getStatus() != ChowkaRoom.Status.WAITING) throw new IllegalStateException("Game already started");
        if (r.getPlayers().size() >= r.getMaxPlayers()) throw new IllegalStateException("Room is full");
        int n = 1;
        String name;
        do { name = "🤖 Bot " + n++; } while (r.getPlayers().containsKey(name));
        addSeat(r, name, true);
        sendToRoom(roomId, base(r, ChowkaEvent.Type.BOT_ADDED).player(name).message(name + " joined").build());
        broadcastState(r);
    }

    public void removeBot(String roomId, String username, String botName) {
        ChowkaRoom r = getRoom(roomId);
        requireHost(r, username);
        if (r.getStatus() != ChowkaRoom.Status.WAITING) throw new IllegalStateException("Game already started");
        ChowkaPlayer p = r.getPlayers().get(botName);
        if (p != null && p.isBot()) {
            r.getPlayers().remove(botName);
            reseat(r);
        }
        broadcastState(r);
    }

    /** Re-number seats/colours after a removal so they stay contiguous. */
    private void reseat(ChowkaRoom r) {
        int seat = 0;
        for (ChowkaPlayer p : r.getPlayers().values()) {
            p.setSeat(seat);
            p.setColor(ChowkaEngine.COLORS[seat % ChowkaEngine.COLORS.length]);
            seat++;
        }
    }

    public void leaveRoom(String roomId, String username) {
        ChowkaRoom r;
        try { r = getRoom(roomId); } catch (NoSuchElementException e) { return; }
        ChowkaPlayer leaving = r.getPlayers().get(username);
        if (leaving == null) return;

        boolean wasTheirTurn = username.equals(r.currentPlayerName());

        if (r.getStatus() == ChowkaRoom.Status.IN_PROGRESS) {
            // Mid-game: keep the seat but mark disconnected so the board stays intact.
            leaving.setConnected(false);
        } else {
            r.getPlayers().remove(username);
            reseat(r);
        }

        if (r.getPlayers().values().stream().noneMatch(p -> !p.isBot() && p.isConnected())) {
            r.cancelBotTask();
            rooms.remove(r.getRoomId());
            return;
        }
        if (username.equals(r.getHostUsername())) {
            r.getPlayers().values().stream()
                    .filter(p -> !p.isBot() && p.isConnected())
                    .findFirst().ifPresent(p -> r.setHostUsername(p.getUsername()));
        }
        sendToRoom(roomId, base(r, ChowkaEvent.Type.PLAYER_LEFT).player(username)
                .message(username + " left").build());

        if (r.getStatus() == ChowkaRoom.Status.IN_PROGRESS && wasTheirTurn) {
            advanceTurn(r);
        } else {
            broadcastState(r);
        }
    }

    public void startGame(String roomId, String username) {
        ChowkaRoom r = getRoom(roomId);
        requireHost(r, username);
        if (r.getStatus() == ChowkaRoom.Status.IN_PROGRESS) throw new IllegalStateException("Already started");
        if (r.getPlayers().size() < r.getMinPlayers())
            throw new IllegalStateException("Need at least " + r.getMinPlayers() + " players");
        resetPieces(r);
        r.setTurnOrder(new ArrayList<>(r.getPlayers().keySet()));
        r.setTurnPointer(0);
        r.setLastRoll(0);
        r.setAwaitingMove(false);
        r.getLegalPieceIds().clear();
        r.setWinner(null);
        r.setStatus(ChowkaRoom.Status.IN_PROGRESS);
        sendToRoom(roomId, base(r, ChowkaEvent.Type.GAME_STARTED).message("Game started!").build());
        startTurn(r);
    }

    public void rematch(String roomId, String username) {
        ChowkaRoom r = getRoom(roomId);
        r.cancelBotTask();
        // Drop disconnected humans before a fresh game.
        r.getPlayers().values().removeIf(p -> !p.isBot() && !p.isConnected());
        reseat(r);
        r.setStatus(ChowkaRoom.Status.WAITING);
        r.setWinner(null);
        r.setTurnOrder(new ArrayList<>());
        r.setTurnPointer(0);
        r.setLastRoll(0);
        r.setAwaitingMove(false);
        r.getLegalPieceIds().clear();
        resetPieces(r);
        sendToRoom(roomId, base(r, ChowkaEvent.Type.REMATCH).message("Back to the lobby — host can start again").build());
        broadcastState(r);
    }

    /** Place pieces for a new game: open-start puts them on the start square,
     *  otherwise they wait in base until an entry roll brings them out. */
    private void resetPieces(ChowkaRoom r) {
        int start = r.isOpenStart() ? 0 : -1;
        for (ChowkaPlayer p : r.getPlayers().values()) {
            for (Piece pc : p.getPieces()) pc.setPathIndex(start);
        }
    }

    // ==================== TURN FLOW ====================

    private void startTurn(ChowkaRoom r) {
        r.setLastRoll(0);
        r.setAwaitingMove(false);
        r.getLegalPieceIds().clear();
        ChowkaPlayer cur = r.currentPlayer();
        sendToRoom(r.getRoomId(), base(r, ChowkaEvent.Type.TURN_START)
                .currentTurn(r.currentPlayerName()).build());
        broadcastState(r);

        if (cur == null) return;
        // Auto-skip a disconnected human; let bots play automatically.
        if (!cur.isBot() && !cur.isConnected()) {
            scheduler.schedule(() -> safe(() -> advanceTurn(r)), 600, TimeUnit.MILLISECONDS);
        } else if (cur.isBot()) {
            scheduleBot(r);
        }
    }

    public void roll(String roomId, String username) {
        ChowkaRoom r = getRoom(roomId);
        guardTurn(r, username);
        if (r.isAwaitingMove()) throw new IllegalStateException("Move your piece first");
        performRoll(r, r.getPlayers().get(username));
    }

    private void performRoll(ChowkaRoom r, ChowkaPlayer player) {
        int roll = rollCowries();
        r.setLastRoll(roll);
        boolean extra = grantsExtraTurn(roll);
        List<Integer> legal = engine.legalMoves(r, player, roll);
        r.setLegalPieceIds(legal);

        sendToRoom(r.getRoomId(), base(r, ChowkaEvent.Type.DICE_ROLLED)
                .player(player.getUsername()).roll(roll).extraTurn(extra).build());

        if (legal.isEmpty()) {
            // No legal move. An extra-turn roll lets them roll again; else pass.
            r.setAwaitingMove(false);
            sendToRoom(r.getRoomId(), base(r, ChowkaEvent.Type.NO_MOVE)
                    .player(player.getUsername()).roll(roll).message("No legal move").build());
            if (extra) {
                broadcastState(r);
                if (player.isBot()) scheduleBot(r);
            } else {
                advanceTurn(r);
            }
            return;
        }

        r.setAwaitingMove(true);
        broadcastState(r);
        if (player.isBot()) scheduleBot(r);
    }

    public void move(String roomId, String username, Integer pieceId) {
        ChowkaRoom r = getRoom(roomId);
        guardTurn(r, username);
        applyMove(r, r.getPlayers().get(username), pieceId);
    }

    private void applyMove(ChowkaRoom r, ChowkaPlayer player, Integer pieceId) {
        if (!r.isAwaitingMove()) throw new IllegalStateException("Roll the dice first");
        if (pieceId == null || !r.getLegalPieceIds().contains(pieceId))
            throw new IllegalArgumentException("That piece can't move");

        int roll = r.getLastRoll();
        Piece moved = player.piece(pieceId);
        int from = moved.getPathIndex();
        ChowkaEngine.MoveResult res = engine.applyMove(r, player, pieceId, roll);
        int to = moved.getPathIndex();

        r.setAwaitingMove(false);
        r.getLegalPieceIds().clear();

        sendToRoom(r.getRoomId(), base(r, ChowkaEvent.Type.PIECE_MOVED)
                .player(player.getUsername()).pieceId(pieceId)
                .fromIndex(from).toIndex(to).roll(roll).build());

        if (!res.capturedAt.isEmpty()) {
            List<Map<String, Object>> caps = new ArrayList<>();
            for (int i = 0; i < res.capturedAt.size(); i++) {
                int[] cell = res.capturedAt.get(i);
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("owner", res.capturedOwners.get(i));
                m.put("row", cell[0]);
                m.put("col", cell[1]);
                caps.add(m);
            }
            sendToRoom(r.getRoomId(), base(r, ChowkaEvent.Type.PIECE_CAPTURED)
                    .player(player.getUsername()).captures(caps).build());
        }
        if (res.finished) {
            sendToRoom(r.getRoomId(), base(r, ChowkaEvent.Type.PIECE_HOME)
                    .player(player.getUsername()).pieceId(pieceId).build());
        }

        // Win check.
        if (engine.hasWon(player)) {
            finish(r, player.getUsername());
            return;
        }

        boolean extra = grantsExtraTurn(roll) || res.captured || res.finished;
        broadcastState(r);
        if (extra) {
            // Same player rolls again.
            r.setLastRoll(0);
            if (player.isBot()) scheduleBot(r);
        } else {
            advanceTurn(r);
        }
    }

    private void advanceTurn(ChowkaRoom r) {
        if (r.getStatus() != ChowkaRoom.Status.IN_PROGRESS) return;
        if (r.getTurnOrder().isEmpty()) return;
        r.setTurnPointer((r.getTurnPointer() + 1) % r.getTurnOrder().size());
        startTurn(r);
    }

    private void finish(ChowkaRoom r, String winner) {
        r.cancelBotTask();
        r.setWinner(winner);
        r.setAwaitingMove(false);
        r.getLegalPieceIds().clear();
        r.setStatus(ChowkaRoom.Status.FINISHED);

        List<Map<String, Object>> standings = standings(r);
        for (ChowkaPlayer p : r.getPlayers().values()) {
            int homed = (int) p.finishedCount(ChowkaEngine.CENTER_INDEX);
            leaderboardService.record(GAME_KEY, p.getUsername(), p.getUsername().equals(winner), homed);
        }
        sendToRoom(r.getRoomId(), base(r, ChowkaEvent.Type.GAME_OVER)
                .winner(winner).standings(standings).message(winner + " wins!").build());
        broadcastState(r);
        log.info("Chowka game finished: room={} winner={}", r.getRoomId(), winner);
    }

    // ==================== BOTS ====================

    private void scheduleBot(ChowkaRoom r) {
        r.cancelBotTask();
        r.setBotTask(scheduler.schedule(() -> safe(() -> botStep(r)), 950, TimeUnit.MILLISECONDS));
    }

    private void botStep(ChowkaRoom r) {
        if (r.getStatus() != ChowkaRoom.Status.IN_PROGRESS) return;
        ChowkaPlayer cur = r.currentPlayer();
        if (cur == null || !cur.isBot()) return;
        if (!r.isAwaitingMove()) {
            performRoll(r, cur);
        } else {
            int pick = engine.chooseBotMove(r, cur, r.getLastRoll(), r.getLegalPieceIds());
            applyMove(r, cur, pick);
        }
    }

    private void safe(Runnable task) {
        try { task.run(); } catch (Exception e) { log.warn("Chowka bot step failed", e); }
    }

    // ==================== CHAT ====================

    public void chat(String roomId, String username, String message) {
        ChowkaRoom r = getRoom(roomId);
        if (!r.getPlayers().containsKey(username)) throw new IllegalArgumentException("You are not in this room");
        if (message == null) return;
        String msg = message.trim();
        if (msg.isEmpty()) return;
        if (msg.length() > 200) msg = msg.substring(0, 200);
        r.setChatSeq(r.getChatSeq() + 1);
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("id", r.getChatSeq());
        entry.put("sender", username);
        entry.put("message", msg);
        entry.put("ts", System.currentTimeMillis());
        r.getChat().add(entry);
        if (r.getChat().size() > 50) r.getChat().remove(0);
        sendToRoom(roomId, base(r, ChowkaEvent.Type.CHAT_MESSAGE)
                .sender(username).message(msg).build());
    }

    // ==================== DICE ====================

    /**
     * Four-cowrie throw. k shells "open" (0..4): 0->8, otherwise k.
     * k follows Binomial(4, 0.5): mostly 2s, rarely 4 or 8.
     */
    private int rollCowries() {
        int open = 0;
        for (int i = 0; i < 4; i++) if (random.nextBoolean()) open++;
        return open == 0 ? 8 : open;
    }

    private boolean grantsExtraTurn(int roll) {
        return roll == 4 || roll == 8;
    }

    // ==================== GUARDS ====================

    private void requireHost(ChowkaRoom r, String username) {
        if (!Objects.equals(username, r.getHostUsername()))
            throw new IllegalStateException("Only the host can do that");
    }

    private void guardTurn(ChowkaRoom r, String username) {
        if (r.getStatus() != ChowkaRoom.Status.IN_PROGRESS) throw new IllegalStateException("Game is not in progress");
        if (!Objects.equals(username, r.currentPlayerName())) throw new IllegalStateException("Not your turn");
    }

    // ==================== VIEW / STATE ====================

    public Map<String, Object> publicState(ChowkaRoom r) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("roomId", r.getRoomId());
        s.put("status", r.getStatus().name());
        s.put("hostUsername", r.getHostUsername());
        s.put("openStart", r.isOpenStart());
        s.put("maxPlayers", r.getMaxPlayers());
        s.put("minPlayers", r.getMinPlayers());
        s.put("turnOrder", r.getTurnOrder());
        s.put("currentTurn", r.currentPlayerName());
        s.put("lastRoll", r.getLastRoll());
        s.put("awaitingMove", r.isAwaitingMove());
        s.put("legalPieceIds", r.getLegalPieceIds());
        s.put("winner", r.getWinner());
        s.put("centerIndex", ChowkaEngine.CENTER_INDEX);
        s.put("pathLength", ChowkaEngine.PATH_LENGTH);
        s.put("safeCells", toCellList(engine.safeCells()));
        s.put("chat", r.getChat());

        List<Map<String, Object>> players = new ArrayList<>();
        String current = r.currentPlayerName();
        Collection<ChowkaPlayer> seatOrder = new ArrayList<>(r.getPlayers().values());
        for (ChowkaPlayer p : seatOrder) {
            Map<String, Object> pm = new LinkedHashMap<>();
            pm.put("username", p.getUsername());
            pm.put("color", p.getColor());
            pm.put("seat", p.getSeat());
            pm.put("bot", p.isBot());
            pm.put("connected", p.isConnected());
            pm.put("isHost", p.getUsername().equals(r.getHostUsername()));
            pm.put("isCurrent", p.getUsername().equals(current));
            pm.put("finishedCount", p.finishedCount(ChowkaEngine.CENTER_INDEX));
            pm.put("path", toCellList(Arrays.asList(engine.path(p.getSeat()))));

            List<Map<String, Object>> pieces = new ArrayList<>();
            for (Piece pc : p.getPieces()) {
                Map<String, Object> pcm = new LinkedHashMap<>();
                pcm.put("id", pc.getId());
                pcm.put("pathIndex", pc.getPathIndex());
                pcm.put("inBase", pc.inBase());
                pcm.put("finished", pc.getPathIndex() == ChowkaEngine.CENTER_INDEX);
                int[] cell = engine.pieceCell(p, pc);
                if (cell != null) { pcm.put("row", cell[0]); pcm.put("col", cell[1]); }
                pieces.add(pcm);
            }
            pm.put("pieces", pieces);
            players.add(pm);
        }
        s.put("players", players);
        return s;
    }

    private List<List<Integer>> toCellList(List<int[]> cells) {
        List<List<Integer>> out = new ArrayList<>();
        for (int[] c : cells) out.add(List.of(c[0], c[1]));
        return out;
    }

    private List<Map<String, Object>> standings(ChowkaRoom r) {
        List<ChowkaPlayer> ps = new ArrayList<>(r.getPlayers().values());
        ps.sort((a, b) -> Long.compare(
                b.finishedCount(ChowkaEngine.CENTER_INDEX),
                a.finishedCount(ChowkaEngine.CENTER_INDEX)));
        List<Map<String, Object>> out = new ArrayList<>();
        int rank = 1;
        for (ChowkaPlayer p : ps) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("rank", rank++);
            m.put("username", p.getUsername());
            m.put("color", p.getColor());
            m.put("homed", p.finishedCount(ChowkaEngine.CENTER_INDEX));
            out.add(m);
        }
        return out;
    }

    public Map<String, Object> view(String roomId) {
        return publicState(getRoom(roomId));
    }

    // ==================== MESSAGING ====================

    private void broadcastState(ChowkaRoom r) {
        sendToRoom(r.getRoomId(), base(r, ChowkaEvent.Type.STATE).state(publicState(r)).build());
    }

    private ChowkaEvent.ChowkaEventBuilder base(ChowkaRoom r, ChowkaEvent.Type type) {
        return ChowkaEvent.builder()
                .type(type)
                .roomId(r.getRoomId())
                .status(r.getStatus().name())
                .hostUsername(r.getHostUsername());
    }

    private void sendToRoom(String roomId, ChowkaEvent event) {
        messaging.convertAndSend("/topic/chowka/" + roomId, event);
    }

    public void sendError(String username, String message) {
        messaging.convertAndSendToUser(username, "/queue/chowka",
                ChowkaEvent.builder().type(ChowkaEvent.Type.ERROR).message(message).build());
    }
}
