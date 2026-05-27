package com.devconnect.interview.dto;

import lombok.Data;

@Data
public class MediaStateRequest {
    private String roomId;
    private Boolean videoOn;
    private Boolean audioOn;
    private Boolean screenSharing;
}
