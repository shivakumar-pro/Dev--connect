package com.devconnect.service;

import com.devconnect.dto.response.UserResponse;
import com.devconnect.exception.ResourceNotFoundException;
import com.devconnect.exception.ValidationException;
import com.devconnect.model.User;
import com.devconnect.model.UserBlock;
import com.devconnect.repository.UserBlockRepository;
import com.devconnect.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

/**
 * Block Service — manages user blocking/unblocking.
 *
 * When user A blocks user B:
 *   - A cannot send messages to B
 *   - B cannot send messages to A (bidirectional restriction)
 *   - Neither can send chat requests to each other
 *   - Block is stored directionally (A blocked B) but restriction is checked both ways
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BlockService {

    private final UserBlockRepository blockRepository;
    private final UserRepository userRepository;

    public void blockUser(String blockerUsername, String blockedUsername) {
        if (blockerUsername.equals(blockedUsername)) {
            throw new ValidationException("You cannot block yourself");
        }

        User blocker = userRepository.findByUsername(blockerUsername)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        User blocked = userRepository.findByUsername(blockedUsername)
                .orElseThrow(() -> new ResourceNotFoundException("User to block not found"));

        if (blockRepository.existsByBlockerUsernameAndBlockedUsername(blockerUsername, blockedUsername)) {
            throw new ValidationException("User is already blocked");
        }

        blockRepository.save(new UserBlock(blocker, blocked));
        log.info("User '{}' blocked '{}'", blockerUsername, blockedUsername);
    }

    @Transactional
    public void unblockUser(String blockerUsername, String blockedUsername) {
        if (!blockRepository.existsByBlockerUsernameAndBlockedUsername(blockerUsername, blockedUsername)) {
            throw new ValidationException("User is not blocked");
        }

        UserBlock block = blockRepository.findByBlockerUsernameAndBlockedUsername(blockerUsername, blockedUsername)
                .orElseThrow(() -> new ResourceNotFoundException("Block not found"));
        blockRepository.delete(block);
        log.info("User '{}' unblocked '{}'", blockerUsername, blockedUsername);
    }

    public List<UserResponse> getBlockedUsers(String blockerUsername) {
        return blockRepository.findByBlockerUsername(blockerUsername).stream()
                .map(block -> UserResponse.builder()
                        .id(block.getBlocked().getId())
                        .username(block.getBlocked().getUsername())
                        .email(block.getBlocked().getEmail())
                        .profileAvatar(block.getBlocked().getProfileAvatar())
                        .status(block.getBlocked().getStatus().name())
                        .build())
                .collect(Collectors.toList());
    }

    public boolean isBlockedBetween(String username1, String username2) {
        return blockRepository.existsBlockBetweenUsernames(username1, username2);
    }

    public boolean hasBlockedMe(String myUsername, String otherUsername) {
        return blockRepository.existsByBlockerUsernameAndBlockedUsername(otherUsername, myUsername);
    }

    public boolean didIBlock(String myUsername, String otherUsername) {
        return blockRepository.existsByBlockerUsernameAndBlockedUsername(myUsername, otherUsername);
    }
}
