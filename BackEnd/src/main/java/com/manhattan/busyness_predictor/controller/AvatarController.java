package com.manhattan.busyness_predictor.controller;

import java.io.File;
import java.io.IOException;

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
            if (filename.contains("..") || filename.contains("/") || filename.contains("\\")) {
                return ResponseEntity.badRequest().build();
            }
            File baseDir = new File(avatarsDir).getCanonicalFile();
            File avatarFile = new File(baseDir, filename).getCanonicalFile();
            if (!avatarFile.getPath().startsWith(baseDir.getPath() + File.separator)
                    && !avatarFile.getPath().equals(baseDir.getPath())) {
                return ResponseEntity.notFound().build();
            }
            if (!avatarFile.exists() || !avatarFile.isFile()) {
                return ResponseEntity.notFound().build();
            }

            Resource resource = new UrlResource(avatarFile.toURI());
            if (resource.exists() && resource.isReadable()) {
                String lowerFilename = filename.toLowerCase();
                String contentType;
                if (lowerFilename.endsWith(".jpg") || lowerFilename.endsWith(".jpeg")) {
                    contentType = "image/jpeg";
                } else if (lowerFilename.endsWith(".png")) {
                    contentType = "image/png";
                } else {
                    return ResponseEntity.notFound().build();
                }

                return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType(contentType))
                    .body(resource);
            } else {
                return ResponseEntity.notFound().build();
            }
        } catch (IOException e) {
            return ResponseEntity.notFound().build();
        }
    }
} 
