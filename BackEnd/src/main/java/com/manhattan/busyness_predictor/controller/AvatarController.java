package com.manhattan.busyness_predictor.controller;

import java.io.File;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/avatars")
public class AvatarController {

    @Value("${app.avatars.dir}")
    private String avatarsDir;

    // Serve avatar files
    @GetMapping("/{filename:.+}")
    public ResponseEntity<Resource> serveAvatar(@PathVariable String filename) {
        try {
            File avatarFile = new File(avatarsDir, filename);
            if (!avatarFile.exists()) {
                return ResponseEntity.notFound().build();
            }

            Resource resource = new UrlResource(avatarFile.toURI());
            if (resource.exists() && resource.isReadable()) {
                // Determine content type based on file extension
                String contentType = "image/jpeg"; // default
                if (filename.toLowerCase().endsWith(".png")) {
                    contentType = "image/png";
                } else if (filename.toLowerCase().endsWith(".gif")) {
                    contentType = "image/gif";
                } else if (filename.toLowerCase().endsWith(".webp")) {
                    contentType = "image/webp";
                }

                return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType(contentType))
                    .body(resource);
            } else {
                return ResponseEntity.notFound().build();
            }
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }
} 