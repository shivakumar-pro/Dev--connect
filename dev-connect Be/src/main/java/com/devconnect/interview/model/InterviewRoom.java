package com.devconnect.interview.model;

import lombok.Data;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledFuture;

@Data
public class InterviewRoom {

    public enum Status {
        WAITING,        // host created, waiting for candidate(s)
        IN_PROGRESS,    // interview running
        PAUSED,         // timer paused
        ENDED           // finished, feedback open
    }

    private String roomId;
    private String title;
    private InterviewType type;
    private InterviewLevel level;
    private String hostUsername;          // creator (default: INTERVIEWER)
    private boolean isPublic;             // listed in lobby
    private String accessCode;            // optional join code for private rooms

    private Map<String, InterviewParticipant> participants = new LinkedHashMap<>();
    private int maxParticipants = 5;      // 1 interviewer + 1 candidate + observers
    private int minParticipants = 2;

    private Status status = Status.WAITING;
    private int durationMinutes = 60;     // total interview duration
    private int remainingSeconds;         // counts down while running

    // Code editor
    private CodeSnapshot code = new CodeSnapshot("", "javascript", null, Instant.now());

    // Whiteboard - list of strokes/shapes (free-form for clients)
    private List<Map<String, Object>> whiteboardOps = new ArrayList<>();

    // Question lifecycle
    private Question currentQuestion;
    private List<Question> askedQuestions = new ArrayList<>();

    // Hints revealed for current question
    private List<String> revealedHints = new ArrayList<>();

    // Private notes by interviewer (per question)
    private Map<String, List<String>> interviewerNotes = new ConcurrentHashMap<>();

    // Public chat log
    private List<Map<String, Object>> chatLog = new ArrayList<>();

    // Feedback after end
    private List<Feedback> feedbacks = new ArrayList<>();

    // Recording metadata (client-side recorder uploads URL)
    private String recordingUrl;
    private boolean recordingEnabled;

    // Timer
    private transient ScheduledFuture<?> timerFuture;
    private Instant startedAt;
    private Instant endedAt;

    public InterviewRoom(String roomId, InterviewType type, InterviewLevel level, String hostUsername) {
        this.roomId = roomId;
        this.type = type;
        this.level = level;
        this.hostUsername = hostUsername;
        this.title = (type != null ? type.name().replace("_", " ") : "INTERVIEW") +
                " (" + (level != null ? level.name() : "ANY") + ")";
        this.remainingSeconds = durationMinutes * 60;
    }

    public boolean isFull() {
        return participants.size() >= maxParticipants;
    }

    public InterviewParticipant getParticipant(String username) {
        return participants.get(username);
    }

    public void addParticipant(String username, ParticipantRole role) {
        participants.put(username, new InterviewParticipant(username, role));
    }

    public void removeParticipant(String username) {
        participants.remove(username);
    }

    public List<String> getParticipantUsernames() {
        return new ArrayList<>(participants.keySet());
    }

    public boolean hasRole(String username, ParticipantRole role) {
        InterviewParticipant p = participants.get(username);
        return p != null && p.getRole() == role;
    }

    public boolean isHost(String username) {
        return hostUsername != null && hostUsername.equals(username);
    }

    public void cancelTimer() {
        if (timerFuture != null && !timerFuture.isDone()) {
            timerFuture.cancel(false);
            timerFuture = null;
        }
    }

    public void appendNote(String questionId, String note) {
        interviewerNotes.computeIfAbsent(questionId == null ? "general" : questionId, k -> new ArrayList<>()).add(note);
    }

    public void logChat(Map<String, Object> entry) {
        chatLog.add(entry);
        if (chatLog.size() > 500) chatLog.remove(0);
    }
}
