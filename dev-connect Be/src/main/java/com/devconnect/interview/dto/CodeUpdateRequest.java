package com.devconnect.interview.dto;

import lombok.Data;

@Data
public class CodeUpdateRequest {
    private String roomId;
    private String code;
    private String language;
    // Optional incremental patch — clients can send full code OR a diff payload.
    private Object patch;
    private Integer cursorLine;
    private Integer cursorColumn;
}
