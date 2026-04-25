package com.lovelin.config;

import com.lovelin.security.AuthInterceptor;
import com.lovelin.service.AlbumService;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final AuthInterceptor authInterceptor;
    private final AlbumService albumService;

    public WebConfig(AuthInterceptor authInterceptor, AlbumService albumService) {
        this.authInterceptor = authInterceptor;
        this.albumService = albumService;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/api/**")
                .excludePathPatterns(
                        "/api/health",
                        "/api/auth/wechat-login"
                );
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        List<String> allowList = albumService.parseCorsAllowList();
        var cors = registry.addMapping("/**").allowedMethods("*").allowedHeaders("*");
        if (!allowList.isEmpty()) {
            cors.allowedOrigins(allowList.toArray(String[]::new));
        }
    }
}
