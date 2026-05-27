package com.devconnect.interview.service;

import com.devconnect.interview.dto.*;
import com.devconnect.interview.model.*;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.stream.Collectors;

/**
 * Mock Interview Room Service — orchestrates the full interview lifecycle.
 *
 * Topics:
 *   /topic/interview/{roomId}     — broadcast room events
 *   /user/queue/interview         — private events (notes, errors, ack)
 *
 * History:
 *   Finished rooms are kept in `archive` so the History tab can read them.
 */
@Slf4j
@Service
public class InterviewRoomService {

    private final SimpMessagingTemplate messagingTemplate;
    private final QuestionBankService questionBank;

    private final Map<String, InterviewRoom> rooms = new ConcurrentHashMap<>();
    private final Map<String, InterviewRoom> archive = new ConcurrentHashMap<>();
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(4);

    public InterviewRoomService(SimpMessagingTemplate messagingTemplate, QuestionBankService questionBank) {
        this.messagingTemplate = messagingTemplate;
        this.questionBank = questionBank;
    }

    @PreDestroy
    public void shutdown() {
        scheduler.shutdownNow();
    }

    // ==================== ROOM MANAGEMENT ====================

    public InterviewRoom createRoom(String hostUsername, CreateInterviewRoomRequest req) {
        InterviewType type = parseEnum(InterviewType.class, req.getType(), InterviewType.MIXED);
        InterviewLevel level = parseEnum(InterviewLevel.class, req.getLevel(), InterviewLevel.MID);

        String roomId = UUID.randomUUID().toString().substring(0, 8);
        InterviewRoom room = new InterviewRoom(roomId, type, level, hostUsername);
        if (req.getTitle() != null && !req.getTitle().isBlank()) room.setTitle(req.getTitle());
        if (req.getDurationMinutes() != null && req.getDurationMinutes() > 0) {
            room.setDurationMinutes(req.getDurationMinutes());
            room.setRemainingSeconds(req.getDurationMinutes() * 60);
        }
        if (req.getMaxParticipants() != null && req.getMaxParticipants() >= 2) {
            room.setMaxParticipants(req.getMaxParticipants());
        }
        room.setPublic(req.getIsPublic() == null || req.getIsPublic());
        room.setAccessCode(req.getAccessCode());
        room.setRecordingEnabled(req.getRecordingEnabled() != null && req.getRecordingEnabled());

        ParticipantRole hostRole = parseEnum(ParticipantRole.class, req.getRole(), ParticipantRole.INTERVIEWER);
        room.addParticipant(hostUsername, hostRole);

        rooms.put(roomId, room);
        log.info("Interview room created: id={} type={} level={} host={}", roomId, type, level, hostUsername);
        return room;
    }

    public InterviewRoom getRoom(String roomId) {
        InterviewRoom r = rooms.get(roomId);
        return r != null ? r : archive.get(roomId);
    }

    public List<Map<String, Object>> listOpenRooms() {
        return rooms.values().stream()
                .filter(InterviewRoom::isPublic)
                .filter(r -> r.getStatus() == InterviewRoom.Status.WAITING
                        || r.getStatus() == InterviewRoom.Status.IN_PROGRESS)
                .map(this::toLobbyView)
                .collect(Collectors.toList());
    }

    public List<Map<String, Object>> listHistoryFor(String username) {
        return archive.values().stream()
                .filter(r -> r.getParticipants().containsKey(username)
                        || (r.getFeedbacks() != null && r.getFeedbacks().stream()
                            .anyMatch(f -> username.equals(f.getFromUsername())
                                    || username.equals(f.getToUsername()))))
                .map(this::toLobbyView)
                .collect(Collectors.toList());
    }

    private Map<String, Object> toLobbyView(InterviewRoom r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("roomId", r.getRoomId());
        m.put("title", r.getTitle());
        m.put("type", r.getType().name());
        m.put("level", r.getLevel().name());
        m.put("status", r.getStatus().name());
        m.put("hostUsername", r.getHostUsername());
        m.put("isPublic", r.isPublic());
        m.put("requiresCode", r.getAccessCode() != null && !r.getAccessCode().isBlank());
        m.put("participants", r.getParticipants().size());
        m.put("maxParticipants", r.getMaxParticipants());
        m.put("durationMinutes", r.getDurationMinutes());
        m.put("recordingEnabled", r.isRecordingEnabled());
        return m;
    }

    // ==================== JOIN / LEAVE ====================

    public void joinRoom(String roomId, String username, String roleStr, String accessCode) {
        InterviewRoom room = rooms.get(roomId);
        if (room == null) { sendError(username, "Room not found"); return; }

        if (room.getStatus() == InterviewRoom.Status.ENDED) {
            sendError(username, "Interview has ended");
            return;
        }

        // Reconnect path
        if (room.getParticipants().containsKey(username)) {
            room.getParticipant(username).setConnected(true);
            sendFullState(roomId, username);
            broadcast(room, InterviewEvent.builder()
                    .type(InterviewEvent.Type.PARTICIPANT_JOINED)
                    .actor(username)
                    .message(username + " reconnected")
                    .participants(buildParticipantsView(room)));
            return;
        }

        if (room.isFull()) { sendError(username, "Room is full"); return; }

        if (room.getAccessCode() != null && !room.getAccessCode().isBlank()
                && !room.getAccessCode().equals(accessCode)) {
            sendError(username, "Invalid access code");
            return;
        }

        ParticipantRole role = parseEnum(ParticipantRole.class, roleStr, ParticipantRole.CANDIDATE);
        // Ensure at most one INTERVIEWER and one CANDIDATE — extra users become OBSERVER.
        if (role == ParticipantRole.INTERVIEWER && hasRole(room, ParticipantRole.INTERVIEWER)) {
            role = ParticipantRole.OBSERVER;
        }
        if (role == ParticipantRole.CANDIDATE && hasRole(room, ParticipantRole.CANDIDATE)) {
            role = ParticipantRole.OBSERVER;
        }
        room.addParticipant(username, role);

        sendFullState(roomId, username);
        broadcast(room, InterviewEvent.builder()
                .type(InterviewEvent.Type.PARTICIPANT_JOINED)
                .actor(username)
                .message(username + " joined as " + role.name())
                .participants(buildParticipantsView(room)));
    }

    public void leaveRoom(String roomId, String username) {
        InterviewRoom room = rooms.get(roomId);
        if (room == null) return;

        room.removeParticipant(username);

        // Last person -> close room.
        if (room.getParticipants().isEmpty()) {
            room.cancelTimer();
            if (room.getStatus() != InterviewRoom.Status.ENDED) {
                archive.put(roomId, room);
            }
            rooms.remove(roomId);
            return;
        }

        // Host left -> transfer to next interviewer or earliest joiner.
        if (username.equals(room.getHostUsername())) {
            String next = room.getParticipants().values().stream()
                    .filter(p -> p.getRole() == ParticipantRole.INTERVIEWER)
                    .map(InterviewParticipant::getUsername)
                    .findFirst()
                    .orElse(room.getParticipantUsernames().get(0));
            room.setHostUsername(next);
        }

        broadcast(room, InterviewEvent.builder()
                .type(InterviewEvent.Type.PARTICIPANT_LEFT)
                .actor(username)
                .hostUsername(room.getHostUsername())
                .message(username + " left")
                .participants(buildParticipantsView(room)));
    }

    public void changeRole(String roomId, String username, String roleStr) {
        InterviewRoom room = rooms.get(roomId);
        if (room == null) { sendError(username, "Room not found"); return; }
        InterviewParticipant me = room.getParticipant(username);
        if (me == null) { sendError(username, "Not in this room"); return; }
        if (!room.isHost(username) && me.getRole() != ParticipantRole.INTERVIEWER) {
            sendError(username, "Only host/interviewer can change roles");
            return;
        }
        ParticipantRole role = parseEnum(ParticipantRole.class, roleStr, me.getRole());
        me.setRole(role);
        broadcast(room, InterviewEvent.builder()
                .type(InterviewEvent.Type.ROLE_CHANGED)
                .actor(username)
                .message(username + " is now " + role.name())
                .participants(buildParticipantsView(room)));
    }

    public void setReady(String roomId, String username, boolean ready) {
        InterviewRoom room = rooms.get(roomId);
        if (room == null) { sendError(username, "Room not found"); return; }
        InterviewParticipant p = room.getParticipant(username);
        if (p == null) { sendError(username, "Not in this room"); return; }
        p.setReady(ready);
        broadcast(room, InterviewEvent.builder()
                .type(InterviewEvent.Type.READY_STATE_CHANGED)
                .actor(username)
                .message(username + (ready ? " is ready" : " is not ready"))
                .participants(buildParticipantsView(room)));
    }

    public void updateMediaState(String username, MediaStateRequest req) {
        InterviewRoom room = rooms.get(req.getRoomId());
        if (room == null) { sendError(username, "Room not found"); return; }
        InterviewParticipant p = room.getParticipant(username);
        if (p == null) { sendError(username, "Not in this room"); return; }
        if (req.getVideoOn() != null) p.setVideoOn(req.getVideoOn());
        if (req.getAudioOn() != null) p.setAudioOn(req.getAudioOn());
        if (req.getScreenSharing() != null) p.setScreenSharing(req.getScreenSharing());
        broadcast(room, InterviewEvent.builder()
                .type(InterviewEvent.Type.MEDIA_STATE_CHANGED)
                .actor(username)
                .participants(buildParticipantsView(room)));
    }

    // ==================== INTERVIEW LIFECYCLE ====================

    public void startInterview(String roomId, String username) {
        InterviewRoom room = rooms.get(roomId);
        if (room == null) { sendError(username, "Room not found"); return; }
        if (!room.isHost(username)) { sendError(username, "Only host can start"); return; }
        if (room.getStatus() != InterviewRoom.Status.WAITING) {
            sendError(username, "Already started");
            return;
        }
        if (room.getParticipants().size() < room.getMinParticipants()) {
            sendError(username, "Need at least " + room.getMinParticipants() + " participants");
            return;
        }

        room.setStatus(InterviewRoom.Status.IN_PROGRESS);
        room.setStartedAt(Instant.now());
        room.setRemainingSeconds(room.getDurationMinutes() * 60);
        startTimer(room);

        broadcast(room, InterviewEvent.builder()
                .type(InterviewEvent.Type.INTERVIEW_STARTED)
                .actor(username)
                .message("Interview started")
                .durationMinutes(room.getDurationMinutes())
                .remainingSeconds(room.getRemainingSeconds())
                .status(room.getStatus().name()));
    }

    public void endInterview(String roomId, String username) {
        InterviewRoom room = rooms.get(roomId);
        if (room == null) { sendError(username, "Room not found"); return; }
        if (!room.isHost(username)) { sendError(username, "Only host can end"); return; }

        room.setStatus(InterviewRoom.Status.ENDED);
        room.setEndedAt(Instant.now());
        room.cancelTimer();

        broadcast(room, InterviewEvent.builder()
                .type(InterviewEvent.Type.INTERVIEW_ENDED)
                .actor(username)
                .message("Interview ended — please submit feedback")
                .status(room.getStatus().name()));

        // Move to archive so History tab can find it; keep in active for feedback submission.
        archive.put(roomId, room);
    }

    // ==================== TIMER ====================

    public void controlTimer(String username, TimerControlRequest req) {
        InterviewRoom room = rooms.get(req.getRoomId());
        if (room == null) { sendError(username, "Room not found"); return; }
        if (!room.isHost(username) && !room.hasRole(username, ParticipantRole.INTERVIEWER)) {
            sendError(username, "Only host/interviewer can control timer");
            return;
        }

        switch (req.getAction() == null ? "" : req.getAction().toUpperCase()) {
            case "START" -> {
                if (room.getStatus() == InterviewRoom.Status.PAUSED) room.setStatus(InterviewRoom.Status.IN_PROGRESS);
                startTimer(room);
                broadcast(room, InterviewEvent.builder()
                        .type(InterviewEvent.Type.TIMER_STARTED)
                        .actor(username)
                        .remainingSeconds(room.getRemainingSeconds()));
            }
            case "PAUSE" -> {
                room.cancelTimer();
                room.setStatus(InterviewRoom.Status.PAUSED);
                broadcast(room, InterviewEvent.builder()
                        .type(InterviewEvent.Type.TIMER_PAUSED)
                        .actor(username)
                        .remainingSeconds(room.getRemainingSeconds())
                        .status(room.getStatus().name()));
            }
            case "RESUME" -> {
                room.setStatus(InterviewRoom.Status.IN_PROGRESS);
                startTimer(room);
                broadcast(room, InterviewEvent.builder()
                        .type(InterviewEvent.Type.TIMER_RESUMED)
                        .actor(username)
                        .remainingSeconds(room.getRemainingSeconds())
                        .status(room.getStatus().name()));
            }
            case "RESET" -> {
                room.cancelTimer();
                room.setRemainingSeconds(room.getDurationMinutes() * 60);
                broadcast(room, InterviewEvent.builder()
                        .type(InterviewEvent.Type.TIMER_RESET)
                        .actor(username)
                        .remainingSeconds(room.getRemainingSeconds()));
            }
            case "ADD_TIME" -> {
                int add = req.getSeconds() == null ? 60 : req.getSeconds();
                room.setRemainingSeconds(room.getRemainingSeconds() + add);
                broadcast(room, InterviewEvent.builder()
                        .type(InterviewEvent.Type.TIMER_TICK)
                        .actor(username)
                        .remainingSeconds(room.getRemainingSeconds()));
            }
            case "SET" -> {
                int v = req.getSeconds() == null ? room.getDurationMinutes() * 60 : req.getSeconds();
                room.setRemainingSeconds(Math.max(0, v));
                broadcast(room, InterviewEvent.builder()
                        .type(InterviewEvent.Type.TIMER_TICK)
                        .actor(username)
                        .remainingSeconds(room.getRemainingSeconds()));
            }
            default -> sendError(username, "Unknown timer action: " + req.getAction());
        }
    }

    private void startTimer(InterviewRoom room) {
        room.cancelTimer();
        ScheduledFuture<?> future = scheduler.scheduleAtFixedRate(() -> {
            if (room.getStatus() != InterviewRoom.Status.IN_PROGRESS) return;
            int left = room.getRemainingSeconds() - 1;
            room.setRemainingSeconds(Math.max(0, left));

            // Broadcast every 5s to reduce noise; always send the last 30s and exact 0.
            if (left % 5 == 0 || left <= 30) {
                broadcast(room, InterviewEvent.builder()
                        .type(InterviewEvent.Type.TIMER_TICK)
                        .remainingSeconds(room.getRemainingSeconds()));
            }
            if (left <= 0) {
                room.cancelTimer();
                broadcast(room, InterviewEvent.builder()
                        .type(InterviewEvent.Type.TIMER_EXPIRED)
                        .message("Time's up!")
                        .remainingSeconds(0));
            }
        }, 1, 1, TimeUnit.SECONDS);
        room.setTimerFuture(future);
    }

    // ==================== QUESTION CONTROL ====================

    public void controlQuestion(String username, QuestionControlRequest req) {
        InterviewRoom room = rooms.get(req.getRoomId());
        if (room == null) { sendError(username, "Room not found"); return; }
        if (!room.hasRole(username, ParticipantRole.INTERVIEWER) && !room.isHost(username)) {
            sendError(username, "Only interviewer can control questions");
            return;
        }

        String action = req.getAction() == null ? "" : req.getAction().toUpperCase();
        switch (action) {
            case "PUSH_FROM_BANK" -> {
                Question q = questionBank.get(req.getQuestionId());
                if (q == null) { sendError(username, "Question not found"); return; }
                pushQuestion(room, q, username);
            }
            case "PUSH_CUSTOM" -> {
                Question q = Question.builder()
                        .id(UUID.randomUUID().toString().substring(0, 8))
                        .type(room.getType())
                        .level(room.getLevel())
                        .title(req.getTitle() == null ? "Custom Question" : req.getTitle())
                        .description(req.getDescription() == null ? "" : req.getDescription())
                        .examples(List.of())
                        .hints(List.of())
                        .tags(List.of())
                        .starterCode(req.getStarterCode() == null ? "" : req.getStarterCode())
                        .language(req.getLanguage() == null ? "javascript" : req.getLanguage())
                        .recommendedTimeMinutes(req.getRecommendedTimeMinutes() == null ? 20 : req.getRecommendedTimeMinutes())
                        .build();
                pushQuestion(room, q, username);
            }
            case "REVEAL_HINT" -> {
                Question q = room.getCurrentQuestion();
                if (q == null || q.getHints() == null || q.getHints().isEmpty()) {
                    sendError(username, "No hints available");
                    return;
                }
                int idx = req.getHintIndex() == null ? room.getRevealedHints().size() : req.getHintIndex();
                if (idx < 0 || idx >= q.getHints().size()) {
                    sendError(username, "Hint index out of range");
                    return;
                }
                String hint = q.getHints().get(idx);
                room.getRevealedHints().add(hint);
                broadcast(room, InterviewEvent.builder()
                        .type(InterviewEvent.Type.HINT_REVEALED)
                        .actor(username)
                        .hintIndex(idx)
                        .hint(hint));
            }
            case "CLEAR" -> {
                room.setCurrentQuestion(null);
                room.getRevealedHints().clear();
                broadcast(room, InterviewEvent.builder()
                        .type(InterviewEvent.Type.QUESTION_CLEARED)
                        .actor(username));
            }
            default -> sendError(username, "Unknown question action: " + req.getAction());
        }
    }

    private void pushQuestion(InterviewRoom room, Question q, String actor) {
        room.setCurrentQuestion(q);
        room.getAskedQuestions().add(q);
        room.getRevealedHints().clear();
        // Reset code editor to starter code if provided.
        if (q.getStarterCode() != null) {
            room.setCode(new CodeSnapshot(q.getStarterCode(),
                    q.getLanguage() == null ? "javascript" : q.getLanguage(),
                    actor, Instant.now()));
        }
        broadcast(room, InterviewEvent.builder()
                .type(InterviewEvent.Type.QUESTION_PUSHED)
                .actor(actor)
                .question(toQuestionView(q))
                .code(toCodeView(room.getCode())));
    }

    // ==================== CODE EDITOR ====================

    public void updateCode(String username, CodeUpdateRequest req) {
        InterviewRoom room = rooms.get(req.getRoomId());
        if (room == null) { sendError(username, "Room not found"); return; }
        InterviewParticipant p = room.getParticipant(username);
        if (p == null || p.getRole() == ParticipantRole.OBSERVER) {
            sendError(username, "Observers cannot edit code");
            return;
        }

        room.setCode(new CodeSnapshot(
                req.getCode() == null ? room.getCode().getCode() : req.getCode(),
                req.getLanguage() == null ? room.getCode().getLanguage() : req.getLanguage(),
                username, Instant.now()));

        Map<String, Object> codeView = toCodeView(room.getCode());
        if (req.getCursorLine() != null) codeView.put("cursorLine", req.getCursorLine());
        if (req.getCursorColumn() != null) codeView.put("cursorColumn", req.getCursorColumn());
        if (req.getPatch() != null) codeView.put("patch", req.getPatch());

        broadcast(room, InterviewEvent.builder()
                .type(InterviewEvent.Type.CODE_UPDATED)
                .actor(username)
                .code(codeView));
    }

    // ==================== WHITEBOARD ====================

    public void updateWhiteboard(String username, WhiteboardUpdateRequest req) {
        InterviewRoom room = rooms.get(req.getRoomId());
        if (room == null) { sendError(username, "Room not found"); return; }
        InterviewParticipant p = room.getParticipant(username);
        if (p == null || p.getRole() == ParticipantRole.OBSERVER) {
            sendError(username, "Observers cannot edit whiteboard");
            return;
        }

        String op = req.getOp() == null ? "stroke" : req.getOp();
        if ("clear".equalsIgnoreCase(op)) {
            room.getWhiteboardOps().clear();
            broadcast(room, InterviewEvent.builder()
                    .type(InterviewEvent.Type.WHITEBOARD_CLEARED)
                    .actor(username));
            return;
        }

        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("op", op);
        entry.put("by", username);
        entry.put("at", Instant.now().toString());
        entry.put("data", req.getData() == null ? Map.of() : req.getData());
        room.getWhiteboardOps().add(entry);

        broadcast(room, InterviewEvent.builder()
                .type(InterviewEvent.Type.WHITEBOARD_UPDATED)
                .actor(username)
                .op(op)
                .whiteboard(entry));
    }

    // ==================== CHAT / NOTES ====================

    public void sendChat(String username, ChatMessageRequest req) {
        InterviewRoom room = rooms.get(req.getRoomId());
        if (room == null) { sendError(username, "Room not found"); return; }
        if (!room.getParticipants().containsKey(username)) {
            sendError(username, "Not in this room");
            return;
        }

        boolean isPrivate = Boolean.TRUE.equals(req.getPrivateNote());
        if (isPrivate) {
            // Private interviewer note — only interviewers see it.
            if (!room.hasRole(username, ParticipantRole.INTERVIEWER) && !room.isHost(username)) {
                sendError(username, "Only interviewer can add private notes");
                return;
            }
            room.appendNote(req.getQuestionId(), req.getMessage());
            for (InterviewParticipant p : room.getParticipants().values()) {
                if (p.getRole() == ParticipantRole.INTERVIEWER) {
                    sendToUser(p.getUsername(), InterviewEvent.builder()
                            .type(InterviewEvent.Type.PRIVATE_NOTE_ADDED)
                            .roomId(room.getRoomId())
                            .actor(username)
                            .sender(username)
                            .content(req.getMessage())
                            .questionId(req.getQuestionId())
                            .privateNote(true)
                            .build());
                }
            }
            return;
        }

        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("sender", username);
        entry.put("message", req.getMessage());
        entry.put("at", Instant.now().toString());
        room.logChat(entry);

        broadcast(room, InterviewEvent.builder()
                .type(InterviewEvent.Type.CHAT_MESSAGE)
                .sender(username)
                .actor(username)
                .content(req.getMessage()));
    }

    // ==================== EVALUATION ====================

    public void submitEvaluation(String username, EvaluationRequest req) {
        InterviewRoom room = rooms.get(req.getRoomId());
        if (room == null) { sendError(username, "Room not found"); return; }
        if (!room.hasRole(username, ParticipantRole.INTERVIEWER) && !room.isHost(username)) {
            sendError(username, "Only interviewer can evaluate");
            return;
        }

        Map<String, Object> eval = new LinkedHashMap<>();
        eval.put("questionId", req.getQuestionId());
        eval.put("verdict", req.getVerdict());
        eval.put("score", req.getScore());
        eval.put("comments", req.getComments());
        eval.put("by", username);
        eval.put("at", Instant.now().toString());

        broadcast(room, InterviewEvent.builder()
                .type(InterviewEvent.Type.EVALUATION_SUBMITTED)
                .actor(username)
                .evaluation(eval));
    }

    // ==================== FEEDBACK ====================

    public Feedback submitFeedback(String username, FeedbackRequest req) {
        InterviewRoom room = getRoom(req.getRoomId());
        if (room == null) throw new IllegalArgumentException("Room not found");
        if (!room.getParticipants().containsKey(username)
                && room.getFeedbacks().stream().noneMatch(f -> username.equals(f.getFromUsername()))) {
            // Allow if user was a participant (even after leaving).
            // Strict check skipped — feedback can be submitted post-room-close.
        }
        Feedback fb = Feedback.builder()
                .id(UUID.randomUUID().toString().substring(0, 8))
                .roomId(req.getRoomId())
                .fromUsername(username)
                .toUsername(req.getToUsername())
                .verdict(req.getVerdict())
                .overallRating(req.getOverallRating() == null ? 0 : req.getOverallRating())
                .skillRatings(req.getSkillRatings() == null ? Map.of() : req.getSkillRatings())
                .strengths(req.getStrengths())
                .improvements(req.getImprovements())
                .detailedNotes(req.getDetailedNotes())
                .tags(req.getTags() == null ? List.of() : req.getTags())
                .submittedAt(Instant.now())
                .build();

        room.getFeedbacks().add(fb);

        broadcast(room, InterviewEvent.builder()
                .type(InterviewEvent.Type.FEEDBACK_SUBMITTED)
                .actor(username)
                .feedback(toFeedbackView(fb)));

        return fb;
    }

    public List<Feedback> listFeedbackFor(String username) {
        List<Feedback> out = new ArrayList<>();
        for (InterviewRoom r : rooms.values()) {
            for (Feedback f : r.getFeedbacks()) {
                if (username.equals(f.getToUsername())) out.add(f);
            }
        }
        for (InterviewRoom r : archive.values()) {
            for (Feedback f : r.getFeedbacks()) {
                if (username.equals(f.getToUsername())) out.add(f);
            }
        }
        out.sort((a, b) -> b.getSubmittedAt().compareTo(a.getSubmittedAt()));
        return out;
    }

    // ==================== RECORDING ====================

    public void setRecordingState(String username, String roomId, boolean started, String url) {
        InterviewRoom room = rooms.get(roomId);
        if (room == null) { sendError(username, "Room not found"); return; }
        if (!room.isHost(username) && !room.hasRole(username, ParticipantRole.INTERVIEWER)) {
            sendError(username, "Only host/interviewer can control recording");
            return;
        }
        room.setRecordingEnabled(started);
        if (url != null) room.setRecordingUrl(url);

        broadcast(room, InterviewEvent.builder()
                .type(started ? InterviewEvent.Type.RECORDING_STARTED : InterviewEvent.Type.RECORDING_STOPPED)
                .actor(username)
                .recordingUrl(room.getRecordingUrl()));
    }

    public void publishRecordingUrl(String username, String roomId, String url) {
        InterviewRoom room = getRoom(roomId);
        if (room == null) { sendError(username, "Room not found"); return; }
        room.setRecordingUrl(url);
        broadcast(room, InterviewEvent.builder()
                .type(InterviewEvent.Type.RECORDING_AVAILABLE)
                .actor(username)
                .recordingUrl(url));
    }

    // ==================== STATE SNAPSHOT ====================

    public Map<String, Object> roomStateSnapshot(InterviewRoom room) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("roomId", room.getRoomId());
        s.put("title", room.getTitle());
        s.put("type", room.getType().name());
        s.put("level", room.getLevel().name());
        s.put("status", room.getStatus().name());
        s.put("hostUsername", room.getHostUsername());
        s.put("isPublic", room.isPublic());
        s.put("durationMinutes", room.getDurationMinutes());
        s.put("remainingSeconds", room.getRemainingSeconds());
        s.put("recordingEnabled", room.isRecordingEnabled());
        s.put("recordingUrl", room.getRecordingUrl());
        s.put("participants", buildParticipantsView(room));
        s.put("currentQuestion", room.getCurrentQuestion() == null ? null : toQuestionView(room.getCurrentQuestion()));
        s.put("revealedHints", room.getRevealedHints());
        s.put("askedQuestions", room.getAskedQuestions().stream().map(this::toQuestionView).collect(Collectors.toList()));
        s.put("code", toCodeView(room.getCode()));
        s.put("whiteboardOps", room.getWhiteboardOps());
        s.put("chatLog", room.getChatLog());
        s.put("feedbacks", room.getFeedbacks().stream().map(this::toFeedbackView).collect(Collectors.toList()));
        return s;
    }

    private void sendFullState(String roomId, String username) {
        InterviewRoom room = rooms.get(roomId);
        if (room == null) return;
        sendToUser(username, InterviewEvent.builder()
                .type(InterviewEvent.Type.ROOM_STATE)
                .roomId(roomId)
                .data(roomStateSnapshot(room))
                .build());
    }

    // ==================== HELPERS ====================

    private boolean hasRole(InterviewRoom room, ParticipantRole role) {
        return room.getParticipants().values().stream().anyMatch(p -> p.getRole() == role);
    }

    private List<Map<String, Object>> buildParticipantsView(InterviewRoom room) {
        return room.getParticipants().values().stream().map(p -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("username", p.getUsername());
            m.put("role", p.getRole().name());
            m.put("connected", p.isConnected());
            m.put("ready", p.isReady());
            m.put("videoOn", p.isVideoOn());
            m.put("audioOn", p.isAudioOn());
            m.put("screenSharing", p.isScreenSharing());
            return m;
        }).collect(Collectors.toList());
    }

    private Map<String, Object> toQuestionView(Question q) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", q.getId());
        m.put("type", q.getType() == null ? null : q.getType().name());
        m.put("level", q.getLevel() == null ? null : q.getLevel().name());
        m.put("title", q.getTitle());
        m.put("description", q.getDescription());
        m.put("examples", q.getExamples());
        m.put("hintCount", q.getHints() == null ? 0 : q.getHints().size());
        m.put("tags", q.getTags());
        m.put("starterCode", q.getStarterCode());
        m.put("language", q.getLanguage());
        m.put("recommendedTimeMinutes", q.getRecommendedTimeMinutes());
        return m;
    }

    private Map<String, Object> toCodeView(CodeSnapshot c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("code", c.getCode());
        m.put("language", c.getLanguage());
        m.put("editedBy", c.getEditedBy());
        m.put("updatedAt", c.getUpdatedAt() == null ? null : c.getUpdatedAt().toString());
        return m;
    }

    private Map<String, Object> toFeedbackView(Feedback f) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", f.getId());
        m.put("roomId", f.getRoomId());
        m.put("from", f.getFromUsername());
        m.put("to", f.getToUsername());
        m.put("verdict", f.getVerdict());
        m.put("overallRating", f.getOverallRating());
        m.put("skillRatings", f.getSkillRatings());
        m.put("strengths", f.getStrengths());
        m.put("improvements", f.getImprovements());
        m.put("detailedNotes", f.getDetailedNotes());
        m.put("tags", f.getTags());
        m.put("submittedAt", f.getSubmittedAt() == null ? null : f.getSubmittedAt().toString());
        return m;
    }

    private void broadcast(InterviewRoom room, InterviewEvent.InterviewEventBuilder builder) {
        InterviewEvent event = builder.roomId(room.getRoomId()).build();
        if (event.getStatus() == null) event.setStatus(room.getStatus().name());
        messagingTemplate.convertAndSend("/topic/interview/" + room.getRoomId(), event);
    }

    private void sendToUser(String username, InterviewEvent event) {
        messagingTemplate.convertAndSendToUser(username, "/queue/interview", event);
    }

    private void sendError(String username, String message) {
        sendToUser(username, InterviewEvent.builder()
                .type(InterviewEvent.Type.ERROR)
                .message(message)
                .build());
    }

    private <E extends Enum<E>> E parseEnum(Class<E> cls, String value, E fallback) {
        if (value == null) return fallback;
        try { return Enum.valueOf(cls, value.trim().toUpperCase()); }
        catch (Exception e) { return fallback; }
    }
}
