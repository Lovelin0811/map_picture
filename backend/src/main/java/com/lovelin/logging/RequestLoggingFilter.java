package com.lovelin.logging;

import com.lovelin.security.AuthInterceptor;
import com.lovelin.security.AuthSession;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

@Component
public class RequestLoggingFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RequestLoggingFilter.class);

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        long start = System.currentTimeMillis();
        String requestId = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        MDC.put("requestId", requestId);
        response.setHeader("X-Request-Id", requestId);
        try {
            filterChain.doFilter(request, response);
        } finally {
            long durationMs = System.currentTimeMillis() - start;
            int status = response.getStatus();
            String method = request.getMethod();
            String path = request.getRequestURI();
            String query = request.getQueryString();
            String uri = query == null ? path : path + "?" + query;
            String ip = request.getRemoteAddr();
            Object authObj = request.getAttribute(AuthInterceptor.AUTH_ATTR);
            String userId = "";
            if (authObj instanceof AuthSession authSession) {
                userId = String.valueOf(authSession.getUserId());
            }
            String message = String.format(
                    "request completed method=%s path=%s status=%d durationMs=%d userId=%s ip=%s",
                    method, uri, status, durationMs, userId, ip
            );
            if (status >= 500) {
                log.error(message);
            } else if (status >= 400) {
                log.warn(message);
            } else {
                log.info(message);
            }
            MDC.remove("requestId");
        }
    }
}
