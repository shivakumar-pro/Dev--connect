package com.devconnect.interview.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class InterviewEvent {

    public enum Type {
        ROOM_CREATED,
        PARTICIPANT_JOINED,
        PARTICIPANT_LEFT,
        ROLE_CHANGED,
        READY_STATE_CHANGED,
        MEDIA_STATE_CHANGED,
        INTERVIEW_STARTED,
        INTERVIEW_PAUSED,
        INTERVIEW_RESUMED,
        INTERVIEW_ENDED,
        QUESTION_PUSHED,
        HINT_REVEALED,
        QUESTION_CLEARED,
        CODE_UPDATED,
        WHITEBOARD_UPDATED,
        WHITEBOARD_CLEARED,
        TIMER_STARTED,
        TIMER_TICK,
        TIMER_PAUSED,
        TIMER_RESUMED,
        TIMER_RESET,
        TIMER_EXPIRED,
        CHAT_MESSAGE,
        PRIVATE_NOTE_ADDED,
        EVALUATION_SUBMITTED,
        FEEDBACK_SUBMITTED,
        RECORDING_STARTED,
        RECORDING_STOPPED,
        RECORDING_AVAILABLE,
        ROOM_STATE,            // full snapshot (sent on join)
        ERROR
    }

    private Type type;
    private String roomId;
    private String message;
    private String actor;          // username triggering this event
    private String status;         // room status

    // Room-level info
    private String title;
    private String interviewType;
    private String interviewLevel;
    private String hostUsername;
    private List<Map<String, Object>> participants;
    private Integer durationMinutes;
    private Integer remainingSeconds;

    // Question
    private Map<String, Object> question;
    private Integer hintIndex;
    private String hint;

    // Code
    private Map<String, Object> code;

    // Whiteboard
    private String op;
    private Map<String, Object> whiteboard;

    // Chat / notes
    private String sender;
    private String content;
    private Boolean privateNote;
    private String questionId;

    // Evaluation / feedback
    private Map<String, Object> evaluation;
    private Map<String, Object> feedback;

    // Recording
    private String recordingUrl;

    // Generic payload (full state, etc.)
    private Map<String, Object> data;
}
