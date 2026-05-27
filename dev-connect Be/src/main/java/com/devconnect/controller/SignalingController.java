package com.devconnect.controller;

import com.devconnect.dto.request.SignalMessage;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Controller;

import java.security.Principal;

@Controller
@RequiredArgsConstructor
public class SignalingController {

    private final SimpMessagingTemplate messagingTemplate;

    @MessageMapping("/signal")
    public void handleSignal(@Payload SignalMessage message, Principal principal) {
        String senderUsername = getUsername(principal);
        message.setSender(senderUsername);

        // Send signal to the specific receiver's personal topic
        messagingTemplate.convertAndSend(
                "/topic/signal/" + message.getReceiver(),
                message
        );
    }

    private String getUsername(Principal principal) {
        if (principal instanceof UsernamePasswordAuthenticationToken auth) {
            return (String) auth.getPrincipal();
        }
        throw new IllegalStateException("Invalid user principal");
    }
}
