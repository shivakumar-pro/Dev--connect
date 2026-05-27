package com.devconnect.interview.model;

import lombok.Data;

import java.time.Instant;

@Data
public class InterviewParticipant {
    private String username;
    private ParticipantRole role;
    private boolean connected;
    private boolean ready;
    private boolean videoOn;
    private boolean audioOn;
    private boolean screenSharing;
    private Instant joinedAt;

    public InterviewParticipant(String username, ParticipantRole role) {
        this.username = username;
        this.role = role;
        this.connected = true;
        this.ready = false;
        this.videoOn = true;
        this.audioOn = true;
        this.screenSharing = false;
        this.joinedAt = Instant.now();
    }
}
