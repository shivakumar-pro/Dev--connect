package com.devconnect.interview.controller;

import com.devconnect.interview.dto.*;
import com.devconnect.interview.service.InterviewRoomService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Controller;

import java.security.Principal;
import java.util.Map;

/**
 * WebSocket (STOMP) controller for the Mock Interview module.
 *
 * Send to (client -> server):
 *   /app/interview/join/{roomId}        — join (payload: {role, accessCode})
 *   /app/interview/leave/{roomId}       — leave
 *   /app/interview/role/{roomId}        — change role (payload: {role})
 *   /app/interview/ready/{roomId}       — toggle ready (payload: {ready})
 *   /app/interview/media                — update media state (MediaStateRequest)
 *   /app/interview/start/{roomId}       — host: start interview
 *   /app/interview/end/{roomId}         — host: end interview
 *   /app/interview/timer                — control timer (TimerControlRequest)
 *   /app/interview/question             — push/clear question (QuestionControlRequest)
 *   /app/interview/code                 — code editor sync (CodeUpdateRequest)
 *   /app/interview/whiteboard           — whiteboard ops (WhiteboardUpdateRequest)
 *   /app/interview/chat                 — chat / private notes (ChatMessageRequest)
 *   /app/interview/evaluate             — interviewer per-question evaluation (EvaluationRequest)
 *   /app/interview/recording/{roomId}   — start/stop recording (payload: {started, url})
 *
 * Subscribe (server -> client):
 *   /topic/interview/{roomId}    — broadcast room events
 *   /user/queue/interview        — private events (full state on join, errors, private notes)
 */
@Slf4j
@Controller
@RequiredArgsConstructor
public class InterviewWebSocketController {

    private final InterviewRoomService interviewService;

    @MessageMapping("/interview/join/{roomId}")
    public void join(@DestinationVariable String roomId,
                     @Payload(required = false) Map<String, String> payload,
                     Principal principal) {
        String role = payload == null ? null : payload.get("role");
        String code = payload == null ? null : payload.get("accessCode");
        interviewService.joinRoom(roomId, getUsername(principal), role, code);
    }

    @MessageMapping("/interview/leave/{roomId}")
    public void leave(@DestinationVariable String roomId, Principal principal) {
        interviewService.leaveRoom(roomId, getUsername(principal));
    }

    @MessageMapping("/interview/role/{roomId}")
    public void changeRole(@DestinationVariable String roomId,
                           @Payload Map<String, String> payload,
                           Principal principal) {
        interviewService.changeRole(roomId, getUsername(principal), payload.get("role"));
    }

    @MessageMapping("/interview/ready/{roomId}")
    public void ready(@DestinationVariable String roomId,
                      @Payload Map<String, Object> payload,
                      Principal principal) {
        boolean ready = Boolean.TRUE.equals(payload.get("ready"));
        interviewService.setReady(roomId, getUsername(principal), ready);
    }

    @MessageMapping("/interview/media")
    public void media(@Payload MediaStateRequest req, Principal principal) {
        interviewService.updateMediaState(getUsername(principal), req);
    }

    @MessageMapping("/interview/start/{roomId}")
    public void start(@DestinationVariable String roomId, Principal principal) {
        interviewService.startInterview(roomId, getUsername(principal));
    }

    @MessageMapping("/interview/end/{roomId}")
    public void end(@DestinationVariable String roomId, Principal principal) {
        interviewService.endInterview(roomId, getUsername(principal));
    }

    @MessageMapping("/interview/timer")
    public void timer(@Payload TimerControlRequest req, Principal principal) {
        interviewService.controlTimer(getUsername(principal), req);
    }

    @MessageMapping("/interview/question")
    public void question(@Payload QuestionControlRequest req, Principal principal) {
        interviewService.controlQuestion(getUsername(principal), req);
    }

    @MessageMapping("/interview/code")
    public void code(@Payload CodeUpdateRequest req, Principal principal) {
        interviewService.updateCode(getUsername(principal), req);
    }

    @MessageMapping("/interview/whiteboard")
    public void whiteboard(@Payload WhiteboardUpdateRequest req, Principal principal) {
        interviewService.updateWhiteboard(getUsername(principal), req);
    }

    @MessageMapping("/interview/chat")
    public void chat(@Payload ChatMessageRequest req, Principal principal) {
        interviewService.sendChat(getUsername(principal), req);
    }

    @MessageMapping("/interview/evaluate")
    public void evaluate(@Payload EvaluationRequest req, Principal principal) {
        interviewService.submitEvaluation(getUsername(principal), req);
    }

    @MessageMapping("/interview/recording/{roomId}")
    public void recording(@DestinationVariable String roomId,
                          @Payload Map<String, Object> payload,
                          Principal principal) {
        boolean started = Boolean.TRUE.equals(payload.get("started"));
        String url = (String) payload.get("url");
        if (payload.containsKey("publishedUrl")) {
            interviewService.publishRecordingUrl(getUsername(principal), roomId, (String) payload.get("publishedUrl"));
        } else {
            interviewService.setRecordingState(getUsername(principal), roomId, started, url);
        }
    }

    private String getUsername(Principal principal) {
        if (principal instanceof UsernamePasswordAuthenticationToken auth) {
            return (String) auth.getPrincipal();
        }
        throw new IllegalStateException("Invalid user principal");
    }
}
