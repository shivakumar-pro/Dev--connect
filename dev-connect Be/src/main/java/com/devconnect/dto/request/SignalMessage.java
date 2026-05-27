package com.devconnect.dto.request;

import lombok.Data;

@Data
public class SignalMessage {
    private String type;       // offer, answer, ice-candidate, call-request, call-accepted, call-rejected, call-ended
    private String sender;     // sender username
    private String receiver;   // receiver username
    private Object data;       // SDP offer/answer or ICE candidate
    private String callType;   // audio, video
}
