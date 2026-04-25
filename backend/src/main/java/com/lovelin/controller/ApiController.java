package com.lovelin.controller;

import com.lovelin.exception.ApiException;
import com.lovelin.security.AuthInterceptor;
import com.lovelin.security.AuthSession;
import com.lovelin.service.AlbumService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

@RestController
public class ApiController {

    private final AlbumService albumService;

    public ApiController(AlbumService albumService) {
        this.albumService = albumService;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of("ok", true, "time", albumService.now());
    }

    @GetMapping("/api/health")
    public Map<String, Object> apiHealth() {
        return Map.of("ok", true, "time", albumService.now());
    }

    @PostMapping("/api/auth/wechat-login")
    public Map<String, Object> wechatLogin(@RequestBody Map<String, Object> body) {
        String code = asString(body.get("code"));
        String nickName = asString(body.get("nickName"));
        String avatarUrl = asString(body.get("avatarUrl"));
        return albumService.wechatLogin(code, nickName, avatarUrl);
    }

    @PostMapping("/api/auth/logout")
    public Map<String, Object> logout(HttpServletRequest request) {
        AuthSession auth = requireAuth(request);
        albumService.logout(auth.getToken());
        return Map.of("ok", true);
    }

    @GetMapping("/api/pair/status")
    public Map<String, Object> pairStatus(HttpServletRequest request) {
        AuthSession auth = requireAuth(request);
        Map<String, Object> pairStatus = albumService.getPairStatusByAlbum(auth.getAlbumId(), auth.getUserId());
        Map<String, Object> self = albumService.getSelf(auth.getUserId(), auth.getNickname(), auth.getAvatarUrl());
        Map<String, Object> out = new HashMap<>();
        out.put("albumId", auth.getAlbumId());
        out.put("paired", pairStatus.get("paired"));
        out.put("self", self);
        out.put("partner", pairStatus.get("partner"));
        return out;
    }

    @PostMapping("/api/pair/invite")
    public Map<String, Object> pairInvite(HttpServletRequest request) {
        AuthSession auth = requireAuth(request);
        return albumService.createInvite(auth.getAlbumId(), auth.getUserId());
    }

    @PostMapping("/api/pair/accept")
    public Map<String, Object> pairAccept(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        AuthSession auth = requireAuth(request);
        String code = asString(body.get("code")).trim().toUpperCase();
        return albumService.acceptInvite(auth.getUserId(), auth.getNickname(), code);
    }

    @PostMapping("/api/pair/unbind")
    public Map<String, Object> pairUnbind(HttpServletRequest request) {
        AuthSession auth = requireAuth(request);
        return albumService.unbind(auth.getUserId(), auth.getNickname());
    }

    @GetMapping("/api/photos/stats")
    public Object photoStats(HttpServletRequest request) {
        AuthSession auth = requireAuth(request);
        return albumService.photoStats(auth.getAlbumId());
    }

    @GetMapping("/api/photos")
    public Map<String, Object> listPhotos(@RequestParam String province,
                                          @RequestParam(required = false) Integer page,
                                          @RequestParam(required = false) Integer pageSize,
                                          HttpServletRequest request) {
        AuthSession auth = requireAuth(request);
        int pageNum = page == null ? 1 : Math.max(1, page);
        int normalizedSize = albumService.normalizePageSize(pageSize);
        return albumService.listPhotos(auth.getAlbumId(), province.trim(), pageNum, normalizedSize);
    }

    @GetMapping("/api/folders")
    public Object listFolders(@RequestParam String province, HttpServletRequest request) {
        AuthSession auth = requireAuth(request);
        return albumService.listFolders(auth.getAlbumId(), province.trim());
    }

    @PostMapping("/api/folders")
    public Map<String, Object> createFolder(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        AuthSession auth = requireAuth(request);
        String province = asString(body.get("province")).trim();
        String name = asString(body.get("name")).trim();
        return albumService.createFolder(auth.getUserId(), auth.getAlbumId(), province, name);
    }

    @DeleteMapping("/api/folders/{id}")
    public Map<String, Object> deleteFolder(@PathVariable("id") long id,
                                            @RequestBody(required = false) Map<String, Object> body,
                                            HttpServletRequest request) {
        AuthSession auth = requireAuth(request);
        if (id <= 0) {
            throw new ApiException(400, "无效文件夹ID");
        }
        boolean keepPhotos = true;
        if (body != null && body.containsKey("keepPhotos")) {
            Object raw = body.get("keepPhotos");
            if (raw instanceof Boolean b) {
                keepPhotos = b;
            }
        }
        return albumService.deleteFolder(auth.getAlbumId(), id, keepPhotos);
    }

    @GetMapping("/api/photos/file/{id}")
    public ResponseEntity<Resource> photoFile(@PathVariable("id") long id, HttpServletRequest request) {
        AuthSession auth = requireAuth(request);
        if (id <= 0) {
            throw new ApiException(400, "无效照片ID");
        }
        Path path = albumService.resolvePhotoFilePath(id, auth.getAlbumId());
        Resource resource = new FileSystemResource(path);
        String mime = albumService.getMimeTypeByExt(path);
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "private, max-age=60")
                .contentType(MediaType.parseMediaType(mime))
                .body(resource);
    }

    @PostMapping(value = "/api/photos/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> uploadMultipart(@RequestParam("province") String province,
                                               @RequestParam(value = "folderId", required = false) String folderId,
                                               @RequestPart(value = "file", required = false) MultipartFile file,
                                               HttpServletRequest request) throws IOException {
        AuthSession auth = requireAuth(request);
        return albumService.uploadPhotoFromMultipart(auth.getUserId(), auth.getAlbumId(), province.trim(), folderId, file);
    }

    @PostMapping(value = "/api/photos/upload", consumes = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> uploadBase64(@RequestBody Map<String, Object> body, HttpServletRequest request) throws IOException {
        AuthSession auth = requireAuth(request);
        String province = asString(body.get("province")).trim();
        String folderId = asString(body.get("folderId"));
        String fileBase64 = asString(body.get("fileBase64")).trim();
        String fileName = asString(body.get("fileName")).trim();
        return albumService.uploadPhotoFromBase64(auth.getUserId(), auth.getAlbumId(), province, folderId, fileBase64, fileName);
    }

    @PatchMapping("/api/photos/{id}/folder")
    public Map<String, Object> updatePhotoFolder(@PathVariable("id") long id,
                                                 @RequestBody(required = false) Map<String, Object> body,
                                                 HttpServletRequest request) {
        AuthSession auth = requireAuth(request);
        if (id <= 0) {
            throw new ApiException(400, "无效照片ID");
        }
        String folderId = body == null ? null : asString(body.get("folderId"));
        return albumService.updatePhotoFolder(id, auth.getAlbumId(), folderId);
    }

    @DeleteMapping("/api/photos/{id}")
    public Map<String, Object> deletePhoto(@PathVariable("id") long id, HttpServletRequest request) {
        AuthSession auth = requireAuth(request);
        if (id <= 0) {
            throw new ApiException(400, "无效照片ID");
        }
        return albumService.deletePhoto(id, auth.getAlbumId());
    }

    private AuthSession requireAuth(HttpServletRequest request) {
        Object value = request.getAttribute(AuthInterceptor.AUTH_ATTR);
        if (value instanceof AuthSession authSession) {
            return authSession;
        }
        throw new ApiException(401, "未登录");
    }

    private String asString(Object value) {
        if (value == null) {
            return "";
        }
        if (value instanceof String s) {
            return s;
        }
        if (value instanceof Number || value instanceof Boolean) {
            return String.valueOf(value);
        }
        return StringUtils.hasText(value.toString()) ? value.toString() : "";
    }
}
