package com.devconnect.interview.dto;

import lombok.Data;

@Data
public class JoinInterviewRoomRequest {
    private String roomId;
    private String role;          // INTERVIEWER, CANDIDATE, OBSERVER
    private String accessCode;    // required for private rooms
}
