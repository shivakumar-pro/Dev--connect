package com.devconnect.interview.controller;

import com.devconnect.dto.response.ApiResponse;
import com.devconnect.interview.dto.CreateInterviewRoomRequest;
import com.devconnect.interview.dto.FeedbackRequest;
import com.devconnect.interview.model.*;
import com.devconnect.interview.service.InterviewRoomService;
import com.devconnect.interview.service.QuestionBankService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Mock Interview REST endpoints.
 *
 * PUBLIC:
 *   GET  /api/interview/types               — list interview types
 *   GET  /api/interview/levels              — list seniority levels
 *   GET  /api/interview/rooms               — list active public rooms (lobby)
 *   GET  /api/interview/questions           — browse question bank (filter by type/level/tag)
 *   GET  /api/interview/questions/{id}      — get one question (description, examples)
 *   GET  /api/interview/questions/random    — random question (filter by type/level)
 *
 * AUTHENTICATED:
 *   POST /api/interview/rooms               — create a room
 *   GET  /api/interview/rooms/{roomId}      — get room state snapshot
 *   GET  /api/interview/history             — list past interviews for current user
 *   GET  /api/interview/feedback            — list feedback received by current user
 *   POST /api/interview/feedback            — submit feedback after interview
 *
 * All gameplay (code sync, whiteboard, chat, timer, evaluation, etc.)
 * happens over WebSocket. See InterviewWebSocketController for the full flow.
 */
@Slf4j
@RestController
@RequestMapping("/api/interview")
@RequiredArgsConstructor
public class InterviewController {

    private final InterviewRoomService interviewService;
    private final QuestionBankService questionBank;

    @GetMapping("/types")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listTypes() {
        List<Map<String, Object>> out = Arrays.stream(InterviewType.values())
                .map(t -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("type", t.name());
                    m.put("name", t.name().replace("_", " "));
                    return m;
                })
                .collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success("Interview types", out));
    }

    @GetMapping("/levels")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listLevels() {
        List<Map<String, Object>> out = Arrays.stream(InterviewLevel.values())
                .map(l -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("level", l.name());
                    m.put("name", l.name());
                    return m;
                })
                .collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success("Interview levels", out));
    }

    @GetMapping("/rooms")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listRooms() {
        return ResponseEntity.ok(ApiResponse.success("Open rooms", interviewService.listOpenRooms()));
    }

    @PostMapping("/rooms")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createRoom(
            @AuthenticationPrincipal String username,
            @RequestBody CreateInterviewRoomRequest req) {
        if (username == null) return ResponseEntity.status(401).body(ApiResponse.error("Login required"));
        InterviewRoom room = interviewService.createRoom(username, req);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("roomId", room.getRoomId());
        data.put("title", room.getTitle());
        data.put("type", room.getType().name());
        data.put("level", room.getLevel().name());
        data.put("hostUsername", room.getHostUsername());
        data.put("isPublic", room.isPublic());
        data.put("hasAccessCode", room.getAccessCode() != null && !room.getAccessCode().isBlank());
        data.put("durationMinutes", room.getDurationMinutes());
        data.put("maxParticipants", room.getMaxParticipants());
        data.put("recordingEnabled", room.isRecordingEnabled());
        data.put("status", room.getStatus().name());
        return ResponseEntity.ok(ApiResponse.success("Room created", data));
    }

    @GetMapping("/rooms/{roomId}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getRoom(@PathVariable String roomId) {
        InterviewRoom room = interviewService.getRoom(roomId);
        if (room == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(ApiResponse.success("Room state", interviewService.roomStateSnapshot(room)));
    }

    @GetMapping("/history")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> history(
            @AuthenticationPrincipal String username) {
        if (username == null) return ResponseEntity.status(401).body(ApiResponse.error("Login required"));
        return ResponseEntity.ok(ApiResponse.success("History", interviewService.listHistoryFor(username)));
    }

    @GetMapping("/feedback")
    public ResponseEntity<ApiResponse<List<Feedback>>> myFeedback(
            @AuthenticationPrincipal String username) {
        if (username == null) return ResponseEntity.status(401).body(ApiResponse.error("Login required"));
        return ResponseEntity.ok(ApiResponse.success("Feedback", interviewService.listFeedbackFor(username)));
    }

    @PostMapping("/feedback")
    public ResponseEntity<ApiResponse<Feedback>> submitFeedback(
            @AuthenticationPrincipal String username,
            @RequestBody FeedbackRequest req) {
        if (username == null) return ResponseEntity.status(401).body(ApiResponse.error("Login required"));
        try {
            Feedback fb = interviewService.submitFeedback(username, req);
            return ResponseEntity.ok(ApiResponse.success("Feedback submitted", fb));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(ApiResponse.error(e.getMessage()));
        }
    }

    // ==================== QUESTION BANK ====================

    @GetMapping("/questions")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listQuestions(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String level,
            @RequestParam(required = false) String tag) {
        InterviewType t = parse(InterviewType.class, type);
        InterviewLevel l = parse(InterviewLevel.class, level);
        List<Map<String, Object>> out = questionBank.list(t, l, tag).stream()
                .map(this::toQuestionCard)
                .collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success("Questions", out));
    }

    @GetMapping("/questions/random")
    public ResponseEntity<ApiResponse<Map<String, Object>>> randomQuestion(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String level) {
        Question q = questionBank.random(parse(InterviewType.class, type), parse(InterviewLevel.class, level));
        if (q == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(ApiResponse.success("Random question", toQuestionDetail(q)));
    }

    @GetMapping("/questions/{id}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getQuestion(@PathVariable String id) {
        Question q = questionBank.get(id);
        if (q == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(ApiResponse.success("Question", toQuestionDetail(q)));
    }

    private Map<String, Object> toQuestionCard(Question q) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", q.getId());
        m.put("type", q.getType().name());
        m.put("level", q.getLevel().name());
        m.put("title", q.getTitle());
        m.put("tags", q.getTags());
        m.put("recommendedTimeMinutes", q.getRecommendedTimeMinutes());
        return m;
    }

    private Map<String, Object> toQuestionDetail(Question q) {
        Map<String, Object> m = toQuestionCard(q);
        m.put("description", q.getDescription());
        m.put("examples", q.getExamples());
        m.put("hintCount", q.getHints() == null ? 0 : q.getHints().size());
        m.put("starterCode", q.getStarterCode());
        m.put("language", q.getLanguage());
        return m;
    }

    private <E extends Enum<E>> E parse(Class<E> cls, String v) {
        if (v == null || v.isBlank()) return null;
        try { return Enum.valueOf(cls, v.trim().toUpperCase()); }
        catch (Exception e) { return null; }
    }
}
