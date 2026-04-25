package com.lovelin.security;

import com.lovelin.exception.ApiException;
import com.lovelin.service.AlbumService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class AuthInterceptor implements HandlerInterceptor {

    public static final String AUTH_ATTR = "AUTH_SESSION";
    private final AlbumService albumService;

    public AuthInterceptor(AlbumService albumService) {
        this.albumService = albumService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String token = readBearerToken(request);
        if (!StringUtils.hasText(token)) {
            throw new ApiException(401, "未登录");
        }
        AuthSession session = albumService.getSessionByToken(token);
        if (session == null) {
            throw new ApiException(401, "登录已过期，请重新登录");
        }
        if (session.getAlbumId() == null) {
            long albumId = albumService.ensureUserAlbumMembership(session.getUserId(), session.getNickname());
            session.setAlbumId(albumId);
        }
        request.setAttribute(AUTH_ATTR, session);
        return true;
    }

    private String readBearerToken(HttpServletRequest request) {
        String auth = request.getHeader("Authorization");
        if (auth == null || !auth.startsWith("Bearer ")) {
            return "";
        }
        return auth.substring(7).trim();
    }
}
